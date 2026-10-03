import { ApiError } from '../../api'

/**
 * The correlation id of a refused request, which is all an operator can usefully quote to support:
 * the problem's `detail` is English prose for the logs and is never shown, so without this a
 * refusal on screen could not be tied to the request that caused it.
 */
export function problemReference(error: unknown): string | null {
  return error instanceof ApiError ? error.correlationId : null
}
