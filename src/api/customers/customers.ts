import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { fromSpringPage, type Page, type SpringPage } from '../page'
import { withQuery } from '../query'

/**
 * The customer directory endpoints (`CustomerController`, `CustomerOverviewController`), in the
 * shapes the API answers with. Screens use the mappers in `lib/customerList.ts`.
 */
export const CUSTOMERS_PATH = '/v1/customers'
export const CUSTOMER_SUMMARY_PATH = `${CUSTOMERS_PATH}/summary`

export type CustomerTypeDto = 'BUSINESS' | 'GOVERNMENT' | 'CONSUMER'
export type CustomerStatusDto = 'ACTIVE' | 'ARCHIVED'
export type CustomerSendingMethod = 'EMAIL_PDF' | 'PEPPOL' | 'QR_RECEIPT'
/** The CL-06-OM codes a customer may state (`BuyerIdentifierScheme`); CID and PASNUM are personal. */
export const BUYER_IDENTIFIER_SCHEMES = ['CR', 'TIN', 'CID', 'PASNUM', 'OTHID'] as const
export type BuyerIdentifierScheme = (typeof BUYER_IDENTIFIER_SCHEMES)[number]
/** Derived on the server from the sending method and Discovery's verification; never stored. */
export type CustomerPeppolDelivery =
  'NOT_APPLICABLE' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'REJECTED'
export type CustomerListSort = 'RECENT' | 'NAME_ASC' | 'NAME_DESC'

/** `Customer`, only the members the list reads. */
export type CustomerDto = {
  id: string
  type: CustomerTypeDto
  displayName: string
  profile: {
    details: {
      vatRegistrationNumber: string | null
      /** The Peppol participant id, shown beside the VAT number on the periodic composer's customer card. */
      peppolParticipantId?: { scheme: string; value: string } | null
      /** BTOM-033 of a self-billing supplier; see `CustomerDetailsDto`. */
      industrialClassificationCode?: string | null
      /** IBT-010 default; government customers only. The invoice composer pre-fills from it. */
      defaultBuyerReference?: string | null
    } | null
    contact: { contactPerson: string | null; emailRecipients: string[] | null } | null
    deliveryPreferences: {
      sendingMethod: CustomerSendingMethod | null
      /** The customer's own reminder switch, when the list carries it (the reminders page counts the muted). */
      automaticPaymentReminders?: boolean
    } | null
    /**
     * The whole `CustomerAddress` is on the wire. Only city and country were typed until the
     * document preview needed the full address, so the rest is optional to keep older readers valid.
     */
    invoiceAddress:
      | ({ cityName: string | null; countryCode: string | null } & Partial<CustomerAddressDto>)
      | null
  }
  peppolDelivery: CustomerPeppolDelivery
  /** False while the record cannot fill a compliant buyer party; issue refuses it (SRS §15). */
  invoiceEligible?: boolean
  missingInvoiceFields?: string[]
  status: CustomerStatusDto
  updatedAt: string
}

/** `CustomerOverviewService.Summary`. */
export type CustomerSummaryDto = {
  currencyCode: string
  asOf: string
  /** Active customers; archived ones are counted apart, as the list shows active ones only. */
  total: number
  archived: number
  byType: { business: number; government: number; consumer: number }
  peppolReady: number
  peppolEligible: number
  receivables: {
    outstanding: number
    overdue: number
    openInvoices: number
    overdueInvoices: number
    customersOwing: number
    customersOverdue: number
  }
}

/** `CustomerOverviewService.Receivable`. Absent for a customer with no issued invoice. */
export type CustomerReceivableDto = {
  customerId: string
  outstanding: number
  overdue: number
  invoices: number
  openInvoices: number
  partlyPaidInvoices: number
  oldestOverdueDueDate: string | null
  daysOverdue: number | null
}

export type CustomerReceivablesDto = {
  currencyCode: string
  asOf: string
  items: CustomerReceivableDto[]
}

