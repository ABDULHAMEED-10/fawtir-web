import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../../i18n'
import { resetSharedRequests } from '../../../api'
import { forgetEntitlements, type Entitlements } from '../../../lib/identity/entitlements'
import { fractionToPercent, percentToFraction } from '../../../lib/console/billingSettings'
import { ConsoleBillingSettingsPage } from './ConsoleBillingSettingsPage'
import { ConsoleSellerPage } from './ConsoleSellerPage'

const ENTITLEMENTS_URL = '/api/v1/me/entitlements'
const SETTINGS = '/api/v1/platform/billing/settings'
const SELLER = '/api/v1/platform/billing/seller'
const EXTRA = '/api/v1/platform/billing/extra-documents/settings'
const EXTRA_HISTORY = '/api/v1/platform/billing/extra-documents/settings/history?limit=50'
const SELLER_HISTORY = '/api/v1/platform/billing/seller/history?limit=50'

const MANAGER: Entitlements = {
  userId: 'u-admin',
  username: 'finance.admin',
  tenantId: 't-platform',
  roles: [{ id: 'r-1', code: 'PLATFORM_TENANT_ADMIN', name: 'Platform tenant administrator', systemRole: true }],
  permissions: ['platform.billing.read', 'platform.billing.manage'],
  scopes: [],
  featureFlags: {},
}
const SUPPORT: Entitlements = {
  ...MANAGER,
  userId: 'u-support',
  roles: [{ id: 'r-2', code: 'PLATFORM_SUPPORT', name: 'Platform support', systemRole: true }],
  permissions: ['platform.billing.read'],
}

function settings(over: Record<string, unknown> = {}) {
  return {
    version: 3, graceDays: 7, dualApprovalThreshold: '50.000', currency: 'OMR', reason: 'Launch values',
    createdBy: 'u-other', createdAt: '2026-10-14T05:00:00Z', vatRate: '0.00000', renewalBillLeadDays: 7, ...over,
  }
}

