import { useTranslation } from 'react-i18next'
import { describeMfaResetFailure, resetOperatorMfa, type MfaResetResponse } from '../../../lib/console/operatorMfaReset'
import { displayName, type PlatformUser } from '../../../lib/console/platformOperators'
import { OperatorReasonDialog } from './OperatorReasonDialog'

/**
 * Resets another operator's two-step sign-in. What it does depends on what they have: with an
 * authenticator app, that and its recovery codes go; without one there is nothing to remove, and
 * the reset only signs them out everywhere. The dialog says which before anything is sent.
 */
export function ResetMfaDialog({
  user,
  onClose,
  onReset,
}: {
  user: PlatformUser
  onClose: () => void
  onReset: (answer: MfaResetResponse) => void
}) {
  const { t } = useTranslation()
  const name = displayName(user)

  return (
    <OperatorReasonDialog
      formId="reset-operator-mfa"
      title={t('console.operators.mfaReset.title', { name })}
      body={t(user.mfaEnabled ? 'console.operators.mfaReset.bodyApp' : 'console.operators.mfaReset.bodyNoApp', { name })}
      confirmLabel={t('console.operators.mfaReset.confirm')}
      confirmingLabel={t('console.operators.mfaReset.confirming')}
      send={(reason) => resetOperatorMfa(user, reason)}
      describeFailure={describeMfaResetFailure}
      onDone={onReset}
      onClose={onClose}
    />
  )
}
