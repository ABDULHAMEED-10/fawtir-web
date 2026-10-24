import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input, Modal, Rial, Switch } from '../../../components/ui'
import { focusFirstInvalid } from '../../../lib/forms'
import {
  PLAN_FIELD_ORDER,
  TRIAL_DAYS,
  changesTerms,
  createPlan,
  describePlanSaveFailure,
  emptyPlanForm,
  lockedFeatures,
  notEnforcedFeatures,
  planFormFrom,
  toPlanRequest,
  updatePlan,
  validatePlanForm,
  type CatalogueAdminPlan,
  type PlanField,
  type PlanFieldErrors,
  type PlanFormValues,
} from '../../../lib/console/planCatalogue'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { FEATURE_GROUPS } from '../../../lib/plans'
import { isClean } from '../../../lib/validation'
import { displayPlanName } from './planName'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'

type PlanEditorProps = {
  /** The plan being edited, or `null` to add one. */
  plan: CatalogueAdminPlan | null
  /** Shown without a way to save: the reader holds `platform.plans.read` only. */
  readOnly?: boolean
  /** Every code in the catalogue, so adding cannot take an existing plan's code. */
  takenCodes: readonly string[]
  onClose: () => void
  onSaved: (plan: CatalogueAdminPlan) => void
  /** Someone else saved this plan since it was read; the page reads the catalogue again. */
  onConflict: () => void
  /**
   * `page`: a full page inside Console › Settings, its sections as cards and Save in a bar at the
   * foot (owner, 24 Oct 2026: never a pop-up for a plan's prices and switches). `modal` keeps
   * the pop-up.
   */
  presentation?: 'modal' | 'page'
}

const FORM_ID = 'plan-editor'
/** A section of the full-page editor: a white card, as the tenant Settings screens draw them. */
const PAGE_CARD = 'rounded-sm bg-surface-card p-5'

type SwitchField =
  'publicVisible' | 'recommended' | 'active' | 'apiAccess' | 'prioritySupport' | 'trial'
type TextField = Exclude<PlanField, SwitchField>

const DECIMAL_FIELDS: ReadonlySet<TextField> = new Set([
  'monthlyPrice',
  'extraPersonPrice',
  'extraBranchPrice',
  'overagePricePerInvoice',
  'erpAddonMonthlyPrice',
])
const FREE_TEXT_FIELDS: ReadonlySet<TextField> = new Set([
  'nameEn',
  'nameAr',
  'descriptionEn',
  'descriptionAr',
  'reason',
])

/**
 * Adds, edits or (read-only) shows one catalogue plan.
 *
 * The code is fixed once a plan exists: it is the identity every subscription references. A
 * change to a price or limit publishes a new version (contract §11) that only new subscribers
 * get, so it needs a reason; names, visibility, trial and features change in place. Every save
 * of an existing plan carries the `version` it was read at, and a refusal for a newer one is
 * offered as a reload rather than retried over the other operator's change.
 */
