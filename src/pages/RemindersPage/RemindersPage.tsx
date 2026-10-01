import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  FilterMenu,
  OmAmount,
  Pager,
  RowsView,
  Select,
  SortMenu,
  TableCheckbox,
} from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import {
  saveReminderSchedule,
  type ReminderLogDto,
  type ReminderOutcome,
} from '../../api/invoices/reminders'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import {
  QUEUE_REASON_NOTE,
  QUEUE_TABS,
  addDays,
  logLocaleKey,
  normaliseOffsets,
  outcomeNote,
  paidAfterReminder,
  rungNote,
  stepOf,
  type QueueEntry,
  type QueueTabId,
} from '../../lib/paymentReminders'
import { useReminderQueue } from './useReminderQueue'
import { PauseRemindersModal, SendReminderModal, TONE_CHIP } from './ReminderModals'
import kpiGoingOutIcon from '../../assets/reminders/kpi-going-out.svg'
import kpiOverdueIcon from '../../assets/reminders/kpi-overdue.svg'
import kpiPaidIcon from '../../assets/reminders/kpi-paid.svg'
import pauseIcon from '../../assets/reminders/pause.svg'
import sendIcon from '../../assets/reminders/send.svg'
import sendWhiteIcon from '../../assets/reminders/send-white.svg'
import settingsIcon from '../../assets/reminders/edit-template.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/credit-notes/filter.svg'
import clockIcon from '../../assets/periodic/clock.svg'

const PAGE_SIZES = [5, 10, 25]
const DEFAULT_PAGE_SIZE = 5
/** The daily sweep's hour, a deployment setting: shown, never chosen. */
const SWEEP_HOUR = '08:00'

const muscatToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

const OUTCOME_STYLES: Record<ReminderOutcome, string> = {
  SENT: 'bg-success-100 text-success-700',
  FAILED: 'bg-danger-100 text-danger-700',
  SKIPPED: 'bg-neutral-25 text-neutral-700',
}

type SortId = 'soonest' | 'amount' | 'customer'

/**
 * Income › Reminders (I-14, Figma 159:17137): the queue of what is about to go out, what went
 * out, what is paused and what is not being chased.
 *
 * The API has a ladder and a past-tense log, no queue: so the queue is worked out here from the
 * unpaid invoices, the ladder and the rungs already spent (`useReminderQueue`). What that cannot
 * give, the page says: there is no 24-hour hold and no cancel (the sweep sends on the day, at
 * 08:00 Muscat time), and "pause" exists for the whole schedule only. TODO(backend): a queue
 * endpoint with hold, cancel and per-invoice pause.
 */
export function RemindersPage() {
  // The session lives inside AppShell, so the body is its own component.
  return (
    <AppShell>
      <ReminderQueue />
    </AppShell>
  )
}

