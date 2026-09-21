import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
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
import { billListPath, loadBillPage, type BillRowDto } from '../../api/expenditure/bills'
import { CREDIT_STATUS_CHIP, reasonLabelKey, toCreditNoteItem } from '../../lib/supplierNoteList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, formatInstantDay } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'

const CHIP: Record<'usable' | 'waiting' | 'done' | 'refunded', string> = {
  usable: 'bg-pending-100 text-pending-700',
  waiting: 'bg-surface-background text-text-tertiary',
  done: 'bg-success-100 text-success-700',
  refunded: 'bg-primary-50 text-primary-800',
}

const FIELD =
  'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Expenditure › Credit notes › one note (E-15).
 *
 * Two dispositions, and they are not interchangeable. **Apply** spends the credit against a bill
 * the tenant owes, which lowers that bill's outstanding amount. **Refund** records that the
 * supplier gave the money back instead, so it names no bill at all. Both write a settlement row;
 * the rows below are the history of what has actually been done with the credit.
 */
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
  const session = useSession()
  const canSettle = can(session, 'invoice.payment.manage')

  const note = useApiRead<CreditNoteRowDto>(id ? creditNotePath(id) : null, () => loadCreditNote(id))
  const settlements = useApiRead<CreditNoteSettlementDto[]>(
    id ? `${creditNotePath(id)}/settlements` : null,
    () => loadCreditNoteSettlements(id),
  )

  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const row = note.read.status === 'ready' ? note.read.data : null
  const item = row ? toCreditNoteItem(row) : null
  const money = (value: number) => formatAmount(value, row?.currencyCode ?? 'OMR', language)

  const afterAction = (key: string) => {
    setFailure(null)
    setNotice(t(key))
    note.retry()
    settlements.retry()
  }

  const onFailure = (error: unknown) => {
    setNotice(null)
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setFailure(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 pb-10">
      <Link to="/expenditure/credit-notes" className="text-sm font-semibold text-primary-700 hover:underline">
        {t('supplierCreditNoteDetail.back')}
      </Link>

      {note.read.status === 'loading' ? <LoadingNotice /> : null}
      {note.read.status === 'failed' ? <ApiReadFailure error={note.read.error} retry={note.retry} /> : null}

      {row && item ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {item.number ?? t('supplierCreditNotes.rows.unnumbered')}
              </h1>
              <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
                {item.supplier ?? t('supplierCreditNotes.rows.unknownSupplier')}
              </p>
            </div>
            <span
              className={[
                'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold leading-[1.2]',
                CHIP[CREDIT_STATUS_CHIP[item.status]],
              ].join(' ')}
            >
              {t(`supplierCreditNotes.state.${item.status}`)}
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

          <section className="grid gap-4 sm:grid-cols-3">
            <Figure label={t('supplierCreditNoteDetail.credited')} value={item.credited === null ? '—' : money(item.credited)} strong />
            <Figure label={t('supplierCreditNoteDetail.applied')} value={money(row.balance.applied)} />
            <Figure label={t('supplierCreditNoteDetail.remaining')} value={money(row.balance.remaining)} strong />
          </section>

          <section className="rounded-md bg-surface-card p-6">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t('supplierCreditNoteDetail.factsTitle')}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Fact label={t('supplierCreditNoteDetail.issued')} value={item.issueDate ? formatDate(item.issueDate, language) : '—'} />
              <Fact label={t('supplierCreditNoteDetail.source')} value={t(`supplierCreditNotes.source.${item.source}`)} />
              <Fact label={t('supplierCreditNoteDetail.vat')} value={row.vatAmount === null ? '—' : money(row.vatAmount)} />
              <Fact
                label={t('supplierCreditNoteDetail.reason')}
                value={(() => {
                  const reason = reasonLabelKey(item.reasonCode)
                  return reason ? t(reason.key, { defaultValue: reason.fallback }) : t('supplierCreditNotes.rows.noReason')
                })()}
              />
              <Fact
                label={t('supplierCreditNoteDetail.credits')}
                value={
                  item.againstBillId ? (
                    <Link to={`/expenditure/bills/${item.againstBillId}`} className="font-semibold text-primary-700 hover:underline">
                      {item.againstBillNumber ?? t('supplierCreditNotes.rows.theBill')}
                    </Link>
                  ) : (
                    (item.againstBillNumber ?? t('supplierCreditNotes.rows.noBill'))
                  )
                }
              />
              <Fact
                label={t('supplierCreditNoteDetail.verified')}
                value={t(item.networkVerified ? 'supplierCreditNoteDetail.verifiedYes' : 'supplierCreditNoteDetail.verifiedNo')}
              />
            </dl>
          </section>

          {canSettle ? (
            row.balance.remaining > 0 ? (
              <Dispositions
                noteId={id}
                currency={row.currencyCode}
                remaining={row.balance.remaining}
                supplierName={item.supplier}
                onDone={afterAction}
                onFailure={onFailure}
              />
            ) : (
              <p className="rounded-md bg-surface-card p-6 text-sm font-medium text-text-tertiary">
                {t('supplierCreditNoteDetail.nothingLeft')}
              </p>
            )
          ) : (
            <PermissionDeniedNotice />
          )}

          <section className="rounded-md bg-surface-card">
            <h2 className="px-6 pt-6 text-xl font-medium leading-[1.2] text-text-secondary">
              {t('supplierCreditNoteDetail.historyTitle')}
            </h2>
            {settlements.read.status === 'loading' ? <LoadingNotice /> : null}
            {settlements.read.status === 'failed' ? (
              <ApiReadFailure error={settlements.read.error} retry={settlements.retry} />
            ) : null}
            {settlements.read.status === 'ready' ? (
              settlements.read.data.length === 0 ? (
                <p className="px-6 py-10 text-sm font-medium text-text-quaternary">
                  {/* Empty is a real state, not a gap: a note the V117 link governs has no explicit
                      rows, and the facts above already say which bill it credits. */}
                  {t('supplierCreditNoteDetail.noHistory')}
                </p>
              ) : (
                <RowsView className="px-6 pb-6">
                  <table className="w-full min-w-[680px] border-collapse text-start">
                    <thead>
                      <tr className="border-b border-surface-background text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                        {(['what', 'amount', 'when', 'reference'] as const).map((key) => (
                          <th key={key} className="px-4 py-3 text-start font-semibold">
                            {t(`supplierCreditNoteDetail.col.${key}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.read.data.map((settlement) => (
                        <tr key={settlement.id} className="border-b border-surface-background last:border-0">
                          <td className="px-4 py-4 text-sm font-semibold text-text-secondary">
                            {t(`supplierCreditNoteDetail.kind.${settlement.kind}`)}
                          </td>
                          <td className="px-4 py-4 text-sm font-medium tabular-nums text-text-secondary">
                            {formatAmount(settlement.amount, row.currencyCode, language)}
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-text-tertiary">
                            {formatDate(settlement.settledOn, language)}
                            <span className="block text-xs text-text-quaternary">
                              {t('supplierCreditNoteDetail.recorded', {
                                when: formatInstantDay(settlement.occurredAt, language),
                              })}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-text-tertiary">
                            {settlement.billId ? (
                              <Link to={`/expenditure/bills/${settlement.billId}`} className="font-semibold text-primary-700 hover:underline">
                                {t('supplierCreditNoteDetail.againstBill')}
                              </Link>
                            ) : (
                              (settlement.paymentReference ?? '—')
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </RowsView>
              )
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  )
}

/**
 * Apply and refund, side by side because they are alternatives: the credit either comes off a
 * bill or comes back as money, and doing one leaves less of it for the other.
 */
function Dispositions({
  noteId,
  currency,
  remaining,
  supplierName,
  onDone,
  onFailure,
}: {
  noteId: string
  currency: string
  remaining: number
  supplierName: string | null
  onDone: (key: string) => void
  onFailure: (error: unknown) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [busy, setBusy] = useState<'apply' | 'refund' | null>(null)

  // The bill to apply against is searched rather than typed: the endpoint wants an id, and asking
  // a person to copy a UUID is how the wrong bill gets credited.
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<{ id: string; label: string } | null>(null)
  const billsPath = billListPath({ filter: 'ALL', q: search.trim(), source: null, sort: 'NEWEST', page: 0, pageSize: 10 })
  const bills = useApiRead<Page<BillRowDto>>(search.trim().length >= 2 ? billsPath : null, () => loadBillPage(billsPath))

  const [applyAmount, setApplyAmount] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundDate, setRefundDate] = useState('')
  const [refundReference, setRefundReference] = useState('')

  const parsed = (value: string) => {
    const amount = Number(value)
    return value.trim() !== '' && Number.isFinite(amount) && amount > 0 ? amount : null
  }
  const applyOver = parsed(applyAmount) !== null && parsed(applyAmount)! > remaining
  const refundOver = parsed(refundAmount) !== null && parsed(refundAmount)! > remaining

  const run = async (which: 'apply' | 'refund', call: () => Promise<unknown>, doneKey: string) => {
    setBusy(which)
    try {
      await call()
      onDone(doneKey)
      setApplyAmount('')
      setRefundAmount('')
      setRefundReference('')
      setChosen(null)
      setSearch('')
    } catch (error) {
      onFailure(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('supplierCreditNoteDetail.applyTitle')}</h2>
        <p className="mt-1 text-sm font-medium leading-[1.5] text-text-quaternary">
          {t('supplierCreditNoteDetail.applyNote')}
        </p>

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-text-quaternary">{t('supplierCreditNoteDetail.findBill')}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setChosen(null)
            }}
            placeholder={supplierName ?? t('supplierCreditNoteDetail.findBillPlaceholder')}
            className={`${FIELD} mt-1`}
          />
        </label>

        {chosen ? (
          <p className="mt-2 text-sm font-semibold text-text-secondary">
            {t('supplierCreditNoteDetail.chosen', { bill: chosen.label })}{' '}
            <button type="button" onClick={() => setChosen(null)} className="font-semibold text-primary-700 hover:underline">
              {t('supplierCreditNoteDetail.change')}
            </button>
          </p>
        ) : bills.read.status === 'ready' ? (
          bills.read.data.items.length === 0 ? (
            <p className="mt-2 text-sm font-medium text-text-quaternary">{t('supplierCreditNoteDetail.noBills')}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {bills.read.data.items.map((bill) => (
                <li key={bill.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setChosen({
                        id: bill.id,
                        label: `${bill.supplierBillNumber ?? t('supplierCreditNotes.rows.unnumbered')} · ${bill.supplierName ?? ''}`.trim(),
                      })
                    }
                    className="w-full rounded-sm px-3 py-2 text-start text-sm font-medium text-text-secondary hover:bg-primary-25"
                  >
                    {bill.supplierBillNumber ?? t('supplierCreditNotes.rows.unnumbered')}
                    <span className="block text-xs text-text-quaternary">
                      {bill.supplierName} · {formatAmount(bill.outstandingAmount, bill.currencyCode, language)}{' '}
                      {t('supplierCreditNoteDetail.stillOwed')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-text-quaternary">{t('supplierCreditNoteDetail.amountOptional')}</span>
          <input
            type="number"
            inputMode="decimal"
            value={applyAmount}
            onChange={(event) => setApplyAmount(event.target.value)}
            placeholder={formatAmount(remaining, currency, language)}
            aria-invalid={applyOver}
            className={`${FIELD} mt-1`}
          />
        </label>
        {applyOver ? (
          <p role="alert" className="mt-1 text-sm font-medium text-warning-700">
            {t('supplierCreditNoteDetail.overRemaining', { amount: formatAmount(remaining, currency, language) })}
          </p>
        ) : (
          <p className="mt-1 text-xs font-medium text-text-quaternary">{t('supplierCreditNoteDetail.amountBlankNote')}</p>
        )}

        <button
          type="button"
          disabled={chosen === null || applyOver || busy !== null}
          onClick={() =>
            void run('apply', () => applyCreditNote(noteId, chosen!.id, parsed(applyAmount)), 'supplierCreditNoteDetail.appliedDone')
          }
          className="mt-4 inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
        >
          {t(busy === 'apply' ? 'common.saving' : 'supplierCreditNoteDetail.applyCta')}
        </button>
      </section>

      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('supplierCreditNoteDetail.refundTitle')}</h2>
        <p className="mt-1 text-sm font-medium leading-[1.5] text-text-quaternary">
          {t('supplierCreditNoteDetail.refundNote')}
        </p>

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-text-quaternary">{t('supplierCreditNoteDetail.amount')}</span>
          <input
            type="number"
            inputMode="decimal"
            value={refundAmount}
            onChange={(event) => setRefundAmount(event.target.value)}
            aria-invalid={refundOver}
            className={`${FIELD} mt-1`}
          />
        </label>
        {refundOver ? (
          <p role="alert" className="mt-1 text-sm font-medium text-warning-700">
            {t('supplierCreditNoteDetail.overRemaining', { amount: formatAmount(remaining, currency, language) })}
          </p>
        ) : null}

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-text-quaternary">{t('supplierCreditNoteDetail.paidOn')}</span>
          <input type="date" value={refundDate} onChange={(event) => setRefundDate(event.target.value)} className={`${FIELD} mt-1`} />
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-semibold text-text-quaternary">{t('supplierCreditNoteDetail.referenceOptional')}</span>
          <input
            type="text"
            maxLength={200}
            value={refundReference}
            onChange={(event) => setRefundReference(event.target.value)}
            className={`${FIELD} mt-1`}
          />
        </label>

        <button
          type="button"
          disabled={parsed(refundAmount) === null || refundOver || refundDate === '' || busy !== null}
          onClick={() =>
            void run(
              'refund',
              () => refundCreditNote(noteId, parsed(refundAmount)!, refundDate, refundReference.trim() || null),
              'supplierCreditNoteDetail.refundedDone',
            )
          }
          className="mt-4 inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:opacity-50"
        >
          {t(busy === 'refund' ? 'common.saving' : 'supplierCreditNoteDetail.refundCta')}
        </button>
      </section>
    </div>
  )
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-surface-card p-5">
      <p className="text-sm font-medium text-text-quaternary">{label}</p>
      <p
        className={[
          'mt-1 tabular-nums leading-[1.2]',
          strong ? 'text-[28px] font-semibold text-text-secondary' : 'text-xl font-medium text-text-tertiary',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
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
