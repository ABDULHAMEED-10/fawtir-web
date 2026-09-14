import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../i18n'
import { dropLoginChallenge, holdLoginChallenge, readLoginChallenge } from '../lib/identity/loginChallenge'
import {
  endOnboardingSession,
  markOnboardingSubmitted,
  saveOnboardingSession,
} from '../lib/identity/onboardingSession'
import { LoginCodePage } from './LoginCodePage'
import { LoginPage } from './LoginPage'

const LOGIN = '/api/v1/auth/login'
const CODE = '/api/v1/auth/mfa/otp/request'
const VERIFY = '/api/v1/auth/mfa/verify'
const PASSWORD = 'Correct-Horse9!'
const CHALLENGE_TOKEN = 'mfa.challenge-token'
const AUTH_FAILED = { type: 'https://api.fawtir.om/problems/authentication-failed', detail: 'Invalid credentials.' }

const CHALLENGED = {
  mfaRequired: true,
  tokenType: 'Bearer',
  mfaChallengeToken: CHALLENGE_TOKEN,
  mfaChallengeExpiresAt: new Date(Date.now() + 300_000).toISOString(),
  mfaChallengeExpiresIn: 300,
}
const SIGNED_IN = { mfaRequired: false, tokenType: 'Bearer', tenantId: 't-1', sessionId: 's-1' }

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function Probe() {
  const location = useLocation()
  return (
    <>
      <p data-testid="location">{location.pathname}</p>
      <p data-testid="state">{JSON.stringify(location.state ?? null)}</p>
    </>
  )
}

/** Exposes the current entry's router state, which the browser would persist with the history entry. */
function RouterStateSpy() {
  return <output data-testid="router-state" hidden>{JSON.stringify(useLocation().state ?? null)}</output>
}

function renderAt(pathname: string, { state, strict = false }: { state?: unknown; strict?: boolean } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <RouterStateSpy />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/mfa" element={<LoginCodePage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>

/** Answers each endpoint from its own queue, so a test states exactly the requests it expects. */
function answer(handlers: Record<string, Handler | Handler[]>) {
  const queues = Object.fromEntries(
    Object.entries(handlers).map(([url, handler]) => [url, Array.isArray(handler) ? [...handler] : handler]),
  )
  fetchMock.mockImplementation(async (url: string) => {
    const entry = queues[url]
    const handler = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
    if (!handler) throw new Error(`unexpected request to ${url}`)
    return handler()
  })
}

const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)
const bodyOf = (url: string, index = 0) =>
  JSON.parse((callsTo(url)[index][1] as RequestInit).body as string) as Record<string, unknown>
const submit = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]')!
const field = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
const digits = () => screen.getAllByRole('textbox')
const resend = () => screen.getByRole('button', { name: i18n.t('verifyCode.resend') }) as HTMLButtonElement

async function fillLogin(username = 'hafidh.saif', password = PASSWORD) {
  const user = userEvent.setup({ delay: null })
  if (username) await user.type(field('username'), username)
  if (password) await user.type(field('password'), password)
  return user
}

function holdChallenge(msFromNow = 300_000) {
  holdLoginChallenge({ token: CHALLENGE_TOKEN, expiresAt: Date.now() + msFromNow })
}

