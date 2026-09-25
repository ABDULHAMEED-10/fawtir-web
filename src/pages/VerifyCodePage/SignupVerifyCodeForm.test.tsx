import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { readOnboardingSession, saveOnboardingSession } from '../../lib/identity/onboardingSession'
import { VerifyCodePage } from './VerifyCodePage'

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

const signupState = (overrides: Record<string, string> = {}) => ({
  from: 'signup',
  tenantCode: 'TNT-7F3K2Q',
  email: 'hafidh@example.test',
  emailVerificationExpiresAt: minutesFromNow(10),
  resendAvailableAt: minutesFromNow(1),
  ...overrides,
})

const VERIFIED = {
  onboardingToken: 'so.onboarding-token',
  onboardingTokenExpiresAt: minutesFromNow(120),
}

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function Probe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname}</p>
}

function renderVerify(state: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/verify-code', state }]}>
      <Routes>
        <Route path="/verify-code" element={<VerifyCodePage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const digits = () => screen.getAllByRole('textbox')
const submit = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]')!
const resend = () => screen.getByRole('button', { name: i18n.t('verifyCode.resend') })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  sessionStorage.clear()
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Renders the screen with a live signup hand-off and types into the boxes as a user would. */
async function typeCode(code: string) {
  renderVerify(signupState())
  const user = userEvent.setup({ delay: null })
  await user.click(digits()[0])
  await user.keyboard(code)
  return user
}

describe('Signup verify code', () => {
  it('names the email the code went to and never the tenant code', () => {
    renderVerify(signupState())

    expect(
      screen.getByText(
        i18n.t('verifyCode.descriptionEmail', { contact: 'hafidh@example.test', minutes: 10 }),
      ),
    ).toBeTruthy()
    expect(document.body.textContent).not.toContain('TNT-7F3K2Q')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('auto-advances while typing and fills every box from a paste', async () => {
    const user = await typeCode('12')
    expect(
      digits()
        .map((input) => (input as HTMLInputElement).value)
        .slice(0, 2),
    ).toEqual(['1', '2'])
    expect(document.activeElement).toBe(digits()[2])

    await user.click(digits()[0])
    await user.paste('654321')
    expect(digits().map((input) => (input as HTMLInputElement).value)).toEqual([
      '6',
      '5',
      '4',
      '3',
      '2',
      '1',
    ])
  })

  it('asks for all six digits before calling the backend', async () => {
    const user = await typeCode('123')
    await user.click(submit())

    expect(screen.getByText(i18n.t('validation.codeIncomplete'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verifies once, keeps only the onboarding token, and moves to onboarding', async () => {
    fetchMock.mockResolvedValue(json(200, VERIFIED))
    const user = await typeCode('123456')
    await user.click(submit())

    expect(await screen.findByTestId('location')).toBeTruthy()
    expect(screen.getByTestId('location').textContent).toBe('/about-business')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/auth/signup/verify')
    expect(JSON.parse(init.body as string)).toEqual({
      tenantCode: 'TNT-7F3K2Q',
      email: 'hafidh@example.test',
      code: '123456',
    })
    expect(readOnboardingSession()?.onboardingToken).toBe('so.onboarding-token')
    const stored = JSON.stringify({ ...sessionStorage, ...localStorage })
    expect(stored).not.toContain('TNT-7F3K2Q')
    expect(stored).not.toContain('123456')
  })

  it('sends one verification however often it is submitted', async () => {
    let answer: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    await typeCode('123456')

    const form = submit().closest('form') as HTMLFormElement
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(submit().disabled).toBe(true)
    await act(async () => answer(json(200, VERIFIED)))
  })

  it('reports a wrong code while the code is live', async () => {
    fetchMock.mockResolvedValue(
      json(401, { type: 'https://api.fawtir.om/problems/authentication-failed' }),
    )
    const user = await typeCode('000000')
    await user.click(submit())

    expect(await screen.findByText(i18n.t('verifyCode.invalid'))).toBeTruthy()
    expect(readOnboardingSession()).toBeNull()
    expect(submit().disabled).toBe(false)
  })

  it('reports an expired code once the server-given expiry has passed', async () => {
    fetchMock.mockResolvedValue(
      json(401, { type: 'https://api.fawtir.om/problems/authentication-failed' }),
    )
    renderVerify(
      signupState({
        emailVerificationExpiresAt: minutesFromNow(-1),
        resendAvailableAt: minutesFromNow(-9),
      }),
    )
    const user = userEvent.setup({ delay: null })
    await user.click(digits()[0])
    await user.keyboard('123456')
    await user.click(submit())

    expect(await screen.findByText(i18n.t('verifyCode.expired'))).toBeTruthy()
  })

  it.each([
    [
      '429',
      () =>
        json(429, { type: 'https://api.fawtir.om/problems/rate-limited' }, { 'Retry-After': '20' }),
      'identityErrors.rateLimitedFor',
      { seconds: 20 },
    ],
    [
      '5xx',
      () => json(503, { type: 'https://api.fawtir.om/problems/internal-error' }),
      'identityErrors.service',
      {},
    ],
    [
      'a network failure',
      () => Promise.reject(new TypeError('Failed to fetch')),
      'identityErrors.network',
      {},
    ],
  ])('shows the shared message for %s', async (_label, respond, key, values) => {
    fetchMock.mockImplementation(respond)
    const user = await typeCode('123456')
    await user.click(submit())

    expect(await screen.findByText(i18n.t(key, values))).toBeTruthy()
  })

  describe('resend', () => {
    it('stays unavailable until the server-given time', () => {
      renderVerify(signupState())
      expect((resend() as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByText(i18n.t('verifyCode.resendIn', { time: '1:00' }))).toBeTruthy()
    })

    it('asks for a new code once, then restarts the cooldown and clears the boxes', async () => {
      fetchMock.mockResolvedValue(json(202))
      renderVerify(signupState({ resendAvailableAt: minutesFromNow(-1) }))
      const user = userEvent.setup({ delay: null })
      await user.click(digits()[0])
      await user.keyboard('12')

      await user.dblClick(resend())

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('/api/v1/auth/signup/resend')
      expect(JSON.parse(init.body as string)).toEqual({
        tenantCode: 'TNT-7F3K2Q',
        email: 'hafidh@example.test',
      })
      expect((resend() as HTMLButtonElement).disabled).toBe(true)
      expect(digits().every((input) => (input as HTMLInputElement).value === '')).toBe(true)
    })

    it('reports a refused resend without restarting the cooldown', async () => {
      fetchMock.mockResolvedValue(
        json(429, { type: 'https://api.fawtir.om/problems/rate-limited' }, { 'Retry-After': '45' }),
      )
      renderVerify(signupState({ resendAvailableAt: minutesFromNow(-1) }))
      await userEvent.setup({ delay: null }).click(resend())

      expect(
        await screen.findByText(i18n.t('identityErrors.rateLimitedFor', { seconds: 45 })),
      ).toBeTruthy()
      expect((resend() as HTMLButtonElement).disabled).toBe(false)
    })
  })

  describe('without the signup hand-off', () => {
    it('sends a visitor with no registration back to signup', async () => {
      renderVerify(null)
      expect((await screen.findByTestId('location')).textContent).toBe('/signup')
    })

    it('shows the step as done to an already verified registrant, who continues to onboarding', async () => {
      saveOnboardingSession(VERIFIED)
      renderVerify(null)
      expect(await screen.findByText(i18n.t('verifyCode.verifiedTitle'))).toBeTruthy()
      // The spent code is never asked for again.
      expect(screen.queryByText(i18n.t('verifyCode.title'))).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: i18n.t('verifyCode.verifiedContinue') }))
      expect((await screen.findByTestId('location')).textContent).toBe('/about-business')
    })
  })

  it('speaks Arabic without any English server text', async () => {
    await i18n.changeLanguage('ar')
    fetchMock.mockResolvedValue(
      json(401, {
        type: 'https://api.fawtir.om/problems/authentication-failed',
        detail: 'The email verification code is invalid or expired.',
      }),
    )
    const user = await typeCode('000000')
    await user.click(submit())

    expect(await screen.findByText(i18n.t('verifyCode.invalid'))).toBeTruthy()
    expect(document.body.textContent).not.toContain('The email verification code')
    expect(
      screen.getByText(
        i18n.t('verifyCode.descriptionEmail', { contact: 'hafidh@example.test', minutes: 10 }),
      ),
    ).toBeTruthy()
  })
})
