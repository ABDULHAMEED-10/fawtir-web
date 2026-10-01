import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { SupplierDetailDto } from '../../api/expenditure/suppliers'
import {
  blankSupplierForm,
  copyOfSupplier,
  placeSupplierErrors,
  supplierProblems,
  toSupplierRequest,
  withTag,
} from '../../lib/supplierForm'
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
let loaded: () => SupplierDetailDto

const calls = (method: string, url: string) =>
  fetchMock.mock.calls.filter(
    ([called, init]) =>
      String(called) === url && ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  forgetEntitlements()
  who = MANAGER
  createResponse = () => json(201, detail({ health: [] }))
  updateResponse = () => json(200, detail({ version: 8 }))
  loaded = () => detail()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url === '/api/v1/suppliers' && method === 'POST') return createResponse()
    if (url === ONE && method === 'GET') return json(200, loaded())
    if (url === ONE && method === 'PUT') return updateResponse()
    if (url === `${ONE}/bank-details/confirm`) return json(200, detail({ health: [] }))
    if (url === `${ONE}/switch-off` && method === 'POST')
      return json(200, detail({ status: 'SWITCHED_OFF', switchedOffAt: '2026-10-01T08:00:00Z' }))
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

const typeInto = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('a new supplier', () => {
  it('saves once with an idempotency key and the request the API reads, then opens the record', async () => {
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { name: 'New supplier' })
    typeInto(/^Legal name/, 'Sohar Steel LLC')
    typeInto(/^VAT number/, 'om1100447102')
    typeInto(/Peppol participant ID/, '0248:OM1100447102')
    typeInto(/Main contact/, 'Laila Al Harthy')
    typeInto(/Their email/, 'ap@soharsteel.om, laila@soharsteel.om')
    typeInto(/^Phone/, '24000000')
    typeInto(/^IBAN/, 'om81 0180 0000 1234 5678 901')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    expect(await screen.findByText('Qalhat Marine Supplies LLC was added.')).toBeTruthy()
    expect(calls('POST', '/api/v1/suppliers')).toHaveLength(1)
    const [post] = calls('POST', '/api/v1/suppliers')
    expect((post[1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': expect.stringMatching(/^supplier-.{16,}/),
    })
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
      bankDetails: {
        beneficiaryName: null,
        iban: 'OM810180000012345678901',
        bic: null,
        bankName: null,
      },
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
    typeInto(/^VAT number/, 'OM99')
    typeInto(/Peppol participant ID/, 'OM1100447102')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    expect(
      await screen.findByText('Some fields need attention before the supplier can be saved.'),
    ).toBeTruthy()
    expect(screen.getAllByText('This field is required')).toHaveLength(2)
    expect(screen.getByText('Use OM11 or OM12 followed by 8 digits')).toBeTruthy()
    expect(screen.getByText(/Use the scheme and ID together/)).toBeTruthy()
    expect(calls('POST', '/api/v1/suppliers')).toHaveLength(0)
  })

  it('puts the server field refusals on their inputs, an address part on its own input', async () => {
    createResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/validation-failed',
        status: 400,
        errors: [
          {
            field: 'invoiceAddress.cityName',
            code: 'TOO_LONG',
            message: 'Address city must be 150 characters or fewer',
          },
        ],
      })
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { name: 'New supplier' })
    typeInto(/^Legal name/, 'Sohar Steel LLC')
    typeInto(/^VAT number/, 'OM1100447102')
    typeInto(/Peppol participant ID/, '0248:OM1100447102')
    typeInto(/Main contact/, 'Laila')
    typeInto(/^Address/, 'Falaj Al Qabail')
    typeInto(/^City/, 'Sohar')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    const city = await screen.findByText('This is longer than allowed')
    expect(city.closest('div')?.querySelector('input')?.id).toBe('supplier-billing-city')
    expect(bodyOf(calls('POST', '/api/v1/suppliers')[0]).invoiceAddress).toMatchObject({
      streetName: 'Falaj Al Qabail',
      cityName: 'Sohar',
      countryCode: 'OM',
    })
  })

  it('fills the Peppol ID from a valid VAT number and sends the address in its parts', async () => {
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { name: 'New supplier' })
    typeInto(/^Legal name/, 'Sohar Steel LLC')
    typeInto(/^VAT number/, 'OM1100447102')
    // Filled in, not locked: an empty Peppol ID takes 0248 and the VATIN.
    expect((screen.getByLabelText(/Peppol participant ID/) as HTMLInputElement).value).toBe(
      '0248:OM1100447102',
    )
    typeInto(/Main contact/, 'Laila')
    typeInto(/^Address/, 'Way 3021, Building 12')
    typeInto(/^City/, 'Sohar')
    fireEvent.click(screen.getByRole('button', { name: 'Governorate' }))
    fireEvent.click(await screen.findByRole('option', { name: 'North Al Batinah' }))
    typeInto(/^Postal code/, '31')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])
    expect(await screen.findByText('Omani postal codes are 3 digits')).toBeTruthy()
    expect(calls('POST', '/api/v1/suppliers')).toHaveLength(0)

    typeInto(/^Postal code/, '311')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])
    await waitFor(() => expect(calls('POST', '/api/v1/suppliers')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/suppliers')[0])).toMatchObject({
      participantScheme: '0248',
      participantValue: 'OM1100447102',
      invoiceAddress: {
        streetName: 'Way 3021, Building 12',
        cityName: 'Sohar',
        countrySubentity: 'North Al Batinah',
        postalCode: '311',
        countryCode: 'OM',
      },
    })
  })

  it('names a duplicate VAT number or Peppol ID on a new supplier', async () => {
    createResponse = () =>
      json(409, { type: 'https://api.fawtir.om/problems/resource-conflict', status: 409 })
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { name: 'New supplier' })
    typeInto(/^Legal name/, 'Sohar Steel LLC')
    typeInto(/^VAT number/, 'OM1100447102')
    typeInto(/Peppol participant ID/, '0248:OM1100447102')
    typeInto(/Main contact/, 'Laila')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    expect(
      await screen.findByText(
        'Another supplier or customer already uses this VAT number or Peppol ID.',
      ),
    ).toBeTruthy()
  })
})

