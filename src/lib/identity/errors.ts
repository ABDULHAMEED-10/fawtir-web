import { ApiError, NetworkError } from '../../api'

/** An i18n key plus its interpolation values, rendered by the form that shows it. */
export type FormMessage = {
  key: string
  values?: Record<string, number | string>
}

/** Which form field, and which localized message, answers a request field the server named. */
export type ServerFieldMap<F extends string> = ReadonlyMap<string, { field: F; key: string }>

/**
 * Bean Validation names the offending request field, but its `message` is English prose that must
 * not reach an Arabic UI, so each request field maps to a localized key. A named field with no
 * input to attach to comes back as `unattributed`, for the caller to report at form level.
 */
export function mapServerFieldErrors<F extends string>(
  error: ApiError,
  fields: ServerFieldMap<F>,
): { fieldErrors: Partial<Record<F, string>>; unattributed: boolean } {
  const fieldErrors: Partial<Record<F, string>> = {}
  let unattributed = false
  for (const { field } of error.fieldErrors) {
    const target = fields.get(field)
    if (target) fieldErrors[target.field] = target.key
    else unattributed = true
  }
  return { fieldErrors, unattributed }
}

/**
 * The form-level message for failures every identity form reports alike — connectivity,
 * timeouts, rate limiting, server faults — so Login and Recovery reuse it instead of each
 * inventing their own. A flow maps its endpoint-specific answers (a taken username, a wrong
 * code) before falling back to this.
 */
export function commonFailureMessage(error: unknown): FormMessage {
  if (error instanceof NetworkError) {
    return { key: error.reason === 'timeout' ? 'identityErrors.timeout' : 'identityErrors.network' }
  }
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return error.retryAfterSeconds === null
        ? { key: 'identityErrors.rateLimited' }
        : { key: 'identityErrors.rateLimitedFor', values: { seconds: error.retryAfterSeconds } }
    }
    // UP-1: every upload is virus-scanned before it is stored. Both answers say nothing was kept.
    if (error.problemType === 'upload-infected') return { key: 'identityErrors.uploadInfected' }
    if (error.problemType === 'upload-scan-unavailable')
      return { key: 'identityErrors.uploadScanUnavailable' }
    if (error.status >= 500) return { key: 'identityErrors.service' }
    if (error.problemType === 'validation-failed') return { key: 'identityErrors.validation' }
  }
  return { key: 'identityErrors.unexpected' }
}
