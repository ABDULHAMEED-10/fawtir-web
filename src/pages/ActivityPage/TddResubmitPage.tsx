import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Rial, RialText } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  activityDetailPath,
  activityListPath,
  loadActivityDetail,
  loadActivityList,
  resubmitTdd,
  type ActivityDetailDto,
  type ActivityListDto,
} from '../../api/compliance/activity'
import { whenOf } from '../../lib/activityDetail'
import {
  formatDuration,
  refusalCauseOf,
  refusalKindOf,
  secondsBetween,
} from '../../lib/activityLedger'
import { describeApiFailure } from '../../lib/apiFailure'
import { can, useSession } from '../../lib/session/session'
import {
  TDD_RESUBMIT,
  changeRows,
  formatOmr,
  quotaAboutToUse,
  tddResubmitRefusalKey,
  vatOf,
  type ChangeCell,
  type ChangeRow,
} from '../../lib/tddResubmit'
import { usePlanUsage } from '../../hooks/usePlanUsage'
import chevronIcon from '../../assets/invoices/chevron.svg'
import warnIcon from '../../assets/activity/warn-danger.svg'
import quotaWarnIcon from '../../assets/activity/warn-amber.svg'
import tickIcon from '../../assets/activity/check-filled.svg'
import crossIcon from '../../assets/suppliers/consequence-stop.svg'
import sendIcon from '../../assets/activity/ch-peppol.svg'

/**
 * Put a turned-down report right (Figma 154:108616), for the document at
 * `/compliance/activity/:id/resubmit`.
 *
 * The record (`/v1/compliance/activity/{invoice_uuid}`) names the invoice, the customer, what the
 * Authority said and when. What the page offers follows from what was refused:
 *
 * - an error in the invoice itself (totals, a tax category, the buyer's Peppol ID) is put right
 *   with a credit note and a new invoice, because the TDD carries a full copy of the invoice
 *   (TDT-012, IBR-TDD-57) and a changed report would not match the invoice the buyer holds;
 * - an error in the report alone is sent again: "Fix and send" posts the resubmission through the
 *   link the server put on the record, and only for someone who may submit.
 *
 * Only the fix for the actual cause is drawn. A typed fix cannot be saved yet (asks row 2.16), so
 * a send that depends on one stays disabled. The allowance is the design's (row 2.18).
 */
export function TddResubmitPage() {
  return (
    <AppShell>
      <ResubmitScreen />
    </AppShell>
  )
}

