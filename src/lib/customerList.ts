import type {
  CustomerDto,
  CustomerPageSize,
  CustomerListSort,
  CustomerReceivableDto,
  CustomerSummaryDto,
  CustomerTypeDto,
} from '../api/customers/customers'
import { initialsOf } from './format'
import type { CustomerKind, CustomerTabId, PeppolState, ReceivableState } from './customers'

export type Note = { key: string; values?: Record<string, string | number> }

export type CustomerListItem = {
  id: string
  name: string
  initials: string
  kind: CustomerKind
  /** The line under the name: the VAT number when there is one, otherwise how they are invoiced. */
  subtitle: Note | { parts: [Note, Note] }
  contactName: string | null
  contactEmail: string | null
  city: string | null
  countryCode: string | null
  peppol: PeppolState
}

export type CustomerReceivableView = {
  invoices: number
  state: ReceivableState
  /** Null when the customer owes nothing. */
  amount: number | null
  note: Note | null
}

const KIND: Record<CustomerTypeDto, CustomerKind> = {
  BUSINESS: 'business',
  GOVERNMENT: 'government',
  CONSUMER: 'consumer',
}

const INTENT: Record<CustomerKind, string> = { business: 'b2b', government: 'b2g', consumer: 'b2c' }

export function toCustomerListItem(customer: CustomerDto): CustomerListItem {
  const kind = KIND[customer.type]
  const profile = customer.profile
  const method = profile.deliveryPreferences?.sendingMethod ?? null
  const vat = profile.details?.vatRegistrationNumber?.trim() || null
  const channel = method === 'PEPPOL' ? 'peppol' : method === 'QR_RECEIPT' ? 'qrReceipt' : 'emailPdf'
  return {
    id: customer.id,
    name: customer.displayName,
    initials: initialsOf(customer.displayName),
    kind,
    subtitle:
      kind === 'business' && vat
        ? { key: 'customersPage.line.vat', values: { number: vat } }
        : {
            parts: [
              { key: `customersPage.line.intent.${INTENT[kind]}` },
              { key: `customersPage.line.channel.${channel}` },
            ],
          },
    // A consumer is usually their own contact, as the design shows them.
    contactName: profile.contact?.contactPerson?.trim() || (kind === 'consumer' ? customer.displayName : null),
    contactEmail: profile.contact?.emailRecipients?.[0] ?? null,
    city: profile.invoiceAddress?.cityName?.trim() || null,
    countryCode: profile.invoiceAddress?.countryCode?.trim() || null,
    peppol: peppolStateOf(kind, customer.peppolDelivery),
  }
}

/**
 * The three pills the design draws. Consumers are never on the network, so they get the QR
 * receipt the simplified invoice carries. For business and government, only a capability that is
 * verified now counts as on Peppol: pending and refused both read "Not connected", because an
 * invoice would not go over Peppol in either state (CUS-FR-066).
 */
function peppolStateOf(kind: CustomerKind, delivery: CustomerDto['peppolDelivery']): PeppolState {
  if (kind === 'consumer') return 'qrReceipt'
  return delivery === 'ACTIVE' ? 'onPeppol' : 'notConnected'
}

/**
 * The Receivable and Invoices cells. The design's third note, "awaiting send", needs the delivery
 * state of each invoice, which the list's figures do not carry, so it is not shown.
 */
export function toReceivableView(receivable: CustomerReceivableDto | undefined): CustomerReceivableView {
  if (!receivable || receivable.outstanding <= 0) {
    return { invoices: receivable?.invoices ?? 0, state: 'settled', amount: null, note: null }
  }
  if (receivable.overdue > 0 && receivable.daysOverdue !== null) {
    return {
      invoices: receivable.invoices,
      state: 'overdue',
      amount: receivable.outstanding,
      note: { key: 'customersPage.note.daysOverdue', values: { count: receivable.daysOverdue } },
    }
  }
  return {
    invoices: receivable.invoices,
    state: 'attention',
    amount: receivable.outstanding,
    note: receivable.partlyPaidInvoices > 0 ? { key: 'customersPage.note.partiallyPaid' } : null,
  }
}

export const CUSTOMER_TABS: { id: CustomerTabId; labelKey: string; type: CustomerTypeDto | null }[] = [
  { id: 'all', labelKey: 'customersPage.tabs.all', type: null },
  { id: 'business', labelKey: 'customersPage.tabs.business', type: 'BUSINESS' },
  { id: 'government', labelKey: 'customersPage.tabs.government', type: 'GOVERNMENT' },
  { id: 'consumer', labelKey: 'customersPage.tabs.consumer', type: 'CONSUMER' },
]

export function isCustomerTab(value: string | null): value is CustomerTabId {
  return CUSTOMER_TABS.some((tab) => tab.id === value)
}

export function tabCount(summary: CustomerSummaryDto, tab: CustomerTabId): number {
  return tab === 'all' ? summary.total : summary.byType[tab]
}

export type CustomerSortKey = 'nameAsc' | 'nameDesc' | 'recent'

/**
 * The orders the server can apply. The design also offers "Receivable: high to low" and "Most
 * invoices"; those figures come from the income ledger, not the customer record the list pages
 * over, so they are left out rather than sorting one page and calling it the whole list.
 */
export const CUSTOMER_SORTS: { value: CustomerSortKey; labelKey: string; sort: CustomerListSort }[] = [
  { value: 'nameAsc', labelKey: 'customersPage.sortOptions.nameAsc', sort: 'NAME_ASC' },
  { value: 'nameDesc', labelKey: 'customersPage.sortOptions.nameDesc', sort: 'NAME_DESC' },
  { value: 'recent', labelKey: 'customersPage.sortOptions.recent', sort: 'RECENT' },
]

export function isCustomerSort(value: string | null): value is CustomerSortKey {
  return CUSTOMER_SORTS.some((option) => option.value === value)
}

export const CUSTOMER_PAGE_SIZES = [10, 25, 50] as const
export const DEFAULT_CUSTOMER_PAGE_SIZE: CustomerPageSize = 10

/** Narrowed, not just validated: the server refuses any other size with a 400. */
export function customerPageSizeOf(value: string | null): CustomerPageSize {
  const size = Number(value)
  return (CUSTOMER_PAGE_SIZES as readonly number[]).includes(size)
    ? (size as CustomerPageSize)
    : DEFAULT_CUSTOMER_PAGE_SIZE
}
