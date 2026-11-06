import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

/** QR E-1 on the receipt of a sale queued offline: the printed QR, or "QR to follow" as before. */

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

  it.each([
    ['no QR', {}],
    ['a null QR', { queuedQr: null }],
  ])('with %s says "QR to follow" exactly as before E-1, and encodes nothing', async (_why, extra) => {
    queued(extra)
    renderReceipt()
    expect(await screen.findByText(i18n.t('pos.done.qrComing'))).toBeTruthy()
    expect(screen.getByText(i18n.t('pos.done.qrAfterFiling'))).toBeTruthy()
    expect(screen.queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
    expect(QRCode.toDataURL).not.toHaveBeenCalled()
  })

  it('a company buyer never gets one, even if a payload were present', async () => {
    queued({ queuedQr: PAYLOAD, company: COMPANY })
    renderReceipt()
    expect(await screen.findByText(i18n.t('pos.done.qrNone'))).toBeTruthy()
    expect(screen.queryByAltText(i18n.t('pos.done.qrAlt'))).toBeNull()
    expect(screen.queryByText(i18n.t('pos.done.qrComing'))).toBeNull()
    expect(QRCode.toDataURL).not.toHaveBeenCalled()
  })
})
