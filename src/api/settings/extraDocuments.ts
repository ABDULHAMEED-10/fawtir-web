import { apiRequest } from '../client'
import type { SubscriptionBillDto } from './billing'

/**
 * `/v1/settings/plan/extra-documents` (`ExtraDocumentsController`, backend V301): documents bought
 * ahead on top of the plan's monthly allowance. Reading and quoting need `tenant.plan.read`,
 * ordering `tenant.plan.manage`. Every figure is the server's: the screen never multiplies a rate
 * by a number, works out VAT or decides the limits.
 *
 * Ordering issues an ordinary subscription bill, paid through `/v1/settings/billing` like any
 * other; the documents are added only when the server confirms the payment (card at once, bank
 * transfer or cash once Fawtir confirms it).
 */
export const EXTRA_DOCUMENTS_PATH = '/v1/settings/plan/extra-documents'

/** The screen's own route, linked from Plan and usage and from the "allowance used" refusal. */
export const EXTRA_DOCUMENTS_ROUTE = '/settings/plan/extra-documents'

/** The month's allowance as the server splits it; only the fields a screen reads are typed. */
export type AllowanceUsageDto = {
  periodStart: string
  periodEnd: string
  resetsOn: string
  planDocuments: number
  /** Extra documents active this month: paid purchases and Fawtir's grants. */
  extraDocuments: number
  totalAllowance: number
  used: number
  planUsed: number
  extraUsed: number
  left: number
  /** Received documents held now, waiting to open; not part of `used`. */
  receivedHidden: number
  issuingAllowed: boolean
  extrasExpireOn: string
}

export type ExtraDocumentCreditDto = {
  id: string
  source: 'PURCHASE' | 'GRANT' | 'GIVE_BACK'
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED'
  documents: number
  /** Three-decimal OMR strings; null on a grant or a give-back. */
  unitPrice: string | null
  netAmount: string | null
  billId: string | null
  startsOn: string | null
  expiresOn: string | null
  createdAt: string
  activatedAt: string | null
  cancelledAt: string | null
}

export type ExtraDocumentsPurchaseDto = { credit: ExtraDocumentCreditDto; bill: SubscriptionBillDto }

export type ExtraDocumentsOverviewDto = {
  planCode: string
  /** False when the plan has no per-document rate (Enterprise). */
  offered: boolean
  unitPrice: string | null
  minPerPurchase: number
  maxPerPurchase: number
  expiresOn: string
  allowance: AllowanceUsageDto
  /** The order still to pay, with its bill; null when there is none. */
  outstanding: ExtraDocumentsPurchaseDto | null
  credits: ExtraDocumentCreditDto[]
}

/** The server's price for a number of documents: rate × number at three decimals, VAT as billed. */
export type ExtraDocumentQuoteDto = {
  planCode: string
  documents: number
  unitPrice: string
  netAmount: string
  vatRate: string
  vatAmount: string
  total: string
  currency: 'OMR'
  expiresOn: string
  minPerPurchase: number
  maxPerPurchase: number
  nextPlanCode: string | null
  /** True when this month's extras plus this order would cost more than moving to `nextPlanCode`. */
  upgradeSuggested: boolean | null
}

export function loadExtraDocuments(): Promise<ExtraDocumentsOverviewDto> {
  return apiRequest<ExtraDocumentsOverviewDto>(EXTRA_DOCUMENTS_PATH)
}

export function quoteExtraDocuments(documents: number, signal?: AbortSignal): Promise<ExtraDocumentQuoteDto> {
  return apiRequest<ExtraDocumentQuoteDto>(`${EXTRA_DOCUMENTS_PATH}/quote?documents=${documents}`, { signal })
}

/**
 * Orders the documents and issues the bill to pay. The same number again returns the open order;
 * another number replaces an unpaid one on the server, so a retry never orders twice.
 */
export function orderExtraDocuments(documents: number): Promise<ExtraDocumentsPurchaseDto> {
  return apiRequest<ExtraDocumentsPurchaseDto>(`${EXTRA_DOCUMENTS_PATH}/purchases`, {
    method: 'POST',
    body: { documents },
  })
}
