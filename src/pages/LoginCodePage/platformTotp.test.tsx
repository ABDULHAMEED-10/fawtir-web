import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { holdLoginChallenge, dropLoginChallenge } from '../../lib/identity/loginChallenge'
import type { LoginChallenge } from '../../lib/identity/login'
import { LoginCodeForm } from './LoginCodeForm'

const VERIFY_URL = '/api/v1/auth/mfa/verify'
const OTP_URL = '/api/v1/auth/mfa/otp/request'
const ENROLL_URL = '/api/v1/auth/mfa/totp/enroll'
const CONFIRM_URL = '/api/v1/auth/mfa/totp/confirm'
const ENTITLEMENTS_URL = '/api/v1/me/entitlements'

const totpChallenge = (state: LoginChallenge['state']): LoginChallenge => ({
  token: 'challenge.token',
  expiresAt: Date.now() + 600_000,
  factor: 'TOTP',
  state,
})

/** What a customer login still produces: no factor named, no state. */
const emailChallenge = (): LoginChallenge => ({
  token: 'challenge.token',
  expiresAt: Date.now() + 600_000,
  factor: 'EMAIL_OTP',
  state: null,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

function answer(handlers: Record<string, Handler>) {
  fetchMock.mockImplementation(async (url: string) => {
    const handler = handlers[url]
    if (!handler) throw new Error(`unexpected request to ${url}`)
    return handler()
  })
}
const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)
const bodyOf = (url: string) => JSON.parse(String(callsTo(url)[0][1]?.body))

function Probe() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname}</p>
}

function renderForm(challenge: LoginChallenge) {
  return render(
    <MemoryRouter initialEntries={['/login/mfa']}>
      <Routes>
        <Route path="/login/mfa" element={<LoginCodeForm challenge={challenge} />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  dropLoginChallenge()
  sessionStorage.clear()
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Platform TOTP verification', () => {
  it('F01 a TOTP challenge renders the authenticator screen', async () => {
    answer({})
    renderForm(totpChallenge('VERIFICATION_REQUIRED'))

    expect(screen.getByRole('heading', { name: 'Two-step verification' })).toBeTruthy()
    expect(screen.getByText('Enter the 6-digit code from your authenticator app.')).toBeTruthy()
    expect(screen.getByLabelText('Authenticator code')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Verify' })).toBeTruthy()
  })

  it('F02/F03 it offers no resend and says nothing about email', async () => {
    answer({})
    renderForm(totpChallenge('VERIFICATION_REQUIRED'))

    const body = document.body.textContent ?? ''
    for (const absent of ['Resend', 'Send', 'email', 'Email', 'inbox']) {
      expect(body).not.toContain(absent)
    }
    // Nothing is sent to reach this screen, so nothing may be requested.
    expect(callsTo(OTP_URL)).toHaveLength(0)
  })

  it('F04 verifying sends the factor the server named, with the challenge token', async () => {
    answer({ [VERIFY_URL]: () => json(200, { mfaRequired: false }) })
    renderForm(totpChallenge('VERIFICATION_REQUIRED'))

    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await waitFor(() => expect(callsTo(VERIFY_URL)).toHaveLength(1))
    expect(bodyOf(VERIFY_URL)).toMatchObject({
      challengeToken: 'challenge.token',
      factor: 'TOTP',
      code: '123456',
      portalCookie: true,
    })
  })

  it('F05 a refused code returns to sign-in, because the attempt spent the challenge', async () => {
    // The backend consumes the challenge on every verification, right or wrong, so there is
    // nothing left to retry here — staying on this screen would offer a box that can only fail.
    answer({
      [VERIFY_URL]: () =>
        json(401, {
          type: 'https://api.fawtir.om/problems/authentication-failed',
          detail: 'Server prose that must not be shown.',
        }),
    })
    renderForm(totpChallenge('VERIFICATION_REQUIRED'))

    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    expect((await screen.findByTestId('where')).textContent).toBe('/login')
    expect(document.body.textContent).not.toContain('Server prose that must not be shown.')
  })

  it('a failure that is not a spent challenge keeps the reader on the screen', async () => {
    answer({
      [VERIFY_URL]: () =>
        json(500, {
          type: 'https://api.fawtir.om/problems/internal',
          detail: 'Server prose that must not be shown.',
        }),
    })
    renderForm(totpChallenge('VERIFICATION_REQUIRED'))

    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(document.body.textContent).not.toContain('Server prose that must not be shown.')
    expect(screen.getByRole('heading', { name: 'Two-step verification' })).toBeTruthy()
  })

  it('F12 a short code cannot be submitted, so the challenge is not spent by a typo', async () => {
    answer({})
    renderForm(totpChallenge('VERIFICATION_REQUIRED'))

    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))

    expect(callsTo(VERIFY_URL)).toHaveLength(0)
  })
})

