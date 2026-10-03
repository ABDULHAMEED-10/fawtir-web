import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { SupplierDetailDto } from '../../api/expenditure/suppliers'
import type { SupplierRecurringStandingDto } from '../../api/expenditure/recurringBills'
import { EditSupplierPage } from '../EditSupplierPage'

/**
 * Owner's decision of 1 Oct 2026 (item 30): a switched-off supplier's recurring bills are
 * paused, and the supplier's page says so in its existing switched-off notice.
 */

const ID = '22222222-2222-2222-2222-222222222222'
const ONE = `/api/v1/suppliers/${ID}`
const STANDING = `/api/v1/recurring-bills/by-supplier/${ID}`

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['supplier.read', 'supplier.manage', 'invoice.read'],
  scopes: [],
  featureFlags: {},
}

function detail(status: 'ACTIVE' | 'SWITCHED_OFF'): SupplierDetailDto {
  return {
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
      bankDetails: null,
      contactPerson: 'Accounts team',
      roleTitle: null,
      emailRecipients: ['ap@qalhat.om'],
      telephone: '+96824000000',
      mobilePhone: null,
      preferredLanguage: 'ar',
      receivingChannel: 'PEPPOL',
      requiresApprovalBeforePayment: true,
      earlyPaymentDiscountPercent: null,
      earlyPaymentDiscountDays: null,
      commercialRegistrationNumber: '1234567',
      notes: null,
      supplierCategory: 'Marine',
      selfBillingAgreement: false,
      health: [],
      supplierSince: '2026-01-01',
      switchedOffAt: status === 'SWITCHED_OFF' ? '2026-09-20T08:00:00Z' : null,
      status,
      customerStatus: 'ACTIVE',
      version: 7,
    },
    invoiceAddress: {
      attention: null,
      countryCode: 'OM',
      cityName: 'Sur',
      countrySubentity: 'South Sharqiyah',
      streetName: 'Main Street',
      buildingNumber: '1',
      additionalStreetName: null,
      poBox: null,
      postalCode: '112',
    },
    sameAsInvoicingAddress: true,
    deliveryAddress: null,
  } as SupplierDetailDto
}

const standing = (pausedBySupplierSwitchOff: number): SupplierRecurringStandingDto => ({
  supplierId: ID,
  total: 3,
  active: 0,
  paused: 3,
  pausedBySupplierSwitchOff,
  ended: 0,
})

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

const OFF =
  "This supplier is switched off. It can't be chosen for new bills until it is switched back on."
const PAUSED = 'Its recurring bills are paused while it is switched off.'

let fetchMock: ReturnType<typeof vi.fn>
let status: 'ACTIVE' | 'SWITCHED_OFF'
let standingResponse: () => Response

const reads = (url: string) => fetchMock.mock.calls.filter(([called]) => String(called) === url)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  status = 'SWITCHED_OFF'
  standingResponse = () => json(200, standing(2))
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/v1/me/entitlements') return json(200, MANAGER)
    if (url === ONE) return json(200, detail(status))
    if (url === STANDING) return standingResponse()
    // The side column's overview and the shell's own reads are not this test's subject.
    return json(404, { type: 'https://api.fawtir.om/problems/resource-not-found' })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function open() {
  return render(
    <MemoryRouter initialEntries={[`/suppliers/${ID}/edit`]}>
      <Routes>
        <Route path="/suppliers/:slug/edit" element={<EditSupplierPage />} />
        <Route path="/suppliers" element={<p>suppliers list</p>} />
        <Route path="/login" element={<p>sign-in page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("a switched-off supplier's recurring bills (item 30)", () => {
  it('says they are paused, in the notice that says the supplier is switched off', async () => {
    open()
    const notice = await screen.findByText(`${OFF} ${PAUSED}`)
    expect(notice.closest('[role="alert"]')).toBeTruthy()
    expect(reads(STANDING)).toHaveLength(1)
  })

  it('says nothing about recurring bills when none was paused with it', async () => {
    standingResponse = () => json(200, standing(0))
    open()
    expect(await screen.findByText(OFF)).toBeTruthy()
    await waitFor(() => expect(reads(STANDING)).toHaveLength(1))
    expect(screen.queryByText(new RegExp(PAUSED))).toBeNull()
  })

  it('keeps the notice as it was when the count cannot be read', async () => {
    standingResponse = () => json(403, { type: 'https://api.fawtir.om/problems/forbidden' })
    open()
    expect(await screen.findByText(OFF)).toBeTruthy()
    await waitFor(() => expect(reads(STANDING)).toHaveLength(1))
    expect(screen.queryByText(new RegExp(PAUSED))).toBeNull()
  })

  it('asks nothing and says nothing for a supplier that is on', async () => {
    status = 'ACTIVE'
    open()
    await screen.findByDisplayValue('Qalhat Marine Supplies LLC')
    expect(screen.queryByText(new RegExp('switched off'))).toBeNull()
    expect(reads(STANDING)).toHaveLength(0)
  })

  it('says it in Arabic as approved', async () => {
    await i18n.changeLanguage('ar')
    open()
    expect(await screen.findByText(/فواتيره المتكررة موقوفة ما دام موقوفًا\.$/)).toBeTruthy()
  })
})
