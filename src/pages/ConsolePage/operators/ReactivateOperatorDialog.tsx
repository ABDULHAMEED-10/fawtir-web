import { useTranslation } from 'react-i18next'
import { describeReactivateFailure, reactivateOperator } from '../../../lib/console/operatorReactivation'
import { displayName, type PlatformUser } from '../../../lib/console/platformOperators'
import { OperatorReasonDialog } from './OperatorReasonDialog'

/**
 * Lets one deactivated operator sign in again. Nothing about how they sign in changes — same
 * username, password and second factor — and they come back with no platform role, which the
 * dialog says before anything is sent.
 */
export function ReactivateOperatorDialog({
  user,
  onClose,
  onReactivated,
}: {
  user: PlatformUser
  onClose: () => void
  onReactivated: (user: PlatformUser) => void
}) {
  const { t } = useTranslation()
  const name = displayName(user)

  return (
    <OperatorReasonDialog
      formId="reactivate-operator"
      title={t('console.operators.reactivate.title', { name })}
      body={t('console.operators.reactivate.body', { name })}
      confirmLabel={t('console.operators.reactivate.confirm')}
      confirmingLabel={t('console.operators.reactivate.confirming')}
      send={(reason) => reactivateOperator(user, reason)}
      describeFailure={describeReactivateFailure}
      onDone={onReactivated}
      onClose={onClose}
    />
  )
}
