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
import { withBusinessTypes } from '../test/businessTypes'

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

function status(stage: string, complete: Record<string, unknown> = {}) {
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

/** What `/verify-code` hands the first step: the account email, no answers yet. */
const FROM_VERIFY: OnboardingState = { accountEmail: 'owner@alnoor.test' }
const AFTER_PROFILE: OnboardingState = { businessSize: 'just-me', invoicingMethod: 'paper' }
const AFTER_CATEGORY: OnboardingState = { ...AFTER_PROFILE, businessType: 'FOOD_AND_BEVERAGE' }
const AFTER_TYPE: OnboardingState = { ...AFTER_CATEGORY, subBusinessType: 'BAKERY' }


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
  // The business type list is answered here, so `fetchMock` holds only the steps' own requests.
  vi.stubGlobal('fetch', withBusinessTypes(fetchMock))
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
    renderAt('/about-business', FROM_VERIFY)
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
      renderAt('/about-business', FROM_VERIFY)
      await user.click(screen.getByText(i18n.t(sizeKey)))
      await user.click(screen.getByText(i18n.t(methodKey)))
      await user.click(screen.getByText(i18n.t('aboutBusiness.posCardTitle')))
      await user.click(submit())

      expect(await screen.findByText(i18n.t('businessType.title'))).toBeTruthy()
      expect(requests()).toEqual([
        {
          url: '/api/v1/auth/signup/business-profile',
          body: {
            onboardingToken: TOKEN,
            businessSize: size,
            invoicingMethod: method,
            usesPos: true,
          },
        },
      ])
    },
  )

  it('without POS, says so, posts no placeholder trade and skips the trade screens', async () => {
    const user = userEvent.setup({ delay: null })
    renderAt('/about-business', FROM_VERIFY)
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
          usesPos: false,
        },
      },
    ])
    // No trade is shown anywhere: no category chip, no activity suggested from one.
    expect(screen.queryByText(i18n.t('businessType.options.foodBeverage'))).toBeNull()
    expect(
      screen.getByRole('button', { name: i18n.t('businessIdentity.isicLabel') }).textContent,
    ).toContain(i18n.t('businessIdentity.isicPlaceholder'))
  })

  it("opened without this tab's answers, shows the ones the server saved", async () => {
    fetchMock.mockResolvedValue(
      status('BUSINESS_IDENTITY', {
        businessProfileComplete: true,
        businessCategoryComplete: true,
        businessTypeComplete: true,
        draft: {
          businessProfile: {
            businessSize: 'PEOPLE_11_TO_50',
            invoicingMethod: 'FULL_ERP_SYSTEM',
            usesPos: true,
          },
          businessCategory: 'FOOD_AND_BEVERAGE',
          businessType: 'BAKERY',
        },
      }),
    )
    renderAt('/about-business')

    expect(await screen.findByText(i18n.t('aboutBusiness.title'))).toBeTruthy()
    const pressed = screen
      .getAllByRole('button', { pressed: true })
      .map((button) => button.textContent)
    expect(pressed.some((text) => text?.includes(i18n.t('aboutBusiness.size.elevenToFifty')))).toBe(
      true,
    )
    expect(pressed.some((text) => text?.includes(i18n.t('aboutBusiness.invoicing.erp')))).toBe(true)
    expect(pressed.some((text) => text?.includes(i18n.t('aboutBusiness.posCardTitle')))).toBe(true)
    expect(requests()).toEqual([
      { url: '/api/v1/auth/signup/status', body: { onboardingToken: TOKEN } },
    ])
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
    renderAt('/about-business', FROM_VERIFY)
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
  it('offers only the types the server opened, in its order', async () => {
    renderAt('/business-type', AFTER_PROFILE)
    await screen.findByRole('button', { name: 'Food & Beverage' })
    const chips = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-pressed'))
      .map((button) => button.textContent)
    expect(chips).toEqual(['Food & Beverage', 'Retail'])
    expect(screen.queryByRole('button', { name: 'Automotive' })).toBeNull()
  })

  it('saves Food & Beverage by its code and continues to its sub types', async () => {
    renderAt('/business-type', AFTER_PROFILE)
    await screen.findByRole('button', { name: 'Food & Beverage' })
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('subBusinessType.title'))).toBeTruthy()
    expect(requests()).toEqual([
      {
        url: '/api/v1/auth/signup/business-category',
        body: { onboardingToken: TOKEN, businessCategory: 'FOOD_AND_BEVERAGE' },
      },
    ])
  })

  it('saves any other open type by its code', async () => {
    const user = userEvent.setup({ delay: null })
    renderAt('/business-type', AFTER_PROFILE)
    await user.click(await screen.findByRole('button', { name: 'Retail' }))
    await user.click(submit())

    expect(await screen.findByText(i18n.t('subBusinessType.title'))).toBeTruthy()
    expect(requests()[0].body).toEqual({ onboardingToken: TOKEN, businessCategory: 'RETAIL' })
    expect((await screen.findByRole('button', { pressed: true })).textContent).toBe('Grocery')
  })

  it('says so when the type was closed after the list was read', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        type: 'https://api.fawtir.om/problems/business-type-not-available',
        code: 'BUSINESS_TYPE_NOT_AVAILABLE',
      }),
    )
    const user = userEvent.setup({ delay: null })
    renderAt('/business-type', AFTER_PROFILE)
    await user.click(await screen.findByRole('button', { name: 'Retail' }))
    await user.click(submit())

    expect((await screen.findByRole('alert')).textContent).toBe(
      i18n.t('businessType.notAvailable'),
    )
    expect(heading()).toBe(i18n.t('businessType.title'))
  })

  it('offers a retry when the list cannot be read, and saves nothing', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(json(503, { type: 'https://api.fawtir.om/problems/unavailable' }))
    renderAt('/business-type', AFTER_PROFILE)

    expect((await screen.findByRole('alert')).textContent).toContain(
      i18n.t('businessType.loadFailed'),
    )
    expect(submit().disabled).toBe(true)
  })

  it('drops a sub type chosen under a different type', async () => {
    renderAt('/business-type', {
      ...AFTER_PROFILE,
      businessType: 'RETAIL',
      subBusinessType: 'GROCERY',
    })
    const user = userEvent.setup({ delay: null })
    await user.click(await screen.findByRole('button', { name: 'Food & Beverage' }))
    await user.click(submit())
    await screen.findByText(i18n.t('subBusinessType.title'))

    expect((await screen.findByRole('button', { pressed: true })).textContent).toBe('Coffee shop')
  })
})

