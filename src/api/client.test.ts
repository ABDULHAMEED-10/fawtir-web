import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiDownload, apiRequest } from './client'
import { ApiError, NetworkError } from './errors'

function problem(status: number, body: object, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

/** A fetch that never answers, and rejects only when its signal aborts — as the real one does. */
function hangingFetch() {
  return vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        )
      }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('apiRequest', () => {
  it('sends JSON under /api and resolves with the parsed body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiRequest('/v1/thing', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: true })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/thing')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('parses a problem document into an ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        problem(400, {
          type: 'https://api.fawtir.om/problems/validation-failed',
          detail: 'One or more request fields are invalid.',
          errors: [{ field: 'username', message: 'Username must be 3 to 64 characters' }, { bogus: 1 }],
        }),
      ),
    )

    const error = await apiRequest('/v1/thing').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      problemType: 'validation-failed',
      fieldErrors: [{ field: 'username', message: 'Username must be 3 to 64 characters' }],
      retryAfterSeconds: null,
    })
  })

  it('reads Retry-After on a 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        problem(429, { type: 'https://api.fawtir.om/problems/rate-limited' }, { 'Retry-After': '42' }),
      ),
    )

    await expect(apiRequest('/v1/thing')).rejects.toMatchObject({
      status: 429,
      problemType: 'rate-limited',
      retryAfterSeconds: 42,
    })
  })

  it('reports a non-problem failure body without inventing a problem type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })))

    await expect(apiRequest('/v1/thing')).rejects.toMatchObject({ status: 502, problemType: null })
  })

  it('turns a failed connection into an offline NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))

    const error = await apiRequest('/v1/thing').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(NetworkError)
    expect(error).toMatchObject({ reason: 'offline' })
  })

  it('turns an unanswered request into a timeout NetworkError', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())

    const assertion = expect(apiRequest('/v1/thing', { timeoutMs: 1_000 })).rejects.toMatchObject({
      name: 'NetworkError',
      reason: 'timeout',
    })
    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
  })

  describe('CSRF double-submit header', () => {
    const setCsrfCookie = (value: string) => (document.cookie = `FAWTIR_CSRF=${value}; path=/`)
    const headersOf = (fetchMock: ReturnType<typeof vi.fn>) =>
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>

    afterEach(() => {
      document.cookie = 'FAWTIR_CSRF=; path=/; max-age=0'
      document.cookie = 'OTHER=; path=/; max-age=0'
    })

    it('echoes the readable CSRF cookie on a state-changing request that sends cookies', async () => {
      document.cookie = 'OTHER=x; path=/'
      setCsrfCookie('csrf-value_1')
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)

      await apiRequest('/v1/auth/logout', { method: 'POST', credentials: 'same-origin' })

      expect(headersOf(fetchMock)['X-CSRF-Token']).toBe('csrf-value_1')
    })

    it.each([
      ['a GET', { method: 'GET' as const }],
      ['a request that sends no cookies', { method: 'POST' as const, credentials: 'omit' as const }],
    ])('leaves it off %s', async (_label, options) => {
      setCsrfCookie('csrf-value_1')
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)

      await apiRequest('/v1/thing', options)

      expect(headersOf(fetchMock)).not.toHaveProperty('X-CSRF-Token')
    })

    it('sends no header when there is no CSRF cookie, and never writes one', async () => {
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)

      await apiRequest('/v1/thing', { method: 'POST' })

      expect(headersOf(fetchMock)).not.toHaveProperty('X-CSRF-Token')
      expect(document.cookie).not.toContain('FAWTIR_CSRF')
    })
  })

  it("rethrows the caller's own abort rather than reporting a network failure", async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const controller = new AbortController()

    const pending = apiRequest('/v1/thing', { signal: controller.signal }).catch((caught: unknown) => caught)
    controller.abort()

    const error = await pending
    expect(error).not.toBeInstanceOf(NetworkError)
    expect(error).toMatchObject({ name: 'AbortError' })
  })
})

describe('apiDownload', () => {
  it('resolves with the bytes and the name the server gave the file', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('Type,Name\nBUSINESS,Qalhat\n', {
          status: 200,
          headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="fawtir-customers.csv"' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const file = await apiDownload('/v1/customers/export')

    expect(file.filename).toBe('fawtir-customers.csv')
    expect(await file.blob.text()).toBe('Type,Name\nBUSINESS,Qalhat\n')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/customers/export')
    expect((init.headers as Record<string, string>).Accept).toBe('*/*')
  })

  it('rejects a refused download as the same ApiError a JSON request gets', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => problem(403, { type: 'https://api.fawtir.om/problems/insufficient-permission', status: 403 })),
    )
    const error = await apiDownload('/v1/customers/export').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 403 })
  })
})
