import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  PERIODIC_SCHEDULES_PATH,
  loadPeriodicSchedules,
  setPeriodicActive,
  type PeriodicScheduleDto,
} from '../../api/invoices/periodic'
import { customerListPath, loadCustomerPage, type CustomerDto } from '../../api/customers/customers'
import type { Page } from '../../api'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { PERIODIC_TABS, narrowSchedules, periodicCounts, scheduleNote, scheduleTone, type PeriodicTabId } from '../../lib/periodicInvoice'
import searchIcon from '../../assets/invoices/search.svg'
import plusIcon from '../../assets/invoices/plus.svg'

const TONE: Record<'warn' | 'ok' | 'muted', string> = {
  warn: 'text-warning-700',
  ok: 'text-text-secondary',
  muted: 'text-text-quaternary',
}

/** The customers list refuses a page over 100, so names are read a hundred at a time. */
const CUSTOMER_PAGE_SIZE = 100

const muscatToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

/**
 * Income › Periodic invoices (I-13).
 *
 * Each schedule copies one invoice on a cadence and raises a **draft** for someone to check and
 * issue. The API answers a bare array — no paging, no totals, no filters — so the tabs, the search
 * and the three counts are all computed from the list in hand, and the page says so.
 */
export function PeriodicInvoicesPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'invoice.draft')
  const today = muscatToday()
  const [tab, setTab] = useState<PeriodicTabId>('active')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<{ key: string } | { body: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const schedules = useApiRead<PeriodicScheduleDto[]>(PERIODIC_SCHEDULES_PATH, loadPeriodicSchedules)
  // The schedule carries a customer id and nothing else, so the names come from the customers list.
  const customersPath = customerListPath({ type: null, search: '', sort: 'NAME_ASC', page: 0, size: CUSTOMER_PAGE_SIZE })
  const customers = useApiRead<Page<CustomerDto>>(customersPath, () => loadCustomerPage(customersPath))

  const rows = schedules.read.status === 'ready' ? schedules.read.data : []
  const names = new Map((customers.read.status === 'ready' ? customers.read.data.items : []).map((row) => [row.id, row.displayName]))
  const nameOf = (customerId: string) => names.get(customerId)
  const counts = periodicCounts(rows, today)
  const visible = narrowSchedules(rows, tab, search, nameOf)

  const toggle = async (schedule: PeriodicScheduleDto) => {
    setNotice(null)
    setBusy(schedule.id)
    try {
      const saved = await setPeriodicActive(schedule.id, !schedule.active)
      schedules.retry()
      setNotice(
        schedule.active
          ? { key: 'periodicList.done.paused' }
          : { body: t('periodicList.done.resumed', { date: formatDate(saved.nextRunDate, language) }) },
      )
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
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('periodicList.title')}</h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('periodicList.subtitle')}</p>
          </div>
          {canManage ? (
            <Link
              to="/income/periodic/new"
              className="inline-flex h-[46px] shrink-0 items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
              {t('periodicList.add')}
            </Link>
          ) : null}
        </div>

        {schedules.read.status === 'ready' ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Count label={t('periodicList.count.schedules')} value={counts.total} note={t('periodicList.count.schedulesNote', { count: counts.paused })} />
            <Count label={t('periodicList.count.active')} value={counts.active} note={t('periodicList.count.activeNote')} />
            <Count label={t('periodicList.count.dueSoon')} value={counts.dueSoon} note={t('periodicList.count.dueSoonNote')} />
          </div>
        ) : null}

        {notice ? <Notice body={'key' in notice ? t(notice.key) : notice.body} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

        <section className="rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
            {PERIODIC_TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={entry === tab}
                onClick={() => setTab(entry)}
                className={[
                  'inline-flex h-[54px] items-center border-b-2 px-4 text-sm font-medium transition-colors',
                  entry === tab ? 'border-primary-700 text-primary-700' : 'border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(`periodicList.tab.${entry}`)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-surface-background p-4">
            <label className="relative block min-w-[240px] flex-1">
              <span className="sr-only">{t('periodicList.searchPlaceholder')}</span>
              <img src={searchIcon} alt="" className="pointer-events-none absolute start-3 top-3.5 size-5" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('periodicList.searchPlaceholder')}
                className="h-[46px] w-full rounded-sm border border-border-subtle bg-white ps-10 pe-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500"
              />
            </label>
            <p className="text-xs font-medium text-text-quaternary">{t('periodicList.narrowsThisList')}</p>
          </div>

          {schedules.read.status === 'loading' ? <LoadingNotice /> : null}
          {schedules.read.status === 'failed' ? <ApiReadFailure error={schedules.read.error} retry={schedules.retry} /> : null}

          {schedules.read.status === 'ready' ? (
            visible.length === 0 ? (
              <p className="px-6 py-14 text-center text-sm font-medium text-text-quaternary">{t('periodicList.empty')}</p>
            ) : (
              <RowsView>
                <table className="w-full min-w-[880px] border-collapse">
                  <thead>
                    <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                      {(['customer', 'howOften', 'nextDraft', 'state', 'left'] as const).map((key) => (
                        <th key={key} className="px-5 py-3 text-start font-semibold">
                          {t(`periodicList.col.${key}`)}
                        </th>
                      ))}
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((schedule) => {
                      const note = scheduleNote(schedule, today)
                      return (
                        <tr key={schedule.id} className="border-b border-surface-background last:border-0">
                          <td className="px-5 py-4 align-top">
                            <Link to={`/income/periodic/${schedule.id}`} className="text-sm font-semibold text-primary-700 hover:underline">
                              {nameOf(schedule.customerId) ?? t('periodicList.unknownCustomer')}
                            </Link>
                            <p className="mt-1 text-xs font-medium text-text-quaternary">{t(`periodicList.subtype.${schedule.transactionSubtype}`)}</p>
                          </td>
                          <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">{t(`periodicList.interval.${schedule.interval}`)}</td>
                          <td className="px-5 py-4 align-top text-sm font-medium text-text-secondary">{formatDate(schedule.nextRunDate, language)}</td>
                          <td className={['px-5 py-4 align-top text-sm font-medium', TONE[scheduleTone(schedule, today)]].join(' ')}>
                            {t(note.key, note.values ? { ...note.values, date: note.values.date ? formatDate(String(note.values.date), language) : undefined } : undefined)}
                          </td>
                          <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">
                            {schedule.remainingOccurrences === null ? t('periodicList.noLimit') : t('periodicList.leftCount', { count: schedule.remainingOccurrences })}
                          </td>
                          <td className="px-5 py-4 align-top text-end">
                            {canManage ? (
                              <button
                                type="button"
                                disabled={busy === schedule.id}
                                onClick={() => void toggle(schedule)}
                                className="text-sm font-semibold text-text-quaternary hover:text-primary-700 disabled:opacity-50"
                              >
                                {t(schedule.active ? 'periodicList.menu.pause' : 'periodicList.menu.resume')}
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
        </section>

        <p className="text-xs font-medium leading-[1.5] text-text-quaternary">{t('periodicList.sweepNote')}</p>
      </div>
    </AppShell>
  )
}

function Count({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article className="rounded-md bg-surface-card p-5">
      <h2 className="text-sm font-medium text-text-tertiary">{label}</h2>
      <p className="mt-2 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">{value}</p>
      <p className="mt-2 text-sm font-medium text-text-quaternary">{note}</p>
    </article>
  )
}
