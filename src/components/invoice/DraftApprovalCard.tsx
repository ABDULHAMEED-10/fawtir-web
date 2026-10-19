import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, withRial } from '../ui'
import { Pill } from '../../pages/ErpPage/ErpShell'
import { useApiRead } from '../../hooks'
import {
  decideSalesApproval,
  loadSalesApproval,
  salesApprovalPath,
  type SalesApprovalCommand,
  type SalesApprovalDto,
  type SalesApprovalStatus,
} from '../../api/invoices/salesApproval'
import type { InvoiceTypeDto } from '../../api/invoices/list'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'

const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60'
const GHOST_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'

const TONE: Record<SalesApprovalStatus, 'neutral' | 'pending' | 'success' | 'danger'> = {
  NOT_REQUIRED: 'neutral',
  NOT_REQUESTED: 'neutral',
  PENDING: 'pending',
  APPROVED: 'success',
  REJECTED: 'danger',
}

/** The create permission each type's draft is prepared under: who may send it or withdraw it. */
export function preparePermission(type: InvoiceTypeDto): string {
  switch (type) {
    case 'CREDIT_NOTE':
      return 'creditnote.create'
    case 'DEBIT_NOTE':
      return 'debitnote.create'
    case 'SELF_BILLED_INVOICE':
    case 'SELF_BILLED_CREDIT_NOTE':
      return 'selfbilling.create'
    default:
      return 'invoice.draft'
  }
}

/**
 * A draft's approval (RL-6), read only while it is a draft. With sales approval switched off the
 * server reads every draft NOT_REQUIRED, and a failed read leaves `approval` null: either way the
 * screen behaves as it always has, and the server still holds the line at issue.
 */
export function useSalesApproval(invoiceId: string, draft: boolean) {
  const read = useApiRead<SalesApprovalDto>(draft ? salesApprovalPath(invoiceId) : null, () =>
    loadSalesApproval(invoiceId),
  )
  return { approval: read.read.status === 'ready' ? read.read.data : null, retry: read.retry }
}

/**
 * The approval card on a sales draft: where it stands, and the one or two things this reader may
 * do about it. Every offer comes from the server (`callerMayRequest`, `callerMayDecide`); nobody
 * who prepared the draft is ever offered Approve, and the server refuses it if they try.
 *
 * Nothing is drawn while no rule covers the draft.
 */
export function DraftApprovalCard({
  invoiceId,
  type,
  approval,
  onChanged,
  onApproveAndIssue,
}: {
  invoiceId: string
  type: InvoiceTypeDto
  approval: SalesApprovalDto | null
  /** After any step: re-read the approval, the document and its timeline. */
  onChanged: () => void
  /** Offered beside Approve to someone who may also issue; opens the issue dialog after approving. */
  onApproveAndIssue?: () => void
}) {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  if (approval === null || approval.status === 'NOT_REQUIRED') return null

  const status = approval.status
  const mayPrepare = can(session, preparePermission(type))
  const mayWithdraw = mayPrepare && (status === 'PENDING' || status === 'APPROVED')
  // The draft's own currency: `withRial` turns "OMR" into the rial sign, any other code stays text.
  const currency = approval.currency ?? 'OMR'
  const amount =
    approval.payableAmount === null
      ? null
      : `${currency} ${formatAmount(approval.payableAmount, currency, i18n.language)}`

  const run = async (
    command: SalesApprovalCommand,
    text?: string,
    then?: (next: SalesApprovalDto) => void,
  ) => {
    setBusy(true)
    setFailure(null)
    try {
      const next = await decideSalesApproval(invoiceId, command, approval.draftVersion, text)
      setRejecting(false)
      setReason('')
      onChanged()
      then?.(next)
    } catch (error) {
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setFailure(
        message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
      )
      // A retried approval is already counted; the fresh state says so.
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-sm bg-surface-card" aria-label={t('salesApproval.card.title')}>
      <div className="flex flex-wrap items-center gap-3 p-5">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
          {t('salesApproval.card.title')}
        </h2>
        <Pill tone={TONE[status]} label={t(`salesApproval.status.${status}`)} />
      </div>
      <div className="flex flex-col gap-4 p-5 pt-0">
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {status === 'PENDING'
            ? t('salesApproval.card.pending', {
                given: approval.distinctApprovals,
                required: approval.requiredApprovals,
              })
            : t(`salesApproval.card.${status}`)}
        </p>
        {amount && status !== 'NOT_REQUESTED' ? (
          <p className="text-sm font-medium leading-[1.5] text-text-quaternary">
            {withRial(t('salesApproval.card.amount', { amount }))}
          </p>
        ) : null}
        {status === 'REJECTED' && approval.lastDecision?.reason ? (
          <p className="rounded-md bg-danger-100 p-3 text-sm font-medium text-danger-700">
            {t('salesApproval.card.reason', { reason: approval.lastDecision.reason })}
          </p>
        ) : null}
        {status === 'APPROVED' && mayPrepare ? (
          <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
            {t('salesApproval.card.editClears')}
          </p>
        ) : null}
        {failure ? (
          <p className="rounded-md bg-danger-100 p-3 text-sm font-medium text-danger-700">
            {failure}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {approval.callerMayRequest ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('request')}
              className={PRIMARY_BUTTON}
            >
              {t('salesApproval.actions.request')}
            </button>
          ) : null}
          {approval.callerMayDecide ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run('approve')}
                className={onApproveAndIssue ? GHOST_BUTTON : PRIMARY_BUTTON}
              >
                {t('salesApproval.actions.approve')}
              </button>
              {onApproveAndIssue ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    // Only a fully approved draft can be issued. When more approvals are still
                    // needed the server refuses the issue (SALES_APPROVAL_PENDING), so the dialog
                    // stays shut and the card shows the count still owed.
                    void run('approve', undefined, (next) => {
                      if (next.status === 'APPROVED') onApproveAndIssue()
                    })
                  }
                  className={PRIMARY_BUTTON}
                >
                  {t('salesApproval.actions.approveAndIssue')}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejecting(true)}
                className={GHOST_BUTTON}
              >
                {t('salesApproval.actions.reject')}
              </button>
            </>
          ) : null}
          {mayWithdraw ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('withdraw')}
              className={GHOST_BUTTON}
            >
              {t('salesApproval.actions.withdraw')}
            </button>
          ) : null}
        </div>
      </div>

      <Modal
        open={rejecting}
        onClose={() => {
          setRejecting(false)
          setReason('')
        }}
        title={t('salesApproval.reject.title')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setRejecting(false)
                setReason('')
              }}
              className={GHOST_BUTTON}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void run('reject', reason.trim())}
              disabled={busy || reason.trim() === ''}
              className={`${PRIMARY_BUTTON} bg-danger-700 hover:bg-danger-700/90`}
            >
              {t('salesApproval.reject.confirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('salesApproval.reject.body')}
        </p>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-text-secondary">
            {t('salesApproval.reject.reason')}
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-1.5 w-full rounded-sm border border-border-subtle p-3 text-sm text-text-primary outline-none focus:border-primary-500"
          />
        </label>
      </Modal>
    </section>
  )
}
