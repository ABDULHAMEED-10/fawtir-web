import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import i18n from '../../i18n'
import { forgetEntitlements, type Entitlements } from '../../lib/identity/entitlements'
import type { CustomerRecordDto } from '../../api/customers/customers'
import {
  blankCustomerForm,
  customerProblems,
  placeCustomerErrors,
  toCustomerRequest,
} from '../../lib/customerForm'
import { AddCustomerModal } from '../../components/AddCustomerModal'
import { EditCustomerPage, NewCustomerPage } from '.'

const ID = '33333333-3333-3333-3333-333333333333'
const ONE = `/api/v1/customers/${ID}`

const MANAGER: Entitlements = {
  userId: 'u-1',
  username: 'demo_admin',
  tenantId: 't-1',
  roles: [{ id: 'r-1', code: 'ADMIN', name: 'Administrator', systemRole: true }],
  permissions: ['customer.read', 'customer.manage'],
  scopes: [],
  featureFlags: {},
}

function record(overrides: Partial<CustomerRecordDto> = {}): CustomerRecordDto {
  return {
    id: ID,
    type: 'BUSINESS',
    displayName: 'Salalah Beach Resort',
    profile: {
      logo: {
        objectReference: '44444444-4444-4444-4444-444444444444',
        contentType: 'image/png',
        byteSize: 1200,
        sha256: 'a'.repeat(64),
      },
      details: {
        firstName: null,
        lastName: null,
        legalRegisteredName: 'Salalah Beach Resort',
        entityMinistryName: null,
        vatRegistrationNumber: 'OM1100582341',
        registeredForVat: true,
        entityMinistryCode: null,
        defaultBuyerReference: null,
        defaultPurchaseOrderNumber: null,
        defaultContractTenderReference: null,
        peppolParticipantId: { scheme: '0248', value: 'OM1100582341' },
        registeredOnPeppol: true,
        specialZoneLicenceNumber: 'SEZAD-7',
      },
      contact: {
        contactPerson: 'Mariam Al Hinai',
        roleTitle: null,
        emailRecipients: ['mariam@salalahbeach.om'],
        telephone: '+96823000000',
        mobilePhone: null,
        preferredLanguage: 'ar',
      },
      billingDefaults: {
        defaultCurrency: 'OMR',
        defaultTaxCategory: 'S5',
        paymentTerms: 'NET30',
        defaultPaymentMethod: '30',
      },
      deliveryPreferences: {
        sendingMethod: 'PEPPOL',
        emailPdfCopy: true,
        automaticPaymentReminders: false,
      },
      invoiceAddress: {
        attention: null,
        countryCode: 'OM',
        cityName: 'Salalah',
        countrySubentity: 'Dhofar',
        streetName: 'Beach Road',
        buildingNumber: '9',
        additionalStreetName: null,
        poBox: null,
        postalCode: '211',
      },
      sameAsInvoicingAddress: true,
      deliveryAddress: null,
      customerVisibleNote: 'Deliver to gate 3',
    },
    peppolDelivery: 'ACTIVE',
    invoiceEligible: true,
    missingInvoiceFields: [],
    status: 'ACTIVE',
    updatedAt: '2026-09-16T08:00:00Z',
    version: 5,
    ...overrides,
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
  createResponse = () => json(201, record())
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/v1/me/entitlements') return json(200, who)
    if (url === '/api/v1/customers' && method === 'POST') return createResponse()
    if (url === ONE && method === 'GET') return json(200, record())
    if (url === ONE && method === 'PUT') return json(200, record({ version: 6 }))
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
        <Route path="/customers/new" element={<NewCustomerPage />} />
        <Route path="/customers/:id/edit" element={<EditCustomerPage />} />
        <Route path="/customers" element={<p>customers list</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const typeInto = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('a new customer', () => {
  it('saves a business with the nested request the API reads, then opens the record', async () => {
    renderAt('/customers/new')
    await screen.findByRole('heading', { name: 'New customer' })
    typeInto(/Legal \/ registered name/, 'Qurum Business Center')
    typeInto(/VAT registration number/, 'OM1100337812')
    typeInto(/Peppol participant ID/, '0248:om1100337812')
    typeInto(/Contact person/, 'Salim Al Farsi')
    typeInto(/City \/ Governorate/, 'Muscat')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save customer' })[0])

    expect(await screen.findByText('Salalah Beach Resort was added.')).toBeTruthy()
    const [post] = calls('POST', '/api/v1/customers')
    expect((post[1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': expect.stringMatching(/^customer-.{16,}/),
    })
    const body = bodyOf(post)
    expect(body).toMatchObject({
      type: 'BUSINESS',
      logo: null,
      details: {
        legalRegisteredName: 'Qurum Business Center',
        entityMinistryName: null,
        firstName: null,
        vatRegistrationNumber: 'OM1100337812',
        registeredForVat: true,
        peppolParticipantId: { scheme: '0248', value: 'OM1100337812' },
        registeredOnPeppol: true,
      },
      contact: { contactPerson: 'Salim Al Farsi', emailRecipients: [] },
      deliveryPreferences: {
        sendingMethod: 'PEPPOL',
        emailPdfCopy: false,
        automaticPaymentReminders: false,
      },
      invoiceAddress: { countryCode: 'OM', cityName: 'Muscat' },
      sameAsInvoicingAddress: true,
      deliveryAddress: null,
    })
    expect('expectedVersion' in body).toBe(false)
  })

  it('fills the Peppol ID from the VAT number and keeps one typed by hand (owner, 21 Oct 2026)', async () => {
    renderAt('/customers/new')
    await screen.findByRole('heading', { name: 'New customer' })
    const peppol = () => (screen.getByLabelText(/Peppol participant ID/) as HTMLInputElement).value

    typeInto(/VAT registration number/, 'OM1100337812')
    expect(peppol()).toBe('0248:OM1100337812')

    // It keeps following the VAT number while it still reads what was filled in.
    typeInto(/VAT registration number/, 'OM1100337813')
    expect(peppol()).toBe('0248:OM1100337813')

    // A test receiver outside the Omani VAT scheme is kept when the VAT number changes again.
    typeInto(/Peppol participant ID/, '9922:OPTBCNTRLP1007')
    typeInto(/VAT registration number/, 'OM1100337814')
    expect(peppol()).toBe('9922:OPTBCNTRLP1007')
  })

  it('says the Peppol ID was filled in from the VAT number only when there is one', async () => {
    renderAt('/customers/new')
    await screen.findByRole('heading', { name: 'New customer' })
    const hint = /Filled in from the VAT number/
    typeInto(/VAT registration number/, '')
    typeInto(/Peppol participant ID/, '9922:OPTBCNTRLP1007')
    expect(screen.queryByText(hint)).toBeNull()
    typeInto(/VAT registration number/, 'OM1100337812')
    expect(screen.getByText(hint)).toBeTruthy()
  })

  it('sends a consumer with no organisation fields at all, not as false', async () => {
    renderAt('/customers/new')
    await screen.findByRole('heading', { name: 'New customer' })
    fireEvent.click(screen.getByRole('button', { name: /Consumer/ }))
    typeInto(/First name/, 'Fatma')
    typeInto(/Last name/, 'Al Busaidi')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save customer' })[0])

    await waitFor(() => expect(calls('POST', '/api/v1/customers')).toHaveLength(1))
    const body = bodyOf(calls('POST', '/api/v1/customers')[0])
    expect(body.details).toMatchObject({
      firstName: 'Fatma',
      lastName: 'Al Busaidi',
      registeredForVat: null,
      registeredOnPeppol: null,
      peppolParticipantId: null,
    })
    expect(body.contact.contactPerson).toBeNull()
    expect(body.deliveryPreferences.sendingMethod).toBe('QR_RECEIPT')
  })

  it('says what is missing before sending, the rules the server gives no field for included', async () => {
    renderAt('/customers/new')
    await screen.findByRole('heading', { name: 'New customer' })
    fireEvent.click(screen.getByRole('button', { name: /Government/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Automatic payment reminders' }))

    fireEvent.click(screen.getAllByRole('button', { name: 'Save customer' })[0])

    expect(
      await screen.findByText('Some fields need attention before the customer can be saved.'),
    ).toBeTruthy()
    // Entity name, buyer reference and contact person.
    expect(screen.getAllByText('This field is required').length).toBeGreaterThanOrEqual(3)
    expect(
      screen.getByText('Enter at least one email address to send PDFs or reminders.'),
    ).toBeTruthy()
    expect(calls('POST', '/api/v1/customers')).toHaveLength(0)
  })

  it('puts the server field refusals on their inputs, by the model path the API names', async () => {
    createResponse = () =>
      json(400, {
        type: 'https://api.fawtir.om/problems/validation-failed',
        status: 400,
        errors: [
          {
            field: 'details.peppolParticipantId.value',
            code: 'INVALID_FORMAT',
            message: 'Invalid Peppol Participant ID: value',
          },
          {
            field: 'invoiceAddress.cityName',
            code: 'TOO_LONG',
            message: 'Address city must be 150 characters or fewer',
          },
        ],
      })
    renderAt('/customers/new')
    await screen.findByRole('heading', { name: 'New customer' })
    typeInto(/Legal \/ registered name/, 'Qurum Business Center')
    typeInto(/VAT registration number/, 'OM1100337812')
    typeInto(/Peppol participant ID/, '0242:SOMETHING')
    typeInto(/Contact person/, 'Salim')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save customer' })[0])

    expect(await screen.findByText(/Use the scheme, a colon and the ID/)).toBeTruthy()
    expect(screen.getByText('This is longer than allowed')).toBeTruthy()
  })

  it('names a duplicate VAT number or Peppol ID', async () => {
    createResponse = () =>
      json(409, { type: 'https://api.fawtir.om/problems/resource-conflict', status: 409 })
    renderAt('/customers/new')
    await screen.findByRole('heading', { name: 'New customer' })
    typeInto(/Legal \/ registered name/, 'Qurum Business Center')
    typeInto(/VAT registration number/, 'OM1100337812')
    typeInto(/Peppol participant ID/, '0248:OM1100337812')
    typeInto(/Contact person/, 'Salim')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save customer' })[0])

    expect(
      await screen.findByText('Another customer already uses this VAT number or Peppol ID.'),
    ).toBeTruthy()
  })
})

describe('an existing customer', () => {
  it('opens with its record and saves its version with what the form does not draw', async () => {
    renderAt(`/customers/${ID}/edit`)
    expect(await screen.findByRole('heading', { name: 'Edit Salalah Beach Resort' })).toBeTruthy()
    expect((screen.getByLabelText(/Peppol participant ID/) as HTMLInputElement).value).toBe(
      '0248:OM1100582341',
    )

    typeInto(/Contact person/, 'Hamed Al Kindi')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])

    expect(await screen.findByText('Changes saved.')).toBeTruthy()
    const body = bodyOf(calls('PUT', ONE)[0])
    expect(body.expectedVersion).toBe(5)
    expect(body.contact.contactPerson).toBe('Hamed Al Kindi')
    // A PUT replaces the record: the logo and the address parts it does not draw go back, and so
    // does the licence it draws but this edit did not touch.
    expect(body.logo).toEqual(record().profile.logo)
    expect(body.details.specialZoneLicenceNumber).toBe('SEZAD-7')
    expect(body.invoiceAddress).toMatchObject({ countrySubentity: 'Dhofar', buildingNumber: '9' })
    expect(body.customerVisibleNote).toBe('Deliver to gate 3')
    expect(body.deliveryPreferences).toEqual({
      sendingMethod: 'PEPPOL',
      emailPdfCopy: true,
      automaticPaymentReminders: false,
    })
  })

  it('reads a 400 on the customer (a malformed id) as not found, with nothing to retry', async () => {
    // Every "View customer" link opens this page, so a bad id must not ask to check a form.
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url === ONE && (init?.method ?? 'GET') === 'GET'
        ? json(400, { type: 'https://api.fawtir.om/problems/validation-failed', status: 400 })
        : base(url, init),
    )
    renderAt(`/customers/${ID}/edit`)
    expect(await screen.findByText('Not found')).toBeTruthy()
    expect(screen.queryByText(/Some details were not accepted/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('offers no save to someone who may only read customers', async () => {
    who = { ...MANAGER, permissions: ['customer.read'] }
    renderAt(`/customers/${ID}/edit`)
    expect(await screen.findByText('You can see this customer but not change it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })
})

describe('quick add from the invoice', () => {
  it('creates a company on Peppol at its VAT number and hands the new record back', async () => {
    const created = vi.fn()
    render(<AddCustomerModal open kind="company" onClose={() => {}} onCreated={created} />)
    const dialog = screen.getByRole('dialog')
    const field = (label: RegExp) => within(dialog).getByLabelText(label)
    fireEvent.change(field(/VAT registration number/), { target: { value: 'om1100447102' } })
    fireEvent.change(field(/Corporate Name/), { target: { value: 'Golden Tech WLL' } })
    fireEvent.change(field(/Director First Name/), { target: { value: 'Atiq' } })
    fireEvent.change(field(/Director Last Name/), { target: { value: 'Abdullah' } })

    fireEvent.click(within(dialog).getByRole('button', { name: /Save Customer Profile/ }))

    await waitFor(() => expect(created).toHaveBeenCalledTimes(1))
    const body = bodyOf(calls('POST', '/api/v1/customers')[0])
    expect(body.details).toMatchObject({
      legalRegisteredName: 'Golden Tech WLL',
      vatRegistrationNumber: 'OM1100447102',
      registeredForVat: true,
      registeredOnPeppol: true,
      peppolParticipantId: { scheme: '0248', value: 'OM1100447102' },
    })
    expect(body.contact.contactPerson).toBe('Atiq Abdullah')
    expect(body.deliveryPreferences.sendingMethod).toBe('PEPPOL')
    expect(created.mock.calls[0][0].id).toBe(ID)
  })

  it('refuses a company with no VAT number before sending', async () => {
    render(<AddCustomerModal open kind="company" onClose={() => {}} onCreated={() => {}} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Save Customer Profile/ }))
    expect(await within(dialog).findAllByText('This field is required')).toHaveLength(3)
    expect(calls('POST', '/api/v1/customers')).toHaveLength(0)
  })
})

describe('customer form rules', () => {
  it('keeps organisation flags off a consumer and asks a Peppol sender to be registered', () => {
    const consumer = { ...blankCustomerForm('CONSUMER'), firstName: 'A', lastName: 'B' }
    expect(customerProblems(consumer)).toEqual({})
    expect(customerProblems({ ...consumer, sendingMethod: 'PEPPOL' })).toEqual({
      sendingMethod: 'customerForm.error.consumerPeppol',
    })
    const business = {
      ...blankCustomerForm('BUSINESS'),
      legalName: 'X',
      contactPerson: 'Y',
      vatNumber: 'OM1100447102',
      registeredOnPeppol: false,
    }
    expect(customerProblems(business)).toEqual({
      sendingMethod: 'customerForm.error.peppolNotRegistered',
    })
    expect(toCustomerRequest(consumer).details.registeredForVat).toBeNull()
  })

  it('accepts any Peppol scheme and case, the testbed ids included (owner, 11 Oct 2026)', () => {
    const business = {
      ...blankCustomerForm('BUSINESS'),
      legalName: 'X',
      contactPerson: 'Y',
      vatNumber: 'OM1110309032',
      registeredOnPeppol: true,
    }
    for (const peppolId of ['0248:om1199999001', '0242:000006-TESTBED.3001', '9922:OPTBCNTRLP1007']) {
      expect(customerProblems({ ...business, peppolId }).peppolId).toBeUndefined()
    }
    expect(customerProblems({ ...business, peppolId: 'OM1199999001' }).peppolId).toBe(
      'supplierForm.error.peppolShape',
    )
    // A 0248 value is VATIN-shaped and compared ignoring case by the server, so upper-casing it is harmless.
    expect(
      toCustomerRequest({ ...business, peppolId: '0248:om1199999001' }).details.peppolParticipantId,
    ).toEqual({ scheme: '0248', value: 'OM1199999001' })
  })

  it('sends any other scheme value as typed, trimmed only (A-1)', () => {
    const business = {
      ...blankCustomerForm('BUSINESS'),
      legalName: 'X',
      contactPerson: 'Y',
      vatNumber: 'OM1110309032',
      registeredOnPeppol: true,
    }
    // 9915:testlower went out as TESTLOWER, another identifier than the one the partner registered.
    expect(
      toCustomerRequest({ ...business, peppolId: ' 9915:testlower ' }).details.peppolParticipantId,
    ).toEqual({ scheme: '9915', value: 'testlower' })
    expect(
      toCustomerRequest({ ...business, peppolId: '0242:000006-TestBed.3001' }).details
        .peppolParticipantId,
    ).toEqual({ scheme: '0242', value: '000006-TestBed.3001' })
  })

  it('places refusals by model path and keeps unknown ones for a notice', () => {
    const placed = placeCustomerErrors([
      {
        field: 'contact.telephone',
        code: 'INVALID_FORMAT',
        message: 'Telephone must use international E.164 format',
      },
      {
        field: 'deliveryAddress.countryCode',
        code: 'INVALID_FORMAT',
        message: 'Address country must contain 2 letters',
      },
      { field: 'logo', code: 'INVALID_FORMAT', message: 'Logo content type is unsupported' },
    ])
    expect(placed.fields.telephone).toEqual({ key: 'supplierForm.error.phone' })
    expect(placed.fields['delivery.countryCode']).toEqual({
      text: 'Address country must contain 2 letters',
    })
    expect(placed.other).toEqual(['Logo content type is unsupported'])
  })
})

describe('address lines 2 and 3 of the invoice address (PINT-OM IBR-019-OM)', () => {
  it('sends both on a new customer', async () => {
    renderAt('/customers/new')
    await screen.findByRole('heading', { name: 'New customer' })
    typeInto(/Legal \/ registered name/, 'Qurum Business Center')
    typeInto(/VAT registration number/, 'OM1100337812')
    typeInto(/Peppol participant ID/, '0248:om1100337812')
    typeInto(/Contact person/, 'Salim Al Farsi')
    typeInto(/City \/ Governorate/, 'Muscat')
    typeInto(/Street & building/, 'Way 3021')
    typeInto(/Additional street or area/, 'Al Khuwair')
    typeInto(/Building or address line 3/, 'Building 12, Office 4')

    fireEvent.click(screen.getAllByRole('button', { name: 'Save customer' })[0])

    await waitFor(() => expect(calls('POST', '/api/v1/customers')).toHaveLength(1))
    expect(bodyOf(calls('POST', '/api/v1/customers')[0]).invoiceAddress).toMatchObject({
      streetName: 'Way 3021',
      additionalStreetName: 'Al Khuwair',
      addressLine3: 'Building 12, Office 4',
    })
  })

  it('opens an existing customer with its stored lines and saves a change to them', async () => {
    const stored = record()
    stored.profile.invoiceAddress = {
      ...stored.profile.invoiceAddress!,
      additionalStreetName: 'Al Saada',
      addressLine3: 'Villa 3',
    }
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url === ONE && (init?.method ?? 'GET') === 'GET' ? json(200, stored) : original(url, init),
    )
    renderAt(`/customers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Salalah Beach Resort' })
    expect((screen.getByLabelText(/Additional street or area/) as HTMLInputElement).value).toBe('Al Saada')
    expect((screen.getByLabelText(/Building or address line 3/) as HTMLInputElement).value).toBe('Villa 3')

    typeInto(/Building or address line 3/, 'Villa 5')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])

    expect(await screen.findByText('Changes saved.')).toBeTruthy()
    expect(bodyOf(calls('PUT', ONE)[0]).invoiceAddress).toMatchObject({
      additionalStreetName: 'Al Saada',
      addressLine3: 'Villa 5',
      buildingNumber: '9',
    })
  })

  it('puts a refusal of either line on its input', () => {
    const placed = placeCustomerErrors([
      { field: 'invoiceAddress.addressLine3', code: 'TOO_LONG', message: 'too long' },
      { field: 'invoiceAddress.additionalStreetName', code: 'INVALID_FORMAT', message: 'bad line 2' },
    ])
    expect(placed.fields['invoice.addressLine3']).toEqual({ key: 'validation.tooLong' })
    expect(placed.fields['invoice.additionalStreetName']).toEqual({ text: 'bad line 2' })
    expect(placed.other).toEqual([])
  })

  it('labels both lines in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/customers/new')
    expect(await screen.findByLabelText(/الشارع الإضافي أو المنطقة/)).toBeTruthy()
    expect(screen.getByLabelText(/المبنى أو سطر العنوان 3/)).toBeTruthy()
  })
})

describe('buyer identifier and special-zone licence (PINT-OM IBR-016-OM, IBR-152-OM)', () => {
  it('sends neither when nothing is stated, as nulls the server reads as none', () => {
    const body = toCustomerRequest(blankCustomerForm('BUSINESS'))
    expect(body.details).toMatchObject({
      identifierScheme: null,
      identifierValue: null,
      specialZoneLicenceNumber: null,
    })
  })

  it('holds the pair together and the value to the characters the server accepts', () => {
    const base = { ...blankCustomerForm('CONSUMER'), firstName: 'Aisha', lastName: 'Al Balushi' }
    expect(customerProblems({ ...base, identifierScheme: 'CID' }).identifierValue).toBe('validation.required')
    expect(customerProblems({ ...base, identifierValue: '12345678' }).identifierScheme).toBe('validation.required')
    expect(customerProblems({ ...base, identifierScheme: 'CR', identifierValue: '#1301234' }).identifierValue).toBe(
      'customerForm.error.identifierCharacters',
    )
    expect(customerProblems({ ...base, identifierScheme: 'OTHID', identifierValue: 'A'.repeat(51) }).identifierValue).toBe(
      'validation.tooLong',
    )
    expect(customerProblems({ ...base, specialZoneLicenceNumber: 'L'.repeat(51) }).specialZoneLicenceNumber).toBe(
      'validation.tooLong',
    )
    const fine = customerProblems({ ...base, identifierScheme: 'PASNUM', identifierValue: ' K-1234.5/6 ' })
    expect(fine.identifierScheme).toBeUndefined()
    expect(fine.identifierValue).toBeUndefined()
    expect(toCustomerRequest({ ...base, identifierScheme: 'PASNUM', identifierValue: ' K-1234.5/6 ' }).details)
      .toMatchObject({ identifierScheme: 'PASNUM', identifierValue: 'K-1234.5/6' })
  })

  it('does not check again a stored pair sent back unchanged, as the server does not', () => {
    const base = { ...blankCustomerForm('CONSUMER'), firstName: 'Aisha', lastName: 'Al Balushi' }
    const loaded = {
      ...base,
      identifierScheme: 'OTHID' as const,
      identifierValue: '#LEGACY-7',
      kept: { logo: null, identifier: { scheme: 'OTHID', value: '#LEGACY-7' } },
    }
    expect(customerProblems(loaded).identifierValue).toBeUndefined()
    expect(customerProblems({ ...loaded, identifierValue: '#LEGACY-8' }).identifierValue).toBe(
      'customerForm.error.identifierCharacters',
    )
  })

  it('puts the server refusals of the pair and the licence on their inputs', () => {
    const placed = placeCustomerErrors([
      { field: 'details.identifierScheme', code: 'INVALID_FORMAT', message: 'scheme' },
      { field: 'details.identifierValue', code: 'INVALID_CHARACTERS', message: 'value' },
      { field: 'details.specialZoneLicenceNumber', code: 'TOO_LONG', message: 'licence' },
    ])
    expect(placed.fields.identifierScheme).toEqual({ key: 'customerForm.error.identifierScheme' })
    expect(placed.fields.identifierValue).toEqual({ key: 'customerForm.error.identifierCharacters' })
    expect(placed.fields.specialZoneLicenceNumber).toEqual({ key: 'validation.tooLong' })
    expect(placed.other).toEqual([])
  })

  it('offers the identifier once the business is not VAT registered and refuses a type with no value before sending', async () => {
    renderAt('/customers/new')
    await screen.findByRole('heading', { name: 'New customer' })
    expect(screen.queryByRole('button', { name: 'Buyer identifier type' })).toBeNull()

    fireEvent.click(screen.getByLabelText('Registered for VAT'))
    fireEvent.click(screen.getByRole('button', { name: 'Buyer identifier type' }))
    fireEvent.click(screen.getByRole('option', { name: 'Civil ID' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Save customer' })[0])

    await waitFor(() =>
      expect(screen.getByLabelText(/^Buyer identifier/, { selector: 'input' }).getAttribute('aria-invalid')).toBe('true'),
    )
    expect(calls('POST', '/api/v1/customers')).toHaveLength(0)
  })

  it('opens a customer with its stored identifier and licence and saves a changed licence with the pair kept', async () => {
    const stored = record()
    stored.profile.details = { ...stored.profile.details, identifierScheme: 'CR', identifierValue: '1301234' }
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url === ONE && (init?.method ?? 'GET') === 'GET' ? json(200, stored) : original(url, init),
    )
    renderAt(`/customers/${ID}/edit`)
    await screen.findByRole('heading', { name: 'Edit Salalah Beach Resort' })
    expect((screen.getByLabelText(/^Buyer identifier/, { selector: 'input' }) as HTMLInputElement).value).toBe('1301234')
    expect((screen.getByLabelText(/Special zone licence number/) as HTMLInputElement).value).toBe('SEZAD-7')

    typeInto(/Special zone licence number/, 'SEZAD-8')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0])

    expect(await screen.findByText('Changes saved.')).toBeTruthy()
    expect(calls('PUT', ONE)).toHaveLength(1)
    expect(bodyOf(calls('PUT', ONE)[0]).details).toMatchObject({
      identifierScheme: 'CR',
      identifierValue: '1301234',
      specialZoneLicenceNumber: 'SEZAD-8',
    })
  })

  it('labels the identifier and the licence in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt(`/customers/${ID}/edit`)
    expect(await screen.findByLabelText(/رقم ترخيص المنطقة الخاصة/)).toBeTruthy()
  })
})
