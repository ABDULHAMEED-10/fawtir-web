import { useTranslation } from 'react-i18next'
import {
  ConsoleStatusPill,
  type ConsolePillSize,
  type ConsolePillTone,
} from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import type { VerificationStatus } from '../../../lib/console/companyVerification'

const TONE: Record<VerificationStatus | 'notSubmitted', ConsolePillTone> = {
  notSubmitted: 'neutral',
  PENDING_VERIFICATION: 'pending',
  VERIFIED: 'success',
  REJECTED: 'danger',
}

/**
 * A registration's place in verification. One that was never submitted is not "waiting for
 * review", whatever status the backend stored for it (see `isSubmitted`), so it says so instead.
 */
export function VerificationStatusPill({
  status,
  submitted,
  size,
}: {
  status: VerificationStatus
  submitted: boolean
  size?: ConsolePillSize
}) {
  const { t } = useTranslation()
  const key = submitted ? status : 'notSubmitted'
  return (
    <ConsoleStatusPill
      tone={TONE[key]}
      label={t(`console.verification.status.${key}`)}
      size={size}
    />
  )
}
