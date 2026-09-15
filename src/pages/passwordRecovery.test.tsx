import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../i18n'
import { readResetToken } from '../lib/identity/recovery'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { NewPasswordPage } from './NewPasswordPage'

const FORGOT = '/api/v1/auth/forgot-password'
const RESET = '/api/v1/auth/reset-password'
const TOKEN = 'fawtir_pr_4f5b7a1e-0000-4000-8000-000000000001.QUJDREVGR0hJSktMTU5PUA'
const STRONG = 'AnotherStrong@456'

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function Probe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.hash}</p>
}

function renderAt(entry: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/new-password" element={<><NewPasswordPage /><Probe /></>} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

let fetchMock: ReturnType<typeof vi.fn>
const calls = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url)
const bodyOf = (url: string, index = 0) => JSON.parse(calls(url)[index][1].body as string) as Record<string, unknown>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Forgot password', () => {
  it('asks for the username, sends it without cookies, and never says whether the account exists', async () => {
    fetchMock.mockResolvedValue(json(202))
    renderAt('/forgot-password')

    await userEvent.type(screen.getByLabelText(/Username/), '  layla.accounts ')
    await userEvent.click(screen.getByRole('button', { name: /Send reset link/ }))

    expect(await screen.findByText('Check your email')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('If layla.accounts is a Fawtir account')
    expect(calls(FORGOT)).toHaveLength(1)
    expect(bodyOf(FORGOT)).toEqual({ username: 'layla.accounts' })
    expect(calls(FORGOT)[0][1].credentials).toBe('omit')
    // A second link cannot replace the first one for a minute.
    expect((screen.getByRole('button', { name: /Send another link in/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('refuses an empty username without asking the server', async () => {
    renderAt('/forgot-password')
    await userEvent.click(screen.getByRole('button', { name: /Send reset link/ }))
    expect(await screen.findByText('This field is required')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains a rate limit and stays on the form', async () => {
    fetchMock.mockResolvedValue(
      json(429, { type: 'https://api.fawtir.om/problems/rate-limited' }, { 'Retry-After': '40' }),
    )
    renderAt('/forgot-password')
    await userEvent.type(screen.getByLabelText(/Username/), 'layla.accounts')
    await userEvent.click(screen.getByRole('button', { name: /Send reset link/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('40 seconds')
    expect(screen.queryByText('Check your email')).toBeNull()
  })

  it('says when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    renderAt('/forgot-password')
    await userEvent.type(screen.getByLabelText(/Username/), 'layla.accounts')
    await userEvent.click(screen.getByRole('button', { name: /Send reset link/ }))
    expect((await screen.findByRole('alert')).textContent).toContain("couldn't reach Fawtir")
  })
})

describe('New password (from the emailed link)', () => {
  const choose = async (password = STRONG, confirm = password) => {
    await userEvent.type(screen.getByLabelText(/^New password/), password)
    await userEvent.type(screen.getByLabelText(/^Confirm Password/), confirm)
    await userEvent.click(screen.getByRole('button', { name: /Save new password/ }))
  }

  it('without a link, sends the reader to ask for one', async () => {
    renderAt('/new-password')
    expect(await screen.findByText('Open the link from your email')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Request a new link' }))
    expect(await screen.findByText('Forgot your password?')).toBeTruthy()
  })

  it('reads the token from the link, drops it from the address bar, and sets the password', async () => {
    fetchMock.mockResolvedValue(json(204))
    renderAt(`/new-password#token=${encodeURIComponent(TOKEN)}`)

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/new-password'))
    await choose()

    expect(await screen.findByText('Password changed')).toBeTruthy()
    expect(bodyOf(RESET)).toEqual({ token: TOKEN, newPassword: STRONG })
    expect(calls(RESET)[0][1].credentials).toBe('omit')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'))
  })

  it('a used or expired link says so and offers a new one', async () => {
    fetchMock.mockResolvedValue(json(401, { type: 'https://api.fawtir.om/problems/authentication-failed' }))
    renderAt(`/new-password#token=${TOKEN}`)
    await choose()
    expect((await screen.findByRole('alert')).textContent).toContain('expired, has already been used')
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeTruthy()
  })

  it('a password the server refuses keeps the form, with the reason', async () => {
    fetchMock.mockResolvedValue(json(400, { type: 'https://api.fawtir.om/problems/validation-failed' }))
    renderAt(`/new-password#token=${TOKEN}`)
    await choose()
    expect((await screen.findByRole('alert')).textContent).toContain("can't be used")
    expect(screen.getByLabelText(/^New password/)).toBeTruthy()
  })

  it('checks the two passwords match before sending anything', async () => {
    renderAt(`/new-password#token=${TOKEN}`)
    await choose(STRONG, 'Different@4567')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('readResetToken', () => {
  it('takes the token from the fragment, decoded, and nothing else', () => {
    expect(readResetToken(`#token=${encodeURIComponent(TOKEN)}`)).toBe(TOKEN)
    expect(readResetToken('')).toBeNull()
    expect(readResetToken('#token=')).toBeNull()
    expect(readResetToken('#other=1')).toBeNull()
  })
})
