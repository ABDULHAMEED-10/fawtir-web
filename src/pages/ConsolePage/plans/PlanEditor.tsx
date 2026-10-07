import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input, Modal, Rial, Switch } from '../../../components/ui'
import { focusFirstInvalid } from '../../../lib/forms'
import {
  EMPTY_PLAN_FORM,
  PLAN_FIELD_ORDER,
  describePlanSaveFailure,
  planFormFrom,
  savePlan,
  toUpsertRequest,
  validatePlanForm,
  type PlanField,
  type PlanFieldErrors,
  type PlanFormValues,
} from '../../../lib/console/planCatalogue'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import type { SubscriptionPlan } from '../../../lib/subscriptionPlans'
import { isClean } from '../../../lib/validation'
import { displayPlanName } from './planName'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'

type PlanEditorProps = {
  /** The plan being edited, or `null` to add one. */
  plan: SubscriptionPlan | null
  /** Every code in the catalogue, so adding cannot silently replace an existing plan. */
  takenCodes: readonly string[]
  onClose: () => void
  onSaved: (plan: SubscriptionPlan) => void
}

const FORM_ID = 'plan-editor'

type TextField = Exclude<PlanField, 'apiAccess' | 'prioritySupport' | 'active'>

/**
 * Adds or edits one catalogue plan.
 *
 * The code is fixed once a plan exists: it is the identity every subscription references, and
 * `PUT /platform/plans/{code}` with a different code would create a second plan, not rename this
 * one. Everything else is sent in full on every save — the endpoint replaces the plan, so a field
 * left out would not be kept, it would be reset (see `PlanUpsertRequest`).
 */
export function PlanEditor({ plan, takenCodes, onClose, onSaved }: PlanEditorProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const mode = plan ? 'edit' : 'add'
  const [values, setValues] = useState<PlanFormValues>(() => (plan ? planFormFrom(plan) : EMPTY_PLAN_FORM))
  const [errors, setErrors] = useState<PlanFieldErrors>({})
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [saving, setSaving] = useState(false)
  // A double click, or Enter pressed twice, must not become two writes to a price every
  // subscribed company pays.
  const inFlight = useRef(false)

  const set = <F extends PlanField>(field: F, value: PlanFormValues[F]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
    setFormError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    const form = event.currentTarget
    const next = validatePlanForm(values, mode, takenCodes)
    setErrors(next)
    setFormError(null)
    if (!isClean(next)) {
      focusFirstInvalid(form, PLAN_FIELD_ORDER, next)
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      onSaved(await savePlan(values.code.trim(), toUpsertRequest(values)))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      const failure = describePlanSaveFailure(error)
      setErrors(failure.fieldErrors)
      setFormError(failure.formError)
      focusFirstInvalid(form, PLAN_FIELD_ORDER, failure.fieldErrors)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const field = (
    name: TextField,
    label: string,
    extra: { required?: boolean; hint?: string; decimal?: boolean; readOnly?: boolean } = {},
  ) => (
    <Input
      bordered
      name={name}
      label={label}
      requiredMark={extra.required}
      hint={extra.hint}
      readOnly={extra.readOnly}
      // Read-only reads grey, like the console's other fixed values, not the brand tint.
      className={
        extra.readOnly
          ? '!border-border-subtle !bg-surface-background [&_input]:!text-text-tertiary'
          : undefined
      }
      dir={name === 'code' ? 'ltr' : undefined}
      leadingIcon={extra.decimal ? <Rial className="text-text-secondary" /> : undefined}
      inputMode={name === 'name' || name === 'code' ? undefined : extra.decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      spellCheck={false}
      value={values[name]}
      onChange={(event) => set(name, event.target.value)}
      error={errors[name] ? t(errors[name]) : undefined}
    />
  )

  return (
    <Modal
      open
      width={680}
      onClose={() => {
        if (!saving) onClose()
      }}
      title={plan ? t('console.plans.editPlan', { name: displayPlanName(plan, t, i18n.language) }) : t('console.plans.addTitle')}
      subtitle={plan ? t('console.plans.editNote') : t('console.plans.addNote')}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <ConsoleButton type="button" size="md" variant="secondary" disabled={saving} onClick={onClose}>
            {t('common.cancel')}
          </ConsoleButton>
          <ConsoleButton type="submit" form={FORM_ID} size="md" disabled={saving}>
            {saving ? t('console.plans.saving') : t('console.plans.save')}
          </ConsoleButton>
        </div>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {field('code', t('console.plans.field.code'), {
            required: mode === 'add',
            hint: mode === 'add' ? t('console.plans.field.codeHint') : undefined,
            readOnly: mode === 'edit',
          })}
          {field('name', t('console.plans.field.name'), { required: true })}
          {field('monthlyPrice', t('console.plans.field.monthlyPrice'), { required: true, decimal: true })}
          {field('invoicesPerMonth', t('console.plans.field.invoicesPerMonth'), { required: true })}
          {field('peopleIncluded', t('console.plans.field.peopleIncluded'), { required: true })}
          {field('extraPersonPrice', t('console.plans.field.extraPersonPrice'), {
            decimal: true,
            hint: t('console.plans.field.extraPersonHint'),
          })}
          {field('branchesIncluded', t('console.plans.field.branchesIncluded'), {
            hint: t('console.plans.field.branchesHint'),
          })}
          {field('overagePricePerInvoice', t('console.plans.field.overagePrice'), {
            decimal: true,
            hint: t('console.plans.field.overageHint'),
          })}
          {field('sortOrder', t('console.plans.field.sortOrder'), {
            required: true,
            hint: t('console.plans.field.sortOrderHint'),
          })}
        </div>

        <div className="flex flex-col">
          {(
            [
              ['apiAccess', t('console.plans.field.apiAccess')],
              ['prioritySupport', t('console.plans.field.prioritySupport')],
              ['active', t('console.plans.field.active')],
            ] as const
          ).map(([name, label]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0"
            >
              <span className="text-sm font-medium text-text-tertiary">{label}</span>
              <Switch checked={values[name]} onChange={(checked) => set(name, checked)} label={label} disabled={saving} />
            </div>
          ))}
        </div>

        {formError ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(formError.key, formError.values)}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
