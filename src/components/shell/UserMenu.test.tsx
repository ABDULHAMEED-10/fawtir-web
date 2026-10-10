import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { dropLoginChallenge, holdLoginChallenge, readLoginChallenge } from '../../lib/identity/loginChallenge'
import { UserMenu } from './UserMenu'

const LOGOUT = '/api/v1/auth/logout'
const CSRF = 'csrf-token-value'

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}
const problem = (status: number, type: string, headers: Record<string, string> = {}) =>
  json(status, { type: `https://api.fawtir.om/problems/${type}`, detail: 'Server prose that must not be shown.' }, headers)

function Probe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}

function renderMenu() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Link to="/elsewhere">Elsewhere</Link>
      <Routes>
        <Route path="/dashboard" element={<UserMenu name="Hafidh Saif" roleKey="shell.user.settings" initials="HS" />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

let fetchMock: ReturnType<typeof vi.fn>
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const signOutItem = () => screen.getByRole('menuitem', { name: new RegExp(`^(${[
  i18n.t('shell.user.signOut'), i18n.t('shell.user.signingOut'), i18n.t('shell.user.signOutFailed'),
].map(escape).join('|')})$`) })
const status = () => screen.getByRole('status')
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Hafidh Saif/ }))
const logoutCalls = () => fetchMock.mock.calls.filter(([url]) => url === LOGOUT)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  sessionStorage.clear()
  localStorage.clear()
  dropLoginChallenge()
  document.cookie = `FAWTIR_CSRF=${CSRF}; path=/`
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Sign out', () => {
  it('keeps the existing menu item and style, and sends nothing until activated', () => {
    renderMenu()
    openMenu()

    const item = signOutItem()
    expect(item.tagName).toBe('A')
    expect(item.getAttribute('href')).toBe('/login')
    expect(item.className).toBe('block px-4 py-2.5 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100')
    expect(item.textContent).toBe(i18n.t('shell.user.signOut'))
    expect(status().textContent).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends one logout carrying the CSRF token, then lands on Login', async () => {
    let release: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)))
    holdLoginChallenge({ token: 'mfa.leftover', expiresAt: Date.now() + 60_000, factor: 'EMAIL_OTP', state: null })
    renderMenu()
    openMenu()
    fireEvent.click(signOutItem())

    expect(signOutItem().textContent).toBe(i18n.t('shell.user.signingOut'))
    expect(signOutItem().getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByTestId('location')).toBeNull()

    await act(async () => release(new Response(null, { status: 204 })))

    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(logoutCalls()).toHaveLength(1)
    const init = logoutCalls()[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('same-origin')
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)
    expect(readLoginChallenge()).toBeNull()
  })

  it('treats an already-dead session (401) as signed out', async () => {
    fetchMock.mockResolvedValue(problem(401, 'session-expired'))
    renderMenu()
    openMenu()
    fireEvent.click(signOutItem())

    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(logoutCalls()).toHaveLength(1)
  })

  it.each([
    ['a CSRF refusal (403)', () => problem(403, 'csrf-rejected')],
    ['rate limiting (429)', () => problem(429, 'rate-limited', { 'Retry-After': '30' })],
    ['a server fault (503)', () => problem(503, 'internal-error')],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('stays put on %s, says so, and retries with exactly one new request', async (_label, respond) => {
    fetchMock.mockImplementationOnce(respond)
    renderMenu()
    openMenu()
    fireEvent.click(signOutItem())

    await waitFor(() => expect(signOutItem().textContent).toBe(i18n.t('shell.user.signOutFailed')))
    expect(status().textContent).toBe(i18n.t('shell.user.signOutFailedStatus'))
    expect(screen.queryByTestId('location')).toBeNull()
    expect(signOutItem().getAttribute('aria-disabled')).toBeNull()
    expect(document.body.textContent).not.toContain('Server prose')
    expect(logoutCalls()).toHaveLength(1)

    let release: (response: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)))
    fireEvent.click(signOutItem())

    expect(logoutCalls()).toHaveLength(2)
    expect(signOutItem().textContent).toBe(i18n.t('shell.user.signingOut'))
    expect(status().textContent).toBe('')

    await act(async () => release(new Response(null, { status: 204 })))
    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(logoutCalls()).toHaveLength(2)
  })

  it('stays put when the request times out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    )
    renderMenu()
    openMenu()
    fireEvent.click(signOutItem())

    await act(async () => vi.advanceTimersByTimeAsync(30_000))

    expect(signOutItem().textContent).toBe(i18n.t('shell.user.signOutFailed'))
    expect(screen.queryByTestId('location')).toBeNull()
    expect(logoutCalls()).toHaveLength(1)
  })

  it('sends one request however often it is activated, by mouse or keyboard', async () => {
    let release: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)))
    renderMenu()
    openMenu()
    const user = userEvent.setup({ delay: null })

    await user.dblClick(signOutItem())
    signOutItem().focus()
    await user.keyboard('{Enter}{Enter}')

    expect(logoutCalls()).toHaveLength(1)
    await act(async () => release(new Response(null, { status: 204 })))
    expect((await screen.findByTestId('location')).textContent).toBe('/login')
  })

  it('finishes a sign-out the user walked away from, and still lands on Login', async () => {
    let release: (response: Response) => void = () => {}
    // Rejects on abort, as a real fetch does, so cancelling on unmount would fail this test.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          release = resolve
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    renderMenu()
    openMenu()
    fireEvent.click(signOutItem())

    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }))
    expect((await screen.findByTestId('location')).textContent).toBe('/elsewhere')

    await act(async () => release(new Response(null, { status: 204 })))
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
    expect(logoutCalls()).toHaveLength(1)
  })

  it('signs out from the keyboard alone', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    renderMenu()
    openMenu()
    signOutItem().focus()
    await userEvent.setup({ delay: null }).keyboard('{Enter}')

    expect((await screen.findByTestId('location')).textContent).toBe('/login')
    expect(logoutCalls()).toHaveLength(1)
  })

  it('never writes a cookie, never touches storage, and logs nothing', async () => {
    const cookieWrites = vi.spyOn(Document.prototype, 'cookie', 'set')
    const consoleCalls = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level))
    fetchMock.mockResolvedValueOnce(problem(503, 'internal-error'))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    renderMenu()
    openMenu()
    fireEvent.click(signOutItem())
    await waitFor(() => expect(signOutItem().textContent).toBe(i18n.t('shell.user.signOutFailed')))
    fireEvent.click(signOutItem())
    await screen.findByTestId('location')

    expect(cookieWrites).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
    for (const spy of consoleCalls) expect(JSON.stringify(spy.mock.calls)).not.toContain(CSRF)
  })

  it('speaks Arabic', async () => {
    await i18n.changeLanguage('ar')
    fetchMock.mockResolvedValue(problem(403, 'csrf-rejected'))
    renderMenu()
    openMenu()
    expect(signOutItem().textContent).toBe('تسجيل الخروج')
    fireEvent.click(signOutItem())

    await waitFor(() => expect(signOutItem().textContent).toBe('تعذّر الخروج. أعد المحاولة'))
    expect(status().textContent).toBe('تعذّر تسجيل الخروج. ما زالت جلستك نشطة — حاول مرة أخرى.')
    expect(signOutItem().textContent).not.toMatch(/[A-Za-z]/)
  })
})

