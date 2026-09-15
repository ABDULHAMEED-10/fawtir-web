import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../../components/ui'
import {
  subscriptionOf,
  subscriptionsStore,
  tenantIdentity,
} from '../../../lib/consoleSubscriptions'
import {
  ModalFooter,
  TextArea,
  dayLabel,
  focusFirstInvalidField,
  type ActionModalProps,
  type Errors,
} from './modalFields'

export type StateChangeMode = 'suspend' | 'resume' | 'cancel'

const FORM_ID = 'state-change'

/**
 * Suspend, resume or cancel — one shape, since each is a reason and a state change. Suspending
 * makes the account read-only with the compliance record still open; cancelling lets paid features
 * run to the period's end first. Both are drawn in red; resuming is not.
 */
export function StateChangeModal({
  mode,
  tenantId,
  ledger,
  onClose,
  onDone,
}: ActionModalProps & { mode: StateChangeMode }) {
  const { t, i18n } = useTranslation()
  const tenant = tenantIdentity(tenantId)
  const subscription = subscriptionOf(ledger, tenantId)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Errors<'reason'>>({})

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<'reason'> = {}
    if (!reason.trim()) next.reason = t('validation.required')
    setErrors(next)
    if (next.reason) {
      focusFirstInvalidField(event.currentTarget, ['reason'], next)
      return
    }
    const trimmed = reason.trim()
    if (mode === 'suspend') {
      subscriptionsStore.suspend(tenantId, trimmed)
      onDone(t('console.tenantDetail.done.suspended', { tenant: tenant.name }))
    } else if (mode === 'resume') {
      subscriptionsStore.resume(tenantId, trimmed)
      onDone(t('console.tenantDetail.done.resumed', { tenant: tenant.name }))
    } else {
      subscriptionsStore.cancel(tenantId, trimmed)
      onDone(
        t('console.tenantDetail.done.cancelled', {
          tenant: tenant.name,
          date: subscription ? dayLabel(subscription.periodEnd, i18n.language) : '',
        }),
      )
    }
  }

  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t(`console.subscriptionActions.${mode}.title`)}
      subtitle={tenant.name}
      footer={
        <ModalFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitLabel={t(`console.subscriptionActions.${mode}.submit`)}
          danger={mode !== 'resume'}
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <p
          className={[
            'rounded-sm px-4 py-3 text-sm font-medium leading-[1.6]',
            mode === 'resume'
              ? 'bg-surface-background text-text-tertiary'
              : 'bg-danger-100 text-danger-700',
          ].join(' ')}
        >
          {t(`console.subscriptionActions.${mode}.body`)}
        </p>
        <TextArea
          name="reason"
          label={t('console.subscriptionActions.common.reason')}
          required
          placeholder={t('console.subscriptionActions.common.reasonPlaceholder')}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setErrors({})
          }}
          error={errors.reason}
        />
      </form>
    </Modal>
  )
}
