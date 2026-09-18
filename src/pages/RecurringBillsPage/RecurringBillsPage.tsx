import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { OmAmount, RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  loadRecurringPage,
  loadRecurringSummary,
  recurringListPath,
  recurringSummaryPath,
  setRecurringActive,
  type RecurringBillDto,
  type RecurringBillPageDto,
  type RecurringListState,
  type RecurringSummaryDto,
} from '../../api/expenditure/recurringBills'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { RECURRING_TABS, categoriesOf, hasMore, narrow, stateNote, toneOf } from '../../lib/recurringBills'
import searchIcon from '../../assets/invoices/search.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'

const TONE: Record<'warn' | 'ok' | 'muted', string> = {
  warn: 'text-warning-700',
  ok: 'text-success-700',
  muted: 'text-text-quaternary',
}

const FIELD = 'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Expenditure › Recurring bills (E-12): the bills that come round again.
 *
 * The API filters by state and pages by look-ahead — a full page may have more behind it, and
 * there is no total — so the search box and the category narrow the page in hand and the page
 * says so rather than claiming a count it cannot know.
 */
export function RecurringBillsPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'invoice.payment.manage')
  const [tab, setTab] = useState<RecurringListState>('ACTIVE')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [notice, setNotice] = useState<{ key: string } | { body: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const listPath = recurringListPath(tab, page)
  const list = useApiRead<RecurringBillPageDto>(listPath, () => loadRecurringPage(listPath))
  const summaryPath = recurringSummaryPath()
  const summary = useApiRead<RecurringSummaryDto>(summaryPath, () => loadRecurringSummary(summaryPath))

  const data = list.read.status === 'ready' ? list.read.data : null
  const totals = summary.read.status === 'ready' ? summary.read.data : null
  const items = data ? narrow(data.items, search, category) : []
  const categories = data ? categoriesOf(data.items) : []

  const choose = (next: RecurringListState) => {
    setPage(0)
    setTab(next)
  }

  const toggle = async (bill: RecurringBillDto) => {
    setNotice(null)
    setBusy(bill.id)
    try {
      await setRecurringActive(bill.id, !bill.active)
      list.retry()
      summary.retry()
      setNotice({ key: bill.active ? 'recurringBills.done.paused' : 'recurringBills.done.resumed' })
    } catch (error) {
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setNotice({ body: message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body })
    } finally {
      setBusy(null)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[720px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('recurringBills.title')}</h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('recurringBills.subtitle')}</p>
          </div>
          {canManage ? (
            <Link
              to="/expenditure/recurring-bills/new"
              className="inline-flex h-[46px] shrink-0 items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
              {t('recurringBills.add')}
            </Link>
          ) : null}
        </div>

        {totals ? (
          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-md bg-surface-card p-5">
              <h2 className="text-sm font-medium text-text-tertiary">{t('recurringBills.kpi.expected')}</h2>
              <OmAmount
                size="md"
                amount={formatAmount(totals.expectedMonthly, totals.currencyCode, language)}
                className="mt-2"
                amountClassName="text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums"
              />
              <p className="mt-2 text-sm font-medium text-text-quaternary">
                {t('recurringBills.kpi.expectedMeta', { count: totals.recurringCount, active: totals.activeCount })}
              </p>
            </article>
            <article className="rounded-md bg-surface-card p-5">
              <h2 className="text-sm font-medium text-text-tertiary">{t('recurringBills.kpi.late')}</h2>
              <p className="mt-2 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">{totals.lateCount}</p>
              <p className="mt-2 text-sm font-medium text-text-quaternary">{totals.lateDescription ?? t('recurringBills.kpi.noneLate')}</p>
              {totals.lateCount > 0 ? (
                <button type="button" onClick={() => choose('LATE')} className="mt-2 text-sm font-semibold text-primary-800 hover:text-primary-700">
                  {t('recurringBills.kpi.seeLate')}
                </button>
              ) : null}
            </article>
            <article className="rounded-md bg-surface-card p-5">
              <h2 className="text-sm font-medium text-text-tertiary">{t('recurringBills.kpi.next')}</h2>
              <p className="mt-2 text-[28px] font-semibold leading-[1.2] text-text-primary">
                {totals.arrivingNext ? formatDate(totals.arrivingNext, language) : '—'}
              </p>
              <p className="mt-2 text-sm font-medium text-text-quaternary">{totals.arrivingNextDescription ?? t('recurringBills.kpi.noneComing')}</p>
            </article>
          </div>
        ) : null}

        {notice ? <Notice body={'key' in notice ? t(notice.key) : notice.body} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

        <section className="rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
            {RECURRING_TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={entry === tab}
                onClick={() => choose(entry)}
                className={[
                  'inline-flex h-[54px] items-center px-4 text-sm font-medium transition-colors border-b-2',
                  entry === tab ? 'border-primary-700 text-primary-700' : 'border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(`recurringBills.tab.${entry}`)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-surface-background p-4">
            <label className="relative block min-w-[240px] flex-1">
              <span className="sr-only">{t('recurringBills.searchPlaceholder')}</span>
              <img src={searchIcon} alt="" className="pointer-events-none absolute start-3 top-3.5 size-5" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('recurringBills.searchPlaceholder')} className={`${FIELD} ps-10`} />
            </label>
            <label className="block min-w-[200px]">
              <span className="sr-only">{t('recurringBills.categoryFilter')}</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className={FIELD} aria-label={t('recurringBills.categoryFilter')}>
                <option value="">{t('recurringBills.allCategories')}</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs font-medium text-text-quaternary">{t('recurringBills.narrowsThisPage')}</p>
          </div>

          {list.read.status === 'loading' ? <LoadingNotice /> : null}
          {list.read.status === 'failed' ? <ApiReadFailure error={list.read.error} retry={list.retry} /> : null}

          {data ? (
            items.length === 0 ? (
              <p className="px-6 py-14 text-center text-sm font-medium text-text-quaternary">{t('recurringBills.empty')}</p>
            ) : (
              <RowsView>
                <table className="w-full min-w-[900px] border-collapse">
                  <thead>
                    <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                      {(['what', 'supplier', 'howOften', 'state', 'amount'] as const).map((key) => (
                        <th key={key} className={['px-5 py-3 font-semibold', key === 'amount' ? 'text-end' : 'text-start'].join(' ')}>
                          {t(`recurringBills.col.${key}`)}
                        </th>
                      ))}
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((bill) => {
                      const note = stateNote(bill)
                      return (
                        <tr key={bill.id} className="border-b border-surface-background last:border-0">
                          <td className="px-5 py-4 align-top">
                            <Link to={`/expenditure/recurring-bills/${bill.id}`} className="text-sm font-semibold text-primary-700 hover:underline">
                              {bill.description}
                            </Link>
                            <p className="mt-1 text-xs font-medium text-text-quaternary">
                              {t(`recurringBills.mode.${bill.mode}`)}
                              {bill.category ? ` · ${bill.category}` : ''}
                            </p>
                          </td>
                          <td className="px-5 py-4 align-top text-sm font-medium text-text-secondary">{bill.supplierName}</td>
                          <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">{t(`recurringBills.interval.${bill.interval}`)}</td>
                          <td className={['px-5 py-4 align-top text-sm font-medium', TONE[toneOf(bill)]].join(' ')}>
                            {t(note.key, note.values ? { ...note.values, date: note.values.date ? formatDate(String(note.values.date), language) : undefined } : undefined)}
                          </td>
                          <td className="px-5 py-4 align-top text-end text-sm font-semibold text-text-primary tabular-nums">
                            {formatAmount(bill.totalIncludingVat, bill.currencyCode, language)}
                          </td>
                          <td className="px-5 py-4 align-top text-end">
                            {canManage ? (
                              <button
                                type="button"
                                disabled={busy === bill.id}
                                onClick={() => void toggle(bill)}
                                className="text-sm font-semibold text-text-quaternary hover:text-primary-700 disabled:opacity-50"
                              >
                                {t(bill.active ? 'recurringBills.menu.pause' : 'recurringBills.menu.resume')}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </RowsView>
            )
          ) : null}

          {data ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
              <p className="text-sm font-medium text-text-quaternary">{t('recurringBills.showing', { count: items.length })}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(current - 1, 0))}
                  className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary disabled:opacity-40"
                >
                  {t('recurringBills.previousPage')}
                </button>
                <button
                  type="button"
                  disabled={!hasMore(data)}
                  onClick={() => setPage((current) => current + 1)}
                  className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary disabled:opacity-40"
                >
                  {t('recurringBills.nextPage')}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <p className="text-xs font-medium leading-[1.5] text-text-quaternary">{t('recurringBills.sweepNote')}</p>
      </div>
    </AppShell>
  )
}
