import { useState, type FormEvent, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  createPlatformCompany,
  newPlatformCompanyKey,
  type PlatformCompanyRequestDto,
} from '../../api/platform/companies'
import { ApiError } from '../../api/errors'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import {
  Checkbox,
  DateField,
  Input,
  PhoneInput,
  Rial,
  Select,
  StepTracker,
  Switch,
  type TrackerStep,
} from '../../components/ui'
import {
  METHODS,
  MONTHS_OF,
  TENANT_IDENTITIES,
  periodAmount,
  planLabelKey,
  withVat,
  type PaymentMethod,
  type SubscriptionPlanId,
  type Term,
} from '../../lib/consoleSubscriptions'
import { PLATFORM_SETTINGS } from '../../lib/platformSettings'
import { omr } from '../../lib/superAdmin'
import {
  Field,
  SummaryLine,
  TODAY_KEY,
  TextArea,
  addMonths,
  dateOf,
  dayLabel,
  focusFirstInvalidField,
  parseAmount,
  usePlanOptions,
  useTermOptions,
  type Errors,
} from './subscriptions/modalFields'

const STEPS = ['company', 'owner', 'plan', 'review'] as const
type Step = (typeof STEPS)[number]

const FORM_ID = 'onboard-business'

const BUSINESS_TYPES = [
  'foodBeverage',
  'automotive',
  'retail',
  'beautyWellness',
  'healthcare',
  'hospitality',
  'education',
  'professional',
] as const

/** Every town a known tenant sits in, once each — the picker's list. */
const TOWNS = [...new Set(Object.values(TENANT_IDENTITIES).map((tenant) => tenant.town))].sort(
  (a, b) => a.localeCompare(b),
)

type Draft = {
  tenantCode: string
  country: string
  registeredAddress: string
  legalName: string
  tradingName: string
  cr: string
  vat: string
  town: string
  businessType: string
  ownerName: string
  ownerPhone: string
  ownerEmail: string
  plan: SubscriptionPlanId
  term: Term
  method: PaymentMethod
  paidNow: boolean
  amount: string
  receivedOn: string
  reference: string
  note: string
  activate: boolean
}

type FieldName =
  | 'tenantCode'
  | 'country'
  | 'registeredAddress'
  | 'legalName'
  | 'tradingName'
  | 'cr'
  | 'vat'
  | 'town'
  | 'businessType'
  | 'ownerName'
  | 'ownerPhone'
  | 'ownerEmail'
  | 'plan'
  | 'term'
  | 'method'
  | 'amount'
  | 'receivedOn'
  | 'reference'

const ORDER: Record<Exclude<Step, 'review'>, FieldName[]> = {
  company: [
    'legalName',
    'tradingName',
    'tenantCode',
    'cr',
    'vat',
    'country',
    'registeredAddress',
    'town',
    'businessType',
  ],
  owner: ['ownerName', 'ownerPhone', 'ownerEmail'],
  plan: ['plan', 'term', 'method', 'amount', 'receivedOn', 'reference'],
}

const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50'
const SECONDARY_BUTTON =
  'inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-50'
const TEXT_BUTTON =
  'inline-flex h-[46px] items-center text-sm font-semibold text-text-tertiary transition-colors hover:text-text-secondary'

const enabledMethods = METHODS.filter((method) => PLATFORM_SETTINGS.payments.methods[method])

/** What the first period bills, VAT included — the amount the payment field starts with. */
const firstInvoiceTotal = (plan: SubscriptionPlanId, term: Term) =>
  withVat(periodAmount(plan, term))

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ------------------------------------------------------------- validation */

