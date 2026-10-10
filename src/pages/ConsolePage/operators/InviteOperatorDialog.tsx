import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input, Modal } from '../../../components/ui'
import { describeInviteFailure, inviteOperator, type Invitation } from '../../../lib/console/operatorInvitations'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import { email as validateEmail } from '../../../lib/validation'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'

const FORM_ID = 'invite-operator'

/**
 * Invites one person to the platform team by email.
 *
 * Nothing else is asked for, deliberately: the invitee chooses their own username and password
 * from the emailed link, and joins with no platform role — authority is given afterwards on the
 * Roles dialog, the one path the backend lets platform roles travel (P2, P7).
 */
export function InviteOperatorDialog({
  onClose,
  onInvited,
}: {
  onClose: () => void
  onInvited: (invitation: Invitation) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [address, setAddress] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [sending, setSending] = useState(false)
  // One click, one invitation: a second request would be refused as a duplicate at best.
  const inFlight = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    const invalid = validateEmail(address)
    setFieldError(invalid)
    setFormError(null)
    if (invalid) return
    inFlight.current = true
    setSending(true)
    try {
      onInvited(await inviteOperator(address.trim()))
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      setFormError(describeInviteFailure(error))
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
      title={t('console.operators.invite.title')}
      subtitle={t('console.operators.invite.subtitle')}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <ConsoleButton type="button" size="md" variant="secondary" disabled={sending} onClick={onClose}>
            {t('common.cancel')}
          </ConsoleButton>
          <ConsoleButton type="submit" form={FORM_ID} size="md" disabled={sending}>
            {sending ? t('console.operators.invite.sending') : t('console.operators.invite.send')}
          </ConsoleButton>
        </div>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <Input
          bordered
          name="email"
          type="email"
          label={t('console.operators.invite.email')}
          requiredMark
          autoComplete="off"
          spellCheck={false}
          value={address}
          onChange={(event) => {
            setAddress(event.target.value)
            setFieldError(undefined)
            setFormError(null)
          }}
          error={fieldError ? t(fieldError) : undefined}
        />
        <p className="text-sm font-medium leading-[1.6] text-text-tertiary">{t('console.operators.invite.note')}</p>
        {formError ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(formError.key, formError.values)}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