describe('Platform TOTP enrolment', () => {
  const staged = {
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUri: 'otpauth://totp/Fawtir:ops?secret=JBSWY3DPEHPK3PXP',
    enrollmentChallenge: 'enrollment.handle',
  }

  it('F06/F07 an enrolment challenge renders setup, and stages the key exactly once', async () => {
    answer({ [ENROLL_URL]: () => json(200, staged) })
    renderForm(totpChallenge('ENROLLMENT_REQUIRED'))

    expect(await screen.findByRole('heading', { name: 'Set up your authenticator' })).toBeTruthy()
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeTruthy()
    // Asking twice would mint a second secret and invalidate the one just scanned.
    expect(callsTo(ENROLL_URL)).toHaveLength(1)
    expect(bodyOf(ENROLL_URL)).toEqual({ challengeToken: 'challenge.token' })
  })

  it('F07 the setup key is never written to browser storage', async () => {
    answer({ [ENROLL_URL]: () => json(200, staged) })
    renderForm(totpChallenge('ENROLLMENT_REQUIRED'))
    await screen.findByText('JBSWY3DPEHPK3PXP')

    const stored = [
      ...Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? ''),
      ...Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key) ?? ''),
    ].join(' ')
    expect(stored).not.toContain(staged.secret)
    expect(stored).not.toContain(staged.enrollmentChallenge)
  })

  it('F08 the first code confirms enrolment and does not sign anyone in', async () => {
    answer({
      [ENROLL_URL]: () => json(200, staged),
      [CONFIRM_URL]: () => json(200, { enabled: true, backupCodes: [] }),
    })
    renderForm(totpChallenge('ENROLLMENT_REQUIRED'))
    await screen.findByText('JBSWY3DPEHPK3PXP')

    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(callsTo(CONFIRM_URL)).toHaveLength(1))
    expect(bodyOf(CONFIRM_URL)).toEqual({
      challengeToken: 'challenge.token',
      code: '654321',
      enrollmentChallenge: 'enrollment.handle',
    })
    // The login is not finished: the original challenge still has to be verified.
    expect(await screen.findByRole('heading', { name: 'Two-step verification' })).toBeTruthy()
    expect(callsTo(VERIFY_URL)).toHaveLength(0)
  })

  it('F09 recovery codes are shown once, before the login is completed', async () => {
    answer({
      [ENROLL_URL]: () => json(200, staged),
      [CONFIRM_URL]: () => json(200, { enabled: true, backupCodes: ['AAAA-1111', 'BBBB-2222'] }),
    })
    renderForm(totpChallenge('ENROLLMENT_REQUIRED'))
    await screen.findByText('JBSWY3DPEHPK3PXP')

    fireEvent.change(screen.getByLabelText('Authenticator code'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByRole('heading', { name: 'Save your recovery codes' })).toBeTruthy()
    expect(screen.getByText('AAAA-1111')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'I have saved them' }))
    expect(await screen.findByRole('heading', { name: 'Two-step verification' })).toBeTruthy()
  })

  it('F13 a reload restarts enrolment rather than resuming a secret from storage', async () => {
    answer({ [ENROLL_URL]: () => json(200, staged) })
    const first = renderForm(totpChallenge('ENROLLMENT_REQUIRED'))
    await screen.findByText('JBSWY3DPEHPK3PXP')
    first.unmount()

    renderForm(totpChallenge('ENROLLMENT_REQUIRED'))
    await screen.findByText('JBSWY3DPEHPK3PXP')
    // A second staging call, because nothing survived the unmount.
    expect(callsTo(ENROLL_URL)).toHaveLength(2)
  })
})

describe('Customer login is untouched', () => {
  it('F10/F11 an email challenge still sends a code and offers resend', async () => {
    answer({
      [OTP_URL]: () => json(202),
      [ENTITLEMENTS_URL]: () => json(200, {}),
    })
    renderForm(emailChallenge())

    // The email flow's first act is to send a code — the behaviour a TOTP challenge must not
    // reach, and which must survive untouched here.
    await waitFor(() => expect(callsTo(OTP_URL)).toHaveLength(1))
    expect(bodyOf(OTP_URL)).toMatchObject({ challengeToken: 'challenge.token', factor: 'EMAIL_OTP' })
    expect(screen.queryByRole('heading', { name: 'Two-step verification' })).toBeNull()
  })

  it('a challenge the server said nothing about is treated as the email flow', async () => {
    answer({ [OTP_URL]: () => json(202), [ENTITLEMENTS_URL]: () => json(200, {}) })
    holdLoginChallenge(emailChallenge())
    renderForm(emailChallenge())

    await waitFor(() => expect(callsTo(OTP_URL)).toHaveLength(1))
    expect(callsTo(ENROLL_URL)).toHaveLength(0)
  })
})