function validate(step: Exclude<Step, 'review'>, draft: Draft, t: TFunction): Errors<FieldName> {
  const errors: Errors<FieldName> = {}
  const required = t('validation.required')
  if (step === 'company') {
    if (!draft.legalName.trim()) errors.legalName = required
    const code = draft.tenantCode.trim().toUpperCase()
    if (!code) errors.tenantCode = required
    // The server's own pattern, checked here so the operator is told on the field rather than
    // by a 400 after the review step.
    else if (!/^[A-Z][A-Z0-9_-]{0,49}$/.test(code)) errors.tenantCode = t('validation.tenantCode')
    const country = draft.country.trim().toUpperCase()
    if (!country) errors.country = required
    else if (!/^[A-Z]{2}$/.test(country)) errors.country = t('validation.country')
    if (!draft.registeredAddress.trim()) errors.registeredAddress = required
    else if (draft.registeredAddress.trim().length > 500)
      errors.registeredAddress = t('validation.tooLong')
    if (!draft.tradingName.trim()) errors.tradingName = required
    const cr = draft.cr.replace(/\s/g, '')
    if (!cr) errors.cr = required
    else if (!/^\d{7}$/.test(cr)) errors.cr = t('validation.crNumber')
    const vat = draft.vat.replace(/\s/g, '').toUpperCase()
    if (!vat) errors.vat = required
    else if (!/^OM1[12]\d{8}$/.test(vat)) errors.vat = t('validation.vatin')
    if (!draft.town) errors.town = t('validation.selectOne')
    if (!draft.businessType) errors.businessType = t('validation.selectOne')
  }
  if (step === 'owner') {
    if (!draft.ownerName.trim()) errors.ownerName = required
    const digits = draft.ownerPhone.replace(/\D/g, '')
    if (!digits) errors.ownerPhone = required
    else if (digits.length !== 8) errors.ownerPhone = t('validation.phoneLength')
    else if (!/^[792]/.test(digits)) errors.ownerPhone = t('validation.phonePrefix')
    if (!draft.ownerEmail.trim()) errors.ownerEmail = required
    else if (!EMAIL.test(draft.ownerEmail.trim())) errors.ownerEmail = t('validation.email')
  }
  if (step === 'plan') {
    if (!draft.plan) errors.plan = required
    if (!draft.term) errors.term = required
    if (!draft.method) errors.method = required
    if (draft.paidNow) {
      const value = parseAmount(draft.amount)
      if (!draft.amount.trim()) errors.amount = required
      else if (!Number.isFinite(value) || value <= 0)
        errors.amount = t('console.subscriptionActions.error.amount')
      if (!dateOf(draft.receivedOn)) errors.receivedOn = required
      else if (draft.receivedOn > TODAY_KEY)
        errors.receivedOn = t('console.subscriptionActions.error.future')
      if (draft.method !== 'cash' && !draft.reference.trim()) errors.reference = required
    }
  }
  return errors
}

const hasErrors = (errors: Errors<FieldName>) => Object.values(errors).some(Boolean)

/**
 * What the operator is told when the create is refused.
 *
 * A 409 is the interesting one: it means this key already onboarded a different company, or
 * the code or tax number belongs to a business that exists. Either way a retry of the same
 * form cannot succeed, so the message says to change the details rather than to try again.
 */
function describeCreateFailure(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return t('console.onboard.error.conflict')
    if (error.status === 403) return t('console.onboard.error.forbidden')
    if (error.status === 400) return t('console.onboard.error.validation')
  }
  return t('console.onboard.error.unexpected')
}

/* -------------------------------------------------------------------- page */

/**
 * Operator-led onboarding (docs/erp-and-console-plan.md §9.3) for a business that never signed
 * up online: the company, who owns it, what they pay and whether the money is already in hand —
 * then the tenant is created in the subscriptions ledger, Awaiting payment or Active, and the
 * console lands on its page.
 */
