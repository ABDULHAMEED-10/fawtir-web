import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import QRCode from 'qrcode'
import i18n from '../../i18n'
import { PosTodayPage } from './PosTodayPage'
import { PosDonePage } from './PosDonePage'
import {
  forgetEntitlements,
  loadEntitlements,
  type Entitlements,
} from '../../lib/identity/entitlements'
import { resetPosQueue } from '../../lib/posQueue'
import { resetOpenSale, setFinishedSale } from '../../lib/posSale'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { NO_SALE_DISCOUNT, receiptStamp, totalsFor } from '../../lib/pos'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import type { PosSaleDto, PosTodaySaleRow } from '../../api/pos/pos'

// The till never encodes a QR: the receipt and its reprint show the server's PNG. Spied so a test
// can prove the encoder was not reached at all.
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,x') } }))

/** QR E-5: "Print receipt" on the day's list reprints a filed online sale from GET /pos/sales/{id}. */

const TILL = {
  id: 'till-1',
  branchId: 'b-1',
  number: 1,
  code: 'T01',
  seriesBase: 'NZW-T01',
  name: 'Till 1',
  status: 'ACTIVE',
  defaultFloat: 30,
  version: 0,
  openShift: {
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    openedAt: '2026-10-28T03:00:00Z',
  },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

const CASHIER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  tenantName: 'Workspace Display Name',
  roles: [],
  permissions: ['pos.read', 'pos.sell'],
  scopes: [],
  featureFlags: {},
}

/** Today's profile, different from the frozen seller: a reprint must never print it. */
const LIVE_PROFILE = {
  legalName: 'Renamed Live Trading LLC',
  taxNumber: 'OM1100099999',
  registeredAddress: 'Live Street 1',
  registeredCity: 'Live City',
}

const SOLD_AT = '2026-10-29T10:00:00Z'

function sale(overrides: Partial<PosSaleDto> = {}): PosSaleDto {
  return {
    saleId: 's-1',
    tillId: 'till-1',
    tillNumber: 1,
    branchId: 'b-1',
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    invoiceId: 'inv-1',
    invoiceNumber: 'NZW-T01-INV-2026-000049',
    transactionType: 'SIMPLIFIED',
    customerKind: 'WALK_IN',
    customerId: 'c-walk-in',
    issueDate: '2026-10-29',
    soldAt: SOLD_AT,
    receivedAt: SOLD_AT,
    queuedOffline: false,
    totals: { subtotal: 5.38, itemDiscount: 0, headerDiscount: 0, taxable: 5.38, vat: 0.269, total: 5.649 },
    payments: [
      { method: 'CASH', amount: 5.649, cardApprovalCode: null, reference: null, tendered: 6, change: 0.351 },
    ],
    onAccount: 0,
    tip: 0,
    tipMethod: null,
    receipt: {
      invoiceTotal: 5.649,
      tip: 0,
      totalPaid: 5.649,
      onAccount: 0,
      qr: { status: 'READY', payload: 'AQxBbCBOb29yIFRyYWRpbmc=', pngUrl: null },
      seller: {
        legalName: 'Al Noor Trading LLC',
        vatNumber: 'OM1100012345',
        streetName: 'Way 2410',
        additionalStreetName: null,
        buildingNumber: null,
        cityName: 'Muscat',
        postalZone: null,
        countrySubentity: null,
        countryCode: 'OM',
      },
    },
    filing: { dispatchState: 'DISPATCHED', tddStatus: null, acceptedAt: '2026-10-29T10:00:01Z', channel: 'TAX_AUTHORITY' },
    warnings: [],
    ...overrides,
  }
}

function row(overrides: Partial<PosTodaySaleRow>): PosTodaySaleRow {
  return {
    saleId: 's-1',
    invoiceId: 'inv-1',
    invoiceNumber: 'NZW-T01-INV-2026-000049',
    soldAt: SOLD_AT,
    time: '14:00',
    tillId: 'till-1',
    tillNumber: 1,
    shiftId: 'sh-1',
    cashier: { userId: 'u-1', name: 'Maryam' },
    summary: 'Flat white',
    items: 1,
    customer: { kind: 'WALK_IN', customerId: 'c-walk-in', name: null },
    transactionType: 'SIMPLIFIED',
    paymentTerms: 'NET0',
    payMethod: 'CASH',
    payments: [],
    total: 5.649,
    tip: 0,
    onAccount: 0,
    changeGiven: 0,
    credit: { state: 'NONE', credited: 0, creditNoteNumbers: [] },
    displayState: 'filed',
    filing: null,
    refundable: false,
    queuedOffline: false,
    ...overrides,
  }
}

