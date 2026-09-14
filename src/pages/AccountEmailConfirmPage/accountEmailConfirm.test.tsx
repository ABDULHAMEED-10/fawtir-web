import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, loadEntitlements, peekEntitlements } from '../../lib/identity/entitlements'
import { AccountEmailConfirmPage } from './AccountEmailConfirmPage'

const CONFIRM_URL = '/api/v1/platform/operators/me/email/confirm'
const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const CSRF = 'csrf-token-value'
const CODE = 'fawtir_ec_00000000-0000-0000-0000-000000000001.QUJDREVGR0hJSktMTU5PUFFSU1RVVldY'

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
const problem = (status: number, type: string) =>
  json(status, { type: `https://api.fawtir.om/problems/${type}`, detail: 'Server prose that must not be shown.' })
const applied = () =>
  json(200, {
    tenantId: 't-platform',
    userId: 'u-self',
    username: 'hafidh.ops',
    previousEmail: 'old@example.test',
    newEmail: 'new@example.test',
    alreadyApplied: false,
    revokedSessions: 2,
    invalidatedVerificationTokens: 0,
    emailVerificationRequired: false,
    changedAt: '2026-09-14T10:00:00Z',
    changedBy: 'u-self',
  })

type Handler = () => Response | Promise<Response>
let fetchMock: ReturnType<typeof vi.fn>
function answer(handlers: Record<string, Handler | Handler[]>) {
  const queues = Object.fromEntries(Object.entries(handlers).map(([url, h]) => [url, Array.isArray(h) ? [...h] : h]))
  fetchMock.mockImplementation(async (url: string) => {
    const entry = queues[url]
    const handler = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
    if (!handler) throw new Error(`unexpected request to ${url}`)
    return handler()
  })
}
const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)

function Probe() {
  return <p data-testid="location">{useLocation().pathname}</p>
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account/email/confirm']}>
      <Routes>
        <Route path="/account/email/confirm" element={<AccountEmailConfirmPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}
const t = (key: string, values?: Record<string, string>) => i18n.t(key, values)
const codeInput = () => document.querySelector<HTMLInputElement>('input[name="code"]')!
const confirmButton = () => screen.getByRole('button', { name: t('accountEmail.confirm') }) as HTMLButtonElement
async function confirm(value = CODE) {
  fireEvent.change(codeInput(), { target: { value } })
  await act(async () => {
    fireEvent.click(confirmButton())
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  document.cookie = `FAWTIR_CSRF=${CSRF}; path=/`
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Confirming a new sign-in email', () => {
  it('reads nothing on arrival', () => {
    answer({})
    renderPage()

    expect(screen.getByRole('heading', { name: t('accountEmail.title') })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a blank code before sending anything, and takes focus to it', async () => {
    answer({})
    renderPage()
    await confirm('   ')

    expect(screen.getByText(t('validation.required'))).toBeTruthy()
    expect(document.activeElement).toBe(codeInput())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('confirms with one POST of the trimmed code, then says you are signed out and forgets the session', async () => {
    answer({ [ENTITLEMENTS_URL]: () => json(200, { userId: 'u-self', username: 'hafidh.ops', tenantId: 't', roles: [], permissions: [], scopes: [], featureFlags: {} }), [CONFIRM_URL]: applied })
    await loadEntitlements()
    renderPage()
    await confirm(`  ${CODE} `)

    expect(callsTo(CONFIRM_URL)).toHaveLength(1)
    const init = callsTo(CONFIRM_URL)[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ token: CODE })
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF)
    expect(await screen.findByRole('heading', { name: t('accountEmail.done.title') })).toBeTruthy()
    expect(screen.getByText(t('accountEmail.done.body', { email: 'new@example.test' }))).toBeTruthy()
    expect(screen.getByRole('link', { name: t('accountEmail.done.signIn') }).getAttribute('href')).toBe('/login')
    expect(peekEntitlements()).toBeNull()
  })

  it('sends one request however often it is confirmed while it runs', async () => {
    let release: (response: Response) => void = () => {}
    answer({ [CONFIRM_URL]: () => new Promise<Response>((resolve) => (release = resolve)) })
    renderPage()
    await confirm()
    expect((screen.getByRole('button', { name: t('accountEmail.confirming') }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => {
      fireEvent.submit(codeInput().form!)
      fireEvent.submit(codeInput().form!)
    })

    expect(callsTo(CONFIRM_URL)).toHaveLength(1)
    await act(async () => release(applied()))
    expect(await screen.findByRole('heading', { name: t('accountEmail.done.title') })).toBeTruthy()
  })

  it('keeps you signed in, on the page, when the code itself is refused', async () => {
    answer({ [CONFIRM_URL]: () => problem(401, 'authentication-failed') })
    renderPage()
    await confirm()

    expect(await screen.findByText(t('accountEmail.error.code'))).toBeTruthy()
    expect(document.activeElement).toBe(codeInput())
    expect(screen.queryByTestId('location')).toBeNull()
    expect(document.body.textContent).not.toContain('Server prose')
  })

  it('sends you to sign in when the session itself has ended', async () => {
    answer({ [CONFIRM_URL]: () => problem(401, 'unauthenticated') })
    renderPage()
    await confirm()

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
  })

  it.each([
    ['an account outside the Fawtir team (403)', () => problem(403, 'insufficient-permission'), 'accountEmail.error.notOperator'],
    ['a server fault', () => problem(500, 'internal-error'), 'identityErrors.service'],
    [
      'a lost connection',
      () => {
        throw new TypeError('Failed to fetch')
      },
      'identityErrors.network',
    ],
  ])('explains %s and lets you try again', async (_label, failure, key) => {
    answer({ [CONFIRM_URL]: failure })
    renderPage()
    await confirm()

    expect(await screen.findByText(t(key))).toBeTruthy()
    expect(confirmButton().disabled).toBe(false)
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    answer({})
    renderPage()

    expect(screen.getByRole('heading', { name: t('accountEmail.title') })).toBeTruthy()
    expect(t('accountEmail.title')).toContain('تأكيد')
  })
})