async function typeCode(code: string) {
  const user = userEvent.setup({ delay: null })
  await user.click(digits()[0])
  await user.keyboard(code)
  return user
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  sessionStorage.clear()
  localStorage.clear()
  dropLoginChallenge()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Login', () => {
  it('asks for a username and password only — no tenant or company code — and sends nothing on render', () => {
    renderAt('/login')

    const names = [...document.querySelectorAll('form input')].map((input) => input.getAttribute('name') ?? input.getAttribute('type'))
    expect(names).toEqual(['username', 'password', 'checkbox'])
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/tenant|company code/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks presence before calling the backend and focuses the first missing field', async () => {
    renderAt('/login')
    await userEvent.setup({ delay: null }).click(submit())

    expect(screen.getAllByText(i18n.t('validation.required'))).toHaveLength(2)
    expect(document.activeElement).toBe(field('username'))
    expect(field('username').getAttribute('aria-invalid')).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses values longer than the backend accepts without a request', async () => {
    renderAt('/login')
    fireEvent.change(field('username'), { target: { value: 'a'.repeat(256) } })
    fireEvent.change(field('password'), { target: { value: PASSWORD } })
    fireEvent.submit(submit().closest('form')!)

    expect(await screen.findByText(i18n.t('validation.tooLong'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('submits from the keyboard with one login request carrying only the credentials', async () => {
    answer({ [LOGIN]: () => json(200, CHALLENGED), [CODE]: () => json(202) })
    renderAt('/login')
    const user = await fillLogin('  hafidh.saif ')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(callsTo(CODE)).toHaveLength(1))
    expect(callsTo(LOGIN)).toHaveLength(1)
    expect(bodyOf(LOGIN)).toEqual({ username: 'hafidh.saif', password: PASSWORD, portalCookie: true })
    expect((callsTo(LOGIN)[0][1] as RequestInit).credentials).toBe('same-origin')
    expect(bodyOf(CODE)).toEqual({ challengeToken: CHALLENGE_TOKEN, factor: 'EMAIL_OTP' })
    expect(screen.getByText(i18n.t('loginCode.description', { minutes: 5 }))).toBeTruthy()
  })

  it('keeps the challenge out of storage and out of the history entry', async () => {
    answer({ [LOGIN]: () => json(200, CHALLENGED), [CODE]: () => json(202) })
    renderAt('/login')
    await (await fillLogin()).click(submit())
    await waitFor(() => expect(callsTo(CODE)).toHaveLength(1))

    const stored = JSON.stringify({ ...sessionStorage, ...localStorage })
    expect(stored).not.toContain(CHALLENGE_TOKEN)
    expect(stored).not.toContain(PASSWORD)
    expect(screen.getByTestId('router-state').textContent).toBe('null')
  })

  it('sends one login however often it is submitted', async () => {
    let release: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)))
    renderAt('/login')
    await fillLogin()

    const form = submit().closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(submit().disabled).toBe(true)
    expect(submit().textContent).toBe(i18n.t('login.submitting'))
    await act(async () => release(json(401, AUTH_FAILED)))
  })

  it('reports refused credentials with one message that names no reason, then clears it on edit', async () => {
    answer({ [LOGIN]: () => json(401, AUTH_FAILED) })
    renderAt('/login')
    const user = await fillLogin()
    await user.click(submit())

    expect(await screen.findByText(i18n.t('login.failed'))).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(i18n.t('login.failed'))
    expect(document.body.textContent).not.toContain('Invalid credentials')
    expect(submit().disabled).toBe(false)
    expect(field('username').value).toBe('hafidh.saif')

    await user.type(field('password'), 'x')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each([
    ['429', () => json(429, { type: 'https://api.fawtir.om/problems/rate-limited' }, { 'Retry-After': '40' }), 'identityErrors.rateLimitedFor', { seconds: 40 }],
    ['5xx', () => json(503, { type: 'https://api.fawtir.om/problems/internal-error' }), 'identityErrors.service', {}],
    ['a validation refusal', () => json(400, { type: 'https://api.fawtir.om/problems/validation-failed', errors: [{ field: 'username', message: 'size must be between 0 and 255' }] }), 'identityErrors.validation', {}],
    ['a malformed-request refusal', () => json(400, { type: 'https://api.fawtir.om/problems/malformed-request' }), 'identityErrors.unexpected', {}],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'identityErrors.network', {}],
    ['an MFA answer without a challenge', () => json(200, { mfaRequired: true }), 'identityErrors.unexpected', {}],
  ])('shows the shared message for %s and stays on Login', async (_label, respond, key, values) => {
    answer({ [LOGIN]: respond })
    renderAt('/login')
    await (await fillLogin()).click(submit())

    expect(await screen.findByText(i18n.t(key, values))).toBeTruthy()
    expect(callsTo(LOGIN)).toHaveLength(1)
    expect(callsTo(CODE)).toHaveLength(0)
    expect(readLoginChallenge()).toBeNull()
  })

  it('goes straight to the app if the backend ever issues a session for the password alone', async () => {
    answer({ [LOGIN]: () => json(200, SIGNED_IN) })
    renderAt('/login')
    await (await fillLogin()).click(submit())

    expect((await screen.findByTestId('location')).textContent).toBe('/dashboard')
    expect(callsTo(CODE)).toHaveLength(0)
  })

  it('never writes the password to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level))
    answer({ [LOGIN]: () => json(401, AUTH_FAILED) })
    renderAt('/login')
    await (await fillLogin()).click(submit())
    await screen.findByText(i18n.t('login.failed'))

    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(PASSWORD)
    }
  })

  it('speaks Arabic without any English server text', async () => {
    await i18n.changeLanguage('ar')
    answer({ [LOGIN]: () => json(401, AUTH_FAILED) })
    renderAt('/login')
    await (await fillLogin()).click(submit())

    expect(await screen.findByText(i18n.t('login.failed'))).toBeTruthy()
    expect(screen.getByRole('alert').textContent).not.toMatch(/[A-Za-z]/)
  })

  it('explains why the code step sent the user back, once', async () => {
    renderAt('/login', { state: { signInAgain: true } })

    expect(screen.getByRole('alert').textContent).toBe(i18n.t('login.signInAgain'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Signup and Login stay separate', () => {
  const ONBOARDING = { onboardingToken: 'so.onboarding-token', onboardingTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString() }

  it.each([
    ['a live onboarding session', () => saveOnboardingSession(ONBOARDING)],
    ['a submitted registration', () => { saveOnboardingSession(ONBOARDING); markOnboardingSubmitted(true) }],
    ['an ended onboarding session', () => { saveOnboardingSession(ONBOARDING); endOnboardingSession() }],
  ])('%s neither redirects Login nor counts as signed in', async (_label, arrange) => {
    arrange()
    const before = JSON.stringify({ ...sessionStorage })
    renderAt('/login')

    expect(submit().textContent).toBe(i18n.t('login.submit'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('location')).toBeNull()
    expect(JSON.stringify({ ...sessionStorage })).toBe(before)
  })

  it('a registration still under review gets the same refusal as a wrong password, and its onboarding state is untouched', async () => {
    saveOnboardingSession(ONBOARDING)
    markOnboardingSubmitted(true)
    const before = JSON.stringify({ ...sessionStorage })
    answer({ [LOGIN]: () => json(401, { ...AUTH_FAILED, detail: 'Account is disabled.' }) })
    renderAt('/login')
    await (await fillLogin('pending.registrant')).click(submit())

    expect(await screen.findByText(i18n.t('login.failed'))).toBeTruthy()
    expect(bodyOf(LOGIN)).not.toHaveProperty('onboardingToken')
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('so.onboarding-token')
    expect(JSON.stringify({ ...sessionStorage })).toBe(before)
  })
})

describe('Login code step', () => {
  it('without a challenge — opened directly or after a reload — returns to Login without a request', async () => {
    renderAt('/login/mfa')
    expect(await screen.findByText(i18n.t('login.title'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('emails exactly one code on arrival, even under StrictMode', async () => {
    answer({ [CODE]: () => json(202) })
    holdChallenge()
    renderAt('/login/mfa', { strict: true })

    await waitFor(() => expect(callsTo(CODE)).toHaveLength(1))
    await act(async () => {})
    expect(callsTo(CODE)).toHaveLength(1)
    expect(resend().disabled).toBe(true)
    expect(screen.getByText(i18n.t('verifyCode.resendIn', { time: '1:00' }))).toBeTruthy()
  })

  it('asks for all six digits before calling the backend', async () => {
    answer({ [CODE]: () => json(202) })
    holdChallenge()
    renderAt('/login/mfa')
    const user = await typeCode('123')
    await user.click(submit())

    expect(screen.getByText(i18n.t('validation.codeIncomplete'))).toBeTruthy()
    expect(callsTo(VERIFY)).toHaveLength(0)
  })

  it('verifies once in cookie mode, forgets the challenge and lands on the dashboard', async () => {
    answer({ [CODE]: () => json(202), [VERIFY]: () => json(200, SIGNED_IN) })
    holdChallenge()
    renderAt('/login/mfa')
    const user = await typeCode('123456')
    await user.click(submit())

    expect((await screen.findByTestId('location')).textContent).toBe('/dashboard')
    expect(callsTo(VERIFY)).toHaveLength(1)
    expect(bodyOf(VERIFY)).toEqual({ challengeToken: CHALLENGE_TOKEN, factor: 'EMAIL_OTP', code: '123456', portalCookie: true })
    expect((callsTo(VERIFY)[0][1] as RequestInit).credentials).toBe('same-origin')
    expect(readLoginChallenge()).toBeNull()
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain('123456')
  })

  it('sends one verification however often it is submitted', async () => {
    let release: (response: Response) => void = () => {}
    answer({ [CODE]: () => json(202), [VERIFY]: () => new Promise<Response>((resolve) => (release = resolve)) })
    holdChallenge()
    renderAt('/login/mfa')
    await typeCode('123456')

    const form = submit().closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.submit(form)

    await waitFor(() => expect(callsTo(VERIFY)).toHaveLength(1))
    expect(submit().disabled).toBe(true)
    await act(async () => release(json(200, SIGNED_IN)))
  })

  it('sends a refused code back to Login, because the attempt spent the challenge', async () => {
    answer({ [CODE]: () => json(202), [VERIFY]: () => json(401, AUTH_FAILED) })
    holdChallenge()
    renderAt('/login/mfa')
    await (await typeCode('000000')).click(submit())

    expect(await screen.findByText(i18n.t('login.signInAgain'))).toBeTruthy()
    expect(field('username').value).toBe('')
    expect(readLoginChallenge()).toBeNull()
    expect(callsTo(VERIFY)).toHaveLength(1)
  })

  it.each([
    ['429', () => json(429, { type: 'https://api.fawtir.om/problems/rate-limited' }, { 'Retry-After': '20' }), 'identityErrors.rateLimitedFor', { seconds: 20 }],
    ['5xx', () => json(503, { type: 'https://api.fawtir.om/problems/internal-error' }), 'identityErrors.service', {}],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'identityErrors.network', {}],
  ])('keeps the code screen for %s', async (_label, respond, key, values) => {
    answer({ [CODE]: () => json(202), [VERIFY]: respond })
    holdChallenge()
    renderAt('/login/mfa')
    await (await typeCode('123456')).click(submit())

    expect(await screen.findByText(i18n.t(key, values))).toBeTruthy()
    expect(readLoginChallenge()?.token).toBe(CHALLENGE_TOKEN)
    expect(submit().disabled).toBe(false)
  })

  it('returns to Login when the first code cannot be issued for this challenge', async () => {
    answer({ [CODE]: () => json(401, AUTH_FAILED) })
    holdChallenge()
    renderAt('/login/mfa')

    expect(await screen.findByText(i18n.t('login.signInAgain'))).toBeTruthy()
    expect(readLoginChallenge()).toBeNull()
  })

  it('opens Resend at once when the first code could not be sent, and resends once', async () => {
    answer({ [CODE]: [() => Promise.reject(new TypeError('Failed to fetch')), () => json(202)] })
    holdChallenge()
    renderAt('/login/mfa')

    expect(await screen.findByText(i18n.t('identityErrors.network'))).toBeTruthy()
    expect(resend().disabled).toBe(false)
    await typeCode('12')
    await userEvent.setup({ delay: null }).dblClick(resend())

    await waitFor(() => expect(callsTo(CODE)).toHaveLength(2))
    expect(resend().disabled).toBe(true)
    expect(digits().every((input) => (input as HTMLInputElement).value === '')).toBe(true)
    expect(screen.queryByText(i18n.t('identityErrors.network'))).toBeNull()
  })

  it('returns to Login by itself when the challenge lapses on screen', async () => {
    answer({ [CODE]: () => json(202) })
    holdChallenge(1_200)
    renderAt('/login/mfa')

    expect(await screen.findByText(i18n.t('login.signInAgain'), undefined, { timeout: 4_000 })).toBeTruthy()
    expect(callsTo(VERIFY)).toHaveLength(0)
  })

  it('does not abandon a verification that is still in flight when the challenge lapses', async () => {
    let release: (response: Response) => void = () => {}
    answer({ [CODE]: () => json(202), [VERIFY]: () => new Promise<Response>((resolve) => (release = resolve)) })
    holdChallenge(1_500)
    renderAt('/login/mfa')
    await (await typeCode('123456')).click(submit())
    await waitFor(() => expect(callsTo(VERIFY)).toHaveLength(1))

    await act(async () => new Promise((resolve) => setTimeout(resolve, 2_200)))
    expect(screen.queryByTestId('location')).toBeNull()
    expect(screen.queryByText(i18n.t('login.signInAgain'))).toBeNull()

    await act(async () => release(json(200, SIGNED_IN)))
    expect((await screen.findByTestId('location')).textContent).toBe('/dashboard')
  })

  it('never names the recipient and speaks Arabic', async () => {
    await i18n.changeLanguage('ar')
    answer({ [CODE]: () => json(202), [VERIFY]: () => json(503, { type: 'https://api.fawtir.om/problems/internal-error', detail: 'Service unavailable' }) })
    holdChallenge()
    renderAt('/login/mfa')
    await (await typeCode('123456')).click(submit())

    expect(screen.getByText(i18n.t('loginCode.description', { minutes: 5 }))).toBeTruthy()
    expect(await screen.findByText(i18n.t('identityErrors.service'))).toBeTruthy()
    expect(document.body.textContent).not.toContain('@')
    expect(document.body.textContent).not.toContain('Service unavailable')
  })
})
