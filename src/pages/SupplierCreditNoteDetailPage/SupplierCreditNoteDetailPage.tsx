import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { selectAllOnFocus } from '../../components/invoice'
import {
  ActivityTrail,
  ComplianceList,
  EffectBanner,
  FactRows,
  InfoNote,
  KindBadge,
  LinkedDocuments,
  NoteBreadcrumb,
  NoteCard,
  SignedAmount,
  StatusChip,
  TONE,
  type LinkedDocument,
} from '../../components/debit/NoteParts'
import { useNoteBill, useNoteOwnBill } from '../../components/debit/noteBill'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import {
  applyCreditNote,
  creditNotePath,
  loadCreditNote,
  loadCreditNoteSettlements,
  refundCreditNote,
  type CreditNoteRowDto,
  type CreditNoteSettlementDto,
} from '../../api/expenditure/notes'
import {
  billListPath,
  billOriginalPath,
  downloadBillOriginal,
  loadBillPage,
  type BillDetailDto,
  type BillRowDto,
} from '../../api/expenditure/bills'
import { intakePath } from '../../api/expenditure/billIntake'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import {
  loadSupplierOverview,
  supplierOverviewPath,
  type SupplierOverviewDto,
} from '../../api/expenditure/supplierRecord'
import {
  CREDIT_STATUS_CHIP,
  CREDIT_STATUS_LABEL,
  cl02ReasonOf,
  reasonLabelKey,
  toCreditNoteItem,
} from '../../lib/supplierNoteList'
import {
  creditActivity,
  creditCompliance,
  creditEffect,
  vatEffect,
  type NoteFormat,
} from '../../lib/supplierCreditNotes'
import { billStateKey, linkedBillDetailKey } from '../../lib/supplierDebitNotes'
import { describeApiFailure } from '../../lib/apiFailure'
import { lineVatOf } from '../../lib/billDetail'
import { formatAmount, formatDate, formatInstant, formatInstantDay } from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
import { can, useSession } from '../../lib/session/session'
import downloadIcon from '../../assets/invoice-details/download.svg'
import setIcon from '../../assets/supplier-credit-notes/act-set.svg'
import decisionIcon from '../../assets/bill-detail/activity.svg'

const CHIP: Record<'usable' | 'waiting' | 'done' | 'refunded', string> = {
  usable: 'bg-pending-100 text-pending-700',
  waiting: 'bg-pending-100 text-pending-700',
  done: 'bg-success-100 text-[#3d5648]',
  refunded: 'bg-primary-50 text-primary-800',
}

const FIELD =
  'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Expenditure > Credit notes > one note (E-15), on its frame (Figma 163:19560).
 *
 * Two dispositions, and they are not interchangeable. **Apply** spends the credit against a bill
 * the tenant owes, which lowers that bill's outstanding amount (`POST /apply`). **Refund** records
 * that the supplier gave the money back instead, so it names no bill at all (`POST /refund`). Both
 * write a settlement row; the Activity trail is the history of what has actually been done with
 * the credit. "Keep as credit" is the third choice the frame draws: it changes nothing on the
 * server, because an unapplied note already is held credit.
 */
/** What the upload hands this page: the sentence that says what the save did, said once. */
export type SavedNoteState = { saved?: { key: string; values?: Record<string, string> } }

export function SupplierCreditNoteDetailPage() {
  return (
    <AppShell>
      <CreditNoteDetail />
    </AppShell>
  )
}

