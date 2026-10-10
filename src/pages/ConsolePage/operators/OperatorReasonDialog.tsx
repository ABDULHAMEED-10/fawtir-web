import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input, Modal } from '../../../components/ui'
import { OPERATOR_REASON_MAX } from '../../../lib/console/platformOperators'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import { focusFirstInvalid } from '../../../lib/forms'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { required } from '../../../lib/validation'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'

type OperatorReasonDialogProps<T> = {
  formId: string
  title: string
  /** What the change does, said before anything is sent. */
  body: string
  /** Fields drawn between the explanation and the reason, owned by the caller. */
  fields?: ReactNode
  /**
   * Checks the caller's fields when the form is sent: the name of the first invalid one, which
   * then takes focus ahead of the reason, or `undefined`.
   */
  validate?: () => string | undefined
  /**
   * Why the change cannot be made at all, as far as the screen can tell (the last tenant
   * administrator). Shown instead of the reason, with the confirmation disabled; the backend still
   * decides.
   */
  blockedNote?: string
  confirmLabel: string
  confirmingLabel: string
  /** Sends the change with the trimmed reason; called once per confirmation. */
  send: (reason: string) => Promise<T>
  describeFailure: (error: unknown) => FormMessage
  onDone: (answer: T) => void
  onClose: () => void
}

/**
 * A change to another operator's account that the backend records with a reason in the audit log
 * (reactivation, two-step reset, email change): what it does, any fields of its own, the reason,
 * and one request per confirmation.
 */
export function OperatorReasonDialog<T>({
  formId,
  title,
  body,
  fields,
  validate,
  blockedNote,
  confirmLabel,
  confirmingLabel,
  send,
  describeFailure,
  onDone,
  onClose,
}: OperatorReasonDialogProps<T>) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [reason, setReason] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [sending, setSending] = useState(false)
  // One confirmation, one request: a second one would at best be refused, at worst repeat the change.
  const inFlight = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current || blockedNote) return
    const invalidField = validate?.()
    const invalid = required(reason)
    setFieldError(invalid)
    setFormError(null)
    if (invalidField || invalid) {
      const order = invalidField ? [invalidField, 'reason'] : ['reason']
      focusFirstInvalid(event.currentTarget, order, { ...(invalidField ? { [invalidField]: true } : {}), reason: invalid })
      return
    }
    inFlight.current = true
    setSending(true)
    try {
      onDone(await send(reason.trim()))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      setFormError(describeFailure(error))
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!sending) onClose()
      }}
      title={title}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <ConsoleButton type="button" size="md" variant="secondary" disabled={sending} onClick={onClose}>
            {t('common.cancel')}
          </ConsoleButton>
          <ConsoleButton type="submit" form={formId} size="md" disabled={sending || Boolean(blockedNote)}>
            {sending ? confirmingLabel : confirmLabel}
          </ConsoleButton>
        </div>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <p className="text-sm font-medium leading-[1.6] text-text-tertiary">{body}</p>
        {fields}
        {blockedNote ? (
          <p className="text-sm font-semibold leading-[1.6] text-pending-700">{blockedNote}</p>
        ) : (
          <Input
            bordered
            name="reason"
            label={t('console.operators.reason.label')}
            requiredMark
            autoComplete="off"
            maxLength={OPERATOR_REASON_MAX}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              setFieldError(undefined)
              setFormError(null)
            }}
            hint={t('console.operators.reason.hint', { max: OPERATOR_REASON_MAX })}
            error={fieldError ? t(fieldError) : undefined}
          />
        )}
        {formError ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(formError.key, formError.values)}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
