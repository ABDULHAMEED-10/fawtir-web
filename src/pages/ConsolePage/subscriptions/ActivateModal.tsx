import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { DateField, Modal, Rial, Select } from '../../../components/ui'
import {
  MONTHS_OF,
  periodAmount,
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
  QuickChips,
  SummaryLine,
  TODAY_KEY,
  TextArea,
  addMonths,
  dateOf,
  dayLabel,
  focusFirstInvalidField,
  usePlanOptions,
  useTermOptions,
  type ActionModalProps,
  type Errors,
} from './modalFields'

const FORM_ID = 'activate-subscription'

type FieldName = 'plan' | 'term' | 'start' | 'reason'
const ORDER: FieldName[] = ['plan', 'term', 'start', 'reason']

/**
 * Brings an account live with no payment behind it — a pilot, a plan that includes Fawtir, a trial
 * that needs a few more days. The reason is what the audit trail shows next to the operator's name,
 * so it is required; the amount the period would normally bill is shown so nobody activates a year
 * of Business Plus by accident.
 */
export function ActivateModal({ tenantId, ledger, onClose, onDone }: ActionModalProps) {
  const { t, i18n } = useTranslation()
  const tenant = tenantIdentity(tenantId)
  const subscription = subscriptionOf(ledger, tenantId)
  const [plan, setPlan] = useState<SubscriptionPlanId>(subscription?.plan ?? 'business')
  const [term, setTerm] = useState<Term>(subscription?.term ?? 'monthly')
  const [start, setStart] = useState(TODAY_KEY)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Errors<FieldName>>({})

  const clear = (field: FieldName) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const planOptions = usePlanOptions()
  const termOptions = useTermOptions()
  const startDate = dateOf(start)
  const periodEnd = startDate ? addMonths(startDate, MONTHS_OF[term]) : null
  const wouldBill = withVat(periodAmount(plan, term, subscription?.enterprise))

  const quick = (['pilot', 'planIncluded', 'trialExtension'] as const).map((id) => ({
    id,
    label: t(`console.subscriptionActions.activate.quick.${id}`),
  }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<FieldName> = {}
    if (!plan) next.plan = t('validation.required')
    if (!term) next.term = t('validation.required')
    if (!startDate) next.start = t('validation.required')
    if (!reason.trim()) next.reason = t('validation.required')
    setErrors(next)
    if (Object.values(next).some(Boolean) || !startDate || !periodEnd) {
      focusFirstInvalidField(event.currentTarget, ORDER, next)
      return
    }
    subscriptionsStore.activate({ tenantId, plan, term, start: startDate, reason: reason.trim() })
    onDone(
      t('console.tenantDetail.done.activated', {
        tenant: tenant.name,
        date: dayLabel(periodEnd, i18n.language),
      }),
    )
  }

  return (
    <Modal
      open
      width={640}
      onClose={onClose}
      title={t('console.subscriptionActions.activate.title')}
      subtitle={t('console.subscriptionActions.activate.subtitle')}
      footer={
        <ModalFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitLabel={t('console.subscriptionActions.activate.submit')}
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            name="plan"
            label={t('console.subscriptionActions.common.plan')}
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
              ariaLabel={t('console.subscriptionActions.common.plan')}
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
                clear('term')
              }}
              options={termOptions}
              ariaLabel={t('console.subscriptionActions.common.term')}
            />
          </Field>
          <Field
            name="start"
            label={t('console.subscriptionActions.activate.startDate')}
            required
            error={errors.start}
          >
            <DateField
              value={start}
              onChange={(value) => {
                setStart(value)
                clear('start')
              }}
              ariaLabel={t('console.subscriptionActions.activate.startDate')}
            />
          </Field>
        </div>

        <div className="rounded-sm bg-surface-background px-4 py-1">
          <SummaryLine
            label={t('console.subscriptionActions.activate.periodEnd')}
            value={periodEnd ? dayLabel(periodEnd, i18n.language) : '—'}
          />
          <SummaryLine
            label={t('console.subscriptionActions.activate.wouldBill')}
            value={
              <span className="inline-flex items-baseline gap-1">
                <Rial />
                {omr(wouldBill)}
                <span className="text-xs font-medium text-text-quaternary">
                  {t('console.subscriptionActions.common.includingVat')}
                </span>
              </span>
            }
          />
        </div>

        <div className="flex flex-col gap-2">
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
          <QuickChips
            options={quick}
            value={reason}
            onPick={(label) => {
              setReason(label)
              clear('reason')
            }}
          />
        </div>
      </form>
    </Modal>
  )
}