const ROWS = [
  row({}),
  row({ saleId: 's-2', invoiceId: 'inv-2', invoiceNumber: 'NZW-T01-INV-2026-000050', queuedOffline: true }),
]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let saleAnswer: PosSaleDto
let fetchMock: ReturnType<typeof vi.fn>
const requested = () => fetchMock.mock.calls.map(([input]) => String(input))

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  vi.mocked(QRCode.toDataURL).mockClear()
  saleAnswer = sale()
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/v1/me/entitlements') return json(CASHIER)
    if (url === '/api/v1/company-profile') return json(LIVE_PROFILE)
    if (url === '/api/v1/branches') {
      return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
    }
    if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
    if (url.startsWith('/api/v1/pos/sales?')) {
      return json({ branchId: 'b-1', businessDate: '2026-10-29', page: 0, size: 50, totalElements: 2, content: ROWS })
    }
    if (url.startsWith('/api/v1/pos/sales/s-1')) return json(saleAnswer)
    return json({ type: 'about:blank', status: 404 }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function renderToday() {
  await loadEntitlements()
  render(
    <MemoryRouter initialEntries={['/pos/today']}>
      <Routes>
        <Route path="/pos/today" element={<PosTodayPage />} />
      </Routes>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getAllByRole('button', { name: i18n.t('pos.today.rowMenu') })).toHaveLength(2))
}

/** Opens a row's ⋮ menu and presses "Print the receipt". */
function printFromRow(index: number) {
  fireEvent.click(screen.getAllByRole('button', { name: i18n.t('pos.today.rowMenu') })[index])
  fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('pos.today.printReceipt') }))
}

const qrSrc = (scope: HTMLElement) =>
  within(scope).getByAltText(i18n.t('pos.done.qrAlt')).getAttribute('src')

/** The receipt's first row: the invoice number and the day and time it states beside it. */
function numberRow(scope: HTMLElement, invoiceNumber: string): string {
  // A receipt row is the label and, beside it, its value set left to right.
  const label = within(scope)
    .getAllByText(invoiceNumber)
    .find((element) => element.nextElementSibling?.getAttribute('dir') === 'ltr')
  if (!label) throw new Error('no number row')
  return `${label.textContent} | ${label.nextElementSibling!.textContent}`
}

describe('reprinting a filed online sale from the day', () => {
  it('reprints from GET /pos/sales/{id}: frozen seller, number, Muscat time and the server QR', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    expect(await within(dialog).findByText('Al Noor Trading LLC')).toBeTruthy()
    expect(within(dialog).getByText('OM1100012345')).toBeTruthy()
    expect(numberRow(dialog, 'NZW-T01-INV-2026-000049')).toContain(receiptStamp(SOLD_AT, 'en-GB'))
    expect(qrSrc(dialog)).toBe('/api/v1/pos/sales/s-1/qr')
    // Never the live profile, though this reader may see it.
    expect(within(dialog).queryByText(LIVE_PROFILE.legalName)).toBeNull()
    expect(within(dialog).queryByText(LIVE_PROFILE.taxNumber)).toBeNull()
    expect(requested()).toContain('/api/v1/pos/sales/s-1?wait=0')
    // No QR is built on the device, from the payload or anything else.
    expect(QRCode.toDataURL).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('pos.done.printAgain') }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('prints no QR when the server says the sale has none', async () => {
    saleAnswer = sale({
      customerKind: 'BUSINESS',
      receipt: { ...sale().receipt, qr: { status: 'NOT_APPLICABLE', payload: null, pngUrl: null } },
    })
    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    await within(dialog).findByText('Al Noor Trading LLC')
    expect(within(dialog).queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
    expect(QRCode.toDataURL).not.toHaveBeenCalled()
  })

  it('leaves a sale queued offline as it was: no reprint is read or shown', async () => {
    await renderToday()
    printFromRow(1)
    expect(screen.queryByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })).toBeNull()
    expect(requested().some((url) => url.startsWith('/api/v1/pos/sales/s-2'))).toBe(false)
  })
})

describe('a reprint equals the receipt printed after the sale', () => {
  it('has the same number, date, time and QR as the original, from the same response', async () => {
    const answered = sale()
    const totals = totalsFor(SAMPLE_SALE, NO_SALE_DISCOUNT)
    // What the payment screen hands the receipt: the server's sale, and the soldAt it sent.
    setFinishedSale({
      lines: SAMPLE_SALE,
      totals,
      tip: 0,
      change: 0,
      company: null,
      payments: [{ method: 'cash', amount: totals.sale }],
      sale: answered,
      queuedNumber: null,
      finishedAt: answered.soldAt,
    })
    await loadEntitlements()
    const original = render(
      <MemoryRouter initialEntries={['/pos/receipt']}>
        <Routes>
          <Route path="/pos/receipt" element={<PosDonePage />} />
          <Route path="/pos" element={<p>the sale screen</p>} />
        </Routes>
      </MemoryRouter>,
    )
    const paper = await screen.findByRole('main')
    await within(paper).findByAltText(i18n.t('pos.done.qrAlt'))
    const originalRow = numberRow(paper, answered.invoiceNumber)
    const originalQr = qrSrc(paper)
    original.unmount()

    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    await within(dialog).findByAltText(i18n.t('pos.done.qrAlt'))
    expect(numberRow(dialog, answered.invoiceNumber)).toBe(originalRow)
    expect(qrSrc(dialog)).toBe(originalQr)
    expect(QRCode.toDataURL).not.toHaveBeenCalled()
  })
})
