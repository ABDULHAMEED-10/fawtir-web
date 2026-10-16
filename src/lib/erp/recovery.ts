import { ApiError, NetworkError } from '../../api'
import { isSubscriptionRestricted } from '../subscriptionRestricted'
import type {
  FailureReason,
  SourceDocumentDto,
  SourceDocumentRecoveryDto,
} from '../../api/erp/reporting'

/**
 * Whether a document's page offers recovery, and how a recovery's answer reads.
 *
 * The offer is a hint, not an eligibility check: the server alone knows whether the document's
 * request was captured (nothing before V253 was), whether its connection can still pull and
 * whether the source still answers. So the action is shown only where the server's own state
 * says recovery is the next step — a Managed Pull document refused for running out of attempts,
 * with no invoice — and every other condition is left to the server's typed answer.
 */
export type RecoveryOffer = 'offer' | 'noPermission' | 'none'

export function recoveryOffer(document: SourceDocumentDto, canRecover: boolean): RecoveryOffer {
  const exhausted =
    document.source_kind === 'MANAGED_PULL' &&
    document.processing_state === 'REJECTED' &&
    document.reason_code === 'ATTEMPTS_EXHAUSTED' &&
    document.invoice === null
  if (!exhausted) return 'none'
  return canRecover ? 'offer' : 'noPermission'
}

/**
 * What the page says after a recovery request, one closed kind per answer the server gives.
 *
 * Decided on the outcome, the module's `code` and the problem `type` slug, never on the `detail`
 * sentence. `retry` is true only where asking again could give another answer: a refusal about
 * the document itself (context, replay, missing, changed) never offers it, so nobody is invited
 * to try again forever at a record that cannot be recovered.
 */
export type RecoveryNoticeKind =
  | 'succeeded'
  | 'alreadyRecovered'
  | 'processingRetryable'
  | 'processingRefused'
  | 'contextUnavailable'
  | 'replayUnavailable'
  | 'targetMissing'
  | 'sourceChanged'
  | 'notEligible'
  | 'inProgress'
  | 'channelUnsupported'
  | 'connectionUnusable'
  | 'sourceAuthRejected'
  | 'sourceUnavailable'
  | 'platformUnavailable'
  | 'erpNotEnabled'
  | 'subscriptionNotStarted'
  | 'subscriptionSuspended'
  | 'subscriptionCancelled'
  | 'forbidden'
  | 'notFound'
  | 'rateLimited'
  | 'unreachable'
  | 'other'

export type RecoveryNotice = {
  kind: RecoveryNoticeKind
  tone: 'success' | 'neutral' | 'warning' | 'danger'
  retry: boolean
  /** Only for `succeeded`: whether the answer names an invoice, so the words never claim one it does not. */
  invoiceCreated?: boolean
  /** Only for `processingRefused`: the reason the pipeline gave. */
  reason?: FailureReason | null
}

export function noticeOfResult(result: SourceDocumentRecoveryDto): RecoveryNotice {
  switch (result.outcome) {
    case 'SUCCEEDED':
      return {
        kind: 'succeeded',
        tone: 'success',
        retry: false,
        invoiceCreated: result.processing_state === 'ACCEPTED' && result.invoice_uuid !== null,
      }
    case 'DUPLICATE_NOOP':
      return { kind: 'alreadyRecovered', tone: 'neutral', retry: false }
    case 'PROCESSING_FAILED':
      return result.recoverable
        ? { kind: 'processingRetryable', tone: 'warning', retry: true }
        : {
            kind: 'processingRefused',
            tone: 'danger',
            retry: false,
            reason: result.reason_code,
          }
    default:
      return { kind: 'other', tone: 'danger', retry: true }
  }
}

