import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import { baisaOf } from '../identity/signupPlans'
import { COMPLIANCE_FEATURES, FEATURE_LIST, type Feature } from '../plans'
import { formatBaisa } from '../pricing'
import { lockedFeatures, type CatalogueAdminPlan, type PlanFeatureEntry } from './planCatalogue'

/**
 * One company's negotiated Enterprise terms (`PlatformEnterpriseTermsController`, V348; Business
 * Rules PL-1, §13 "Enterprise: negotiated prices, limits and features per company"). The terms are
 * a plan owned by the company, so the server versions, bills and renews them as any plan.
 *
 * Reading and quoting need `platform.billing.read`; saving needs `platform.billing.manage` (tenant
 * administrators only), plus MFA, no impersonation and the production PLATFORM realm, which the
 * server enforces. Every save carries `If-Match` (the `version` read, 0 before any terms) and a
 * reason. Starting billing is a separate act, not offered here.
 */
export const BILLING_READ = 'platform.billing.read'
export const BILLING_MANAGE = 'platform.billing.manage'

export const ENTERPRISE_LIST_PATH = '/v1/platform/enterprise-terms'
export const enterpriseTermsPath = (tenantId: string) =>
  `/v1/platform/companies/${encodeURIComponent(tenantId)}/enterprise-terms`
export const enterpriseTermsRoute = (tenantId: string) =>
  `/console/tenants/${encodeURIComponent(tenantId)}/enterprise-terms`

/** PL-4: an annual price is the monthly price times ten unless Enterprise negotiates another. */
export const ANNUAL_MONTHS = 10

export type EnterpriseState = 'TERMS_NOT_SET' | 'TERMS_SET' | 'BILLING_STARTED'
export type BillingCycle = 'MONTHLY' | 'ANNUAL'
export type ApplyFrom = 'BEFORE_FIRST_BILL' | 'NEXT_RENEWAL'

/** One period of the terms, VAT at the billing settings' rate. Amounts have three decimals. */
export type EnterpriseQuoteDto = {
  billingCycle: BillingCycle
  amountExclVat: string
  vatRate: string
  vatAmount: string
  amountInclVat: string
  currency: 'OMR'
}

export type EnterpriseTermsChangeDto = {
  id: string
  tenantId: string
  planCode: string
  planVersionId: string
  kind: 'SET' | 'CHANGED' | (string & {})
  applyFrom: ApplyFrom | (string & {})
  effectiveOn: string
  billingCycle: BillingCycle
  contractReference: string | null
  reason: string
  createdBy: string | null
  /** The operator's name (OP-3); null when the account is in neither realm the server reads. */
  createdByName?: string | null
  createdAt: string
}

export type EnterpriseTermsDto = {
  tenantId: string
  state: EnterpriseState
  /** The `If-Match` counter; 0 while the company has no terms. */
  version: number
  /** The company's own plan; its `currentVersion` is the newest terms. */
  plan: CatalogueAdminPlan | null
  inForce: {
    planCode: string
    planVersionId: string
    planVersionNumber: number | null
    billingCycle: BillingCycle | null
  } | null
  /** Terms waiting for the next renewal. */
  pending: {
    planCode: string
    planVersionId: string
    planVersionNumber: number | null
    billingCycle: BillingCycle
    effectiveOn: string
  } | null
  nextBill: EnterpriseQuoteDto | null
  /** Newest first. */
  history: EnterpriseTermsChangeDto[]
}

export type EnterpriseCompanyDto = {
  tenantId: string
  legalName: string
  state: EnterpriseState
  since: string
}

export type EnterpriseTermsRequest = {
  nameEn: string | null
  nameAr: string | null
  monthlyPrice: string
  annualPrice: string | null
  invoicesPerMonth: number
  peopleIncluded: number
  branchesIncluded: number | null
  extraPersonPrice: string | null
  extraBranchPrice: string | null
  overagePricePerInvoice: string | null
  /** The ERP and API add-on as a paid extra, one month (ER-1); null = not offered. */
  erpAddonMonthlyPrice: string | null
  apiAccess: boolean
  prioritySupport: boolean
  features: PlanFeatureEntry[]
  billingCycle: BillingCycle
  contractReference: string | null
  reason?: string
}

