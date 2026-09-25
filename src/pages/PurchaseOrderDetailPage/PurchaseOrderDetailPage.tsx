import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  actOnPurchaseOrder,
  loadGoodsReceipts,
  loadPurchaseOrder,
  purchaseOrderPath,
  recordGoodsReceipt,
  type GoodsReceiptDto,
  type PurchaseOrderAction,
  type PurchaseOrderDto,
} from '../../api/expenditure/purchaseOrders'
import { describeApiFailure } from '../../lib/apiFailure'
import { acceptsReceipts, canCancel, nextAction, outstandingOn, receivedByLine } from '../../lib/purchaseOrders'
import { formatAmount, formatDate, formatInstant } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'

const CHIP: Record<PurchaseOrderDto['state'], string> = {
  DRAFT: 'bg-surface-background text-text-tertiary',
  AWAITING_APPROVAL: 'bg-pending-100 text-pending-700',
  APPROVED: 'bg-primary-50 text-primary-800',
  SENT: 'bg-primary-50 text-primary-800',
  PARTIALLY_RECEIVED: 'bg-pending-100 text-pending-700',
  RECEIVED: 'bg-success-100 text-success-700',
  CLOSED: 'bg-success-100 text-success-700',
  CANCELLED: 'bg-surface-background text-text-quaternary',
}

const FIELD =
  'h-[46px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Expenditure › one purchase order (E-13).
 *
 * The order walks DRAFT → AWAITING_APPROVAL → APPROVED → SENT, then arrives against receipts
 * until it is RECEIVED and can be CLOSED. Only the move the current state allows is offered:
 * the domain refuses any other, and a button that exists to be refused teaches nothing.
 *
 * **"Mark as sent" is the honest wording.** The only dispatch channel writes a log line and
 * transmits nothing — `sent_at` records that the buyer says they communicated the order. A
 * screen offering to send it to the supplier would describe something the platform does not do.
 */
export function PurchaseOrderDetailPage() {
  return (
    <AppShell>
      <PurchaseOrderDetail />
    </AppShell>
  )
}

