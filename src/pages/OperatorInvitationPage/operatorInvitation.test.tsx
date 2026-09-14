import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { OperatorInvitationPage } from './OperatorInvitationPage'

const ACCEPT_URL = '/api/v1/auth/invitations/accept'
const TOKEN = 'fawtir_inv_00000000-0000-4000-8000-000000000001.abcDEF123_-xyz'
const GOOD_PASSWORD = 'Str0ng!Passw0rd#'
const t = (key: string, values?: Record<string, string>) => i18n.t(key, values)

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
const problem = (status: number, type: string, extra: Record<string, unknown> = {}) =>
  json(status, { type: `https://api.fawtir.om/problems/${type}`, detail: 'Server prose that must not be shown.', ...extra })

let fetchMock: ReturnType<typeof vi.fn>
const calls = () => fetchMock.mock.calls.filter(([url]) => url === ACCEPT_URL)
const initOf = (index = 0) => calls()[index][1] as RequestInit

function HashProbe() {
  const location = useLocation()
  return <p data-testid="hash">{location.hash}</p>
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/operator-invitation"
          element={
            <>
              <OperatorInvitationPage />
              <HashProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const field = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } })
const submitButton = () => screen.getByRole('button', { name: t('operatorInvitation.submit') }) as HTMLButtonElement

function fillValid() {
  type('username', 'noor.ops')
  type('firstName', 'Noor')
  type('lastName', 'Al Said')
  type('password', GOOD_PASSWORD)
  type('confirmPassword', GOOD_PASSWORD)
}

async function submit() {
  await act(async () => {
    fireEvent.click(submitButton())
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  // A portal session left in the same browser must not turn this public call into a CSRF-checked one.
  document.cookie = 'FAWTIR_CSRF=csrf-token-value; path=/'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Operator invitation page', () => {
  it('reads the token from the fragment once, then removes it from the address', async () => {
    renderAt(`/operator-invitation#token=${encodeURIComponent(TOKEN)}`)

    expect(screen.getByRole('heading', { level: 2, name: t('operatorInvitation.title') })).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('hash').textContent).toBe(''))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says the link is incomplete when it carries no token, and sends nothing', () => {
    renderAt('/operator-invitation')

    expect(screen.getByText(t('operatorInvitation.missing.title'))).toBeTruthy()
    expect(document.querySelector('form')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks the username and password rules before sending anything', async () => {
    renderAt(`/operator-invitation#token=${TOKEN}`)
    type('username', 'no spaces allowed')
    type('password', 'short')
    type('confirmPassword', 'different')
    await submit()

    expect(screen.getByText(t('validation.usernameInvalid'))).toBeTruthy()
    expect(field('username').getAttribute('aria-invalid')).toBe('true')
    expect(field('password').getAttribute('aria-invalid')).toBe('true')
    expect(calls()).toHaveLength(0)
  })

  it('creates the account with one request, without cookies or a CSRF header, and offers sign-in', async () => {
    fetchMock.mockResolvedValue(json(201, { id: 'u-new', username: 'noor.ops', roles: [] }))
    renderAt(`/operator-invitation#token=${encodeURIComponent(TOKEN)}`)
    fillValid()
    await submit()

    expect(await screen.findByText(t('operatorInvitation.done.title'))).toBeTruthy()
    expect(calls()).toHaveLength(1)
    const init = initOf()
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined()
    expect(JSON.parse(init.body as string)).toEqual({
      token: TOKEN,
      username: 'noor.ops',
      password: GOOD_PASSWORD,
      firstName: 'Noor',
      lastName: 'Al Said',
    })
    expect(screen.getByRole('link', { name: t('operatorInvitation.done.signIn') }).getAttribute('href')).toBe('/login')
  })

  it('leaves out names the invitee did not give', async () => {
    fetchMock.mockResolvedValue(json(201, {}))
    renderAt(`/operator-invitation#token=${TOKEN}`)
    type('username', 'noor.ops')
    type('password', GOOD_PASSWORD)
    type('confirmPassword', GOOD_PASSWORD)
    await submit()

    await screen.findByText(t('operatorInvitation.done.title'))
    const body = JSON.parse(initOf().body as string)
    expect(body).not.toHaveProperty('firstName')
    expect(body).not.toHaveProperty('lastName')
  })

  it('sends one request however often submit is pressed while it runs', async () => {
    let release: (response: Response) => void = () => {}
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)))
    renderAt(`/operator-invitation#token=${TOKEN}`)
    fillValid()
    await submit()
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!)
    })

    expect(calls()).toHaveLength(1)
    await act(async () => release(json(201, {})))
    expect(await screen.findByText(t('operatorInvitation.done.title'))).toBeTruthy()
  })

  it('treats any token refusal as a spent link and replaces the form', async () => {
    fetchMock.mockResolvedValue(problem(401, 'authentication-failed'))
    renderAt(`/operator-invitation#token=${TOKEN}`)
    fillValid()
    await submit()

    expect(await screen.findByText(t('operatorInvitation.spent.title'))).toBeTruthy()
    expect(document.querySelector('form')).toBeNull()
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it('marks the username when it is already taken', async () => {
    fetchMock.mockResolvedValue(problem(409, 'resource-conflict'))
    renderAt(`/operator-invitation#token=${TOKEN}`)
    fillValid()
    await submit()

    expect(await screen.findByText(t('operatorInvitation.error.usernameTaken'))).toBeTruthy()
    expect(field('username').getAttribute('aria-invalid')).toBe('true')
  })

  it('maps a field the backend names, and reports a field-less refusal on the form', async () => {
    fetchMock.mockResolvedValueOnce(problem(400, 'validation-failed', { errors: [{ field: 'password', message: 'too weak' }] }))
    renderAt(`/operator-invitation#token=${TOKEN}`)
    fillValid()
    await submit()

    expect(await screen.findByText(t('operatorInvitation.error.passwordRejected'))).toBeTruthy()
    expect(document.body.textContent).not.toContain('too weak')

    fetchMock.mockResolvedValueOnce(problem(400, 'validation-failed'))
    type('password', GOOD_PASSWORD)
    await submit()
    expect(await screen.findByText(t('operatorInvitation.error.rejected'))).toBeTruthy()
  })

  it.each([
    ['rate limiting (429)', () => problem(429, 'rate-limited'), 'identityErrors.rateLimited'],
    ['a server fault (500)', () => problem(500, 'internal-error'), 'identityErrors.service'],
  ])('keeps the form and explains %s', async (_label, failure, key) => {
    fetchMock.mockResolvedValue(failure())
    renderAt(`/operator-invitation#token=${TOKEN}`)
    fillValid()
    await submit()

    expect(await screen.findByText(t(key))).toBeTruthy()
    expect(submitButton().disabled).toBe(false)
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt(`/operator-invitation#token=${TOKEN}`)

    expect(screen.getByRole('heading', { level: 2, name: t('operatorInvitation.title') })).toBeTruthy()
    expect(t('operatorInvitation.title')).not.toBe('Join the Fawtir team')
  })
})