/**
 * The only page sizes the server accepts (`CustomerSearchQuery`: "Page size must be one of 10, 25,
 * 50 or 100"). A union rather than a number, because anything else is a 400 the caller only finds
 * out about at runtime — and a picker that 400s looks exactly like a customer who does not exist.
 */
export type CustomerPageSize = 10 | 25 | 50 | 100

export type CustomerListQuery = {
  type: CustomerTypeDto | null
  search: string
  sort: CustomerListSort
  /** Zero-based. */
  page: number
  size: CustomerPageSize
}

/**
 * The request for one page of the list. Also its identity: the same query is the same key.
 *
 * Always ACTIVE: the summary's tab counts are of active customers, and a list that mixed in
 * archived ones would page past the counts it sits under.
 */
export function customerListPath(query: CustomerListQuery): string {
  return withQuery(CUSTOMERS_PATH, {
    status: 'ACTIVE',
    type: query.type,
    search: query.search.trim(),
    sort: query.sort,
    page: query.page,
    size: query.size,
  })
}

export async function loadCustomerPage(path: string): Promise<Page<CustomerDto>> {
  return fromSpringPage(await apiRequest<SpringPage<CustomerDto>>(path))
}

/** One customer, for a screen that holds only their id (the invoice detail's "Bill to"). */
export function loadCustomer(customerId: string): Promise<CustomerDto> {
  return apiRequest<CustomerDto>(`${CUSTOMERS_PATH}/${encodeURIComponent(customerId)}`)
}

export function loadCustomerSummary(): Promise<CustomerSummaryDto> {
  return apiRequest<CustomerSummaryDto>(CUSTOMER_SUMMARY_PATH)
}

/** One `customer_id` per id, repeated, as the endpoint reads a list. */
export function customerReceivablesPath(ids: string[]): string {
  const query = new URLSearchParams()
  for (const id of ids) query.append('customer_id', id)
  return `${CUSTOMERS_PATH}/receivables?${query.toString()}`
}

export function loadCustomerReceivables(path: string): Promise<CustomerReceivablesDto> {
  return apiRequest<CustomerReceivablesDto>(path)
}

export type CustomerExport = ApiDownload & {
  /** The server stopped at its row cap; the file is not the whole directory. */
  truncated: boolean
}

/** The CSV of the customers the list is showing: the same type, search and status. */
export async function exportCustomers(
  query: Pick<CustomerListQuery, 'type' | 'search'>,
): Promise<CustomerExport> {
  const file = await apiDownload(
    withQuery(`${CUSTOMERS_PATH}/export`, {
      status: 'ACTIVE',
      type: query.type,
      search: query.search.trim(),
    }),
  )
  return { ...file, truncated: file.headers.get('X-Fawtir-Export-Truncated') === 'true' }
}

