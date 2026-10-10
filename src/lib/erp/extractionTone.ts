import type { ExtractionStatusCode } from '../../api/erp/extraction'

/** The server's extraction status in the pill idiom, one tone per status for every screen. */
export const EXTRACTION_STATUS_TONE: Record<
  ExtractionStatusCode,
  'success' | 'danger' | 'pending' | 'neutral'
> = {
  GLOBALLY_DISABLED: 'neutral',
  NOT_CONFIGURED: 'neutral',
  CONNECTION_NOT_READY: 'neutral',
  DISABLED_BY_OPERATOR: 'pending',
  MAPPING_NOT_CERTIFIED: 'danger',
  RUNNING: 'success',
  BACKOFF: 'danger',
  FAILED_LAST_RUN: 'danger',
  WAITING: 'success',
}
