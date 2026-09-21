import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  ACTIVITY_PAGE_SIZE,
  activityListPath,
  activitySummaryPath,
  loadActivityList,
  loadActivitySummary,
  resubmitTdd,
  type ActivityItemDto,
  type ActivityListDto,
  type ActivitySummaryDto,
  type MlsAckDto,
} from '../../api/compliance/activity'
import {
  ACK_TONE,
  ACTIVITY_TABS,
  canResubmit,
  headlineOf,
  isActivityTab,
  shareOf,
  slaStateOf,
  type ActivityTabId,
} from '../../lib/activityLedger'
import { defaultReportRange } from '../../api/reports/reports'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatCount, formatInstant } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'

const ACK_CHIP: Record<MlsAckDto, string> = {
  AP: 'bg-success-100 text-success-700',
  AB: 'bg-primary-50 text-primary-800',
  RE: 'bg-danger-100 text-danger-700',
  // Neutral on purpose: silence is not a failure, and a warning colour here would read as one.
  NONE: 'bg-surface-background text-text-tertiary',
}

const SLA_TONE: Record<string, string> = {
  met: 'text-success-700',
  missed: 'text-danger-700',
  pending: 'text-text-tertiary',
  none: 'text-text-quaternary',
}

/**
 * Compliance › Activity — the ledger of what happened to each document.
 *
 * **Two legs, never merged.** The invoice leg is the receiving Access Point acknowledging the
 * document; the TDD leg is the tax authority endpoint acknowledging the tax data document. They
 * are different parties acknowledging different things and a single "status" column would lose
 * which one spoke.
 *
 * **Nothing here is a tax verdict.** `MlsAck` says so: C5 validates a TDD against the Schematron
 * "and not for Tax compliance" (SA v1.0.3 §7.1.2), and the OTA has no channel back to the
 * Service Provider (OTA FAQ 2026-08-31 §3.3 Q1). The prototype's "Accepted by the OTA" and "What
 * the OTA said" are gone: no such message is ever received, and a screen reporting one would
 * have a reader believe their tax position had been ruled on.
 *
 * **Silence is not rejection.** `NONE` is neutral, is counted separately from failures, and never
 * offers a resubmission — SPOG v1.0.0 §6.2 forbids resending "solely because no MLS has been
 * received". The resubmit action appears only where the server put a link.
 */
export function ActivityPage() {
  return (
    <AppShell>
      <ActivityLedger />
    </AppShell>
  )
}