function ReminderQueue() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManageSettings = can(session, 'admin.settings.manage')
  const canSend = can(session, 'invoice.payment.manage')
  const today = muscatToday()
  const tomorrow = addDays(today, 1)

  const data = useReminderQueue(canManageSettings, today)
  const { ladder, queue, logRows, rows } = data
  const enabled = ladder?.enabled ?? true
  const offsets = ladder ? normaliseOffsets(ladder.offsets) : []

  const [tab, setTab] = useState<QueueTabId>('scheduled')
  const [search, setSearch] = useState('')
  const [step, setStep] = useState('all')
  const [outcome, setOutcome] = useState<'all' | ReminderOutcome>('all')
  const [sort, setSort] = useState<SortId>('soonest')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE)
  const [selected, setSelected] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState<QueueEntry | null | 'pick'>(null)
  const [pausing, setPausing] = useState<QueueEntry | null>(null)

  const narrow = (change: () => void) => {
    setPage(1)
    change()
  }

  const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const scheduled = queue.filter((entry) => entry.next !== null)
  const notSending = queue.filter((entry) => entry.next === null)
  const counts: Record<QueueTabId, number> = {
    scheduled: enabled ? scheduled.length : 0,
    sent: logRows.length,
    paused: enabled ? 0 : scheduled.length,
    notSending: notSending.length,
  }

  const matches = (entry: QueueEntry) => {
    const text = search.trim().toLowerCase()
    if (text) {
      const hay = [entry.invoice.invoiceNumber, entry.invoice.customerName, entry.email]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .toLowerCase()
      if (!hay.includes(text)) return false
    }
    if (step !== 'all' && entry.next && stepOf(offsets, entry.next.offset).index !== Number(step))
      return false
    return true
  }
  const sortEntries = (entries: QueueEntry[]) =>
    [...entries].sort((a, b) => {
      if (sort === 'amount') return (b.invoice.outstanding ?? 0) - (a.invoice.outstanding ?? 0)
      if (sort === 'customer')
        return (a.invoice.customerName ?? '').localeCompare(b.invoice.customerName ?? '')
      return (a.next?.date ?? a.invoice.dueDate ?? '').localeCompare(
        b.next?.date ?? b.invoice.dueDate ?? '',
      )
    })
  const logMatches = (row: ReminderLogDto) => {
    const text = search.trim().toLowerCase()
    const invoice = byId.get(row.invoiceId)
    if (outcome !== 'all' && row.outcome !== outcome) return false
    if (!text) return true
    return [row.invoiceNumber, invoice?.customerName, row.recipient]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase()
      .includes(text)
  }

  const visibleEntries =
    tab === 'scheduled'
      ? enabled
        ? sortEntries(scheduled.filter(matches))
        : []
      : tab === 'paused'
        ? enabled
          ? []
          : sortEntries(scheduled.filter(matches))
        : tab === 'notSending'
          ? sortEntries(notSending.filter(matches))
          : []
  const visibleLog = tab === 'sent' ? logRows.filter(logMatches) : []
  const total = tab === 'sent' ? visibleLog.length : visibleEntries.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(page, pageCount)
  const slice = <T,>(items: T[]) => items.slice((current - 1) * size, current * size)
  const shownEntries = slice(visibleEntries)
  const shownLog = slice(visibleLog)
  const shownIds =
    tab === 'sent'
      ? shownLog.map((row) => `${row.invoiceId}:${row.daysFromDue}`)
      : shownEntries.map((entry) => entry.invoice.id)
  const allOnPage = shownIds.length > 0 && shownIds.every((id) => selected.includes(id))
  const someOnPage = !allOnPage && shownIds.some((id) => selected.includes(id))

  // The four figures, from what the page holds.
  const goingOut = scheduled.filter((entry) => entry.next?.date === tomorrow).length
  const chased = queue.filter((entry) => entry.invoice.overdue && entry.spent.length > 0)
  const chasedAmount = chased.reduce((sum, entry) => sum + (entry.invoice.outstanding ?? 0), 0)
  const paid = paidAfterReminder(rows, logRows, today)

  const fail = (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice(
      message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
    )
  }

  /** The design's "Pause everything": the schedule's own switch, the one pause the API has. */
  const pauseEverything = async (nextEnabled: boolean) => {
    if (!ladder || busy) return
    setBusy(true)
    setNotice(null)
    try {
      await saveReminderSchedule({ offsets: ladder.offsets, enabled: nextEnabled })
      data.schedule.retry()
      setNotice(t(nextEnabled ? 'reminders.queue.resumedAll' : 'reminders.queue.pausedAll'))
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const sendingLabel = (entry: QueueEntry) => {
    if (!entry.next) return t('reminders.queue.notSending')
    if (entry.next.date === today) return t('reminders.queue.today')
    if (entry.next.date === tomorrow) return t('reminders.queue.tomorrow')
    return formatDate(entry.next.date, language).replace(/\s\d{4}$/, '')
  }
  const sendingNote = (entry: QueueEntry) => {
    if (!entry.next) return t(QUEUE_REASON_NOTE[entry.reason ?? 'ladderSpent'])
    const days = Math.round(
      (Date.parse(`${entry.next.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
    )
    return `${t('reminders.queue.inDays', { count: days })} · ${SWEEP_HOUR}`
  }
  const invoiceNote = (entry: QueueEntry) =>
    entry.invoice.daysOverdue
      ? t('reminders.queue.overdueDays', { count: entry.invoice.daysOverdue })
      : entry.invoice.dueDate
        ? t('reminders.queue.dueOn', {
            date: formatDate(entry.invoice.dueDate, language).replace(/\s\d{4}$/, ''),
          })
        : t('reminders.queue.reason.noDueDate')

  const stepPill = (offset: number) => {
    const found = stepOf(offsets, offset)
    const onLadder = offsets.includes(offset)
    return (
      <span
        className={[
          'inline-flex items-center gap-2 rounded-full py-[5px] pe-3 ps-1.5',
          TONE_CHIP[found.tone],
        ].join(' ')}
      >
        <span className="flex size-[18px] items-center justify-center rounded-full bg-white text-xs font-bold">
          {onLadder ? formatCount(found.index, language) : '·'}
        </span>
        <span className="text-sm font-medium leading-[1.2]">
          {onLadder ? t(found.nameKey) : t(rungNote(offset).key, rungNote(offset).values)}
        </span>
      </span>
    )
  }

  const kpis = [
    {
      id: 'goingOut',
      icon: kpiGoingOutIcon,
      disc: 'bg-primary-25',
      title: t('reminders.queue.kpi.goingOut'),
      value: formatCount(goingOut, language),
      note: t('reminders.queue.kpi.goingOutSweep', { hour: SWEEP_HOUR }),
    },
    {
      id: 'overdue',
      icon: kpiOverdueIcon,
      disc: 'bg-warning-100',
      title: t('reminders.queue.kpi.overdue'),
      amount: formatAmount(chasedAmount, 'OMR', language),
      note: t('reminders.queue.kpi.overdueAcross', { count: chased.length }),
    },
    {
      id: 'paid',
      icon: kpiPaidIcon,
      disc: 'bg-success-100',
      title: t('reminders.queue.kpi.paid'),
      value: formatCount(paid.paid, language),
      note: t('reminders.queue.kpi.paidLast30', { count: paid.sent }),
    },
    {
      id: 'paused',
      icon: pauseIcon,
      disc: 'bg-neutral-25',
      title: t('reminders.queue.kpi.paused'),
      value: formatCount(counts.paused, language),
      // TODO(backend): per-invoice and per-customer pauses; only the whole schedule pauses today.
      note: enabled
        ? t('reminders.queue.kpi.pausedNone')
        : t('reminders.queue.kpi.pausedAll', { count: counts.paused }),
    },
  ]

  const columns =
    tab === 'sent'
      ? (['sending', 'customer', 'invoice', 'whichReminder', 'amount', 'outcome'] as const)
      : (['sending', 'customer', 'invoice', 'whichReminder', 'amount', 'actions'] as const)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[550px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('reminders.queue.title')}
          </h1>
          <p className="mt-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">
            {t('reminders.queue.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/income/reminders/settings"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
          >
            <img src={settingsIcon} alt="" className="size-6" />
            {t('reminders.queue.scheduleSettings')}
          </Link>
          {canSend ? (
            <button
              type="button"
              onClick={() => setSending('pick')}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={sendWhiteIcon} alt="" className="size-6" />
              {t('reminders.queue.sendAReminder')}
            </button>
          ) : null}
        </div>
      </div>

      {/* The banner: what happens to what is listed below, and the one pause the API has. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-75 bg-primary-25/60 p-4">
        <span className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
            <img src={clockIcon} alt="" className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold leading-[1.2] text-text-secondary">
              {t(enabled ? 'reminders.queue.holdTitleOn' : 'reminders.queue.holdTitleOff', {
                hour: SWEEP_HOUR,
              })}
            </span>
            <span className="mt-1.5 block text-sm font-medium leading-[1.3] text-text-tertiary">
              {t(enabled ? 'reminders.queue.holdNoteOn' : 'reminders.queue.holdNoteOff')}
            </span>
          </span>
        </span>
        {canManageSettings && ladder ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void pauseEverything(!enabled)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:opacity-50"
          >
            <img src={pauseIcon} alt="" className="size-5" />
            {t(enabled ? 'reminders.queue.pauseEverything' : 'reminders.queue.resumeEverything')}
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article key={kpi.id} className="flex flex-col rounded-md bg-surface-card p-5">
            <div className="-me-5 flex items-center gap-2">
              <span
                className={[
                  'flex size-[45px] shrink-0 items-center justify-center rounded-full',
                  kpi.disc,
                ].join(' ')}
              >
                <img src={kpi.icon} alt="" className="size-6" />
              </span>
              <h3 className="whitespace-nowrap text-xl font-medium leading-[1.2] text-text-secondary">
                {kpi.title}
              </h3>
            </div>
            <div className="mt-2.5">
              {'amount' in kpi && kpi.amount ? (
                <OmAmount
                  size="lg"
                  amount={kpi.amount}
                  amountClassName="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums"
                />
              ) : (
                <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
                  {'value' in kpi ? kpi.value : ''}
                </p>
              )}
            </div>
            <p className="mt-2.5 text-sm font-medium leading-[1.2] text-text-tertiary">
              {kpi.note}
            </p>
          </article>
        ))}
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}
      {!canManageSettings ? <Notice body={t('reminders.queue.noSchedule')} /> : null}
      {data.schedule.read.status === 'failed' ? (
        <ApiReadFailure error={data.schedule.read.error} retry={data.schedule.retry} />
      ) : null}
      {data.invoices.read.status === 'failed' ? (
        <ApiReadFailure error={data.invoices.read.error} retry={data.invoices.retry} />
      ) : null}
      {data.log.read.status === 'failed' ? (
        <ApiReadFailure error={data.log.read.error} retry={data.log.retry} />
      ) : null}

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
          {QUEUE_TABS.map((entry) => {
            const active = entry === tab
            return (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => narrow(() => setTab(entry))}
                className={[
                  'relative flex items-center gap-1.5 pb-3 text-base leading-[1.2] transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(`reminders.queue.tabs.${entry}`)}
                <span
                  className={[
                    'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                    active
                      ? 'bg-primary-25 text-primary-800'
                      : 'bg-primary-25 text-text-quaternary',
                  ].join(' ')}
                >
                  {formatCount(counts[entry], language)}
                </span>
                {active ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" />
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
            <img src={searchIcon} alt="" className="size-5 shrink-0" />
            <input
              type="search"
              value={search}
              onChange={(event) => narrow(() => setSearch(event.target.value))}
              placeholder={t('reminders.queue.searchPlaceholder')}
              aria-label={t('reminders.queue.searchPlaceholder')}
              className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {tab === 'sent' ? (
              <FilterMenu
                label={t('periodicList.filters')}
                icon={filterIcon}
                value={outcome}
                defaultValue="all"
                onChange={(value) => narrow(() => setOutcome(value))}
                options={[
                  { value: 'all', label: t('reminders.queue.filter.allOutcomes') },
                  ...(['SENT', 'FAILED', 'SKIPPED'] as const).map((value) => ({
                    value,
                    label: t(`paymentReminders.pill.${value}`),
                    count: logRows.filter((row) => row.outcome === value).length,
                  })),
                ]}
              />
            ) : (
              <FilterMenu
                label={t('periodicList.filters')}
                icon={filterIcon}
                value={step}
                defaultValue="all"
                onChange={(value) => narrow(() => setStep(value))}
                options={[
                  { value: 'all', label: t('reminders.queue.filter.allReminders') },
                  ...offsets.map((offset) => {
                    const found = stepOf(offsets, offset)
                    return {
                      value: String(found.index),
                      label: `${formatCount(found.index, language)} · ${t(found.nameKey)}`,
                    }
                  }),
                ]}
              />
            )}
            <SortMenu
              value={sort}
              onChange={(value) => narrow(() => setSort(value))}
              options={(['soonest', 'amount', 'customer'] as SortId[]).map((value) => ({
                value,
                labelKey: `reminders.queue.sort.${value}`,
              }))}
            />
          </div>
        </div>

        {data.loading ? <LoadingNotice /> : null}

        <RowsView>
          <table className="w-full min-w-[1100px] border-collapse text-start">
            <thead>
              <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                <th className="w-10 px-5 py-2.5">
                  <TableCheckbox
                    checked={allOnPage}
                    indeterminate={someOnPage}
                    disabled={shownIds.length === 0}
                    onChange={() =>
                      setSelected((currentIds) =>
                        allOnPage
                          ? currentIds.filter((id) => !shownIds.includes(id))
                          : [...new Set([...currentIds, ...shownIds])],
                      )
                    }
                    ariaLabel={t('reminders.queue.selectAll')}
                  />
                </th>
                {columns.map((key) => (
                  <th key={key} className="px-2 py-2.5 text-start font-semibold">
                    {t(`reminders.queue.cols.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {total === 0 && !data.loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-sm font-medium text-text-quaternary"
                  >
                    {t(
                      !canManageSettings && tab !== 'sent'
                        ? 'reminders.queue.noSchedule'
                        : `reminders.queue.empty.${tab}`,
                    )}
                  </td>
                </tr>
              ) : null}

              {tab === 'sent'
                ? shownLog.map((row) => {
                    const invoice = byId.get(row.invoiceId)
                    const note = outcomeNote(row)
                    const rowId = `${row.invoiceId}:${row.daysFromDue}`
                    return (
                      <tr
                        key={`${rowId}-${row.firedOn}`}
                        className="border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                      >
                        <td className="px-5 py-3.5 align-top">
                          <TableCheckbox
                            checked={selected.includes(rowId)}
                            onChange={() =>
                              setSelected((currentIds) =>
                                currentIds.includes(rowId)
                                  ? currentIds.filter((id) => id !== rowId)
                                  : [...currentIds, rowId],
                              )
                            }
                            ariaLabel={t('reminders.queue.selectRow', { id: row.invoiceNumber })}
                          />
                        </td>
                        <td className="px-2 py-3.5 align-top">
                          <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                            {t('reminders.queue.sentOn', {
                              date: formatDate(row.firedOn, language).replace(/\s\d{4}$/, ''),
                            })}
                          </p>
                          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                            {t(logLocaleKey(row.locale), {
                              defaultValue: row.locale,
                            })}
                          </p>
                        </td>
                        <td className="px-2 py-3.5 align-top">
                          <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                            {invoice?.customerName ?? t('periodicList.unknownCustomer')}
                          </p>
                          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                            {row.recipient}
                          </p>
                        </td>
                        <td className="px-2 py-3.5 align-top">
                          <Link
                            to={`/invoices/${row.invoiceId}`}
                            className="text-sm font-semibold leading-[1.2] text-primary-800 hover:underline"
                          >
                            {row.invoiceNumber}
                          </Link>
                          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                            {t(rungNote(row.daysFromDue).key, rungNote(row.daysFromDue).values)}
                          </p>
                        </td>
                        <td className="px-2 py-3.5 align-top">{stepPill(row.daysFromDue)}</td>
                        <td className="px-2 py-3.5 align-top">
                          {invoice?.outstanding !== null && invoice?.outstanding !== undefined ? (
                            <>
                              <OmAmount
                                size="sm"
                                amount={formatAmount(
                                  invoice.outstanding,
                                  invoice.currency,
                                  language,
                                )}
                                amountClassName="text-base font-semibold leading-[1.2] text-text-secondary tabular-nums"
                              />
                              {invoice.dueDate ? (
                                <p className="mt-1 text-xs font-semibold leading-[1.2] text-text-quaternary">
                                  {t('reminders.queue.dueOn', {
                                    date: formatDate(invoice.dueDate, language).replace(
                                      /\s\d{4}$/,
                                      '',
                                    ),
                                  })}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-sm font-medium text-text-quaternary">—</span>
                          )}
                        </td>
                        <td className="px-2 py-3.5 align-top">
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
                            <p className="mt-1 max-w-[260px] text-xs font-medium leading-[1.3] text-text-tertiary">
                              {t(note.key, note.values)}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })
                : shownEntries.map((entry) => {
                    const invoice = entry.invoice
                    const rowId = invoice.id
                    return (
                      <tr
                        key={rowId}
                        className="border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                      >
                        <td className="px-5 py-3.5 align-top">
                          <TableCheckbox
                            checked={selected.includes(rowId)}
                            onChange={() =>
                              setSelected((currentIds) =>
                                currentIds.includes(rowId)
                                  ? currentIds.filter((id) => id !== rowId)
                                  : [...currentIds, rowId],
                              )
                            }
                            ariaLabel={t('reminders.queue.selectRow', {
                              id: invoice.invoiceNumber ?? invoice.id,
                            })}
                          />
                        </td>
                        <td className="px-2 py-3.5 align-top">
                          <p
                            className={[
                              'text-sm font-semibold leading-[1.2]',
                              tab === 'paused' || !entry.next
                                ? 'text-text-tertiary'
                                : 'text-text-primary',
                            ].join(' ')}
                          >
                            {tab === 'paused' ? t('reminders.queue.paused') : sendingLabel(entry)}
                          </p>
                          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                            {tab === 'paused'
                              ? t('reminders.queue.untilResume')
                              : sendingNote(entry)}
                          </p>
                        </td>
                        <td className="px-2 py-3.5 align-top">
                          <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                            {invoice.customerName ?? t('periodicList.unknownCustomer')}
                          </p>
                          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                            {entry.email ?? t('paymentReminders.verdict.noRecipient')}
                          </p>
                        </td>
                        <td className="px-2 py-3.5 align-top">
                          <Link
                            to={`/invoices/${invoice.id}`}
                            className="text-sm font-semibold leading-[1.2] text-primary-800 hover:underline"
                          >
                            {invoice.invoiceNumber ?? invoice.id}
                          </Link>
                          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                            {invoiceNote(entry)}
                          </p>
                        </td>
                        <td className="px-2 py-3.5 align-top">
                          {entry.next ? (
                            stepPill(entry.next.offset)
                          ) : (
                            <span className="text-sm font-medium text-text-quaternary">
                              {entry.spent.length > 0
                                ? t('reminders.queue.allSent', { count: entry.spent.length })
                                : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3.5 align-top">
                          {invoice.outstanding !== null ? (
                            <OmAmount
                              size="sm"
                              amount={formatAmount(invoice.outstanding, invoice.currency, language)}
                              amountClassName="text-base font-semibold leading-[1.2] text-text-secondary tabular-nums"
                            />
                          ) : null}
                          {invoice.dueDate ? (
                            <p className="mt-1 text-xs font-semibold leading-[1.2] text-text-quaternary">
                              {t('reminders.queue.dueOn', {
                                date: formatDate(invoice.dueDate, language).replace(/\s\d{4}$/, ''),
                              })}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-3.5 align-top">
                          <div className="flex flex-wrap items-center gap-3.5">
                            {tab === 'paused' ? (
                              canManageSettings ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void pauseEverything(true)}
                                  className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary hover:bg-primary-25"
                                >
                                  {t('reminders.queue.actions.resume')}
                                </button>
                              ) : null
                            ) : (
                              <>
                                {canSend && (entry.email || entry.next) ? (
                                  <button
                                    type="button"
                                    onClick={() => setSending(entry)}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary hover:bg-primary-25"
                                  >
                                    <img src={sendIcon} alt="" className="size-4" />
                                    {t('reminders.queue.actions.sendNow')}
                                  </button>
                                ) : null}
                                {entry.next && canManageSettings ? (
                                  <button
                                    type="button"
                                    onClick={() => setPausing(entry)}
                                    className="text-sm font-semibold text-text-secondary hover:underline"
                                  >
                                    {t('reminders.queue.actions.pause')}
                                  </button>
                                ) : null}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </RowsView>

        {total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-text-muted">
                {t('periodicList.showResult')}
              </span>
              <div className="w-[88px]">
                <Select
                  compact
                  value={String(size)}
                  onChange={(value) => narrow(() => setSize(Number(value)))}
                  options={PAGE_SIZES.map((option) => ({
                    value: String(option),
                    label: formatCount(option, language),
                  }))}
                  ariaLabel={t('periodicList.showResult')}
                />
              </div>
              <span className="text-sm font-medium text-text-tertiary">
                {t('reminders.queue.resultTotal', { count: total })}
              </span>
            </div>
            {pageCount > 1 ? (
              <Pager
                page={current}
                pageCount={pageCount}
                onChange={setPage}
                labels={{
                  nav: t('periodicList.pages'),
                  previous: t('common.previous'),
                  next: t('common.next'),
                }}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      {sending ? (
        <SendReminderModal
          key={sending === 'pick' ? 'pick' : sending.invoice.id}
          entry={sending === 'pick' ? null : sending}
          entries={queue}
          offsets={offsets}
          canSend={canSend}
          onClose={() => setSending(null)}
          onSent={(recipient) => {
            setSending(null)
            data.log.retry()
            setNotice(t('paymentReminders.invoice.sent', { recipient: recipient ?? '' }))
          }}
        />
      ) : null}
      {pausing ? (
        <PauseRemindersModal
          entry={pausing}
          onClose={() => setPausing(null)}
          onConfirm={() => {
            // TODO(backend): a per-invoice or per-customer pause with a resume date and a reason.
            setPausing(null)
            setNotice(t('reminders.pause.notYet'))
          }}
        />
      ) : null}
    </div>
  )
}
