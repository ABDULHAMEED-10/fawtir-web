import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '../i18n'
import {
  hasEndedOnboardingSession,
  markOnboardingSubmitted,
  readOnboardingSession,
  saveOnboardingSession,
} from '../lib/identity/onboardingSession'
import type { OnboardingState } from '../lib/onboarding'
import { validateBusinessIdentity } from '../lib/identity/onboarding'
import { AboutBusinessPage } from './AboutBusinessPage'
import { AddressContactPage } from './AddressContactPage'
import { BusinessIdentityPage } from './BusinessIdentityPage'
import { BusinessTypePage } from './BusinessTypePage'
import { SubBusinessTypePage } from './SubBusinessTypePage'

const TOKEN = 'so.onboarding-token'

function noContent() {
  return new Response(null, { status: 204 })
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const conflict = () =>
  json(409, {
    type: 'https://api.fawtir.om/problems/resource-conflict',
    detail: 'A tenant with this tax number already exists.',
  })

function status(stage: string, complete: Partial<Record<string, boolean>> = {}) {
  return json(200, {
    stage,
    businessProfileComplete: false,
    businessCategoryComplete: false,
    businessTypeComplete: false,
    businessIdentityComplete: false,
    addressContactComplete: false,
    submitted: false,
    verificationStatus: null,
    loginEnabled: false,
    ...complete,
  })
}

function Probe() {
  const location = useLocation()
  return (
    <>
      <p data-testid="location">{location.pathname}</p>
      <pre data-testid="state">{JSON.stringify(location.state)}</pre>
    </>
  )
}

function renderAt(pathname: string, state?: OnboardingState) {
  return render(
    <MemoryRouter initialEntries={[{ pathname, state }]}>
      <Routes>
        <Route path="/about-business" element={<AboutBusinessPage />} />
        <Route path="/business-type" element={<BusinessTypePage />} />
        <Route path="/sub-business-type" element={<SubBusinessTypePage />} />
        <Route path="/business-identity" element={<BusinessIdentityPage />} />
        <Route path="/address-contact" element={<AddressContactPage />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const submit = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]')!
const heading = () => screen.getByRole('heading', { level: 2 }).textContent
const requests = () =>
  (fetchMock.mock.calls as Array<[string, RequestInit]>).map(([url, init]) => ({
    url,
    body: JSON.parse(init.body as string) as Record<string, unknown>,
  }))
const field = (name: string) => document.querySelector<HTMLInputElement>(`form [name="${name}"]`)!

const AFTER_PROFILE: OnboardingState = { businessSize: 'just-me', invoicingMethod: 'paper' }
const AFTER_CATEGORY: OnboardingState = { ...AFTER_PROFILE, businessType: 'food-beverage' }
const AFTER_TYPE: OnboardingState = { ...AFTER_CATEGORY, subBusinessType: 'bakery' }
const AFTER_IDENTITY: OnboardingState = {
  ...AFTER_TYPE,
  identity: {
    companyName: 'Al Noor Bakery LLC',
    crNumber: '1234567',
    vatin: 'OM1100112233',
    industrialClassification: '561001',
    accent: 'GREEN',
    logoUrl: null,
  },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await i18n.changeLanguage('en')
  sessionStorage.clear()
  saveOnboardingSession({
    onboardingToken: TOKEN,
    onboardingTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  fetchMock = vi.fn().mockResolvedValue(noContent())
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('About your business', () => {
  const SIZES = [
    ['aboutBusiness.size.justMe', 'JUST_ME'],
    ['aboutBusiness.size.twoToTen', 'PEOPLE_2_TO_10'],
    ['aboutBusiness.size.elevenToFifty', 'PEOPLE_11_TO_50'],
    ['aboutBusiness.size.fiftyPlus', 'PEOPLE_50_PLUS'],
  ] as const
  const METHODS = [
    ['aboutBusiness.invoicing.paper', 'PAPER_OR_MANUAL'],
    ['aboutBusiness.invoicing.spreadsheets', 'SPREADSHEETS'],
    ['aboutBusiness.invoicing.accounting', 'ACCOUNTING_SOFTWARE'],
    ['aboutBusiness.invoicing.erp', 'FULL_ERP_SYSTEM'],
  ] as const

  it('makes no request on render', () => {
    renderAt('/about-business')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Every combination, because the prototype branched on them: with POS ticked all sixteen must
  // reach the business-type step. Size and invoicing never decide the route; POS does.
  it.each(
    SIZES.flatMap(([sizeKey, size]) =>
      METHODS.map(([methodKey, method]) => [sizeKey, size, methodKey, method]),
    ),
  )(
    '%s (%s) with %s (%s) and POS saves once and continues to the business type',
    async (sizeKey, size, methodKey, method) => {
      const user = userEvent.setup({ delay: null })
      renderAt('/about-business')
      await user.click(screen.getByText(i18n.t(sizeKey)))
      await user.click(screen.getByText(i18n.t(methodKey)))
      await user.click(screen.getByText(i18n.t('aboutBusiness.posCardTitle')))
      await user.click(submit())

      expect(await screen.findByText(i18n.t('businessType.title'))).toBeTruthy()
      expect(requests()).toEqual([
        {
          url: '/api/v1/auth/signup/business-profile',
          body: { onboardingToken: TOKEN, businessSize: size, invoicingMethod: method },
        },
      ])
    },
  )

  it('without POS, skips the trade screens and still leaves a registration the backend accepts', async () => {
    const user = userEvent.setup({ delay: null })
    renderAt('/about-business')
    expect(
      screen
        .getByRole('button', { name: new RegExp(i18n.t('aboutBusiness.posCardTitle')) })
        .getAttribute('aria-pressed'),
    ).toBe('false')
    await user.click(submit())

    expect(await screen.findByText(i18n.t('businessIdentity.title'))).toBeTruthy()
    expect(requests()).toEqual([
      {
        url: '/api/v1/auth/signup/business-profile',
        body: {
          onboardingToken: TOKEN,
          businessSize: 'JUST_ME',
          invoicingMethod: 'PAPER_OR_MANUAL',
        },
      },
      {
        url: '/api/v1/auth/signup/business-category',
        body: { onboardingToken: TOKEN, businessCategory: 'FOOD_AND_BEVERAGE' },
      },
      {
        url: '/api/v1/auth/signup/business-type',
        body: { onboardingToken: TOKEN, businessType: 'RESTAURANT' },
      },
    ])
    // The placeholder trade is not shown anywhere: no category chip, no activity suggested from it.
    expect(screen.queryByText(i18n.t('businessType.options.foodBeverage'))).toBeNull()
    expect(
      screen.getByRole('button', { name: i18n.t('businessIdentity.isicLabel') }).textContent,
    ).toContain(i18n.t('businessIdentity.isicPlaceholder'))
  })

  it('restores the previous answers on Back', () => {
    renderAt('/about-business', { businessSize: '11-50', invoicingMethod: 'erp' })
    const pressed = screen
      .getAllByRole('button', { pressed: true })
      .map((button) => button.textContent)
    expect(pressed.some((text) => text?.includes(i18n.t('aboutBusiness.size.elevenToFifty')))).toBe(
      true,
    )
    expect(pressed.some((text) => text?.includes(i18n.t('aboutBusiness.invoicing.erp')))).toBe(true)
  })

  it('sends one request however often Continue is pressed', async () => {
    let answer: (response: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    renderAt('/about-business')
    const form = submit().closest('form') as HTMLFormElement
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(submit().disabled).toBe(true)
    await act(async () => answer(noContent()))
  })
})

describe('Business type (the backend category)', () => {
  it('saves Food & Beverage and continues to its trades', async () => {
    renderAt('/business-type', AFTER_PROFILE)
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('subBusinessType.title'))).toBeTruthy()
    expect(requests()).toEqual([
      {
        url: '/api/v1/auth/signup/business-category',
        body: { onboardingToken: TOKEN, businessCategory: 'FOOD_AND_BEVERAGE' },
      },
    ])
  })

  it.each([
    'businessType.options.automotive',
    'businessType.options.retail',
    'businessType.options.beautyWellness',
    'businessType.options.healthcare',
    'businessType.options.hospitality',
    'businessType.options.education',
    'businessType.options.professional',
  ])('refuses %s without a request, and says why', async (labelKey) => {
    const user = userEvent.setup({ delay: null })
    renderAt('/business-type', AFTER_PROFILE)
    await user.click(screen.getByRole('button', { name: i18n.t(labelKey) }))
    await user.click(submit())

    expect(screen.getByRole('alert').textContent).toBe(i18n.t('businessType.unavailable'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(heading()).toBe(i18n.t('businessType.title'))
  })

  it('drops a trade chosen under a different category', async () => {
    renderAt('/business-type', {
      ...AFTER_PROFILE,
      businessType: 'retail',
      subBusinessType: 'grocery',
    })
    const user = userEvent.setup({ delay: null })
    await user.click(
      screen.getByRole('button', { name: i18n.t('businessType.options.foodBeverage') }),
    )
    await user.click(submit())
    await screen.findByText(i18n.t('subBusinessType.title'))

    expect(screen.getByRole('button', { pressed: true }).textContent).toBe(
      i18n.t('subBusinessType.options.coffeeShop'),
    )
  })
})

describe('Sub business type (the backend type)', () => {
  it.each([
    ['subBusinessType.options.coffeeShop', 'COFFEE_SHOP'],
    ['subBusinessType.options.restaurant', 'RESTAURANT'],
    ['subBusinessType.options.bakery', 'BAKERY'],
    ['subBusinessType.options.fastFood', 'FAST_FOOD'],
    ['subBusinessType.options.juiceBar', 'JUICE_BAR'],
    ['subBusinessType.options.dessertShop', 'DESSERT_SHOP'],
    ['subBusinessType.options.catering', 'CATERING'],
  ])('%s saves as %s and continues to business identity', async (labelKey, type) => {
    const user = userEvent.setup({ delay: null })
    renderAt('/sub-business-type', AFTER_CATEGORY)
    await user.click(screen.getByRole('button', { name: i18n.t(labelKey) }))
    await user.click(submit())

    expect(await screen.findByText(i18n.t('businessIdentity.title'))).toBeTruthy()
    expect(requests()).toEqual([
      {
        url: '/api/v1/auth/signup/business-type',
        body: { onboardingToken: TOKEN, businessType: type },
      },
    ])
  })

  it('restores the saved trade on Back', () => {
    renderAt('/sub-business-type', AFTER_TYPE)
    expect(screen.getByRole('button', { pressed: true }).textContent).toBe(
      i18n.t('subBusinessType.options.bakery'),
    )
  })
})

describe('Business identity', () => {
  it('shows the Participant ID made from a valid VAT number, read-only', async () => {
    renderAt('/business-identity', AFTER_TYPE)
    const user = userEvent.setup({ delay: null })
    await user.type(field('vatin'), 'om1100000001')

    const derived = screen.getAllByDisplayValue('0248:OM1100000001')
    expect(derived).toHaveLength(1)
    expect((derived[0] as HTMLInputElement).readOnly).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('starts empty, shows no derived Participant ID, and validates locally first', async () => {
    renderAt('/business-identity', AFTER_TYPE)
    expect(field('companyName').value).toBe('')
    expect(field('crNumber').value).toBe('')
    expect(field('vatin').value).toBe('')
    expect(document.body.textContent).not.toContain('0248:')
    expect(screen.getAllByDisplayValue(i18n.t('businessIdentity.peppolPending')).length).toBe(1)

    const user = userEvent.setup({ delay: null })
    await user.type(field('vatin'), 'OM1300000001')
    await user.click(submit())

    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(field('companyName'))
    expect(screen.getByText(i18n.t('validation.vatin'))).toBeTruthy()
  })

  it('suggests the business activity from the specialty, and lets it be skipped', async () => {
    renderAt('/business-identity', { ...AFTER_TYPE, subBusinessType: 'restaurant' })
    const picker = () => screen.getByRole('button', { name: i18n.t('businessIdentity.isicLabel') })
    expect(picker().textContent).toContain('Restaurants')

    cleanup()
    renderAt('/business-identity', { ...AFTER_CATEGORY, subBusinessType: 'not-mapped' })
    expect(picker().textContent).toContain(i18n.t('businessIdentity.isicPlaceholder'))
    // No activity chosen: the form is still valid, the company sets it later in Settings.
    expect(
      validateBusinessIdentity({
        companyName: 'Al Noor Bakery LLC',
        crNumber: 'CR-99',
        vatin: 'OM1200000001',
        industrialClassification: '',
        accent: 'PURPLE',
      }).industrialClassification,
    ).toBeUndefined()
  })

  it('saves exactly the backend fields and carries the preview forward', async () => {
    const user = userEvent.setup({ delay: null })
    renderAt('/business-identity', AFTER_TYPE)
    await user.type(field('companyName'), 'Al Noor Bakery LLC')
    await user.type(field('crNumber'), 'cr-99')
    await user.type(field('vatin'), 'om1200000001')
    await user.click(
      screen.getByRole('button', { name: i18n.t('businessIdentity.accents.PURPLE') }),
    )
    await user.click(submit())

    expect(await screen.findByText(i18n.t('addressContact.title'))).toBeTruthy()
    expect(requests()).toEqual([
      {
        url: '/api/v1/auth/signup/business-identity',
        body: {
          onboardingToken: TOKEN,
          legalCompanyName: 'Al Noor Bakery LLC',
          commercialRegistrationNumber: 'CR-99',
          taxNumber: 'OM1200000001',
          invoiceAccent: 'PURPLE',
        },
      },
    ])
  })

  it('sends the business activity the registrant chose, and only then', async () => {
    const user = userEvent.setup({ delay: null })
    // A restaurant pre-fills 561001 ("Restaurants"); the registrant keeps it.
    renderAt('/business-identity', { ...AFTER_TYPE, subBusinessType: 'restaurant' })
    await user.type(field('companyName'), 'Al Noor Bakery LLC')
    await user.type(field('crNumber'), 'cr-99')
    await user.type(field('vatin'), 'om1200000001')
    await user.click(submit())

    expect(await screen.findByText(i18n.t('addressContact.title'))).toBeTruthy()
    expect(requests()[0].body).toMatchObject({ industrialClassificationCode: '561001' })
  })

  it('reports a registered VATIN or CR when the earlier steps are all saved', async () => {
    fetchMock.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(
      status('BUSINESS_IDENTITY', {
        businessProfileComplete: true,
        businessCategoryComplete: true,
        businessTypeComplete: true,
      }),
    )
    const user = userEvent.setup({ delay: null })
    renderAt('/business-identity', AFTER_TYPE)
    await user.type(field('companyName'), 'Al Noor Bakery LLC')
    await user.type(field('crNumber'), '1234567')
    await user.type(field('vatin'), 'OM1100112233')
    await user.click(submit())

    expect(await screen.findByText(i18n.t('businessIdentity.identifierTaken'))).toBeTruthy()
    expect(document.body.textContent).not.toContain('A tenant with this tax number')
  })
})

describe('Address and contact', () => {
  it('starts empty, saves the backend payload and carries the answers to review', async () => {
    const user = userEvent.setup({ delay: null })
    renderAt('/address-contact', AFTER_IDENTITY)
    expect(field('addressLine').value).toBe('')
    expect(field('email').value).toBe('')

    await user.type(field('addressLine'), 'Building 4, Way 2301')
    await user.type(field('addressLine2'), 'Falaj Al Qabail')
    await user.type(field('addressLine3'), 'Villa 12')
    await user.type(field('postalCode'), '322')
    await user.type(field('poBox'), '1234')
    await user.type(field('city'), 'Sohar')
    await user.selectOptions(field('governorate'), 'northBatinah')
    await user.type(field('contactName'), 'Salim Al Harthy')
    await user.type(field('phone'), '9123 4567')
    await user.type(field('email'), 'salim@example.test')
    await user.click(submit())

    expect((await screen.findByTestId('location')).textContent).toBe('/signup-review')
    expect(requests()).toEqual([
      {
        url: '/api/v1/auth/signup/address-contact',
        body: {
          onboardingToken: TOKEN,
          addressLine: 'Building 4, Way 2301',
          addressLine2: 'Falaj Al Qabail',
          addressLine3: 'Villa 12',
          postalCode: '322',
          poBox: '1234',
          city: 'Sohar',
          governorate: 'North Al Batinah',
          contactPersonName: 'Salim Al Harthy',
          contactPhone: '+96891234567',
          contactEmail: 'salim@example.test',
        },
      },
    ])
    // Review exists to show these; submission sends none of the answers onward.
    const forwarded = JSON.parse(screen.getByTestId('state').textContent ?? '{}')
    expect(forwarded.address).toMatchObject({
      addressLine2: 'Falaj Al Qabail',
      addressLine3: 'Villa 12',
      poBox: '1234',
      city: 'Sohar',
      governorate: 'northBatinah',
      email: 'salim@example.test',
    })
  })

  it('restores every address answer, the PO Box included, when the page is reloaded', () => {
    // Router state survives a reload; an answer missing from it would be silently re-asked, and
    // one missing from the form would be silently dropped from the request.
    renderAt('/address-contact', {
      ...AFTER_IDENTITY,
      address: {
        addressLine: 'Building 4',
        addressLine2: 'Falaj Al Qabail',
        addressLine3: 'Villa 12',
        postalCode: '322',
        poBox: '1234',
        city: 'Sohar',
        governorate: 'northBatinah',
        contactName: 'Salim',
        role: '',
        phone: '91234567',
        email: 'salim@example.test',
      },
    })
    expect(field('addressLine2').value).toBe('Falaj Al Qabail')
    expect(field('addressLine3').value).toBe('Villa 12')
    expect(field('poBox').value).toBe('1234')
  })

  it('starts the PO Box empty for answers saved before it was asked', () => {
    const legacy = {
      addressLine: 'Building 4',
      addressLine2: 'Falaj Al Qabail',
      addressLine3: 'Villa 12',
      postalCode: '322',
      city: 'Sohar',
      governorate: 'northBatinah',
      contactName: 'Salim',
      role: '',
      phone: '91234567',
      email: 'salim@example.test',
    } as unknown as OnboardingState['address']
    renderAt('/address-contact', { ...AFTER_IDENTITY, address: legacy })
    expect(field('poBox').value).toBe('')
  })

  it('labels the PO Box in Arabic', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/address-contact', AFTER_IDENTITY)
    expect(screen.getByLabelText('صندوق البريد')).toBe(field('poBox'))
  })

  it('asks for address lines 2 and 3 and the postal code before saving', async () => {
    const user = userEvent.setup({ delay: null })
    renderAt('/address-contact', AFTER_IDENTITY)
    await user.type(field('addressLine'), 'Building 4')
    await user.type(field('city'), 'Sohar')
    await user.type(field('contactName'), 'Salim')
    await user.type(field('phone'), '91234567')
    await user.type(field('email'), 'salim@example.test')
    await user.click(submit())

    expect(requests()).toEqual([])
    expect(document.activeElement).toBe(field('addressLine2'))
    expect(field('addressLine3').getAttribute('aria-invalid')).toBe('true')
    expect(field('postalCode').getAttribute('aria-invalid')).toBe('true')
  })

  it('shows the invoice preview from the identity step with localized governorate', async () => {
    await i18n.changeLanguage('ar')
    renderAt('/address-contact', AFTER_IDENTITY)
    await userEvent.setup({ delay: null }).selectOptions(field('governorate'), 'dhofar')
    expect(document.body.textContent).toContain('Al Noor Bakery LLC')
    expect(document.body.textContent).toContain(i18n.t('governorate.dhofar'))
  })

  it('goes back to the missing step when the server says one is', async () => {
    fetchMock
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(status('BUSINESS_IDENTITY', { businessProfileComplete: true }))
    const user = userEvent.setup({ delay: null })
    renderAt('/address-contact', AFTER_IDENTITY)
    await user.type(field('addressLine'), 'Building 4')
    await user.type(field('addressLine2'), 'Falaj Al Qabail')
    await user.type(field('addressLine3'), 'Villa 12')
    await user.type(field('postalCode'), '322')
    await user.type(field('city'), 'Sohar')
    await user.type(field('contactName'), 'Salim')
    await user.type(field('phone'), '91234567')
    await user.type(field('email'), 'salim@example.test')
    await user.click(submit())

    expect(await screen.findByText(i18n.t('businessIdentity.title'))).toBeTruthy()
  })
})

describe('session and entry', () => {
  it('reports an ended session and keeps it marked as ended', async () => {
    fetchMock.mockResolvedValue(
      json(401, { type: 'https://api.fawtir.om/problems/authentication-failed' }),
    )
    renderAt('/about-business')
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('onboarding.sessionExpired'))).toBeTruthy()
    expect(readOnboardingSession()).toBeNull()
    expect(hasEndedOnboardingSession()).toBe(true)
  })

  it('sends a visitor without a session to signup, with no request', async () => {
    sessionStorage.clear()
    renderAt('/business-identity', AFTER_TYPE)
    expect((await screen.findByTestId('location')).textContent).toBe('/signup')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks the server where a typed-in URL may go, once', async () => {
    fetchMock.mockResolvedValue(status('BUSINESS_PROFILE'))
    renderAt('/business-identity')

    expect(await screen.findByText(i18n.t('aboutBusiness.title'))).toBeTruthy()
    expect(requests()).toEqual([
      { url: '/api/v1/auth/signup/status', body: { onboardingToken: TOKEN } },
    ])
  })

  it('sends a tab whose session ended to the waiting screen, not to signup', async () => {
    sessionStorage.clear()
    saveOnboardingSession({
      onboardingToken: TOKEN,
      onboardingTokenExpiresAt: new Date(Date.now() - 1).toISOString(),
    })
    renderAt('/business-type', AFTER_PROFILE)
    expect((await screen.findByTestId('location')).textContent).toBe('/signup-pending')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('closes every step once this tab has submitted', async () => {
    markOnboardingSubmitted(true)
    renderAt('/address-contact', AFTER_IDENTITY)
    expect((await screen.findByTestId('location')).textContent).toBe('/signup-pending')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens a typed-in step that is already allowed', async () => {
    fetchMock.mockResolvedValue(
      status('ADDRESS_CONTACT', { businessProfileComplete: true, businessIdentityComplete: true }),
    )
    renderAt('/business-identity')
    expect(await screen.findByText(i18n.t('businessIdentity.title'))).toBeTruthy()
  })
})

describe('Arabic', () => {
  it('explains an unavailable category in Arabic, with no English', async () => {
    await i18n.changeLanguage('ar')
    const user = userEvent.setup({ delay: null })
    renderAt('/business-type', AFTER_PROFILE)
    await user.click(screen.getByRole('button', { name: i18n.t('businessType.options.retail') }))
    await user.click(submit())

    expect(screen.getByRole('alert').textContent).toBe(i18n.t('businessType.unavailable'))
    expect(screen.getByRole('alert').textContent).not.toMatch(/[A-Za-z]{4,}/)
  })
})
