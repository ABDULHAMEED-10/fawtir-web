import { useTranslation } from 'react-i18next'
import {
  ConsoleStatusPill,
  type ConsolePillTone,
} from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import type { BlockerStatus } from '../../../lib/console/validationPolicies'

// Green is kept for what is in force. An approved version is not: it still waits for a second
// operator, so it reads as work in progress like the steps before it. A scheduled version is not
// green either, even once its date has passed: whether it is in force is the server's
// `forceState`, shown beside the pill, and the status alone lags until the next lifecycle write.
const TONE: Record<BlockerStatus, ConsolePillTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'pending',
  PENDING_REVIEW: 'pending',
  APPROVED: 'pending',
  SCHEDULED: 'pending',
  ACTIVE: 'success',
  NOT_APPLICABLE: 'success',
  REJECTED: 'danger',
  REVOKED: 'danger',
  EXPIRED: 'neutral',
  SUPERSEDED: 'neutral',
}

export function PolicyStatusPill({ status }: { status: BlockerStatus }) {
  const { t } = useTranslation()
  return <ConsoleStatusPill tone={TONE[status]} label={t(`console.policies.status.${status}`)} />
}
