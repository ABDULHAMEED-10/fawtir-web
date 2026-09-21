import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
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
import { reasonLabelKey, toDebitNoteItem } from '../../lib/supplierNoteList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, formatInstant } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'

const CHIP: Record<'UNCHECKED' | 'ACCEPTED' | 'REFUSED', string> = {
  UNCHECKED: 'bg-pending-100 text-pending-700',
  ACCEPTED: 'bg-success-100 text-success-700',
  REFUSED: 'bg-surface-background text-text-tertiary',
}

/** The presets the refusal form offers, plus a free line. All four already exist in both locales. */
const REFUSAL_PRESETS = ['notInRates', 'alreadyCharged', 'neverAuthorised'] as const

const FIELD =
  'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Expenditure › Debit notes › one note (E-16).
 *
 * The decision is **accept** or **refuse with a reason**, and it is recorded — nothing else. It
 * does not notify the supplier, move the charge onto a bill, or add it to a payment run; the
 * prototype's copy said all three and none of them happen, so none of it is rendered here.
 *
 * The one rule the server enforces is that a decision may not be restated: recording ACCEPTED
 * over ACCEPTED would add a history row that makes "when was this accepted?" ambiguous. Reversing
 * is always allowed, because reversing is why the history exists. So the button matching the
 * current status is disabled rather than sent and refused.
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

  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState<'accept' | 'refuse' | null>(null)
  const [refusing, setRefusing] = useState(false)
  const [preset, setPreset] = useState<string>(REFUSAL_PRESETS[0])
  const [otherReason, setOtherReason] = useState('')

  const row = note.read.status === 'ready' ? note.read.data : null
  const item = row ? toDebitNoteItem(row) : null
  const money = (value: number) => formatAmount(value, row?.currencyCode ?? 'OMR', language)

  const reason = preset === 'other' ? otherReason.trim() : t(`supplierDebitNotes.refuse.${preset}`)

  const decide = async (which: 'accept' | 'refuse') => {
    setBusy(which)
    setFailure(null)
    try {
      if (which === 'accept') await acceptDebitNote(id)
      else await refuseDebitNote(id, reason)
      setNotice(t(which === 'accept' ? 'supplierDebitNotes.decided.accepted' : 'supplierDebitNotes.decided.refused'))
      setRefusing(false)
      setOtherReason('')
      note.retry()
      history.retry()
    } catch (error) {
      setNotice(null)
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setFailure(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 pb-10">
      <Link to="/expenditure/debit-notes" className="text-sm font-semibold text-primary-700 hover:underline">
        {t('supplierDebitNotes.backToList')}
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
                CHIP[item.status],
              ].join(' ')}
            >
              {t(`supplierDebitNotes.status.${item.status}`)}
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
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t('supplierDebitNotes.chargeTitle')}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Fact
                label={t('supplierDebitNotes.fact.charged')}
                value={item.total === null ? '—' : money(item.total)}
              />
              <Fact label={t('supplierDebitNotes.fact.vat')} value={row.vatAmount === null ? '—' : money(row.vatAmount)} />
              <Fact
                label={t('supplierDebitNotes.fact.outstanding')}
                value={
                  item.status === 'REFUSED' ? (
                    t('supplierDebitNotes.rows.disputed')
                  ) : (
                    <span className={item.overdue ? 'font-semibold text-danger-700' : undefined}>
                      {money(item.outstanding)}
                      {item.overdue ? ` · ${t('supplierDebitNotes.fact.late')}` : ''}
                    </span>
                  )
                }
              />
              <Fact
                label={t('supplierDebitNotes.fact.due')}
                value={item.dueDate ? formatDate(item.dueDate, language) : '—'}
              />
              <Fact
                label={t('supplierDebitNotes.fact.issued')}
                value={item.issueDate ? formatDate(item.issueDate, language) : '—'}
              />
              <Fact label={t('supplierDebitNotes.fact.source')} value={t(`supplierCreditNotes.source.${item.source}`)} />
              <Fact
                label={t('supplierDebitNotes.fact.why')}
                value={(() => {
                  const code = reasonLabelKey(item.reasonCode)
                  return code ? t(code.key, { defaultValue: code.fallback }) : t('supplierCreditNotes.rows.noReason')
                })()}
              />
              <Fact
                label={t('supplierDebitNotes.fact.against')}
                value={item.relatesToBillNumber ?? t('supplierCreditNotes.rows.noBill')}
              />
            </dl>
          </section>

          {canDecide ? (
            <section className="rounded-md bg-surface-card p-6">
              <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('supplierDebitNotes.decisionTitle')}
              </h2>
              <p className="mt-1 text-sm font-medium leading-[1.5] text-text-quaternary">
                {t('supplierDebitNotes.decisionNote')}
              </p>

              {refusing ? (
                <div className="mt-4">
                  <fieldset>
                    <legend className="text-sm font-semibold text-text-secondary">
                      {t('supplierDebitNotes.detail.pickReason')}
                    </legend>
                    <div className="mt-2 flex flex-col gap-2">
                      {[...REFUSAL_PRESETS, 'other'].map((key) => (
                        <label key={key} className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary">
                          <input
                            type="radio"
                            name="refusalReason"
                            value={key}
                            checked={preset === key}
                            onChange={() => setPreset(key)}
                            className="size-4 accent-primary-700"
                          />
                          {t(`supplierDebitNotes.refuse.${key}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {preset === 'other' ? (
                    <label className="mt-3 block">
                      <span className="sr-only">{t('supplierDebitNotes.refuse.other')}</span>
                      <input
                        type="text"
                        maxLength={200}
                        value={otherReason}
                        onChange={(event) => setOtherReason(event.target.value)}
                        placeholder={t('supplierDebitNotes.refuse.otherPlaceholder')}
                        className={FIELD}
                      />
                    </label>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      // The server refuses a refusal with no reason, so an empty "other" never
                      // leaves the page.
                      disabled={reason === '' || busy !== null}
                      onClick={() => void decide('refuse')}
                      className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
                    >
                      {t(busy === 'refuse' ? 'common.saving' : 'supplierDebitNotes.detail.send')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefusing(false)}
                      className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary hover:bg-primary-25"
                    >
                      {t('supplierDebitNotes.detail.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    // Already accepted: restating it is refused by the server and records nothing,
                    // so it is not offered. Refusing it still is — reversing is always allowed.
                    disabled={item.status === 'ACCEPTED' || busy !== null}
                    onClick={() => void decide('accept')}
                    className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
                  >
                    {t(busy === 'accept' ? 'common.saving' : 'supplierDebitNotes.detail.accept')}
                  </button>
                  <button
                    type="button"
                    disabled={item.status === 'REFUSED' || busy !== null}
                    onClick={() => setRefusing(true)}
                    className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:opacity-50"
                  >
                    {t('supplierDebitNotes.detail.refuseAndTell')}
                  </button>
                  {item.status !== 'UNCHECKED' ? (
                    <p className="text-xs font-medium text-text-quaternary">
                      {t('supplierDebitNotes.reverseOnly', {
                        status: t(`supplierDebitNotes.status.${item.status}`),
                      })}
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          ) : (
            <PermissionDeniedNotice />
          )}

          <section className="rounded-md bg-surface-card p-6">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t('supplierDebitNotes.historyTitle')}
            </h2>
            {history.read.status === 'loading' ? <LoadingNotice /> : null}
            {history.read.status === 'failed' ? (
              <ApiReadFailure error={history.read.error} retry={history.retry} />
            ) : null}
            {history.read.status === 'ready' ? (
              history.read.data.length === 0 ? (
                <p className="mt-3 text-sm font-medium text-text-quaternary">{t('supplierDebitNotes.noHistory')}</p>
              ) : (
                <ol className="mt-4 flex flex-col gap-4">
                  {history.read.data.map((decision, index) => (
                    <li
                      key={`${decision.decidedAt}-${index}`}
                      className="border-s-2 border-surface-background ps-4"
                    >
                      <p className="text-sm font-semibold text-text-secondary">
                        {t(`supplierDebitNotes.status.${decision.decision}`)}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                        {formatInstant(decision.decidedAt, language)}
                      </p>
                      {decision.reason ? (
                        <p className="mt-1 text-sm font-medium text-text-tertiary">{decision.reason}</p>
                      ) : null}
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

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-text-secondary">{value}</dd>
    </div>
  )
}
