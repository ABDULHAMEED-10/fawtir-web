import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import { sortPlans, type SubscriptionPlan } from '../subscriptionPlans'

/**
 * The platform plan catalogue (`PlatformPlanCatalogueController`, SRS FR-603/604). Both endpoints
 * are `@RequiresPermission("platform.tenants.manage")`; the console checks it only to decide what
 * to offer.
 */
export const PLAN_CATALOGUE_PERMISSION = 'platform.tenants.manage'
export const PLANS_PATH = '/v1/platform/plans'

/**
 * `PlanUpsertRequest`. `PUT /platform/plans/{code}` REPLACES the plan: every optional field sent
 * as `null` (or left out) is stored as `null`, and each of those nulls means something — unlimited
 * branches, a hard people ceiling, no overage. So a save always sends the whole plan, never a patch.
 */
export type PlanUpsertRequest = {
  name: string
  monthlyPrice: number
  invoicesPerMonth: number
  peopleIncluded: number
  extraPersonPrice: number | null
  branchesIncluded: number | null
  apiAccess: boolean
  prioritySupport: boolean
  overagePricePerInvoice: number | null
  sortOrder: number
  active: boolean
}

/** The editor's fields as typed: numbers stay strings until they are validated. */
export type PlanFormValues = {
  code: string
  name: string
  monthlyPrice: string
  invoicesPerMonth: string
  peopleIncluded: string
  extraPersonPrice: string
  branchesIncluded: string
  overagePricePerInvoice: string
  sortOrder: string
  apiAccess: boolean
  prioritySupport: boolean
  active: boolean
}

export type PlanField = keyof PlanFormValues
export type PlanFieldErrors = Partial<Record<PlanField, string>>

export const PLAN_FIELD_ORDER: readonly PlanField[] = [
  'code',
  'name',
  'monthlyPrice',
  'invoicesPerMonth',
  'peopleIncluded',
  'extraPersonPrice',
  'branchesIncluded',
  'overagePricePerInvoice',
  'sortOrder',
]

export const EMPTY_PLAN_FORM: PlanFormValues = {
  code: '',
  name: '',
  monthlyPrice: '',
  invoicesPerMonth: '',
  peopleIncluded: '',
  extraPersonPrice: '',
  branchesIncluded: '',
  overagePricePerInvoice: '',
  sortOrder: '0',
  apiAccess: false,
  prioritySupport: false,
  active: true,
}

/** Three decimals as everywhere else, but no thousands separators: the input must re-parse. */
const decimal = (value: number | null) => (value === null ? '' : value.toFixed(3))

export function planFormFrom(plan: SubscriptionPlan): PlanFormValues {
  return {
    code: plan.code,
    name: plan.name,
    monthlyPrice: decimal(plan.monthlyPrice),
    invoicesPerMonth: String(plan.invoicesPerMonth),
    peopleIncluded: String(plan.peopleIncluded),
    extraPersonPrice: decimal(plan.extraPersonPrice),
    branchesIncluded: plan.branchesIncluded === null ? '' : String(plan.branchesIncluded),
    overagePricePerInvoice: decimal(plan.overagePricePerInvoice),
    sortOrder: String(plan.sortOrder),
    apiAccess: plan.apiAccess,
    prioritySupport: plan.prioritySupport,
    active: plan.active,
  }
}

// The backend's own bounds: `SubscriptionPlan`'s compact constructor, the DTO's @NotNull/@NotBlank,
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

function whole(value: string, { required, min }: { required: boolean; min: number }): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return required ? 'validation.required' : undefined
  if (!WHOLE.test(trimmed)) return 'console.plans.validation.whole'
  const parsed = Number(trimmed)
  if (parsed < min) return min === 1 ? 'console.plans.validation.atLeastOne' : 'console.plans.validation.whole'
  return parsed > INT_MAX || parsed < INT_MIN ? 'console.plans.validation.whole' : undefined
}

/**
 * Mirrors the rules the backend enforces, so a save that must fail is caught before it is sent.
 *
 * @param takenCodes the catalogue's existing codes, checked only when adding: the upsert cannot
 *        tell "add" from "replace", so an existing code would silently overwrite that plan.
 */
