import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { signOut } from './logout'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const problem = (status: number, type: string) =>
  new Response(JSON.stringify({ type: `https://api.fawtir.om/problems/${type}` }), { status })

describe('signOut', () => {
  it('posts once to the logout endpoint with cookies and no body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(signOut()).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/auth/logout')
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(init.credentials).toBe('same-origin')
  })

  it('treats a 401 as already signed out', async () => {
    fetchMock.mockResolvedValue(problem(401, 'authentication-failed'))
    await expect(signOut()).resolves.toBeUndefined()
  })

  it.each([
    ['a CSRF refusal', () => problem(403, 'csrf-rejected'), ApiError],
    ['rate limiting', () => problem(429, 'rate-limited'), ApiError],
    ['a server fault', () => problem(503, 'internal-error'), ApiError],
    ['a lost connection', () => Promise.reject(new TypeError('Failed to fetch')), NetworkError],
  ])('rejects on %s, because the session may still be alive', async (_label, respond, type) => {
    fetchMock.mockImplementation(respond)
    await expect(signOut()).rejects.toBeInstanceOf(type)
  })
})
