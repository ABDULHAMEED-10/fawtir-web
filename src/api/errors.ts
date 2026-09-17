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
    code: stringOf(problem.code) ?? stringOf(problem.error),
    correlationId: stringOf(problem.correlationId) ?? stringOf(problem.trace_id),
    problem,
  })
}