export type CustomerAddressDto = {
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

export type CustomerLogoDto = {
  objectReference: string
  contentType: string
  byteSize: number
  sha256: string
}

export type CustomerDetailsDto = {
  firstName: string | null
  lastName: string | null
  legalRegisteredName: string | null
  entityMinistryName: string | null
  vatRegistrationNumber: string | null
  registeredForVat: boolean | null
  entityMinistryCode: string | null
  defaultBuyerReference: string | null
  defaultPurchaseOrderNumber: string | null
  defaultContractTenderReference: string | null
  peppolParticipantId: { scheme: string; value: string } | null
  registeredOnPeppol: boolean | null
  /** IBT-046 under schemeName SZLN: a buyer in a special zone (IBR-152-OM). */
  specialZoneLicenceNumber?: string | null
  /**
   * The buyer identifier IBR-016-OM asks of a full invoice to a buyer with no Omani VAT number
   * (backend V480). Sent as a pair; the server refuses one half without the other.
   */
  identifierScheme?: BuyerIdentifierScheme | null
  identifierValue?: string | null
  /**
   * Response only: `identifierValue` is the masked form (`•••• 1234`) of a civil ID or passport
   * number, shown to a reader without `customer.manage`. Never sent back.
   */
  identifierValueMasked?: boolean
  /**
   * The customer's business activity: one ISIC Rev. 4 code at Oman's six-digit level (BTOM-033,
   * CL-08-OM-ISIC). Read only where the customer is the **seller**, i.e. a self-billing supplier:
   * BTOM-033 is the seller's code, so self-billed lines carry this one, not the tenant's. Optional,
   * and absent from older responses.
   */
  industrialClassificationCode?: string | null
}

export type CustomerContactDto = {
  contactPerson: string | null
  roleTitle: string | null
  emailRecipients: string[]
  telephone: string | null
  mobilePhone: string | null
  preferredLanguage: 'en' | 'ar' | null
}

export type CustomerBillingDefaultsDto = {
  defaultCurrency: string | null
  defaultTaxCategory: string | null
  paymentTerms: string | null
  defaultPaymentMethod: string | null
}

export type CustomerDeliveryPreferencesDto = {
  sendingMethod: CustomerSendingMethod
  emailPdfCopy: boolean
  automaticPaymentReminders: boolean
}

/** `CustomerProfile`, whole: what an edit reads and must send back. */
export type CustomerProfileDto = {
  logo: CustomerLogoDto | null
  details: CustomerDetailsDto
  contact: CustomerContactDto
  billingDefaults: CustomerBillingDefaultsDto
  deliveryPreferences: CustomerDeliveryPreferencesDto
  invoiceAddress: CustomerAddressDto | null
  sameAsInvoicingAddress: boolean
  deliveryAddress: CustomerAddressDto | null
  customerVisibleNote: string | null
}

/** `Customer` with its whole profile, as `GET /customers/{id}` and the writes answer. */
export type CustomerRecordDto = Omit<CustomerDto, 'profile'> & {
  profile: CustomerProfileDto
  version: number
}

/**
 * `CreateCustomerRequest` / `UpdateCustomerRequest`. The request is flat — no `profile` wrapper —
 * and an update replaces the record, so it carries the logo and anything the form does not draw.
 */
export type CustomerRequestDto = Omit<CustomerProfileDto, never> & {
  type: CustomerTypeDto
  expectedVersion?: number
}

/** `customer.manage`. The key is the form's, so a second click or a retry adds one customer. */
export function createCustomer(
  idempotencyKey: string,
  body: CustomerRequestDto,
): Promise<CustomerRecordDto> {
  return apiRequest<CustomerRecordDto>(CUSTOMERS_PATH, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export function loadCustomerRecord(customerId: string): Promise<CustomerRecordDto> {
  return apiRequest<CustomerRecordDto>(`${CUSTOMERS_PATH}/${encodeURIComponent(customerId)}`)
}

/** `customer.manage`. `expectedVersion` is the one the form was loaded at; a newer one is a 409. */
export function updateCustomer(
  customerId: string,
  body: CustomerRequestDto & { expectedVersion: number },
): Promise<CustomerRecordDto> {
  return apiRequest<CustomerRecordDto>(`${CUSTOMERS_PATH}/${encodeURIComponent(customerId)}`, {
    method: 'PUT',
    body,
  })
}

/**
 * `PatchCustomerRequest`: only the members sent change (a null or absent one is kept), and `clear`
 * names the optional ones to remove. Narrowed to what the web patches today.
 */
export type CustomerPatchDto = {
  details?: { industrialClassificationCode?: string }
  clear?: string[]
  expectedVersion: number
}

/** `customer.manage`. A newer stored version than `expectedVersion` is a 409. */
export function patchCustomer(
  customerId: string,
  body: CustomerPatchDto,
): Promise<CustomerRecordDto> {
  return apiRequest<CustomerRecordDto>(`${CUSTOMERS_PATH}/${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    body,
  })
}

export function newCustomerKey(): string {
  return `customer-${crypto.randomUUID()}`
}
