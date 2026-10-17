import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'

/**
 * "Count received documents" for one plan (`PlatformReceivedDocumentCountingController`): whether
 * supplier documents received use the plan's allowance. On by default; a change applies to each
 * company on the plan from its next subscription date, never mid-month, and needs a reason.
 * Reading needs `platform.plans.read`, changing `platform.plans.manage`; the backend also requires
 * MFA, the production platform realm and no impersonation.
 */
export const RECEIVED_COUNTING_REASON_MAX = 500

export const planCountingPath = (code: string) =>
  `/v1/platform/plans/${encodeURIComponent(code)}/received-document-counting`

export type PlanCountingChange = {
  id: string
  planCode: string
  version: number
  countsReceived: boolean
  reason: string
  createdBy: string
  createdAt: string
}

/** `version` is 0 before the first change and is the `If-Match` of the next one. */
export type PlanCounting = {
  planCode: string
  version: number
  countsReceived: boolean
  history: PlanCountingChange[]
}

export function savePlanCounting(
  code: string,
  version: number,
  countsReceived: boolean,
  reason: string,
): Promise<PlanCounting> {
  return apiRequest<PlanCounting>(planCountingPath(code), {
    method: 'PUT',
    headers: { 'If-Match': `"${version}"` },
    body: { countsReceived, reason },
    credentials: 'same-origin',
  })
}

/** The refusal in words; the server's own `detail` is never shown. */
export function describeCountingFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.problemType === 'received-counting-version-conflict') {
      return { key: 'console.plans.counting.refusal.conflict' }
    }
    if (error.problemType === 'production-platform-realm-required') {
      return { key: 'console.billingSettings.refusal.realm' }
    }
    if (error.problemType === 'impersonation-not-allowed') {
      return { key: 'console.billingSettings.refusal.impersonation' }
    }
    if (error.status === 403) return { key: 'console.billing.refusal.forbidden' }
    if (error.status === 404) return { key: 'console.plans.counting.refusal.gone' }
    if (error.status === 400) return { key: 'console.plans.counting.refusal.invalid' }
  }
  return commonFailureMessage(error)
}

export const isCountingConflict = (error: unknown) =>
  error instanceof ApiError && error.problemType === 'received-counting-version-conflict'
