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

export type SupplierTypeDto = 'BUSINESS' | 'GOVERNMENT'

/** `CustomerAddress`. Every field optional; the country is two letters. */
export type SupplierAddressDto = {
  attention: string | null
  countryCode: string | null
  cityName: string | null
  countrySubentity: string | null
  streetName: string | null
  buildingNumber: string | null
  additionalStreetName: string | null
  poBox: string | null
  postalCode: string | null
  addressLine3?: string | null
  countrySubentityCode?: string | null
}

export type SupplierBankDetailsDto = {
  beneficiaryName: string | null
  iban: string
  bic: string | null
  bankName: string | null
}

/**
 * `SupplierRequest`, the same body for create and edit. Edit replaces what it is sent: a field
 * left out is cleared, except the logo and the bank details, which are kept when absent.
 */
export type SupplierRequestDto = {
  type: SupplierTypeDto
  legalName: string
  vatNumber: string | null
  registeredForVat: boolean
  registeredOnPeppol: boolean
  participantScheme: string | null
  participantValue: string | null
  defaultCurrency: string | null
  defaultTaxCategory: string | null
  paymentTerms: string | null
  defaultPaymentMethod: string | null
  bankDetails: SupplierBankDetailsDto | null
  contactPerson: string
  roleTitle: string | null
  emailRecipients: string[]
  telephone: string | null
  mobilePhone: string | null
  preferredLanguage: 'en' | 'ar' | null
  receivingChannel: BillingChannel | null
  requiresApprovalBeforePayment: boolean
  earlyPaymentDiscountPercent: number | null
  earlyPaymentDiscountDays: number | null
  invoiceAddress: SupplierAddressDto | null
  sameAsInvoicingAddress: boolean
  deliveryAddress: SupplierAddressDto | null
  commercialRegistrationNumber: string | null
  notes: string | null
  supplierCategory: string | null
  version?: number
}

/** `SupplierDetail`: the supplier profile, and the addresses the customer record owns. */
export type SupplierDetailDto = {
  profile: {
    id: string
    type: SupplierTypeDto
    displayName: string
    legalName: string | null
    vatNumber: string | null
    registeredForVat: boolean | null
    registeredOnPeppol: boolean | null
    participantScheme: string | null
    participantValue: string | null
    participantId: string | null
    defaultCurrency: string | null
    defaultTaxCategory: string | null
    paymentTerms: string | null
    defaultPaymentMethod: string | null
    bankDetails: (SupplierBankDetailsDto & { changedAt: string | null; confirmedAt: string | null }) | null
    contactPerson: string | null
    roleTitle: string | null
    emailRecipients: string[] | null
    telephone: string | null
    mobilePhone: string | null
    preferredLanguage: string | null
    receivingChannel: BillingChannel | null
    requiresApprovalBeforePayment: boolean | null
    earlyPaymentDiscountPercent: number | null
    earlyPaymentDiscountDays: number | null
    commercialRegistrationNumber: string | null
    notes: string | null
    supplierCategory: string | null
    selfBillingAgreement: boolean
    health: SupplierHealthFlag[]
    supplierSince: string | null
    switchedOffAt: string | null
    status: SupplierStatus
    customerStatus: string | null
    version: number
  }
  invoiceAddress: SupplierAddressDto | null
  sameAsInvoicingAddress: boolean
  deliveryAddress: SupplierAddressDto | null
}

export const supplierPath = (id: string) => `${SUPPLIERS_PATH}/${encodeURIComponent(id)}`

export function loadSupplier(id: string): Promise<SupplierDetailDto> {
  return apiRequest<SupplierDetailDto>(supplierPath(id))
}

/** `supplier.manage`. The key is the form's, so a second click or a retry adds one supplier. */
export function createSupplier(idempotencyKey: string, body: SupplierRequestDto): Promise<SupplierDetailDto> {
  return apiRequest<SupplierDetailDto>(SUPPLIERS_PATH, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** `supplier.manage`. `version` is the one the form was loaded at; a newer one is a 409. */
export function updateSupplier(id: string, body: SupplierRequestDto): Promise<SupplierDetailDto> {
  return apiRequest<SupplierDetailDto>(supplierPath(id), { method: 'PUT', body })
}

/** Someone checked the new account with the supplier; clears `BANK_CHANGED_UNCONFIRMED`. */
export function confirmSupplierBankDetails(id: string): Promise<SupplierDetailDto> {
  return apiRequest<SupplierDetailDto>(`${supplierPath(id)}/bank-details/confirm`, { method: 'POST' })
}

export function newSupplierKey(): string {
  return `supplier-${crypto.randomUUID()}`
}