describe('Sub business type (the backend type)', () => {
  it.each([
    ['Coffee shop', 'COFFEE_SHOP'],
    ['Restaurant', 'RESTAURANT'],
    ['Bakery', 'BAKERY'],
    ['Fast food', 'FAST_FOOD'],
    ['Juice bar', 'JUICE_BAR'],
    ['Dessert shop', 'DESSERT_SHOP'],
    ['Catering', 'CATERING'],
  ])('%s saves as %s and continues to business identity', async (label, type) => {
    const user = userEvent.setup({ delay: null })
    renderAt('/sub-business-type', AFTER_CATEGORY)
    await user.click(await screen.findByRole('button', { name: label }))
    await user.click(submit())

    expect(await screen.findByText(i18n.t('businessIdentity.title'))).toBeTruthy()
    expect(requests()).toEqual([
      {
        url: '/api/v1/auth/signup/business-type',
        body: { onboardingToken: TOKEN, businessType: type },
      },
    ])
  })

  it('lists only the sub types of the saved type', async () => {
    renderAt('/sub-business-type', { ...AFTER_PROFILE, businessType: 'RETAIL' })
    expect((await screen.findByRole('button', { pressed: true })).textContent).toBe('Grocery')
    expect(screen.queryByRole('button', { name: 'Coffee shop' })).toBeNull()
  })

  it('restores the saved sub type on Back', async () => {
    renderAt('/sub-business-type', AFTER_TYPE)
    expect((await screen.findByRole('button', { pressed: true })).textContent).toBe('Bakery')
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

  it('hints the activity the sub type suggests, never fills it in, and lets it be skipped', async () => {
    renderAt('/business-identity', { ...AFTER_TYPE, subBusinessType: 'RESTAURANT' })
    const picker = () => screen.getByRole('button', { name: i18n.t('businessIdentity.isicLabel') })
    expect(
      await screen.findByText((text) => text.includes('Suggested for') && text.includes('561001')),
    ).toBeTruthy()
    expect(picker().textContent).toContain(i18n.t('businessIdentity.isicPlaceholder'))
    // The type chip is the server's name for the saved type.
    expect(screen.getByText('Food & Beverage')).toBeTruthy()

    cleanup()
    renderAt('/business-identity', AFTER_TYPE)
    await screen.findByText('Food & Beverage')
    expect(screen.queryByText((text) => text.includes('Suggested for'))).toBeNull()
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
    renderAt('/business-identity', { ...AFTER_TYPE, subBusinessType: 'RESTAURANT' })
    await user.type(field('companyName'), 'Al Noor Bakery LLC')
    await user.type(field('crNumber'), 'cr-99')
    await user.type(field('vatin'), 'om1200000001')
    fireEvent.click(screen.getByRole('button', { name: i18n.t('businessIdentity.isicLabel') }))
    fireEvent.change(await screen.findByPlaceholderText(i18n.t('businessIdentity.isicSearch')), {
      target: { value: 'Restaurants' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /^Restaurants/ }))
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

  it('names a taken VATIN under the VATIN field when the server sends its code (G9)', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        detail: 'A tenant with this tax number already exists.',
        code: 'TAX_NUMBER_ALREADY_REGISTERED',
        field: 'taxNumber',
      }),
    )
    const user = userEvent.setup({ delay: null })
    renderAt('/business-identity', AFTER_TYPE)
    await user.type(field('companyName'), 'Al Noor Bakery LLC')
    await user.type(field('crNumber'), '1234567')
    await user.type(field('vatin'), 'OM1100112233')
    await user.click(submit())

    const message = await screen.findByText(i18n.t('businessIdentity.vatinTaken'))
    expect(field('vatin').getAttribute('aria-invalid')).toBe('true')
    const describedBy = field('vatin').getAttribute('aria-describedby') ?? ''
    expect(describedBy.split(' ').map((id) => document.getElementById(id)?.textContent)).toContain(
      message.textContent,
    )
    expect(screen.queryByText(i18n.t('businessIdentity.identifierTaken'))).toBeNull()
    expect(screen.queryByText(i18n.t('businessIdentity.crTaken'))).toBeNull()
    // Editing the VATIN clears its error (G6).
    await user.type(field('vatin'), '4')
    expect(screen.queryByText(i18n.t('businessIdentity.vatinTaken'))).toBeNull()
  })

  it('names a taken CR number under the CR field when the server sends its code (G9)', async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, {
        type: 'https://api.fawtir.om/problems/resource-conflict',
        detail: 'A tenant with this CR number already exists.',
        code: 'COMMERCIAL_REGISTRATION_ALREADY_REGISTERED',
        field: 'commercialRegistrationNumber',
      }),
    )
    const user = userEvent.setup({ delay: null })
    renderAt('/business-identity', AFTER_TYPE)
    await user.type(field('companyName'), 'Al Noor Bakery LLC')
    await user.type(field('crNumber'), '1234567')
    await user.type(field('vatin'), 'OM1100112233')
    await user.click(submit())

    const message = await screen.findByText(i18n.t('businessIdentity.crTaken'))
    expect(field('crNumber').getAttribute('aria-invalid')).toBe('true')
    const describedBy = field('crNumber').getAttribute('aria-describedby') ?? ''
    expect(describedBy.split(' ').map((id) => document.getElementById(id)?.textContent)).toContain(
      message.textContent,
    )
    expect(screen.queryByText(i18n.t('businessIdentity.identifierTaken'))).toBeNull()
    await user.type(field('crNumber'), '8')
    expect(screen.queryByText(i18n.t('businessIdentity.crTaken'))).toBeNull()
  })

  it('clears the "already registered" answer once the VATIN or CR number is edited (G6)', async () => {
    const taken = () =>
      fetchMock.mockResolvedValueOnce(conflict()).mockResolvedValueOnce(
        status('BUSINESS_IDENTITY', {
          businessProfileComplete: true,
          businessCategoryComplete: true,
          businessTypeComplete: true,
        }),
      )
    taken()
    const user = userEvent.setup({ delay: null })
    renderAt('/business-identity', AFTER_TYPE)
    await user.type(field('companyName'), 'Al Noor Bakery LLC')
    await user.type(field('crNumber'), '1234567')
    await user.type(field('vatin'), 'OM1100112233')
    await user.click(submit())
    expect(await screen.findByText(i18n.t('businessIdentity.identifierTaken'))).toBeTruthy()

    // Editing the VATIN into something the client refuses: only the client's message remains.
    await user.type(field('vatin'), '9')
    expect(screen.queryByText(i18n.t('businessIdentity.identifierTaken'))).toBeNull()
    await user.click(submit())
    expect(await screen.findByText(i18n.t('validation.vatin'))).toBeTruthy()
    expect(screen.queryByText(i18n.t('businessIdentity.identifierTaken'))).toBeNull()

    // The CR number clears it as well; the company name does not answer the conflict.
    await user.clear(field('vatin'))
    await user.type(field('vatin'), 'OM1100112233')
    taken()
    await user.click(submit())
    expect(await screen.findByText(i18n.t('businessIdentity.identifierTaken'))).toBeTruthy()
    await user.type(field('companyName'), 'x')
    expect(screen.getByText(i18n.t('businessIdentity.identifierTaken'))).toBeTruthy()
    await user.type(field('crNumber'), '8')
    expect(screen.queryByText(i18n.t('businessIdentity.identifierTaken'))).toBeNull()
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

    expect((await screen.findByTestId('location')).textContent).toBe('/plans')
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
    renderAt('/about-business', FROM_VERIFY)
    await userEvent.setup({ delay: null }).click(submit())

    expect(await screen.findByText(i18n.t('onboarding.sessionExpired'))).toBeTruthy()
    // The way back in, not a dead end: a fresh code by email.
    expect(
      screen.getByRole('link', { name: i18n.t('signupResume.cta') }).getAttribute('href'),
    ).toBe('/signup/resume')
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

  it('fills a typed-in step from the saved draft', async () => {
    fetchMock.mockResolvedValue(
      status('PLAN', {
        businessProfileComplete: true,
        businessCategoryComplete: true,
        businessTypeComplete: true,
        businessIdentityComplete: true,
        addressContactComplete: true,
        draft: {
          businessProfile: { businessSize: 'JUST_ME', invoicingMethod: 'PAPER_OR_MANUAL', usesPos: false },
          businessIdentity: {
            legalCompanyName: 'Al Noor Bakery LLC',
            commercialRegistrationNumber: '1234567',
            taxNumber: 'OM1100112233',
            invoiceAccent: 'GREEN',
          },
        },
      }),
    )
    renderAt('/business-identity')

    expect(await screen.findByText(i18n.t('businessIdentity.title'))).toBeTruthy()
    expect(field('companyName').value).toBe('Al Noor Bakery LLC')
    expect(field('vatin').value).toBe('OM1100112233')
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
  it('explains a closed business type in Arabic, with no English', async () => {
    await i18n.changeLanguage('ar')
    fetchMock.mockResolvedValueOnce(
      json(400, { type: 'https://api.fawtir.om/problems/business-type-not-available' }),
    )
    const user = userEvent.setup({ delay: null })
    renderAt('/business-type', AFTER_PROFILE)
    // The server's Arabic name, and its English one where it has no Arabic yet.
    await user.click(await screen.findByRole('button', { name: 'الأغذية والمشروبات' }))
    await user.click(submit())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(i18n.t('businessType.notAvailable'))
    expect(alert.textContent).not.toMatch(/[A-Za-z]{4,}/)
  })
})
