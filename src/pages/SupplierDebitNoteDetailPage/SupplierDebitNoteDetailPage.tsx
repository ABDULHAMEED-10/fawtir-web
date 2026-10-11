import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { DebitChecks } from '../../components/debit/DebitChecks'
import {
  ActivityTrail,
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
import {
  acceptDebitNote,
  debitNotePath,
  loadDebitNote,
  loadDebitNoteDecisions,
  refuseDebitNote,
  type DebitNoteDecisionDto,
  type DebitNoteRowDto,
} from '../../api/expenditure/notes'
import {
  billOriginalPath,
  downloadBillOriginal,
  type BillDetailDto,
} from '../../api/expenditure/bills'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import {
  loadSupplierOverview,
  supplierOverviewPath,
  type SupplierOverviewDto,
} from '../../api/expenditure/supplierRecord'
import { reasonLabelKey, toDebitNoteItem } from '../../lib/supplierNoteList'
import type { NoteFormat } from '../../lib/supplierCreditNotes'
import {
  REFUSAL_REASONS,
  billStateKey,
  debitActivity,
  debitEffect,
  debitNoteChecks,
} from '../../lib/supplierDebitNotes'
import { describeApiFailure } from '../../lib/apiFailure'
import { lineVatOf } from '../../lib/billDetail'
import { formatAmount, formatDate, formatInstant } from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
import { can, useSession } from '../../lib/session/session'
import downloadIcon from '../../assets/invoice-details/download.svg'
import acceptIcon from '../../assets/supplier-credit-notes/act-set.svg'
import refuseIcon from '../../assets/supplier-debit-notes/refuse-x.svg'
import eyeIcon from '../../assets/supplier-debit-notes/eye-dark.svg'

const CHIP: Record<DebitNoteRowDto['status'], string> = {
  UNCHECKED: 'bg-pending-100 text-pending-700',
  ACCEPTED: 'bg-success-100 text-[#3d5648]',
  REFUSED: 'bg-danger-100 text-danger-700',
}

const STATUS_LABEL: Record<DebitNoteRowDto['status'], string> = {
  UNCHECKED: 'supplierDebitNotes.state.unchecked',
  ACCEPTED: 'supplierDebitNotes.state.acceptedPlain',
  REFUSED: 'supplierDebitNotes.state.refused',
}

const FIELD =
  'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-medium text-text-secondary outline-none focus:border-warning-700'

/**
 * Expenditure > Debit notes > one note (E-16), on its frame (Figma 163:20528).
 *
 * The decision is **accept** or **refuse with a reason**, and it is recorded: nothing else. It
 * does not notify the supplier, move the charge onto a bill, or add it to a payment run; the
 * frame's copy said all three and none of them happen, so the sentences here say what does.
 * "Put on hold" is the frame's third choice and changes nothing on the server: an unchecked
 * charge is already on hold until somebody decides.
 *
 * The one rule the server enforces is that a decision may not be restated: recording ACCEPTED
 * over ACCEPTED would add a history row that makes "when was this accepted?" ambiguous. Reversing
 * is always allowed, because reversing is why the history exists. So the button matching the
 * current status is not offered (owner, 8 Oct 2026: hidden, not greyed), and neither is shown to
 * someone without `invoice.approve`.
 */
export function SupplierDebitNoteDetailPage() {
  return (
    <AppShell>
      <DebitNoteDetail />
    </AppShell>
  )
}

function DebitNoteDetail() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const { id = '' } = useParams()
  const session = useSession()
  const canDecide = can(session, 'invoice.approve')

  const note = useApiRead<DebitNoteRowDto>(id ? debitNotePath(id) : null, () => loadDebitNote(id))
  const history = useApiRead<DebitNoteDecisionDto[]>(
    id ? `${debitNotePath(id)}/decisions` : null,
    () => loadDebitNoteDecisions(id),
  )
  const row = note.read.status === 'ready' ? note.read.data : null
  const item = row ? toDebitNoteItem(row) : null

  const against = useNoteBill({
    billId: row?.relatesTo?.billId ?? null,
    billNumber: row?.relatesTo?.billNumber ?? null,
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

  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState<'accept' | 'refuse' | null>(null)
  const [refusing, setRefusing] = useState(false)
  const [held, setHeld] = useState(false)
  const [preset, setPreset] = useState<string>(REFUSAL_REASONS[0].id)
  const [otherReason, setOtherReason] = useState('')

  const currency = row?.currencyCode ?? 'OMR'
  const money = (value: number) => formatAmount(value, currency, language)
  const fmt: NoteFormat = {
    money,
    date: (iso) => formatDate(iso, language),
    when: (iso) => formatInstant(iso, language),
  }

  const reason = preset === 'other' ? otherReason.trim() : t(`supplierDebitNotes.refuse.${preset}`)

  const decide = async (which: 'accept' | 'refuse') => {
    setBusy(which)
    setFailure(null)
    try {
      if (which === 'accept') await acceptDebitNote(id)
      else await refuseDebitNote(id, reason)
      setNotice(
        t(
          which === 'accept'
            ? 'supplierDebitNotes.decided.accepted'
            : 'supplierDebitNotes.decided.refused',
        ),
      )
      setRefusing(false)
      setHeld(false)
      setOtherReason('')
      note.retry()
      history.retry()
    } catch (error) {
      setNotice(null)
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setFailure(
        message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
      )
    } finally {
      setBusy(null)
    }
  }

  const original = own
    ? billOriginalPath(own)
    : row?.inboundDeliveryId
      ? `/v1/inbound-invoices/${encodeURIComponent(row.inboundDeliveryId)}/document`
      : null
  const download = async () => {
    if (!original) return
    try {
      const file = await downloadBillOriginal(original)
      saveDownload(file, own?.intake?.filename ?? `${item?.number ?? id}.xml`)
    } catch (error) {
      const message = describeApiFailure(error)
      setFailure(t(message.key, message.values))
    }
  }

  if (!row || !item) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <NoteBreadcrumb
          to="/expenditure/debit-notes"
          parent={t('supplierDebitNotes.title')}
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
  const total = row.totalIncludingVat ?? 0
  const effect = debitEffect(bill, total, row.status === 'REFUSED')
  const billNumber = bill?.supplierBillNumber ?? row.relatesTo?.billNumber ?? null
  // As the credit-note page links its bill: the bill read, else the id the note names.
  const billTo = bill
    ? `/expenditure/bills/${bill.id}`
    : row.relatesTo?.billId
      ? `/expenditure/bills/${row.relatesTo.billId}`
      : null
  const tone = TONE.debit
  const lines = own?.lines ?? []
  const net = total - (row.vatAmount ?? 0)
  const reasonLabel = reasonLabelKey(row.reasonCode, row.reasonDetail ?? null)
  const reasonText = reasonLabel
    ? t(reasonLabel.key, { defaultValue: reasonLabel.fallback })
    : t('supplierCreditNotes.rows.noReason')
  const checks = debitNoteChecks(row, bill, fmt)
  const worries = checks.filter((check) => check.verdict === 'check').length
  const canAccept = row.status !== 'ACCEPTED'
  const canRefuse = row.status !== 'REFUSED'
  // Holding only means something before a decision; once one is taken it is hidden, not greyed
  // (owner, 8 Oct 2026).
  const canHold = row.status === 'UNCHECKED'

  const bannerTitle =
    row.status === 'ACCEPTED'
      ? t('supplierDebitNotes.detail.acceptedTitle', { amount: money(row.outstandingAmount) })
      : row.status === 'REFUSED'
        ? t('supplierDebitNotes.detail.refusedTitle', { amount: money(total) })
        : t('supplierDebitNotes.detail.theyWantMore', { amount: money(total) })
  const bannerBody =
    row.status === 'ACCEPTED'
      ? row.outstandingAmount > 0
        ? row.dueDate
          ? t('supplierDebitNotes.detail.acceptedBody', { date: fmt.date(row.dueDate) })
          : // No due date on the note: the sentence ends without one, never "due ."
            t('supplierDebitNotes.detail.acceptedBodyNoDate')
        : t('supplierDebitNotes.detail.acceptedSettledBody')
      : row.status === 'REFUSED'
        ? t('supplierDebitNotes.detail.refusedBody')
        : t('supplierDebitNotes.detail.theyWantMoreNote')

  const linked: LinkedDocument[] = []
  if (billNumber) {
    linked.push({
      id: 'bill',
      title: billNumber,
      kind: t('supplierDebitNotes.detail.linked.theBill'),
      detail: bill
        ? t('supplierDebitNotes.detail.linked.billDetail', {
            date: bill.issueDate ? fmt.date(bill.issueDate) : '',
            state: t(billStateKey(bill)),
            due: bill.dueDate ? fmt.date(bill.dueDate) : '',
          })
        : t('supplierDebitNotes.detail.linked.billNotOnFile'),
      to: billTo ?? undefined,
      icon: 'bill',
    })
  }
  // TODO(backend): the frame also links the goods receipt and the signed rate card (rows 5.9,
  // 5.10); nothing on the note names either.
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

  const acceptButton = (className: string) => (
    <button
      type="button"
      disabled={busy !== null}
      onClick={() => void decide('accept')}
      className={className}
    >
      <img src={acceptIcon} alt="" className="size-5" />
      {busy === 'accept' ? t('common.saving') : t('supplierDebitNotes.detail.accept')}
    </button>
  )

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <NoteBreadcrumb
        to="/expenditure/debit-notes"
        parent={t('supplierDebitNotes.title')}
        current={item.number ?? t('supplierCreditNotes.rows.unnumbered')}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {item.number ?? t('supplierCreditNotes.rows.unnumbered')}
            </h1>
            <StatusChip className={CHIP[item.status]} label={t(STATUS_LABEL[item.status])} />
            <KindBadge sign="+" label={t(`supplierNotes.kind.debit.${item.source}`)} />
          </div>
          <p className="mt-2 text-sm font-medium leading-[1.4] text-text-tertiary">
            {t('supplierDebitNotes.detail.from')}{' '}
            <span className="font-semibold text-text-secondary">
              {item.supplier ?? t('supplierCreditNotes.rows.unknownSupplier')}
            </span>
            {item.issueDate ? (
              <>
                {' · '}
                {t('supplierDebitNotes.detail.issuedOn', { date: '' }).trim()}{' '}
                <span className="font-semibold text-text-secondary">
                  {fmt.date(item.issueDate)}
                </span>
              </>
            ) : null}
            {billNumber ? (
              <>
                {' · '}
                {t('supplierDebitNotes.detail.addsTo')}{' '}
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
          <button
            type="button"
            disabled={!original}
            onClick={() => void download()}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
          >
            <img src={downloadIcon} alt="" className="size-5" />
            {t('supplierDebitNotes.detail.download')}
          </button>
          {canDecide ? (
            <>
              {canRefuse ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setRefusing(true)}
                  className="inline-flex h-[46px] items-center rounded-sm border border-danger-700 bg-white px-4 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100/60 disabled:opacity-40"
                >
                  {t('supplierDebitNotes.detail.refuseAndTell')}
                </button>
              ) : null}
              {canAccept
                ? acceptButton(
                    'inline-flex h-[46px] items-center gap-2 rounded-sm bg-pending-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-pending-500 disabled:opacity-40',
                  )
                : null}
            </>
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
            tone="debit"
            icon={
              <span className="relative block size-3.5">
                <span className="absolute inset-x-0 top-1/2 h-[2.5px] -translate-y-1/2 rounded-full bg-pending-700" />
                <span className="absolute inset-y-0 left-1/2 w-[2.5px] -translate-x-1/2 rounded-full bg-pending-700" />
              </span>
            }
            title={withRial(bannerTitle)}
            body={withRial(bannerBody)}
            tiles={[
              {
                key: 'theyBilled',
                // What the bill still owes, the basis "You'd pay" is on; said so when a credit or
                // a payment has already lowered it below what they billed.
                label: effect.reduced
                  ? t('supplierDebitNotes.detail.billStillOwes')
                  : t('supplierDebitNotes.detail.theyBilled'),
                value:
                  effect.billed === null ? '—' : <SignedAmount value={money(effect.billed)} />,
                note: bill
                  ? `${billNumber ?? ''} · ${bill.issueDate ? fmt.date(bill.issueDate) : ''}`
                  : billNumber
                    ? t('supplierDebitNotes.detail.billNotOnFile', { bill: billNumber })
                    : t('supplierCreditNotes.detail.noBillTile'),
              },
              {
                key: 'thisCharge',
                label: t('supplierDebitNotes.detail.thisCharge'),
                value: <SignedAmount value={money(total)} />,
                note: reasonText,
              },
              {
                key: 'youdPay',
                label: t('supplierDebitNotes.detail.youdPay'),
                // A refused charge is not added to what is owed, so you'd pay the bill as it is
                // (owner, 9 Oct 2026).
                value:
                  effect.willPay === null ? '—' : <SignedAmount value={money(effect.willPay)} />,
                note: bill?.dueDate
                  ? t('supplierCreditNotes.detail.dueOn', { date: fmt.date(bill.dueDate) })
                  : row.dueDate
                    ? t('supplierCreditNotes.detail.dueOn', { date: fmt.date(row.dueDate) })
                    : t('supplierCreditNotes.detail.noBillTile'),
              },
            ]}
          />

          <NoteCard title={t('supplierDebitNotes.detail.looksRight')}>
            <DebitChecks
              checks={checks}
              fineLabel={t('supplierDebitNotes.detail.fine')}
              checkLabel={t('supplierDebitNotes.detail.check')}
              summaryTitle={
                worries === 0
                  ? t('supplierDebitNotes.checks.summaryFine')
                  : t('supplierDebitNotes.checks.summaryWorries', { count: worries })
              }
              summaryBody={
                worries === 0
                  ? t('supplierDebitNotes.checks.summaryFineBody')
                  : t('supplierDebitNotes.checks.summaryWorriesBody')
              }
            />
          </NoteCard>

          <NoteCard title={t('supplierDebitNotes.detail.charging')}>
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
                          {t(`supplierDebitNotes.detail.col.${key}`)}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-sm font-medium text-text-quaternary">
                        {/* TODO(backend): lines on GET /v1/debit-notes/{id} (row 5.8). */}
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
                              {t('supplierDebitNotes.detail.lineAgainst', { bill: billNumber })}
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
                            <SignedAmount sign="+" value={money(line.lineNet)} />
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
                  {t('supplierDebitNotes.detail.netCharged')}
                </dt>
                <dd className="text-sm font-semibold text-text-secondary">
                  <SignedAmount sign="+" value={money(net)} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-1.5">
                <dt className="text-sm font-medium text-text-tertiary">
                  {t('supplierNotes.vatRow')}
                </dt>
                <dd className="text-sm font-semibold text-text-secondary">
                  <SignedAmount sign="+" value={money(row.vatAmount ?? 0)} />
                </dd>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4 border-t border-surface-background pt-3.5">
                <dt className="text-base font-semibold text-text-primary">
                  {t('supplierDebitNotes.detail.totalCharged')}
                </dt>
                <dd className={['text-[22px] font-semibold leading-[1.2]', tone.figure].join(' ')}>
                  <SignedAmount sign="+" value={money(total)} />
                </dd>
              </div>
            </dl>
          </NoteCard>

          <NoteCard title={t('supplierDebitNotes.detail.linkedTitle')}>
            {linked.length === 0 ? (
              <p className="mt-3 text-sm font-medium text-text-quaternary">
                {t('supplierNotes.noLinked')}
              </p>
            ) : (
              <LinkedDocuments documents={linked} />
            )}
          </NoteCard>

          <NoteCard title={t('supplierDebitNotes.detail.activityTitle')}>
            {history.read.status === 'failed' ? (
              <ApiReadFailure error={history.read.error} retry={history.retry} />
            ) : (
              <ActivityTrail
                tone="debit"
                label={t('supplierDebitNotes.detail.activityTitle')}
                entries={debitActivity(
                  row,
                  history.read.status === 'ready' ? history.read.data : [],
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
              <img src={eyeIcon} alt="" className="size-5" />
              {t('supplierDebitNotes.detail.yourDecision')}
            </p>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary">
              <SignedAmount sign="+" value={money(total)} />
            </p>
            <p className="mt-2 text-sm font-medium leading-[1.5] text-text-tertiary">
              {held
                ? t('supplierDebitNotes.detail.heldNote')
                : !canDecide
                  ? t('appAccess.missingPermission')
                  : row.status === 'UNCHECKED'
                    ? withRial(
                        t('supplierDebitNotes.decisionNote', {
                          bill: billNumber ?? t('supplierNotes.thisBill'),
                        }),
                      )
                    : t('supplierDebitNotes.reverseOnly', { status: t(STATUS_LABEL[row.status]) })}
            </p>

            {canDecide ? (
              held ? (
                <button
                  type="button"
                  onClick={() => setHeld(false)}
                  className="mt-4 inline-flex h-[46px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
                >
                  {t('supplierDebitNotes.detail.undo')}
                </button>
              ) : refusing ? (
                <div className="mt-4">
                  <fieldset>
                    <legend className="text-sm font-semibold text-text-primary">
                      {t('supplierDebitNotes.detail.pickReason')}
                    </legend>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {REFUSAL_REASONS.map((option) => {
                        const active = preset === option.id
                        return (
                          <label
                            key={option.id}
                            className={[
                              'inline-flex h-[34px] cursor-pointer items-center rounded-sm border bg-white px-3 text-xs font-medium transition-colors',
                              active
                                ? 'border-danger-700 text-danger-700'
                                : 'border-border-subtle text-text-secondary hover:border-danger-700',
                            ].join(' ')}
                          >
                            <input
                              type="radio"
                              name="refusalReason"
                              value={option.id}
                              checked={active}
                              onChange={() => setPreset(option.id)}
                              className="sr-only"
                            />
                            {t(option.labelKey)}
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>
                  {preset === 'other' ? (
                    <input
                      type="text"
                      maxLength={200}
                      value={otherReason}
                      onChange={(event) => setOtherReason(event.target.value)}
                      placeholder={t('supplierDebitNotes.refuse.otherPlaceholder')}
                      aria-label={t('supplierDebitNotes.refuse.other')}
                      className={`${FIELD} mt-2.5`}
                    />
                  ) : null}
                  <InfoNote plain>{t('supplierDebitNotes.detail.reasonRecorded')}</InfoNote>
                  <button
                    type="button"
                    // The server refuses a refusal with no reason, so an empty "other" never
                    // leaves the page.
                    disabled={reason === '' || busy !== null}
                    onClick={() => void decide('refuse')}
                    className="mt-3 inline-flex h-[46px] w-full items-center justify-center rounded-sm bg-danger-700 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === 'refuse' ? t('common.saving') : t('supplierDebitNotes.detail.send')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefusing(false)}
                    className="mt-2 inline-flex h-[38px] w-full items-center justify-center rounded-sm text-sm font-medium text-text-tertiary hover:text-text-secondary"
                  >
                    {t('supplierDebitNotes.detail.cancel')}
                  </button>
                </div>
              ) : (
                <>
                  {canRefuse ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setRefusing(true)}
                      className="mt-4 inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-sm border border-danger-700 bg-white text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100/60 disabled:opacity-40"
                    >
                      <img src={refuseIcon} alt="" className="size-4" />
                      {t('supplierDebitNotes.detail.refuseAndTell')}
                    </button>
                  ) : null}
                  {/* Keeps the card's spacing when Refuse above it is not offered. */}
                  {canAccept || canHold ? (
                    <div className={['flex gap-2.5', canRefuse ? 'mt-2.5' : 'mt-4'].join(' ')}>
                      {canAccept
                        ? acceptButton(
                            'inline-flex h-[42px] flex-1 items-center justify-center gap-2 rounded-sm border border-border-subtle bg-white px-2 text-sm font-medium text-text-secondary transition-colors hover:border-pending-200 disabled:opacity-40',
                          )
                        : null}
                      {canHold ? (
                        <button
                          type="button"
                          onClick={() => setHeld(true)}
                          className="inline-flex h-[42px] flex-1 items-center justify-center rounded-sm border border-border-subtle bg-white px-2 text-sm font-medium text-text-secondary transition-colors hover:border-pending-200 disabled:opacity-40"
                        >
                          {t('supplierDebitNotes.detail.hold')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )
            ) : null}
          </section>

          <NoteCard title={t('supplierDebitNotes.detail.rateCardTitle')}>
            {/* TODO(backend): the supplier's rate card (agreed price, hours, surcharges) and the
                receipt's sign-in time are not on any endpoint yet (row 5.9). */}
            <FactRows
              divided
              rows={[
                { label: t('supplierDebitNotes.detail.rateCard.perDelivery'), value: '—' },
                { label: t('supplierDebitNotes.detail.rateCard.normalHours'), value: '—' },
                { label: t('supplierDebitNotes.detail.rateCard.surcharges'), value: '—' },
                { label: t('supplierDebitNotes.detail.rateCard.signedAt'), value: '—' },
                { label: t('supplierDebitNotes.detail.rateCard.cardSigned'), value: '—' },
              ]}
            />
            <InfoNote>{t('supplierDebitNotes.detail.rateCardMissing')}</InfoNote>
          </NoteCard>

          <NoteCard title={t('supplierDebitNotes.detail.vatEffect')}>
            <FactRows
              divided
              rows={[
                {
                  label: t('supplierDebitNotes.detail.vatOnBill', {
                    bill: billNumber ?? t('supplierNotes.thisBill'),
                  }),
                  value:
                    bill?.vatAmount == null ? '—' : <SignedAmount value={money(bill.vatAmount)} />,
                },
                {
                  label: t('supplierDebitNotes.detail.vatAdded'),
                  value: <SignedAmount sign="+" value={money(row.vatAmount ?? 0)} />,
                },
                {
                  label: t('supplierDebitNotes.detail.vatReclaimable'),
                  value: (
                    <SignedAmount value={money((bill?.vatAmount ?? 0) + (row.vatAmount ?? 0))} />
                  ),
                },
              ]}
            />
            <InfoNote>{t('supplierDebitNotes.detail.vatNote')}</InfoNote>
          </NoteCard>

          <NoteCard title={t('supplierDebitNotes.detail.supplierTitle')}>
            <FactRows
              rows={[
                {
                  label: t('supplierDebitNotes.detail.supplierName'),
                  value: supplierProfile?.displayName ?? item.supplier ?? '—',
                },
                {
                  label: t('supplierDebitNotes.detail.supplierVat'),
                  value: supplierProfile?.vatNumber ?? '—',
                },
                {
                  label: t('supplierDebitNotes.detail.openBills'),
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
                // TODO(backend): notes this year and refusals per supplier (row 5.11).
                { label: t('supplierDebitNotes.detail.debitNotes'), value: '—' },
                { label: t('supplierDebitNotes.detail.refusedBefore'), value: '—' },
              ]}
            />
          </NoteCard>
        </aside>
      </div>
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
