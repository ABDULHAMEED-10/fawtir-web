import type { ConsolePillTone } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import type { EnterpriseState } from '../../../lib/console/enterpriseTerms'

/** Waiting for Fawtir is the one that needs acting on; set terms wait for billing to start. */
export const ENTERPRISE_STATE_TONE: Record<EnterpriseState, ConsolePillTone> = {
  TERMS_NOT_SET: 'pending',
  TERMS_SET: 'info',
  BILLING_STARTED: 'success',
}
