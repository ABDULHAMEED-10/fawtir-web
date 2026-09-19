import { API_BASE_URL } from '../config/api'
import { ApiError, NetworkError, toApiError } from './errors'

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
  /** Request headers the call needs beyond the defaults, such as `Idempotency-Key`. */
  headers?: Record<string, string>
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
  return send(path, options, 'application/json, application/problem+json', async (response) => {
    const payload = await readBody(response)
    if (!response.ok) throw toApiError(response, payload)
    return payload as T
  })
}

export type ApiDownload = {
  blob: Blob
  /** From `Content-Disposition`, or `null` when the server named none or the header was not exposed. */
  filename: string | null
  headers: Headers
}

/**
 * A file (an export, a PDF): resolves with its bytes and name. Usually a GET; a POST when making
 * the file changes state, as a payment run's bank file does. Failures reject exactly as
 * {@link apiRequest} does, because a refused export answers with a problem document, not a file.
 */
export async function apiDownload(
  path: string,
  options: Pick<ApiRequestOptions, 'signal' | 'timeoutMs' | 'method'> = {},
): Promise<ApiDownload> {
  return send(path, options, '*/*', async (response) => {
    if (!response.ok) throw toApiError(response, await readBody(response))
    return {
      blob: await response.blob(),
      filename: filenameOf(response.headers.get('Content-Disposition')),
      headers: response.headers,
    }
  })
}

function filenameOf(disposition: string | null): string | null {
  const match = disposition ? /filename="?([^";]+)"?/i.exec(disposition) : null
  return match ? match[1] : null
}

async function send<T>(
  path: string,
  options: ApiRequestOptions,
  accept: string,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS, credentials, headers: extra } = options

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

  const headers: Record<string, string> = { Accept: accept, ...extra }
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
    return await read(response)
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