function ResubmitScreen() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const session = useSession()
  const { id = '' } = useParams()
  const detail = useApiRead<ActivityDetailDto>(activityDetailPath(id), () => loadActivityDetail(id))
  const rejectedPath = activityListPath({ tddAck: 'RE' }, 0, 100)
  const rejected = useApiRead<ActivityListDto>(rejectedPath, () => loadActivityList(rejectedPath))
  const [peppolId, setPeppolId] = useState('')
  const [required, setRequired] = useState(false)
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // The tenant's own allowance (GET /v1/settings/plan); the bar used to draw a sample 412 of 500.
  const usage = usePlanUsage()

  if (detail.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {detail.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={detail.read.error} retry={detail.retry} />
        )}
      </div>
    )
  }

  const dto = detail.read.data
  const item = dto.summary
  const lineage = dto.tdd_lineage
  const refusal =
    [...lineage].reverse().find((entry) => entry.failure_reason) ?? lineage[lineage.length - 1]
  const invoice = item.invoice_number ?? t('activity.unnumbered')
  const customer = item.counterparty ?? t('activityDetail.theCustomer')
  const turnedDownAt =
    item.tdd_leg?.ack === 'RE' ? whenOf(item.tdd_leg.ack_at, i18n.language) : null
  const undeclaredFor = secondsBetween(item.occurred_at, new Date().toISOString())
  const code = refusal?.error_code ?? null
  const reason = refusal?.failure_reason ?? item.tdd_leg?.reason ?? null
  // TODO(backend): ACTIVITY.md 2.30. Classified from the code and the reason until the refusal
  // carries its kind (`error_kind`).
  const cause = refusalCauseOf(code, reason)
  const kind = refusalKindOf(cause, refusal?.error_kind ?? item.tdd_leg?.error_kind)
  const record = {
    invoice,
    customer,
    customerLegal: customer,
    customerInitials: customer
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0] ?? '')
      .join('')
      .toUpperCase(),
    rejection: {
      code,
      reason,
      turnedDownAt: turnedDownAt ?? t('activityDetail.notYet'),
      attemptsSoFar: Math.max(1, lineage.length),
      undeclaredFor: undeclaredFor === null ? null : formatDuration(undeclaredFor),
    },
  }
  // The others turned down for the same reason, read off the ledger's rejected rows: the frame fixes
  // them together. Only rows the server offered a resubmission for can go.
  // TODO(backend): a same-cause grouping on the record would replace this match (asks row 2.19).
  const sameCause =
    rejected.read.status === 'ready' && record.rejection.reason
      ? rejected.read.data.items.filter(
          (row) =>
            row.invoice_uuid !== dto.invoice_uuid &&
            row.tdd_leg?.reason === record.rejection.reason &&
            row.links.resubmit !== null,
        )
      : []
  const group = [item, ...sameCause]
  const invoices = group.length
  const undeclaredTotal = group.reduce((sum, row) => sum + (row.amount ?? 0), 0)
  // The invoice total VAT (IBT-110) where the item carries it (asks row 2.34).
  const undeclaredVat = Math.round(group.reduce((sum, row) => sum + vatOf(row), 0) * 1000) / 1000
  const maySubmit = can(session, 'invoice.submit')
  const mayResubmit = maySubmit && item.links.resubmit !== null
  const peppolCause = cause === 'buyerPeppolId'
  const valid = TDD_RESUBMIT.fix.pattern.test(peppolId.trim())
  // TODO(backend): ACTIVITY.md 2.16. There is no route to save a typed fix, so nothing that
  // depends on one can go yet: the Peppol ID must be saved before a report or invoice carries it.
  const canSaveFix = false
  const blockedOnFix = peppolCause && !canSaveFix
  const aboutToUse = quotaAboutToUse(invoices, kind)
  const left = usage ? Math.max(0, usage.allowance - usage.used - aboutToUse) : 0
  const changes = changeRows(item, cause, kind, peppolId)

  const send = async () => {
    if (!item.links.resubmit || kind === 'invoice' || blockedOnFix) return
    setSending(true)
    setFailure(null)
    let sent = 0
    let held = 0
    let heldKey: string | null = null
    let left = false
    try {
      for (const row of group) {
        if (!row.links.resubmit) continue
        try {
          await resubmitTdd(row.links.resubmit)
          sent += 1
        } catch (error) {
          // A hold refuses one invoice, not the group: stopping here told the reader that nothing
          // was sent after earlier rows had gone, and left their links to be posted again.
          heldKey = tddResubmitRefusalKey(error)
          if (heldKey === null) throw error
          held += 1
        }
      }
      if (held === 0) {
        left = true
        navigate(`/compliance/activity/${dto.invoice_uuid}`)
      } else if (sent === 0 && heldKey !== null) {
        setFailure(t(heldKey))
      } else {
        setFailure(
          t('tddResubmit.refused.partlyHeld', { sent: String(sent), held: String(held) }),
        )
      }
    } catch (error) {
      const message = describeApiFailure(error)
      setFailure(t(message.key, message.values))
    } finally {
      setSending(false)
      // Staying here after anything was posted: re-read, so the button and the same-cause rows
      // offer only what the server still offers.
      if (!left && (sent > 0 || held > 0)) {
        detail.retry()
        rejected.retry()
      }
    }
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-24">
        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/compliance/activity"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {t('activity.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <Link
            to={`/compliance/activity/${dto.invoice_uuid}`}
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {invoice}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {t('tddResubmit.breadcrumb')}
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[820px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t(kind === 'invoice' ? 'tddResubmit.titleInvoice' : 'tddResubmit.title', {
                invoice,
              })}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.5] text-[#8f8f8f]">
              {t(`tddResubmit.subtitleKind.${kind}`, { customer: record.customer })}
            </p>
          </div>
          <Link
            to={`/invoices/${dto.invoice_uuid}`}
            className="inline-flex h-[46px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('tddResubmit.openInvoice')}
          </Link>
        </div>

        {/* What the Authority said */}
        <section className="rounded-md border border-[#f0d4ce] bg-[#fdf4f2] p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-sm bg-white">
              <img src={warnIcon} alt="" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2.5">
                <span className="text-lg font-medium leading-[1.2] text-danger-700">
                  {t('activityDetail.rejection.whatTheySaid')}
                </span>
                {record.rejection.code ? (
                  <span className="rounded-sm bg-white px-2 py-1 font-mono text-[11px] font-semibold text-danger-700">
                    {record.rejection.code}
                  </span>
                ) : null}
              </p>
              <p className="mt-2.5 text-sm font-medium leading-[1.6] text-text-secondary">
                {record.rejection.reason ?? t('activity.verdict.rejectedNoReason')}
              </p>

              <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
                <Stat
                  label={t('tddResubmit.rejection.turnedDown')}
                  value={record.rejection.turnedDownAt}
                />
                <Stat
                  label={t('tddResubmit.rejection.attemptsSoFar')}
                  value={String(record.rejection.attemptsSoFar)}
                />
                {record.rejection.undeclaredFor ? (
                  <Stat
                    label={t('tddResubmit.rejection.undeclaredFor')}
                    value={record.rejection.undeclaredFor}
                  />
                ) : null}
                <Stat
                  label={t('tddResubmit.rejection.sameCauseOpen')}
                  value={t('tddResubmit.rejection.invoices', { count: invoices })}
                />
              </dl>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* 1 Fix */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={1} title={t('tddResubmit.fixItWhere')} />

              <div className="mt-4 flex items-center justify-between gap-4 rounded-sm border border-primary-300 bg-primary-25 p-4 max-md:flex-wrap">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white text-xs font-semibold text-primary-800">
                    {record.customerInitials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-[1.2] text-text-primary">
                      {record.customerLegal}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-[1.4] text-text-tertiary">
                      {t(`tddResubmit.fixNote.${cause}`)}
                    </p>
                  </div>
                </div>
                <Link
                  to={peppolCause ? '/customers' : `/invoices/${dto.invoice_uuid}`}
                  className="inline-flex h-[42px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t(peppolCause ? 'tddResubmit.openCustomer' : 'tddResubmit.openInvoice')}
                </Link>
              </div>

              {/* The Peppol ID is the fix for a missing buyer participant ID only. */}
              {peppolCause ? (
                <div className="mt-4">
                  <label
                    htmlFor="peppol-id"
                    className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary"
                  >
                    {t('tddResubmit.peppolIdLabel')}
                    <span className="text-xl leading-4 text-primary-700">*</span>
                  </label>
                  <div
                    className={[
                      'mt-1.5 flex h-[50px] items-center gap-2 rounded-sm border px-4',
                      valid
                        ? 'border-[#cfe0d5] bg-[#eef5f0]'
                        : peppolId.trim() === ''
                          ? 'border-border-subtle bg-white'
                          : 'border-danger-700 bg-white',
                    ].join(' ')}
                  >
                    <input
                      id="peppol-id"
                      value={peppolId}
                      placeholder="0248:OM"
                      onChange={(event) => setPeppolId(event.target.value)}
                      className="w-full min-w-0 border-0 bg-transparent font-mono text-sm text-text-secondary outline-none"
                    />
                    {valid ? <img src={tickIcon} alt="" className="size-5 shrink-0" /> : null}
                  </div>
                  <p
                    className={[
                      'mt-1.5 text-xs font-medium leading-[1.4]',
                      valid || peppolId.trim() === '' ? 'text-text-quaternary' : 'text-danger-700',
                    ].join(' ')}
                  >
                    {valid || peppolId.trim() === ''
                      ? t('tddResubmit.peppolIdHintPlain')
                      : t('tddResubmit.peppolIdInvalid')}
                  </p>
                </div>
              ) : null}
            </section>

            {/* 2 What changes */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={2} title={t('tddResubmit.whatWillChange')} />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                      <th className="h-[44px] rounded-s-sm px-4 text-start font-semibold">
                        {t('tddResubmit.col.field')}
                      </th>
                      <th className="h-[44px] px-4 text-start font-semibold">
                        {t('tddResubmit.col.turnedDown')}
                      </th>
                      <th className="h-[44px] rounded-e-sm px-4 text-start font-semibold">
                        {t('tddResubmit.col.aboutToSend')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((row) => (
                      <ChangeTableRow key={row.id} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 3 Cost */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={3} title={t('tddResubmit.whatItCosts')} />
              <div className="mt-4 rounded-sm bg-surface-background p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                  <img src={quotaWarnIcon} alt="" className="size-4" />
                  {t('tddResubmit.quotaHeadline')}
                </p>

                {usage ? (
                  <>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-border-default">
                  <span
                    className="bg-primary-700"
                    style={{
                      width: `${(usage.used / usage.allowance) * 100}%`,
                    }}
                  />
                  <span
                    className="bg-[#4c6c5a]"
                    style={{
                      width: `${(aboutToUse / usage.allowance) * 100}%`,
                      minWidth: aboutToUse > 0 ? 6 : 0,
                    }}
                  />
                </div>

                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    {
                      tone: 'bg-primary-700',
                      text: t('tddResubmit.quotaUsed', { count: usage.used }),
                    },
                    {
                      tone: 'bg-[#4c6c5a]',
                      text: t('tddResubmit.quotaAboutTo', { count: aboutToUse }),
                    },
                    {
                      tone: 'bg-border-default',
                      text: t('tddResubmit.quotaLeft', {
                        count: left,
                        allowance: usage.allowance,
                      }),
                    },
                  ].map((entry) => (
                    <li key={entry.text} className="flex items-center gap-1.5">
                      <span className={['size-2.5 rounded-[2px]', entry.tone].join(' ')} />
                      <span className="text-xs font-medium text-text-tertiary">{entry.text}</span>
                    </li>
                  ))}
                </ul>
                  </>
                ) : (
                  <p className="mt-3 text-xs font-medium text-text-tertiary">
                    {t('tddResubmit.quotaUnavailable')}
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Side */}
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('tddResubmit.ifYouLeaveIt')}
              </h3>
              <ul className="mt-3 flex flex-col gap-3">
                {[
                  <Trans
                    key="sales"
                    i18nKey="tddResubmit.leaveIt.salesUndeclaredCount"
                    values={{
                      amount: `OMR ${formatOmr(undeclaredTotal)}`,
                      count: invoices,
                    }}
                    components={{
                      b: <RialText as="span" className="font-semibold text-text-primary" />,
                    }}
                  />,
                  <Trans
                    key="vat"
                    i18nKey="tddResubmit.leaveIt.vatMissingQuarter"
                    values={{
                      amount: `OMR ${formatOmr(undeclaredVat)}`,
                      quarter: Math.floor(new Date().getUTCMonth() / 3) + 1,
                    }}
                    components={{
                      b: <RialText as="span" className="font-semibold text-text-primary" />,
                    }}
                  />,
                  t('tddResubmit.leaveIt.unreported'),
                  // Only a customer with no Peppol ID makes every future invoice fail the same way.
                  ...(peppolCause ? [t('tddResubmit.leaveIt.futureFails')] : []),
                ].map((line, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <img src={crossIcon} alt="" className="mt-1 size-3 shrink-0" />
                    <span className="text-sm font-medium leading-[1.5] text-text-tertiary">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('tddResubmit.thisAttempt')}
              </h3>
              <dl className="mt-3 flex flex-col">
                <Row label={t('tddResubmit.attempt.invoice')} value={invoice} />
                <Row label={t('tddResubmit.attempt.customer')} value={record.customer} />
                <Row
                  label={t('tddResubmit.attempt.turnedDown')}
                  value={record.rejection.turnedDownAt}
                  danger
                />
                <Row
                  label={t('tddResubmit.attempt.willBeAttempt')}
                  // A credit note and a new invoice start a new report, not another attempt.
                  value={
                    kind === 'invoice'
                      ? t('tddResubmit.attempt.onNewInvoice')
                      : String(record.rejection.attemptsSoFar + 1)
                  }
                />
                <Row
                  label={t('tddResubmit.attempt.fixingAlongside')}
                  value={t('tddResubmit.attempt.moreInvoicesCount', { count: invoices - 1 })}
                />
                <Row
                  label={t('tddResubmit.attempt.quotaAfter')}
                  value={t('tddResubmit.attempt.left', { count: left })}
                  last
                />
              </dl>
            </section>

            {/* The design's "Stop it recurring" is about a missing Peppol ID: shown for that cause. */}
            {peppolCause ? (
              <section className="rounded-md bg-surface-card p-5">
                <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                  {t('tddResubmit.stopRecurring')}
                </h3>
                <p className="mt-2.5 text-sm font-medium leading-[1.6] text-text-tertiary">
                  {t('tddResubmit.stopRecurringCount', { count: invoices })}
                </p>
                <button
                  type="button"
                  onClick={() => setRequired(true)}
                  disabled={required}
                  className={[
                    'mt-4 inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-sm border text-sm font-semibold transition-colors',
                    required
                      ? 'border-[#cfe0d5] bg-[#eef5f0] text-[#3d5648]'
                      : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                  ].join(' ')}
                >
                  {required ? <img src={tickIcon} alt="" className="size-4" /> : null}
                  {required ? t('tddResubmit.madeRequired') : t('tddResubmit.makeRequired')}
                </button>
              </section>
            ) : null}
          </aside>
        </div>
      </div>

      {failure ? (
        <div className="mx-auto w-full max-w-[1144px] pb-4">
          <Notice
            badge={t('supplierCreditNoteDetail.notDone')}
            body={failure}
            action={{ label: t('common.close'), onClick: () => setFailure(null) }}
          />
        </div>
      ) : null}

      {/* Action bar */}
      <div className="sticky bottom-0 -mx-4 mt-auto border-t border-border-subtle bg-surface-card px-4 py-4">
        <div className="mx-auto flex w-full max-w-[1144px] flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-text-tertiary">
            {t(`tddResubmit.footerKind.${kind}`, { count: invoices })}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/compliance/activity"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('tddResubmit.cancel')}
            </Link>
            {/* TODO(backend): ACTIVITY.md 2.16. No route saves a fix yet, so this stays disabled. */}
            <button
              type="button"
              disabled={!canSaveFix || !valid}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
            >
              {t('tddResubmit.saveOnly')}
            </button>
            {kind === 'invoice' ? (
              // An error in the invoice itself: a credit note, then a new invoice. Nothing is resent.
              maySubmit ? (
                <Link
                  to={`/income/credit-notes/new?invoice=${dto.invoice_uuid}`}
                  className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                >
                  <img src={sendIcon} alt="" className="size-4 brightness-0 invert" />
                  {t('tddResubmit.issueCreditNote')}
                </Link>
              ) : null
            ) : mayResubmit ? (
              <button
                type="button"
                disabled={blockedOnFix || sending}
                onClick={() => void send()}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
              >
                <img src={sendIcon} alt="" className="size-4 brightness-0 invert" />
                {sending
                  ? t('common.saving')
                  : invoices > 1
                    ? t('tddResubmit.fixAndSendAll', { count: invoices })
                    : t('tddResubmit.fixAndSendOne')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}

function ChangeTableRow({ row }: { row: ChangeRow }) {
  const { t } = useTranslation()
  /** Only the corrected fields differ; everything else is carried over untouched. */
  const changes = row.after !== null

  return (
    <tr
      className={[
        'border-b border-surface-background last:border-0',
        changes ? 'bg-surface-background' : '',
      ].join(' ')}
    >
      <td className="px-4 py-3.5 text-sm font-medium text-text-secondary">{t(row.fieldKey)}</td>
      <td className="px-4 py-3.5">
        {row.before.empty ? (
          <span className="text-sm font-medium italic text-danger-700">
            {t('tddResubmit.empty')}
          </span>
        ) : (
          <Cell cell={row.before} />
        )}
      </td>
      <td className="px-4 py-3.5">
        {row.after ? (
          row.after.text ? (
            <span className="font-mono text-xs font-semibold text-[#3d5648]">{row.after.text}</span>
          ) : (
            <span className="text-sm font-medium text-[#3d5648]">{t(row.after.key ?? '')}</span>
          )
        ) : (
          <span className="text-sm font-medium text-text-quaternary">
            {t('tddResubmit.unchanged')}
          </span>
        )}
      </td>
    </tr>
  )
}

function Cell({ cell }: { cell: ChangeCell }) {
  const { t } = useTranslation()
  if (cell.key) {
    return <span className="text-sm font-medium text-text-quaternary">{t(cell.key)}</span>
  }
  return (
    <span
      className={[
        'text-sm text-text-secondary',
        cell.mono ? 'font-mono text-xs' : 'font-medium',
      ].join(' ')}
    >
      {cell.money ? (
        <span className="inline-flex items-baseline gap-1">
          <Rial />
          {cell.text}
        </span>
      ) : (
        cell.text
      )}
    </span>
  )
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
        {step}
      </span>
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-danger-700">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  )
}

function Row({
  label,
  value,
  danger,
  last,
}: {
  label: string
  value: string
  danger?: boolean
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">{label}</dt>
      <dd
        className={[
          'shrink-0 text-sm font-semibold',
          danger ? 'text-danger-700' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