export function validatePlanForm(
  values: PlanFormValues,
  mode: 'add' | 'edit',
  takenCodes: readonly string[],
): PlanFieldErrors {
  const code = values.code.trim()
  const name = values.name.trim()
  return {
    code:
      mode === 'edit'
        ? undefined
        : !code
          ? 'validation.required'
          : !PLAN_CODE.test(code)
            ? 'console.plans.validation.code'
            : takenCodes.includes(code)
              ? 'console.plans.validation.codeTaken'
              : undefined,
    name: !name ? 'validation.required' : name.length > 80 ? 'console.plans.validation.nameLength' : undefined,
    monthlyPrice: money(values.monthlyPrice, true),
    invoicesPerMonth: whole(values.invoicesPerMonth, { required: true, min: 1 }),
    peopleIncluded: whole(values.peopleIncluded, { required: true, min: 1 }),
    extraPersonPrice: money(values.extraPersonPrice, false),
    branchesIncluded: whole(values.branchesIncluded, { required: false, min: 1 }),
    overagePricePerInvoice: money(values.overagePricePerInvoice, false),
    sortOrder: whole(values.sortOrder, { required: true, min: INT_MIN }),
  }
}

const optionalNumber = (value: string) => (value.trim() ? Number(value.trim()) : null)

/** The whole plan, every field explicit — see {@link PlanUpsertRequest} for why nothing is omitted. */
export function toUpsertRequest(values: PlanFormValues): PlanUpsertRequest {
  return {
    name: values.name.trim(),
    monthlyPrice: Number(values.monthlyPrice.trim()),
    invoicesPerMonth: Number(values.invoicesPerMonth.trim()),
    peopleIncluded: Number(values.peopleIncluded.trim()),
    extraPersonPrice: optionalNumber(values.extraPersonPrice),
    branchesIncluded: optionalNumber(values.branchesIncluded),
    apiAccess: values.apiAccess,
    prioritySupport: values.prioritySupport,
    overagePricePerInvoice: optionalNumber(values.overagePricePerInvoice),
    sortOrder: Number(values.sortOrder.trim()),
    active: values.active,
  }
}

/** Adds or replaces the plan under `code`, and answers with the plan as stored. */
export function savePlan(code: string, request: PlanUpsertRequest): Promise<SubscriptionPlan> {
  return apiRequest<SubscriptionPlan>(`${PLANS_PATH}/${encodeURIComponent(code)}`, {
    method: 'PUT',
    body: request,
    credentials: 'same-origin',
  })
}

/**
 * The catalogue as read, with every plan saved since in place of (or beside) what the read
 * returned. A save answers with the stored plan, so re-reading the whole catalogue would only
 * repeat it; the order is the backend's own, so a plan lands where a reload would put it.
 */
export function withSavedPlans(
  catalogue: readonly SubscriptionPlan[],
  saved: ReadonlyMap<string, SubscriptionPlan>,
): SubscriptionPlan[] {
  return sortPlans([...catalogue.filter((plan) => !saved.has(plan.code)), ...saved.values()])
}

/** Request fields the backend's Bean Validation can name, mapped to the editor's fields. */
const SERVER_FIELDS: ReadonlyMap<string, PlanField> = new Map<string, PlanField>([
  ['name', 'name'],
  ['monthlyPrice', 'monthlyPrice'],
  ['invoicesPerMonth', 'invoicesPerMonth'],
  ['peopleIncluded', 'peopleIncluded'],
])

/**
 * What a refused save means. A `400` is either Bean Validation naming a field, or the plan's own
 * invariants (`SubscriptionPlan`), which carry only an English sentence — so the named fields are
 * marked and everything else is one form-level message; the sentence itself is never shown.
 */
export function describePlanSaveFailure(error: unknown): {
  fieldErrors: PlanFieldErrors
  formError: FormMessage | null
} {
  if (error instanceof ApiError) {
    if (error.status === 403) return { fieldErrors: {}, formError: { key: 'console.access.missingPermission' } }
    if (error.status === 400) {
      const fieldErrors: PlanFieldErrors = {}
      for (const { field } of error.fieldErrors) {
        const target = SERVER_FIELDS.get(field)
        if (target) fieldErrors[target] = 'console.plans.validation.server'
      }
      return {
        fieldErrors,
        formError: Object.keys(fieldErrors).length ? null : { key: 'identityErrors.validation' },
      }
    }
  }
  return { fieldErrors: {}, formError: commonFailureMessage(error) }
}
