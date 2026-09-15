import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Rial, Select, SelectionCard } from '../../../components/ui'
import {
  periodAmount,
  planLabelKey,
  subscriptionOf,
  subscriptionsStore,
  tenantIdentity,
  withVat,
  type SubscriptionPlanId,
  type Term,
} from '../../../lib/consoleSubscriptions'
import { omr } from '../../../lib/superAdmin'
import {
  Field,
  ModalFooter,
  SummaryLine,
  TextArea,
  dayLabel,
  focusFirstInvalidField,
  usePlanOptions,
  useTermOptions,
  type ActionModalProps,
  type Errors,
} from './modalFields'

const FORM_ID = 'change-plan'

type FieldName = 'plan' | 'term' | 'when' | 'reason'
const ORDER: FieldName[] = ['plan', 'term', 'when', 'reason']
type When = 'now' | 'periodEnd'

function NowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <path
        d="M13 3 5 13.5h6L10 21l9-11.5h-6L13 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 9.5h17M8 3v4M16 3v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Moves a tenant to another plan or term — now, with the difference billed pro rata for what is
 * left of the period, or at the period's end (the console's downgrade rule). Enterprise terms are
 * per tenant and live on their own panel; choosing Enterprise here only changes the label.
 */
export function ChangePlanModal({ tenantId, ledger, onClose, onDone }: ActionModalProps) {
  const { t, i18n } = useTranslation()
  const tenant = tenantIdentity(tenantId)
  const subscription = subscriptionOf(ledger, tenantId)
  const [plan, setPlan] = useState<SubscriptionPlanId>(subscription?.plan ?? 'business')
  const [term, setTerm] = useState<Term>(subscription?.term ?? 'monthly')
  const [when, setWhen] = useState<When>('now')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Errors<FieldName>>({})

  const clear = (field: FieldName) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const planOptions = usePlanOptions()
  const termOptions = useTermOptions()
  const periodEnd = subscription ? dayLabel(subscription.periodEnd, i18n.language) : ''
  const newPrice = withVat(periodAmount(plan, term, subscription?.enterprise))
  const unchanged = subscription?.plan === plan && subscription?.term === term

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<FieldName> = {}
    if (unchanged) next.plan = t('console.subscriptionActions.error.samePlan')
    if (!reason.trim()) next.reason = t('validation.required')
    setErrors(next)
    if (Object.values(next).some(Boolean) || !subscription) {
      focusFirstInvalidField(event.currentTarget, ORDER, next)
      return
    }
    subscriptionsStore.changePlan({ tenantId, plan, term, when, reason: reason.trim() })
    const values = {
      tenant: tenant.name,
      plan: t(planLabelKey(plan)),
      term: t(`console.subscriptions.term.${term}`).toLowerCase(),
      date: periodEnd,
    }
    onDone(
      when === 'now'
        ? t('console.tenantDetail.done.planChanged', values)
        : t('console.tenantDetail.done.planScheduled', values),
    )
  }

  return (
    <Modal
      open
      width={640}
      onClose={onClose}
      title={t('console.subscriptionActions.changePlan.title')}
      subtitle={
        subscription
          ? t('console.subscriptionActions.changePlan.subtitle', {
              tenant: tenant.name,
              plan: t(planLabelKey(subscription.plan)),
              term: t(`console.subscriptions.term.${subscription.term}`).toLowerCase(),
            })
          : undefined
      }
      footer={
        <ModalFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitLabel={t('console.subscriptionActions.changePlan.submit')}
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            name="plan"
            label={t('console.subscriptionActions.changePlan.newPlan')}
            required
            error={errors.plan}
          >
            <Select
              value={plan}
              onChange={(value) => {
                setPlan(value as SubscriptionPlanId)
                clear('plan')
              }}
              options={planOptions}
              ariaLabel={t('console.subscriptionActions.changePlan.newPlan')}
            />
          </Field>
          <Field
            name="term"
            label={t('console.subscriptionActions.common.term')}
            required
            error={errors.term}
          >
            <Select
              value={term}
              onChange={(value) => {
                setTerm(value as Term)
                clear('plan')
              }}
              options={termOptions}
              ariaLabel={t('console.subscriptionActions.common.term')}
            />
          </Field>
        </div>

        {plan === 'enterprise' ? (
          <p className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.5] text-pending-700">
            {t('console.subscriptionActions.changePlan.enterpriseNote')}
          </p>
        ) : (
          <div className="rounded-sm bg-surface-background px-4 py-1">
            <SummaryLine
              label={t('console.subscriptionActions.changePlan.newPrice')}
              value={
                <span className="inline-flex items-baseline gap-1">
                  <Rial />
                  {omr(newPrice)}
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('console.subscriptionActions.common.includingVat')}
                  </span>
                </span>
              }
            />
          </div>
        )}

        <Field name="when" label={t('console.subscriptionActions.changePlan.when')} required>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            <SelectionCard
              title={t('console.subscriptionActions.changePlan.now.title')}
              description={t('console.subscriptionActions.changePlan.now.description')}
              icon={<NowIcon />}
              selected={when === 'now'}
              onSelect={() => setWhen('now')}
            />
            <SelectionCard
              title={t('console.subscriptionActions.changePlan.periodEnd.title')}
              description={t('console.subscriptionActions.changePlan.periodEnd.description', {
                date: periodEnd,
              })}
              icon={<CalendarIcon />}
              selected={when === 'periodEnd'}
              onSelect={() => setWhen('periodEnd')}
            />
          </div>
        </Field>

        <TextArea
          name="reason"
          label={t('console.subscriptionActions.common.reason')}
          required
          placeholder={t('console.subscriptionActions.common.reasonPlaceholder')}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            clear('reason')
          }}
          error={errors.reason}
        />
      </form>
    </Modal>
  )
}