function PurchaseOrderDetail() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const { id = '' } = useParams()
  const session = useSession()
  const canManage = can(session, 'purchase-order.manage')
  const canApprove = can(session, 'purchase-order.approve')

  const order = useApiRead<PurchaseOrderDto>(id ? purchaseOrderPath(id) : null, () => loadPurchaseOrder(id))
  const receipts = useApiRead<GoodsReceiptDto[]>(id ? `${purchaseOrderPath(id)}/receipts` : null, () =>
    loadGoodsReceipts(id),
  )

  const [busy, setBusy] = useState<PurchaseOrderAction | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const row = order.read.status === 'ready' ? order.read.data : null
  const booked = receipts.read.status === 'ready' ? receipts.read.data : []
  const received = receivedByLine(booked)
  const money = (value: number | null) => (value === null ? '—' : formatAmount(value, row?.currency ?? 'OMR', language))

  const onFailure = (error: unknown) => {
    setNotice(null)
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setFailure(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
  }

  const act = async (action: PurchaseOrderAction) => {
    setBusy(action)
    setFailure(null)
    try {
      await actOnPurchaseOrder(id, action)
      setNotice(t(`purchaseOrder.done.${action}`))
      order.retry()
      receipts.retry()
    } catch (error) {
      onFailure(error)
    } finally {
      setBusy(null)
    }
  }

  const action = row ? nextAction(row.state) : null
  // Approving is its own permission: the person who raises an order is not necessarily the one
  // who may approve it, which is the point of the step.
  const mayAct = action === 'approve' ? canApprove : canManage

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 pb-10">
      <Link to="/expenditure/bills" className="text-sm font-semibold text-primary-700 hover:underline">
        {t('purchaseOrder.backToExpenditure')}
      </Link>

      {order.read.status === 'loading' ? <LoadingNotice /> : null}
      {order.read.status === 'failed' ? <ApiReadFailure error={order.read.error} retry={order.retry} /> : null}

      {row ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {row.number ?? t('purchaseOrder.unnumbered')}
              </h1>
              <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
                {t('purchaseOrder.ordered', {
                  date: row.orderDate ? formatDate(row.orderDate, language) : t('purchaseOrder.noDate'),
                })}
              </p>
            </div>
            <span className={['inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold', CHIP[row.state]].join(' ')}>
              {t(`supplierRecord.orderState.${row.state}`)}
            </span>
          </div>

          {notice ? <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}
          {failure ? (
            <Notice
              badge={t('supplierCreditNoteDetail.notDone')}
              body={failure}
              action={{ label: t('common.close'), onClick: () => setFailure(null) }}
            />
          ) : null}

          <section className="rounded-md bg-surface-card p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label={t('purchaseOrder.wantedBy')} value={row.wantedBy ? formatDate(row.wantedBy, language) : '—'} />
              <Fact label={t('purchaseOrder.yourReference')} value={row.yourReference ?? '—'} />
              <Fact label={t('purchaseOrder.gross')} value={money(row.totalGross)} />
              <Fact label={t('purchaseOrder.vat')} value={money(row.totalVat)} />
              {row.submittedAt ? (
                <Fact label={t('purchaseOrder.submitted')} value={formatInstant(row.submittedAt, language)} />
              ) : null}
              {row.approvedAt ? (
                <Fact label={t('purchaseOrder.approved')} value={formatInstant(row.approvedAt, language)} />
              ) : null}
              {row.sentAt ? <Fact label={t('purchaseOrder.markedSent')} value={formatInstant(row.sentAt, language)} /> : null}
              {row.cancelledAt ? (
                <Fact label={t('purchaseOrder.cancelled')} value={formatInstant(row.cancelledAt, language)} />
              ) : null}
            </dl>
            {row.supplierNote ? (
              <p className="mt-4 text-sm font-medium text-text-tertiary">{row.supplierNote}</p>
            ) : null}
          </section>

          <section className="rounded-md bg-surface-card">
            <h2 className="px-6 pt-6 text-xl font-medium leading-[1.2] text-text-secondary">
              {t('purchaseOrder.linesTitle')}
            </h2>
            <RowsView className="px-6 pb-6">
              <table className="w-full min-w-[720px] border-collapse text-start">
                <thead>
                  <tr className="border-b border-surface-background text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                    {(['item', 'ordered', 'received', 'unitPrice', 'lineNet'] as const).map((key) => (
                      <th key={key} className="px-3 py-3 text-start font-semibold">
                        {t(`purchaseOrder.col.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {row.lines.map((line) => {
                    const left = outstandingOn(line, received)
                    return (
                      <tr key={line.id} className="border-b border-surface-background last:border-0">
                        <td className="px-3 py-3 text-sm font-medium text-text-secondary">{line.description}</td>
                        <td className="px-3 py-3 text-sm font-medium tabular-nums text-text-tertiary">
                          {line.quantity}
                          {line.unit ? ` ${line.unit}` : ''}
                        </td>
                        <td className="px-3 py-3 text-sm font-medium tabular-nums">
                          <span className={left === 0 ? 'text-success-700' : 'text-text-tertiary'}>
                            {received.get(line.id) ?? 0}
                          </span>
                          {left > 0 ? (
                            <span className="ms-2 text-xs text-text-quaternary">
                              {t('purchaseOrder.stillDue', { count: left })}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-sm font-medium tabular-nums text-text-tertiary">
                          {formatAmount(line.unitPrice, row.currency, language)}
                        </td>
                        <td className="px-3 py-3 text-sm font-semibold tabular-nums text-text-secondary">
                          {formatAmount(line.lineNet, row.currency, language)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </RowsView>
          </section>

          {canManage || canApprove ? (
            <section className="rounded-md bg-surface-card p-6">
              <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('purchaseOrder.whatNext')}</h2>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {action ? (
                  <button
                    type="button"
                    disabled={!mayAct || busy !== null}
                    onClick={() => void act(action)}
                    className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
                  >
                    {t(busy === action ? 'common.saving' : `purchaseOrder.action.${action}`)}
                  </button>
                ) : (
                  <p className="text-sm font-medium text-text-tertiary">
                    {t(
                      acceptsReceipts(row.state)
                        ? 'purchaseOrder.awaitingGoods'
                        : `purchaseOrder.nothingToDo.${row.state}`,
                    )}
                  </p>
                )}
                {canCancel(row.state) && canManage ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void act('cancel')}
                    className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:opacity-50"
                  >
                    {t(busy === 'cancel' ? 'common.saving' : 'purchaseOrder.action.cancel')}
                  </button>
                ) : null}
              </div>
              {action === 'send' ? (
                // Said where the button is, not in a tooltip: a buyer pressing this is recording
                // that they told the supplier by their own means.
                <p className="mt-2 text-xs font-medium text-text-quaternary">{t('purchaseOrder.sendNote')}</p>
              ) : null}
              {action === 'approve' && !canApprove ? (
                <p className="mt-2 text-xs font-medium text-text-quaternary">{t('purchaseOrder.needsApprover')}</p>
              ) : null}
            </section>
          ) : (
            <PermissionDeniedNotice />
          )}

          {acceptsReceipts(row.state) && canManage ? (
            <BookIn order={row} received={received} onDone={() => { order.retry(); receipts.retry() }} onFailure={onFailure} />
          ) : null}

          <section className="rounded-md bg-surface-card p-6">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('purchaseOrder.receiptsTitle')}</h2>
            {receipts.read.status === 'loading' ? <LoadingNotice /> : null}
            {receipts.read.status === 'failed' ? (
              <ApiReadFailure error={receipts.read.error} retry={receipts.retry} />
            ) : null}
            {receipts.read.status === 'ready' ? (
              booked.length === 0 ? (
                <p className="mt-3 text-sm font-medium text-text-quaternary">{t('purchaseOrder.noReceipts')}</p>
              ) : (
                <ol className="mt-4 flex flex-col gap-4">
                  {booked.map((receipt) => (
                    <li key={receipt.id} className="border-s-2 border-surface-background ps-4">
                      <p className="text-sm font-semibold text-text-secondary">
                        {receipt.number ?? t('purchaseOrder.unnumberedReceipt')}
                      </p>
                      <p className="text-xs font-medium text-text-quaternary">
                        {receipt.receivedOn ? formatDate(receipt.receivedOn, language) : '—'}
                      </p>
                      {receipt.note ? <p className="mt-1 text-sm font-medium text-text-tertiary">{receipt.note}</p> : null}
                    </li>
                  ))}
                </ol>
              )
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  )
}

/** Books goods in against what is still outstanding, never against the ordered quantity again. */
function BookIn({
  order,
  received,
  onDone,
  onFailure,
}: {
  order: PurchaseOrderDto
  received: Map<string, number>
  onDone: () => void
  onFailure: (error: unknown) => void
}) {
  const { t } = useTranslation()
  const [receivedOn, setReceivedOn] = useState('')
  const [note, setNote] = useState('')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const entered = order.lines
    .map((line) => ({ line, value: Number(quantities[line.id] ?? '') }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)

  const overBooked = entered.filter((entry) => entry.value > outstandingOn(entry.line, received))
  const canBook = entered.length > 0 && overBooked.length === 0 && !busy

  const book = async () => {
    setBusy(true)
    try {
      await recordGoodsReceipt(order.id, {
        receivedOn: receivedOn || null,
        note: note.trim() || null,
        lines: entered.map((entry) => ({ purchaseOrderLineId: entry.line.id, quantityReceived: entry.value })),
      })
      setQuantities({})
      setNote('')
      onDone()
    } catch (error) {
      onFailure(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-md bg-surface-card p-6">
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('purchaseOrder.bookInTitle')}</h2>
      <p className="mt-1 text-sm font-medium text-text-quaternary">{t('purchaseOrder.bookInNote')}</p>

      <div className="mt-4 flex flex-col gap-2">
        {order.lines.map((line) => {
          const left = outstandingOn(line, received)
          return (
            <div key={line.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-text-secondary">
                {line.description}
                <span className="ms-2 text-xs text-text-quaternary">{t('purchaseOrder.stillDue', { count: left })}</span>
              </span>
              <input
                type="number"
                min={0}
                max={left}
                value={quantities[line.id] ?? ''}
                disabled={left === 0}
                onChange={(event) => setQuantities({ ...quantities, [line.id]: event.target.value })}
                aria-label={t('purchaseOrder.receiveFor', { item: line.description })}
                className={`${FIELD} w-28`}
              />
            </div>
          )
        })}
      </div>

      {overBooked.length > 0 ? (
        <p role="alert" className="mt-3 text-sm font-medium text-warning-700">
          {t('purchaseOrder.error.overBooked', { item: overBooked[0].line.description })}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-text-quaternary">{t('purchaseOrder.receivedOn')}</span>
          <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={`${FIELD} mt-1 w-full`} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-text-quaternary">{t('purchaseOrder.receiptNote')}</span>
          <input type="text" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={`${FIELD} mt-1 w-full`} />
        </label>
      </div>

      <button
        type="button"
        disabled={!canBook}
        onClick={() => void book()}
        className="mt-4 inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
      >
        {t(busy ? 'common.saving' : 'purchaseOrder.bookIn')}
      </button>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-text-secondary">{value}</dd>
    </div>
  )
}
