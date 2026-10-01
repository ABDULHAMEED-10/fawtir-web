import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, OmAmount, SortMenu, withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api'
import {
  chaseRecurringBill,
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
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import { muscatToday } from '../../lib/invoiceIssue'
import { can, useSession } from '../../lib/session/session'
import {
  RECURRING_REFUSALS,
  RECURRING_SORTS,
  RECURRING_TABS,
  cadenceNote,
  canResume,
  categoriesOf,
  categoryGlyph,
  chaseBlocker,
  chaseNotice,
  daysBetween,
  formatVariance,
  hasMore,
  isEnded,
  monthYear,
  narrow,
  sortRows,
  stateNote,
  toneOf,
  type CategoryGlyph,
  type RecurringSort,
} from '../../lib/recurringBills'
import catShopIcon from '../../assets/recurring/cat-shop.svg'
import catPowerIcon from '../../assets/recurring/cat-power.svg'
import catInternetIcon from '../../assets/recurring/cat-internet.svg'
import catSoftwareIcon from '../../assets/recurring/cat-software.svg'
import catDeliveryIcon from '../../assets/recurring/cat-delivery.svg'
import calBlueIcon from '../../assets/recurring/cal-blue.svg'
import calAlertIcon from '../../assets/recurring/cal-alert.svg'
import kpiClockIcon from '../../assets/recurring/kpi-clock.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/bills/filter.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import viewIcon from '../../assets/actions/view.svg'
import editIcon from '../../assets/actions/edit.svg'
import pauseIcon from '../../assets/actions/pause.svg'

const GLYPH: Record<CategoryGlyph, { icon: string; tile: string }> = {
  premises: { icon: catShopIcon, tile: 'bg-primary-50' },
  power: { icon: catPowerIcon, tile: 'bg-[#f3f3f3]' },
  internet: { icon: catInternetIcon, tile: 'bg-[#f3f3f3]' },
  software: { icon: catSoftwareIcon, tile: 'bg-success-100' },
  delivery: { icon: catDeliveryIcon, tile: 'bg-[#f3f3f3]' },
  other: { icon: calBlueIcon, tile: 'bg-[#f3f3f3]' },
}

/** The pill's colours: amber for something wrong, green for a bill that came, blue for one due. */
const PILL = {
  warn: 'bg-pending-100 text-pending-700',
  ok: 'bg-success-100 text-[#3d5648]',
  due: 'bg-primary-50 text-primary-800',
  muted: 'bg-[#e3e4ea] text-[#474a5e]',
} as const

const NOTE_TONE = {
  warn: 'text-[#887147]',
  ok: 'text-[#3d5648]',
  muted: 'text-text-quaternary',
} as const

type Failure = { key: string; values?: Record<string, string | number> } | { body: string }

/**
 * Expenditure › Recurring bills (Figma 163:23795): the bills that come round again, each row
 * saying where its watch stands and offering the one thing to do about it.
 *
 * The API filters by state and pages by look-ahead; the search box, the category filter and the
 * sort work on the page in hand. The tab counts are the summary's own figures.
 */
export function RecurringBillsPage() {
  return (
    <AppShell>
      <RecurringBills />
    </AppShell>
  )
}

/** Inside the shell, where the session is: what the reader may do decides what each row offers. */
function RecurringBills() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'invoice.payment.manage')
  const today = muscatToday()
  const [tab, setTab] = useState<RecurringListState>('ACTIVE')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<RecurringSort>('natural')
  const [notice, setNotice] = useState<Failure | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const listPath = recurringListPath(tab, page)
  const list = useApiRead<RecurringBillPageDto>(listPath, () => loadRecurringPage(listPath))
  const summaryPath = recurringSummaryPath()
  const summary = useApiRead<RecurringSummaryDto>(summaryPath, () =>
    loadRecurringSummary(summaryPath),
  )

  const data = list.read.status === 'ready' ? list.read.data : null
  const totals = summary.read.status === 'ready' ? summary.read.data : null
  const rows = data ? sortRows(narrow(data.items, search, category), sort) : []
  const categories = data ? categoriesOf(data.items) : []

  const counts: Record<RecurringListState, number | null> = {
    ACTIVE: totals?.activeCount ?? null,
    LATE: totals?.lateCount ?? null,
    PAUSED: totals ? totals.recurringCount - totals.activeCount : null,
    ALL: totals?.recurringCount ?? null,
  }

  const choose = (next: RecurringListState) => {
    setPage(0)
    setTab(next)
  }

  const failed = (error: unknown) => {
    const code = error instanceof ApiError ? error.code : null
    if (code && RECURRING_REFUSALS[code]) {
      setNotice({ key: RECURRING_REFUSALS[code] })
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

  const act = async (bill: RecurringBillDto, what: 'toggle' | 'chase') => {
    setNotice(null)
    setBusy(bill.id)
    try {
      if (what === 'toggle') {
        await setRecurringActive(bill.id, !bill.active)
        setNotice({
          key: bill.active ? 'recurringBills.done.paused' : 'recurringBills.done.resumed',
        })
        list.retry()
        summary.retry()
      } else {
        setNotice(chaseNotice(await chaseRecurringBill(bill.id)))
      }
    } catch (error) {
      failed(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[620px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('recurringBills.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('recurringBills.subtitle')}
            </p>
          </div>
          {canManage ? (
            <Link
              to="/expenditure/recurring-bills/new"
              className="inline-flex h-[46px] shrink-0 items-center gap-2 rounded-sm bg-primary-700 px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-6" />
              {t('recurringBills.add')}
            </Link>
          ) : null}
        </div>

        {summary.read.status === 'failed' ? (
          <ApiReadFailure error={summary.read.error} retry={summary.retry} />
        ) : null}
        {totals ? (
          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              icon={calBlueIcon}
              tint="bg-primary-50"
              title={t('recurringBills.kpi.expected')}
              meta={t('recurringBills.kpi.expectedMeta', {
                count: totals.recurringCount,
                active: totals.activeCount,
              })}
            >
              <OmAmount
                size="lg"
                amount={formatAmount(totals.expectedMonthly, totals.currencyCode, language)}
                amountClassName="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums"
              />
            </KpiCard>
            <KpiCard
              icon={calAlertIcon}
              tint="bg-pending-100"
              title={t('recurringBills.kpi.late')}
              meta={totals.lateDescription ?? t('recurringBills.kpi.noneLate')}
              link={
                totals.lateCount > 0
                  ? { label: t('recurringBills.kpi.chaseIt'), onClick: () => choose('LATE') }
                  : undefined
              }
            >
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
                {totals.lateCount}
              </p>
            </KpiCard>
            <KpiCard
              icon={kpiClockIcon}
              tint="bg-primary-50"
              title={t('recurringBills.kpi.next')}
              meta={totals.arrivingNextDescription ?? t('recurringBills.kpi.noneComing')}
            >
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
                {totals.arrivingNext
                  ? formatDate(totals.arrivingNext, language)
                  : t('recurringBills.kpi.nothing')}
              </p>
            </KpiCard>
          </div>
        ) : null}

        {notice ? (
          <Notice
            body={'key' in notice ? t(notice.key, notice.values) : notice.body}
            action={{ label: t('common.close'), onClick: () => setNotice(null) }}
          />
        ) : null}

        <section className="overflow-hidden rounded-md bg-surface-card">
          <div
            role="tablist"
            className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4 max-md:gap-x-5"
          >
            {RECURRING_TABS.map((entry) => {
              const active = entry === tab
              return (
                <button
                  key={entry}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => choose(entry)}
                  className={[
                    'relative flex items-center gap-1.5 pb-3 text-base leading-[1.2] transition-colors',
                    active
                      ? 'font-semibold text-primary-800'
                      : 'font-medium text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(`recurringBills.tab.${entry}`)}
                  {counts[entry] !== null ? (
                    <span
                      className={[
                        'inline-flex h-[18px] items-center justify-center rounded-full bg-primary-25 px-1.5 text-xs font-semibold',
                        active ? 'text-primary-800' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {counts[entry]}
                    </span>
                  ) : null}
                  {active ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-800" />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
            <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
              <img src={searchIcon} alt="" className="size-5 shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('recurringBills.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <div className="flex items-center gap-3">
              <FilterMenu
                label={t('billsPage.filters')}
                value={category}
                defaultValue=""
                onChange={setCategory}
                options={[
                  { value: '', label: t('recurringBills.allCategories') },
                  ...categories.map((name) => ({ value: name, label: name })),
                ]}
                icon={filterIcon}
              />
              <SortMenu
                value={sort}
                onChange={setSort}
                options={RECURRING_SORTS.map((value) => ({
                  value,
                  labelKey: `recurringBills.sortOptions.${value}`,
                }))}
              />
            </div>
          </div>

          {list.read.status === 'loading' ? <LoadingNotice /> : null}
          {list.read.status === 'failed' ? (
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          ) : null}

          {data ? (
            <div className="flex flex-col gap-3 px-6 pb-6">
              {rows.length === 0 ? (
                <p className="py-12 text-center text-sm font-medium text-text-tertiary">
                  {t('recurringBills.empty')}
                </p>
              ) : null}
              {rows.map((bill) => (
                <Row
                  key={bill.id}
                  bill={bill}
                  today={today}
                  canManage={canManage}
                  busy={busy === bill.id}
                  onToggle={() => void act(bill, 'toggle')}
                  onChase={() => void act(bill, 'chase')}
                />
              ))}
              {page > 0 || hasMore(data) ? (
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage((current) => Math.max(current - 1, 0))}
                    className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary disabled:opacity-40"
                  >
                    {t('common.previous')}
                  </button>
                  <button
                    type="button"
                    disabled={!hasMore(data)}
                    onClick={() => setPage((current) => current + 1)}
                    className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary disabled:opacity-40"
                  >
                    {t('common.next')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </>
  )
}

function KpiCard({
  icon,
  tint,
  title,
  children,
  meta,
  link,
}: {
  icon: string
  tint: string
  title: string
  children: React.ReactNode
  meta: string
  link?: { label: string; onClick: () => void }
}) {
  return (
    <article className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
      <div className="flex items-center gap-3.5">
        <span
          className={['flex size-11 shrink-0 items-center justify-center rounded-full', tint].join(
            ' ',
          )}
        >
          <img src={icon} alt="" className="size-6" />
        </span>
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
      </div>
      {children}
      <p className="text-sm font-medium leading-[1.3] text-text-tertiary">{withRial(meta)}</p>
      {link ? (
        <button
          type="button"
          onClick={link.onClick}
          className="inline-flex w-fit items-center gap-0.5 text-base font-semibold leading-[1.2] text-primary-800 transition-colors hover:text-primary-900"
        >
          {link.label}
          <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
        </button>
      ) : null}
    </article>
  )
}

function Row({
  bill,
  today,
  canManage,
  busy,
  onToggle,
  onChase,
}: {
  bill: RecurringBillDto
  today: string
  canManage: boolean
  busy: boolean
  onToggle: () => void
  onChase: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const glyph = GLYPH[categoryGlyph(bill.category)]
  const cadence = cadenceNote(bill, language)
  const note = stateNote(bill)
  const tone = toneOf(bill)
  const expectation = bill.expectation
  const pill = !bill.active
    ? PILL.muted
    : tone === 'warn'
      ? PILL.warn
      : tone === 'ok'
        ? PILL.ok
        : PILL.due
  const day = (iso: string) => formatDate(iso, language)
  const ended = isEnded(bill)
  // A row paused with its supplier offers Resume only once the supplier's record says it is back
  // on; that record is read for such a row alone. One that cannot be read leaves the server to say.
  const heldBySupplier =
    !bill.active && !ended && bill.pauseReason === 'SUPPLIER_SWITCHED_OFF' && bill.supplierId
      ? bill.supplierId
      : null
  const holder = useApiRead<SupplierDetailDto>(
    heldBySupplier && canManage ? supplierPath(heldBySupplier) : null,
    () => loadSupplier(heldBySupplier!),
  )
  const resumable = canResume(
    bill,
    !heldBySupplier
      ? false
      : holder.read.status === 'ready'
        ? holder.read.data.profile.status === 'SWITCHED_OFF'
        : holder.read.status === 'failed'
          ? false
          : null,
  )

  /** The middle column: what is expected, or what last came. */
  const timing = ended
    ? {
        heading: 'recurringBills.state.ended',
        date: t('recurringBills.rows.nothingWatched'),
        note: null,
        tone: 'muted' as const,
      }
    : !bill.active
      ? {
          heading: 'recurringBills.timing.paused',
          date: t('recurringBills.rows.nothingWatched'),
          note: { key: 'recurringBills.rows.resumeToWatch' },
          tone: 'muted' as const,
        }
      : bill.mode === 'RAISE'
        ? {
            heading: 'recurringBills.timing.nextRaised',
            date: bill.nextRunDate ? day(bill.nextRunDate) : t('recurringBills.kpi.nothing'),
            note: { key: 'recurringBills.rows.raisedByFawtir' },
            tone: 'muted' as const,
          }
        : expectation?.state === 'LATE'
          ? {
              heading: 'recurringBills.timing.expected',
              date: expectation.expectedOn ? day(expectation.expectedOn) : '',
              note: { key: 'recurringBills.rows.nothingArrived' },
              tone: 'warn' as const,
            }
          : expectation?.state === 'DUE_TO_ARRIVE'
            ? {
                heading: 'recurringBills.timing.expected',
                date: expectation.expectedOn ? day(expectation.expectedOn) : '',
                note: {
                  key: 'recurringBills.rows.inDays',
                  values: {
                    count: expectation.expectedOn
                      ? Math.max(0, daysBetween(today, expectation.expectedOn))
                      : 0,
                  },
                },
                tone: 'muted' as const,
              }
            : expectation?.lastArrivedOn
              ? {
                  heading: 'recurringBills.timing.lastArrived',
                  date: day(expectation.lastArrivedOn),
                  note: { key: 'recurringBills.rows.arrivedAndMatched' },
                  tone: 'ok' as const,
                }
              : {
                  heading: 'recurringBills.timing.expected',
                  date: t('recurringBills.kpi.nothing'),
                  note: { key: 'recurringBills.state.watching' },
                  tone: 'muted' as const,
                }

  const variance = expectation?.variancePercent ?? bill.lastVariancePercent
  const amountNote =
    variance !== null && variance !== 0
      ? {
          key: 'recurringBills.rows.onTheLast',
          values: { percent: formatVariance(variance) },
          tone: 'warn' as const,
        }
      : bill.interval === 'ANNUALLY' && bill.nextRunDate
        ? {
            key: 'recurringBills.rows.nextDue',
            values: { month: monthYear(bill.nextRunDate, language) },
            tone: 'muted' as const,
          }
        : { key: `recurringBills.rows.per.${bill.interval}`, tone: 'muted' as const }

  const action = !bill.active
    ? resumable
      ? { key: 'recurringBills.actions.resume', onClick: onToggle, filled: false }
      : null
    : expectation?.state === 'LATE' && chaseBlocker(bill) === null
      ? { key: 'recurringBills.actions.chase', onClick: onChase, filled: true }
      : null

  return (
    <article className="flex flex-wrap items-center gap-4 rounded-sm border border-border-subtle p-4">
      <span
        className={[
          'flex size-[52px] shrink-0 items-center justify-center rounded-sm',
          glyph.tile,
        ].join(' ')}
      >
        <img src={glyph.icon} alt="" className="size-6" />
      </span>

      <div className="min-w-[190px] flex-1">
        <Link
          to={`/expenditure/recurring-bills/${bill.id}`}
          className="text-base font-semibold leading-[1.2] text-text-primary hover:text-primary-700"
        >
          {bill.description}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium leading-[1.2] text-text-tertiary">
            {bill.supplierName}
          </span>
          <span className="inline-flex items-center rounded-[3px] bg-surface-background px-2 py-1 text-xs font-medium leading-[1.2] text-text-tertiary">
            {t(
              cadence.key,
              cadence.values
                ? {
                    ...cadence.values,
                    weekday: cadence.values.weekday ? t(String(cadence.values.weekday)) : undefined,
                  }
                : undefined,
            )}
          </span>
        </div>
      </div>

      <div className="min-w-[150px] md:w-[220px]">
        <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
          {t(timing.heading)}
        </p>
        <p className="mt-1 text-base font-semibold leading-[1.2] text-text-primary">
          {timing.date}
        </p>
        {timing.note ? (
          <p
            className={['mt-1 text-xs font-medium leading-[1.2]', NOTE_TONE[timing.tone]].join(' ')}
          >
            {t(timing.note.key, 'values' in timing.note ? timing.note.values : undefined)}
          </p>
        ) : null}
      </div>

      <div className="min-w-[140px] text-end">
        <OmAmount
          size="sm"
          className="justify-end"
          amount={formatAmount(bill.totalIncludingVat, bill.currencyCode, language)}
          amountClassName="text-[22px] font-semibold leading-[1.2] text-text-secondary tabular-nums"
        />
        <p
          className={['mt-1 text-xs font-medium leading-[1.2]', NOTE_TONE[amountNote.tone]].join(
            ' ',
          )}
        >
          {t(amountNote.key, amountNote.values)}
        </p>
      </div>

      <div className="flex min-w-[180px] flex-col items-start gap-2 md:w-[250px]">
        <span
          className={[
            'inline-flex items-center gap-2 rounded-sm px-3 py-1 text-sm font-semibold leading-[1.2]',
            pill,
          ].join(' ')}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {t(
            note.key,
            note.values
              ? {
                  ...note.values,
                  date: note.values.date ? day(String(note.values.date)) : undefined,
                }
              : undefined,
          )}
        </span>
        {action && canManage ? (
          <button
            type="button"
            disabled={busy}
            onClick={action.onClick}
            className={[
              'inline-flex h-[34px] items-center gap-1 rounded-sm px-3 text-xs font-semibold leading-[1.2] transition-colors disabled:opacity-50',
              action.filled
                ? 'bg-pending-700 text-white hover:bg-[#5b4a2f]'
                : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
            ].join(' ')}
          >
            {t(action.key)}
          </button>
        ) : expectation?.state === 'ARRIVED_OUT_OF_RANGE' && bill.active ? (
          <Link
            to={`/expenditure/recurring-bills/${bill.id}`}
            className="inline-flex h-[34px] items-center gap-1 rounded-sm border border-border-subtle bg-white px-3 text-xs font-semibold leading-[1.2] text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('recurringBills.actions.whyTheJump')}
            <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
          </Link>
        ) : null}
      </div>

      <ActionMenu
        label={t('recurringBills.rowMenu')}
        floating
        items={[
          {
            id: 'open',
            labelKey: 'recurringBills.menu.open',
            icon: viewIcon,
            to: `/expenditure/recurring-bills/${bill.id}`,
          },
          ...(canManage
            ? [
                {
                  id: 'edit',
                  labelKey: 'recurringBills.menu.edit',
                  icon: editIcon,
                  to: `/expenditure/recurring-bills/${bill.id}/edit`,
                },
                ...(bill.active || resumable
                  ? [
                      {
                        id: 'pause',
                        labelKey: bill.active
                          ? 'recurringBills.menu.pause'
                          : 'recurringBills.menu.resume',
                        icon: pauseIcon,
                        onSelect: onToggle,
                      },
                    ]
                  : []),
              ]
            : []),
        ]}
      />
    </article>
  )
}