/** The form as typed: numbers stay strings until they are validated. */
export type EnterpriseTermsForm = {
  nameEn: string
  nameAr: string
  monthlyPrice: string
  annualPrice: string
  /** The operator typed the annual price; until then it follows the monthly price x 10. */
  annualTouched: boolean
  invoicesPerMonth: string
  peopleIncluded: string
  branchesIncluded: string
  extraPersonPrice: string
  extraBranchPrice: string
  overagePricePerInvoice: string
  erpAddonMonthlyPrice: string
  apiAccess: boolean
  prioritySupport: boolean
  billingCycle: BillingCycle
  contractReference: string
  features: Record<string, boolean>
}

export type EnterpriseTermsField = Exclude<
  keyof EnterpriseTermsForm,
  'features' | 'annualTouched' | 'apiAccess' | 'prioritySupport' | 'billingCycle'
>
export type EnterpriseTermsErrors = Partial<Record<EnterpriseTermsField | 'reason', string>>

export const ENTERPRISE_FIELD_ORDER: readonly (EnterpriseTermsField | 'reason')[] = [
  'nameEn',
  'nameAr',
  'monthlyPrice',
  'annualPrice',
  'invoicesPerMonth',
  'peopleIncluded',
  'branchesIncluded',
  'extraPersonPrice',
  'extraBranchPrice',
  'overagePricePerInvoice',
  'erpAddonMonthlyPrice',
  'contractReference',
  'reason',
]

export const REASON_MAX = 500
const NAME_MAX = 80
const CONTRACT_MAX = 100

/** Three decimals and no thousands separators, so the input re-parses. */
const decimal = (amount: string | null | undefined) => {
  const baisa = baisaOf(amount ?? null)
  return baisa === null ? (amount ?? '') : formatBaisa(baisa)
}

/** Monthly x 10 at three decimals, or '' while the monthly price is not a figure yet. */
export function annualFromMonthly(monthly: string): string {
  const baisa = baisaOf(monthly.trim() || null)
  return baisa === null ? '' : formatBaisa(baisa * ANNUAL_MONTHS)
}

/**
 * The form for the terms read: the plan's newest version when the company has one, otherwise
 * empty with compliance features on (no other feature is assumed) and a monthly cycle.
 */
export function enterpriseFormFrom(terms: EnterpriseTermsDto): EnterpriseTermsForm {
  const plan = terms.plan
  const locked = lockedFeatures(plan)
  const starting = Object.fromEntries(
    FEATURE_LIST.map((feature) => [feature, COMPLIANCE_FEATURES.includes(feature)]),
  )
  const cycle = terms.pending?.billingCycle ?? terms.inForce?.billingCycle ?? 'MONTHLY'
  if (!plan) {
    return {
      nameEn: '',
      nameAr: '',
      monthlyPrice: '',
      annualPrice: '',
      annualTouched: false,
      invoicesPerMonth: '',
      peopleIncluded: '',
      branchesIncluded: '',
      extraPersonPrice: '',
      extraBranchPrice: '',
      overagePricePerInvoice: '',
      erpAddonMonthlyPrice: '',
      apiAccess: false,
      prioritySupport: false,
      billingCycle: cycle,
      contractReference: '',
      features: starting,
    }
  }
  const version = plan.currentVersion
  const monthlyPrice = decimal(version.monthlyPrice)
  const annualPrice = decimal(version.annualPrice)
  return {
    nameEn: plan.nameEn,
    nameAr: plan.nameAr ?? '',
    monthlyPrice,
    annualPrice,
    annualTouched: annualPrice !== annualFromMonthly(monthlyPrice),
    invoicesPerMonth: String(version.invoicesPerMonth),
    peopleIncluded: String(version.peopleIncluded),
    branchesIncluded: version.branchesIncluded === null ? '' : String(version.branchesIncluded),
    extraPersonPrice: decimal(version.extraPersonPrice),
    extraBranchPrice: decimal(version.extraBranchPrice),
    overagePricePerInvoice: decimal(version.overagePricePerInvoice),
    erpAddonMonthlyPrice: decimal(version.erpAddonMonthlyPrice),
    apiAccess: version.apiAccess,
    prioritySupport: version.prioritySupport,
    billingCycle: cycle,
    contractReference: terms.history[0]?.contractReference ?? '',
    features: {
      ...starting,
      ...Object.fromEntries(plan.features.map((entry) => [entry.key, entry.enabled])),
      ...Object.fromEntries([...locked].map((feature) => [feature, true])),
    },
  }
}

