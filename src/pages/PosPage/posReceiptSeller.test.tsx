import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { SAMPLE_SALE } from '../../lib/posTestSale'
import { PosDonePage } from './PosDonePage'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import { resetOpenSale, setFinishedSale } from '../../lib/posSale'
import { resetPosQueue } from '../../lib/posQueue'
import { NO_SALE_DISCOUNT, totalsFor } from '../../lib/pos'
import { resetSharedRequests } from '../../api'
import { forgetWorkingBranch } from '../../lib/workingBranch'
import { receiptSellerHeader } from '../../lib/posReceiptSeller'
import type { PosReceiptSellerDto } from '../../api/pos/pos'

/**
 * The receipt's seller (CMP-5 S-A, owner round 8): printed from `receipt.seller`, the seller frozen
 * on the issued invoice, for a cashier who cannot read the company profile; never filled from the
 * live profile or the workspace name when an older invoice recorded less (requirement 7); the old
 * header only when the server sends no `seller` key at all, or before the server has answered
 * (requirement 8). Before it has answered, a sale queued with the till's QR profile prints that
 * profile's seller, the one its QR names, without an address and never the live profile (owner
 * decision 3, OWNER-RC5-DECISIONS-20261107g).
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

/** Today's profile, deliberately different from every frozen value below. */
const LIVE_PROFILE = {
  legalName: 'Renamed Live Trading LLC',
  taxNumber: 'OM1100099999',
  registeredAddress: 'Live Street 1',
  registeredCity: 'Live City',
}

const FROZEN: PosReceiptSellerDto = {
  legalName: 'Al Noor Trading LLC',
  vatNumber: 'OM1100012345',
  streetName: 'Way 2410',
  additionalStreetName: 'Al Khuwair',
  buildingNumber: 'Building 7',
  cityName: 'Muscat',
  postalZone: '133',
  countrySubentity: 'Muscat',
  countryCode: 'OM',
}

const NOTHING: PosReceiptSellerDto = {
  legalName: null,
  vatNumber: null,
  streetName: null,
  additionalStreetName: null,
  buildingNumber: null,
  cityName: null,
  postalZone: null,
  countrySubentity: null,
  countryCode: null,
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })

let profileReadable: boolean

