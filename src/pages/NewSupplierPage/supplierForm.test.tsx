import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { SupplierDetailDto } from '../../api/expenditure/suppliers'
import { blankSupplierForm, placeSupplierErrors, supplierProblems, toSupplierRequest } from '../../lib/supplierForm'
import { NewSupplierPage } from './NewSupplierPage'
import { EditSupplierPage } from '../EditSupplierPage'

const ID = '22222222-2222-2222-2222-222222222222'
const ONE = `/api/v1/suppliers/${ID}`

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['supplier.read', 'supplier.manage'],
  scopes: [],
  featureFlags: {},
}

function detail(overrides: Partial<SupplierDetailDto['profile']> = {}): SupplierDetailDto {
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
      bankDetails: {
        beneficiaryName: 'Qalhat Marine Supplies',
        iban: 'OM810180000012345678901',
        bic: 'BMUSOMRX',
        bankName: 'Bank Muscat',
        changedAt: '2026-09-01T08:00:00Z',
        confirmedAt: null,
      },
      contactPerson: 'Accounts team',
      roleTitle: null,
      emailRecipients: ['ap@qalhat.om'],
      telephone: '+96824000000',
      mobilePhone: null,
      preferredLanguage: 'ar',
      receivingChannel: 'PEPPOL',
      requiresApprovalBeforePayment: true,
      earlyPaymentDiscountPercent: 1.5,
      earlyPaymentDiscountDays: 10,
      commercialRegistrationNumber: '1234567',
      notes: null,
      supplierCategory: 'Marine',
      selfBillingAgreement: false,
      health: ['BANK_CHANGED_UNCONFIRMED'],
      supplierSince: '2026-01-01',
      switchedOffAt: null,
      status: 'ACTIVE',
      customerStatus: 'ACTIVE',
      version: 7,
      ...overrides,
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
  }
}

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  })
}

let fetchMock: ReturnType<typeof vi.fn>
let who: Entitlements
let createResponse: () => Response
let updateResponse: () => Response

const calls = (method: string, url: string) =>
  fetchMock.mock.calls.filter(([called, init]) => String(called) === url && ((init as RequestInit | undefined)?.method ?? 'GET') === method)
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  createResponse = () => json(201, detail({ health: [] }))
  updateResponse = () => json(200, detail({ version: 8 }))
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url === '/api/v1/suppliers' && method === 'POST') return createResponse()
    if (url === ONE && method === 'GET') return json(200, detail())
    if (url === ONE && method === 'PUT') return updateResponse()
    if (url === `${ONE}/bank-details/confirm`) return json(200, detail({ health: [] }))
    throw new Error(`unexpected ${method} ${url}`)
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
        <Route path="/suppliers/new" element={<NewSupplierPage />} />
        <Route path="/suppliers/:slug/edit" element={<EditSupplierPage />} />
        <Route path="/suppliers" element={<p>suppliers list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const typeInto = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('a new supplier', () => {
  it('saves once with an idempotency key and the request the API reads, then opens the record', async () => {
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { name: 'New supplier' })
    typeInto(/Legal \/ registered name/, 'Sohar Steel LLC')
    typeInto(/VAT registration number/, 'om1100447102')
    typeInto(/Peppol participant ID/, '0248:OM1100447102')
    typeInto(/Contact person/, 'Laila Al Harthy')
    typeInto(/Email/, 'ap@soharsteel.om, laila@soharsteel.om')
    typeInto(/^Telephone/, '24000000')
    typeInto(/^IBAN/, 'om81 0180 0000 1234 5678 901')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    expect(await screen.findByText('Qalhat Marine Supplies LLC was added.')).toBeTruthy()
    expect(calls('POST', '/api/v1/suppliers')).toHaveLength(1)
    const [post] = calls('POST', '/api/v1/suppliers')
    expect((post[1] as RequestInit).headers).toMatchObject({ 'Idempotency-Key': expect.stringMatching(/^supplier-.{16,}/) })
    expect(bodyOf(post)).toMatchObject({
      type: 'BUSINESS',
      legalName: 'Sohar Steel LLC',
      vatNumber: 'OM1100447102',
      registeredForVat: true,
      registeredOnPeppol: true,
      participantScheme: '0248',
      participantValue: 'OM1100447102',
      contactPerson: 'Laila Al Harthy',
      emailRecipients: ['ap@soharsteel.om', 'laila@soharsteel.om'],
      telephone: '+96824000000',
      mobilePhone: null,
      paymentTerms: 'NET30',
      receivingChannel: 'PEPPOL',
      bankDetails: { beneficiaryName: null, iban: 'OM810180000012345678901', bic: null, bankName: null },
      // Nothing was typed into the address, so none is sent.
      invoiceAddress: null,
      sameAsInvoicingAddress: true,
      deliveryAddress: null,
    })
    expect('version' in bodyOf(post)).toBe(false)
  })

  it('says what is missing or wrong and sends nothing', async () => {
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { name: 'New supplier' })
    typeInto(/VAT registration number/, 'OM99')
    typeInto(/Peppol participant ID/, 'OM1100447102')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    expect(await screen.findByText('Some fields need attention before the supplier can be saved.')).toBeTruthy()
    expect(screen.getAllByText('This field is required')).toHaveLength(2)
    expect(screen.getByText('Use OM11 or OM12 followed by 8 digits')).toBeTruthy()
    expect(screen.getByText(/Use the scheme and ID together/)).toBeTruthy()
    expect(calls('POST', '/api/v1/suppliers')).toHaveLength(0)
  })

  it('puts the server field refusals on their inputs, an address field included', async () => {
    createResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/validation-failed',
        status: 400,
        errors: [{ field: 'invoiceAddress.cityName', code: 'TOO_LONG', message: 'Address city must be 150 characters or fewer' }],
      })
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { name: 'New supplier' })
    typeInto(/Legal \/ registered name/, 'Sohar Steel LLC')
    typeInto(/VAT registration number/, 'OM1100447102')
    typeInto(/Peppol participant ID/, '0248:OM1100447102')
    typeInto(/Contact person/, 'Laila')
    typeInto(/City \/ Governorate/, 'Sohar')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    const city = await screen.findByText('This is longer than allowed')
    expect(city.closest('div')?.querySelector('input')?.id).toBe('supplier-billing-cityName')
  })

  it('names a duplicate VAT number or Peppol ID on a new supplier', async () => {
    createResponse = () => json(409, { type: 'https://api.fawtir.om/problems/resource-conflict', status: 409 })
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { name: 'New supplier' })
    typeInto(/Legal \/ registered name/, 'Sohar Steel LLC')
    typeInto(/VAT registration number/, 'OM1100447102')
    typeInto(/Peppol participant ID/, '0248:OM1100447102')
    typeInto(/Contact person/, 'Laila')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    expect(await screen.findByText('Another supplier or customer already uses this VAT number or Peppol ID.')).toBeTruthy()
  })
})

