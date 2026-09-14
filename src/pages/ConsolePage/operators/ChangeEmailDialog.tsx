import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '../../../components/ui'
import {
  describeEmailChangeFailure,
  isSameEmail,
  requestOperatorEmailChange,
  type EmailChangeRequest,
} from '../../../lib/console/operatorEmailChange'
import { displayName, type PlatformUser } from '../../../lib/console/platformOperators'
import { email as validateEmail } from '../../../lib/validation'
import { OperatorReasonDialog } from './OperatorReasonDialog'

/**
 * Asks for an operator's sign-in email to move to a new address. Nothing moves when this is sent:
 * the new address gets a confirmation code, which the operator enters signed in to their own
 * account, and the current address is told. The dialog says so before anything is sent.
 */
export function ChangeEmailDialog({
  user,
  self,
  onClose,
  onRequested,
}: {
  user: PlatformUser
  /** The signed-in operator is changing their own address. */
  self: boolean
  onClose: () => void
  onRequested: (answer: EmailChangeRequest) => void
}) {
  const { t } = useTranslation()
  const [newEmail, setNewEmail] = useState('')
  const [newEmailError, setNewEmailError] = useState<string | undefined>()
  const name = displayName(user)

  return (
    <OperatorReasonDialog
      formId="change-operator-email"
      title={t('console.operators.emailChange.title', { name })}
      body={t(self ? 'console.operators.emailChange.bodySelf' : 'console.operators.emailChange.body', { name })}
      fields={
        <>
          <Input
            bordered
            readOnly
            readOnlyAppearance
            name="currentEmail"
            label={t('console.operators.emailChange.current')}
            value={user.email}
          />
          <Input
            bordered
            name="newEmail"
            type="email"
            label={t('console.operators.emailChange.new')}
            requiredMark
            autoComplete="off"
            spellCheck={false}
            value={newEmail}
            onChange={(event) => {
              setNewEmail(event.target.value)
              setNewEmailError(undefined)
            }}
            error={newEmailError ? t(newEmailError) : undefined}
          />
        </>
      }
      validate={() => {
        const invalid =
          validateEmail(newEmail) ?? (isSameEmail(newEmail, user.email) ? 'console.operators.emailChange.error.same' : undefined)
        setNewEmailError(invalid)
        return invalid ? 'newEmail' : undefined
      }}
      confirmLabel={t('console.operators.emailChange.confirm')}
      confirmingLabel={t('console.operators.emailChange.confirming')}
      send={(reason) => requestOperatorEmailChange(user, newEmail.trim(), reason)}
      describeFailure={describeEmailChangeFailure}
      onDone={onRequested}
      onClose={onClose}
    />
  )
}
