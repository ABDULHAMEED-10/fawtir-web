import type { AgreementDto } from '../api/selfBilling/agreements'
import { blockerOf, type Blocker } from './selfBillingAgreements'

/**
 * Helpers every trade-document screen shares.
 *
 * Trade documents (quotations, order forms, delivery notes and purchase receipts) are not tax
 * documents: nothing here is reported to the Tax Authority. Only the invoice a document turns
 * into is (TRADE_DOCUMENTS.md row T.19).
 */

/** The page numbers a pager draws for a row count, with a gap once there are more than five. */
export function pageNumbers(total: number, pageSize: number): string[] {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => String(i + 1))
  return ['1', '2', '3', '4', '...', String(pages)]
}

/** Case-insensitive search across the texts a row shows. */
export function matchesSearch(query: string, ...texts: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return texts.some((text) => (text ?? '').toLowerCase().includes(q))
}

/**
 * Whether "Self-bill supplier" may be offered for a trade document's supplier.
 *
 * Self-billing is lawful only under a signed, active agreement with that supplier (handbook 5.1),
 * and the agreements API already answers that (`GET /v1/self-billing-agreements`). A trade
 * document does not carry the supplier's record id yet, so no agreement can be matched to it and
 * the action stays disabled with its reason. TODO(backend): TRADE_DOCUMENTS.md row T.18.
 */
export type SelfBillGate =
  | { allowed: true; agreementId: string }
  | { allowed: false; reasonKey: string; values?: Record<string, string> }

const BLOCKER_KEYS: Record<Blocker, string> = {
  withdrawn: 'tradeDocs.selfBill.withdrawn',
  pendingActivation: 'tradeDocs.selfBill.pending',
  suspended: 'tradeDocs.selfBill.suspended',
  notYetStarted: 'tradeDocs.selfBill.notStarted',
  lapsed: 'tradeDocs.selfBill.lapsed',
  unverified: 'tradeDocs.selfBill.unverified',
}

export function selfBillGate(
  counterpartyId: string | null,
  agreements: AgreementDto[] | null,
  today: string,
): SelfBillGate {
  if (agreements === null) return { allowed: false, reasonKey: 'tradeDocs.selfBill.cannotCheck' }
  if (!counterpartyId) return { allowed: false, reasonKey: 'tradeDocs.selfBill.none' }
  const theirs = agreements.filter((agreement) => agreement.customerId === counterpartyId)
  if (theirs.length === 0) return { allowed: false, reasonKey: 'tradeDocs.selfBill.none' }
  const usable = theirs.find((agreement) => blockerOf(agreement, today) === null)
  if (usable) return { allowed: true, agreementId: usable.id }
  const blocker = blockerOf(theirs[0], today)!
  return {
    allowed: false,
    reasonKey: BLOCKER_KEYS[blocker],
    values: { reference: theirs[0].agreementReference },
  }
}
