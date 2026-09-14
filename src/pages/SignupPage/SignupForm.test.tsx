import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { VerifyCodePage } from '../VerifyCodePage'
import { SignupForm } from './SignupForm'

const CREATED = {
  tenantCode: 'TNT-7F3K2Q',
  username: 'hafidh.saif',
  email: 'hafidh@example.test',
  languageCode: 'en',
  emailVerificationRequired: true,
  // Relative to now: the code screen counts the minutes left from these instants.
  emailVerificationExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function problem(status: number, slug: string, extra: object = {}, headers: Record<string, string> = {}) {
  return json(status, { type: `https://api.fawtir.om/problems/${slug}`, ...extra }, headers)
}

function StateProbe() {
  return <pre data-testid="verify-state">{JSON.stringify(useLocation().state)}</pre>
}

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<SignupForm />} />
        <Route
          path="/verify-code"
          element={
            <>
              <VerifyCodePage />
              <StateProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const field = (labelKey: string) => screen.getByLabelText(new RegExp(`^${i18n.t(labelKey)}`))

async function fillValidForm(user: UserEvent, overrides: { username?: string } = {}) {
  await user.type(field('signup.fullNameLabel'), 'Hafidh Saif')
  await user.type(field('login.usernameLabel'), overrides.username ?? 'hafidh.saif')
  await user.type(field('signup.emailLabel'), 'hafidh@example.test')
  await user.type(field('signup.phoneLabel'), '9123 4567')
  await user.type(field('signup.passwordLabel'), 'Correct-Horse9')
  await user.type(field('signup.confirmPasswordLabel'), 'Correct-Horse9')
  await user.click(screen.getByRole('checkbox'))
}

// Located by type, not by name: the label changes to the submitting text mid-request.
const submitButton = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]')!

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SignupForm', () => {
  it('starts with the consent box unticked and refuses to submit until it is ticked', async () => {
    const user = userEvent.setup({ delay: null })
    renderSignup()
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)

    await fillValidForm(user)
    await user.click(screen.getByRole('checkbox'))
    await user.click(submitButton())

    expect(screen.getByText(i18n.t('validation.agreeRequired'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates locally without calling the backend', async () => {
    const user = userEvent.setup({ delay: null })
    renderSignup()

    await user.type(field('login.usernameLabel'), '.bad name')
    await user.type(field('signup.passwordLabel'), 'weakpass')
    await user.type(field('signup.confirmPasswordLabel'), 'different')
    await user.click(submitButton())

    expect(screen.getByText(i18n.t('validation.usernameInvalid'))).toBeTruthy()
    expect(screen.getByText(i18n.t('validation.passwordLength'))).toBeTruthy()
    expect(screen.getByText(i18n.t('validation.passwordMismatch'))).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  describe('accessibility', () => {
    const describedText = (element: HTMLElement) =>
      (element.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent)
        .join(' ')

    it('moves focus to the first invalid field and links it to its message', async () => {
      const user = userEvent.setup({ delay: null })
      renderSignup()
      await fillValidForm(user)
      await user.clear(field('login.usernameLabel'))
      await user.type(field('login.usernameLabel'), '.bad')
      await user.clear(field('signup.passwordLabel'))
      await user.type(field('signup.passwordLabel'), 'short')

      await user.keyboard('{Enter}')

      const username = field('login.usernameLabel')
      expect(document.activeElement).toBe(username)
      expect(username.getAttribute('aria-invalid')).toBe('true')
      expect(describedText(username)).toBe(i18n.t('validation.usernameInvalid'))
      expect(field('signup.passwordLabel').getAttribute('aria-invalid')).toBe('true')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('focuses the consent box when it is the only problem', async () => {
      const user = userEvent.setup({ delay: null })
      renderSignup()
      await fillValidForm(user)
      await user.click(screen.getByRole('checkbox'))

      await user.click(submitButton())

      const consent = screen.getByRole('checkbox')
      expect(document.activeElement).toBe(consent)
      expect(consent.getAttribute('aria-invalid')).toBe('true')
      expect(describedText(consent)).toBe(i18n.t('validation.agreeRequired'))
    })

    it('focuses the username field when the server reports it taken', async () => {
      const user = userEvent.setup({ delay: null })
      fetchMock.mockResolvedValue(problem(409, 'resource-conflict'))
      renderSignup()
      await fillValidForm(user)

      await user.click(submitButton())

      await screen.findByText(i18n.t('validation.usernameTaken'))
      expect(document.activeElement).toBe(field('login.usernameLabel'))
    })

    it('leaves focus alone for a form-level failure, which is announced instead', async () => {
      const user = userEvent.setup({ delay: null })
      fetchMock.mockResolvedValue(problem(503, 'internal-error'))
      renderSignup()
      await fillValidForm(user)

      await user.click(submitButton())

      const message = await screen.findByText(i18n.t('identityErrors.service'))
      expect(message.getAttribute('role')).toBe('alert')
      expect(document.querySelectorAll('form [aria-invalid="true"]')).toHaveLength(0)
    })
  })

  it('sends one POST with the whitelisted body and moves to email verification', async () => {
    const user = userEvent.setup({ delay: null })
    fetchMock.mockResolvedValue(json(201, CREATED))
    renderSignup()

    await fillValidForm(user)
    await user.click(submitButton())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/auth/signup')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(init.body as string)).toEqual({
      fullName: 'Hafidh Saif',
      username: 'hafidh.saif',
      email: 'hafidh@example.test',
      phone: '+96891234567',
      password: 'Correct-Horse9',
      languageCode: 'en',
      termsAccepted: true,
      privacyAccepted: true,
    })

    const state = JSON.parse((await screen.findByTestId('verify-state')).textContent ?? 'null')
    expect(state).toEqual({
      from: 'signup',
      tenantCode: CREATED.tenantCode,
      email: CREATED.email,
      emailVerificationExpiresAt: CREATED.emailVerificationExpiresAt,
      resendAvailableAt: CREATED.resendAvailableAt,
    })
    expect(
      screen.getByText(i18n.t('verifyCode.descriptionEmail', { contact: CREATED.email, minutes: 10 })),
    ).toBeTruthy()
    expect(screen.queryByText(/phone/i)).toBeNull()
  })

  it('never displays or stores the tenant code', async () => {
    const user = userEvent.setup({ delay: null })
    fetchMock.mockResolvedValue(json(201, CREATED))
    renderSignup()

    await fillValidForm(user)
    await user.click(submitButton())
    const probe = await screen.findByTestId('verify-state')

    expect(probe.textContent).toContain(CREATED.tenantCode)
    const visibleText = (document.body.textContent ?? '').replace(probe.textContent ?? '', '')
    expect(visibleText).not.toContain(CREATED.tenantCode)
    expect(JSON.stringify({ ...localStorage })).not.toContain(CREATED.tenantCode)
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(CREATED.tenantCode)
  })

  it('treats the neutral duplicate-email 201 exactly like a fresh registration', async () => {
    const user = userEvent.setup({ delay: null })
    fetchMock.mockResolvedValue(json(201, { ...CREATED, tenantCode: 'TNT-DISCARDED' }))
    renderSignup()

    await fillValidForm(user)
    await user.click(submitButton())

    expect((await screen.findByTestId('verify-state')).textContent).toContain('TNT-DISCARDED')
  })

  it('guards against a second submit while the first is in flight', async () => {
    const user = userEvent.setup({ delay: null })
    let answer: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    renderSignup()
    await fillValidForm(user)

    const form = submitButton().closest('form') as HTMLFormElement
    fireEvent.submit(form)
    fireEvent.submit(form)
    await user.dblClick(submitButton())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((submitButton() as HTMLButtonElement).disabled).toBe(true)
    expect(submitButton().textContent).toContain(i18n.t('signup.submitting'))

    await act(async () => answer(json(201, CREATED)))
    expect(await screen.findByTestId('verify-state')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-enables the form after a failure so the user can retry', async () => {
    const user = userEvent.setup({ delay: null })
    fetchMock.mockResolvedValueOnce(problem(409, 'resource-conflict', { detail: 'That username is already taken' }))
    fetchMock.mockResolvedValueOnce(json(201, CREATED))
    renderSignup()
    await fillValidForm(user)

    await user.click(submitButton())
    expect(await screen.findByText(i18n.t('validation.usernameTaken'))).toBeTruthy()
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false)

    await user.clear(field('login.usernameLabel'))
    await user.type(field('login.usernameLabel'), 'hafidh.saif2')
    expect(screen.queryByText(i18n.t('validation.usernameTaken'))).toBeNull()
    await user.click(submitButton())

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string).username).toBe(
      'hafidh.saif2',
    )
    expect(await screen.findByTestId('verify-state')).toBeTruthy()
  })

  it.each([
    ['429 with Retry-After', () => problem(429, 'rate-limited', {}, { 'Retry-After': '42' }), () => i18n.t('identityErrors.rateLimitedFor', { seconds: 42 })],
    ['a 5xx', () => problem(500, 'internal-error', { detail: 'The request could not be completed.' }), () => i18n.t('identityErrors.service')],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch')), () => i18n.t('identityErrors.network')],
  ])('shows a localized form message for %s', async (_label, respond, expected) => {
    const user = userEvent.setup({ delay: null })
    fetchMock.mockImplementation(respond)
    renderSignup()
    await fillValidForm(user)

    await user.click(submitButton())

    expect(await screen.findByText(expected())).toBeTruthy()
    expect((submitButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the localized timeout message when the backend never answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
          ),
      )
      renderSignup()
      await fillValidForm(user)
      await user.click(submitButton())

      await act(async () => vi.advanceTimersByTimeAsync(30_000))
      expect(screen.getByText(i18n.t('identityErrors.timeout'))).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  describe('in Arabic', () => {
    beforeEach(async () => {
      await i18n.changeLanguage('ar')
    })

    it('sends languageCode ar', async () => {
      const user = userEvent.setup({ delay: null })
      fetchMock.mockResolvedValue(json(201, { ...CREATED, languageCode: 'ar' }))
      renderSignup()
      await fillValidForm(user)
      await user.click(submitButton())

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(JSON.parse(init.body as string).languageCode).toBe('ar')
    })

    it('never shows the backend English sentences', async () => {
      const user = userEvent.setup({ delay: null })
      const fieldSentence = 'Username must be 3 to 64 characters, start with a letter or digit'
      const detailSentence = 'Password is too common.'
      fetchMock.mockResolvedValueOnce(
        problem(400, 'validation-failed', {
          detail: 'One or more request fields are invalid.',
          errors: [{ field: 'username', message: fieldSentence }],
        }),
      )
      fetchMock.mockResolvedValueOnce(problem(400, 'validation-failed', { detail: detailSentence }))
      renderSignup()
      await fillValidForm(user)

      await user.click(submitButton())
      expect(await screen.findByText(i18n.t('validation.usernameInvalid'))).toBeTruthy()

      await user.click(submitButton())
      expect(await screen.findByText(i18n.t('identityErrors.validation'))).toBeTruthy()

      expect(document.body.textContent).not.toContain(fieldSentence)
      expect(document.body.textContent).not.toContain(detailSentence)
      expect(document.body.textContent).not.toContain('One or more request fields are invalid.')
    })
  })
})
