import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import { baisaOf } from '../identity/signupPlans'
import { COMPLIANCE_FEATURES, FEATURE_LIST, type Feature } from '../plans'
import { formatBaisa } from '../pricing'

/**
 * The platform plan catalogue (`PlatformPlanCatalogueController`, catalogue contract §11-§12).
 * Reading needs `platform.plans.read` (tenant admin and support operators); every change needs
 * `platform.plans.manage` (tenant admin only). The console checks both only to decide what to
 * offer: the backend enforces them, plus MFA, no impersonation and the production realm.
 */
export const PLANS_READ_PERMISSION = 'platform.plans.read'
export const PLANS_MANAGE_PERMISSION = 'platform.plans.manage'
export const PLANS_PATH = '/v1/platform/plans'

export const planPath = (code: string) => `${PLANS_PATH}/${encodeURIComponent(code)}`
export const planHistoryPath = (code: string) => `${planPath(code)}/history`

/**
 * One published price and limits of a plan (`tenant.subscription_plan_versions`). Append-only: a
 * subscription pinned to it keeps exactly these terms. Amounts are OMR strings with three
 * decimals; the `null`s keep the V176 meanings (ceiling, unlimited, not offered).
 */
export type PlanVersion = {
  id: string
  planCode: string
  versionNumber: number
  effectiveFrom: string
  monthlyPrice: string
  annualPrice: string
  invoicesPerMonth: number
  peopleIncluded: number
  extraPersonPrice: string | null
  branchesIncluded: number | null
  extraBranchPrice: string | null
  overagePricePerInvoice: string | null
  apiAccess: boolean
  prioritySupport: boolean
  reason: string | null
  createdBy: string | null
  createdAt: string
}

/** `compliance` (admin read only): the backend locks the feature on; it cannot be switched off. */
export type PlanFeatureEntry = { key: string; enabled: boolean; compliance?: boolean }

/**
 * A plan as `GET /platform/plans` returns it: what changes in place (names, visibility, policy),
 * the version offered to new subscribers, the feature switches, and `version`, the counter a
 * save sends back as `If-Match`.
 */
export type CatalogueAdminPlan = {
  code: string
  nameEn: string
  nameAr: string | null
  descriptionEn: string | null
  descriptionAr: string | null
  currency: string
  active: boolean
  publicVisible: boolean
  recommended: boolean
  sortOrder: number
  annualFreeMonths: number
  trialDays: number | null
  trialDocuments: number | null
  version: number
  currentVersion: PlanVersion
  features: PlanFeatureEntry[]
  updatedAt?: string | null
  updatedBy?: string | null
}

export type PlanEventKind =
  | 'CREATED'
  | 'UPDATED'
  | 'PRICE_VERSION_PUBLISHED'
  | 'ACTIVATED'
  | 'DEACTIVATED'
  | 'VISIBILITY_CHANGED'
  | 'FEATURES_CHANGED'

export type PlanEvent = {
  id: string
  planCode: string
  kind: PlanEventKind | (string & {})
  versionId: string | null
  /** Before and after values, for display only; their shape is not a contract. */
  changes: Record<string, unknown> | null
  actorId: string | null
  occurredAt: string
}

/** `GET /platform/plans/{code}/history`: every version and every catalogue event. */
export type PlanHistory = { code: string; versions: PlanVersion[]; events: PlanEvent[] }

/**
 * `PlanRequest`, the whole editable plan on every save. Amounts go as strings ("80.000") so
 * nothing between here and `BigDecimal` rounds them. `reason` is required on create and whenever
 * a price or limit changes, since that publishes a version subscribers will be pinned to.
 */
export type PlanRequest = {
  code?: string
  nameEn: string
  nameAr: string | null
  descriptionEn: string | null
  descriptionAr: string | null
  active: boolean
  publicVisible: boolean
  recommended: boolean
  sortOrder: number
  annualFreeMonths: number
  trialDays: number | null
  trialDocuments: number | null
  monthlyPrice: string
  invoicesPerMonth: number
  peopleIncluded: number
  extraPersonPrice: string | null
  branchesIncluded: number | null
  extraBranchPrice: string | null
  overagePricePerInvoice: string | null
  apiAccess: boolean
  prioritySupport: boolean
  features: PlanFeatureEntry[]
  reason?: string
}

