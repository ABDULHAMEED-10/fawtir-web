import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { SupplierDetailDto } from '../../api/expenditure/suppliers'
import type { SupplierContactDto, SupplierOverviewDto } from '../../api/expenditure/supplierRecord'
import { SupplierDetailPage } from './SupplierDetailPage'

const ID = '55555555-5555-5555-5555-555555555555'
const ONE = `/api/v1/suppliers/${ID}`

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['supplier.read', 'supplier.manage', 'purchase-order.read'],
  scopes: [],
  featureFlags: {},
}

const DETAIL: SupplierDetailDto = {
  profile: {
    id: ID,
    type: 'BUSINESS',
    displayName: 'Qalhat Marine Supplies LLC',
    legalName: 'Qalhat Marine Supplies LLC',
    vatNumber: 'OM1100999001',
    registeredForVat: true,
    registeredOnPeppol: true,
    participantScheme: '0248',
    participantValue: 'OM1100999001',
    participantId: '0248:OM1100999001',
    defaultCurrency: 'OMR',
    defaultTaxCategory: 'S5',
    paymentTerms: 'NET45',
    defaultPaymentMethod: '30',
    bankDetails: { beneficiaryName: 'Qalhat', iban: 'OM810180000012345678901', bic: 'BMUSOMRX', bankName: 'Bank Muscat', changedAt: '2026-09-01T08:00:00Z', confirmedAt: null },
    contactPerson: 'Accounts team',
    roleTitle: null,
    emailRecipients: ['ap@qalhat.om'],
    telephone: null,
    mobilePhone: null,
    preferredLanguage: 'en',
    receivingChannel: 'PEPPOL',
    requiresApprovalBeforePayment: true,
    earlyPaymentDiscountPercent: 1.5,
    earlyPaymentDiscountDays: 10,
    commercialRegistrationNumber: '1234567',
    notes: null,
    supplierCategory: 'Marine',
    selfBillingAgreement: false,
    health: ['BANK_CHANGED_UNCONFIRMED'],
    supplierSince: '2026-01-10',
    switchedOffAt: null,
    status: 'ACTIVE',
    customerStatus: 'ACTIVE',
    version: 7,
  },
  invoiceAddress: { attention: null, countryCode: 'OM', cityName: 'Sur', countrySubentity: 'South Sharqiyah', streetName: 'Main Street', buildingNumber: '1', additionalStreetName: null, poBox: null, postalCode: '112' },
  sameAsInvoicingAddress: true,
  deliveryAddress: null,
}

const OVERVIEW: SupplierOverviewDto = {
  tabs: { bills: 23, payments: 11, orders: 2, documents: 1 },
  match: { agreed: 3, orderBacked: 4, summary: '3 of 4' },
  usualLeadTimeDays: 5,
  payables: {
    currencyCode: 'OMR',
    notDue: { amount: 120.5, bills: 2, nextDue: '2026-10-01' },
    dueSoon: { amount: 0, bills: 0, nextDue: null },
    late: { amount: 40, bills: 1, nextDue: '2026-09-02' },
    onHold: { amount: 0, bills: 0, nextDue: null },
    everLate: true,
    total: 160.5,
  },
}

const BILL = {
  id: 'b-1',
  source: 'PEPPOL',
  supplierId: ID,
  supplierName: 'Qalhat Marine Supplies LLC',
  documentTypeCode: '380',
  supplierBillNumber: 'QMS-2044',
  issueDate: '2026-09-01',
  dueDate: '2026-10-01',
  overdue: false,
  currencyCode: 'OMR',
  totalIncludingVat: 120.5,
  vatAmount: 5.74,
  paidAmount: 0,
  outstandingAmount: 120.5,
  purchaseOrderReference: 'PO-0033',
  workflowState: 'APPROVED',
  readiness: { state: 'READY', distinctApprovals: 1, required: 1, autoApproved: false },
  match: null,
  hold: null,
  paymentRunReference: null,
  paidOnTheSpot: false,
}

const CONTACTS: SupplierContactDto[] = [
  { id: 'c-1', fullName: 'Hamed Al Kindi', roleTitle: 'Owner', purpose: 'MAIN', email: 'hamed@qalhat.om', telephone: null, mobilePhone: null, notes: null, version: 2 },
  { id: 'c-2', fullName: 'Laila Al Harthy', roleTitle: null, purpose: 'BILLING', email: 'ap@qalhat.om', telephone: null, mobilePhone: null, notes: null, version: 5 },
]

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let detail: SupplierDetailDto

