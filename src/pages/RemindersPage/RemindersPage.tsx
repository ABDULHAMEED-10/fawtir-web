import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { loadReminderLog, reminderLogPath, type ReminderLogDto, type ReminderOutcome } from '../../api/invoices/reminders'
import { formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { OUTCOME_TONE, REMINDER_TABS, outcomeNote, hasMorePages, rangeProblem, rungNote, type ReminderTabId } from '../../lib/paymentReminders'

const PAGE_SIZE = 20

const TONE: Record<'ok' | 'warn' | 'muted', string> = {
  ok: 'text-text-secondary',
  warn: 'text-warning-700',
  muted: 'text-text-quaternary',
}

const FIELD = 'h-[46px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Income › Reminders (I-14).
 *
 * **Not a queue.** The API has a past-tense ledger and nothing else: there is no upcoming-sends
 * endpoint, no "next reminder due" field, and nothing to pause or cancel in advance — so the page
 * is the history of what actually fired. What *would* go out today is answered per invoice, by
 * preview, on the invoice's own page.
 *
 * The log answers a bare array with no total, so paging is one page at a time and the page says so
 * rather than drawing a page count it cannot know.
 */
export function RemindersPage() {
  // The session lives inside AppShell (see PaymentRemindersPage), so the body is its own component.
  return (
    <AppShell>
      <ReminderHistory />
    </AppShell>
  )
}

function ReminderHistory() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManageSettings = can(session, 'admin.settings.manage')

  const [tab, setTab] = useState<ReminderTabId>('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)

  const badRange = rangeProblem(from, to)
  // The server refuses `from` after `to`; asking anyway would trade a usable page for a 400.
  const path = badRange
    ? null
    : reminderLogPath({
        from: from || null,
        to: to || null,
        outcome: tab === 'ALL' ? null : (tab as ReminderOutcome),
        page,
        pageSize: PAGE_SIZE,
      })
  const log = useApiRead<ReminderLogDto[]>(path, () => loadReminderLog(path as string))

  const rows = log.read.status === 'ready' ? log.read.data : []
  const more = hasMorePages(rows, PAGE_SIZE)

  const narrow = (change: () => void) => {
    setPage(0)
    change()
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[720px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('paymentReminders.history.title')}</h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('paymentReminders.history.subtitle')}</p>
        </div>
        {canManageSettings ? (
          <Link
            to="/income/reminders/settings"
            className="inline-flex h-[46px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
          >
            {t('paymentReminders.history.settings')}
          </Link>
        ) : null}
      </div>

      <section className="rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
          {REMINDER_TABS.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={entry === tab}
              onClick={() => narrow(() => setTab(entry))}
              className={[
                'inline-flex h-[54px] items-center border-b-2 px-4 text-sm font-medium transition-colors',
                entry === tab ? 'border-primary-700 text-primary-700' : 'border-transparent text-text-quaternary hover:text-text-secondary',
              ].join(' ')}
            >
              {t(`paymentReminders.tab.${entry}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3 border-b border-surface-background p-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-quaternary">
            {t('paymentReminders.history.from')}
            <input type="date" value={from} onChange={(event) => narrow(() => setFrom(event.target.value))} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-quaternary">
            {t('paymentReminders.history.to')}
            <input type="date" value={to} onChange={(event) => narrow(() => setTo(event.target.value))} className={FIELD} />
          </label>
          {from || to || tab !== 'ALL' ? (
            <button
              type="button"
              onClick={() => narrow(() => { setFrom(''); setTo(''); setTab('ALL') })}
              className="h-[46px] rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
            >
              {t('paymentReminders.history.clear')}
            </button>
          ) : null}
          {badRange ? (
            <p role="alert" className="text-sm font-medium text-warning-700">{t('paymentReminders.error.range')}</p>
          ) : null}
        </div>

        {log.read.status === 'loading' ? <LoadingNotice /> : null}
        {log.read.status === 'failed' ? <ApiReadFailure error={log.read.error} retry={log.retry} /> : null}

        {log.read.status === 'ready' ? (
          rows.length === 0 ? (
            <p className="px-6 py-14 text-center text-sm font-medium text-text-quaternary">
              {t(page === 0 ? 'paymentReminders.history.empty' : 'paymentReminders.history.emptyPage')}
            </p>
          ) : (
            <RowsView>
              <table className="w-full min-w-[880px] border-collapse">
                <thead>
                  <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                    {(['invoice', 'rung', 'firedOn', 'recipient', 'outcome'] as const).map((key) => (
                      <th key={key} className="px-5 py-3 text-start font-semibold">
                        {t(`paymentReminders.col.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const note = outcomeNote(row)
                    const rung = rungNote(row.daysFromDue)
                    return (
                      <tr key={`${row.invoiceId}-${row.daysFromDue}`} className="border-b border-surface-background last:border-0">
                        <td className="px-5 py-4 align-top">
                          <Link to={`/invoices/${row.invoiceId}`} className="text-sm font-semibold text-primary-700 hover:underline">
                            {row.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">{t(rung.key, rung.values)}</td>
                        <td className="px-5 py-4 align-top text-sm font-medium text-text-secondary">{formatDate(row.firedOn, language)}</td>
                        <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">{row.recipient}</td>
                        <td className={['px-5 py-4 align-top text-sm font-medium', TONE[OUTCOME_TONE[row.outcome]]].join(' ')}>
                          {t(note.key, note.values)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </RowsView>
          )
        ) : null}

        {log.read.status === 'ready' && (page > 0 || more) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background p-4">
            <p className="text-xs font-medium text-text-quaternary">{t('paymentReminders.history.noTotal')}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                className="h-[40px] rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-50"
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={!more}
                onClick={() => setPage(page + 1)}
                className="h-[40px] rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-50"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <p className="text-xs font-medium leading-[1.5] text-text-quaternary">{t('paymentReminders.history.sweepNote')}</p>
    </div>
  )
}