/** The editor's fields as typed: numbers stay strings until they are validated. */
export type PlanFormValues = {
  code: string
  nameEn: string
  nameAr: string
  descriptionEn: string
  descriptionAr: string
  monthlyPrice: string
  invoicesPerMonth: string
  peopleIncluded: string
  extraPersonPrice: string
  branchesIncluded: string
  extraBranchPrice: string
  overagePricePerInvoice: string
  annualFreeMonths: string
  trialDays: string
  trialDocuments: string
  sortOrder: string
  apiAccess: boolean
  prioritySupport: boolean
  active: boolean
  publicVisible: boolean
  recommended: boolean
  features: Record<string, boolean>
  reason: string
}

export type PlanField = Exclude<keyof PlanFormValues, 'features'>
export type PlanFieldErrors = Partial<Record<PlanField, string>>

export const PLAN_FIELD_ORDER: readonly PlanField[] = [
  'code',
  'nameEn',
  'nameAr',
  'descriptionEn',
  'descriptionAr',
  'monthlyPrice',
  'invoicesPerMonth',
  'peopleIncluded',
  'extraPersonPrice',
  'branchesIncluded',
  'extraBranchPrice',
  'overagePricePerInvoice',
  'annualFreeMonths',
  'trialDays',
  'trialDocuments',
  'sortOrder',
  'reason',
]

/**
 * The features no plan may switch off: the app's compliance list plus any the backend flags
 * `compliance` (contract §3), so a key added to the backend list is locked here too.
 */
export function lockedFeatures(plan: CatalogueAdminPlan | null): Set<string> {
  return new Set<string>([
    ...COMPLIANCE_FEATURES,
    ...(plan?.features.filter((entry) => entry.compliance).map((entry) => entry.key) ?? []),
  ])
}

/** A new plan starts with compliance on, as every plan must have it, and nothing else. */
const startingFeatures = () =>
  Object.fromEntries(
    FEATURE_LIST.map((feature) => [feature, COMPLIANCE_FEATURES.includes(feature)]),
  )

export function emptyPlanForm(): PlanFormValues {
  return {
    code: '',
    nameEn: '',
    nameAr: '',
    descriptionEn: '',
    descriptionAr: '',
    monthlyPrice: '',
    invoicesPerMonth: '',
    peopleIncluded: '',
    extraPersonPrice: '',
    branchesIncluded: '',
    extraBranchPrice: '',
    overagePricePerInvoice: '',
    // The column's own default (V265): two months free unless the operator says otherwise.
    annualFreeMonths: '2',
    trialDays: '',
    trialDocuments: '',
    sortOrder: '0',
    apiAccess: false,
    prioritySupport: false,
    active: true,
    publicVisible: true,
    recommended: false,
    features: startingFeatures(),
    reason: '',
  }
}

/** Three decimals and no thousands separators, so the input re-parses. */
const decimal = (amount: string | null) => {
  const baisa = baisaOf(amount)
  return baisa === null ? (amount ?? '') : formatBaisa(baisa)
}
const optionalCount = (value: number | null) => (value === null ? '' : String(value))

export function planFormFrom(plan: CatalogueAdminPlan): PlanFormValues {
  const terms = plan.currentVersion
  return {
    code: plan.code,
    nameEn: plan.nameEn,
    nameAr: plan.nameAr ?? '',
    descriptionEn: plan.descriptionEn ?? '',
    descriptionAr: plan.descriptionAr ?? '',
    monthlyPrice: decimal(terms.monthlyPrice),
    invoicesPerMonth: String(terms.invoicesPerMonth),
    peopleIncluded: String(terms.peopleIncluded),
    extraPersonPrice: decimal(terms.extraPersonPrice),
    branchesIncluded: optionalCount(terms.branchesIncluded),
    extraBranchPrice: decimal(terms.extraBranchPrice),
    overagePricePerInvoice: decimal(terms.overagePricePerInvoice),
    annualFreeMonths: String(plan.annualFreeMonths),
    trialDays: optionalCount(plan.trialDays),
    trialDocuments: optionalCount(plan.trialDocuments),
    sortOrder: String(plan.sortOrder),
    apiAccess: terms.apiAccess,
    prioritySupport: terms.prioritySupport,
    active: plan.active,
    publicVisible: plan.publicVisible,
    recommended: plan.recommended,
    features: {
      ...startingFeatures(),
      ...Object.fromEntries(plan.features.map((entry) => [entry.key, entry.enabled])),
      // Compliance is never gated (contract §3); a stored "off" would be refused on save anyway.
      ...Object.fromEntries([...lockedFeatures(plan)].map((feature) => [feature, true])),
    },
    reason: '',
  }
}

/**
 * Whether the form changes what a subscriber pays or may use. Those fields publish a new
 * version on save (contract §11), so the save needs a reason; names, visibility, trial and
 * features change in place. The annual free months set the stored annual price, so they count.
 */