function CreditNoteDetail() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const session = useSession()
  const canSettle = can(session, 'invoice.payment.manage')

  const note = useApiRead<CreditNoteRowDto>(id ? creditNotePath(id) : null, () =>
    loadCreditNote(id),
  )
  const settlements = useApiRead<CreditNoteSettlementDto[]>(
    id ? `${creditNotePath(id)}/settlements` : null,
    () => loadCreditNoteSettlements(id),
  )
  const row = note.read.status === 'ready' ? note.read.data : null
  const item = row ? toCreditNoteItem(row) : null

  // The bill it corrects, the note's own lines and file, and who sent it: none of it is on the
  // note row, all of it is drawn by the frame.
  const against = useNoteBill({
    billId: row?.credits.billId ?? null,
    billNumber: row?.credits.billNumber ?? null,
    supplierId: row?.supplierId ?? null,
  })
  const own = useNoteOwnBill(row ? id : null)
  const supplier = useApiRead<SupplierDetailDto>(
    row?.supplierId ? supplierPath(row.supplierId) : null,
    () => loadSupplier(row!.supplierId!),
  )
  const overview = useApiRead<SupplierOverviewDto>(
    row?.supplierId ? supplierOverviewPath(row.supplierId) : null,
    () => loadSupplierOverview(row!.supplierId!),
  )

  // What the upload did with the note, said once on arrival: a reload or a step back is not
  // another save, so the state is cleared at once.
  const arrived = (location.state as SavedNoteState | null)?.saved
  const [notice, setNotice] = useState<string | null>(
    arrived ? t(arrived.key, arrived.values) : null,
  )
  useEffect(() => {
    if (arrived) navigate(location.pathname, { replace: true, state: null })
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [failure, setFailure] = useState<string | null>(null)
  const [kept, setKept] = useState(false)
  const [mode, setMode] = useState<'idle' | 'apply' | 'refund'>('idle')

  const currency = row?.currencyCode ?? 'OMR'
  const money = (value: number) => formatAmount(value, currency, language)
  const fmt: NoteFormat = {
    money,
    date: (iso) => formatDate(iso, language),
    when: (iso) => formatInstant(iso, language),
  }

  const afterAction = (key: string) => {
    setFailure(null)
    setKept(false)
    setMode('idle')
    setNotice(t(key))
    note.retry()
    settlements.retry()
  }

  const onFailure = (error: unknown) => {
    setNotice(null)
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setFailure(
      message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
    )
  }

  // The note's own bill read names its file; until it answers, the row's delivery or upload.
  const original = own
    ? billOriginalPath(own)
    : row?.inboundDeliveryId
      ? `/v1/inbound-invoices/${encodeURIComponent(row.inboundDeliveryId)}/document`
      : row?.intakeId
        ? `${intakePath(row.intakeId)}/file`
        : null
  const download = async () => {
    if (!original) return
    try {
      const file = await downloadBillOriginal(original)
      saveDownload(file, own?.intake?.filename ?? `${item?.number ?? id}.xml`)
    } catch (error) {
      onFailure(error)
    }
  }

  if (!row || !item) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <NoteBreadcrumb
          to="/expenditure/credit-notes"
          parent={t('supplierCreditNotes.title')}
          current={id}
        />
        {note.read.status === 'loading' ? <LoadingNotice /> : null}
        {note.read.status === 'failed' ? (
          <ApiReadFailure error={note.read.error} retry={note.retry} />
        ) : null}
      </div>
    )
  }

  const bill = against.bill
  const remaining = row.balance.remaining
  // Read from the balance, not the status word: a note partly used or refunded still comes back
  // UNAPPLIED, and it is neither unused nor offerable against the bill it already reduced.
  const state = item.status
  const usedOnBill = row.credits.applied
  const effect = creditEffect(
    {
      credited: row.creditedAmount ?? 0,
      applied: row.balance.applied,
      remaining,
      appliedHere: usedOnBill,
    },
    bill,
  )
  const vat = vatEffect(bill?.vatAmount ?? null, row.vatAmount)
  const reason = reasonLabelKey(row.reasonCode, row.reasonDetail ?? null)
  // "QTY · Quantity correction": the code in the Tax Authority's list (CL-02-OM), under the
  // supplier's words (`reasonDetail`) or, without them, the code's own label.
  const cl02 = cl02ReasonOf(row.reasonCode)
  const reasonText = reason
    ? t(reason.key, { defaultValue: reason.fallback })
    : t('supplierCreditNotes.rows.noReason')
  const billNumber = bill?.supplierBillNumber ?? row.credits.billNumber
  const billTo = bill
    ? `/expenditure/bills/${bill.id}`
    : row.credits.billId
      ? `/expenditure/bills/${row.credits.billId}`
      : null
  const tone = TONE.credit
  const lines = own?.lines ?? []
  const net = (row.creditedAmount ?? 0) - (row.vatAmount ?? 0)

  const bannerTitle =
    state === 'REFUNDED'
      ? t('supplierCreditNotes.detail.refundedTitle', { amount: money(row.balance.refunded) })
      : state === 'APPLIED'
        ? t('supplierCreditNotes.detail.paidLessTitle', { amount: money(row.balance.applied) })
        : bill && state !== 'PARTLY_USED'
          ? t('supplierCreditNotes.detail.youllPayLess', { amount: money(remaining) })
          : t('supplierCreditNotes.detail.creditToUse', { amount: money(remaining) })
  const bannerBody =
    state === 'REFUNDED'
      ? t('supplierCreditNotes.detail.refundedBody')
      : state === 'APPLIED'
        ? t('supplierCreditNotes.detail.paidLessBody', { bill: billNumber ?? '' })
        : state === 'PARTLY_USED'
          ? t('supplierCreditNotes.detail.partlyUsedBody')
          : state === 'WAITING_FOR_BILL'
            ? t('supplierCreditNotes.detail.waitingBody')
            : bill
              ? bill.outstandingAmount > 0
                ? t('supplierCreditNotes.detail.youllPayLessNote')
                : t('supplierCreditNotes.detail.billPaidNote')
              : t('supplierCreditNotes.detail.noBillNote')

  // Once the note has reduced its bill, what is left can only go against another one.
  const setAgainstKey = usedOnBill
    ? 'supplierCreditNotes.detail.setAgainstAnother'
    : 'supplierCreditNotes.detail.setAgainst'

  const linked: LinkedDocument[] = []
  if (billNumber) {
    linked.push({
      id: 'bill',
      title: billNumber,
      kind: t('supplierCreditNotes.detail.linked.theBill'),
      detail: bill
        ? t(linkedBillDetailKey('supplierCreditNotes', bill), {
            date: bill.issueDate ? fmt.date(bill.issueDate) : '',
            state: t(billStateKey(bill)),
            due: bill.dueDate ? fmt.date(bill.dueDate) : '',
          })
        : t('supplierCreditNotes.detail.linked.billNotOnFile'),
      to: billTo ?? undefined,
      icon: 'bill',
    })
  }
  // TODO(backend): the frame links the purchase receipt (GRN) whose short delivery the credit
  // covers; nothing on the note names one (row 5.7).
  if (original) {
    linked.push({
      id: 'original',
      title: own?.intake?.filename ?? `${item.number ?? id}.xml`,
      kind: t('supplierCreditNotes.detail.linked.original'),
      detail: t('supplierCreditNotes.detail.linked.originalDetail'),
      onOpen: () => void download(),
      icon: 'file',
    })
  }

  const supplierProfile = supplier.read.status === 'ready' ? supplier.read.data.profile : null
  const payables = overview.read.status === 'ready' ? overview.read.data.payables : null
  const openBills = payables
    ? payables.notDue.bills + payables.dueSoon.bills + payables.late.bills + payables.onHold.bills
    : null

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <NoteBreadcrumb
        to="/expenditure/credit-notes"
        parent={t('supplierCreditNotes.title')}
        current={item.number ?? t('supplierCreditNotes.rows.unnumbered')}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {item.number ?? t('supplierCreditNotes.rows.unnumbered')}
            </h1>
            <StatusChip
              className={CHIP[CREDIT_STATUS_CHIP[item.status]]}
              label={t(CREDIT_STATUS_LABEL[item.status])}
            />
            <KindBadge sign={'−'} label={t(`supplierNotes.kind.credit.${item.source}`)} />
          </div>
          <p className="mt-2 text-sm font-medium leading-[1.4] text-text-tertiary">
            {t('supplierCreditNotes.detail.from')}{' '}
            <span className="font-semibold text-text-secondary">
              {item.supplier ?? t('supplierCreditNotes.rows.unknownSupplier')}
            </span>
            {item.issueDate ? (
              <>
                {' · '}
                {t('supplierCreditNotes.detail.issuedOn', { date: '' }).trim()}{' '}
                <span className="font-semibold text-text-secondary">
                  {fmt.date(item.issueDate)}
                </span>
              </>
            ) : null}
            {billNumber ? (
              <>
                {' · '}
                {t('supplierCreditNotes.detail.corrects')}{' '}
                {billTo ? (
                  <Link
                    to={billTo}
                    className="font-semibold text-text-secondary underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current"
                  >
                    {billNumber}
                  </Link>
                ) : (
                  <span className="font-semibold text-text-secondary">{billNumber}</span>
                )}
              </>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
          {/* Hidden, not greyed, when the note has no file on record (owner, 6 Oct). */}
          {original ? (
            <button
              type="button"
              onClick={() => void download()}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
            >
              <img src={downloadIcon} alt="" className="size-5" />
              {t('supplierCreditNotes.detail.download')}
            </button>
          ) : null}
          {canSettle && remaining > 0 ? (
            <button
              type="button"
              onClick={() => setMode('apply')}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={setIcon} alt="" className="size-5" />
              {t(setAgainstKey)}
            </button>
          ) : null}
        </div>
      </div>

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

      <div className="flex flex-col gap-[22px] xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <EffectBanner
            tone="credit"
            icon={<span className="h-[2.5px] w-3.5 rounded-full bg-[#3d5648]" />}
            title={withRial(bannerTitle)}
            body={withRial(bannerBody)}
            tiles={[
              {
                key: 'theyBilled',
                label: t('supplierCreditNotes.detail.theyBilled'),
                value: effect.billed === null ? '—' : <SignedAmount value={money(effect.billed)} />,
                note: bill
                  ? `${billNumber ?? ''} · ${bill.issueDate ? fmt.date(bill.issueDate) : ''}`
                  : t('supplierCreditNotes.detail.noBillTile'),
              },
              {
                key: 'thisCredit',
                label: t('supplierCreditNotes.detail.thisCredit'),
                value: <SignedAmount value={money(effect.credit)} />,
                note: reasonText,
              },
              {
                key: 'youllPay',
                label: t('supplierCreditNotes.detail.youllPay'),
                value:
                  effect.willPay === null ? '—' : <SignedAmount value={money(effect.willPay)} />,
                note: bill?.dueDate
                  ? t('supplierCreditNotes.detail.dueOn', { date: fmt.date(bill.dueDate) })
                  : bill && effect.outstanding !== null && effect.outstanding !== effect.billed
                    ? withRial(
                        t('supplierCreditNotes.detail.stillUnpaidOf', {
                          amount: `${currency} ${money(effect.outstanding)}`,
                        }),
                      )
                    : t('supplierCreditNotes.detail.noBillTile'),
              },
            ]}
          />

          <NoteCard title={t('supplierCreditNotes.detail.whyTitle')}>
            <p className="mt-3 text-sm font-medium leading-[1.6] text-text-secondary">
              {reasonText}
            </p>
            {row.reasonCode ? (
              <p className="mt-2 text-xs font-medium text-text-quaternary">
                {cl02
                  ? t('expenditureNotes.reasonCodeLine', {
                      code: cl02,
                      label: t(`salesNote.reasons.${cl02}`),
                    })
                  : t('supplierCreditNotes.detail.reasonCode', { code: row.reasonCode })}
              </p>
            ) : null}
          </NoteCard>

          <NoteCard title={t('supplierCreditNotes.detail.whatsCredited')}>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                    {(['item', 'qty', 'unitPrice', 'vat', 'lineTotal'] as const).map(
                      (key, index) => (
                        <th
                          key={key}
                          className={[
                            'pb-2.5 font-semibold',
                            index === 0 ? 'text-start' : 'text-end',
                          ].join(' ')}
                        >
                          {t(`supplierCreditNotes.detail.col.${key}`)}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-sm font-medium text-text-quaternary">
                        {/* TODO(backend): lines on GET /v1/credit-notes/{id} (row 5.8). */}
                        {t('supplierNotes.noLines')}
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => (
                      <tr key={line.lineNo}>
                        <td className="py-4 pe-4">
                          <p className="text-base font-semibold leading-[1.2] text-text-primary">
                            {line.description ?? '—'}
                          </p>
                          {billNumber ? (
                            <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                              {t('supplierCreditNotes.detail.lineBilledOn', { bill: billNumber })}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-4 text-end text-sm font-medium text-text-secondary">
                          {line.quantity === null
                            ? '—'
                            : `${line.quantity} ${line.unit ?? ''}`.trim()}
                        </td>
                        <td className="py-4 text-end text-sm font-medium text-text-secondary">
                          {line.unitPrice === null ? (
                            '—'
                          ) : (
                            <SignedAmount value={money(line.unitPrice)} />
                          )}
                        </td>
                        <td className="py-4 text-end text-sm font-medium text-text-secondary">
                          <LineVatCell line={line} />
                        </td>
                        <td className="py-4 text-end text-sm font-semibold text-text-primary">
                          {line.lineNet === null ? (
                            '—'
                          ) : (
                            <SignedAmount sign={'−'} value={money(line.lineNet)} />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <dl className="ms-auto mt-2 w-full max-w-[360px]">
              <div className="flex items-center justify-between gap-4 py-1.5">
                <dt className="text-sm font-medium text-text-tertiary">
                  {t('supplierCreditNotes.detail.netCredited')}
                </dt>
                <dd className="text-sm font-semibold text-text-secondary">
                  <SignedAmount sign={'−'} value={money(net)} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-1.5">
                <dt className="text-sm font-medium text-text-tertiary">
                  {t('supplierNotes.vatRow')}
                </dt>
                <dd className="text-sm font-semibold text-text-secondary">
                  <SignedAmount sign={'−'} value={money(row.vatAmount ?? 0)} />
                </dd>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4 border-t border-surface-background pt-3.5">
                <dt className="text-base font-semibold text-text-primary">
                  {t('supplierCreditNotes.detail.totalCredit')}
                </dt>
                <dd className={['text-[22px] font-semibold leading-[1.2]', tone.figure].join(' ')}>
                  <SignedAmount sign={'−'} value={money(row.creditedAmount ?? 0)} />
                </dd>
              </div>
            </dl>
          </NoteCard>

          <NoteCard title={t('supplierCreditNotes.detail.linkedTitle')}>
            {linked.length === 0 ? (
              <p className="mt-3 text-sm font-medium text-text-quaternary">
                {t('supplierNotes.noLinked')}
              </p>
            ) : (
              <LinkedDocuments documents={linked} />
            )}
          </NoteCard>

          <NoteCard title={t('supplierCreditNotes.detail.activityTitle')}>
            {settlements.read.status === 'failed' ? (
              <ApiReadFailure error={settlements.read.error} retry={settlements.retry} />
            ) : (
              <ActivityTrail
                tone="credit"
                label={t('supplierCreditNotes.detail.activityTitle')}
                entries={creditActivity(
                  row,
                  settlements.read.status === 'ready' ? settlements.read.data : [],
                  fmt,
                )}
              />
            )}
          </NoteCard>
        </div>

        <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
          <section className={['rounded-md border p-5', tone.decision].join(' ')}>
            <p
              className={[
                'flex items-center gap-2 text-base font-semibold leading-[1.2]',
                tone.decisionTitle,
              ].join(' ')}
            >
              <img src={decisionIcon} alt="" className="size-5" />
              {t('supplierCreditNotes.detail.yourDecision')}
            </p>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary">
              <SignedAmount
                sign={'−'}
                value={money(remaining > 0 ? remaining : (row.creditedAmount ?? 0))}
              />
            </p>
            {/*
              All four figures the balance carries, because three of them do not add up on
              their own: a refunded note shows credited 52.500, used 0.000 and left 40.000, and
              the 12.500 that explains the gap is the one being left out. The frame draws a
              fresh note, where nothing has moved yet, without them, so they wait for a movement.
            */}
            {row.balance.applied > 0 || row.balance.refunded > 0 ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-primary-100 pt-3">
                {(
                  [
                    ['credited', row.creditedAmount ?? 0],
                    ['applied', row.balance.applied],
                    ['refunded', row.balance.refunded],
                    ['remaining', row.balance.remaining],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                      {t(`supplierCreditNoteDetail.${key}`)}
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-text-primary tabular-nums">
                      <SignedAmount sign="" value={money(value)} />
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <p className="mt-3 text-sm font-medium leading-[1.5] text-text-tertiary">
              {kept
                ? t('supplierCreditNotes.detail.keptDone', { supplier: item.supplier ?? '' })
                : remaining <= 0
                  ? t('supplierCreditNoteDetail.nothingLeft')
                  : !canSettle
                    ? t('appAccess.missingPermission')
                    : billNumber && !usedOnBill
                      ? t('supplierCreditNotes.detail.decisionNote', { bill: billNumber })
                      : t('supplierCreditNotes.detail.decisionNoteNoBill')}
            </p>

            {canSettle && remaining > 0 ? (
              kept ? (
                <button
                  type="button"
                  onClick={() => setKept(false)}
                  className="mt-4 inline-flex h-[46px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('supplierCreditNotes.detail.undo')}
                </button>
              ) : mode === 'apply' ? (
                <ApplyForm
                  noteId={id}
                  currency={currency}
                  remaining={remaining}
                  supplierId={row.supplierId}
                  supplierName={item.supplier}
                  knownBill={
                    // The bill this note already reduced would refuse it a second time.
                    bill && !usedOnBill
                      ? { id: bill.id, label: bill.supplierBillNumber ?? billNumber ?? '' }
                      : null
                  }
                  onDone={afterAction}
                  onFailure={onFailure}
                  onCancel={() => setMode('idle')}
                />
              ) : mode === 'refund' ? (
                <RefundForm
                  noteId={id}
                  currency={currency}
                  remaining={remaining}
                  onDone={afterAction}
                  onFailure={onFailure}
                  onCancel={() => setMode('idle')}
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setMode('apply')}
                    className="mt-4 inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-sm bg-primary-700 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    <img src={setIcon} alt="" className="size-5" />
                    {t(setAgainstKey)}
                  </button>
                  <div className="mt-2.5 flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setKept(true)}
                      className="inline-flex h-[42px] flex-1 items-center justify-center rounded-sm border border-border-subtle bg-white px-2 text-sm font-medium text-text-secondary transition-colors hover:border-primary-300"
                    >
                      {t('supplierCreditNotes.detail.keepAsCredit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('refund')}
                      className="inline-flex h-[42px] flex-1 items-center justify-center rounded-sm border border-border-subtle bg-white px-2 text-sm font-medium text-text-secondary transition-colors hover:border-primary-300"
                    >
                      {t('supplierCreditNotes.detail.askRefund')}
                    </button>
                  </div>
                </>
              )
            ) : null}
          </section>

          <NoteCard title={t('supplierCreditNotes.detail.vatEffect')}>
            <FactRows
              divided
              rows={[
                {
                  label: t('supplierCreditNotes.detail.vatClaimed'),
                  value: vat.claimed === null ? '—' : <SignedAmount value={money(vat.claimed)} />,
                },
                {
                  label: t('supplierCreditNotes.detail.vatReduced'),
                  value: <SignedAmount sign={'−'} value={money(vat.reduced)} />,
                },
                {
                  label: t('supplierCreditNotes.detail.vatReclaimable'),
                  value:
                    vat.reclaimable === null ? (
                      '—'
                    ) : (
                      <SignedAmount value={money(vat.reclaimable)} />
                    ),
                },
              ]}
            />
            <InfoNote>{t('supplierCreditNotes.detail.vatNote')}</InfoNote>
          </NoteCard>

          <NoteCard title={t('supplierCreditNotes.detail.complianceTitle')}>
            <ComplianceList
              lines={creditCompliance(row, (iso) => formatInstantDay(iso, language)).map(
                (line) => ({
                  id: line.id,
                  ok: line.ok,
                  text: t(line.key, line.values),
                }),
              )}
            />
          </NoteCard>

          <NoteCard title={t('supplierCreditNotes.detail.supplierTitle')}>
            <FactRows
              rows={[
                {
                  label: t('supplierCreditNotes.detail.supplierName'),
                  value: supplierProfile?.displayName ?? item.supplier ?? '—',
                },
                {
                  label: t('supplierCreditNotes.detail.supplierVat'),
                  value: supplierProfile?.vatNumber ?? '—',
                },
                {
                  label: t('supplierCreditNotes.detail.openBills'),
                  value:
                    payables && openBills !== null ? (
                      <span className="inline-flex items-baseline gap-1">
                        {openBills} ·{' '}
                        <SignedAmount
                          value={formatAmount(payables.total, payables.currencyCode, language)}
                        />
                      </span>
                    ) : (
                      '—'
                    ),
                },
                // TODO(backend): notes this year and short deliveries per supplier (row 5.11).
                { label: t('supplierCreditNotes.detail.creditNotes'), value: '—' },
                { label: t('supplierCreditNotes.detail.shortDeliveries'), value: '—' },
              ]}
            />
          </NoteCard>
        </aside>
      </div>
    </div>
  )
}

/**
 * "Set against the bill": the bill to apply against is searched rather than typed, because the
 * endpoint wants an id and asking a person to copy a UUID is how the wrong bill gets credited.
 * When the server already names the bill the credit reduces, it is offered first.
 */
function ApplyForm({
  noteId,
  currency,
  remaining,
  supplierId,
  supplierName,
  knownBill,
  onDone,
  onFailure,
  onCancel,
}: {
  noteId: string
  currency: string
  remaining: number
  supplierId: string | null
  supplierName: string | null
  knownBill: { id: string; label: string } | null
  onDone: (key: string) => void
  onFailure: (error: unknown) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(knownBill)
  const [amount, setAmount] = useState('')

  /*
   * Only this supplier's bills are offerable. `CreditNoteApplyGuard.requireSameSupplier` refuses
   * any other outright, so an option from a second supplier is a click that can only ever fail.
   *
   * The server narrows, via `supplier_id`. Filtering the returned page here instead would drop
   * matches that fell past the page boundary and show "nothing found" for a bill that exists.
   */
  const billsPath = billListPath({
    filter: 'ALL',
    q: search.trim(),
    source: null,
    sort: 'NEWEST',
    supplierId,
    page: 0,
    pageSize: 10,
  })
  const bills = useApiRead<Page<BillRowDto>>(search.trim().length >= 2 ? billsPath : null, () =>
    loadBillPage(billsPath),
  )

  /*
   * And again over what came back, on id then name, the same order the server's guard uses. Not
   * redundant: a note whose own supplier was never resolved to a record has no id to narrow by,
   * and this is what fails closed for it, exactly as the guard does.
   */
  const ownBill = (bill: BillRowDto) => {
    if (supplierId !== null && bill.supplierId !== null) return bill.supplierId === supplierId
    if (supplierName !== null && bill.supplierName !== null) {
      return bill.supplierName.trim().toLowerCase() === supplierName.trim().toLowerCase()
    }
    return false
  }

  /*
   * The rest of what the guard refuses as a target, so the list offers nothing that cannot work:
   * a credit note, itself included (nothing is owed ON one), and a bill already settled (the
   * amount would come out at zero). A supplier's DEBIT note is deliberately still offered: it
   * adds to what is owed, so a credit legitimately reduces it, and the server allows it.
   */
  const CREDIT_NOTE_CODES = ['381', '261']
  const creditable = (bill: BillRowDto) =>
    ownBill(bill) &&
    bill.id !== noteId &&
    !CREDIT_NOTE_CODES.includes(bill.documentTypeCode ?? '') &&
    bill.outstandingAmount > 0

  const parsed = (value: string) => {
    const number = Number(value)
    return value.trim() !== '' && Number.isFinite(number) && number > 0 ? number : null
  }
  const over = parsed(amount) !== null && parsed(amount)! > remaining
  const found = bills.read.status === 'ready' ? bills.read.data.items.filter(creditable) : null

  const apply = async () => {
    if (!chosen) return
    setBusy(true)
    try {
      await applyCreditNote(noteId, chosen.id, parsed(amount))
      onDone('supplierCreditNoteDetail.appliedDone')
    } catch (error) {
      onFailure(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4">
      {chosen ? (
        <p className="text-sm font-semibold text-text-secondary">
          {t('supplierCreditNoteDetail.chosen', { bill: chosen.label })}{' '}
          <button
            type="button"
            onClick={() => setChosen(null)}
            className="font-semibold text-primary-700 hover:underline"
          >
            {t('supplierCreditNoteDetail.change')}
          </button>
        </p>
      ) : (
        <label className="block">
          <span className="text-xs font-semibold text-text-quaternary">
            {t('supplierCreditNoteDetail.findBill')}
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={supplierName ?? t('supplierCreditNoteDetail.findBillPlaceholder')}
            className={`${FIELD} mt-1`}
          />
        </label>
      )}

      {!chosen && found ? (
        found.length === 0 ? (
          <p className="mt-2 text-sm font-medium text-text-quaternary">
            {/* Says whose bills were looked through, so "nothing" does not read as a broken search. */}
            {supplierName === null
              ? t('supplierCreditNoteDetail.noBills')
              : t('supplierCreditNoteDetail.noBillsForSupplier', { supplier: supplierName })}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {found.map((bill) => (
              <li key={bill.id}>
                <button
                  type="button"
                  onClick={() =>
                    setChosen({
                      id: bill.id,
                      label:
                        `${bill.supplierBillNumber ?? t('supplierCreditNotes.rows.unnumbered')} · ${bill.supplierName ?? ''}`.trim(),
                    })
                  }
                  className="w-full rounded-sm bg-white px-3 py-2 text-start text-sm font-medium text-text-secondary hover:bg-primary-50"
                >
                  {bill.supplierBillNumber ?? t('supplierCreditNotes.rows.unnumbered')}
                  <span className="block text-xs text-text-quaternary">
                    {bill.supplierName} ·{' '}
                    {formatAmount(bill.outstandingAmount, bill.currencyCode, language)}{' '}
                    {t('supplierCreditNoteDetail.stillOwed')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-text-quaternary">
          {t('supplierCreditNoteDetail.amountOptional')}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.001"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onFocus={selectAllOnFocus}
          placeholder={formatAmount(remaining, currency, language)}
          aria-invalid={over}
          className={`${FIELD} mt-1`}
        />
      </label>
      {over ? (
        <p role="alert" className="mt-1 text-sm font-medium text-warning-700">
          {withRial(
            t('supplierCreditNoteDetail.overRemaining', {
              amount: `${currency} ${formatAmount(remaining, currency, language)}`,
            }),
          )}
        </p>
      ) : (
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {t('supplierCreditNoteDetail.amountBlankNote')}
        </p>
      )}

      <button
        type="button"
        disabled={chosen === null || over || busy}
        onClick={() => void apply()}
        className="mt-3 inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-sm bg-primary-700 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
      >
        {busy ? t('common.saving') : t('supplierCreditNoteDetail.applyCta')}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 inline-flex h-[38px] w-full items-center justify-center rounded-sm text-sm font-medium text-text-tertiary hover:text-text-secondary"
      >
        {t('supplierDebitNotes.detail.cancel')}
      </button>
    </div>
  )
}

/** "Ask for a refund": the supplier gave the money back rather than crediting a bill. */
function RefundForm({
  noteId,
  currency,
  remaining,
  onDone,
  onFailure,
  onCancel,
}: {
  noteId: string
  currency: string
  remaining: number
  onDone: (key: string) => void
  onFailure: (error: unknown) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [reference, setReference] = useState('')

  const parsed = (value: string) => {
    const number = Number(value)
    return value.trim() !== '' && Number.isFinite(number) && number > 0 ? number : null
  }
  const over = parsed(amount) !== null && parsed(amount)! > remaining

  const refund = async () => {
    setBusy(true)
    try {
      await refundCreditNote(noteId, parsed(amount)!, paidOn, reference.trim() || null)
      onDone('supplierCreditNoteDetail.refundedDone')
    } catch (error) {
      onFailure(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
        {t('supplierCreditNoteDetail.refundNote')}
      </p>
      <label className="mt-3 block">
        <span className="text-xs font-semibold text-text-quaternary">
          {t('supplierCreditNoteDetail.amount')}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.001"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onFocus={selectAllOnFocus}
          aria-invalid={over}
          className={`${FIELD} mt-1`}
        />
      </label>
      {over ? (
        <p role="alert" className="mt-1 text-sm font-medium text-warning-700">
          {withRial(
            t('supplierCreditNoteDetail.overRemaining', {
              amount: `${currency} ${formatAmount(remaining, currency, language)}`,
            }),
          )}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-1">
        <span className="text-xs font-semibold text-text-quaternary">
          {t('supplierCreditNoteDetail.paidOn')}
        </span>
        <DateField
          value={paidOn}
          onChange={setPaidOn}
          ariaLabel={t('supplierCreditNoteDetail.paidOn')}
        />
      </div>
      <label className="mt-3 block">
        <span className="text-xs font-semibold text-text-quaternary">
          {t('supplierCreditNoteDetail.referenceOptional')}
        </span>
        <input
          type="text"
          maxLength={200}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          className={`${FIELD} mt-1`}
        />
      </label>
      <button
        type="button"
        disabled={parsed(amount) === null || over || paidOn === '' || busy}
        onClick={() => void refund()}
        className="mt-3 inline-flex h-[46px] w-full items-center justify-center rounded-sm bg-primary-700 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
      >
        {busy ? t('common.saving') : t('supplierCreditNoteDetail.refundCta')}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="mt-2 inline-flex h-[38px] w-full items-center justify-center rounded-sm text-sm font-medium text-text-tertiary hover:text-text-secondary"
      >
        {t('supplierDebitNotes.detail.cancel')}
      </button>
    </div>
  )
}

/**
 * A line's VAT cell: "5%" on a standard line; "0% · Exempt" with its reason code beneath on a
 * line that is not. TODO(backend): EXPENDITURE.md R.2, the category rides on the line.
 */
function LineVatCell({ line }: { line: BillDetailDto['lines'][number] }) {
  const { t } = useTranslation()
  const vat = lineVatOf(line)
  if (vat.rate === null) return <>—</>
  return (
    <>
      {vat.categoryKey
        ? t('billDetail.lines.vatCategory', { rate: `${vat.rate}%`, category: t(vat.categoryKey) })
        : `${vat.rate}%`}
      {vat.reason ? (
        <span className="mt-1 block text-xs font-medium leading-[1.3] text-text-quaternary">
          {vat.reason}
        </span>
      ) : null}
    </>
  )
}