// The server's bounds: NUMERIC(12, 3) money (nine integer digits, three decimals; a fourth decimal
// is refused, never rounded) and counts of at least one.
const MONEY = /^\d{1,9}(\.\d{1,3})?$/
const WHOLE = /^\d{1,9}$/

function money(value: string, required: boolean): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return required ? 'validation.required' : undefined
  return MONEY.test(trimmed) ? undefined : 'console.plans.validation.money'
}

function atLeastOne(value: string, required: boolean): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return required ? 'validation.required' : undefined
  if (!WHOLE.test(trimmed)) return 'console.plans.validation.whole'
  return Number(trimmed) >= 1 ? undefined : 'console.plans.validation.atLeastOne'
}

/**
 * ER-1: the add-on price is above zero (ERP included in the contract is the ERP grant, not a zero
 * price) and needs ERP field mapping on, as the server checks.
 */
function erpAddonPrice(form: EnterpriseTermsForm): string | undefined {
  const trimmed = form.erpAddonMonthlyPrice.trim()
  if (!trimmed) return undefined
  const invalid = money(trimmed, false)
  if (invalid) return invalid
  if ((baisaOf(trimmed) ?? 0) <= 0) return 'console.enterpriseTerms.validation.erpAddonAboveZero'
  return form.features.erpMapping
    ? undefined
    : 'console.enterpriseTerms.validation.erpAddonNeedsMapping'
}

const longer = (value: string, max: number, key: string) =>
  value.trim().length > max ? key : undefined

/** The checks the server makes, so a save that must fail is caught before it is sent. */
export function validateEnterpriseForm(form: EnterpriseTermsForm): EnterpriseTermsErrors {
  const errors: EnterpriseTermsErrors = {
    nameEn: longer(form.nameEn, NAME_MAX, 'console.plans.validation.nameLength'),
    nameAr: longer(form.nameAr, NAME_MAX, 'console.plans.validation.nameLength'),
    monthlyPrice: money(form.monthlyPrice, true),
    annualPrice: money(form.annualPrice, false),
    invoicesPerMonth: atLeastOne(form.invoicesPerMonth, true),
    peopleIncluded: atLeastOne(form.peopleIncluded, true),
    branchesIncluded: atLeastOne(form.branchesIncluded, false),
    extraPersonPrice: money(form.extraPersonPrice, false),
    extraBranchPrice: money(form.extraBranchPrice, false),
    overagePricePerInvoice: money(form.overagePricePerInvoice, false),
    erpAddonMonthlyPrice: erpAddonPrice(form),
    contractReference: longer(
      form.contractReference,
      CONTRACT_MAX,
      'console.enterpriseTerms.validation.contractLength',
    ),
  }
  return Object.fromEntries(
    Object.entries(errors).filter(([, key]) => key !== undefined),
  ) as EnterpriseTermsErrors
}

/** The reason the save needs (the quote does not). */
export function validateReason(reason: string): string | undefined {
  if (!reason.trim()) return 'console.plans.validation.reasonRequired'
  return longer(reason, REASON_MAX, 'console.plans.validation.reasonLength')
}

const text = (value: string) => value.trim() || null
const amount = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const baisa = baisaOf(trimmed)
  return baisa === null ? trimmed : formatBaisa(baisa)
}

/**
 * The whole terms, field by field. `applyFrom` is left to the server, which picks the only one
 * that fits (at once before anything is paid, the next renewal after). Feature keys the app does
 * not know are sent back as read, so a key added on the server is not switched off here.
 */