function seller(over: Record<string, unknown> = {}) {
  return {
    version: 2, legalNameEn: 'Thumb International SPC', legalNameAr: 'الإبهام العالمية ش ش و',
    legalType: 'Sole Proprietor Company (SPC)', crNumber: '1383315', taxIdentificationNumber: '1875504',
    vatNumber: null, addressEn: 'Al Khuwair, Bousher, Muscat Governorate', addressAr: null,
    reason: 'Seller from 14 Oct', createdBy: 'u-other', createdAt: '2026-10-14T05:00:00Z', ...over,
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let who: Entitlements
let answers: Record<string, (init?: RequestInit) => Response>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  resetSharedRequests()
  await i18n.changeLanguage('en')
  forgetEntitlements()
  sessionStorage.clear()
  localStorage.clear()
  who = MANAGER
  answers = {}
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === ENTITLEMENTS_URL) return json(200, who)
    const key = init?.method && init.method !== 'GET' ? `${init.method} ${url}` : url
    const answer = answers[key]
    return answer ? answer(init) : json(404, { type: 'about:blank' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/billing/settings" element={<ConsoleBillingSettingsPage />} />
        <Route path="/console/billing/seller" element={<ConsoleSellerPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function headerOf(init: RequestInit | undefined, name: string) {
  return (init?.headers as Record<string, string> | undefined)?.[name]
}

function sent(method: string, path: string) {
  const call = fetchMock.mock.calls.find(([url, init]) => url === path && init?.method === method)
  return call ? { init: call[1] as RequestInit, body: JSON.parse(String(call[1]?.body)) } : null
}

const S = (key: string, options?: Record<string, unknown>) => i18n.t(`console.billingSettings.${key}`, options)
const X = (key: string, options?: Record<string, unknown>) =>
  i18n.t(`console.billingSettings.extraDocuments.${key}`, options)

/** The page has one card per record, each with its own reason and Save. */
async function cardTitled(title: string) {
  const heading = await screen.findByRole('heading', { name: title })
  return within(heading.closest('section') as HTMLElement)
}
const billingCard = () => cardTitled(S('card'))
/** The limits card once its read has settled: the loading card is a different element. */
async function extraCard() {
  return waitFor(() => {
    const section = screen.getByRole('heading', { name: X('card') }).closest('section') as HTMLElement
    expect(within(section).queryByText(X('loading'))).toBeNull()
    return within(section)
  })
}

function limits(over: Record<string, unknown> = {}) {
  return {
    id: 'x-2', version: 2, minPerPurchase: 10, maxPerPurchase: 5000, reason: 'Launch limits',
    createdBy: 'u-other', createdAt: '2026-10-14T05:00:00Z', ...over,
  }
}
const L = (key: string, options?: Record<string, unknown>) => i18n.t(`console.seller.${key}`, options)

describe('VAT percent on the wire', () => {
  it('moves the typed percent to a five-place fraction and back without floating point', () => {
    expect(percentToFraction('5')).toBe('0.05000')
    expect(percentToFraction('5.1')).toBe('0.05100')
    expect(percentToFraction('99.999')).toBe('0.99999')
    expect(percentToFraction('0')).toBe('0.00000')
    expect(fractionToPercent('0.05000')).toBe('5')
    expect(fractionToPercent('0.05125')).toBe('5.125')
    expect(fractionToPercent('0.00000')).toBe('0')
  })
})

describe('Console › Billing settings', () => {
  it('turns VAT on with the typed rate and sends If-Match with the version read', async () => {
    answers[SETTINGS] = () => json(200, settings())
    answers[`PUT ${SETTINGS}`] = () => json(200, settings({ version: 4, vatRate: '0.05000' }))
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/settings')

    const vat = await screen.findByRole('switch', { name: S('vat') })
    expect(vat.getAttribute('aria-checked')).toBe('false')
    // Off means rate 0: no rate field to fill or to disagree with the switch.
    expect(screen.queryByRole('textbox', { name: S('vatRate') })).toBeNull()

    await user.click(vat)
    await user.type(screen.getByRole('textbox', { name: S('vatRate') }), '5')
    await user.type((await billingCard()).getByRole('textbox', { name: S('reason') }), 'VAT registered')
    await user.click((await billingCard()).getByRole('button', { name: i18n.t('console.settings.save') }))

    await waitFor(() => expect(sent('PUT', SETTINGS)).not.toBeNull())
    const put = sent('PUT', SETTINGS)!
    expect(headerOf(put.init, 'If-Match')).toBe('"3"')
    expect(put.body).toEqual({
      graceDays: 7, dualApprovalThreshold: '50.000', vatRate: '0.05000', renewalBillLeadDays: 7, reason: 'VAT registered',
    })
  })

  it('saves the payment link validity, 1 to 14 days, only on a server that has it', async () => {
    answers[SETTINGS] = () => json(200, settings({ payLinkValidityDays: null }))
    answers[`PUT ${SETTINGS}`] = () => json(200, settings({ version: 4, payLinkValidityDays: 10 }))
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/settings')

    const days = await screen.findByRole('textbox', { name: S('linkDays') })
    await user.type(days, '30')
    await user.type((await billingCard()).getByRole('textbox', { name: S('reason') }), 'Longer links')
    await user.click((await billingCard()).getByRole('button', { name: i18n.t('console.settings.save') }))
    expect(sent('PUT', SETTINGS)).toBeNull()

    await user.clear(days)
    await user.type(days, '10')
    await user.click((await billingCard()).getByRole('button', { name: i18n.t('console.settings.save') }))
    await waitFor(() => expect(sent('PUT', SETTINGS)?.body.payLinkValidityDays).toBe(10))
  })

  it('draws no payment link validity for a server without payment links', async () => {
    answers[SETTINGS] = () => json(200, settings())
    renderAt('/console/billing/settings')
    await screen.findByRole('switch', { name: S('vat') })
    expect(screen.queryByRole('textbox', { name: S('linkDays') })).toBeNull()
  })

  it('sends rate "0" when VAT is switched off', async () => {
    answers[SETTINGS] = () => json(200, settings({ vatRate: '0.05000' }))
    answers[`PUT ${SETTINGS}`] = () => json(200, settings({ version: 4 }))
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/settings')

    expect((await screen.findByRole('textbox', { name: S('vatRate') }) as HTMLInputElement).value).toBe('5')
    await user.click(screen.getByRole('switch', { name: S('vat') }))
    await user.type((await billingCard()).getByRole('textbox', { name: S('reason') }), 'No VAT on subscriptions')
    await user.click((await billingCard()).getByRole('button', { name: i18n.t('console.settings.save') }))

    await waitFor(() => expect(sent('PUT', SETTINGS)?.body.vatRate).toBe('0'))
  })

  it('refuses a rate of 0 typed with VAT on, and sends nothing', async () => {
    answers[SETTINGS] = () => json(200, settings())
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/settings')

    await user.click(await screen.findByRole('switch', { name: S('vat') }))
    await user.type(screen.getByRole('textbox', { name: S('vatRate') }), '0')
    await user.type((await billingCard()).getByRole('textbox', { name: S('reason') }), 'Try zero')
    await user.click((await billingCard()).getByRole('button', { name: i18n.t('console.settings.save') }))

    expect(await screen.findByText(S('error.percent'))).toBeTruthy()
    expect(sent('PUT', SETTINGS)).toBeNull()
  })

  it('says someone else changed them on a version conflict and reloads the newer values', async () => {
    let reads = 0
    answers[SETTINGS] = () => {
      reads += 1
      return json(200, reads === 1 ? settings() : settings({ version: 4, graceDays: 10 }))
    }
    answers[`PUT ${SETTINGS}`] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/billing-settings-version-conflict' })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/settings')

    const grace = await screen.findByRole('textbox', { name: S('graceDays') })
    await user.clear(grace)
    await user.type(grace, '14')
    await user.type((await billingCard()).getByRole('textbox', { name: S('reason') }), 'Longer grace')
    await user.click((await billingCard()).getByRole('button', { name: i18n.t('console.settings.save') }))

    expect(await screen.findByText(S('refusal.conflict'))).toBeTruthy()
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: S('graceDays') }) as HTMLInputElement).value).toBe('10'),
    )
  })

  it('shows support the values but offers no save', async () => {
    who = SUPPORT
    answers[SETTINGS] = () => json(200, settings())
    renderAt('/console/billing/settings')

    const grace = (await screen.findByRole('textbox', { name: S('graceDays') })) as HTMLInputElement
    expect(grace.value).toBe('7')
    // Disabled by its fieldset, which the property does not report.
    expect(grace.matches(':disabled')).toBe(true)
    expect(screen.getByText(S('readOnly'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: i18n.t('console.settings.save') })).toBeNull()
  })
})