export function changesTerms(plan: CatalogueAdminPlan, values: PlanFormValues): boolean {
  const before = planFormFrom(plan)
  const money = (value: string) => baisaOf(value.trim() || null)
  const whole = (value: string) => (value.trim() ? Number(value.trim()) : null)
  return (
    (
      ['monthlyPrice', 'extraPersonPrice', 'extraBranchPrice', 'overagePricePerInvoice'] as const
    ).some((field) => money(before[field]) !== money(values[field])) ||
    (['invoicesPerMonth', 'peopleIncluded', 'branchesIncluded', 'annualFreeMonths'] as const).some(
      (field) => whole(before[field]) !== whole(values[field]),
    ) ||
    before.apiAccess !== values.apiAccess ||
    before.prioritySupport !== values.prioritySupport
  )
}

// The backend's own bounds: the request's Bean Validation, `CataloguePlan` and `PlanVersion`,
// NUMERIC(12, 3) for money (nine integer digits, three decimals) and Java int for counts.
const PLAN_CODE = /^[A-Z][A-Z0-9_]{1,29}$/
const MONEY = /^\d{1,9}(\.\d{1,3})?$/
const WHOLE = /^-?\d{1,10}$/
const INT_MAX = 2_147_483_647
const INT_MIN = -2_147_483_648

function money(value: string, required: boolean): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return required ? 'validation.required' : undefined
  return MONEY.test(trimmed) ? undefined : 'console.plans.validation.money'
}

function whole(
  value: string,
  bounds: { required: boolean; min: number; max?: number; outOfRange?: string },
): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return bounds.required ? 'validation.required' : undefined
  if (!WHOLE.test(trimmed)) return 'console.plans.validation.whole'
  const parsed = Number(trimmed)
  if (bounds.outOfRange && (parsed < bounds.min || parsed > (bounds.max ?? INT_MAX))) {
    return bounds.outOfRange
  }
  if (parsed < bounds.min) {
    return bounds.min === 1
      ? 'console.plans.validation.atLeastOne'
      : 'console.plans.validation.whole'
  }
  return parsed > INT_MAX || parsed < INT_MIN ? 'console.plans.validation.whole' : undefined
}

const longerThan = (value: string, max: number, key: string) =>
  value.trim().length > max ? key : undefined

/**
 * Mirrors the rules the backend enforces, so a save that must fail is caught before it is sent.
 *
 * @param takenCodes the catalogue's existing codes, checked only when adding.
 * @param original the plan being edited, to tell whether the save publishes new terms.
 */
export function validatePlanForm(
  values: PlanFormValues,
  mode: 'add' | 'edit',
  takenCodes: readonly string[],
  original: CatalogueAdminPlan | null = null,
): PlanFieldErrors {
  const code = values.code.trim()
  const nameEn = values.nameEn.trim()
  const needsReason = mode === 'add' || (original !== null && changesTerms(original, values))
  return {
    code:
      mode === 'edit'
        ? undefined
        : !code
          ? 'validation.required'
          : !PLAN_CODE.test(code) || code === 'ENTERPRISE'
            ? 'console.plans.validation.code'
            : takenCodes.includes(code)
              ? 'console.plans.validation.codeTaken'
              : undefined,
    nameEn: !nameEn
      ? 'validation.required'
      : longerThan(nameEn, 80, 'console.plans.validation.nameLength'),
    nameAr: longerThan(values.nameAr, 80, 'console.plans.validation.nameLength'),
    descriptionEn: longerThan(
      values.descriptionEn,
      500,
      'console.plans.validation.descriptionLength',
    ),
    descriptionAr: longerThan(
      values.descriptionAr,
      500,
      'console.plans.validation.descriptionLength',
    ),
    monthlyPrice: money(values.monthlyPrice, true),
    invoicesPerMonth: whole(values.invoicesPerMonth, { required: true, min: 1 }),
    peopleIncluded: whole(values.peopleIncluded, { required: true, min: 1 }),
    extraPersonPrice: money(values.extraPersonPrice, false),
    branchesIncluded: whole(values.branchesIncluded, { required: false, min: 1 }),
    extraBranchPrice: money(values.extraBranchPrice, false),
    overagePricePerInvoice: money(values.overagePricePerInvoice, false),
    annualFreeMonths: whole(values.annualFreeMonths, {
      required: true,
      min: 0,
      max: 11,
      outOfRange: 'console.plans.validation.freeMonths',
    }),
    trialDays: whole(values.trialDays, {
      required: false,
      min: 1,
      max: 90,
      outOfRange: 'console.plans.validation.trialDays',
    }),
    trialDocuments:
      whole(values.trialDocuments, { required: false, min: 1 }) ??
      (values.trialDocuments.trim() && !values.trialDays.trim()
        ? 'console.plans.validation.trialDocumentsNeedDays'
        : undefined),
    sortOrder: whole(values.sortOrder, { required: true, min: INT_MIN }),
    reason: !needsReason
      ? longerThan(values.reason, 500, 'console.plans.validation.reasonLength')
      : !values.reason.trim()
        ? 'console.plans.validation.reasonRequired'
        : longerThan(values.reason, 500, 'console.plans.validation.reasonLength'),
  }
}

