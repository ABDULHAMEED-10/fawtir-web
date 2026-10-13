import { governorateIdFor } from '../governorates'
import {
  INVOICE_ACCENTS,
  type BusinessSize,
  type InvoiceAccent,
  type InvoicingMethod,
  type OnboardingState,
} from '../onboarding'
import type { BillingCycle, SignupPaymentMethod } from '../pricing'
import {
  BILLING_CYCLE,
  BUSINESS_SIZE,
  INVOICING_METHOD,
  PAYMENT_METHOD_CODE,
  categoryIdFor,
  planIdFor,
  subTypeIdFor,
  type SignupStatusResponse,
} from './onboarding'
import type { AddressContactValues } from './onboarding'

const reverse = <K extends string, V>(map: Record<K, V>, value: V | null | undefined) =>
  (Object.keys(map) as K[]).find((key) => map[key] === value)

/**
 * Phase A contract §4 says the draft's members follow each step's request DTO, but also lists
 * shorter names (`legalName`, `accent`, `registeredAddressLine`). Until the two agree, either
 * spelling is read, here and nowhere else, so the reconciliation is one edit.
 */
function text(record: Record<string, unknown> | null | undefined, ...names: string[]) {
  if (!record) return undefined
  for (const name of names) {
    const value = record[name]
    if (typeof value === 'string') return value
  }
  return undefined
}

const isAccent = (value: string | undefined): value is InvoiceAccent =>
  INVOICE_ACCENTS.some((option) => option.id === value)

/** The stored `+968XXXXXXXX` back to the eight digits the phone field edits. */
const localPhone = (stored: string) => stored.replace(/^\+?968/, '').replace(/\D/g, '')

function identityFrom(status: SignupStatusResponse, cached: OnboardingState) {
  const saved = status.draft?.businessIdentity
  const companyName = text(saved, 'legalCompanyName', 'legalName')
  if (!saved || companyName === undefined) return undefined
  const accent = text(saved, 'invoiceAccent', 'accent')
  return {
    companyName,
    crNumber: text(saved, 'commercialRegistrationNumber') ?? '',
    vatin: text(saved, 'taxNumber') ?? '',
    industrialClassification: text(saved, 'industrialClassificationCode') ?? '',
    // The design's first swatch is what the identity form itself starts on.
    accent: isAccent(accent) ? accent : INVOICE_ACCENTS[0].id,
    // The logo is a preview of a local file; the server never had it.
    logoUrl: cached.identity?.logoUrl ?? null,
  }
}

function addressFrom(status: SignupStatusResponse): AddressContactValues | undefined {
  const saved = status.draft?.addressContact
  const addressLine = text(saved, 'addressLine', 'registeredAddressLine')
  // An unknown governorate name is not mapped onto a guessed one: the review then says
  // "Saved earlier" for the address rather than showing the wrong region.
  const governorate = governorateIdFor(text(saved, 'governorate'))
  if (!saved || addressLine === undefined || !governorate) return undefined
  return {
    addressLine,
    addressLine2: text(saved, 'addressLine2', 'registeredAddressLine2') ?? '',
    addressLine3: text(saved, 'addressLine3', 'registeredAddressLine3') ?? '',
    postalCode: text(saved, 'postalCode') ?? '',
    poBox: text(saved, 'poBox') ?? '',
    city: text(saved, 'city') ?? '',
    governorate,
    contactName: text(saved, 'contactPersonName') ?? '',
    role: text(saved, 'contactRole') ?? '',
    phone: localPhone(text(saved, 'contactPhone') ?? ''),
    email: text(saved, 'contactEmail') ?? '',
  }
}

const defined = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, member]) => member !== undefined)) as T

/**
 * Refills the router-state cache from the status read. The server's answers win over anything
 * cached; members it does not return keep what the tab had, so an older server that sends no
 * draft still leaves the page as it was.
 */
export function onboardingStateFromStatus(
  status: SignupStatusResponse,
  cached: OnboardingState = {},
): OnboardingState {
  const profile = status.draft?.businessProfile
  const plan = status.plan?.planCode ? planIdFor(status.plan.planCode) : undefined
  const preference = status.paymentPreference
  const fromServer: OnboardingState = defined({
    accountEmail: status.accountEmail ?? undefined,
    businessSize: reverse<BusinessSize, string>(BUSINESS_SIZE, profile?.businessSize),
    invoicingMethod: reverse<InvoicingMethod, string>(INVOICING_METHOD, profile?.invoicingMethod),
    usesPos: typeof profile?.usesPos === 'boolean' ? profile.usesPos : undefined,
    businessType: categoryIdFor(status.draft?.businessCategory),
    subBusinessType: subTypeIdFor(status.draft?.businessType),
    identity: identityFrom(status, cached),
    address: addressFrom(status),
    plan,
    billing: reverse<BillingCycle, string>(BILLING_CYCLE, status.plan?.billingCycle),
    planTerms: status.plan ?? undefined,
    // A preference saved before V287 has no enrollment: left undefined so the screen asks again,
    // never read as a trial.
    enrollment:
      preference?.enrollment === 'TRIAL'
        ? 'trial'
        : preference?.enrollment === 'PAY_NOW'
          ? 'payNow'
          : undefined,
    paymentMethod:
      plan === 'enterprise'
        ? undefined
        : reverse<SignupPaymentMethod, string>(PAYMENT_METHOD_CODE, preference?.method),
    addon: typeof preference?.erpExtractionAddon === 'boolean' ? preference.erpExtractionAddon : undefined,
  })
  const merged: OnboardingState = { ...cached, ...fromServer, restored: true }
  // Names the tab carried for another plan than the one saved would label it wrongly.
  if (merged.planNames && cached.plan !== merged.plan) delete merged.planNames
  // Without POS the server holds no trade; a cached one would be shown as if it were saved.
  if (merged.usesPos === false) {
    delete merged.businessType
    delete merged.subBusinessType
  }
  // Enterprise skips payment, and choosing it clears a saved preference (contract §1).
  if (merged.plan === 'enterprise') {
    delete merged.enrollment
    delete merged.paymentMethod
    delete merged.addon
  }
  // A trial carries no method; one cached from an earlier visit must not ride along with it.
  if (merged.enrollment === 'trial') delete merged.paymentMethod
  return merged
}
