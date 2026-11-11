import { ApiError } from '../api'
import { commonFailureMessage, type FormMessage } from './identity/errors'
import { refusalMessageKey, refusalMessageValues } from './expenditureRefusals'
import { selfBillingMessageKey } from './selfBillingRefusals'
import { subscriptionRestrictedMessageKey } from './subscriptionRestricted'
import { PLAN_FEATURE_NOT_INCLUDED, planFeatureMessageKey } from './planFeatureRefusal'
import { salesApprovalMessageKey } from './salesApproval'
import { taxReasonRefusalKey } from './taxReasonRefusals'
import { debitNoteRefusalKey } from './debitNoteRefusals'
import { refusalValues } from './posRefusals'

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
    // First: a read-only subscription answers 409, and the conflict sentence's "reload and try
    // again" can never work for it; paying or choosing a plan is the way forward.
    const subscription = subscriptionRestrictedMessageKey(error)
    if (subscription !== null) return { key: subscription, reference }
    // A plan without the feature answers 403 (PL-8): the plan is the way forward, never an
    // administrator, so it is worded before the permission sentence.
    const plan = planFeatureMessageKey(error)
    if (plan !== null) return { key: plan, reference }
    // Before any status branch: a refusal is a decision the server made by name, and saying
    // "try again" about one is wrong advice, not merely a vague message.
    const refusal = refusalMessageKey(error)
    if (refusal !== null) {
      const values = refusalMessageValues(error)
      return values ? { key: refusal, values, reference } : { key: refusal, reference }
    }
    // A line's no-VAT reason: answered 400 by code, which would otherwise read "check the form".
    const taxReason = taxReasonRefusalKey(error)
    if (taxReason !== null) return { key: taxReason, reference }
    // D-26 answers 409 by name: "reload and try again" can never unlock an issued debit note.
    const debitNote = debitNoteRefusalKey(error)
    if (debitNote !== null) return { key: debitNote, reference }
    // Before the 409 branch on purpose: seven self-billing refusals answer Conflict, and telling
    // someone with no agreement to "reload to see the latest version" is false, not merely vague.
    const selfBilling = selfBillingMessageKey(error)
    if (selfBilling !== null) return { key: selfBilling, reference }
    // Sales approval (RL-6) answers 409 and 403 by name: issuing a draft that waits on approval
    // from any screen (composer, bulk upload, detail) says why, not "reload".
    const salesApproval = salesApprovalMessageKey(error)
    if (salesApproval !== null) return { key: salesApproval, reference }
    // A discount above the person's `invoice.draft` ceiling (draft create and replace, schedule
    // templates). From RC3 (#841) the 403 names it and both figures; "ask for permission" was wrong
    // advice, since the person may draft, just not that deep. b48e85031 sends no code, so it keeps
    // the permission sentence below.
    if (error.status === 403 && error.code === 'DISCOUNT_ABOVE_LIMIT') {
      const { requestedPercent, limitPercent } = refusalValues(error)
      if (requestedPercent && limitPercent) {
        return {
          key: 'apiErrors.discountAboveLimit',
          values: { requestedPercent, limitPercent },
          reference,
        }
      }
    }
    // ERP switched off for the company is a platform decision, not a missing role: "ask an
    // administrator in your company" sent people to someone who cannot change it.
    if (error.status === 403 && error.problemType === 'erp-entitlement-required') {
      return { key: 'apiErrors.erpNotEnabled', reference }
    }
    if (error.status === 403) {
      return {
        key: error.problemType === 'csrf-rejected' ? 'apiErrors.csrf' : 'apiErrors.forbidden',
        reference,
      }
    }
    if (error.status === 404) return { key: 'apiErrors.notFound', reference }
    if (error.status === 409) return { key: 'apiErrors.conflict', reference }
    // Trying again can never work for a body the edge refused for its size.
    if (error.status === 413) return { key: 'apiErrors.tooLarge', reference }
  }
  return { ...commonFailureMessage(error), reference }
}

/** A refusal the server makes on permission grounds, as opposed to a CSRF or gateway 403. */
export function isPermissionDenied(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.problemType !== 'csrf-rejected' &&
    error.problemType !== PLAN_FEATURE_NOT_INCLUDED
  )
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}
