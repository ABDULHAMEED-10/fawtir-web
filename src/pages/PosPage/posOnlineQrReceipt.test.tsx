import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosDonePage } from './PosDonePage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale, setFinishedSale, type SaleCompany } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { NO_SALE_DISCOUNT, totalsFor } from '../../lib/pos'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'

/**
 * QW4R-2 (coordinator ruling on the owner directive 2026-11-06): an online consumer receipt prints
 * only with the server's READY QR. PENDING holds Print while the till waits for it; if the waits end
 * without it, or the status is one this build does not know, no receipt is printed and the cashier
 * is sent to today's sales to reprint it. A company receipt keeps its no-QR wording.
 */

const CASHIER: Entitlements = {
  userId: 'u-1',
  username: 'maryam',
  tenantId: 't-1',
  roles: [],
  permissions: ['pos.read', 'pos.sell'],
  scopes: [],
  featureFlags: {},
}

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
  openShift: { shiftId: 'sh-1', cashier: { userId: 'u-1', name: 'Maryam' }, openedAt: '2026-10-28T03:00:00Z' },
  series: { INVOICE: { series: 'NZW-T01-INV', year: 2026, nextValue: 49 } },
}

const NUMBER = 'NZW-T01-INV-2026-000049'
const COMPANY: SaleCompany = { id: 'c-1', name: 'Gulf Supplies SAOC', kind: 'BUSINESS', vat: 'OM1100055555' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

const saleWith = (status: string) => ({
  saleId: 's-1',
  invoiceNumber: NUMBER,
  transactionType: 'SIMPLIFIED',
  receivedAt: '2026-10-29T10:00:00Z',
  cashier: { userId: 'u-1', name: 'Maryam' },
  receipt: { invoiceTotal: 5.649, tip: 0, qr: { status, payload: null, pngUrl: null } },
  // Filed, so the waits end on the QR alone.
  filing: { dispatchState: 'DISPATCHED', acceptedAt: '2026-10-29T10:00:01Z' },
  warnings: [],
})

/** What each wait for the sale answers, in turn; the last one repeats. */
let polls: string[]
let release: (() => void) | null

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  polls = ['PENDING']
  release = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      if (url.startsWith('/api/v1/pos/sales/s-1')) {
        if (release === null && polls[0] === 'HOLD') {
          await new Promise<void>((resolve) => {
            release = resolve
          })
          polls.shift()
        }
        const status = polls.length > 1 ? polls.shift()! : polls[0]
        return json(saleWith(status))
      }
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

function finish(status: string, company: SaleCompany | null = null) {
  const totals = totalsFor(SAMPLE_SALE, NO_SALE_DISCOUNT)
  setFinishedSale({
    lines: SAMPLE_SALE,
    totals,
    tip: 0,
    change: 0,
    company,
    payments: [{ method: 'cash', amount: totals.sale }],
    sale: saleWith(status) as never,
    queuedNumber: null,
    finishedAt: '2026-10-29T10:00:00Z',
  })
}

const renderReceipt = () =>
  render(
    <MemoryRouter initialEntries={['/pos/receipt']}>
      <Routes>
        <Route path="/pos/receipt" element={<PosDonePage />} />
        <Route path="/pos/today" element={<p>today’s sales</p>} />
        <Route path="/pos" element={<p>the sale screen</p>} />
      </Routes>
    </MemoryRouter>,
  )

const printAgain = () => screen.queryByRole('button', { name: i18n.t('pos.done.printAgain') }) as HTMLButtonElement | null
const notReady = () => i18n.t('pos.done.receiptQrNotReady', { invoice: NUMBER })

describe('an online consumer receipt and its server QR', () => {
  it('holds Print while the QR is PENDING and the till still waits, and prints nothing saying it is to come', async () => {
    polls = ['HOLD', 'READY']
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    try {
      finish('PENDING')
      renderReceipt()
      await screen.findByText(i18n.t('pos.done.qrNotReadyShort'))
      expect(printAgain()!.disabled).toBe(true)
      fireEvent.click(printAgain()!)
      expect(print).not.toHaveBeenCalled()
      expect(screen.queryByText('The QR code is not ready yet.')).toBeNull()
      expect(screen.queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
      // The wait answers READY: the server's image, and Print.
      await waitFor(() => expect(release).not.toBeNull())
      release!()
      const image = await screen.findByAltText(i18n.t('pos.done.qrAlt'))
      expect(image.getAttribute('src')).toBe('/api/v1/pos/sales/s-1/qr')
      expect(printAgain()!.disabled).toBe(false)
      fireEvent.click(printAgain()!)
      expect(print).toHaveBeenCalledTimes(1)
    } finally {
      print.mockRestore()
    }
  })

  it('prints no tax receipt when the waits end with the QR still PENDING, and sends the cashier to the reprint', async () => {
    finish('PENDING')
    renderReceipt()
    expect(await screen.findByText(notReady(), { exact: false })).toBeTruthy()
    expect(printAgain()).toBeNull()
    expect(screen.queryByText(i18n.t('pos.done.theirReceipt'))).toBeNull()
    expect(screen.queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: i18n.t('pos.done.openToday') }))
    expect(await screen.findByText('today’s sales')).toBeTruthy()
  })

  it('prints no tax receipt for a status this build does not know', async () => {
    polls = ['LATER']
    finish('LATER')
    renderReceipt()
    expect(await screen.findByText(notReady(), { exact: false })).toBeTruthy()
    expect(printAgain()).toBeNull()
  })

  it('prints a READY receipt with the server image', async () => {
    polls = ['READY']
    finish('READY')
    renderReceipt()
    expect((await screen.findByAltText(i18n.t('pos.done.qrAlt'))).getAttribute('src')).toBe(
      '/api/v1/pos/sales/s-1/qr',
    )
    expect(printAgain()!.disabled).toBe(false)
    expect(screen.queryByText(notReady(), { exact: false })).toBeNull()
  })

  it('a consumer the server finds owes no QR (NOT_APPLICABLE) keeps the receipt with the no-QR wording', async () => {
    polls = ['NOT_APPLICABLE']
    finish('NOT_APPLICABLE')
    renderReceipt()
    expect(await screen.findByText(i18n.t('pos.done.qrNone'))).toBeTruthy()
    expect(printAgain()!.disabled).toBe(false)
    expect(screen.queryByText(notReady(), { exact: false })).toBeNull()
  })

  it.each(['NOT_APPLICABLE', 'LATER'])('a company receipt (%s) keeps its wording and prints', async (status) => {
    polls = [status]
    finish(status, COMPANY)
    renderReceipt()
    expect(await screen.findByText(i18n.t('pos.done.qrNone'))).toBeTruthy()
    expect(screen.getByText(i18n.t('pos.done.theirReceipt'))).toBeTruthy()
    expect(printAgain()!.disabled).toBe(false)
    expect(screen.queryByText(notReady(), { exact: false })).toBeNull()
  })
})
