import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../i18n'
import {
  readOnboardingSession,
  saveOnboardingSession,
} from '../lib/identity/onboardingSession'
import { FawtaraStatusPage } from './FawtaraStatusPage'
import { ResumeSignupPage } from './ResumeSignupPage'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const status = (stage: string, extra: Record<string, unknown> = {}) =>
  json(200, {
    stage,
    businessProfileComplete: true,
    businessCategoryComplete: true,
    businessTypeComplete: true,
    businessIdentityComplete: true,
    addressContactComplete: true,
    submitted: stage === 'UNDER_REVIEW' || stage === 'ACTIVATED',
    verificationStatus: 'PENDING_VERIFICATION',
    loginEnabled: stage === 'ACTIVATED',
    ...extra,
  })

function Probe() {
  const location = useLocation()
  return (
    <>
      <p data-testid="location">{location.pathname}</p>
      <pre data-testid="state">{JSON.stringify(location.state)}</pre>
    </>
  )
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/signup/resume" element={<ResumeSignupPage />} />
        <Route path="/fawtara-status" element={<FawtaraStatusPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const requests = () =>
  (fetchMock.mock.calls as Array<[string, RequestInit]>).map(([url, init]) => ({
    url,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  }))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  sessionStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function enterCode(user: ReturnType<typeof userEvent.setup>, digits: string) {
  const boxes = screen.getAllByRole('textbox')
  for (const [index, digit] of [...digits].entries()) await user.type(boxes[index], digit)
}

describe('Continue your registration', () => {
  it('sends a code, takes it, stores the new token and opens the step the server names', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        json(200, {
          onboardingToken: 'so.resumed',
          onboardingTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        status('ADDRESS_CONTACT', {
          addressContactComplete: false,
          accountEmail: 'owner@alnoor.test',
          draft: { businessIdentity: { legalCompanyName: 'Al Noor Bakery LLC' } },
        }),
      )
    renderAt('/signup/resume')
    const user = userEvent.setup({ delay: null })
    await user.type(screen.getByLabelText(new RegExp(i18n.t('signupResume.emailLabel'))), 'owner@alnoor.test')
    await user.click(screen.getByRole('button', { name: i18n.t('signupResume.submit') }))

    // The same words whether or not a registration exists.
    expect(await screen.findByText(/If a registration with owner@alnoor\.test is waiting/)).toBeTruthy()
    await enterCode(user, '123456')
    await user.click(screen.getByRole('button', { name: i18n.t('verifyCode.submit') }))

    expect((await screen.findByTestId('location')).textContent).toBe('/address-contact')
    expect(JSON.parse(screen.getByTestId('state').textContent ?? '{}')).toMatchObject({
      accountEmail: 'owner@alnoor.test',
      identity: { companyName: 'Al Noor Bakery LLC' },
    })
    expect(readOnboardingSession()?.onboardingToken).toBe('so.resumed')
    expect(requests()).toEqual([
      { url: '/api/v1/auth/signup/resume', body: { email: 'owner@alnoor.test' } },
      { url: '/api/v1/auth/signup/resume/verify', body: { email: 'owner@alnoor.test', code: '123456' } },
      { url: '/api/v1/auth/signup/status', body: { onboardingToken: 'so.resumed' } },
    ])
  })

  it('a closed application opens only the waiting screen, marked submitted', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        json(200, {
          onboardingToken: 'so.resumed',
          onboardingTokenExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        status('READY_FOR_SUBMISSION', { verificationStatus: 'REJECTED', closed: true, rejectionReason: 'COMPANY_PROFILE_MISMATCH' }),
      )
    renderAt('/signup/resume')
    const user = userEvent.setup({ delay: null })
    await user.type(screen.getByLabelText(new RegExp(i18n.t('signupResume.emailLabel'))), 'owner@alnoor.test')
    await user.click(screen.getByRole('button', { name: i18n.t('signupResume.submit') }))
    await screen.findByText(/If a registration with owner@alnoor\.test is waiting/)
    await enterCode(user, '123456')
    await user.click(screen.getByRole('button', { name: i18n.t('verifyCode.submit') }))

    expect((await screen.findByTestId('location')).textContent).toBe('/signup-pending')
    expect(readOnboardingSession()?.submitted).toBe(true)
  })

  it('answers a refused code with the generic message and stores nothing', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        json(401, { type: 'https://api.fawtir.om/problems/authentication-failed' }),
      )
    renderAt('/signup/resume')
    const user = userEvent.setup({ delay: null })
    await user.type(screen.getByLabelText(new RegExp(i18n.t('signupResume.emailLabel'))), 'nobody@x.om')
    await user.click(screen.getByRole('button', { name: i18n.t('signupResume.submit') }))
    await screen.findByText(/If a registration with nobody@x\.om is waiting/)
    await enterCode(user, '000000')
    await user.click(screen.getByRole('button', { name: i18n.t('verifyCode.submit') }))

    expect(await screen.findByText(i18n.t('signupResume.invalid'))).toBeTruthy()
    expect(readOnboardingSession()).toBeNull()
  })

  it('checks the email before asking', async () => {
    renderAt('/signup/resume')
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: i18n.t('signupResume.submit') }))
    expect(screen.getByText(i18n.t('validation.required'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('/fawtara-status reads the real stage', () => {
  it('without a session: asks to sign in or continue, never "approved"', () => {
    renderAt('/fawtara-status')
    expect(screen.getByText(i18n.t('fawtaraStatus.signedOut.title'))).toBeTruthy()
    expect(screen.getByRole('button', { name: i18n.t('signupResume.cta') })).toBeTruthy()
    expect(screen.queryByText(i18n.t('fawtaraStatus.steps.approved'))).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['UNDER_REVIEW', 'fawtaraStatus.review.title'],
    ['ACTIVATED', 'fawtaraStatus.registering.title'],
    ['REJECTED', 'fawtaraStatus.rejected.title'],
  ])('%s shows %s', async (stage, titleKey) => {
    saveOnboardingSession({
      onboardingToken: 'so.t',
      onboardingTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })
    fetchMock.mockResolvedValue(status(stage, { submitted: true }))
    renderAt('/fawtara-status')
    expect(await screen.findByText(i18n.t(titleKey))).toBeTruthy()
    if (stage !== 'ACTIVATED') {
      expect(screen.queryByText(i18n.t('fawtaraStatus.steps.approved'))).toBeNull()
    }
  })
})