const text = (value: string) => value.trim() || null
const amount = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const baisa = baisaOf(trimmed)
  return baisa === null ? trimmed : formatBaisa(baisa)
}
const count = (value: string) => (value.trim() ? Number(value.trim()) : null)

/**
 * The whole plan, built field by field from the form (no spread of form state into a request).
 * Feature keys the app does not know are sent back as they were read, so a key added on the
 * backend is not switched off by an editor that never showed it.
 */
export function toPlanRequest(
  values: PlanFormValues,
  mode: 'add' | 'edit',
  original: CatalogueAdminPlan | null = null,
): PlanRequest {
  const known = new Set<string>(FEATURE_LIST)
  const locked = lockedFeatures(original)
  const features: PlanFeatureEntry[] = [
    ...FEATURE_LIST.map((feature: Feature) => ({
      key: feature,
      enabled: locked.has(feature) || Boolean(values.features[feature]),
    })),
    ...(original?.features
      .filter((entry) => !known.has(entry.key))
      .map((entry) => ({ key: entry.key, enabled: locked.has(entry.key) || entry.enabled })) ?? []),
  ]
  const reason = values.reason.trim()
  return {
    ...(mode === 'add' ? { code: values.code.trim() } : {}),
    nameEn: values.nameEn.trim(),
    nameAr: text(values.nameAr),
    descriptionEn: text(values.descriptionEn),
    descriptionAr: text(values.descriptionAr),
    active: values.active,
    publicVisible: values.publicVisible,
    recommended: values.recommended,
    sortOrder: Number(values.sortOrder.trim()),
    annualFreeMonths: Number(values.annualFreeMonths.trim()),
    trialDays: count(values.trialDays),
    trialDocuments: count(values.trialDocuments),
    monthlyPrice: amount(values.monthlyPrice) ?? '0.000',
    invoicesPerMonth: Number(values.invoicesPerMonth.trim()),
    peopleIncluded: Number(values.peopleIncluded.trim()),
    extraPersonPrice: amount(values.extraPersonPrice),
    branchesIncluded: count(values.branchesIncluded),
    extraBranchPrice: amount(values.extraBranchPrice),
    overagePricePerInvoice: amount(values.overagePricePerInvoice),
    apiAccess: values.apiAccess,
    prioritySupport: values.prioritySupport,
    features,
    ...(reason ? { reason } : {}),
  }
}

/** Adds a plan. `409` when the code is taken: a create never overwrites an existing plan. */
export function createPlan(request: PlanRequest): Promise<CatalogueAdminPlan> {
  return apiRequest<CatalogueAdminPlan>(PLANS_PATH, {
    method: 'POST',
    body: request,
    credentials: 'same-origin',
  })
}

/**
 * Changes a plan, on condition that it is still at `version`. Without the condition a second
 * operator's price change could be overwritten unseen, which is the silent repricing the
 * versions exist to stop; the backend answers `412`/`409` instead.
 */
export function updatePlan(
  code: string,
  version: number,
  request: PlanRequest,
): Promise<CatalogueAdminPlan> {
  return apiRequest<CatalogueAdminPlan>(planPath(code), {
    method: 'PUT',
    body: request,
    credentials: 'same-origin',
    headers: { 'If-Match': `"${version}"` },
  })
}

/** The backend's own order (`sort_order`, then code), so a saved plan lands where a reload puts it. */
export function sortCatalogue<P extends { code: string; sortOrder: number }>(
  plans: readonly P[],
): P[] {
  return [...plans].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  )
}

/**
 * The catalogue as read, with every plan saved since in place of (or beside) what the read
 * returned. A save answers with the stored plan, so re-reading the whole catalogue would only
 * repeat it. Recommending a plan un-recommends the others on the server (at most one, by a
 * unique index), so the merge does the same rather than show two.
 */
