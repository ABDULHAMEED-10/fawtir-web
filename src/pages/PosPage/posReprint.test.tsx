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
import { NO_SALE_DISCOUNT, omr, receiptStamp, toBaisa, totalsFor } from '../../lib/pos'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import type { PosSaleDto, PosTodaySaleRow } from '../../api/pos/pos'

// The till never encodes a QR: the receipt and its reprint show the server's PNG. Spied so a test
// can prove the encoder was not reached at all.
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,x') } }))

// What the reprint does once the lines are settled (QW4R-5). The gate itself is pinned off, as it
// ships, in posReprintGate.test.tsx.
vi.mock('../../lib/posReprintGate', () => ({ REPRINT_LINES_SETTLED: true }))

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
      // Not served by any backend yet (QRW2-BE-1): the shape the reprint waits for.
      lines: [{ description: 'Flat white', quantity: 2, unitPrice: 2.69, amount: 5.38, vatCategory: 'S', vatRate: 5 }],
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

const QUEUED_ROW = row({
  saleId: 's-2',
  invoiceId: 'inv-2',
  invoiceNumber: 'NZW-T01-INV-2026-000050',
  queuedOffline: true,
})

let rows: PosTodaySaleRow[]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let saleAnswer: PosSaleDto
let queuedAnswer: PosSaleDto
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
  queuedAnswer = sale({
    saleId: 's-2',
    invoiceId: 'inv-2',
    invoiceNumber: 'NZW-T01-INV-2026-000050',
    queuedOffline: true,
  })
  rows = [row({}), QUEUED_ROW]
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/v1/me/entitlements') return json(CASHIER)
    if (url === '/api/v1/company-profile') return json(LIVE_PROFILE)
    if (url === '/api/v1/branches') {
      return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
    }
    if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
    if (url.startsWith('/api/v1/pos/sales?')) {
      return json({ branchId: 'b-1', businessDate: '2026-10-29', page: 0, size: 50, totalElements: rows.length, content: rows })
    }
    if (url.startsWith('/api/v1/pos/sales/s-1')) return json(saleAnswer)
    if (url.startsWith('/api/v1/pos/sales/s-2')) return json(queuedAnswer)
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
  await waitFor(() => expect(screen.getAllByRole('button', { name: i18n.t('pos.today.rowMenu') })).toHaveLength(rows.length))
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
    // Pinned, not only compared with itself: 10:00 UTC is 14:00 in Muscat (QW2R-4).
    expect(numberRow(dialog, 'NZW-T01-INV-2026-000049')).toBe('NZW-T01-INV-2026-000049 | 29 Oct, 14:00')
    // COPY is on the sheet that prints, in both languages, and the sheet is the one marked for print.
    const sheet = dialog.querySelector('.fawtir-print-sheet') as HTMLElement
    expect(sheet).toBeTruthy()
    expect(within(sheet).getByText('COPY')).toBeTruthy()
    expect(within(sheet).getByText('نسخة')).toBeTruthy()
    expect(within(sheet).getByText('2 × Flat white')).toBeTruthy()
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

})