describe('Entries one shell adds', () => {
  it('lists them after the shared entries and before signing out, reading nothing', () => {
    render(
      <MemoryRouter initialEntries={['/console']}>
        <UserMenu
          name="Hafidh Saif"
          roleKey="console.user.team"
          initials="HS"
          extraItems={[{ id: 'confirmEmail', labelKey: 'console.user.confirmEmail', to: '/account/email/confirm' }]}
        />
      </MemoryRouter>,
    )
    openMenu()

    const items = screen.getAllByRole('menuitem')
    const confirm = screen.getByRole('menuitem', { name: i18n.t('console.user.confirmEmail') })
    expect(confirm.getAttribute('href')).toBe('/account/email/confirm')
    expect(items.indexOf(confirm)).toBe(items.length - 2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is absent where no entry is added', () => {
    renderMenu()
    openMenu()

    expect(screen.queryByRole('menuitem', { name: i18n.t('console.user.confirmEmail') })).toBeNull()
  })
})

describe('UserMenu avatar and entries', () => {
  it('draws the initials it is given instead of a shared photo, and offers no Profile entry', () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: /Hafidh Saif/ })
    expect(trigger.querySelector('img[src*="avatar"]')).toBeNull()
    expect(trigger.textContent).toContain('HS')
    openMenu()
    expect(screen.queryByRole('menuitem', { name: /profile/i })).toBeNull()
    expect(screen.getByRole('menuitem', { name: i18n.t('shell.user.settings') })).toBeTruthy()
  })
})
