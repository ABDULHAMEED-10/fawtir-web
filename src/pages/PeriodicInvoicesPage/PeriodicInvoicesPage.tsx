import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  FilterMenu,
  Modal,
  OmAmount,
  RowsView,
  Select,
  SortMenu,
  TableCheckbox,
  type ActionMenuItem,
} from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  PERIODIC_SCHEDULES_PATH,
  deletePeriodicSchedule,
  loadPeriodicSchedules,
  runPeriodicNow,
  setPeriodicActive,
  type PeriodicScheduleDto,
  type RecurrenceInterval,
} from '../../api/invoices/periodic'
import { customerListPath, loadCustomerPage, type CustomerDto } from '../../api/customers/customers'
import { invoiceListPath, loadInvoicePage, type InvoiceRowDto } from '../../api/invoices/list'
import { ApiError, type Page } from '../../api'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { usePlanIncludes } from '../../lib/planAccess'
import {
  PERIODIC_INTERVALS,
  PERIODIC_REFUSALS,
  PERIODIC_SORTS,
  PERIODIC_TABS,
  cadenceNote,
  countTab,
  generatedThisMonth,
  isLastRun,
  monthlyEquivalent,
  narrowSchedules,
  ownTemplateInfo,
  periodicCounts,
  runsDueSoon,
  scheduleName,
  scheduleNote,
  pauseReasonKey,
  scheduleStatus,
  scheduleTone,
  sortSchedules,
  upcomingRuns,
  type PeriodicSortId,
  type PeriodicStatus,
  type PeriodicTabId,
  type TemplateInfo,
} from '../../lib/periodicInvoice'
import revenueIcon from '../../assets/periodic/kpi-revenue.svg'
import dueIcon from '../../assets/periodic/kpi-due.svg'
import generatedIcon from '../../assets/periodic/kpi-generated.svg'
import attentionIcon from '../../assets/periodic/kpi-attention.svg'
import scheduleIcon from '../../assets/periodic/schedule.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/credit-notes/filter.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import viewIcon from '../../assets/actions/view.svg'
import generateIcon from '../../assets/actions/invoice.svg'
import pauseIcon from '../../assets/actions/pause.svg'
import resumeIcon from '../../assets/actions/periodic.svg'
import duplicateIcon from '../../assets/actions/duplicate.svg'
import deleteIcon from '../../assets/actions/delete.svg'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'

/** The customers list refuses a page over 100, so names are read a hundred at a time. */
const CUSTOMER_PAGE_SIZE = 100
/** The invoices list's own cap: the schedules' templates are looked up in this page of it. */
const INVOICE_PAGE_SIZE = 100
const PAGE_SIZES = [6, 10, 25, 50]
const DEFAULT_PAGE_SIZE = 10

const muscatToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

const TONE: Record<'warn' | 'ok' | 'muted', string> = {
  warn: 'text-warning-700',
  ok: 'text-text-tertiary',
  muted: 'text-text-quaternary',
}

/** Status pill fills read straight off the Figma labels. */
const STATUS_STYLES: Record<PeriodicStatus, string> = {
  active: 'bg-success-100 text-success-700',
  paused: 'bg-pending-100 text-pending-700',
  finished: 'bg-neutral-25 text-neutral-700',
  onRequest: 'bg-primary-25 text-primary-700',
  draft: 'bg-neutral-25 text-neutral-700',
}

/**
 * Income › Periodic invoices (I-13, Figma 154:159427).
 *
 * Each schedule copies one invoice on a cadence and raises a **draft** for someone to check and
 * issue. The API answers a bare array — no paging, no totals, no filters — so the tabs, the search,
 * the sort, the paging and the four figures are all worked out from the list in hand. A schedule
 * carries only a customer id and a template invoice id, so the names, the amounts and the
 * references come from the customers and invoices lists, read once each.
 */
export function PeriodicInvoicesPage() {
  return (
    <AppShell>
      <PeriodicInvoicesContent />
    </AppShell>
  )
}