export function toEnterpriseRequest(
  form: EnterpriseTermsForm,
  plan: CatalogueAdminPlan | null,
  reason?: string,
): EnterpriseTermsRequest {
  const known = new Set<string>(FEATURE_LIST)
  const locked = lockedFeatures(plan)
  const features: PlanFeatureEntry[] = [
    ...FEATURE_LIST.map((feature: Feature) => ({
      key: feature,
      enabled: locked.has(feature) || Boolean(form.features[feature]),
    })),
    ...(plan?.features
      .filter((entry) => !known.has(entry.key))
      .map((entry) => ({ key: entry.key, enabled: locked.has(entry.key) || entry.enabled })) ?? []),
  ]
  const trimmedReason = reason?.trim()
  return {
    nameEn: text(form.nameEn),
    nameAr: text(form.nameAr),
    monthlyPrice: amount(form.monthlyPrice) ?? '0.000',
    annualPrice: amount(form.annualPrice),
    invoicesPerMonth: Number(form.invoicesPerMonth.trim()),
    peopleIncluded: Number(form.peopleIncluded.trim()),
    branchesIncluded: form.branchesIncluded.trim() ? Number(form.branchesIncluded.trim()) : null,
    extraPersonPrice: amount(form.extraPersonPrice),
    extraBranchPrice: amount(form.extraBranchPrice),
    overagePricePerInvoice: amount(form.overagePricePerInvoice),
    erpAddonMonthlyPrice: amount(form.erpAddonMonthlyPrice),
    apiAccess: form.apiAccess,
    prioritySupport: form.prioritySupport,
    features,
    billingCycle: form.billingCycle,
    contractReference: text(form.contractReference),
    ...(trimmedReason ? { reason: trimmedReason } : {}),
  }
}

/** What one period of the drafted terms would bill; writes nothing. */
export function quoteEnterpriseTerms(
  tenantId: string,
  request: EnterpriseTermsRequest,
): Promise<EnterpriseQuoteDto> {
  return apiRequest(`${enterpriseTermsPath(tenantId)}/quote`, { method: 'POST', body: request })
}

export function saveEnterpriseTerms(
  tenantId: string,
  version: number,
  request: EnterpriseTermsRequest,
): Promise<EnterpriseTermsDto> {
  return apiRequest(enterpriseTermsPath(tenantId), {
    method: 'PUT',
    headers: { 'If-Match': `"${version}"` },
    body: request,
  })
}

export function enterpriseListPath(state: EnterpriseState | null): string {
  return state
    ? `${ENTERPRISE_LIST_PATH}?state=${state}&size=200`
    : `${ENTERPRISE_LIST_PATH}?size=200`
}

/** Whether VAT is charged on the quote: a zero rate shows no VAT line. */
export function quoteChargesVat(quote: EnterpriseQuoteDto): boolean {
  return (baisaOf(quote.vatAmount) ?? 0) > 0
}

const K = 'console.enterpriseTerms.refusal.'

/** True when the refusal means the terms read is stale and must be read again. */
export function isTermsConflict(error: unknown): boolean {
  return error instanceof ApiError && error.problemType === 'enterprise-terms-version-conflict'
}

/**
 * Every refusal these calls can answer, in the console's words; the server's English `detail` is
 * never shown. A 403 that is neither the realm nor impersonation is a lapsed MFA or a missing
 * permission, which the screen cannot tell apart.
 */
export function describeEnterpriseTermsFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    switch (error.problemType) {
      case 'enterprise-terms-version-conflict':
        return { key: `${K}conflict` }
      case 'enterprise-terms-apply-from-refused':
        return { key: `${K}applyFrom` }
      case 'subscription-change-blocked-by-payment':
        return { key: `${K}paymentBeingChecked` }
      case 'production-platform-realm-required':
        return { key: `${K}realm` }
      case 'impersonation-not-allowed':
        return { key: `${K}impersonation` }
    }
    if (error.status === 403) return { key: `${K}forbidden` }
    if (error.status === 404) return { key: `${K}gone` }
    if (error.status === 400) return { key: `${K}invalid` }
  }
  return commonFailureMessage(error)
}
