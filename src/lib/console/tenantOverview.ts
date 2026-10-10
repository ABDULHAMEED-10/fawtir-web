import { COMPANIES_PATH, REVIEW_PERMISSION, VERIFICATION_ROUTE } from './companyVerification'
import type { IdentityStatus, TenantStatus, VerificationStatus } from './companyVerification'

/**
 * `GET /api/v1/platform/companies/{tenantId}/overview` — the platform's read model for one
 * CUSTOMER tenant. Guarded by the same permission as the rest of that surface, so the console
 * reuses {@link REVIEW_PERMISSION} rather than naming a second one.
 *
 * The backend answers 404 for an internal realm exactly as for an unknown id, so there is
 * nothing for the client to filter: it renders what it is given.
 */
export const TENANT_OVERVIEW_PERMISSION = REVIEW_PERMISSION

export function tenantOverviewPath(tenantId: string): string {
  return `${COMPANIES_PATH}/${tenantId}/overview`
}

/** Where a company still awaiting a decision is reviewed. Tenant Detail links, never decides. */
export function verificationRouteFor(tenantId: string): string {
  return `${VERIFICATION_ROUTE}/${tenantId}`
}

/** `PlatformTenantOverview.Identity`. */
export type OverviewIdentity = {
  tenantId: string
  tenantCode: string
  tenantName: string
  tenantStatus: TenantStatus | null
  identityStatus: IdentityStatus | null
}

/**
 * `PlatformTenantOverview.Company`. The registered address arrives as its parts because
 * IBR-010-OM treats them as a unit; joining them for display is the caller's choice.
 */
export type OverviewCompany = {
  legalName: string | null
  legalNameAr: string | null
  tradingName: string | null
  commercialRegistrationNumber: string | null
  taxNumber: string | null
  country: string | null
  registeredAddressLine1: string | null
  registeredAddressLine2: string | null
  registeredAddressLine3: string | null
  registeredCity: string | null
  registeredPostalCode: string | null
  registeredCountrySubdivision: string | null
  registeredPoBox: string | null
  timezone: string | null
  contactPersonName: string | null
  contactPhone: string | null
  contactEmail: string | null
}

/** `PlatformTenantOverview.Verification`. `evidenceRecorded` only — never the reference. */
export type OverviewVerification = {
  status: VerificationStatus
  method: 'MANUAL_ATTESTATION' | null
  rejectionReason: string | null
  attestationReference: string | null
  evidenceRecorded: boolean
  profileRevision: number
  submittedAt: string | null
  submittedBy: string | null
  decidedAt: string | null
  decidedBy: string | null
}

/**
 * `PlatformTenantOverview.Subscription`.
 *
 * `monthlyPrice` is the plan's configured price. It is not an amount invoiced, collected or
 * owed, and must never be labelled payment, revenue or MRR. `invoicesPerMonth` is the plan's
 * allowance and is not consumption — the backend can compute consumption and deliberately does
 * not publish it here, so the console must not infer it either.
 */
export type OverviewSubscription = {
  planCode: string | null
  planName: string | null
  /** A three-decimal string since V265; a number from an older server. */
  monthlyPrice: string | number | null
  invoicesPerMonth: number
  /** The price version the tenant is pinned to (V265); absent from an older server. */
  planVersionId?: string | null
  planVersionNumber?: number | null
  /** True when the tenant keeps an older version than the plan now offers (grandfathered). */
  pinned?: boolean
  billingCycle?: 'MONTHLY' | 'ANNUAL' | null
  overageEnabled: boolean
  implicitDefault: boolean
  startedOn: string | null
  changedAt: string | null
}

/**
 * `PlatformTenantOverview.Operational`: the account gate (verified, enabled, active). It does not
 * mean the company can issue invoices, which also needs its Participant ID and seller details;
 * showing it as "ready to submit" told operators a company could issue when every invoice would
 * be refused. That answer is `invoicing`.
 */
export type OverviewOperational = {
  ready: boolean
  reasonCode: string | null
}

/**
 * `PlatformTenantOverview.Invoicing`: the company's own issuance prerequisites, the same answer its
 * dashboard shows. Absent from older backends, which only had `operational`.
 */
export type OverviewInvoicing = {
  ready: boolean
  items: { code: string; status: string; owner: string }[]
}

export type TenantOverview = {
  identity: OverviewIdentity
  company: OverviewCompany
  verification: OverviewVerification
  subscription: OverviewSubscription
  operational: OverviewOperational
  invoicing?: OverviewInvoicing | null
}

/** The monogram the header draws. Derived from the real name, never from a fixture. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** The address parts the backend actually returned, in order, joined for one line of display. */
export function addressLine(company: OverviewCompany): string[] {
  return [
    company.registeredAddressLine1,
    company.registeredAddressLine2,
    company.registeredAddressLine3,
    company.registeredCity,
    company.registeredCountrySubdivision,
    company.registeredPostalCode,
  ].filter((part): part is string => Boolean(part && part.trim()))
}