describe('trading name, tags and the auto-match switch', () => {
  const addTag = (tag: string) => {
    const input = screen.getByLabelText('Add a tag')
    fireEvent.change(input, { target: { value: tag } })
    fireEvent.keyDown(input, { key: 'Enter' })
  }
  const autoMatch = () =>
    screen.getByRole('switch', { name: 'Match bills to purchase orders automatically' })

  it('sends what was typed on a new supplier', async () => {
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { level: 1, name: 'New supplier' })
    typeInto(/^Legal name/, 'Sohar Steel LLC')
    typeInto(/^Trading name/, '  Sohar Steel  ')
    typeInto(/Main contact/, 'Laila Al Harthy')
    typeInto(/Peppol participant ID/, '0248:OM1100447102')
    addTag('Key supplier')
    addTag(' Raw materials ')
    addTag('Key supplier')
    expect(autoMatch().getAttribute('aria-checked')).toBe('true')
    fireEvent.click(autoMatch())
    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    await waitFor(() => expect(calls('POST', '/api/v1/suppliers')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/suppliers')[0])).toMatchObject({
      tradingName: 'Sohar Steel',
      tags: ['Key supplier', 'Raw materials'],
      autoMatchPurchaseOrders: false,
    })
  })

  it('sends none, none and "on" when nothing was touched', async () => {
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { level: 1, name: 'New supplier' })
    typeInto(/^Legal name/, 'Sohar Steel LLC')
    typeInto(/Main contact/, 'Laila Al Harthy')
    typeInto(/Peppol participant ID/, '0248:OM1100447102')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    await waitFor(() => expect(calls('POST', '/api/v1/suppliers')).toHaveLength(1))
    const body = bodyOf(calls('POST', '/api/v1/suppliers')[0])
    expect(body.tradingName).toBeNull()
    expect(body.tags).toEqual([])
    expect(body.autoMatchPurchaseOrders).toBe(true)
  })

  it('opens an edit with the server’s values and saves the changed ones', async () => {
    loaded = () =>
      detail({
        tradingName: 'Qalhat Marine',
        tags: ['Marine', 'Key supplier'],
        autoMatchPurchaseOrders: false,
      })
    renderAt(`/suppliers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' })
    expect((screen.getByLabelText(/^Trading name/) as HTMLInputElement).value).toBe('Qalhat Marine')
    expect(screen.getByRole('button', { name: 'Remove Marine' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Key supplier' })).toBeTruthy()
    expect(autoMatch().getAttribute('aria-checked')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Marine' }))
    fireEvent.click(autoMatch())
    typeInto(/^Trading name/, '')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])

    await waitFor(() => expect(calls('PUT', ONE)).toHaveLength(1))
    expect(bodyOf(calls('PUT', ONE)[0])).toMatchObject({
      version: 7,
      tradingName: null,
      tags: ['Key supplier'],
      autoMatchPurchaseOrders: true,
    })
  })

  it('reads a record from a server without the fields as none, none and "on"', async () => {
    renderAt(`/suppliers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' })
    expect((screen.getByLabelText(/^Trading name/) as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
    expect(autoMatch().getAttribute('aria-checked')).toBe('true')
  })

  it('puts a refused trading name on its input', () => {
    const placed = placeSupplierErrors([
      { field: 'tradingName', code: 'TOO_LONG', message: 'must be at most 200 characters' },
    ])
    expect(placed.fields.tradingName).toEqual({ key: 'validation.tooLong' })
    expect(placed.other).toEqual([])
  })

  it('offers no room for a twenty-first tag', async () => {
    loaded = () => detail({ tags: Array.from({ length: 20 }, (_, index) => `Tag ${index + 1}`) })
    renderAt(`/suppliers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' })
    expect(screen.getByText('Tag 20')).toBeTruthy()
    expect(screen.queryByLabelText('Add a tag')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tag 20' }))
    expect(screen.getByLabelText('Add a tag')).toBeTruthy()
  })

  it('adds a tag once, trimmed, and never past twenty', () => {
    expect(withTag(['A'], '  B ')).toEqual(['A', 'B'])
    expect(withTag(['A'], 'A')).toEqual(['A'])
    expect(withTag(['A'], '   ')).toEqual(['A'])
    const full = Array.from({ length: 20 }, (_, index) => `T${index}`)
    expect(withTag(full, 'One more')).toEqual(full)
  })

  it('copies them into a new supplier with the rest of the details', () => {
    const copied = copyOfSupplier(
      detail({ tradingName: 'Qalhat Marine', tags: ['Marine'], autoMatchPurchaseOrders: false }),
    )
    expect(copied).toMatchObject({ tradingName: 'Qalhat Marine', tags: ['Marine'], autoMatch: false })
  })
})

describe('switching a supplier off from its edit page', () => {
  it('sends the reason chosen and the note typed', async () => {
    renderAt(`/suppliers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' })
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    fireEvent.click(await screen.findByText('Switch this supplier off'))
    const dialog = await screen.findByRole('dialog', {
      name: 'Switch off Qalhat Marine Supplies LLC',
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Duplicate record' }))
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: '  Same company as Qalhat Marine  ' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch them off' }))

    await waitFor(() => expect(calls('POST', `${ONE}/switch-off`)).toHaveLength(1))
    expect(bodyOf(calls('POST', `${ONE}/switch-off`)[0])).toEqual({
      reason: 'DUPLICATE',
      note: 'Same company as Qalhat Marine',
    })
  })
})

describe('a supplier copied into a new one', () => {
  const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement

  it('opens the new-supplier form with the details, and the VAT number, CR number and IBAN empty', async () => {
    renderAt(`/suppliers/new?copy=${ID}`)
    await screen.findByRole('heading', { level: 1, name: 'New supplier' })
    await waitFor(() => expect(field(/^Legal name/).value).toBe('Qalhat Marine Supplies LLC'))
    expect(field(/Main contact/).value).toBe('Accounts team')
    expect(field(/Their email/).value).toBe('ap@qalhat.om')
    expect(field(/^Phone/).value).toBe('24000000')
    expect(field(/^Bank$/).value).toBe('Bank Muscat')
    // The three that name one company or one account start empty.
    expect(field(/^VAT number/).value).toBe('')
    expect(field(/^Commercial registration/).value).toBe('')
    expect(field(/^IBAN/).value).toBe('')
    // The Peppol ID is the VAT number behind a scheme, so it starts empty too.
    expect(field(/Peppol participant ID/).value).toBe('')
  })

  it('saves as a new supplier: a POST with its own key, no version, never a PUT on the source', async () => {
    renderAt(`/suppliers/new?copy=${ID}`)
    await screen.findByRole('heading', { level: 1, name: 'New supplier' })
    await waitFor(() => expect(field(/^Legal name/).value).toBe('Qalhat Marine Supplies LLC'))
    typeInto(/^Legal name/, 'Qalhat Marine Supplies (Sohar) LLC')
    typeInto(/^VAT number/, 'OM1100447102')
    typeInto(/^IBAN/, 'OM230270000098765432101')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save supplier' })[0])

    await waitFor(() => expect(calls('POST', '/api/v1/suppliers')).toHaveLength(1))
    expect(calls('PUT', ONE)).toHaveLength(0)
    const body = bodyOf(calls('POST', '/api/v1/suppliers')[0])
    expect('version' in body).toBe(false)
    expect(body).toMatchObject({
      legalName: 'Qalhat Marine Supplies (Sohar) LLC',
      vatNumber: 'OM1100447102',
      // Filled in from the typed VAT number, as on any new supplier.
      participantScheme: '0248',
      participantValue: 'OM1100447102',
      commercialRegistrationNumber: null,
      contactPerson: 'Accounts team',
      emailRecipients: ['ap@qalhat.om'],
      telephone: '+96824000000',
      paymentTerms: 'NET45',
      preferredLanguage: 'ar',
      supplierCategory: 'Marine',
      earlyPaymentDiscountPercent: 1.5,
      earlyPaymentDiscountDays: 10,
      // The new account: the source's beneficiary is not carried onto it.
      bankDetails: {
        beneficiaryName: null,
        iban: 'OM230270000098765432101',
        bic: 'BMUSOMRX',
        bankName: 'Bank Muscat',
      },
      invoiceAddress: { cityName: 'Sur', streetName: 'Main Street', buildingNumber: '1' },
    })
  })

  it('is where the edit page’s "Copy into a new supplier" leads', async () => {
    renderAt(`/suppliers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' })
    fireEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    const item = (await screen.findByText('Copy into a new supplier')).closest('a')
    expect(item?.getAttribute('href')).toBe(`/suppliers/new?copy=${ID}`)
  })

  it('copies every detail but the four identifiers', () => {
    const copied = copyOfSupplier(detail())
    expect(copied).toMatchObject({
      legalName: 'Qalhat Marine Supplies LLC',
      vatNumber: '',
      commercialRegistrationNumber: '',
      iban: '',
      peppolId: '',
      bankName: 'Bank Muscat',
      bic: 'BMUSOMRX',
      registeredOnPeppol: true,
      paymentTerms: 'NET45',
    })
    expect(copied.billing.cityName).toBe('Sur')
  })

  it('opens a blank form when no record is named', async () => {
    renderAt('/suppliers/new')
    await screen.findByRole('heading', { level: 1, name: 'New supplier' })
    expect(field(/^Legal name/).value).toBe('')
    expect(calls('GET', ONE)).toHaveLength(0)
  })
})

describe('an existing supplier', () => {
  it('opens with its record and saves its version without touching the bank account or the address parts it does not draw', async () => {
    renderAt(`/suppliers/${ID}/edit`)
    expect(
      await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' }),
    ).toBeTruthy()
    expect((screen.getByLabelText(/Main contact/) as HTMLInputElement).value).toBe('Accounts team')
    expect((screen.getByLabelText(/^Phone/) as HTMLInputElement).value).toBe('24000000')

    typeInto(/Main contact/, 'Hamed Al Kindi')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])

    expect(await screen.findByText('Changes saved.')).toBeTruthy()
    const body = bodyOf(calls('PUT', ONE)[0])
    expect(body.version).toBe(7)
    expect(body.contactPerson).toBe('Hamed Al Kindi')
    expect(body.bankDetails).toBeNull()
    expect(body.invoiceAddress).toMatchObject({
      cityName: 'Sur',
      countrySubentity: 'South Sharqiyah',
      buildingNumber: '1',
    })
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

  it('reads an account with every field null as no account, and saves without touching it', async () => {
    // What the backend sends for a supplier with no bank account: the object, all nulls.
    const noAccount = {
      bankDetails: {
        beneficiaryName: null,
        iban: null,
        bic: null,
        bankName: null,
        changedAt: null,
        confirmedAt: null,
      },
      health: ['NO_BANK_DETAILS' as const],
    }
    loaded = () => detail(noAccount)
    updateResponse = () => json(200, detail({ ...noAccount, version: 8 }))
    renderAt(`/suppliers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' })
    expect((screen.getByLabelText(/^IBAN/) as HTMLInputElement).value).toBe('')
    expect(
      screen.queryByText(
        'Changing the account asks someone to confirm it before the next payment.',
      ),
    ).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])

    expect(await screen.findByText('Changes saved.')).toBeTruthy()
    expect(
      screen.queryByText("Bank details can't be removed here. Enter the account to keep."),
    ).toBeNull()
    expect(calls('PUT', ONE)).toHaveLength(1)
    expect(bodyOf(calls('PUT', ONE)[0]).bankDetails).toBeNull()
  })

  it('sends the first account of a supplier that had none', async () => {
    loaded = () =>
      detail({
        bankDetails: {
          beneficiaryName: null,
          iban: '  ',
          bic: null,
          bankName: null,
          changedAt: null,
          confirmedAt: null,
        },
      })
    renderAt(`/suppliers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' })
    typeInto(/^IBAN/, 'OM230270000098765432101')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])

    await waitFor(() => expect(calls('PUT', ONE)).toHaveLength(1))
    expect(bodyOf(calls('PUT', ONE)[0]).bankDetails).toEqual({
      beneficiaryName: null,
      iban: 'OM230270000098765432101',
      bic: null,
      bankName: null,
    })
  })

  it('still asks for the account to keep when the IBAN of a real account is cleared', async () => {
    renderAt(`/suppliers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Qalhat Marine Supplies LLC' })
    expect(
      screen.getByText('Changing the account asks someone to confirm it before the next payment.'),
    ).toBeTruthy()
    // The whole account is cleared: a bank name or BIC left behind asks for the IBAN instead.
    for (const name of ['bankName', 'bic', 'iban'])
      fireEvent.change(document.querySelector(`input[name="${name}"]`)!, { target: { value: '' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])

    expect(
      await screen.findByText("Bank details can't be removed here. Enter the account to keep."),
    ).toBeTruthy()
    expect(calls('PUT', ONE)).toHaveLength(0)
  })

  it('confirms bank details that changed', async () => {
    renderAt(`/suppliers/${ID}/edit`)
    expect(
      await screen.findByText(/The bank details changed and nobody has confirmed them/),
    ).toBeTruthy()
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
    const values = {
      ...blankSupplierForm(),
      legalName: 'X',
      contactPerson: 'Y',
      vatNumber: 'OM1100447102',
      peppolId: '0248:OM1100447102',
    }
    expect(supplierProblems(values, null)).toEqual({})
    expect(supplierProblems({ ...values, earlyPaymentDiscountPercent: '2' }, null)).toEqual({
      earlyPaymentDiscountDays: 'supplierForm.error.discountPair',
    })
    expect(supplierProblems({ ...values, sameAsBilling: false }, null)).toEqual({
      'pickup.cityName': 'supplierForm.error.pickupRequired',
    })
    // A group VAT number is refused as a participant before the server says so.
    expect(supplierProblems({ ...values, peppolId: '0248:OM1200447102' }, null)).toEqual({
      peppolId: 'supplierForm.error.peppolVat',
    })
  })

  it('does not send an address whose only value is the default country', () => {
    const request = toSupplierRequest(
      { ...blankSupplierForm(), legalName: 'X', contactPerson: 'Y' },
      null,
    )
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
