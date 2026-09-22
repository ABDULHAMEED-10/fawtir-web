import type { AgreementDto, AgreementStatusDto } from '../api/selfBilling/agreements'

/**
 * What a self-billing agreement actually permits, and what it is waiting on (I-12).
 *
 * The server stores four states and an assurance flag. Neither on its own answers the question a
 * reader has — *can I issue against this seller, and if not, who has to do something?* — so that is
 * derived here, once, and every surface reads the same answer.
 */

/**
 * Whether the agreement's own dates cover a given day.
 *
 * **Derived, never stored.** There is deliberately no `EXPIRED` status: `effectiveTo` lapsing is
 * something the server will never tell us and nothing anywhere says "expiring soon". A screen that
 * stayed silent would show an ACTIVE agreement that refuses every issue.
 */
export function inForce(agreement: AgreementDto, today: string): boolean {
  if (agreement.effectiveFrom > today) return false
  return agreement.effectiveTo === null || agreement.effectiveTo >= today
}

export function lapsed(agreement: AgreementDto, today: string): boolean {
  return agreement.effectiveTo !== null && agreement.effectiveTo < today
}

export function notYetStarted(agreement: AgreementDto, today: string): boolean {
  return agreement.effectiveFrom > today
}

/**
 * The single reason issuing would be refused, or null when it would be allowed.
 *
 * Ordered as the server checks: `SELF_BILLING_AGREEMENT_MISSING`, then `..._NOT_ACTIVE`, then
 * `..._NOT_IN_FORCE`, then `SELF_BILLING_SELLER_NOT_VERIFIED`. Matching that order means the
 * screen names the same obstacle the server would, rather than a different true one.
 */
export type Blocker = 'withdrawn' | 'pendingActivation' | 'suspended' | 'notYetStarted' | 'lapsed' | 'unverified'

export function blockerOf(agreement: AgreementDto, today: string): Blocker | null {
  if (agreement.status === 'WITHDRAWN') return 'withdrawn'
  if (agreement.status === 'PENDING_ACTIVATION') return 'pendingActivation'
  if (agreement.status === 'SUSPENDED') return 'suspended'
  if (notYetStarted(agreement, today)) return 'notYetStarted'
  if (lapsed(agreement, today)) return 'lapsed'
  if (agreement.sellerIdentityAssurance !== 'COUNTERPARTY_VERIFIED') return 'unverified'
  return null
}

export function canIssueUnder(agreement: AgreementDto, today: string): boolean {
  return blockerOf(agreement, today) === null
}

/**
 * Who has to act next — the distinction the contract check asked for (decision 3).
 *
 * `PENDING_ACTIVATION` and `UNVERIFIED` are both "waiting", and confusing them is how a tenant
 * sits waiting for Fawtir when the button was theirs all along, or hunts for a button that can
 * never exist for them.
 */
export type Owner = 'tenant' | 'fawtir' | 'nobody'

export function waitingOn(agreement: AgreementDto, today: string): Owner {
  const blocker = blockerOf(agreement, today)
  if (blocker === null) return 'nobody'
  if (blocker === 'unverified') return 'fawtir'
  return 'tenant'
}

/** Which lifecycle actions the server would accept, so the screen offers no dead button. */
export function allowedActions(status: AgreementStatusDto): {
  activate: boolean
  suspend: boolean
  withdraw: boolean
} {
  return {
    // Reversible from suspended; ALREADY_IN_STATE from active.
    activate: status === 'PENDING_ACTIVATION' || status === 'SUSPENDED',
    suspend: status === 'ACTIVE',
    // Terminal, and the one thing that cannot be undone.
    withdraw: status !== 'WITHDRAWN',
  }
}

export const AGREEMENT_TABS = ['all', 'active', 'waiting', 'ended'] as const
export type AgreementTabId = (typeof AGREEMENT_TABS)[number]

/**
 * Tabs by what the reader is looking for, not by raw status.
 *
 * "Active" means issuable — an ACTIVE agreement that has lapsed or whose seller is unverified is
 * not, and filing it under Active would be the screen telling the same lie the status alone does.
 */
export function matchesTab(agreement: AgreementDto, tab: AgreementTabId, today: string): boolean {
  switch (tab) {
    case 'all':
      return true
    case 'active':
      return canIssueUnder(agreement, today)
    case 'waiting':
      return agreement.status !== 'WITHDRAWN' && !canIssueUnder(agreement, today) && !lapsed(agreement, today)
    case 'ended':
      return agreement.status === 'WITHDRAWN' || lapsed(agreement, today)
  }
}

export const STATUS_CHIP: Record<AgreementStatusDto, 'ok' | 'waiting' | 'stopped'> = {
  ACTIVE: 'ok',
  PENDING_ACTIVATION: 'waiting',
  SUSPENDED: 'stopped',
  WITHDRAWN: 'stopped',
}

/** `effectiveFrom` descending is the server's order; kept when the list is filtered. */
export function sortedForDisplay(agreements: AgreementDto[]): AgreementDto[] {
  return [...agreements].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
}

export function agreementProblem(reference: string): 'referenceRequired' | 'referenceTooLong' | null {
  const text = reference.trim()
  if (text === '') return 'referenceRequired'
  if (text.length > 100) return 'referenceTooLong'
  return null
}

/** `SELF_BILLING_AGREEMENT_RANGE_INVALID` — an end before the start. */
export function rangeProblem(from: string, to: string): 'fromRequired' | 'rangeInvalid' | null {
  if (from.trim() === '') return 'fromRequired'
  if (to.trim() !== '' && to < from) return 'rangeInvalid'
  return null
}
