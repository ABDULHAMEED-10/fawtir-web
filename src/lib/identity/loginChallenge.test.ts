import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dropLoginChallenge,
  holdLoginChallenge,
  readLoginChallenge,
  requestFirstLoginCode,
} from './loginChallenge'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  dropLoginChallenge()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the held challenge', () => {
  it('is kept in memory only, never in web storage', () => {
    sessionStorage.clear()
    localStorage.clear()
    holdLoginChallenge({ token: 'mfa.token', expiresAt: Date.now() + 60_000, factor: 'EMAIL_OTP', state: null })

    expect(readLoginChallenge()?.token).toBe('mfa.token')
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain('mfa.token')
  })

  it('lapses at its expiry', () => {
    holdLoginChallenge({ token: 'mfa.token', expiresAt: 5_000, factor: 'EMAIL_OTP', state: null })
    expect(readLoginChallenge(4_999)?.token).toBe('mfa.token')
    expect(readLoginChallenge(5_000)).toBeNull()
    expect(readLoginChallenge(0)).toBeNull()
  })

  it('can be dropped', () => {
    holdLoginChallenge({ token: 'mfa.token', expiresAt: Date.now() + 60_000, factor: 'EMAIL_OTP', state: null })
    dropLoginChallenge()
    expect(readLoginChallenge()).toBeNull()
  })
})

describe('requestFirstLoginCode', () => {
  it('asks once per challenge however often it is called', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }))
    const challenge = { token: 'mfa.token', expiresAt: Date.now() + 60_000, factor: 'EMAIL_OTP', state: null }

    const [first, second] = await Promise.all([requestFirstLoginCode(challenge), requestFirstLoginCode(challenge)])

    expect(first).toBe(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/auth/mfa/otp/request')
    expect(JSON.parse(init.body as string)).toEqual({ challengeToken: 'mfa.token', factor: 'EMAIL_OTP' })
    expect(init.credentials).toBe('omit')
  })

  it('asks again for a new challenge', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }))
    await requestFirstLoginCode({ token: 'mfa.one', expiresAt: Date.now() + 60_000, factor: 'EMAIL_OTP', state: null })
    await requestFirstLoginCode({ token: 'mfa.two', expiresAt: Date.now() + 60_000, factor: 'EMAIL_OTP', state: null })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('forgets a failed request so a later visit can try again', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 202 }))
    const challenge = { token: 'mfa.token', expiresAt: Date.now() + 60_000, factor: 'EMAIL_OTP', state: null }

    await expect(requestFirstLoginCode(challenge)).rejects.toThrow()
    await expect(requestFirstLoginCode(challenge)).resolves.toEqual(expect.any(Number))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
