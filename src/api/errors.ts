/**
 * The two ways a request can fail, kept as distinct types so callers branch on
 * structure rather than on message text.
 */

export type ProblemFieldError = {
  field: string
  message: string
  /** The rule a customer or supplier field broke (`REQUIRED`, `INVALID_FORMAT`, …), when the server names one. */
  code?: string
}

/**
 * The server answered with a non-2xx status.
 *
 * Fawtir answers failures with RFC 7807 problem documents whose `type` ends in
 * a stable slug (`validation-failed`, `resource-conflict`, `rate-limited`, …).
 * The slug is what callers branch on: the status alone is too coarse, and the
 * `detail` sentence is English prose that must never be matched against or
 * shown in a localized UI.
 */
export class ApiError extends Error {
  readonly status: number
  /** Last segment of the problem `type` URI, or `null` when the body was not a problem document. */
  readonly problemType: string | null
  readonly fieldErrors: readonly ProblemFieldError[]
  readonly retryAfterSeconds: number | null
  /**
   * The module's own refusal code, when it sends one. The invoice handler calls it `code`, the
   * Expenditure and submission handlers `error`; this is whichever arrived.
   */
  readonly code: string | null
  /** What support needs to find the request in the logs (`correlationId`, or Expenditure's `trace_id`). */
  readonly correlationId: string | null
  /** The problem document as it arrived, for the few refusals that carry more than a code (a bill's `duplicateOf`). */
  readonly problem: Readonly<Record<string, unknown>>

  constructor(init: {
    status: number
    problemType: string | null
    fieldErrors?: readonly ProblemFieldError[]
    retryAfterSeconds?: number | null
    code?: string | null
    correlationId?: string | null
    problem?: Record<string, unknown>
  }) {
    super(`Request failed with status ${init.status}`)
    this.name = 'ApiError'
    this.status = init.status
    this.problemType = init.problemType
    this.fieldErrors = init.fieldErrors ?? []
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
    this.code = init.code ?? null
    this.correlationId = init.correlationId ?? null
    this.problem = init.problem ?? {}
  }
}

/** The server's refusal codes are upper-case identifiers; a reason phrase is not one. */
const SERVER_CODE = /^[A-Z][A-Z0-9_]+$/

/**
 * The server's own refusal code, or null (review W5-1). Since the W5-SHARED audit `toApiError`
 * no longer takes a reason phrase from `error`, so this differs from `code` only for a `code`
 * member that is not an identifier; the callers that act on "no code" keep using it.
 */
export function serverCode(error: ApiError): string | null {
  return error.code !== null && SERVER_CODE.test(error.code) ? error.code : null
}

export type NetworkFailureReason = 'offline' | 'timeout'

/**
 * The request never produced a server answer. Separate from {@link ApiError}
 * because the advice to the user differs: nothing they typed is wrong.
 */
export class NetworkError extends Error {
  readonly reason: NetworkFailureReason

  constructor(reason: NetworkFailureReason, options?: { cause?: unknown }) {
    super(reason === 'timeout' ? 'The request timed out.' : 'The request could not reach the server.')
    this.name = 'NetworkError'
    this.reason = reason
    this.cause = options?.cause
  }
}

function problemTypeOf(type: unknown): string | null {
  if (typeof type !== 'string') return null
  const slug = type.replace(/\/+$/, '').split('/').pop()
  return slug ? slug : null
}

function fieldErrorsOf(errors: unknown): ProblemFieldError[] {
  if (!Array.isArray(errors)) return []
  return errors.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { field, message, code } = entry as Record<string, unknown>
    if (typeof field !== 'string' || typeof message !== 'string') return []
    return typeof code === 'string' ? [{ field, message, code }] : [{ field, message }]
  })
}

function codeOf(value: unknown): string | null {
  const text = stringOf(value)
  return text !== null && SERVER_CODE.test(text) ? text : null
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function retryAfterOf(headers: Headers): number | null {
  const seconds = Number.parseInt(headers.get('Retry-After') ?? '', 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

export function toApiError(response: Response, body: unknown): ApiError {
  const problem = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  return new ApiError({
    status: response.status,
    problemType: problemTypeOf(problem.type),
    fieldErrors: fieldErrorsOf(problem.errors),
    retryAfterSeconds: retryAfterOf(response.headers),
    // The Expenditure handlers put their code in `error`, but so does every Spring or gateway
    // default body, as a reason phrase ("Payload Too Large", "Not Found"). A phrase there is no
    // code: taken as one, it defeated each caller's "no code" branch, such as the bill upload's
    // 413 and the till's missing-route check (W5-SHARED audit). `code` itself is kept as sent.
    code: stringOf(problem.code) ?? codeOf(problem.error),
    correlationId: stringOf(problem.correlationId) ?? stringOf(problem.trace_id),
    problem,
  })
}
