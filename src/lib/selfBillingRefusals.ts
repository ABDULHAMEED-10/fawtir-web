import { ApiError } from '../api'

/**
 * Self-billing refusals, as sentences (I-12).
 *
 * A separate map from the Expenditure one because the two families do not look alike on the wire.
 * `ExpenditureApprovalException` answers one problem type (`expenditure-refused`) for every code;
 * `SelfBillingAgreementExceptionHandler` mints a **distinct** type per code — the code itself,
 * lower-cased and hyphenated — and spreads them across 409, 404, 400 and 500. So this keys on the
 * `code` property, which both handlers set, and on nothing else.
 *
 * **409 is the interesting one.** Seven codes answer Conflict, including the four that gate
 * issuance, and the generic 409 sentence is "Someone changed this while you were working on it.
 * Reload to see the latest version, then try again." For "you have no agreement with this seller"
 * that is not vague, it is false — there is nothing to reload and nothing was changed. These must
 * be named before any status branch runs.
 *
 * The 500 codes are deliberately absent: a stored agreement failing its own invariants is corrupt
 * data, not something to explain to a tenant, and the generic service message is the right answer.
 */

export const SELF_BILLING_FALLBACK_KEY = 'apiErrors.selfBilling.generic'

const REFUSALS: Record<string, string> = {
  // The four issuance gates — the ones a tenant meets most often.
  SELF_BILLING_AGREEMENT_MISSING: 'apiErrors.selfBilling.missing',
  SELF_BILLING_AGREEMENT_NOT_ACTIVE: 'apiErrors.selfBilling.notActive',
  SELF_BILLING_AGREEMENT_NOT_IN_FORCE: 'apiErrors.selfBilling.notInForce',
  SELF_BILLING_SELLER_NOT_VERIFIED: 'apiErrors.selfBilling.sellerNotVerified',

  // Managing the agreement itself.
  SELF_BILLING_AGREEMENT_ALREADY_EXISTS: 'apiErrors.selfBilling.alreadyExists',
  SELF_BILLING_AGREEMENT_ALREADY_IN_STATE: 'apiErrors.selfBilling.alreadyInState',
  SELF_BILLING_AGREEMENT_WITHDRAWN: 'apiErrors.selfBilling.withdrawn',
  SELF_BILLING_AGREEMENT_NOT_FOUND: 'apiErrors.selfBilling.notFound',
  SELF_BILLING_AGREEMENT_RANGE_INVALID: 'apiErrors.selfBilling.rangeInvalid',
  SELF_BILLING_AGREEMENT_REFERENCE_REQUIRED: 'apiErrors.selfBilling.referenceRequired',
  SELF_BILLING_AGREEMENT_REFERENCE_TOO_LONG: 'apiErrors.selfBilling.referenceTooLong',

  // Issuing: the seller is the counterparty, so its record must hold what the document needs
  // (`CustomerSelfBillingSellerAdapter`). A 400 from the invoice handler, checked after the
  // agreement gates pass.
  COUNTERPARTY_NOT_SELECTABLE: 'apiErrors.selfBilling.counterpartyInactive',
  COUNTERPARTY_LEGAL_NAME_MISSING: 'apiErrors.selfBilling.counterpartyLegalName',
  COUNTERPARTY_VATIN_MISSING: 'apiErrors.selfBilling.counterpartyVat',
  COUNTERPARTY_ADDRESS_MISSING: 'apiErrors.selfBilling.counterpartyAddress',
}

/** The issuance refusals about the counterparty's record: named, and never a `SELF_BILLING_` code. */
const COUNTERPARTY_CODES = new Set([
  'COUNTERPARTY_NOT_SELECTABLE',
  'COUNTERPARTY_LEGAL_NAME_MISSING',
  'COUNTERPARTY_VATIN_MISSING',
  'COUNTERPARTY_ADDRESS_MISSING',
])

/**
 * A named self-billing refusal.
 *
 * Recognised by the code, not the status: the same code can be raised from the agreement routes
 * and from issuance in an entirely different context, which is exactly why the handler keys on the
 * exception rather than on a list of controllers.
 */
export function isSelfBillingRefusal(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.code !== null &&
    (error.code.startsWith('SELF_BILLING_') || COUNTERPARTY_CODES.has(error.code))
  )
}

export function selfBillingMessageKey(error: unknown): string | null {
  if (!isSelfBillingRefusal(error)) return null
  // A 500 is an integrity failure the tenant can do nothing with; leave it to the service message.
  if (error.status >= 500) return null
  return REFUSALS[error.code as string] ?? SELF_BILLING_FALLBACK_KEY
}

export const MAPPED_SELF_BILLING_CODES = Object.freeze(Object.keys(REFUSALS))

/** A self-billed issue refused for the supplier's missing business activity (BTOM-033). */
export const SUPPLIER_ISIC_MISSING_KEY = 'apiErrors.selfBilling.supplierIsicMissing'

/** Where a self-billing supplier's business activity (ISIC) is set: its agreement dialog. */
export const SELF_BILLING_AGREEMENTS_ROUTE = '/income/self-billing/agreements'

/**
 * A self-billed issue's refusal, as a sentence: the self-billing refusals above, plus
 * `INDUSTRIAL_CLASSIFICATION_REQUIRED` read as the **supplier's** missing code.
 *
 * BTOM-033 is the seller's code and on a self-billed document the seller is the supplier (IBR-081-OM
 * requires it on every line), so the refusal is about the supplier's record, not Settings › Company.
 * Kept out of `REFUSALS` on purpose: `describeApiFailure` maps those for every screen, and on a sales
 * invoice the same code does mean the tenant's own activity. Only self-billed callers ask this.
 */
export function selfBilledIssueMessageKey(error: unknown): string | null {
  if (isSupplierIsicMissing(error)) return SUPPLIER_ISIC_MISSING_KEY
  return selfBillingMessageKey(error)
}

/** The self-billed issue refusal that sends the reader to the agreements page to fix it. */
export function isSupplierIsicMissing(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'INDUSTRIAL_CLASSIFICATION_REQUIRED'
}
