import {
  WAITING_REASONS,
  type WaitingByReasonDto,
  type WaitingDocumentType,
  type WaitingReason,
} from '../api/expenditure/waitingDocuments'

/**
 * The waiting list's words and ways out (Business Rules AL-7, plan v4 §6 and §8).
 *
 * A supplier document that arrives while the company may not open it is still received, reported
 * to the Tax Authority and answered to the supplier: Fawtir never refuses delivery. The company
 * sees that it arrived (supplier, number, date and a count) and opens it once the reason is gone.
 * Each reason has one thing to do about it, and only the people who can do it are sent there.
 */

/** Where each reason is put right, and the permission the page behind it is read with. */
export type WaitingWayOut = { to: string; labelKey: string; permission: string }

const WAY_OUT: Record<WaitingReason, WaitingWayOut | null> = {
  // Extra documents are bought on Plan and usage (plan v4 §7.1); they open the held ones at once.
  NO_DOCUMENTS_LEFT: {
    to: '/settings/plan',
    labelKey: 'waitingDocuments.wayOut.NO_DOCUMENTS_LEFT',
    permission: 'tenant.plan.read',
  },
  // Paying the bill restores the subscription, and the held documents open (plan v4 §8).
  SUBSCRIPTION_ENDED: {
    to: '/settings/bills',
    labelKey: 'waitingDocuments.wayOut.SUBSCRIPTION_ENDED',
    permission: 'tenant.plan.read',
  },
  // Fawtir activates the company; there is nothing the company does here.
  COMPANY_NOT_ACTIVE: null,
}

export function waitingWayOut(reason: WaitingReason): WaitingWayOut | null {
  return WAY_OUT[reason]
}

export const waitingReasonKey = (reason: WaitingReason) => `waitingDocuments.reason.${reason}`

export const waitingReasonExplanationKey = (reason: WaitingReason) =>
  `waitingDocuments.explain.${reason}`

export const waitingTypeKey = (type: WaitingDocumentType) => `waitingDocuments.type.${type}`

/** The reasons that hold anything, in the order the list explains them. */
export function reasonsPresent(byReason: Partial<WaitingByReasonDto> | null | undefined) {
  return WAITING_REASONS.filter((reason) => (byReason?.[reason] ?? 0) > 0).map((reason) => ({
    reason,
    count: byReason?.[reason] ?? 0,
  }))
}