describe('Console › Billing settings › Extra documents per purchase', () => {
  beforeEach(() => {
    answers[SETTINGS] = () => json(200, settings())
  })

  it('saves the limits on their own record with their version and reason, and lists earlier versions', async () => {
    answers[EXTRA] = () => json(200, limits())
    answers[EXTRA_HISTORY] = () =>
      json(200, [limits(), limits({ id: 'x-1', version: 1, minPerPurchase: 1, maxPerPurchase: 1000, reason: 'Seed', createdBy: null })])
    answers[`PUT ${EXTRA}`] = () => json(200, limits({ version: 3, minPerPurchase: 50 }))
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/settings')

    const card = await extraCard()
    const min = (await card.findByRole('textbox', { name: X('min') })) as HTMLInputElement
    expect(min.value).toBe('10')
    expect((card.getByRole('textbox', { name: X('max') }) as HTMLInputElement).value).toBe('5000')
    // The version in force is the form; the history starts after it.
    expect(await screen.findByText(X('historyEntry', { version: 1, min: '1', max: '1,000' }))).toBeTruthy()
    expect(screen.queryByText(X('historyEntry', { version: 2, min: '10', max: '5,000' }))).toBeNull()

    await user.clear(min)
    await user.type(min, '50')
    await user.type(card.getByRole('textbox', { name: S('reason') }), 'Fewer tiny purchases')
    await user.click(card.getByRole('button', { name: i18n.t('console.settings.save') }))

    await waitFor(() => expect(sent('PUT', EXTRA)).not.toBeNull())
    const put = sent('PUT', EXTRA)!
    expect(headerOf(put.init, 'If-Match')).toBe('"2"')
    expect(put.body).toEqual({ minPerPurchase: 50, maxPerPurchase: 5000, reason: 'Fewer tiny purchases' })
    // The billing settings record is untouched by this card.
    expect(sent('PUT', SETTINGS)).toBeNull()
  })

  it('refuses a maximum below the minimum or above the ceiling, and sends nothing', async () => {
    answers[EXTRA] = () => json(200, limits())
    answers[EXTRA_HISTORY] = () => json(200, [limits()])
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/settings')

    const card = await extraCard()
    const max = await card.findByRole('textbox', { name: X('max') })
    await user.clear(max)
    await user.type(max, '5')
    await user.type(card.getByRole('textbox', { name: S('reason') }), 'Typo')
    await user.click(card.getByRole('button', { name: i18n.t('console.settings.save') }))
    expect(await card.findByText(X('error.maxBelowMin'))).toBeTruthy()

    await user.clear(max)
    await user.type(max, '1000001')
    expect(await card.findByText(X('error.max', { max: '1,000,000' }))).toBeTruthy()
    expect(sent('PUT', EXTRA)).toBeNull()
  })

  it('says someone else changed the limits on a version conflict and reloads them', async () => {
    let reads = 0
    answers[EXTRA] = () => {
      reads += 1
      return json(200, reads === 1 ? limits() : limits({ version: 3, maxPerPurchase: 8000 }))
    }
    answers[EXTRA_HISTORY] = () => json(200, [limits()])
    answers[`PUT ${EXTRA}`] = () =>
      json(409, { type: 'https://api.fawtir.om/problems/billing-settings-version-conflict' })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/settings')

    const card = await extraCard()
    const max = await card.findByRole('textbox', { name: X('max') })
    await user.clear(max)
    await user.type(max, '6000')
    await user.type(card.getByRole('textbox', { name: S('reason') }), 'More per purchase')
    await user.click(card.getByRole('button', { name: i18n.t('console.settings.save') }))

    expect(await screen.findByText(X('refusal.conflict'))).toBeTruthy()
    await waitFor(async () =>
      expect(((await extraCard()).getByRole('textbox', { name: X('max') }) as HTMLInputElement).value).toBe('8000'),
    )
  })

  it('shows support the limits read-only', async () => {
    who = SUPPORT
    answers[EXTRA] = () => json(200, limits())
    answers[EXTRA_HISTORY] = () => json(200, [limits()])
    renderAt('/console/billing/settings')

    const card = await extraCard()
    const min = (await card.findByRole('textbox', { name: X('min') })) as HTMLInputElement
    expect(min.matches(':disabled')).toBe(true)
    expect(card.queryByRole('textbox', { name: S('reason') })).toBeNull()
    expect(card.queryByRole('button', { name: i18n.t('console.settings.save') })).toBeNull()
  })

  it('keeps the billing settings usable when the limits cannot be read', async () => {
    answers[EXTRA] = () => json(500, { type: 'about:blank' })
    renderAt('/console/billing/settings')

    expect(await (await billingCard()).findByRole('textbox', { name: S('graceDays') })).toBeTruthy()
    const card = await extraCard()
    expect(card.queryByRole('textbox', { name: X('min') })).toBeNull()
  })
})

