import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { COMPANY_INVITATION_ROUTE } from '../../lib/identity/operatorInvitation'
import { CompanyInvitationPage } from './CompanyInvitationPage'

const ACCEPT_URL = '/api/v1/auth/invitations/accept'
const TOKEN = 'fawtir_inv_00000000-0000-4000-8000-000000000002.abcDEF123_-xyz'
const GOOD_PASSWORD = 'Str0ng!Passw0rd#'
const t = (key: string) => i18n.t(key)

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
const calls = () => fetchMock.mock.calls.filter(([url]) => url === ACCEPT_URL)

function HashProbe() {
  const location = useLocation()
  return <p data-testid="hash">{location.hash}</p>
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path={COMPANY_INVITATION_ROUTE}
          element={
            <>
              <CompanyInvitationPage />
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

async function fillAndSubmit() {
  type('username', 'layla.accounts')
  type('password', GOOD_PASSWORD)
  type('confirmPassword', GOOD_PASSWORD)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: t('operatorInvitation.submit') }))
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Company invitation page', () => {
  it('is the route the backend link names', () => {
    expect(COMPANY_INVITATION_ROUTE).toBe('/invitation')
  })

  it('speaks to a company user, not an operator, and removes the token from the address', async () => {
    renderAt(`/invitation#token=${encodeURIComponent(TOKEN)}`)

    expect(
      screen.getByRole('heading', { level: 2, name: t('companyInvitation.title') }),
    ).toBeTruthy()
    expect(document.body.textContent).not.toContain(t('operatorInvitation.title'))
    await waitFor(() => expect(screen.getByTestId('hash').textContent).toBe(''))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says the link is incomplete when it carries no token', () => {
    renderAt('/invitation')

    expect(screen.getByText(t('companyInvitation.missing.title'))).toBeTruthy()
    expect(document.querySelector('form')).toBeNull()
  })

  it('accepts through the one invitation endpoint, without cookies, and offers sign-in in company words', async () => {
    fetchMock.mockResolvedValue(
      json(201, { id: 'u-new', username: 'layla.accounts', roles: ['ACCOUNTANT'] }),
    )
    renderAt(`/invitation#token=${encodeURIComponent(TOKEN)}`)
    await fillAndSubmit()

    expect(await screen.findByText(t('companyInvitation.done.body'))).toBeTruthy()
    expect(document.body.textContent).not.toContain(t('operatorInvitation.done.body'))
    expect(calls()).toHaveLength(1)
    const init = calls()[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(init.body as string)).toEqual({
      token: TOKEN,
      username: 'layla.accounts',
      password: GOOD_PASSWORD,
    })
    expect(
      screen.getByRole('link', { name: t('operatorInvitation.done.signIn') }).getAttribute('href'),
    ).toBe('/login')
  })

  it('tells the invitee to ask their administrator when the link is spent', async () => {
    fetchMock.mockResolvedValue(
      json(401, { type: 'https://api.fawtir.om/problems/authentication-failed' }),
    )
    renderAt(`/invitation#token=${TOKEN}`)
    await fillAndSubmit()

    expect(await screen.findByText(t('companyInvitation.spent.body'))).toBeTruthy()
    expect(document.querySelector('form')).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt(`/invitation#token=${TOKEN}`)

    expect(
      screen.getByRole('heading', { level: 2, name: t('companyInvitation.title') }),
    ).toBeTruthy()
    expect(t('companyInvitation.title')).not.toBe('Join your company on Fawtir')
  })
})
