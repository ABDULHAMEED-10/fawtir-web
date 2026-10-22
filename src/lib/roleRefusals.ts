import { ApiError } from '../api'
import { describeApiFailure } from './apiFailure'
import type { FormMessage } from './identity/errors'

/**
 * Our own sentence for each refusal the role maker and the delete dialog can meet, by the problem
 * `type` slug and the status, never by the server's English `detail`.
 *
 * TODO(backend): SETTINGS.md row 8.5. "Someone holds this role" and "a role with this code exists"
 * both answer a bare 409 `resource-conflict`, and "a built-in role can't be changed" a bare 403
 * `insufficient-permission`, so they are told apart by which request was refused.
 */
export function roleSaveRefusal(error: unknown, editing: boolean): FormMessage {
  if (error instanceof ApiError) {
    if (error.problemType === 'reserved-permission') return { key: 'roles.refusal.reservedPermission' }
    if (error.status === 403 && error.problemType === 'insufficient-permission') {
      return { key: editing ? 'roles.refusal.cantChange' : 'roles.refusal.cantMake' }
    }
    if (error.status === 409 && error.problemType === 'resource-conflict' && !editing) {
      return { key: 'roles.refusal.duplicate' }
    }
    if (error.status === 404) return { key: 'roles.refusal.gone' }
    if (error.status === 400 && error.problemType === 'validation-failed') return { key: 'roles.refusal.invalid' }
  }
  return describeApiFailure(error)
}

export function roleDeleteRefusal(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.problemType === 'resource-conflict') return { key: 'roles.refusal.inUse' }
    if (error.status === 403 && error.problemType === 'insufficient-permission') {
      return { key: 'roles.refusal.cantDelete' }
    }
    if (error.status === 404) return { key: 'roles.refusal.gone' }
  }
  return describeApiFailure(error)
}
