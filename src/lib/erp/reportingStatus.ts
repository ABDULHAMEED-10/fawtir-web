import type {
  DeliveryRoute,
  DisplayStatus,
  ReconciliationLabel,
  RecipientAck,
} from '../../api/erp/reporting'

/**
 * Presentation only. Every function here colours or groups a value the server already decided;
 * none decides what a document's state is, and none is read by anything but a badge or a filter
 * menu. The dimensions themselves are always rendered beside whatever these produce.
 */

export type Tone = 'danger' | 'success' | 'pending' | 'neutral'

const DISPLAY_TONE: Record<DisplayStatus, Tone> = {
  REJECTED: 'danger',
  DUPLICATE: 'neutral',
  WAITING_FOR_MAPPING: 'pending',
  RETRYABLE_FAILURE: 'pending',
  PROCESSING: 'neutral',
  ACCEPTED: 'neutral',
  SUBMITTED: 'neutral',
  SENT: 'neutral',
  DELIVERED_UNCONFIRMED: 'pending',
  DELIVERED: 'success',
  // Neutral and not success: the buyer was given the invoice by other means, and whether that
  // reached them is not on the ledger this is read from, so nothing is claimed about it.
  OFF_NETWORK: 'neutral',
  DELIVERY_FAILED: 'danger',
}

/** A value the server sends that this build does not know yet is shown neutral, never as success. */
export function displayStatusTone(status: string): Tone {
  return DISPLAY_TONE[status as DisplayStatus] ?? 'neutral'
}

/**
 * The reconciliation labels in three groups for the filter menu. The groups are a reading aid:
 * a request always names the server's label, and a document carrying labels from two groups
 * (a tax report beside a delivery wait) shows both.
 */
export const LABEL_GROUPS: {
  id: 'attention' | 'delivery' | 'tax'
  labels: ReconciliationLabel[]
}[] = [
  {
    id: 'attention',
    labels: [
      'RECOVERY_PENDING',
      'WAITING_FOR_MAPPING',
      'RETRYABLE_FAILURE',
      'ATTEMPTS_EXHAUSTED',
      'ACCEPTED_WITHOUT_INVOICE',
    ],
  },
  { id: 'delivery', labels: ['TRANSPORT_PENDING', 'RESPONSE_PENDING', 'DELIVERY_FAILED'] },
  { id: 'tax', labels: ['TAX_REPORT_ATTENTION'] },
]

const LABEL_TONE: Partial<Record<ReconciliationLabel, Tone>> = {
  DELIVERY_FAILED: 'danger',
  ACCEPTED_WITHOUT_INVOICE: 'danger',
  ATTEMPTS_EXHAUSTED: 'danger',
}

export function reconciliationTone(label: string): Tone {
  return LABEL_TONE[label as ReconciliationLabel] ?? 'pending'
}

/**
 * Whether the delivery state can be read as a statement about delivery.
 *
 * Off the network the submission ledger still moves — an off-network invoice waits at QUEUED and
 * is later marked UNDELIVERABLE by the stale-queue sweep — but there was never a network leg, so
 * the state says nothing about whether the buyer received it (backend `SourceDocumentDisplayStatus`).
 */
export function deliveryStateIsMeaningful(route: DeliveryRoute | null | undefined): boolean {
  return route !== 'OUTSIDE_PEPPOL'
}

/** `NONE` is silence. It is never a refusal, and nothing may present it as one. */
export function recipientAckTone(code: RecipientAck | string | null | undefined): Tone {
  if (code === 'AP') return 'success'
  if (code === 'RE') return 'danger'
  if (code === 'AB') return 'pending'
  return 'neutral'
}

/** The first eight characters of an id, for a reference that fits a table cell. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}
