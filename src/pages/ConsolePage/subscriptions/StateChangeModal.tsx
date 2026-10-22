import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../../components/ui'
import { subscriptionsStore, tenantIdentity } from '../../../lib/consoleSubscriptions'
import {
  ModalFooter,
  TextArea,
  focusFirstInvalidField,
  type ActionModalProps,
  type Errors,
} from './modalFields'

export type StateChangeMode = 'suspend' | 'resume'

const FORM_ID = 'state-change'

/**
 * Suspend or resume — one shape, since each is a reason and a state change. Suspending makes the
 * account read-only with the compliance record still open, and is drawn in red; resuming is not.
 * There is no cancel here: Fawtir cancels only for abuse or fraud, proposed by one operator and
 * confirmed by another, on the company's subscription card.
 */
export function StateChangeModal({
  mode,
  tenantId,
  onClose,
  onDone,
}: ActionModalProps & { mode: StateChangeMode }) {
  const { t } = useTranslation()
  const tenant = tenantIdentity(tenantId)
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
    } else {
      subscriptionsStore.resume(tenantId, trimmed)
      onDone(t('console.tenantDetail.done.resumed', { tenant: tenant.name }))
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
