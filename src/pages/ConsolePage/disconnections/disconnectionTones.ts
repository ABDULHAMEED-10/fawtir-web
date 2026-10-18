import type { ConsolePillTone } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import type { DisconnectionStatus } from '../../../lib/console/fawtirDisconnections'
import type { ReconnectionStatus } from '../../../lib/console/fawtirReconnections'

/** A disconnection's status pill: open ones wait, a completed one has left, the rest changed nothing. */
export const DISCONNECTION_STATUS_TONE: Record<DisconnectionStatus, ConsolePillTone> = {
  REQUESTED: 'pending',
  WAITING_FOR_CUSTOMER_APPROVAL: 'info',
  DISCONNECTED: 'danger',
  NOT_COMPLETED: 'neutral',
  WITHDRAWN: 'neutral',
}

/** A reconnection's status pill: open ones wait, a connected one is back, the rest changed nothing. */
export const RECONNECTION_STATUS_TONE: Record<ReconnectionStatus, ConsolePillTone> = {
  REQUESTED: 'pending',
  ACCEPTED: 'info',
  CONNECTED: 'success',
  NOT_COMPLETED: 'neutral',
  WITHDRAWN: 'neutral',
}
