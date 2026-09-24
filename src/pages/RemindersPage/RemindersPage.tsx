import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  loadReminderLog,
  reminderLogPath,
  type ReminderLogDto,
  type ReminderOutcome,
} from '../../api/invoices/reminders'
import { formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import {
  REMINDER_TABS,
  outcomeNote,
  hasMorePages,
  rangeProblem,
  rungNote,
  type ReminderTabId,
} from '../../lib/paymentReminders'
import settingsIcon from '../../assets/reminders/edit-template.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import bellIcon from '../../assets/reminders/kpi-going-out.svg'

const PAGE_SIZE = 20

/** Outcome pills, in the list convention: a dot and a tinted fill. */
const OUTCOME_STYLES: Record<ReminderOutcome, string> = {
  SENT: 'bg-success-100 text-success-700',
  FAILED: 'bg-danger-100 text-danger-700',
  SKIPPED: 'bg-neutral-25 text-neutral-700',
}

/**
 * Income › Reminders (I-14).
 *
 * **Not a queue.** The API has a past-tense ledger and nothing else: there is no upcoming-sends
 * endpoint, no "next reminder due" field, and nothing to pause or cancel in advance — so the page
 * is the history of what actually fired. What *would* go out today is answered per invoice, by
 * preview, on the invoice's own page. The design's "Reminder" card (Figma 154:168196) is that
 * per-invoice card; this list keeps the app's list conventions around the ledger.
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[720px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('paymentReminders.history.title')}
          </h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('paymentReminders.history.subtitle')}
          </p>
        </div>
        {canManageSettings ? (
          <Link
            to="/income/reminders/settings"
            className="inline-flex h-[46px] shrink-0 items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
          >
            <img src={settingsIcon} alt="" className="size-6" />
            {t('paymentReminders.history.settings')}
          </Link>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
          {REMINDER_TABS.map((entry) => {
            const active = entry === tab
            return (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => narrow(() => setTab(entry))}
                className={[
                  'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(`paymentReminders.tab.${entry}`)}
                {active ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" />
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3 px-6 py-3.5">
          <div className="w-full max-w-[200px] max-md:max-w-none">
            <span className="mb-1 block text-xs font-semibold text-text-quaternary">
              {t('paymentReminders.history.from')}
            </span>
            <DateField
              value={from}
              max={to || undefined}
              ariaLabel={t('paymentReminders.history.from')}
              placeholder={t('paymentReminders.history.anyDate')}
              onChange={(value) => narrow(() => setFrom(value))}
            />
          </div>
          <div className="w-full max-w-[200px] max-md:max-w-none">
            <span className="mb-1 block text-xs font-semibold text-text-quaternary">
              {t('paymentReminders.history.to')}
            </span>
            <DateField
              value={to}
              ariaLabel={t('paymentReminders.history.to')}
              placeholder={t('paymentReminders.history.anyDate')}
              onChange={(value) => narrow(() => setTo(value))}
            />
          </div>
          {from || to || tab !== 'ALL' ? (
            <button
              type="button"
              onClick={() =>
                narrow(() => {
                  setFrom('')
                  setTo('')
                  setTab('ALL')
                })
              }
              className="inline-flex h-[50px] items-center rounded-sm border border-border-subtle bg-surface-tab-bar px-4 text-sm font-semibold text-text-tertiary hover:bg-white"
            >
              {t('paymentReminders.history.clear')}
            </button>
          ) : null}
          {badRange ? (
            <p role="alert" className="pb-3 text-sm font-medium text-warning-700">
              {t('paymentReminders.error.range')}
            </p>
          ) : null}
        </div>

        {log.read.status === 'loading' ? <LoadingNotice /> : null}
        {log.read.status === 'failed' ? (
          <div className="px-6 pb-5">
            <ApiReadFailure error={log.read.error} retry={log.retry} />
          </div>
        ) : null}

        {log.read.status === 'ready' ? (
          <RowsView>
            <table className="w-full min-w-[880px] border-collapse text-start">
              <thead>
                <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                  {(['invoice', 'rung', 'firedOn', 'recipient', 'outcome'] as const).map(
                    (key, index) => (
                      <th
                        key={key}
                        className={[
                          'py-2.5 text-start font-semibold',
                          index === 0 ? 'ps-6 pe-2' : 'px-2',
                        ].join(' ')}
                      >
                        {t(`paymentReminders.col.${key}`)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-sm font-medium text-text-quaternary"
                    >
                      {t(
                        page === 0
                          ? 'paymentReminders.history.empty'
                          : 'paymentReminders.history.emptyPage',
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const note = outcomeNote(row)
                    const rung = rungNote(row.daysFromDue)
                    return (
                      <tr
                        key={`${row.invoiceId}-${row.daysFromDue}-${row.firedOn}`}
                        className="border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                      >
                        <td className="ps-6 pe-2 py-2.5">
                          <Link
                            to={`/invoices/${row.invoiceId}`}
                            className="text-sm font-semibold text-text-primary hover:text-primary-700 hover:underline"
                          >
                            {row.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-background">
                              <img src={bellIcon} alt="" className="size-[18px]" />
                            </span>
                            <span className="text-sm font-medium text-text-secondary">
                              {t(rung.key, rung.values)}
                            </span>
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-sm font-medium text-text-tertiary">
                          {formatDate(row.firedOn, language)}
                        </td>
                        <td className="px-2 py-2.5 text-sm font-medium text-text-tertiary">
                          {row.recipient}
                        </td>
                        <td className="px-2 py-2.5">
                          <span
                            className={[
                              'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-medium',
                              OUTCOME_STYLES[row.outcome],
                            ].join(' ')}
                          >
                            <span className="size-1.5 shrink-0 rounded-full bg-current" />
                            {t(`paymentReminders.pill.${row.outcome}`)}
                          </span>
                          {row.outcome !== 'SENT' ? (
                            <p className="mt-1 max-w-[320px] text-xs font-medium leading-[1.3] text-text-tertiary">
                              {t(note.key, note.values)}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </RowsView>
        ) : null}

        {log.read.status === 'ready' && (page > 0 || more) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <p className="text-xs font-medium text-text-quaternary">
              {t('paymentReminders.history.noTotal')}
            </p>
            <nav
              aria-label={t('paymentReminders.history.pages')}
              className="flex items-center gap-1"
            >
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label={t('common.previous')}
                className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
              >
                <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
              </button>
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary-25 text-base font-extrabold text-primary-700">
                {page + 1}
              </span>
              <button
                type="button"
                disabled={!more}
                onClick={() => setPage(page + 1)}
                aria-label={t('common.next')}
                className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
              >
                <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
              </button>
            </nav>
          </div>
        ) : null}
      </section>

      <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
        {t('paymentReminders.history.sweepNote')}
      </p>
    </div>
  )
}
