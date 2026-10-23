import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField } from '../../components/ui'
import { FieldLabel, SectionCard } from '../../components/form'
import { selectAllOnFocus } from '../../components/invoice'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
} from '../../components/feedback/ApiNotice'
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
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import { BRANCHES_PATH, loadBranches, type BranchDto } from '../../api/invoices/drafts'
import { useBranchName } from '../../components/branch/useBranchName'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  acceptsReceipts,
  canCancel,
  nextAction,
  outstandingOn,
  receivedByLine,
} from '../../lib/purchaseOrders'
import { earlySettlementNote, termsNote } from '../../lib/supplierRecord'
import { formatAmount, formatDate, formatInstant, initialsOf } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { LinesTotals } from '../NewPurchaseOrderPage/OrderLinesTable'
import {
  ComposerHeader,
  FIELD_SHELL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SideCard,
  SideRow,
  StepsCard,
  SupplierStrip,
  type Step,
} from '../NewPurchaseOrderPage/SupplierComposerParts'

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

const TH =
  'pb-2 text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary'

/**
 * Expenditure › one purchase order. No frame of its own: it keeps the composer's shape (Figma
 * 163:27317), with the order read back where the fields were typed.
 *
 * The order walks DRAFT → AWAITING_APPROVAL → APPROVED → SENT, then arrives against receipts
 * until it is RECEIVED and can be CLOSED. Only the move the current state allows is offered.
 *
 * **"Mark as sent" is the honest wording.** The only dispatch channel writes a log line and
 * transmits nothing; `sent_at` records that the buyer says they communicated the order.
 */
export function PurchaseOrderDetailPage() {
  const { id = '' } = useParams()
  return (
    <AppShell>
      <PurchaseOrderDetail key={id} id={id} />
    </AppShell>
  )
}

function PurchaseOrderDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'purchase-order.manage')
  const canApprove = can(session, 'purchase-order.approve')

  const order = useApiRead<PurchaseOrderDto>(id ? purchaseOrderPath(id) : null, () =>
    loadPurchaseOrder(id),
  )
  const receipts = useApiRead<GoodsReceiptDto[]>(
    id ? `${purchaseOrderPath(id)}/receipts` : null,
    () => loadGoodsReceipts(id),
  )
  const row = order.read.status === 'ready' ? order.read.data : null
  const supplier = useApiRead<SupplierDetailDto>(row ? supplierPath(row.supplierId) : null, () =>
    loadSupplier(row!.supplierId),
  )
  const profile = supplier.read.status === 'ready' ? supplier.read.data.profile : null
  const branches = useApiRead<BranchDto[]>(
    row?.deliverToBranchId ? BRANCHES_PATH : null,
    loadBranches,
  )
  const { label: branchLabel } = useBranchName()
  const branch =
    branches.read.status === 'ready'
      ? (branches.read.data.find((entry) => entry.id === row?.deliverToBranchId) ?? null)
      : null

  const [busy, setBusy] = useState<PurchaseOrderAction | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const booked = receipts.read.status === 'ready' ? receipts.read.data : []
  const received = receivedByLine(booked)
  const currency = row?.currency ?? 'OMR'
  const money = (value: number | null) =>
    value === null ? '—' : formatAmount(value, currency, language)
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')

  const onFailure = (error: unknown) => {
    setNotice(null)
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setFailure(
      message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
    )
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

  if (order.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {order.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={order.read.error} retry={order.retry} />
        )}
      </div>
    )
  }
  if (!row) return null

  const action = nextAction(row.state)
  // Approving is its own permission: the person who raises an order is not necessarily the one
  // who may approve it, which is the point of the step.
  const mayAct = action === 'approve' ? canApprove : canManage
  const number = row.number ?? t('purchaseOrder.unnumbered')
  const supplierName = profile?.displayName ?? t('purchaseOrder.supplier')
  const terms = profile ? termsNote(profile.paymentTerms) : null
  const early = profile ? earlySettlementNote(profile) : null
  const vatRate = row.lines[0]?.vatRate ?? 5
  const net = row.totalNet ?? row.lines.reduce((sum, line) => sum + line.lineNet, 0)
  const vat = row.totalVat ?? row.lines.reduce((sum, line) => sum + line.vatAmount, 0)
  const gross = row.totalGross ?? net + vat

  const steps: Step[] = [
    {
      title: t('purchaseOrder.after.approves'),
      note: row.approvedAt
        ? formatInstant(row.approvedAt, language)
        : row.submittedAt
          ? t('purchaseOrder.where.submittedAt', { when: formatInstant(row.submittedAt, language) })
          : t('purchaseOrder.where.notSubmitted'),
      state: row.approvedAt
        ? 'done'
        : row.state === 'DRAFT' || row.state === 'AWAITING_APPROVAL'
          ? 'current'
          : 'todo',
    },
    {
      title: t('purchaseOrder.after.sent'),
      note: row.sentAt ? formatInstant(row.sentAt, language) : t('purchaseOrder.where.notSent'),
      state: row.sentAt ? 'done' : row.state === 'APPROVED' ? 'current' : 'todo',
    },
    {
      title: t('purchaseOrder.after.goodsArrive'),
      note:
        booked.length > 0
          ? t('purchaseOrder.where.deliveries', { count: booked.length })
          : t('purchaseOrder.after.goodsArriveNote'),
      state:
        row.state === 'RECEIVED' || row.state === 'CLOSED'
          ? 'done'
          : acceptsReceipts(row.state)
            ? 'current'
            : 'todo',
    },
    {
      title: t('purchaseOrder.after.billTurnsUp'),
      note: t('purchaseOrder.after.billTurnsUpNote'),
      state: row.state === 'CLOSED' ? 'done' : row.state === 'RECEIVED' ? 'current' : 'todo',
    },
  ]
  if (row.state === 'CANCELLED') steps.forEach((step) => (step.state = 'todo'))

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <ComposerHeader
        crumbs={[
          { label: t('suppliersPage.title'), to: '/suppliers' },
          { label: supplierName, to: `/suppliers/${row.supplierId}` },
          { label: number },
        ]}
        title={t('purchaseOrder.detailTitle', { number })}
        subtitle={t('purchaseOrder.ordered', {
          date: row.orderDate ? day(row.orderDate) : t('purchaseOrder.noDate'),
        })}
        actions={
          canManage || canApprove ? (
            <>
              {canCancel(row.state) && canManage ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act('cancel')}
                  className={SECONDARY_BUTTON}
                >
                  {t(busy === 'cancel' ? 'common.saving' : 'purchaseOrder.action.cancel')}
                </button>
              ) : null}
              {action ? (
                <button
                  type="button"
                  disabled={!mayAct || busy !== null}
                  onClick={() => void act(action)}
                  className={PRIMARY_BUTTON}
                >
                  {t(busy === action ? 'common.saving' : `purchaseOrder.action.${action}`)}
                </button>
              ) : null}
            </>
          ) : null
        }
      />

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}
      {failure ? (
        <Notice
          badge={t('supplierCreditNoteDetail.notDone')}
          body={failure}
          action={{ label: t('common.close'), onClick: () => setFailure(null) }}
        />
      ) : null}

      <SupplierStrip
        initials={initialsOf(supplierName)}
        name={supplierName}
        note={
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={[
                'inline-flex h-[24px] items-center rounded-full px-2.5 text-xs font-semibold',
                CHIP[row.state],
              ].join(' ')}
            >
              {t(`supplierRecord.orderState.${row.state}`)}
            </span>
            <span>{t(`purchaseOrder.stateNote.${row.state}`)}</span>
          </span>
        }
        facts={[
          { label: t('purchaseOrder.terms'), value: terms ? t(terms.key, terms.values) : '—' },
          {
            label: t('purchaseOrder.earlySettlement'),
            value: early ? t(early.key, early.values) : '—',
            tone: 'brand',
          },
          { label: t('purchaseOrder.wantedBy'), value: day(row.wantedBy) },
        ]}
      />

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <SectionCard step={1} title={t('purchaseOrder.whatOrdering')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <th className={`${TH} text-start`}>{t('purchaseOrder.col.item')}</th>
                    <th className={`${TH} text-end`}>{t('purchaseOrder.col.ordered')}</th>
                    <th className={`${TH} text-end`}>{t('purchaseOrder.col.received')}</th>
                    <th className={`${TH} text-end`}>{t('createInvoice.items.excl')}</th>
                    <th className={`${TH} text-end`}>{t('purchaseOrder.col.vat')}</th>
                    <th className={`${TH} text-end`}>{t('purchaseOrder.col.lineNet')}</th>
                  </tr>
                </thead>
                <tbody>
                  {row.lines.map((line) => {
                    const left = outstandingOn(line, received)
                    return (
                      <tr
                        key={line.id}
                        className="border-b border-surface-background last:border-0"
                      >
                        <td className="py-3 pe-3 text-sm font-medium text-text-secondary">
                          {line.description}
                        </td>
                        <td className="px-3 py-3 text-end text-sm font-medium tabular-nums text-text-tertiary">
                          {line.quantity}
                          {line.unit ? ` ${line.unit}` : ''}
                        </td>
                        <td className="px-3 py-3 text-end text-sm font-medium tabular-nums">
                          <span className={left === 0 ? 'text-success-700' : 'text-text-tertiary'}>
                            {received.get(line.id) ?? 0}
                          </span>
                          {left > 0 ? (
                            <span className="ms-2 text-xs text-text-quaternary">
                              {t('purchaseOrder.stillDue', { count: left })}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-end text-sm font-medium tabular-nums text-text-tertiary">
                          {money(line.unitPrice)}
                        </td>
                        <td className="px-3 py-3 text-end text-sm font-medium tabular-nums text-text-tertiary">
                          {line.vatRate === null ? '—' : `${line.vatRate}%`}
                        </td>
                        <td className="py-3 ps-3 text-end text-sm font-semibold tabular-nums text-text-secondary">
                          {money(line.lineNet)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <LinesTotals
              net={net}
              vat={vat}
              vatRate={String(vatRate)}
              total={gross}
              totalLabel={t('purchaseOrder.orderValue')}
              currency={currency}
              language={language}
            />
          </SectionCard>

          <SectionCard step={2} title={t('purchaseOrder.whenAndWhere')}>
            <dl className="grid gap-4 md:grid-cols-3">
              <Fact label={t('purchaseOrder.orderDate')} value={day(row.orderDate)} />
              <Fact label={t('purchaseOrder.wantedBy')} value={day(row.wantedBy)} />
              <Fact label={t('purchaseOrder.yourReference')} value={row.yourReference ?? '—'} />
              <Fact
                label={t('purchaseOrder.deliverTo')}
                value={
                  branch
                    ? [branchLabel(branch), branch.city].filter(Boolean).join(', ')
                    : (row.deliverToBranchId ?? '—')
                }
              />
              <div className="md:col-span-2">
                <Fact label={t('purchaseOrder.noteForSupplier')} value={row.supplierNote ?? '—'} />
              </div>
            </dl>
          </SectionCard>

          <SectionCard step={3} title={t('purchaseOrder.whatNext')}>
            {action ? (
              <p className="text-sm font-medium leading-[1.5] text-text-secondary">
                {t(`purchaseOrder.nextNote.${action}`)}
              </p>
            ) : (
              <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
                {t(
                  acceptsReceipts(row.state)
                    ? 'purchaseOrder.awaitingGoods'
                    : `purchaseOrder.nothingToDo.${row.state}`,
                )}
              </p>
            )}
            {action === 'send' ? (
              // Said where the button is, not in a tooltip: a buyer pressing this is recording
              // that they told the supplier by their own means.
              <p className="mt-2 text-xs font-medium text-text-quaternary">
                {t('purchaseOrder.sendNote')}
              </p>
            ) : null}
            {action === 'approve' && !canApprove ? (
              <p className="mt-2 text-xs font-medium text-text-quaternary">
                {t('purchaseOrder.needsApprover')}
              </p>
            ) : null}
          </SectionCard>

          {acceptsReceipts(row.state) && canManage ? (
            <BookIn
              order={row}
              received={received}
              onDone={() => {
                order.retry()
                receipts.retry()
              }}
              onFailure={onFailure}
            />
          ) : null}

          <SectionCard
            step={acceptsReceipts(row.state) && canManage ? 5 : 4}
            title={t('purchaseOrder.receiptsTitle')}
          >
            {receipts.read.status === 'loading' ? <LoadingNotice /> : null}
            {receipts.read.status === 'failed' ? (
              <ApiReadFailure error={receipts.read.error} retry={receipts.retry} />
            ) : null}
            {receipts.read.status === 'ready' ? (
              booked.length === 0 ? (
                <p className="text-sm font-medium text-text-quaternary">
                  {t('purchaseOrder.noReceipts')}
                </p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {booked.map((receipt) => (
                    <li key={receipt.id} className="border-s-2 border-surface-background ps-4">
                      <p className="text-sm font-semibold text-text-secondary">
                        {receipt.number ?? t('purchaseOrder.unnumberedReceipt')}
                      </p>
                      <p className="text-xs font-medium text-text-quaternary">
                        {day(receipt.receivedOn)}
                      </p>
                      {receipt.note ? (
                        <p className="mt-1 text-sm font-medium text-text-tertiary">
                          {receipt.note}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )
            ) : null}
          </SectionCard>
        </div>

        <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
          <SideCard title={t('purchaseOrder.thisOrder')}>
            <dl className="mt-3 flex flex-col">
              <SideRow label={t('purchaseOrder.lines')} value={String(row.lines.length)} />
              <SideRow label={t('purchaseOrder.net')} value={money(net)} currency />
              <SideRow label={t('purchaseOrder.vat')} value={money(vat)} currency />
              <SideRow label={t('purchaseOrder.orderValue')} value={money(gross)} currency />
              <SideRow label={t('purchaseOrder.wantedBy')} value={day(row.wantedBy)} last />
            </dl>
          </SideCard>
          <StepsCard title={t('purchaseOrder.whereItIs')} steps={steps} />
          {row.cancelledAt ? (
            <SideCard title={t('purchaseOrder.cancelled')}>
              <p className="mt-2 text-sm font-medium text-text-tertiary">
                {formatInstant(row.cancelledAt, language)}
              </p>
            </SideCard>
          ) : null}
        </aside>
      </div>
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
        lines: entered.map((entry) => ({
          purchaseOrderLineId: entry.line.id,
          quantityReceived: entry.value,
        })),
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
    <SectionCard step={4} title={t('purchaseOrder.bookInTitle')}>
      <p className="text-sm font-medium text-text-quaternary">{t('purchaseOrder.bookInNote')}</p>
      <div className="mt-4 flex flex-col gap-2">
        {order.lines.map((line) => {
          const left = outstandingOn(line, received)
          return (
            <div key={line.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-text-secondary">
                {line.description}
                <span className="ms-2 text-xs text-text-quaternary">
                  {t('purchaseOrder.stillDue', { count: left })}
                </span>
              </span>
              <input
                inputMode="decimal"
                value={quantities[line.id] ?? ''}
                disabled={left === 0}
                onFocus={selectAllOnFocus}
                onChange={(event) =>
                  setQuantities({ ...quantities, [line.id]: event.target.value })
                }
                aria-label={t('purchaseOrder.receiveFor', { item: line.description })}
                className={`${FIELD_SHELL} h-[46px] w-28 text-end`}
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
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t('purchaseOrder.receivedOn')} />
          <DateField
            value={receivedOn}
            onChange={setReceivedOn}
            ariaLabel={t('purchaseOrder.receivedOn')}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel label={t('purchaseOrder.receiptNote')} htmlFor="receipt-note" />
          <input
            id="receipt-note"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={FIELD_SHELL}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={!canBook}
        onClick={() => void book()}
        className={`${PRIMARY_BUTTON} mt-4`}
      >
        {t(busy ? 'common.saving' : 'purchaseOrder.bookIn')}
      </button>
    </SectionCard>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-text-secondary">{value}</dd>
    </div>
  )
}
