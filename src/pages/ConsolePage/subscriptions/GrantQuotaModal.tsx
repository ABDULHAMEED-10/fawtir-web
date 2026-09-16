import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { DateField, Input, Modal } from '../../../components/ui'
import { subscriptionsStore, tenantIdentity } from '../../../lib/consoleSubscriptions'
import { count } from '../../../lib/superAdmin'
import {
  Field,
  ModalFooter,
  TODAY_KEY,
  TextArea,
  dateOf,
  dayLabel,
  focusFirstInvalidField,
  type ActionModalProps,
  type Errors,
} from './modalFields'

const FORM_ID = 'grant-quota'

type FieldName = 'documents' | 'expires' | 'reason'
const ORDER: FieldName[] = ['documents', 'expires', 'reason']

/** Extra documents on top of the plan's allowance until a date — the §4.3 operation, recorded. */
export function GrantQuotaModal({ tenantId, onClose, onDone }: ActionModalProps) {
  const { t, i18n } = useTranslation()
  const tenant = tenantIdentity(tenantId)
  const [documents, setDocuments] = useState('')
  const [expires, setExpires] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Errors<FieldName>>({})

  const clear = (field: FieldName) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<FieldName> = {}
    const amount = Number(documents.replace(/[,\s]/g, ''))
    if (!documents.trim()) next.documents = t('validation.required')
    else if (!Number.isInteger(amount) || amount <= 0)
      next.documents = t('console.subscriptionActions.error.documents')
    const date = dateOf(expires)
    if (!date) next.expires = t('validation.required')
    else if (expires <= TODAY_KEY) next.expires = t('console.subscriptionActions.error.past')
    if (!reason.trim()) next.reason = t('validation.required')
    setErrors(next)
    if (Object.values(next).some(Boolean) || !date) {
      focusFirstInvalidField(event.currentTarget, ORDER, next)
      return
    }
    subscriptionsStore.grantQuota(tenantId, amount, date, reason.trim())
    onDone(
      t('console.tenantDetail.done.quotaGranted', {
        tenant: tenant.name,
        documents: count(amount),
        date: dayLabel(date, i18n.language),
      }),
    )
  }

  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t('console.subscriptionActions.grantQuota.title')}
      subtitle={t('console.subscriptionActions.grantQuota.subtitle')}
      footer={
        <ModalFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitLabel={t('console.subscriptionActions.grantQuota.submit')}
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div data-field="documents">
            <Input
              bordered
              name="documents"
              label={t('console.subscriptionActions.grantQuota.documents')}
              requiredMark
              inputMode="numeric"
              autoComplete="off"
              value={documents}
              onChange={(event) => {
                setDocuments(event.target.value)
                clear('documents')
              }}
              error={errors.documents}
            />
          </div>
          <Field
            name="expires"
            label={t('console.subscriptionActions.grantQuota.expires')}
            required
            error={errors.expires}
          >
            <DateField
              value={expires}
              onChange={(value) => {
                setExpires(value)
                clear('expires')
              }}
              min={TODAY_KEY}
              ariaLabel={t('console.subscriptionActions.grantQuota.expires')}
            />
          </Field>
        </div>
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
