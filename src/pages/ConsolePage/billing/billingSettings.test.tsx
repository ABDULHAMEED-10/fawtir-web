import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    await user.type(screen.getByRole('textbox', { name: S('reason') }), 'VAT registered')
    await user.click(screen.getByRole('button', { name: i18n.t('console.settings.save') }))

    await waitFor(() => expect(sent('PUT', SETTINGS)).not.toBeNull())
    const put = sent('PUT', SETTINGS)!
    expect(headerOf(put.init, 'If-Match')).toBe('"3"')
    expect(put.body).toEqual({
      graceDays: 7, dualApprovalThreshold: '50.000', vatRate: '0.05000', renewalBillLeadDays: 7, reason: 'VAT registered',
    })
  })

  it('sends rate "0" when VAT is switched off', async () => {
    answers[SETTINGS] = () => json(200, settings({ vatRate: '0.05000' }))
    answers[`PUT ${SETTINGS}`] = () => json(200, settings({ version: 4 }))
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/settings')

    expect((await screen.findByRole('textbox', { name: S('vatRate') }) as HTMLInputElement).value).toBe('5')
    await user.click(screen.getByRole('switch', { name: S('vat') }))
    await user.type(screen.getByRole('textbox', { name: S('reason') }), 'No VAT on subscriptions')
    await user.click(screen.getByRole('button', { name: i18n.t('console.settings.save') }))

    await waitFor(() => expect(sent('PUT', SETTINGS)?.body.vatRate).toBe('0'))
  })

  it('refuses a rate of 0 typed with VAT on, and sends nothing', async () => {
    answers[SETTINGS] = () => json(200, settings())
    const user = userEvent.setup({ delay: null })
    renderAt('/console/billing/settings')

    await user.click(await screen.findByRole('switch', { name: S('vat') }))
    await user.type(screen.getByRole('textbox', { name: S('vatRate') }), '0')
    await user.type(screen.getByRole('textbox', { name: S('reason') }), 'Try zero')
    await user.click(screen.getByRole('button', { name: i18n.t('console.settings.save') }))

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
    await user.type(screen.getByRole('textbox', { name: S('reason') }), 'Longer grace')
    await user.click(screen.getByRole('button', { name: i18n.t('console.settings.save') }))

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