export function withSavedPlans(
  catalogue: readonly CatalogueAdminPlan[],
  saved: ReadonlyMap<string, CatalogueAdminPlan>,
  lastSaved: string | null = null,
): CatalogueAdminPlan[] {
  const merged = [...catalogue.filter((plan) => !saved.has(plan.code)), ...saved.values()]
  const recommended = lastSaved ? saved.get(lastSaved)?.recommended : false
  return sortCatalogue(
    recommended
      ? merged.map((plan) =>
          plan.code !== lastSaved && plan.recommended ? { ...plan, recommended: false } : plan,
        )
      : merged,
  )
}

/** A three-decimal amount with thousands separators, as the console prints money. */
export function formatAmount(value: string | null): string {
  const baisa = baisaOf(value)
  if (baisa === null) return value ?? ''
  const [whole, fraction] = formatBaisa(baisa).split('.')
  return `${Number(whole).toLocaleString('en-US')}.${fraction}`
}

const grouped = (value: number) => value.toLocaleString('en-US')

/**
 * What a plan includes, as the lines its card lists: derived only from the current version's
 * fields and their null meanings, never from a plan's name or code.
 */
export function planCardLines(plan: CatalogueAdminPlan): FormMessage[] {
  const terms = plan.currentVersion
  return [
    { key: 'plan.feature.invoices', values: { count: grouped(terms.invoicesPerMonth) } },
    terms.extraPersonPrice === null
      ? { key: 'plan.feature.people', values: { count: terms.peopleIncluded } }
      : {
          key: 'plan.feature.peopleThen',
          values: { count: terms.peopleIncluded, amount: formatAmount(terms.extraPersonPrice) },
        },
    terms.branchesIncluded === null
      ? { key: 'plan.feature.unlimitedBranches' }
      : { key: 'plan.feature.branches', values: { count: terms.branchesIncluded } },
    { key: terms.apiAccess ? 'plan.feature.api' : 'plan.feature.noApi' },
    ...(terms.prioritySupport ? [{ key: 'plan.feature.prioritySupport' }] : []),
    terms.overagePricePerInvoice === null
      ? { key: 'plan.feature.noOverage' }
      : {
          key: 'plan.feature.overage',
          values: { amount: formatAmount(terms.overagePricePerInvoice) },
        },
  ]
}

/** Request fields the backend's Bean Validation can name, mapped to the editor's fields. */
const SERVER_FIELDS: ReadonlyMap<string, PlanField> = new Map<string, PlanField>([
  ['code', 'code'],
  ['nameEn', 'nameEn'],
  ['nameAr', 'nameAr'],
  ['descriptionEn', 'descriptionEn'],
  ['descriptionAr', 'descriptionAr'],
  ['monthlyPrice', 'monthlyPrice'],
  ['invoicesPerMonth', 'invoicesPerMonth'],
  ['peopleIncluded', 'peopleIncluded'],
  ['branchesIncluded', 'branchesIncluded'],
  ['annualFreeMonths', 'annualFreeMonths'],
  ['trialDays', 'trialDays'],
  ['trialDocuments', 'trialDocuments'],
  ['sortOrder', 'sortOrder'],
  ['reason', 'reason'],
])

export type PlanSaveFailure = {
  fieldErrors: PlanFieldErrors
  formError: FormMessage | null
  /** Someone else saved the plan since it was read: the editor offers to reload. */
  conflict: boolean
}

/**
 * What a refused save means. A `400` either names fields (Bean Validation) or carries only an
 * English sentence (the domain's invariants), so named fields are marked and anything else is
 * one form message; the sentence itself is never shown.
 */
export function describePlanSaveFailure(error: unknown, mode: 'add' | 'edit'): PlanSaveFailure {
  const none = { fieldErrors: {}, conflict: false }
  if (error instanceof ApiError) {
    if (error.status === 403)
      return { ...none, formError: { key: 'console.access.missingPermission' } }
    if (mode === 'add' && error.status === 409) {
      return {
        ...none,
        fieldErrors: { code: 'console.plans.validation.codeTaken' },
        formError: null,
      }
    }
    if (mode === 'edit' && (error.status === 412 || error.status === 409)) {
      return { fieldErrors: {}, conflict: true, formError: { key: 'console.plans.conflict' } }
    }
    if (error.status === 400) {
      const fieldErrors: PlanFieldErrors = {}
      for (const { field } of error.fieldErrors) {
        const target = SERVER_FIELDS.get(field)
        if (target) fieldErrors[target] = 'console.plans.validation.server'
      }
      return {
        ...none,
        fieldErrors,
        formError: Object.keys(fieldErrors).length ? null : { key: 'identityErrors.validation' },
      }
    }
  }
  return { ...none, formError: commonFailureMessage(error) }
}