export function PlanEditor({
  plan,
  readOnly = false,
  takenCodes,
  onClose,
  onSaved,
  onConflict,
  presentation = 'modal',
}: PlanEditorProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const mode = plan ? 'edit' : 'add'
  const [values, setValues] = useState<PlanFormValues>(() =>
    plan ? planFormFrom(plan) : emptyPlanForm(),
  )
  const [errors, setErrors] = useState<PlanFieldErrors>({})
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  // A double click, or Enter pressed twice, must not become two writes to a price.
  const inFlight = useRef(false)
  const locked = lockedFeatures(plan)
  const notEnforced = notEnforcedFeatures(plan)
  const frozen = readOnly || saving
  const publishes = mode === 'add' || (plan !== null && changesTerms(plan, values))

  const set = <F extends PlanField>(field: F, value: PlanFormValues[F]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
    setFormError(null)
  }

  const setFeature = (feature: string, on: boolean) => {
    setValues((current) => ({ ...current, features: { ...current.features, [feature]: on } }))
    setFormError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (readOnly || inFlight.current) return
    const form = event.currentTarget
    const next = validatePlanForm(values, mode, takenCodes, plan)
    setErrors(next)
    setFormError(null)
    if (!isClean(next)) {
      focusFirstInvalid(form, PLAN_FIELD_ORDER, next)
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      const request = toPlanRequest(values, mode, plan)
      onSaved(plan ? await updatePlan(plan.code, plan.version, request) : await createPlan(request))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      const failure = describePlanSaveFailure(error, mode)
      setErrors(failure.fieldErrors)
      setFormError(failure.formError)
      setConflict(failure.conflict)
      focusFirstInvalid(form, PLAN_FIELD_ORDER, failure.fieldErrors)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const field = (
    name: TextField,
    label: string,
    extra: { required?: boolean; hint?: string; fixed?: boolean; dir?: 'ltr' | 'rtl' } = {},
  ) => {
    const fixed = extra.fixed || readOnly
    return (
      <Input
        bordered
        name={name}
        label={label}
        requiredMark={extra.required && !readOnly}
        hint={extra.hint}
        readOnly={fixed}
        // Read-only reads grey, like the console's other fixed values, not the brand tint.
        className={
          fixed
            ? '!border-border-subtle !bg-surface-background [&_input]:!text-text-tertiary'
            : undefined
        }
        dir={name === 'code' ? 'ltr' : extra.dir}
        leadingIcon={
          DECIMAL_FIELDS.has(name) ? <Rial className="text-text-secondary" /> : undefined
        }
        inputMode={
          name === 'code' || FREE_TEXT_FIELDS.has(name)
            ? undefined
            : DECIMAL_FIELDS.has(name)
              ? 'decimal'
              : 'numeric'
        }
        autoComplete="off"
        spellCheck={FREE_TEXT_FIELDS.has(name) ? undefined : false}
        value={values[name]}
        onChange={(event) => set(name, event.target.value)}
        error={errors[name] ? t(errors[name]) : undefined}
      />
    )
  }

  const toggle = (name: SwitchField, label: string) => (
    <div
      key={name}
      className="flex items-center justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0"
    >
      <span className="text-sm font-medium text-text-tertiary">{label}</span>
      <Switch
        checked={values[name]}
        onChange={(checked) => set(name, checked)}
        label={label}
        disabled={frozen}
      />
    </div>
  )

  const sectionTitle = (text: string) => (
    <p className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">{text}</p>
  )

  const name = plan ? displayPlanName(plan, i18n.language) : ''
  const title = !plan
    ? t('console.plans.addTitle')
    : readOnly
      ? t('console.plans.viewPlan', { name })
      : t('console.plans.editPlan', { name })

  const subtitle = readOnly
    ? t('console.plans.readOnlyNote')
    : plan
      ? t('console.plans.editNote')
      : t('console.plans.addNote')

  const actions = (
    <div className="flex flex-wrap justify-end gap-2.5">
      <ConsoleButton
        type="button"
        size="md"
        variant="secondary"
        disabled={saving}
        onClick={onClose}
      >
        {readOnly ? t('common.close') : t('common.cancel')}
      </ConsoleButton>
      {readOnly ? null : (
        <ConsoleButton type="submit" form={FORM_ID} size="md" disabled={saving || conflict}>
          {saving ? t('console.plans.saving') : t('console.plans.save')}
        </ConsoleButton>
      )}
    </div>
  )

  const page = presentation === 'page'
  const form = (
        <form
          id={FORM_ID}
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex flex-col gap-5"
        >
          <div className={['grid grid-cols-1 gap-4 md:grid-cols-2', page ? PAGE_CARD : ''].join(' ')}>
            {field('code', t('console.plans.field.code'), {
              required: mode === 'add',
              hint: mode === 'add' ? t('console.plans.field.codeHint') : undefined,
              fixed: mode === 'edit',
            })}
            {field('sortOrder', t('console.plans.field.sortOrder'), {
              required: true,
              hint: t('console.plans.field.sortOrderHint'),
            })}
            {field('nameEn', t('console.plans.field.nameEn'), { required: true, dir: 'ltr' })}
            {field('nameAr', t('console.plans.field.nameAr'), {
              dir: 'rtl',
              hint: t('console.plans.field.nameArHint'),
            })}
            {field('descriptionEn', t('console.plans.field.descriptionEn'), { dir: 'ltr' })}
            {field('descriptionAr', t('console.plans.field.descriptionAr'), { dir: 'rtl' })}
          </div>

          <div className={['flex flex-col gap-3', page ? PAGE_CARD : ''].join(' ')}>
            {sectionTitle(t('console.plans.section.terms'))}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {field('monthlyPrice', t('console.plans.field.monthlyPrice'), { required: true })}
              {field('annualFreeMonths', t('console.plans.field.annualFreeMonths'), {
                required: true,
                hint: t('console.plans.field.annualFreeMonthsHint'),
              })}
              {field('invoicesPerMonth', t('console.plans.field.invoicesPerMonth'), {
                required: true,
              })}
              {field('overagePricePerInvoice', t('console.plans.field.overagePrice'), {
                hint: t('console.plans.field.overageHint'),
              })}
              {field('peopleIncluded', t('console.plans.field.peopleIncluded'), { required: true })}
              {field('extraPersonPrice', t('console.plans.field.extraPersonPrice'), {
                hint: t('console.plans.field.extraPersonHint'),
              })}
              {field('branchesIncluded', t('console.plans.field.branchesIncluded'), {
                hint: t('console.plans.field.branchesHint'),
              })}
              {field('extraBranchPrice', t('console.plans.field.extraBranchPrice'), {
                hint: t('console.plans.field.extraBranchHint'),
              })}
              {/* ER-1, PL-3: the ERP and API add-on as a paid extra; needs ERP field mapping on. */}
              {field('erpAddonMonthlyPrice', t('console.plans.field.erpAddonPrice'), {
                hint: t('console.plans.field.erpAddonHint'),
              })}
            </div>
            <div className="flex flex-col">
              {toggle('apiAccess', t('console.plans.field.apiAccess'))}
              {toggle('prioritySupport', t('console.plans.field.prioritySupport'))}
            </div>
          </div>

          <div className={['flex flex-col gap-3', page ? PAGE_CARD : ''].join(' ')}>
            {sectionTitle(t('console.plans.section.offer'))}
            {/* TR-1: the trial is always 14 days, so the plan only switches it on or off. */}
            <div className="flex flex-col">
              {toggle('trial', t('console.plans.field.trial', { days: TRIAL_DAYS }))}
              <p className="pb-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                {t('console.plans.field.trialHint', { days: TRIAL_DAYS })}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {field('trialDocuments', t('console.plans.field.trialDocuments'), {
                hint: t('console.plans.field.trialDocumentsSwitchHint'),
              })}
            </div>
            <div className="flex flex-col">
              {toggle('active', t('console.plans.field.active'))}
              {toggle('publicVisible', t('console.plans.field.publicVisible'))}
              {toggle('recommended', t('console.plans.field.recommended'))}
            </div>
          </div>

          <div className={['flex flex-col gap-3', page ? PAGE_CARD : ''].join(' ')}>
            {sectionTitle(t('console.plans.section.features'))}
            {FEATURE_GROUPS.map((group) => (
              <div key={group.id} className="flex flex-col">
                <p className="pb-1 text-sm font-semibold text-text-secondary">
                  {t(`plan.featureGroup.${group.id}`)}
                </p>
                {group.features.map((feature) => {
                  const compliance = locked.has(feature)
                  // PL-8: a switch the server does not act on yet is locked at its stored value.
                  const unenforced = notEnforced.has(feature)
                  const label = t(`plan.featureName.${feature}`)
                  return (
                    <div
                      key={feature}
                      className="flex items-center justify-between gap-4 border-b border-border-subtle py-2 last:border-b-0"
                    >
                      <span className="text-sm font-medium text-text-tertiary">
                        {label}
                        {compliance ? (
                          <span className="ms-2 text-xs text-text-quaternary">
                            {t('console.plans.alwaysOn')}
                          </span>
                        ) : unenforced ? (
                          <span className="ms-2 text-xs text-text-quaternary">
                            {t('console.plans.notEnforced')}
                          </span>
                        ) : null}
                      </span>
                      <Switch
                        size="sm"
                        // Compliance is never gated (contract §3): shown on and locked, and sent on.
                        checked={compliance || Boolean(values.features[feature])}
                        onChange={(on) => setFeature(feature, on)}
                        label={label}
                        disabled={frozen || compliance || unenforced}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {!readOnly && publishes ? (
            <div className={['flex flex-col gap-2', page ? PAGE_CARD : ''].join(' ')}>
              {field('reason', t('console.plans.field.reason'), {
                required: true,
                hint:
                  mode === 'add'
                    ? t('console.plans.field.reasonHintAdd')
                    : t('console.plans.field.reasonHint'),
              })}
            </div>
          ) : null}

          {formError ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-sm font-medium text-danger-700">
                {t(formError.key, formError.values)}
              </p>
              {conflict ? (
                <ConsoleButton type="button" size="md" variant="secondary" onClick={onConflict}>
                  {t('console.plans.reload')}
                </ConsoleButton>
              ) : null}
            </div>
          ) : null}
        </form>
  )

  if (page) {
    return (
      <section aria-labelledby="plan-editor-title" className="flex flex-col gap-5">
        <div className="max-w-[720px]">
          <h2
            id="plan-editor-title"
            className="text-2xl font-medium leading-[1.2] text-text-primary"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{subtitle}</p>
        </div>
        {form}
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border-subtle bg-surface-background/95 px-4 py-3 backdrop-blur lg:mx-0 lg:rounded-sm lg:border lg:bg-surface-card lg:px-5">
          {actions}
        </div>
      </section>
    )
  }

  return (
    <Modal
      open
      width={760}
      onClose={() => {
        if (!saving) onClose()
      }}
      title={title}
      subtitle={subtitle}
      footer={actions}
    >
      {form}
    </Modal>
  )
}
