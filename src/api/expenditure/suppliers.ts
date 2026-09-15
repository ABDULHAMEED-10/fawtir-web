import { apiRequest } from '../client'
import { fromItemsPage, type ItemsPage, type Page } from '../page'
import { withQuery } from '../query'

/**
 * The supplier directory endpoints (`SupplierController`), in the shapes the API answers with.
 * Screens use the mappers in `lib/supplierList.ts`; nothing here knows about the page.
 */
export const SUPPLIERS_PATH = '/v1/suppliers'
export const SUPPLIER_SUMMARY_PATH = `${SUPPLIERS_PATH}/summary`

export type SupplierListFilter = 'ALL' | 'ACTIVE' | 'NEEDS_FIX' | 'OWED' | 'NOT_ON_PEPPOL' | 'SWITCHED_OFF'
export type SupplierListSort = 'NAME' | 'OWED_DESC' | 'OWED_ASC'
export type BillingChannel = 'PEPPOL' | 'EMAIL_PDF' | 'PAPER' | 'MANUAL'
export type SupplierHealthFlag = 'NO_BANK_DETAILS' | 'NO_VAT_NUMBER' | 'BANK_CHANGED_UNCONFIRMED'
export type SupplierStatus = 'ACTIVE' | 'SWITCHED_OFF'

/** `SupplierRow`. */
export type SupplierListRowDto = {
  id: string
  displayName: string
  vatNumber: string | null
  billingChannel: BillingChannel
  /** `scheme:value`, or null for a supplier not on the network. */
  participantId: string | null
  selfBilling: boolean
  terms: {
    paymentTerms: string | null
    netDays: number | null
    earlyPaymentDiscountPercent: number | null
    earlyPaymentDiscountDays: number | null
    /** English card text; the screen writes its own from the two numbers above. */
    earlyPaymentDiscount: string | null
  }
  youOwe: { amount: number; currency: string; openBills: number; onHold: number }
  record: {
    health: SupplierHealthFlag[]
    paidOnTimeCount: number
    settledCount: number
    paidOnTime: string
    bankChangedAt: string | null
  }
  status: SupplierStatus
}

/** `SupplierSummary`. */
export type SupplierSummaryDto = {
  currencyCode: string
  total: number
  active: number
  switchedOff: number
  onPeppol: number
  notOnPeppol: number
  owedTotal: number
  openBills: number
  needsFix: { noBankDetails: number; noVat: number; bankChanged: number }
  owedSuppliers: number
  needsFixSuppliers: number
}

export type SupplierListQuery = {
  filter: SupplierListFilter
  q: string
  sort: SupplierListSort
  /** Zero-based. */
  page: number
  pageSize: number
}

/** The request for one page of the list. Also its identity: the same query is the same key. */
export function supplierListPath(query: SupplierListQuery): string {
  return withQuery(SUPPLIERS_PATH, {
    filter: query.filter === 'ALL' ? undefined : query.filter,
    q: query.q.trim(),
    sort: query.sort === 'NAME' ? undefined : query.sort,
    page: query.page,
    page_size: query.pageSize,
  })
}

export async function loadSupplierPage(path: string): Promise<Page<SupplierListRowDto>> {
  return fromItemsPage(await apiRequest<ItemsPage<SupplierListRowDto>>(path))
}

export function loadSupplierSummary(): Promise<SupplierSummaryDto> {
  return apiRequest<SupplierSummaryDto>(SUPPLIER_SUMMARY_PATH)
}

/** `supplier.manage`. Both answer with the supplier's detail, which the list does not need. */
export async function switchSupplier(id: string, to: 'off' | 'on'): Promise<void> {
  await apiRequest<unknown>(`${SUPPLIERS_PATH}/${encodeURIComponent(id)}/switch-${to}`, {
    method: 'POST',
    credentials: 'same-origin',
  })
}