function ActivityLedger() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const mayResubmit = can(session, 'invoice.submit')
  const [params, setParams] = useSearchParams()

  const tab: ActivityTabId = isActivityTab(params.get('tab')) ? (params.get('tab') as ActivityTabId) : 'all'
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const search = params.get('q') ?? ''

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (!value) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )

  const tabFilters = ACTIVITY_TABS.find((entry) => entry.id === tab)?.filters ?? {}
  const listPath = activityListPath({ ...tabFilters, invoiceNumber: search }, pageNumber - 1)
  const list = useApiRead<ActivityListDto>(listPath, () => loadActivityList(listPath))
  // The summary refuses a call with no window — 400, whatever the signature says the parameters
  // are. The ledger below is unwindowed and stays that way; only the counts above it need one.
  const summaryRange = defaultReportRange()
  const summaryPath = activitySummaryPath(summaryRange.from, summaryRange.to)
  const summary = useApiRead<ActivitySummaryDto>(summaryPath, () => loadActivitySummary(summaryPath))

  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const resubmit = async (item: ActivityItemDto) => {
    if (!item.links.resubmit) return
    setBusy(item.invoice_uuid)
    setFailure(null)
    try {
      await resubmitTdd(item.links.resubmit)
      setNotice(t('activity.resubmitted'))
      list.retry()
      summary.retry()
    } catch (error) {
      setNotice(null)
      const message = describeApiFailure(error)
      setFailure(t(message.key, message.values))
    } finally {
      setBusy(null)
    }
  }

  const totals = summary.read.status === 'ready' ? headlineOf(summary.read.data) : null
  const page = list.read.status === 'ready' ? list.read.data : null

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('activity.title')}</h1>
        <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('activity.ledgerSubtitle')}</p>
      </div>

      {notice ? <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}
      {failure ? (
        <Notice
          badge={t('supplierCreditNoteDetail.notDone')}
          body={failure}
          action={{ label: t('common.close'), onClick: () => setFailure(null) }}
        />
      ) : null}

      {summary.read.status === 'failed' ? <ApiReadFailure error={summary.read.error} retry={summary.retry} /> : null}

      {totals ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Figure label={t('activity.kpi.documents')} value={formatCount(totals.documents, language)} note={t('activity.kpi.documentsNote')} />
          <Figure
            label={t('activity.kpi.reported')}
            value={formatCount(totals.tddDelivered, language)}
            note={t('activity.kpi.reportedNote', { share: shareOf(totals.tddDelivered, totals.documents) })}
          />
          <Figure
            label={t('activity.kpi.waiting')}
            value={formatCount(totals.tddSilent, language)}
            // Said plainly, because the number looks alarming and is not: nothing has gone wrong
            // for a document whose acknowledgement has simply not arrived yet.
            note={t('activity.kpi.waitingNote')}
          />
          <Figure
            label={t('activity.kpi.onTime')}
            value={`${shareOf(totals.slaMet, totals.slaMet + totals.slaMissed)}%`}
            note={t('activity.kpi.onTimeNote', { missed: totals.slaMissed, pending: totals.slaPending })}
            tone={totals.slaMissed > 0 ? 'warn' : undefined}
          />
        </div>
      ) : null}

      <section className="rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
          {ACTIVITY_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === tab}
              onClick={() => update({ tab: entry.id === 'all' ? null : entry.id, page: null })}
              className={[
                'inline-flex h-[54px] items-center border-b-2 px-4 text-sm font-medium transition-colors',
                entry.id === tab
                  ? 'border-primary-700 text-primary-700'
                  : 'border-transparent text-text-quaternary hover:text-text-secondary',
              ].join(' ')}
            >
              {t(`activity.ledgerTabs.${entry.id}`)}
            </button>
          ))}
        </div>

        <div className="border-b border-surface-background p-4">
          <input
            type="search"
            value={search}
            onChange={(event) => update({ q: event.target.value, page: null })}
            placeholder={t('activity.searchByNumber')}
            aria-label={t('activity.searchByNumber')}
            className="h-[46px] w-full max-w-[320px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500"
          />
        </div>

        {list.read.status === 'loading' ? <LoadingNotice /> : null}
        {list.read.status === 'failed' ? <ApiReadFailure error={list.read.error} retry={list.retry} /> : null}

        {page ? (
          page.items.length === 0 ? (
            <p className="px-6 py-14 text-center text-sm font-medium text-text-quaternary">{t('activity.empty')}</p>
          ) : (
            <RowsView className="px-6 pb-6">
              <table className="w-full min-w-[980px] border-collapse text-start">
                <thead>
                  <tr className="border-b border-surface-background text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                    {(['document', 'counterparty', 'when', 'toBuyer', 'toAuthority', 'deadline'] as const).map((key) => (
                      <th key={key} className="px-3 py-3 text-start font-semibold">
                        {t(`activity.ledgerCol.${key}`)}
                      </th>
                    ))}
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((item) => (
                    <Row
                      key={item.invoice_uuid}
                      item={item}
                      language={language}
                      mayResubmit={mayResubmit}
                      busy={busy === item.invoice_uuid}
                      onResubmit={() => void resubmit(item)}
                    />
                  ))}
                </tbody>
              </table>
            </RowsView>
          )
        ) : null}

        {page && (pageNumber > 1 || page.has_more) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background p-4">
            <p className="text-xs font-medium text-text-quaternary">
              {t('activity.showingPage', { page: formatCount(pageNumber, language), size: ACTIVITY_PAGE_SIZE })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pageNumber <= 1}
                onClick={() => update({ page: String(pageNumber - 1) })}
                className="h-[40px] rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-50"
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={!page.has_more}
                onClick={() => update({ page: String(pageNumber + 1) })}
                className="h-[40px] rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-50"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <p className="text-xs font-medium leading-[1.5] text-text-quaternary">{t('activity.notATaxVerdict')}</p>
    </div>
  )
}

