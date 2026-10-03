import { apiRequest } from '../client'
import { fromItemsPage, type ItemsPage, type Page } from '../page'
import { withQuery } from '../query'

/**
 * The supplier directory endpoints (`SupplierController`), in the shapes the API answers with.
 * Screens use the mappers in `lib/supplierList.ts`; nothing here knows about the page.
 */
export const SUPPLIERS_PATH = '/v1/suppliers'
export const SUPPLIER_SUMMARY_PATH = `${SUPPLIERS_PATH}/summary`

export type SupplierListFilter =
  'ALL' | 'ACTIVE' | 'NEEDS_FIX' | 'OWED' | 'NOT_ON_PEPPOL' | 'SWITCHED_OFF'
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
  /** When the supplier was switched off; the list frame dates it under the name. */
  switchedOffAt?: string | null
  /** Why, when a reason was given; null while active. Optional: an older server leaves it out. */
  switchedOffReason?: SwitchOffReasonDto | null
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
  /** Only suppliers whose bills arrive this way; left out, every channel. Narrows `total` too. */
  channel?: BillingChannel | null
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
    channel: query.channel ?? undefined,
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

/** Why a supplier was switched off: the dialog's five answers, as the server stores them. */
export type SwitchOffReasonDto =
  'STOPPED_TRADING' | 'CLOSED_DOWN' | 'DUPLICATE' | 'MOVED_SUPPLIER' | 'SOMETHING_ELSE'

/** The optional body of `POST /suppliers/{id}/switch-off`. */
export type SwitchOffRequestDto = { reason: SwitchOffReasonDto | null; note: string | null }

/**
 * `supplier.manage`. Both answer with the supplier's detail, which the list does not need.
 * Switching off may say why (`why`); the server keeps the reason and the note with the record and
 * clears them when the supplier is switched back on. Switching on takes no body.
 */
export async function switchSupplier(
  id: string,
  to: 'off' | 'on',
  why?: SwitchOffRequestDto,
): Promise<void> {
  await apiRequest<unknown>(`${SUPPLIERS_PATH}/${encodeURIComponent(id)}/switch-${to}`, {
    method: 'POST',
    credentials: 'same-origin',
    ...(to === 'off' && why ? { body: why } : {}),
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
  /** Blank or null clears it. */
  tradingName: string | null
  /** At most 20, each at most 40 characters; `[]` clears them. */
  tags: string[]
  /** "Match bills to purchase orders automatically". Stored only: nothing acts on it yet. */
  autoMatchPurchaseOrders: boolean
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
    /**
     * The backend always sends the object; a supplier with no account on file gets every field
     * null. Read "has an account" from the IBAN (`hasBankAccount` in lib/supplierForm), never from
     * the object being there.
     */
    bankDetails: {
      beneficiaryName: string | null
      iban: string | null
      bic: string | null
      bankName: string | null
      changedAt: string | null
      confirmedAt: string | null
    } | null
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
    /**
     * The three below are typed optional: a server older than the fields leaves them out, and the
     * form then opens as it did before them (no trading name, no tags, the switch on).
     */
    tradingName?: string | null
    tags?: string[] | null
    autoMatchPurchaseOrders?: boolean | null
    selfBillingAgreement: boolean
    health: SupplierHealthFlag[]
    supplierSince: string | null
    switchedOffAt: string | null
    /** Why it was switched off and the note left with it; null while active or when none was given. */
    switchedOffReason?: SwitchOffReasonDto | null
    switchedOffNote?: string | null
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
export function createSupplier(
  idempotencyKey: string,
  body: SupplierRequestDto,
): Promise<SupplierDetailDto> {
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
  return apiRequest<SupplierDetailDto>(`${supplierPath(id)}/bank-details/confirm`, {
    method: 'POST',
  })
}

export function newSupplierKey(): string {
  return `supplier-${crypto.randomUUID()}`
}