const BY_CODE: Record<string, Omit<RecoveryNotice, 'reason' | 'invoiceCreated'>> = {
  ERP_RECOVERY_CONTEXT_UNAVAILABLE: {
    kind: 'contextUnavailable',
    tone: 'warning',
    retry: false,
  },
  ERP_RECOVERY_SOURCE_REPLAY_UNAVAILABLE: {
    kind: 'replayUnavailable',
    tone: 'warning',
    retry: false,
  },
  ERP_RECOVERY_SOURCE_DOCUMENT_MISSING: {
    kind: 'targetMissing',
    tone: 'warning',
    retry: false,
  },
  ERP_RECOVERY_SOURCE_DOCUMENT_CHANGED: {
    kind: 'sourceChanged',
    tone: 'danger',
    retry: false,
  },
  ERP_RECOVERY_NOT_ELIGIBLE: {
    kind: 'notEligible',
    tone: 'neutral',
    retry: false,
  },
  ERP_RECOVERY_IN_PROGRESS: {
    kind: 'inProgress',
    tone: 'neutral',
    retry: false,
  },
  ERP_RECOVERY_CHANNEL_UNSUPPORTED: {
    kind: 'channelUnsupported',
    tone: 'warning',
    retry: false,
  },
  ERP_RECOVERY_CONNECTION_UNUSABLE: {
    kind: 'connectionUnusable',
    tone: 'warning',
    retry: true,
  },
  ERP_RECOVERY_SOURCE_AUTHENTICATION_REJECTED: {
    kind: 'sourceAuthRejected',
    tone: 'warning',
    retry: true,
  },
  ERP_RECOVERY_SOURCE_UNAVAILABLE: {
    kind: 'sourceUnavailable',
    tone: 'warning',
    retry: true,
  },
  // 503: Fawtir could not open stored credentials. Nothing about the document or connection is
  // wrong, so the same request may succeed later.
  ERP_RECOVERY_CREDENTIAL_ENCRYPTION_UNAVAILABLE: {
    kind: 'platformUnavailable',
    tone: 'warning',
    retry: true,
  },
}

const SUBSCRIPTION_KIND: Record<string, RecoveryNoticeKind> = {
  SUBSCRIPTION_NOT_STARTED: 'subscriptionNotStarted',
  SUBSCRIPTION_SUSPENDED: 'subscriptionSuspended',
  SUBSCRIPTION_CANCELLED: 'subscriptionCancelled',
}

export function noticeOfFailure(error: unknown): RecoveryNotice {
  if (error instanceof NetworkError) return { kind: 'unreachable', tone: 'danger', retry: true }
  if (!(error instanceof ApiError)) return { kind: 'other', tone: 'danger', retry: true }
  const known = error.code ? BY_CODE[error.code] : undefined
  if (known) return { ...known }
  if (isSubscriptionRestricted(error)) {
    // Recovery contacts the ERP, which stops while the subscription is read-only; asking again
    // gives the same answer until it is paid.
    const kind = SUBSCRIPTION_KIND[error.code ?? ''] ?? 'subscriptionSuspended'
    return { kind, tone: 'warning', retry: false }
  }
  if (error.status === 403) {
    if (error.problemType === 'erp-entitlement-required') {
      return { kind: 'erpNotEnabled', tone: 'danger', retry: false }
    }
    // A CSRF refusal is a stale page, not a missing permission.
    if (error.problemType !== 'csrf-rejected') {
      return { kind: 'forbidden', tone: 'danger', retry: false }
    }
  }
  if (error.status === 404) return { kind: 'notFound', tone: 'danger', retry: false }
  if (error.status === 429) return { kind: 'rateLimited', tone: 'warning', retry: true }
  return { kind: 'other', tone: 'danger', retry: true }
}

/**
 * Whether the page should read the document again after this answer. A network failure or an
 * unrecognised answer leaves the server's state unknown, and reading again would only replace the
 * notice with the same page; every server answer may have moved the document, so it is re-read.
 */
export function refreshAfter(notice: RecoveryNotice): boolean {
  return notice.kind !== 'unreachable' && notice.kind !== 'other' && notice.kind !== 'rateLimited'
}