// Owner directive 2026-11-06 item F: a filed queued sale reprints from the server's answer only,
// with the QR the server serves for it (frozen at the till's printedQr), never from this device.
describe('reprinting a filed sale that was queued offline', () => {
  it('prints the server QR once the answer carries lines and a READY QR', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await renderToday()
    printFromRow(1)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    expect(await within(dialog).findByText('Al Noor Trading LLC')).toBeTruthy()
    expect(numberRow(dialog, 'NZW-T01-INV-2026-000050')).toBe('NZW-T01-INV-2026-000050 | 29 Oct, 14:00')
    expect(qrSrc(dialog)).toBe('/api/v1/pos/sales/s-2/qr')
    expect(requested()).toContain('/api/v1/pos/sales/s-2?wait=0')
    expect(QRCode.toDataURL).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('pos.done.printAgain') }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['PENDING', { status: 'PENDING', payload: null, pngUrl: null }],
    ['NOT_APPLICABLE', { status: 'NOT_APPLICABLE', payload: null, pngUrl: null }],
  ] as const)('prints nothing while its QR is %s, and says the reprint is unavailable', async (_status, qr) => {
    queuedAnswer = { ...queuedAnswer, receipt: { ...queuedAnswer.receipt, qr: { ...qr } } }
    await renderToday()
    printFromRow(1)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    expect(await within(dialog).findByText(i18n.t('pos.today.reprintUnavailable'))).toBeTruthy()
    expect(dialog.querySelector('.fawtir-print-sheet')).toBeNull()
    expect(
      (within(dialog).getByRole('button', { name: i18n.t('pos.done.printAgain') }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('prints nothing without lines, as an online sale', async () => {
    queuedAnswer = { ...queuedAnswer, receipt: { ...queuedAnswer.receipt, lines: undefined } }
    await renderToday()
    printFromRow(1)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    expect(await within(dialog).findByText(i18n.t('pos.today.reprintUnavailable'))).toBeTruthy()
    expect(dialog.querySelector('.fawtir-print-sheet')).toBeNull()
  })

  it('is not offered while the queued sale still waits to be filed', async () => {
    rows = [row({}), { ...QUEUED_ROW, displayState: 'waiting' }]
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

describe('the reprint waits for the lines and buyer (ruling QW2R-1)', () => {
  const unavailable = () => i18n.t('pos.today.reprintUnavailable')
  const printButton = (dialog: HTMLElement) =>
    within(dialog).getByRole('button', { name: i18n.t('pos.done.printAgain') }) as HTMLButtonElement

  it("prints nothing for today's answer, which carries no lines, and says so", async () => {
    saleAnswer = sale({ receipt: { ...sale().receipt, lines: undefined } })
    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    expect(await within(dialog).findByText(unavailable())).toBeTruthy()
    expect(dialog.querySelector('.fawtir-print-sheet')).toBeNull()
    expect(within(dialog).queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
    expect(printButton(dialog).disabled).toBe(true)
  })

  it('prints nothing for a full invoice whose answer has lines but no buyer', async () => {
    saleAnswer = sale({ transactionType: 'FULL_TAX', customerKind: 'CONSUMER' })
    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    expect(await within(dialog).findByText(unavailable())).toBeTruthy()
    expect(printButton(dialog).disabled).toBe(true)
  })

  it('prints a full invoice with its buyer once the answer carries one', async () => {
    saleAnswer = sale({
      transactionType: 'FULL_TAX',
      customerKind: 'BUSINESS',
      receipt: {
        ...sale().receipt,
        qr: { status: 'NOT_APPLICABLE', payload: null, pngUrl: null },
        buyer: { name: 'Sohar Port Logistics', vatNumber: 'OM1100999001', identifierScheme: null, identifierValue: null },
      },
    })
    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    const sheet = await waitFor(() => {
      const found = dialog.querySelector('.fawtir-print-sheet') as HTMLElement | null
      if (!found) throw new Error('no sheet yet')
      return found
    })
    expect(within(sheet).getByText('Sohar Port Logistics')).toBeTruthy()
    expect(within(sheet).getByText('OM1100999001')).toBeTruthy()
    expect(within(sheet).getByText(i18n.t('pos.done.taxInvoice'))).toBeTruthy()
    expect(within(sheet).getByText('COPY')).toBeTruthy()
    expect(printButton(dialog).disabled).toBe(false)
  })

  it('has both sentences in both languages', () => {
    for (const key of ['pos.today.reprintUnavailable', 'pos.today.reprintCopy']) {
      expect(i18n.exists(key, { lng: 'ar' })).toBe(true)
      expect(i18n.t(key, { lng: 'ar' })).not.toBe(i18n.t(key, { lng: 'en' }))
    }
  })
})

// FU2R: the rows as the backend serves them, one original till row each (PosReceiptRows).
describe('the reprint rows (FU2R)', () => {
  const unavailable = () => i18n.t('pos.today.reprintUnavailable')

  async function openReprint() {
    await renderToday()
    printFromRow(0)
    return screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
  }

  async function sheetOf(dialog: HTMLElement) {
    return waitFor(() => {
      const found = dialog.querySelector('.fawtir-print-sheet') as HTMLElement | null
      if (!found) throw new Error('no sheet yet')
      return found
    })
  }

  /** Every item row on a receipt, "qty × description | value", in order. */
  function itemRows(scope: HTMLElement): string[] {
    return Array.from(scope.querySelectorAll('*'))
      .filter(
        (element) =>
          / × /.test(element.textContent ?? '') &&
          element.children.length === 0 &&
          element.nextElementSibling?.getAttribute('dir') === 'ltr',
      )
      .map((element) => `${element.textContent} | ${element.nextElementSibling!.textContent}`)
  }

  it('prints a "Name (Size)" row at its amount, not zero', async () => {
    saleAnswer = sale({
      receipt: {
        ...sale().receipt,
        lines: [
          { description: 'Flat white (Large)', quantity: 2, unitPrice: 2.69, amount: 5.38, vatCategory: 'S', vatRate: 5 },
        ],
      },
    })
    const sheet = await sheetOf(await openReprint())
    expect(itemRows(sheet)).toEqual(['2 × Flat white (Large) | 5.380'])
  })

  const good = { description: 'Cortado', quantity: 1, unitPrice: 1.2, amount: 1.2, vatCategory: 'S', vatRate: 5 }
  it.each([
    ['a missing amount', { ...good, amount: undefined }],
    ['a null amount', { ...good, amount: null }],
    ['an amount sent as text', { ...good, amount: '1.2' }],
    ['an amount that is not unit price times quantity', { ...good, amount: 0 }],
    ['a missing unit price', { ...good, unitPrice: undefined }],
    ['a zero quantity', { ...good, quantity: 0, amount: 0 }],
    ['a blank description', { ...good, description: '  ' }],
    ['a null row', null],
  ])('prints nothing when one row has %s, though the others are good', async (_case, bad) => {
    saleAnswer = sale({ receipt: { ...sale().receipt, lines: [good, bad] as never } })
    const dialog = await openReprint()
    expect(await within(dialog).findByText(unavailable())).toBeTruthy()
    expect(dialog.querySelector('.fawtir-print-sheet')).toBeNull()
    expect(within(dialog).queryByText('1 × Cortado')).toBeNull()
  })

  it('prints nothing for a null lines value, the server saying it cannot rebuild the rows', async () => {
    saleAnswer = sale({ receipt: { ...sale().receipt, lines: null } })
    const dialog = await openReprint()
    expect(await within(dialog).findByText(unavailable())).toBeTruthy()
    expect(dialog.querySelector('.fawtir-print-sheet')).toBeNull()
  })

  // FU2R-4: the till prints omr(unitPrice(line) × qty) on whole baisa times the quantity; the server
  // sums the issued gross amounts, each quantity × unit price kept at ten places. For the same lines,
  // a fractional quantity and a half-baisa tie on an item with a priced add-on included, the
  // reprint's rows are the Done page's, character for character.
  it('equals the rows the Done page printed for the same lines, a fractional quantity included', async () => {
    const lines = [
      ...SAMPLE_SALE,
      { ...SAMPLE_SALE[2], id: 'l4', productId: 'p-tea', name: 'Saffron tea', price: 201, qty: 2.5 },
      {
        ...SAMPLE_SALE[0],
        id: 'l5',
        productId: 'p-karak',
        name: 'Karak',
        variant: { id: 'v-small', label: 'Small' },
        addOns: [{ id: 'a-cardamom', label: 'cardamom', price: 66 }],
        price: 135,
        qty: 2.5,
        rulePercent: undefined,
      },
    ]
    // What PosReceiptRows serves for them: Karak is 0.3375 + 0.165 issued, so 0.5025 to ten places.
    const served = [
      { description: 'Flat White (Large)', quantity: 2, unitPrice: 2.2, amount: 4.4, vatCategory: 'S', vatRate: 5 },
      { description: 'Cortado', quantity: 1, unitPrice: 1.2, amount: 1.2, vatCategory: 'S', vatRate: 5 },
      { description: 'Date & walnut slice', quantity: 1, unitPrice: 0.9, amount: 0.9, vatCategory: 'S', vatRate: 5 },
      { description: 'Saffron tea', quantity: 2.5, unitPrice: 0.201, amount: 0.5025, vatCategory: 'S', vatRate: 5 },
      { description: 'Karak (Small)', quantity: 2.5, unitPrice: 0.201, amount: 0.5025, vatCategory: 'S', vatRate: 5 },
    ]
    saleAnswer = sale({ receipt: { ...sale().receipt, lines: served } })
    const totals = totalsFor(lines, NO_SALE_DISCOUNT)
    setFinishedSale({
      lines,
      totals,
      tip: 0,
      change: 0,
      company: null,
      payments: [{ method: 'cash', amount: totals.sale }],
      sale: saleAnswer,
      queuedNumber: null,
      finishedAt: saleAnswer.soldAt,
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
    const printed = itemRows(paper)
    original.unmount()
    expect(printed).toEqual([
      '2 × Flat White (Large) | 4.400',
      '1 × Cortado | 1.200',
      '1 × Date & walnut slice | 0.900',
      '2.5 × Saffron tea | 0.503',
      '2.5 × Karak (Small) | 0.503',
    ])

    const sheet = await sheetOf(await openReprint())
    expect(itemRows(sheet)).toEqual(printed)
    // Through baisa the same amount would print a baisa short: why the row is not read that way.
    expect(omr(toBaisa(0.5025))).toBe('0.502')
  })
})

describe('only a filed sale is offered (QW2R-3)', () => {
  it.each([
    ['fully credited', { displayState: 'credited', credit: { state: 'FULLY', credited: 5.649, creditNoteNumbers: ['CN-1'] } }],
    ['partly credited', { credit: { state: 'PARTLY', credited: 1, creditNoteNumbers: ['CN-1'] } }],
    ['failed', { displayState: 'failed' }],
    ['waiting', { displayState: 'waiting' }],
    [
      'still queued for filing',
      { filing: { dispatchState: 'QUEUED', tddStatus: null, acceptedAt: null, channel: 'TAX_AUTHORITY' } },
    ],
    ['held for review', { attribution: 'PENDING_REVIEW', cashier: null }],
  ] as [string, Partial<PosTodaySaleRow>][])('not for a sale %s', async (_, overrides) => {
    rows = [row(overrides)]
    await renderToday()
    printFromRow(0)
    expect(screen.queryByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })).toBeNull()
    expect(requested().some((url) => url.startsWith('/api/v1/pos/sales/s-1'))).toBe(false)
  })
})

describe('the reprint QR and seller, case by case (QW2R-5)', () => {
  async function reprint() {
    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    await waitFor(() => expect(dialog.querySelector('.fawtir-print-sheet')).toBeTruthy())
    return dialog
  }

  // QW4R-2 and FU2 item 4: no receipt without its READY QR, online or queued, and no paper says the
  // QR is to come.
  it('prints nothing for PENDING, says the reprint is unavailable, and draws no QR', async () => {
    saleAnswer = sale({ receipt: { ...sale().receipt, qr: { status: 'PENDING', payload: null, pngUrl: null } } })
    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    expect(await within(dialog).findByText(i18n.t('pos.today.reprintUnavailable'))).toBeTruthy()
    expect(dialog.querySelector('.fawtir-print-sheet')).toBeNull()
    expect(within(dialog).queryByText('The QR code is not ready yet.')).toBeNull()
    expect(within(dialog).queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
    expect(QRCode.toDataURL).not.toHaveBeenCalled()
  })

  it('draws no QR for NOT_APPLICABLE even with a payload beside it', async () => {
    saleAnswer = sale({
      customerKind: 'BUSINESS',
      receipt: { ...sale().receipt, qr: { status: 'NOT_APPLICABLE', payload: 'AQxBbCBOb29y', pngUrl: '/x.png' } },
    })
    const dialog = await reprint()
    expect(within(dialog).queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
    expect(QRCode.toDataURL).not.toHaveBeenCalled()
  })

  // FU2R item 4: NOT_APPLICABLE stands only on a company or government receipt; a consumer's reprint
  // waits for READY.
  it('prints nothing for a walk-in answer of NOT_APPLICABLE', async () => {
    saleAnswer = sale({ receipt: { ...sale().receipt, qr: { status: 'NOT_APPLICABLE', payload: null, pngUrl: null } } })
    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    expect(await within(dialog).findByText(i18n.t('pos.today.reprintUnavailable'))).toBeTruthy()
    expect(dialog.querySelector('.fawtir-print-sheet')).toBeNull()
  })

  // A4FU2-7 / QB8R-6: the server stands by no receipt for a sale whose replay presented another one.
  it('prints nothing for RECEIPT_NOT_KEPT, even with lines and a payload, and says why', async () => {
    saleAnswer = sale({
      receipt: { ...sale().receipt, qr: { status: 'RECEIPT_NOT_KEPT', payload: 'AQ==', pngUrl: null } as never },
    })
    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    expect(await within(dialog).findByText(i18n.t('pos.today.reprintNotKept'))).toBeTruthy()
    expect(dialog.querySelector('.fawtir-print-sheet')).toBeNull()
    expect(within(dialog).queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
    expect(
      (within(dialog).getByRole('button', { name: i18n.t('pos.done.printAgain') }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('prints nothing for a status this build does not know, with the general wording', async () => {
    saleAnswer = sale({
      receipt: { ...sale().receipt, qr: { status: 'SOMETHING_NEW', payload: 'AQ==', pngUrl: null } as never },
    })
    await renderToday()
    printFromRow(0)
    const dialog = await screen.findByRole('dialog', { name: i18n.t('pos.today.reprintTitle') })
    expect(await within(dialog).findByText(i18n.t('pos.today.reprintUnavailable'))).toBeTruthy()
    expect(dialog.querySelector('.fawtir-print-sheet')).toBeNull()
  })

  it('an answer with no seller key prints the seller as not recorded, never the live one', async () => {
    const receipt: Partial<PosSaleDto['receipt']> = { ...sale().receipt }
    delete receipt.seller
    saleAnswer = sale({ receipt: receipt as PosSaleDto['receipt'] })
    const dialog = await reprint()
    expect(within(dialog).getByText(i18n.t('pos.done.sellerNameNotRecorded'))).toBeTruthy()
    expect(
      within(dialog).getByText(`${i18n.t('pos.done.vat')} ${i18n.t('pos.done.notRecorded')}`),
    ).toBeTruthy()
    expect(within(dialog).queryByText(LIVE_PROFILE.legalName)).toBeNull()
    expect(within(dialog).queryByText('Workspace Display Name')).toBeNull()
  })
})
