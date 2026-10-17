import type { ConsolePillTone } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import type { DisconnectionStatus } from '../../../lib/console/fawtirDisconnections'

/** A disconnection's status pill: open ones wait, a completed one has left, the rest changed nothing. */
export const DISCONNECTION_STATUS_TONE: Record<DisconnectionStatus, ConsolePillTone> = {
  REQUESTED: 'pending',
  WAITING_FOR_CUSTOMER_APPROVAL: 'info',
  DISCONNECTED: 'danger',
  NOT_COMPLETED: 'neutral',
  WITHDRAWN: 'neutral',
}