describe('Console › Seller', () => {
  it('enters the first seller with If-Match "0" and sends emptied optional fields as null', async () => {
    answers[SELLER] = () => new Response(null, { status: 204 })
    answers[SELLER_HISTORY] = () => json(200, [])
    answers[`PUT ${SELLER}`] = () => json(200, seller({ version: 1 }))
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/seller')

    expect(await screen.findByText(L('none'))).toBeTruthy()
    await user.type(screen.getByRole('textbox', { name: L('legalNameEn') }), 'Thumb International SPC')
    await user.type(screen.getByRole('textbox', { name: L('crNumber') }), '1383315')
    await user.type(screen.getByRole('textbox', { name: L('tin') }), '1875504')
    await user.type(screen.getByRole('textbox', { name: L('addressEn') }), 'Al Khuwair, Bousher, Muscat Governorate')
    await user.type(screen.getByRole('textbox', { name: L('reason') }), 'First seller')
    await user.click(screen.getByRole('button', { name: i18n.t('console.settings.save') }))

    await waitFor(() => expect(sent('PUT', SELLER)).not.toBeNull())
    const put = sent('PUT', SELLER)!
    expect(headerOf(put.init, 'If-Match')).toBe('"0"')
    expect(put.body).toEqual({
      legalNameEn: 'Thumb International SPC', legalNameAr: null, legalType: null, crNumber: '1383315',
      taxIdentificationNumber: '1875504', vatNumber: null, addressEn: 'Al Khuwair, Bousher, Muscat Governorate',
      addressAr: null, reason: 'First seller',
    })
  })

  it('edits the seller in force with its version and lists the earlier versions', async () => {
    answers[SELLER] = () => json(200, seller())
    answers[SELLER_HISTORY] = () => json(200, [seller(), seller({ version: 1, legalNameEn: 'Old Name LLC', legalNameAr: null })])
    answers[`PUT ${SELLER}`] = () => json(200, seller({ version: 3 }))
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/seller')

    expect(await screen.findByText(new RegExp(`${L('version', { version: 1 })} · Old Name LLC`))).toBeTruthy()
    // The version in force is the form above; the earlier list starts after it.
    expect(screen.queryByText(new RegExp(`${L('version', { version: 2 })} ·`))).toBeNull()
    await user.type(screen.getByRole('textbox', { name: L('vatNumber') }), 'om1234567890')
    await user.type(screen.getByRole('textbox', { name: L('reason') }), 'VAT registered')
    await user.click(screen.getByRole('button', { name: i18n.t('console.settings.save') }))

    await waitFor(() => expect(sent('PUT', SELLER)).not.toBeNull())
    const put = sent('PUT', SELLER)!
    expect(headerOf(put.init, 'If-Match')).toBe('"2"')
    expect(put.body.vatNumber).toBe('OM1234567890')
    expect(put.body.legalNameAr).toBe('الإبهام العالمية ش ش و')
  })

  it('checks the VAT number before sending', async () => {
    answers[SELLER] = () => json(200, seller())
    answers[SELLER_HISTORY] = () => json(200, [seller()])
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/seller')

    await user.type(await screen.findByRole('textbox', { name: L('vatNumber') }), '12345')
    await user.type(screen.getByRole('textbox', { name: L('reason') }), 'VAT')
    await user.click(screen.getByRole('button', { name: i18n.t('console.settings.save') }))

    expect(await screen.findByText(L('error.vatNumber'))).toBeTruthy()
    expect(sent('PUT', SELLER)).toBeNull()
  })

  it('says someone else changed the seller on a version conflict', async () => {
    answers[SELLER] = () => json(200, seller())
    answers[SELLER_HISTORY] = () => json(200, [seller()])
    answers[`PUT ${SELLER}`] = () => json(409, { type: 'https://api.fawtir.om/problems/billing-seller-version-conflict' })
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/seller')

    const legalType = await screen.findByRole('textbox', { name: L('legalType') })
    await user.clear(legalType)
    await user.type(screen.getByRole('textbox', { name: L('reason') }), 'Drop the form')
    await user.click(screen.getByRole('button', { name: i18n.t('console.settings.save') }))

    expect(await screen.findByText(L('refusal.conflict'))).toBeTruthy()
  })
})