beforeEach(async () => {
  await i18n.changeLanguage('en')
  resetOpenSale(SAMPLE_SALE)
  resetPosQueue()
  resetSharedRequests()
  forgetEntitlements()
  forgetWorkingBranch()
  window.localStorage.clear()
  profileReadable = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/v1/me/entitlements') return json(CASHIER)
      if (url === '/api/v1/company-profile') {
        return profileReadable
          ? json(LIVE_PROFILE)
          : json({ type: 'about:blank', status: 403, code: 'ACCESS_DENIED' }, 403)
      }
      if (url === '/api/v1/branches') {
        return json([{ id: 'b-1', code: 'NZW', name: 'Nizwa', type: 'BRANCH', city: 'Nizwa' }])
      }
      if (url.startsWith('/api/v1/pos/tills')) return json([TILL])
      return json({ type: 'about:blank', status: 404 }, 404)
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

/** The seller in the till's QR profile, deliberately different from every value above. */
const QUEUED_SELLER = { name: 'Till Copy Trading LLC', vatNumber: 'OM1100077777' }

/**
 * A sale the server answered; `seller` left out entirely models a server before S-A. `queuedSeller`
 * is set only to prove an answered sale never prints it.
 */
function finish(seller: PosReceiptSellerDto | 'absent', queuedSeller: typeof QUEUED_SELLER | null = null) {
  const totals = totalsFor(SAMPLE_SALE, NO_SALE_DISCOUNT)
  const receipt: Record<string, unknown> = {
    invoiceTotal: 5.649,
    tip: 0,
    // A walk-in receipt prints only with its READY QR (coordinator ruling on QW4R-2).
    qr: { status: 'READY', payload: 'AQ==', pngUrl: null },
  }
  if (seller !== 'absent') receipt.seller = seller
  setFinishedSale({
    lines: SAMPLE_SALE,
    totals,
    tip: 0,
    change: 0,
    company: null,
    payments: [{ method: 'cash', amount: totals.sale }],
    sale: {
      saleId: 's-1',
      invoiceNumber: 'NZW-T01-INV-2026-000049',
      transactionType: 'SIMPLIFIED',
      receivedAt: '2026-10-29T10:00:00Z',
      cashier: { userId: 'u-1', name: 'Maryam' },
      receipt,
      filing: { dispatchState: 'DISPATCHED', acceptedAt: '2026-10-29T10:00:01Z' },
      warnings: [],
    } as never,
    queuedNumber: null,
    ...(queuedSeller ? { queuedSeller } : {}),
    finishedAt: '2026-10-29T10:00:00Z',
  })
}

/** A consumer sale the till queued offline, with the QR it printed. */
function queueOffline(queuedSeller: typeof QUEUED_SELLER | null) {
  const totals = totalsFor(SAMPLE_SALE, NO_SALE_DISCOUNT)
  setFinishedSale({
    lines: SAMPLE_SALE,
    totals,
    tip: 0,
    change: 0,
    company: null,
    payments: [{ method: 'cash', amount: totals.sale }],
    sale: null,
    queuedNumber: 'NZW-T01-INV-2026-000050',
    // The QR it printed (owner directive 2026-11-06): without one no receipt is shown at all.
    queuedQr: 'AQ==',
    ...(queuedSeller ? { queuedSeller } : {}),
    finishedAt: '2026-10-29T10:00:00Z',
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

/**
 * The page under the app shell, whose sidebar names the workspace (AccountSwitcher) on every page:
 * what the receipt prints is asked of the page, not of the sidebar.
 */
const receipt = () => screen.getByRole('main')

describe('the receipt prints the seller frozen on the issued invoice', () => {
  it('a cashier who cannot read the company profile gets the frozen name, address and VAT number', async () => {
    finish(FROZEN)
    renderReceipt()
    expect(await screen.findByText('Al Noor Trading LLC')).toBeTruthy()
    expect(screen.getByText('OM1100012345')).toBeTruthy()
    expect(screen.getByText(/Way 2410, Al Khuwair, Building 7, Muscat/)).toBeTruthy()
    expect(within(receipt()).queryByText('Workspace Display Name')).toBeNull()
  })

  it('a profile changed since the sale does not reach its receipt, even for a reader who may see it', async () => {
    profileReadable = true
    finish(FROZEN)
    renderReceipt()
    expect(await screen.findByText('Al Noor Trading LLC')).toBeTruthy()
    expect(screen.getByText('OM1100012345')).toBeTruthy()
    expect(screen.queryByText(LIVE_PROFILE.legalName)).toBeNull()
    expect(screen.queryByText(LIVE_PROFILE.taxNumber)).toBeNull()
    expect(screen.queryByText(/Live Street 1/)).toBeNull()
  })

  it('a legacy invoice that recorded no address prints the frozen name and VAT number and leaves the address out', async () => {
    profileReadable = true
    finish({ ...NOTHING, legalName: 'Al Noor Trading LLC', vatNumber: 'OM1100012345', countryCode: 'OM' })
    renderReceipt()
    expect(await screen.findByText('Al Noor Trading LLC')).toBeTruthy()
    expect(screen.getByText('OM1100012345')).toBeTruthy()
    expect(screen.queryByText(/Live Street 1|Live City/)).toBeNull()
  })

  it('a record with nothing frozen marks name and VAT number as not recorded, never the live ones', async () => {
    profileReadable = true
    finish(NOTHING)
    renderReceipt()
    expect(await screen.findByText(i18n.t('pos.done.sellerNameNotRecorded'))).toBeTruthy()
    expect(
      screen.getByText(`${i18n.t('pos.done.vat')} ${i18n.t('pos.done.notRecorded')}`),
    ).toBeTruthy()
    expect(screen.queryByText(LIVE_PROFILE.legalName)).toBeNull()
    expect(screen.queryByText(LIVE_PROFILE.taxNumber)).toBeNull()
    expect(within(receipt()).queryByText('Workspace Display Name')).toBeNull()
  })

  it('an older server, which sends no seller at all, keeps the receipt as it was', async () => {
    profileReadable = true
    finish('absent')
    renderReceipt()
    expect(await screen.findByText(LIVE_PROFILE.legalName)).toBeTruthy()
    expect(await screen.findByText(LIVE_PROFILE.taxNumber)).toBeTruthy()
    expect(screen.queryByText(i18n.t('pos.done.sellerNameNotRecorded'))).toBeNull()
  })

  it('an older server with the profile refused (403) keeps the workspace name, never a till copy', async () => {
    finish('absent', QUEUED_SELLER)
    renderReceipt()
    expect(await within(receipt()).findByText('Workspace Display Name')).toBeTruthy()
    expect(screen.queryByText(QUEUED_SELLER.name)).toBeNull()
    expect(screen.queryByText(QUEUED_SELLER.vatNumber)).toBeNull()
  })

  it('an issued sale with the profile refused (403) prints the frozen seller, never a till copy', async () => {
    finish(FROZEN, QUEUED_SELLER)
    renderReceipt()
    expect(await screen.findByText('Al Noor Trading LLC')).toBeTruthy()
    expect(screen.getByText('OM1100012345')).toBeTruthy()
    expect(screen.queryByText(QUEUED_SELLER.name)).toBeNull()
    expect(screen.queryByText(QUEUED_SELLER.vatNumber)).toBeNull()
  })
})

describe('a sale queued offline has no issued invoice yet', () => {
  it('with the till’s QR profile seller, prints its name and VAT number and no address', async () => {
    queueOffline(QUEUED_SELLER)
    renderReceipt()
    expect(await within(receipt()).findByText(QUEUED_SELLER.name)).toBeTruthy()
    expect(within(receipt()).getByText(QUEUED_SELLER.vatNumber)).toBeTruthy()
    expect(within(receipt()).queryByText('Workspace Display Name')).toBeNull()
    expect(screen.queryByText(/Live Street 1|Live City|Way 2410/)).toBeNull()
    expect(screen.queryByText(i18n.t('pos.done.sellerNameNotRecorded'))).toBeNull()
  })

  it('without one, prints the workspace name and no VAT number, as it always did', async () => {
    queueOffline(null)
    renderReceipt()
    expect(await within(receipt()).findByText('Workspace Display Name')).toBeTruthy()
    expect(within(receipt()).queryByText(/OMd{10}/)).toBeNull()
    expect(screen.queryByText(i18n.t('pos.done.sellerNameNotRecorded'))).toBeNull()
  })

  it('a readable live profile that differs never replaces the seller the QR names', async () => {
    profileReadable = true
    queueOffline(QUEUED_SELLER)
    renderReceipt()
    expect(await within(receipt()).findByText(QUEUED_SELLER.name)).toBeTruthy()
    expect(within(receipt()).getByText(QUEUED_SELLER.vatNumber)).toBeTruthy()
    // The profile read has answered by now: the header still names the queued seller.
    await vi.waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input))
      expect(calls).toContain('/api/v1/company-profile')
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(within(receipt()).getByText(QUEUED_SELLER.name)).toBeTruthy()
    expect(screen.queryByText(LIVE_PROFILE.legalName)).toBeNull()
    expect(screen.queryByText(LIVE_PROFILE.taxNumber)).toBeNull()
    expect(screen.queryByText(/Live Street 1|Live City/)).toBeNull()
  })

  it('a queued sale with no QR profile seller keeps the live profile, as it always did', async () => {
    profileReadable = true
    queueOffline(null)
    renderReceipt()
    expect(await screen.findByText(LIVE_PROFILE.legalName)).toBeTruthy()
    expect(await screen.findByText(LIVE_PROFILE.taxNumber)).toBeTruthy()
  })
})

describe('receiptSellerHeader', () => {
  const live = { legalName: 'Live LLC', taxNumber: 'OM1', registeredAddress: 'L1', registeredCity: 'C' }

  it('absent is an older server: the live header as before', () => {
    expect(receiptSellerHeader(undefined, live, 'Workspace')).toEqual({
      source: 'live',
      name: 'Live LLC',
      address: 'L1, C',
      vatNumber: 'OM1',
    })
    expect(receiptSellerHeader(undefined, null, 'Workspace')).toEqual({
      source: 'live',
      name: 'Workspace',
      address: '',
      vatNumber: null,
    })
  })

  it('the queued sale’s seller comes before the live profile and the workspace name, never before a frozen one', () => {
    const queued = { name: 'Till LLC', vatNumber: 'OM7' }
    expect(receiptSellerHeader(undefined, null, 'Workspace', queued)).toEqual({
      source: 'live',
      name: 'Till LLC',
      address: '',
      vatNumber: 'OM7',
    })
    expect(receiptSellerHeader(undefined, live, 'Workspace', queued)).toEqual({
      source: 'live',
      name: 'Till LLC',
      address: '',
      vatNumber: 'OM7',
    })
    expect(receiptSellerHeader(FROZEN, null, 'Workspace', queued)).toEqual(
      receiptSellerHeader(FROZEN, null, 'Workspace'),
    )
    expect(receiptSellerHeader(undefined, null, 'Workspace', { name: ' ', vatNumber: '' })).toEqual({
      source: 'live',
      name: 'Workspace',
      address: '',
      vatNumber: null,
    })
  })

  it('present but incomplete is an older invoice: frozen values only, gaps stay null', () => {
    expect(receiptSellerHeader({ ...NOTHING, vatNumber: 'OM1100012345' }, live, 'Workspace')).toEqual({
      source: 'frozen',
      name: null,
      address: '',
      vatNumber: 'OM1100012345',
    })
  })

  it('a blank frozen value counts as not recorded', () => {
    expect(receiptSellerHeader({ ...FROZEN, legalName: '  ', vatNumber: '' }, live, 'W')).toMatchObject({
      source: 'frozen',
      name: null,
      vatNumber: null,
    })
  })

  it('null from the server is read as nothing recorded, never as an older server', () => {
    expect(receiptSellerHeader(null, live, 'Workspace')).toEqual({
      source: 'frozen',
      name: null,
      address: '',
      vatNumber: null,
    })
  })

  it('the Arabic of both new sentences exists and differs from the English (native sign-off pending)', () => {
    for (const key of ['pos.done.sellerNameNotRecorded', 'pos.done.notRecorded']) {
      const ar = i18n.t(key, { lng: 'ar' })
      expect(ar).not.toBe(key)
      expect(ar).not.toBe(i18n.t(key, { lng: 'en' }))
    }
  })
})
