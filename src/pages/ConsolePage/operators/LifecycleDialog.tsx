import { useTranslation } from 'react-i18next'
import {
  changeOperatorLifecycle,
  describeLifecycleFailure,
  type LifecycleAction,
} from '../../../lib/console/operatorLifecycle'
import { displayName, type PlatformUser } from '../../../lib/console/platformOperators'
import { OperatorReasonDialog } from './OperatorReasonDialog'

/**
 * Confirms locking, unlocking or deactivating an operator, with the reason the backend requires
 * and records in the audit log. Lock and deactivate sign the person out everywhere at once; unlock
 * lets them back in. Taking away the last tenant administrator who can act is refused by the
 * backend (P4) and not offered here, though it still decides.
 */
export function LifecycleDialog({
  user,
  action,
  lastAdmin,
  onClose,
  onDone,
}: {
  user: PlatformUser
  action: LifecycleAction
  /** Lock or deactivate would take away the last tenant administrator who can act, as far as the whole team shows. */
  lastAdmin: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const name = displayName(user)
  const key = (suffix: string) => `console.operators.lifecycle.${action}${suffix}`

  return (
    <OperatorReasonDialog
      formId={`operator-${action}`}
      title={t(key('Title'), { name })}
      body={t(key('Body'), { name })}
      blockedNote={lastAdmin ? t('console.operators.lastAdmin') : undefined}
      confirmLabel={t(key('Confirm'))}
      confirmingLabel={t(key('Sending'))}
      send={(reason) => changeOperatorLifecycle(user, action, reason)}
      describeFailure={describeLifecycleFailure}
      onDone={onDone}
      onClose={onClose}
    />
  )
}
