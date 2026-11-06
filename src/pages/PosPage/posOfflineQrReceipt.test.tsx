import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import QRCode from 'qrcode'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosDonePage } from './PosDonePage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale, setFinishedSale, type SaleCompany } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { NO_SALE_DISCOUNT, totalsFor } from '../../lib/pos'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'

// Spied so a test can prove the image is drawn from exactly the payload the queue sent.
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,x') } }))

/**
 * QR E-1 on the receipt of a sale queued offline: the printed QR, or, for a consumer whose QR could
 * not be made or drawn, no receipt at all and the reason (owner directive 2026-11-06 items C, D).
 */

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

const PAYLOAD = 'AQMxLjECAjAx'
const COMPANY: SaleCompany = { id: 'c-1', name: 'Gulf Supplies SAOC', kind: 'BUSINESS', vat: 'OM1100055555' }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  vi.mocked(QRCode.toDataURL).mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

function queued(extra: { queuedQr?: string | null; company?: SaleCompany | null }) {
  const totals = totalsFor(SAMPLE_SALE, NO_SALE_DISCOUNT)
  setFinishedSale({
    lines: SAMPLE_SALE,
    totals,
    tip: 0,
    change: 0,
    company: extra.company ?? null,
    payments: [{ method: 'cash', amount: totals.sale }],
    sale: null,
    queuedNumber: 'NZW-T01-INV-2026-000049',
    finishedAt: '2026-10-29T10:00:00Z',
    ...('queuedQr' in extra ? { queuedQr: extra.queuedQr } : {}),
  })
}

const renderReceipt = () =>
  render(
    <MemoryRouter initialEntries={['/pos/receipt']}>
      <Routes>
        <Route path="/pos/receipt" element={<PosDonePage />} />
        <Route path="/pos" element={<p>the sale screen</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('the receipt of a sale queued offline', () => {
  it('prints the QR the queue sent, drawn from exactly that payload', async () => {
    queued({ queuedQr: PAYLOAD })
    renderReceipt()
    const image = await screen.findByAltText(i18n.t('pos.done.qrAlt'))
    expect(image.getAttribute('src')).toBe('data:image/png;base64,x')
    expect(vi.mocked(QRCode.toDataURL).mock.calls.map(([payload]) => payload)).toEqual([PAYLOAD])
    expect(screen.getByText(i18n.t('pos.done.scanToCheck'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.done.qrComing'))).toBeNull()
    expect(screen.getByText(i18n.t('pos.done.qrAlreadyUp'))).toBeTruthy()
  })

  const withheld = () =>
    screen.getByText(i18n.t('pos.done.receiptWithheld', { invoice: 'NZW-T01-INV-2026-000049' }))

  /** No receipt, no Print, no QR promise: what a consumer's offline receipt is without its QR. */
  function expectNoReceipt() {
    expect(withheld()).toBeTruthy()
    expect(screen.queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
    expect(screen.queryByText(i18n.t('pos.done.qrComing'))).toBeNull()
    expect(screen.queryByText(i18n.t('pos.done.qrAfterFiling'))).toBeNull()
    expect(screen.queryByText(i18n.t('pos.done.qrAlreadyUp'))).toBeNull()
    expect(screen.queryByRole('button', { name: i18n.t('pos.done.printAgain') })).toBeNull()
    expect(screen.queryByText(i18n.t('pos.done.theirReceipt'))).toBeNull()
  }

  // Item C: the QR could not be built after the number was claimed, so the sale carries none.
  it.each([
    ['no QR', {}],
    ['a null QR', { queuedQr: null }],
  ])('with %s shows no receipt and tells the cashier why, never "QR to follow"', async (_why, extra) => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    try {
      queued(extra)
      renderReceipt()
      await screen.findByText(i18n.t('pos.done.giveReceipt'))
      expectNoReceipt()
      expect(QRCode.toDataURL).not.toHaveBeenCalled()
      expect(print).not.toHaveBeenCalled()
    } finally {
      print.mockRestore()
    }
  })

  // Review QW3R-3 under the directive: a QR that cannot be drawn is never claimed or printed.
  it('a payload the encoder refuses shows no receipt either', async () => {
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('too long') as never)
    queued({ queuedQr: PAYLOAD })
    renderReceipt()
    await waitFor(() => expect(withheld()).toBeTruthy())
    expectNoReceipt()
    expect(vi.mocked(QRCode.toDataURL).mock.calls.map(([payload]) => payload)).toEqual([PAYLOAD])
  })

  it('prints nothing and claims nothing while the QR is still being drawn', async () => {
    vi.mocked(QRCode.toDataURL).mockImplementationOnce((() => new Promise(() => {})) as never)
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    try {
      queued({ queuedQr: PAYLOAD })
      renderReceipt()
      const again = (await screen.findByRole('button', {
        name: i18n.t('pos.done.printAgain'),
      })) as HTMLButtonElement
      expect(again.disabled).toBe(true)
      fireEvent.click(again)
      expect(print).not.toHaveBeenCalled()
      expect(screen.queryByText(i18n.t('pos.done.qrAlreadyUp'))).toBeNull()
      expect(screen.queryByText(i18n.t('pos.done.qrComing'))).toBeNull()
    } finally {
      print.mockRestore()
    }
  })

  it('a company buyer never gets one, even if a payload were present', async () => {
    queued({ queuedQr: PAYLOAD, company: COMPANY })
    renderReceipt()
    expect(await screen.findByText(i18n.t('pos.done.qrNone'))).toBeTruthy()
    expect(screen.queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
    expect(screen.queryByText(i18n.t('pos.done.qrComing'))).toBeNull()
    expect(QRCode.toDataURL).not.toHaveBeenCalled()
  })

  it('a company buyer without a QR keeps its receipt, with the no-QR wording, not "QR to follow"', async () => {
    queued({ company: COMPANY })
    renderReceipt()
    expect(await screen.findByText(i18n.t('pos.done.qrNone'))).toBeTruthy()
    expect(screen.getByText(i18n.t('pos.done.theirReceipt'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.done.qrComing'))).toBeNull()
    expect(screen.queryByText(i18n.t('pos.done.qrAfterFiling'))).toBeNull()
    expect(screen.queryByText(/receipt was printed/)).toBeNull()
  })
})

// Owner directive 2026-11-06 item D, at the source: the receipt screens never name the
// "QR to follow" sentences except qrAfterFiling as the heading of an online sale whose QR status
// this build does not know (PosDonePage); no receipt part names either.
describe('"QR to follow" is gone from the offline receipt', () => {
  const source = (file: string) => readFileSync(join(process.cwd(), 'src/pages/PosPage', file), 'utf8')

  it('no receipt screen names pos.done.qrComing', () => {
    for (const file of ['PosDonePage.tsx', 'PosReceiptParts.tsx', 'PosReprint.tsx', 'PosPaymentPage.tsx']) {
      expect(source(file)).not.toContain('qrComing')
    }
  })

  it('qrAfterFiling is named once, after every queued case has its own wording', () => {
    const done = source('PosDonePage.tsx')
    expect(done.match(/qrAfterFiling/g)).toHaveLength(1)
    for (const file of ['PosReceiptParts.tsx', 'PosReprint.tsx', 'PosPaymentPage.tsx']) {
      expect(source(file)).not.toContain('qrAfterFiling')
    }
  })
})