export function ConsoleOnboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('company')
  const [draft, setDraft] = useState<Draft>({
    tenantCode: '',
    // The only field with a sensible default: every business onboarded at the desk is Omani,
    // and the operator can still change it.
    country: 'OM',
    registeredAddress: '',
    legalName: '',
    tradingName: '',
    cr: '',
    vat: '',
    town: '',
    businessType: '',
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
    plan: 'business',
    term: 'monthly',
    method: enabledMethods[0] ?? 'cash',
    paidNow: false,
    amount: firstInvoiceTotal('business', 'monthly').toFixed(3),
    receivedOn: TODAY_KEY,
    reference: '',
    note: '',
    activate: true,
  })
  const [errors, setErrors] = useState<Errors<FieldName>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitFailure, setSubmitFailure] = useState<string | null>(null)
  // Minted once for the life of this form, never per click. A second submit carries the key
  // the first one did, so the backend answers with the company it already created rather than
  // creating a second one.
  const [idempotencyKey] = useState(newPlatformCompanyKey)

  const stepIndex = STEPS.indexOf(step)
  const patch = (change: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...change }))
    const cleared = Object.keys(change) as FieldName[]
    setErrors((current) => {
      if (!cleared.some((field) => current[field])) return current
      const next = { ...current }
      cleared.forEach((field) => delete next[field])
      return next
    })
  }

  const goTo = (target: Step) => {
    setErrors({})
    setStep(target)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step === 'review') {
      create()
      return
    }
    const next = validate(step, draft, t)
    setErrors(next)
    if (hasErrors(next)) {
      focusFirstInvalidField(event.currentTarget, ORDER[step], next)
      return
    }
    goTo(STEPS[stepIndex + 1])
  }

  const create = async () => {
    // A resubmit while the first request is still in flight is the one case the key cannot
    // help with -- the server has not answered yet -- so it is refused here.
    if (submitting) return
    // Nothing reaches the ledger with a hole in it: a step edited after review is re-checked.
    for (const earlier of ['company', 'owner', 'plan'] as const) {
      const found = validate(earlier, draft, t)
      if (hasErrors(found)) {
        setStep(earlier)
        setErrors(found)
        return
      }
    }
    const request: PlatformCompanyRequestDto = {
      tenantCode: draft.tenantCode.trim().toUpperCase(),
      tenantName: draft.tradingName.trim(),
      legalName: draft.legalName.trim(),
      taxNumber: draft.vat.replace(/s/g, '').toUpperCase(),
      commercialRegistrationNumber: draft.cr.replace(/s/g, ''),
      country: draft.country.trim().toUpperCase(),
      registeredAddress: draft.registeredAddress.trim(),
      administratorEmail: draft.ownerEmail.trim(),
      timezone: 'Asia/Muscat',
    }
    setSubmitFailure(null)
    setSubmitting(true)
    try {
      const result = await createPlatformCompany(idempotencyKey, request)
      // The backend owns the identifier. Navigating by anything derived from the name or the
      // code would address a business the register does not know by that name.
      navigate(`/console/tenants/${result.tenantId}`, { state: { from: 'tenants' } })
    } catch (error) {
      setSubmitFailure(describeCreateFailure(error, t))
      setSubmitting(false)
    }
  }

  const trackerSteps: TrackerStep[] = STEPS.map((id, index) => ({
    labelKey: `console.onboard.steps.${id}`,
    state: index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'future',
  }))

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <ConsoleBreadcrumbs
          items={[
            { labelKey: 'console.nav.tenants', to: '/console/tenants' },
            { labelKey: 'console.onboard.title' },
          ]}
        />
        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('console.onboard.title')}
          </h1>
          <p className="mt-1.5 max-w-[720px] text-sm font-medium leading-[1.4] text-text-quaternary">
            {t('console.onboard.subtitle')}
          </p>
        </div>

        <section className="overflow-hidden rounded-md bg-surface-card">
          <div className="flex justify-center border-b border-border-subtle px-5 py-5 max-md:overflow-x-auto">
            <StepTracker steps={trackerSteps} size="md" />
          </div>

          <form id={FORM_ID} noValidate onSubmit={submit} className="p-5">
            {step === 'company' ? (
              <CompanyStep draft={draft} errors={errors} patch={patch} />
            ) : step === 'owner' ? (
              <OwnerStep draft={draft} errors={errors} patch={patch} />
            ) : step === 'plan' ? (
              <PlanStep draft={draft} errors={errors} patch={patch} />
            ) : (
              <ReviewStep draft={draft} onEdit={goTo} />
            )}
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
            <Link to="/console/tenants" className={TEXT_BUTTON}>
              {t('console.onboard.cancel')}
            </Link>
            {submitFailure ? (
              <p role="alert" className="text-sm font-medium leading-[1.4] text-error-600">
                {submitFailure}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2.5 max-md:w-full max-md:justify-end">
              <button
                type="button"
                onClick={() => goTo(STEPS[stepIndex - 1])}
                disabled={stepIndex === 0}
                className={SECONDARY_BUTTON}
              >
                {t('console.onboard.back')}
              </button>
              <button
                type="submit"
                form={FORM_ID}
                disabled={submitting}
                className={PRIMARY_BUTTON}
              >
                {step === 'review'
                  ? submitting
                    ? t('console.onboard.creating')
                    : t('console.onboard.create')
                  : t('console.onboard.continue')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </ConsoleShell>
  )
}

/* ------------------------------------------------------------------- steps */

type StepProps = {
  draft: Draft
  errors: Errors<FieldName>
  patch: (change: Partial<Draft>) => void
}

function StepHeading({ children, note }: { children: string; note?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{children}</h2>
      {note ? (
        <p className="mt-1 max-w-[680px] text-sm font-medium leading-[1.6] text-text-tertiary">
          {note}
        </p>
      ) : null}
    </div>
  )
}

function CompanyStep({ draft, errors, patch }: StepProps) {
  const { t } = useTranslation()
  const k = (name: string) => t(`console.onboard.company.${name}`)
  return (
    <div className="flex flex-col gap-5">
      <StepHeading note={k('note')}>{k('heading')}</StepHeading>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div data-field="legalName">
          <Input
            bordered
            name="legalName"
            label={k('legalName')}
            requiredMark
            autoComplete="organization"
            value={draft.legalName}
            onChange={(event) => patch({ legalName: event.target.value })}
            error={errors.legalName}
          />
        </div>
        <div data-field="tradingName">
          <Input
            bordered
            name="tradingName"
            label={k('tradingName')}
            requiredMark
            autoComplete="off"
            value={draft.tradingName}
            onChange={(event) => patch({ tradingName: event.target.value })}
            error={errors.tradingName}
          />
        </div>
        <div data-field="tenantCode">
          <Input
            bordered
            name="tenantCode"
            label={k('tenantCode')}
            requiredMark
            autoComplete="off"
            value={draft.tenantCode}
            onChange={(event) => patch({ tenantCode: event.target.value.toUpperCase() })}
            error={errors.tenantCode}
          />
        </div>
        <div data-field="country">
          <Input
            bordered
            name="country"
            label={k('country')}
            requiredMark
            autoComplete="country"
            maxLength={2}
            value={draft.country}
            onChange={(event) => patch({ country: event.target.value.toUpperCase() })}
            error={errors.country}
          />
        </div>
        <div data-field="registeredAddress" className="md:col-span-2">
          <Input
            bordered
            name="registeredAddress"
            label={k('registeredAddress')}
            requiredMark
            autoComplete="street-address"
            value={draft.registeredAddress}
            onChange={(event) => patch({ registeredAddress: event.target.value })}
            error={errors.registeredAddress}
          />
        </div>
        <div data-field="cr">
          <Input
            bordered
            name="cr"
            label={k('cr')}
            requiredMark
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            value={draft.cr}
            onChange={(event) => patch({ cr: event.target.value })}
            error={errors.cr}
            hint={k('crHint')}
          />
        </div>
        <div data-field="vat">
          <Input
            bordered
            name="vat"
            label={k('vat')}
            requiredMark
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            placeholder="OM1100000000"
            value={draft.vat}
            onChange={(event) => patch({ vat: event.target.value })}
            error={errors.vat}
            hint={k('vatHint')}
          />
        </div>
        <Field name="town" label={k('town')} required error={errors.town}>
          <Select
            value={draft.town}
            onChange={(value) => patch({ town: value })}
            placeholder={k('townPlaceholder')}
            options={TOWNS.map((town) => ({ value: town, label: town }))}
            ariaLabel={k('town')}
          />
        </Field>
        <Field name="businessType" label={k('businessType')} required error={errors.businessType}>
          <Select
            value={draft.businessType}
            onChange={(value) => patch({ businessType: value })}
            placeholder={k('businessTypePlaceholder')}
            options={BUSINESS_TYPES.map((id) => ({
              value: id,
              label: t(`businessType.options.${id}`),
            }))}
            ariaLabel={k('businessType')}
          />
        </Field>
      </div>
    </div>
  )
}

function OwnerStep({ draft, errors, patch }: StepProps) {
  const { t } = useTranslation()
  const k = (name: string) => t(`console.onboard.owner.${name}`)
  return (
    <div className="flex flex-col gap-5">
      <StepHeading note={k('note')}>{k('heading')}</StepHeading>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div data-field="ownerName" className="md:col-span-2">
          <Input
            bordered
            name="ownerName"
            label={k('name')}
            requiredMark
            autoComplete="name"
            value={draft.ownerName}
            onChange={(event) => patch({ ownerName: event.target.value })}
            error={errors.ownerName}
          />
        </div>
        <div data-field="ownerPhone">
          <PhoneInput
            name="ownerPhone"
            label={k('phone')}
            requiredMark
            autoComplete="tel-national"
            placeholder="9XXX XXXX"
            className="border border-border-default"
            value={draft.ownerPhone}
            onChange={(event) => patch({ ownerPhone: event.target.value })}
            error={errors.ownerPhone}
          />
        </div>
        <div data-field="ownerEmail">
          <Input
            bordered
            name="ownerEmail"
            type="email"
            label={k('email')}
            requiredMark
            autoComplete="email"
            dir="ltr"
            value={draft.ownerEmail}
            onChange={(event) => patch({ ownerEmail: event.target.value })}
            error={errors.ownerEmail}
          />
        </div>
      </div>
    </div>
  )
}

function PlanStep({ draft, errors, patch }: StepProps) {
  const { t, i18n } = useTranslation()
  const k = (name: string) => t(`console.onboard.plan.${name}`)
  const planOptions = usePlanOptions()
  const termOptions = useTermOptions()
  const methodOptions = enabledMethods.map((method) => ({
    value: method,
    label: t(`console.subscriptions.method.${method}`),
  }))
  const today = dateOf(TODAY_KEY)!
  const periodEnd = addMonths(today, MONTHS_OF[draft.term])
  const total = firstInvoiceTotal(draft.plan, draft.term)
  const enterprise = draft.plan === 'enterprise'

  // A plan or term change re-prices the payment; what the operator then types stays.
  const reprice = (plan: SubscriptionPlanId, term: Term) =>
    patch({ plan, term, amount: firstInvoiceTotal(plan, term).toFixed(3) })

  return (
    <div className="flex flex-col gap-5">
      <StepHeading note={k('note')}>{k('heading')}</StepHeading>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field name="plan" label={k('plan')} required error={errors.plan}>
          <Select
            value={draft.plan}
            onChange={(value) => reprice(value as SubscriptionPlanId, draft.term)}
            options={planOptions}
            ariaLabel={k('plan')}
          />
        </Field>
        <Field name="term" label={k('term')} required error={errors.term}>
          <Select
            value={draft.term}
            onChange={(value) => reprice(draft.plan, value as Term)}
            options={termOptions}
            ariaLabel={k('term')}
          />
        </Field>
        <Field name="method" label={k('method')} required error={errors.method}>
          <Select
            value={draft.method}
            onChange={(value) => patch({ method: value as PaymentMethod, reference: '' })}
            options={methodOptions}
            ariaLabel={k('method')}
          />
        </Field>
      </div>

      {enterprise ? (
        <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium leading-[1.5] text-text-tertiary">
          {k('enterpriseNote')}
        </p>
      ) : null}

      <div className="rounded-sm bg-surface-background px-4 py-1">
        <SummaryLine label={k('periodEnd')} value={dayLabel(periodEnd, i18n.language)} />
        <SummaryLine
          label={k('firstInvoice')}
          value={
            enterprise ? (
              '—'
            ) : (
              <span className="inline-flex items-baseline gap-1">
                <Rial />
                {omr(total)}
                <span className="text-xs font-medium text-text-quaternary">
                  {t('console.subscriptionActions.common.includingVat')}
                </span>
              </span>
            )
          }
        />
      </div>

      <div className="flex flex-col gap-4 rounded-sm border border-border-subtle p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">{k('paidNow')}</p>
            <p className="mt-1 max-w-[560px] text-xs font-medium leading-[1.5] text-text-tertiary">
              {k('paidNowHint')}
            </p>
          </div>
          <Switch
            checked={draft.paidNow}
            onChange={(checked) => patch({ paidNow: checked })}
            label={k('paidNow')}
          />
        </div>

        {draft.paidNow ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div data-field="amount">
                <Input
                  bordered
                  name="amount"
                  label={k('amount')}
                  requiredMark
                  inputMode="decimal"
                  autoComplete="off"
                  leadingIcon={<Rial className="text-text-secondary" />}
                  value={draft.amount}
                  onChange={(event) => patch({ amount: event.target.value })}
                  error={errors.amount}
                  hint={t('console.subscriptionActions.common.includingVat')}
                />
              </div>
              <Field name="receivedOn" label={k('receivedOn')} required error={errors.receivedOn}>
                <DateField
                  value={draft.receivedOn}
                  onChange={(value) => patch({ receivedOn: value })}
                  max={TODAY_KEY}
                  ariaLabel={k('receivedOn')}
                />
              </Field>
            </div>
            <div data-field="reference">
              <Input
                bordered
                name="reference"
                label={t(`console.subscriptionActions.recordPayment.reference.${draft.method}`)}
                requiredMark={draft.method !== 'cash'}
                autoComplete="off"
                spellCheck={false}
                value={draft.reference}
                onChange={(event) => patch({ reference: event.target.value })}
                error={errors.reference}
              />
            </div>
            <TextArea
              name="note"
              label={t('console.subscriptionActions.common.note')}
              placeholder={t('console.subscriptionActions.common.notePlaceholder')}
              value={draft.note}
              onChange={(event) => patch({ note: event.target.value })}
            />
            <div>
              <Checkbox
                label={k('activateNow')}
                checked={draft.activate}
                onChange={(event) => patch({ activate: event.target.checked })}
                className="!text-sm"
              />
              <p className="mt-1 ps-6 text-xs font-medium leading-[1.5] text-text-tertiary">
                {k('activateHint')}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function ReviewCard({
  title,
  onEdit,
  children,
}: {
  title: string
  onEdit: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col rounded-sm border border-border-subtle">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
        >
          {t('console.onboard.review.edit')}
        </button>
      </div>
      <div className="px-4 py-1">{children}</div>
    </section>
  )
}

function ReviewStep({ draft, onEdit }: { draft: Draft; onEdit: (step: Step) => void }) {
  const { t, i18n } = useTranslation()
  const k = (name: string) => t(`console.onboard.review.${name}`)
  const c = (name: string) => t(`console.onboard.company.${name}`)
  const o = (name: string) => t(`console.onboard.owner.${name}`)
  const p = (name: string) => t(`console.onboard.plan.${name}`)
  const day = (date: Date) => dayLabel(date, i18n.language)
  const today = dateOf(TODAY_KEY)!
  const periodEnd = addMonths(today, MONTHS_OF[draft.term])
  const total = firstInvoiceTotal(draft.plan, draft.term)
  const received = dateOf(draft.receivedOn)
  const digits = draft.ownerPhone.replace(/\D/g, '')
  const name = draft.tradingName.trim()

  const result =
    draft.paidNow && draft.activate
      ? t('console.onboard.review.resultActive', { name, date: day(periodEnd) })
      : draft.paidNow
        ? t('console.onboard.review.resultPaid', { name })
        : t('console.onboard.review.resultAwaiting', { name, amount: omr(total) })

  return (
    <div className="flex flex-col gap-5">
      <StepHeading note={k('note')}>{k('heading')}</StepHeading>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReviewCard title={k('company')} onEdit={() => onEdit('company')}>
          <SummaryLine label={c('legalName')} value={draft.legalName.trim()} />
          <SummaryLine label={c('tradingName')} value={name} />
          <SummaryLine label={c('cr')} value={<span dir="ltr">{draft.cr.trim()}</span>} />
          <SummaryLine
            label={c('vat')}
            value={<span dir="ltr">{draft.vat.replace(/\s/g, '').toUpperCase()}</span>}
          />
          <SummaryLine label={c('town')} value={draft.town} />
          <SummaryLine
            label={c('businessType')}
            value={draft.businessType ? t(`businessType.options.${draft.businessType}`) : '—'}
          />
        </ReviewCard>
        <ReviewCard title={k('owner')} onEdit={() => onEdit('owner')}>
          <SummaryLine label={o('name')} value={draft.ownerName.trim()} />
          <SummaryLine
            label={o('phone')}
            value={<span dir="ltr">{`+968 ${digits.slice(0, 4)} ${digits.slice(4)}`}</span>}
          />
          <SummaryLine
            label={o('email')}
            value={<span dir="ltr">{draft.ownerEmail.trim()}</span>}
          />
        </ReviewCard>
        <ReviewCard title={k('plan')} onEdit={() => onEdit('plan')}>
          <SummaryLine label={p('plan')} value={t(planLabelKey(draft.plan))} />
          <SummaryLine label={p('term')} value={t(`console.subscriptions.term.${draft.term}`)} />
          <SummaryLine
            label={p('method')}
            value={t(`console.subscriptions.method.${draft.method}`)}
          />
          <SummaryLine label={p('periodEnd')} value={day(periodEnd)} />
          <SummaryLine
            label={p('firstInvoice')}
            value={
              draft.plan === 'enterprise' ? (
                '—'
              ) : (
                <span className="inline-flex items-baseline gap-1">
                  <Rial />
                  {omr(total)}
                </span>
              )
            }
          />
          <SummaryLine
            label={p('paidNow')}
            value={
              draft.paidNow && received ? (
                <span className="inline-flex items-baseline gap-1">
                  <Rial />
                  {t('console.onboard.review.paidLine', {
                    amount: omr(parseAmount(draft.amount) || 0),
                    method: t(`console.subscriptions.methodShort.${draft.method}`),
                    date: day(received),
                  })}
                </span>
              ) : (
                <span className="text-text-quaternary">{k('notPaid')}</span>
              )
            }
          />
        </ReviewCard>
        <section className="flex flex-col gap-2 rounded-sm bg-primary-25 p-4">
          <h3 className="text-sm font-semibold text-primary-800">{k('result')}</h3>
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">{result}</p>
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('console.onboard.review.invitation', { email: draft.ownerEmail.trim() })}
          </p>
        </section>
      </div>
    </div>
  )
}
