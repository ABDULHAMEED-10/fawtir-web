import { ApiError, NetworkError, toApiError } from './errors'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

/**
 * Without a ceiling a stalled connection leaves a form in its submitting state
 * forever. Thirty seconds is generous for an Argon2 hash plus a database write.
 */
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Double-submit CSRF (`PortalCsrfFilter`): a state-changing request that the portal session cookie
 * authenticates is refused with `403` unless it echoes this readable cookie in this header. Only
 * read, never written — the server issues and clears it with the session.
 */
const CSRF_COOKIE = 'FAWTIR_CSRF'
const CSRF_HEADER = 'X-CSRF-Token'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  for (const entry of document.cookie.split(';')) {
    const separator = entry.indexOf('=')
    if (separator !== -1 && entry.slice(0, separator).trim() === name) return entry.slice(separator + 1).trim()
  }
  return null
}

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Sent as JSON, or as-is when it is `FormData` (a file upload). */
  body?: unknown
  /** Aborting it rejects with the caller's own abort reason, never a {@link NetworkError}. */
  signal?: AbortSignal
  timeoutMs?: number
  credentials?: RequestCredentials
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Sends one JSON request and resolves with the parsed body.
 *
 * Rejects with {@link ApiError} when the server answered with a failure status
 * and {@link NetworkError} when it did not answer at all, so callers never read
 * `response.status` or error messages themselves.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS, credentials } = options

  // One controller carries both the caller's abort and the timeout, and the
  // `timedOut` flag — not the rejection's error name, which differs between
  // runtimes — is what tells the two apart afterwards.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const forwardAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) forwardAbort()
  else signal?.addEventListener('abort', forwardAbort, { once: true })

  const headers: Record<string, string> = { Accept: 'application/json, application/problem+json' }
  // A multipart body sets no Content-Type here: the browser must write it, because only the
  // browser knows the boundary it chose.
  const multipart = body instanceof FormData
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json'
  // Not for `omit`: a request that sends no cookies has no session to protect, and the token
  // should not travel where it proves nothing.
  if (method !== 'GET' && credentials !== 'omit') {
    const csrfToken = readCookie(CSRF_COOKIE)
    if (csrfToken) headers[CSRF_HEADER] = csrfToken
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      signal: controller.signal,
      credentials,
    })
    const payload = await readBody(response)
    if (!response.ok) throw toApiError(response, payload)
    return payload as T
  } catch (cause) {
    if (cause instanceof ApiError) throw cause
    if (timedOut) throw new NetworkError('timeout', { cause })
    if (signal?.aborted) throw cause
    throw new NetworkError('offline', { cause })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