describe('an existing supplier', () => {
  it('opens with its record and saves its version without touching the bank account or the address parts it does not draw', async () => {
    renderAt(`/suppliers/${ID}/edit`)
    expect(await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' })).toBeTruthy()
    expect((screen.getByLabelText(/Contact person/) as HTMLInputElement).value).toBe('Accounts team')
    expect((screen.getByLabelText(/^Telephone/) as HTMLInputElement).value).toBe('24000000')

    typeInto(/Contact person/, 'Hamed Al Kindi')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])

    expect(await screen.findByText('Changes saved.')).toBeTruthy()
    const body = bodyOf(calls('PUT', ONE)[0])
    expect(body.version).toBe(7)
    expect(body.contactPerson).toBe('Hamed Al Kindi')
    expect(body.bankDetails).toBeNull()
    expect(body.invoiceAddress).toMatchObject({ cityName: 'Sur', countrySubentity: 'South Sharqiyah', buildingNumber: '1' })
    expect(body.earlyPaymentDiscountPercent).toBe(1.5)
  })

  it('sends a changed account with the beneficiary and bank name it had', async () => {
    renderAt(`/suppliers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' })
    typeInto(/^IBAN/, 'OM230270000098765432101')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])

    await waitFor(() => expect(calls('PUT', ONE)).toHaveLength(1))
    expect(bodyOf(calls('PUT', ONE)[0]).bankDetails).toEqual({
      beneficiaryName: 'Qalhat Marine Supplies',
      iban: 'OM230270000098765432101',
      bic: 'BMUSOMRX',
      bankName: 'Bank Muscat',
    })
  })

  it('confirms bank details that changed', async () => {
    renderAt(`/suppliers/${ID}/edit`)
    expect(await screen.findByText(/The bank details changed and nobody has confirmed them/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm bank details' }))

    expect(await screen.findByText('Bank details confirmed.')).toBeTruthy()
    expect(calls('POST', `${ONE}/bank-details/confirm`)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Confirm bank details' })).toBeNull()
  })

  it('offers no save to someone who may only read suppliers', async () => {
    who = { ...MANAGER, permissions: ['supplier.read'] }
    renderAt(`/suppliers/${ID}/edit`)
    expect(await screen.findByText('You can see this supplier but not change it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Confirm bank details' })).toBeNull()
  })
})

describe('supplier form rules', () => {
  it('asks for both halves of an early-payment discount, and a pickup address when it differs', () => {
    const values = { ...blankSupplierForm(), legalName: 'X', contactPerson: 'Y', vatNumber: 'OM1100447102', peppolId: '0248:OM1100447102' }
    expect(supplierProblems(values, null)).toEqual({})
    expect(supplierProblems({ ...values, earlyPaymentDiscountPercent: '2' }, null)).toEqual({
      earlyPaymentDiscountDays: 'supplierForm.error.discountPair',
    })
    expect(supplierProblems({ ...values, sameAsBilling: false }, null)).toEqual({ 'pickup.cityName': 'supplierForm.error.pickupRequired' })
    // A group VAT number is refused as a participant before the server says so.
    expect(supplierProblems({ ...values, peppolId: '0248:OM1200447102' }, null)).toEqual({ peppolId: 'supplierForm.error.peppolVat' })
  })

  it('does not send an address whose only value is the default country', () => {
    const request = toSupplierRequest({ ...blankSupplierForm(), legalName: 'X', contactPerson: 'Y' }, null)
    expect(request.invoiceAddress).toBeNull()
  })

  it('keeps a refusal for a field the form does not draw for a notice, in the server’s words', () => {
    const placed = placeSupplierErrors([
      { field: 'vatNumber', code: 'INVALID_FORMAT', message: 'Invalid Oman VATIN: x' },
      { field: 'logo', code: 'INVALID_FORMAT', message: 'Logo content type is unsupported' },
      { field: 'telephone', code: 'SOMETHING_NEW', message: 'Telephone is odd' },
    ])
    expect(placed.fields.vatNumber).toEqual({ key: 'validation.vatin' })
    expect(placed.fields.telephone).toEqual({ text: 'Telephone is odd' })
    expect(placed.other).toEqual(['Logo content type is unsupported'])
  })
})