const calls = (method: string, prefix: string) =>
  fetchMock.mock.calls.filter(([called, init]) => String(called).startsWith(prefix) && ((init as RequestInit | undefined)?.method ?? 'GET') === method)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  detail = DETAIL
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url === ONE) return json(200, detail)
    if (url === `${ONE}/overview`) return json(200, OVERVIEW)
    if (url === `${ONE}/contacts`) return json(200, CONTACTS)
    if (url.startsWith(`${ONE}/contacts/c-2/make-main`)) return json(200, [{ ...CONTACTS[1], purpose: 'MAIN', version: 6 }, { ...CONTACTS[0], purpose: 'BILLING', version: 3 }])
    if (url === `${ONE}/documents`)
      return json(200, [
        {
          document: { id: 'd-1', title: 'Supply agreement', kind: 'AGREEMENT', series: 'Supply agreement', version: 2, documentDate: '2026-01-14', provenance: 'SIGNED', note: null, contentType: 'application/pdf', byteSize: 20480, uploadedAt: '2026-01-15T08:00:00Z', legalHold: false, retainUntil: null },
          standing: 'CURRENT',
        },
      ])
    if (url.startsWith(`${ONE}/bills?`)) {
      const size = Number(new URL(url, 'http://x').searchParams.get('page_size'))
      return json(200, { items: size === 5 ? [BILL] : Array.from({ length: 20 }, (_, i) => ({ ...BILL, id: `b-${i}`, supplierBillNumber: `QMS-${i}` })), page: 0, pageSize: size, count: size === 5 ? 1 : 20 })
    }
    if (url.startsWith(`${ONE}/purchases`)) return json(200, [{ description: 'Marine rope', unit: 'MTR', currencyCode: 'OMR', totalQuantity: 400, totalAmount: 800, billCount: 3 }])
    if (url.startsWith(`${ONE}/payments?`))
      return json(200, {
        items: [
          { id: 'p-1', billId: 'b-1', entryType: 'PAYMENT', reversalOfPaymentId: null, amount: 50, currency: 'OMR', methodCode: '30', paymentReference: 'TRX-1', paymentDate: '2026-09-05', occurredAt: '2026-09-05T08:00:00Z' },
          { id: 'p-2', billId: 'b-1', entryType: 'REVERSAL', reversalOfPaymentId: 'p-1', amount: 50, currency: 'OMR', methodCode: '30', paymentReference: 'TRX-1', paymentDate: '2026-09-06', occurredAt: '2026-09-06T08:00:00Z' },
        ],
        page: 0,
        pageSize: 20,
        count: 2,
      })
    if (url.startsWith('/api/v1/purchase-orders?'))
      return json(200, { items: [{ id: 'po-1', number: 'PO-0033', state: 'SENT', orderDate: '2026-08-20', wantedBy: '2026-09-01', currency: 'OMR', totalGross: 315 }], page: 0, pageSize: 20, count: 1 })
    if (url.startsWith(`${ONE}/statement.pdf`)) return new Response('%PDF', { status: 200, headers: { 'Content-Type': 'application/pdf' } })
    if (url === `${ONE}/switch-off` && method === 'POST') {
      detail = { ...DETAIL, profile: { ...DETAIL.profile, status: 'SWITCHED_OFF', switchedOffAt: '2026-09-17T08:00:00Z' } }
      return json(200, detail)
    }
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderSupplier() {
  return render(
    <MemoryRouter initialEntries={[`/suppliers/${ID}`]}>
      <Routes>
        <Route path="/suppliers/:slug" element={<SupplierDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('a supplier, opened', () => {
  it('shows the record from the API and nothing the API does not hold', async () => {
    renderSupplier()
    expect(await screen.findByRole('heading', { level: 1, name: 'Qalhat Marine Supplies LLC' })).toBeTruthy()
    expect(screen.getAllByText('Bills you over Peppol').length).toBeGreaterThan(0)
    expect(screen.getByText('1 thing to fix')).toBeTruthy()
    expect(screen.getByText(/VAT OM1100999001 · Net 45 days/)).toBeTruthy()
    // What is owed: the total and a band with its next due date.
    expect(await screen.findByText('160.500')).toBeTruthy()
    expect(screen.getByText('120.500', { selector: 'p' })).toBeTruthy()
    expect(screen.getByText('Some of their bills have been paid late before.')).toBeTruthy()
    // The latest bill, what they sell, the papers, the contacts and the match record.
    expect(await screen.findByRole('link', { name: 'QMS-2044' })).toBeTruthy()
    expect(await screen.findByText('Marine rope')).toBeTruthy()
    expect(await screen.findByText('Supply agreement')).toBeTruthy()
    expect(await screen.findByText('Laila Al Harthy')).toBeTruthy()
    expect(screen.getByText('3 of 4')).toBeTruthy()
    expect(screen.getByText('1.5% if paid within 10 days')).toBeTruthy()
    expect(screen.getByText('1, Main Street, Sur, South Sharqiyah, 112, OM')).toBeTruthy()
    expect(screen.getByText('The bank details changed and nobody has confirmed them with the supplier yet.')).toBeTruthy()
    // Tab counts come from the overview.
    expect(screen.getByRole('tab', { name: /Bills\s*23/ })).toBeTruthy()
    // Nothing unbacked: no "pay them" shortcut, no "added by". Adding to a run needs invoice.payment.manage.
    expect(screen.queryByText('Add to a payment run')).toBeNull()
    expect(screen.queryByText('Pay them')).toBeNull()
    expect(screen.queryByText('Added by')).toBeNull()
  })

  it('pages the bills tab, folds a reversal into its payment, and lists orders', async () => {
    renderSupplier()
    fireEvent.click(await screen.findByRole('tab', { name: /Bills/ }))
    expect(await screen.findByRole('link', { name: 'QMS-19' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: /Payments/ }))
    expect(await screen.findByText('Reversed')).toBeTruthy()
    expect(screen.getAllByText('50.000')).toHaveLength(1)

    fireEvent.click(screen.getByRole('tab', { name: /Orders/ }))
    expect(await screen.findByText('PO-0033')).toBeTruthy()
    expect(screen.getByText('Sent')).toBeTruthy()
    expect(calls('GET', '/api/v1/purchase-orders?')[0][0]).toContain(`supplierId=${ID}`)
  })

  it('makes a contact the main one in one call, with the version it was read at', async () => {
    renderSupplier()
    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }))
    const dialog = await screen.findByRole('dialog', { name: 'Contacts' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make main' }))

    await waitFor(() => expect(calls('POST', `${ONE}/contacts/c-2/make-main`)).toHaveLength(1))
    expect(JSON.parse((calls('POST', `${ONE}/contacts/c-2/make-main`)[0][1] as RequestInit).body as string)).toEqual({ version: 5 })
    await waitFor(() => expect(within(dialog).getAllByRole('button', { name: 'Make main' })).toHaveLength(1))
  })

  it('asks a new contact for a way to reach them before saving', async () => {
    renderSupplier()
    fireEvent.click(await screen.findByRole('button', { name: 'Manage' }))
    const dialog = await screen.findByRole('dialog', { name: 'Contacts' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add contact' }))
    fireEvent.change(within(dialog).getByLabelText(/Full name/), { target: { value: 'Salim' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save contact' }))

    expect(await within(dialog).findByText(/Add an email, a telephone or a mobile number/)).toBeTruthy()
    expect(calls('POST', `${ONE}/contacts`)).toHaveLength(0)
    // A second MAIN is never offered as a purpose.
    expect(within(within(dialog).getByLabelText('Purpose')).queryByRole('option', { name: 'Main' })).toBeNull()
  })

  it('switches a supplier off after confirming, and says so', async () => {
    renderSupplier()
    fireEvent.click(await screen.findByRole('button', { name: 'Switch this supplier off' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Their bills, payments and papers stay exactly as they are/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch them off' }))

    expect(await screen.findByText('Supplier switched off.')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Switch back on' })).toBeTruthy()
  })

  it('exports this year’s statement', async () => {
    renderSupplier()
    await screen.findByRole('heading', { level: 1, name: 'Qalhat Marine Supplies LLC' })
    fireEvent.click(screen.getByRole('button', { name: 'Statement' }))
    fireEvent.click(await screen.findByText('Statement as PDF'))
    await waitFor(() => expect(calls('GET', `${ONE}/statement.pdf`)).toHaveLength(1))
    const url = String(calls('GET', `${ONE}/statement.pdf`)[0][0])
    expect(url).toMatch(/from=\d{4}-01-01/)
  })

  it('offers nothing to change to someone who may only read suppliers', async () => {
    who = { ...MANAGER, permissions: ['supplier.read', 'purchase-order.read'] }
    renderSupplier()
    expect(await screen.findByText('Laila Al Harthy')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Edit supplier/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Attach document' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Switch this supplier off' })).toBeNull()
  })
})