function Row({
  item,
  language,
  mayResubmit,
  busy,
  onResubmit,
}: {
  item: ActivityItemDto
  language: string
  mayResubmit: boolean
  busy: boolean
  onResubmit: () => void
}) {
  const { t } = useTranslation()
  const sla = slaStateOf(item)
  const offerResubmit = canResubmit(item) && mayResubmit

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-3 py-4 align-top">
        {/* Not a link: the detail endpoint exists (`/compliance/activity/{invoice_uuid}`) but no
            page is routed to it yet, and a link that resolves to nothing is worse than none. */}
        <span className="text-sm font-semibold text-text-primary">
          {item.invoice_number ?? t('activity.unnumbered')}
        </span>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {t(`activity.direction.${item.direction}`)}
          {item.b2c ? ` · ${t('activity.b2c')}` : ''}
        </p>
      </td>

      <td className="px-3 py-4 align-top text-sm font-medium text-text-secondary">{item.counterparty ?? '—'}</td>

      <td className="px-3 py-4 align-top text-sm font-medium text-text-tertiary">
        {formatInstant(item.occurred_at, language)}
      </td>

      {/* The two legs stay in their own columns. Merging them would lose which party spoke. */}
      <td className="px-3 py-4 align-top">
        <AckChip ack={item.invoice_leg.ack} reason={item.invoice_leg.reason} />
      </td>

      <td className="px-3 py-4 align-top">
        {item.tdd_leg ? (
          <AckChip ack={item.tdd_leg.ack} reason={item.tdd_leg.reason} />
        ) : (
          <span className="text-xs font-medium text-text-quaternary">{t('activity.noTdd')}</span>
        )}
      </td>

      <td className={['px-3 py-4 align-top text-sm font-medium', SLA_TONE[sla]].join(' ')}>
        {t(`activity.sla.${sla}`)}
      </td>

      <td className="px-3 py-4 align-top text-end">
        {offerResubmit ? (
          <button
            type="button"
            disabled={busy}
            onClick={onResubmit}
            className="h-[36px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary disabled:opacity-50"
          >
            {t(busy ? 'common.saving' : 'activity.resubmit')}
          </button>
        ) : null}
      </td>
    </tr>
  )
}

function AckChip({ ack, reason }: { ack: MlsAckDto; reason: string | null }) {
  const { t } = useTranslation()
  return (
    <>
      <span className={['inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', ACK_CHIP[ack]].join(' ')}>
        {t(`activity.ack.${ack}`)}
      </span>
      {reason ? <p className="mt-1 text-xs font-medium text-text-quaternary">{reason}</p> : null}
      <span className="sr-only">{t(`activity.ackMeaning.${ACK_TONE[ack]}`)}</span>
    </>
  )
}

function Figure({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'warn' }) {
  return (
    <article className="rounded-md bg-surface-card p-5">
      <p className="text-sm font-medium text-text-quaternary">{label}</p>
      <p className={['mt-1 text-[28px] font-semibold leading-[1.2] tabular-nums', tone === 'warn' ? 'text-warning-700' : 'text-text-secondary'].join(' ')}>
        {value}
      </p>
      <p className="mt-1 text-xs font-medium leading-[1.4] text-text-tertiary">{note}</p>
    </article>
  )
}