/** The page itself, inside the shell so `useSession()` reads the session the shell provides. */
function PeriodicInvoicesContent() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  // No new drafts while the subscription is read-only (ST-2, CA-3). Pause stays offered; Resume
  // waits until they pay (owner, 23 Oct).
  const mayDraft = useSubscriptionAllows('CREATE_DRAFTS')
  const canManage = can(session, 'invoice.draft')
  // A plan without periodic invoices (PL-8): reading, pausing and deleting stay; making,
  // generating, resuming and copying wait for a plan that has them.
  const planIncludes = usePlanIncludes('recurringInvoices')
  const today = muscatToday()
  const [tab, setTab] = useState<PeriodicTabId>('all')
  const [search, setSearch] = useState('')
  const [interval, setInterval] = useState<RecurrenceInterval | 'all'>('all')
  const [sort, setSort] = useState<PeriodicSortId>('nextSoonest')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE)
  const [selected, setSelected] = useState<string[]>([])
  const [notice, setNotice] = useState<{ key: string } | { body: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const schedules = useApiRead<PeriodicScheduleDto[]>(
    PERIODIC_SCHEDULES_PATH,
    loadPeriodicSchedules,
  )
  const customersPath = customerListPath({
    type: null,
    search: '',
    sort: 'NAME_ASC',
    page: 0,
    size: CUSTOMER_PAGE_SIZE,
  })
  const customers = useApiRead<Page<CustomerDto>>(customersPath, () =>
    loadCustomerPage(customersPath),
  )
  // TODO(backend): the schedule should carry its template's number, subject, reference and total;
  // until it does, the invoices list is read once and the templates looked up in it.
  const invoicesPath = invoiceListPath({
    state: 'DRAFT,ISSUED',
    payment: null,
    type: 'INVOICE',
    from: null,
    to: null,
    search: '',
    sort: 'ISSUED_NEWEST',
    page: 0,
    size: INVOICE_PAGE_SIZE,
  })
  const invoices = useApiRead<Page<InvoiceRowDto>>(invoicesPath, () =>
    loadInvoicePage(invoicesPath),
  )

  const rows = schedules.read.status === 'ready' ? schedules.read.data : []
  const names = useMemo(
    () =>
      new Map(
        (customers.read.status === 'ready' ? customers.read.data.items : []).map((row) => [
          row.id,
          row.displayName,
        ]),
      ),
    [customers.read],
  )
  const templates = useMemo(
    () =>
      new Map<string, TemplateInfo>(
        (invoices.read.status === 'ready' ? invoices.read.data.items : []).map((row) => [
          row.id,
          {
            number: row.invoiceNumber,
            subject: row.details?.subject ?? null,
            reference: row.details?.purchaseOrderReference ?? null,
            total: row.totals?.totalAmount ?? null,
            currency: row.currency,
          },
        ]),
      ),
    [invoices.read],
  )
  const nameOf = (customerId: string) => names.get(customerId)
  // The schedule's own template wins, as it does when a run drafts; the invoice is then only the
  // pre-fill it started from.
  const templateOf = (schedule: PeriodicScheduleDto) =>
    schedule.template
      ? ownTemplateInfo(schedule.template)
      : schedule.templateInvoiceId
        ? templates.get(schedule.templateInvoiceId)
        : undefined
  const titleOf = (schedule: PeriodicScheduleDto) =>
    scheduleName(templateOf(schedule), nameOf(schedule.customerId)) ??
    t('periodicList.unknownCustomer')
  const amountOf = (schedule: PeriodicScheduleDto) => templateOf(schedule)?.total ?? 0

  const counts = periodicCounts(rows, today)
  const activeRows = rows.filter((schedule) => scheduleStatus(schedule) === 'active')
  const revenue = activeRows.reduce(
    (sum, schedule) => sum + monthlyEquivalent(amountOf(schedule), schedule.interval),
    0,
  )
  // Every run due in the window, not only each schedule's next one.
  const dueSoonAmount = activeRows.reduce(
    (sum, schedule) => sum + amountOf(schedule) * runsDueSoon(schedule, today),
    0,
  )

  const visible = sortSchedules(
    narrowSchedules(rows, tab, search, nameOf, templateOf, interval === 'all' ? null : interval),
    sort,
    titleOf,
    amountOf,
  )
  const pageCount = Math.max(1, Math.ceil(visible.length / size))
  const current = Math.min(page, pageCount)
  const shown = visible.slice((current - 1) * size, current * size)
  const allOnPageSelected = shown.length > 0 && shown.every((row) => selected.includes(row.id))
  const someOnPageSelected = !allOnPageSelected && shown.some((row) => selected.includes(row.id))

  const narrow = (change: () => void) => {
    setPage(1)
    change()
  }

  const fail = (error: unknown) => {
    const code = error instanceof ApiError ? error.code : null
    if (code && Object.hasOwn(PERIODIC_REFUSALS, code)) {
      setNotice({ key: PERIODIC_REFUSALS[code] })
      return
    }
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice({
      body: message.reference
        ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
        : body,
    })
  }

  /** "Generate invoice": raises the next run now; the schedule then moves on one interval. */
  const generate = async (schedule: PeriodicScheduleDto) => {
    setNotice(null)
    setBusy(schedule.id)
    try {
      const run = await runPeriodicNow(schedule.id)
      schedules.retry()
      if (run.outcome !== 'DRAFTED') {
        setNotice({ key: 'periodicList.done.generateFailed' })
        return
      }
      // The run just raised was the schedule's next one; the one after it is now next.
      const next = upcomingRuns(schedule, 2)[1]
      setNotice(
        next && !isLastRun(schedule)
          ? { body: t('periodicList.done.generated', { date: formatDate(next, language) }) }
          : { key: 'periodicList.done.generatedLast' },
      )
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  // Generate raises a real draft and moves the schedule on, so a mis-click is asked about first;
  // a second click the same day is refused by the server, so no limit is kept here.
  const [generating, setGenerating] = useState<PeriodicScheduleDto | null>(null)
  // The last run is known from the runs left (or the end date), never from an empty list.
  const generatingNext =
    generating && !isLastRun(generating) ? upcomingRuns(generating, 2)[1] : undefined
  const onGenerate = () => {
    if (!generating) return
    const target = generating
    setGenerating(null)
    void generate(target)
  }

  const [deleting, setDeleting] = useState<PeriodicScheduleDto | null>(null)
  const onDelete = async () => {
    if (!deleting) return
    const target = deleting
    setDeleting(null)
    setNotice(null)
    setBusy(target.id)
    try {
      await deletePeriodicSchedule(target.id)
      setSelected((current) => current.filter((selectedId) => selectedId !== target.id))
      setNotice({ key: 'periodicList.done.deleted' })
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
      schedules.retry()
    }
  }

  const toggle = async (schedule: PeriodicScheduleDto) => {
    setNotice(null)
    setBusy(schedule.id)
    try {
      const saved = await setPeriodicActive(schedule.id, !schedule.active)
      schedules.retry()
      setNotice(
        schedule.active
          ? { key: 'periodicList.done.paused' }
          : {
              body: t('periodicList.done.resumed', {
                date: formatDate(saved.nextRunDate, language),
              }),
            },
      )
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  // The ticked rows when there are any, else the list as narrowed.
  const picked = rows.filter((schedule) => selected.includes(schedule.id))
  const exported = picked.length > 0 ? sortSchedules(picked, sort, titleOf, amountOf) : visible

  const exportCsv = () => {
    const header = ['schedule', 'customer', 'frequency', 'next_run', 'per_invoice', 'status']
    const lines = exported.map((schedule) =>
      [
        titleOf(schedule),
        nameOf(schedule.customerId) ?? schedule.customerId,
        schedule.interval,
        schedule.nextRunDate,
        amountOf(schedule).toFixed(3),
        scheduleStatus(schedule),
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `periodic-invoices-${today}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  /**
   * The row menu as the design's Actions frame (154:166746) lists it. Generate is offered only on
   * an active series (the server refuses a paused or finished one), and a finished series has
   * nothing to pause or resume.
   */
  const menuFor = (schedule: PeriodicScheduleDto): ActionMenuItem[] => {
    const status = scheduleStatus(schedule)
    return [
      {
        id: 'view',
        labelKey: 'periodicList.menu.view',
        icon: viewIcon,
        to: `/income/periodic/${schedule.id}`,
      },
      ...(canManage
        ? [
            ...(status === 'active'
              ? [
                  // Generate makes a new draft now, so it waits until they pay too.
                  ...(mayDraft && planIncludes
                    ? [
                        {
                          id: 'generate',
                          labelKey: 'periodicList.menu.generate',
                          icon: generateIcon,
                          onSelect: () => setGenerating(schedule),
                        },
                      ]
                    : []),
                  {
                    id: 'pause',
                    labelKey: 'periodicList.menu.pause',
                    icon: pauseIcon,
                    onSelect: () => void toggle(schedule),
                  },
                ]
              : status === 'paused' && mayDraft && planIncludes
                ? [
                    {
                      id: 'resume',
                      labelKey: 'periodicList.menu.resume',
                      icon: resumeIcon,
                      onSelect: () => void toggle(schedule),
                    },
                  ]
                : []),
            ...(mayDraft && planIncludes
              ? [
                  {
                    id: 'duplicate',
                    labelKey: 'periodicList.menu.duplicate',
                    icon: duplicateIcon,
                    to: `/income/periodic/new?copy=${schedule.id}`,
                  },
                ]
              : []),
            {
              id: 'delete',
              labelKey: 'periodicList.menu.delete',
              icon: deleteIcon,
              danger: true,
              onSelect: () => setDeleting(schedule),
            },
          ]
        : []),
    ]
  }

  const generated = generatedThisMonth(rows, today, amountOf)
  const onRequestCount = countTab(rows, 'onRequest')

  const kpis = [
    {
      id: 'revenue',
      icon: revenueIcon,
      title: t('periodicList.kpi.revenue'),
      amount: formatAmount(revenue, 'OMR', language),
      suffix: t('periodicList.kpi.perMonth'),
      meta: t('periodicList.kpi.revenueMeta', { count: activeRows.length }),
    },
    {
      id: 'due',
      icon: dueIcon,
      title: t('periodicList.kpi.due'),
      amount: formatAmount(dueSoonAmount, 'OMR', language),
      meta: t('periodicList.kpi.dueMeta', { count: counts.dueSoon }),
    },
    {
      // Counted from each schedule's `lastRunDate` and per-invoice amount, when the API carries them.
      id: 'generated',
      icon: generatedIcon,
      title: t('periodicList.kpi.generated'),
      amount: generated ? formatAmount(generated.amount, 'OMR', language) : null,
      meta: generated
        ? t('periodicList.kpi.generatedIssued', { count: generated.count })
        : t('periodicList.kpi.generatedMeta'),
    },
    {
      id: 'attention',
      icon: attentionIcon,
      title: t('periodicList.kpi.attention'),
      count: counts.paused + onRequestCount,
      meta: t('periodicList.kpi.attentionMeta', {
        paused: counts.paused,
        onRequest: onRequestCount,
      }),
      danger: false,
    },
  ]

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-medium leading-[1.2] text-text-quaternary">
                {t('periodicList.breadcrumbIncome')}
              </span>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {t('periodicList.title')}
              </h1>
            </div>
            <p className="mt-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">
              {schedules.read.status === 'ready'
                ? t('periodicList.subtitleLive', { count: counts.total, active: counts.active })
                : t('periodicList.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={exportCsv}
              disabled={exported.length === 0}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-50"
            >
              <img src={exportIcon} alt="" className="size-6 rotate-180" />
              {t('periodicList.export')}
            </button>
            {canManage && mayDraft && planIncludes ? (
              <Link
                to="/income/periodic/new"
                className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
              >
                <img src={plusIcon} alt="" className="size-6" />
                {t('periodicList.add')}
              </Link>
            ) : null}
          </div>
        </div>

        {schedules.read.status === 'ready' ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <article
                key={kpi.id}
                className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5"
              >
                <div className="flex items-center gap-3.5">
                  <img src={kpi.icon} alt="" className="size-11 shrink-0" />
                  <h3 className="whitespace-nowrap text-lg font-medium leading-[1.2] text-text-secondary">
                    {kpi.title}
                  </h3>
                </div>
                <div className="flex items-baseline gap-1.5">
                  {'count' in kpi ? (
                    <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
                      {formatCount(kpi.count ?? 0, language)}
                    </p>
                  ) : kpi.amount === null ? (
                    <p className="text-[32px] font-semibold leading-[1.2] text-text-quaternary">
                      —
                    </p>
                  ) : (
                    <OmAmount
                      size="lg"
                      amount={kpi.amount}
                      amountClassName="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums"
                    />
                  )}
                  {'suffix' in kpi && kpi.suffix ? (
                    <span className="text-base font-medium text-text-tertiary">{kpi.suffix}</span>
                  ) : null}
                </div>
                <p
                  className={[
                    'text-sm font-medium leading-[1.2]',
                    'danger' in kpi && kpi.danger ? 'text-danger-700' : 'text-text-tertiary',
                  ].join(' ')}
                >
                  {kpi.meta}
                </p>
              </article>
            ))}
          </div>
        ) : null}

        {notice ? (
          <Notice
            body={'key' in notice ? t(notice.key) : notice.body}
            action={{ label: t('common.close'), onClick: () => setNotice(null) }}
          />
        ) : null}

        <section className="overflow-hidden rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
            {PERIODIC_TABS.map((entry) => {
              const active = entry === tab
              const tally = countTab(rows, entry)
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
                  {t(`periodicList.tab.${entry}`)}
                  <span
                    className={[
                      'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                      active
                        ? 'bg-primary-25 text-primary-800'
                        : 'bg-primary-25 text-text-quaternary',
                    ].join(' ')}
                  >
                    {formatCount(tally, language)}
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
                placeholder={t('periodicList.searchPlaceholder')}
                aria-label={t('periodicList.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <FilterMenu
                label={t('periodicList.filters')}
                icon={filterIcon}
                value={interval}
                defaultValue="all"
                onChange={(value) => narrow(() => setInterval(value))}
                options={[
                  { value: 'all', label: t('periodicList.filter.allFrequencies') },
                  ...PERIODIC_INTERVALS.map((value) => ({
                    value,
                    label: t(`periodicList.interval.${value}`),
                    count: rows.filter((row) => row.interval === value).length,
                  })),
                ]}
              />
              <SortMenu
                value={sort}
                onChange={(value) => narrow(() => setSort(value))}
                options={PERIODIC_SORTS.map((value) => ({
                  value,
                  labelKey: `periodicList.sort.${value}`,
                }))}
              />
            </div>
          </div>

          {schedules.read.status === 'loading' ? <LoadingNotice /> : null}
          {schedules.read.status === 'failed' ? (
            <div className="px-6 pb-5">
              <ApiReadFailure error={schedules.read.error} retry={schedules.retry} />
            </div>
          ) : null}

          {schedules.read.status === 'ready' ? (
            <RowsView>
              <table className="w-full min-w-[1040px] border-collapse text-start">
                <thead>
                  <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                    <th className="w-10 px-5 py-2.5">
                      <TableCheckbox
                        checked={allOnPageSelected}
                        indeterminate={someOnPageSelected}
                        disabled={shown.length === 0}
                        onChange={() =>
                          setSelected((current) =>
                            allOnPageSelected
                              ? current.filter((id) => !shown.some((row) => row.id === id))
                              : [...new Set([...current, ...shown.map((row) => row.id)])],
                          )
                        }
                        ariaLabel={t('periodicList.selectAll')}
                      />
                    </th>
                    {(
                      [
                        'schedule',
                        'customer',
                        'frequency',
                        'nextInvoice',
                        'perInvoice',
                        'generated',
                        'status',
                      ] as const
                    ).map((key) => (
                      <th key={key} className="px-2 py-2.5 text-start font-semibold">
                        {t(`periodicList.col.${key}`)}
                      </th>
                    ))}
                    <th className="w-12 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-12 text-center text-sm font-medium text-text-quaternary"
                      >
                        {t(
                          tab === 'onRequest' || tab === 'draft'
                            ? `periodicList.emptyTab.${tab}`
                            : 'periodicList.empty',
                        )}
                      </td>
                    </tr>
                  ) : (
                    shown.map((schedule) => {
                      const template = templateOf(schedule)
                      const status = scheduleStatus(schedule)
                      const pauseReason = pauseReasonKey(schedule)
                      const note = scheduleNote(schedule, today)
                      const cadence = cadenceNote(schedule)
                      const menu = menuFor(schedule)
                      return (
                        <tr
                          key={schedule.id}
                          className="border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                        >
                          <td className="px-5 py-2.5">
                            <TableCheckbox
                              checked={selected.includes(schedule.id)}
                              onChange={() =>
                                setSelected((current) =>
                                  current.includes(schedule.id)
                                    ? current.filter((id) => id !== schedule.id)
                                    : [...current, schedule.id],
                                )
                              }
                              ariaLabel={t('periodicList.selectRow', { name: titleOf(schedule) })}
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <Link
                              to={`/income/periodic/${schedule.id}`}
                              className="text-sm font-semibold leading-[1.2] text-text-primary hover:text-primary-700 hover:underline"
                            >
                              {titleOf(schedule)}
                            </Link>
                            <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                              {[
                                t(`periodicList.subtype.${schedule.transactionSubtype}`),
                                template?.reference,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </td>
                          <td className="px-2 py-2.5 text-sm font-medium text-text-secondary">
                            {nameOf(schedule.customerId) ?? t('periodicList.unknownCustomer')}
                          </td>
                          <td className="px-2 py-2.5">
                            <span className="flex items-center gap-2.5">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-background">
                                <img src={scheduleIcon} alt="" className="size-[18px]" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-medium leading-[1.2] text-text-secondary">
                                  {t(`periodicList.interval.${schedule.interval}`)}
                                </span>
                                <span className="mt-1 block text-xs font-medium leading-[1.2] text-text-tertiary">
                                  {t(cadence.key, {
                                    ...cadence.values,
                                    ordinal: true,
                                    weekday: cadence.values?.weekday
                                      ? t(`periodicList.weekday.${cadence.values.weekday}`)
                                      : undefined,
                                    date: cadence.values?.date
                                      ? formatDate(String(cadence.values.date), language).replace(
                                          /\s\d{4}$/,
                                          '',
                                        )
                                      : undefined,
                                  })}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="px-2 py-2.5">
                            {status === 'active' ? (
                              <>
                                <p className="text-sm font-medium leading-[1.2] text-text-secondary">
                                  {formatDate(schedule.nextRunDate, language)}
                                </p>
                                <p
                                  className={[
                                    'mt-1 text-xs font-medium leading-[1.2]',
                                    TONE[scheduleTone(schedule, today)],
                                  ].join(' ')}
                                >
                                  {t(
                                    note.key,
                                    note.values
                                      ? {
                                          ...note.values,
                                          date: note.values.date
                                            ? formatDate(String(note.values.date), language)
                                            : undefined,
                                        }
                                      : undefined,
                                  )}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm font-medium text-text-quaternary">
                                {t(`periodicList.status.${status}`)}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            {template?.total !== null && template?.total !== undefined ? (
                              <OmAmount
                                size="sm"
                                amount={formatAmount(template.total, template.currency, language)}
                                amountClassName="text-base font-semibold leading-[1.2] text-text-secondary tabular-nums"
                              />
                            ) : (
                              <span className="text-sm font-medium text-text-quaternary">
                                {t('periodicList.notPriced')}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            {/* `runCount` and `lastRunDate` on the schedule, when present; otherwise the runs are read on the schedule's page. */}
                            {schedule.runCount === undefined ? (
                              <Link
                                to={`/income/periodic/${schedule.id}`}
                                className="text-xs font-medium leading-[1.2] text-text-tertiary hover:text-primary-700 hover:underline"
                              >
                                {t('periodicList.generatedOnPage')}
                              </Link>
                            ) : schedule.runCount === 0 || !schedule.lastRunDate ? (
                              <p className="text-sm font-medium text-text-quaternary">
                                {t('periodicList.notIssued')}
                              </p>
                            ) : (
                              <>
                                <p className="text-sm font-medium leading-[1.2] text-text-secondary">
                                  {t('periodicList.issuedCount', { count: schedule.runCount })}
                                </p>
                                <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                                  {t('periodicList.lastRun', {
                                    date: formatDate(schedule.lastRunDate, language).replace(
                                      /\s\d{4}$/,
                                      '',
                                    ),
                                  })}
                                </p>
                              </>
                            )}
                          </td>
                          <td className="px-2 py-2.5">
                            <span
                              className={[
                                'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-medium',
                                STATUS_STYLES[status],
                              ].join(' ')}
                            >
                              <span className="size-1.5 shrink-0 rounded-full bg-current" />
                              {t(`periodicList.status.${status}`)}
                            </span>
                            {pauseReason ? (
                              <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                                {t(pauseReason)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-2.5">
                            <span
                              className={
                                busy === schedule.id ? 'pointer-events-none opacity-50' : ''
                              }
                            >
                              <ActionMenu items={menu} label={t('periodicList.rowMenu')} floating />
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </RowsView>
          ) : null}

          {schedules.read.status === 'ready' && visible.length > 0 ? (
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
                  {t('periodicList.resultTotal', { count: visible.length })}
                </span>
              </div>
              {pageCount > 1 ? (
                <PageNumbers current={current} pageCount={pageCount} onChange={setPage} />
              ) : null}
            </div>
          ) : null}
        </section>

        <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
          {t('periodicList.sweepNote')}
        </p>
      </div>

      <Modal
        open={generating !== null}
        onClose={() => setGenerating(null)}
        title={t('periodicList.generateTitle')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setGenerating(null)}
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onGenerate}
              className="inline-flex h-11 items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800"
            >
              {t('periodicList.generateConfirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {generatingNext
            ? t('periodicList.generateBody', { date: formatDate(generatingNext, language) })
            : t('periodicList.generateBodyLast')}
        </p>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t('periodicList.deleteTitle')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void onDelete()}
              className="inline-flex h-11 items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white"
            >
              {t('periodicList.deleteConfirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('periodicList.deleteBody')}
        </p>
      </Modal>
    </>
  )
}

/** The list pager as the invoices list draws it: first, last and a window around the current page. */
function PageNumbers({
  current,
  pageCount,
  onChange,
}: {
  current: number
  pageCount: number
  onChange: (page: number) => void
}) {
  const { t, i18n } = useTranslation()
  const numbers = useMemo<(number | string)[]>(() => {
    if (pageCount <= 6) return Array.from({ length: pageCount }, (_, i) => i + 1)
    const near = [current - 1, current, current + 1].filter((n) => n > 1 && n < pageCount)
    return [
      1,
      ...(near[0] > 2 ? ['…'] : []),
      ...near,
      ...(near.at(-1)! < pageCount - 1 ? ['…'] : []),
      pageCount,
    ]
  }, [pageCount, current])

  return (
    <nav aria-label={t('periodicList.pages')} className="flex items-center">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current <= 1}
        className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
        aria-label={t('periodicList.prevPage')}
      >
        <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
      </button>
      {numbers.map((n, index) =>
        typeof n === 'string' ? (
          <span
            key={`gap-${index}`}
            className="inline-flex size-10 items-center justify-center text-sm font-medium text-text-muted"
          >
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-current={n === current ? 'page' : undefined}
            className={[
              'inline-flex size-10 items-center justify-center rounded-xl text-center transition-colors',
              n === current
                ? 'bg-primary-25 text-base font-extrabold text-primary-700'
                : 'text-sm font-medium text-text-muted hover:bg-neutral-25',
            ].join(' ')}
          >
            {formatCount(n, i18n.language)}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(Math.min(pageCount, current + 1))}
        disabled={current >= pageCount}
        className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
        aria-label={t('periodicList.nextPage')}
      >
        <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
      </button>
    </nav>
  )
}
