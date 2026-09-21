import { ApiError } from '../api'
import { commonFailureMessage, type FormMessage } from './identity/errors'
import { refusalMessageKey } from './expenditureRefusals'

/**
 * The localized sentence for a failed customer-app request, and the reference support needs.
 *
 * Branches on the problem `type` slug, never on the `detail` text, which is English only and must
 * never reach an Arabic screen. A screen that knows an endpoint-specific refusal (a module `code`
 * such as `REFERENCE_CATALOGUE_NOT_AVAILABLE`) maps it first and falls back to this.
 */
export function describeApiFailure(error: unknown): FormMessage & { reference: string | null } {
  const reference = error instanceof ApiError ? error.correlationId : null
  if (error instanceof ApiError) {
    // Before any status branch: a refusal is a decision the server made by name, and saying
    // "try again" about one is wrong advice, not merely a vague message.
    const refusal = refusalMessageKey(error)
    if (refusal !== null) return { key: refusal, reference }
    if (error.status === 403) {
      return { key: error.problemType === 'csrf-rejected' ? 'apiErrors.csrf' : 'apiErrors.forbidden', reference }
    }
    if (error.status === 404) return { key: 'apiErrors.notFound', reference }
    if (error.status === 409) return { key: 'apiErrors.conflict', reference }
  }
  return { ...commonFailureMessage(error), reference }
}

/** A refusal the server makes on permission grounds, as opposed to a CSRF or gateway 403. */
export function isPermissionDenied(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403 && error.problemType !== 'csrf-rejected'
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}
