import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, RialMark, RowsView, SortMenu, withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  loadRuns,
  runsListPath,
  type PaymentRunDto,
  type PaymentRunState,
} from '../../api/expenditure/paymentRuns'
import { formatAmount, formatCount, formatDate, formatInstantDay } from '../../lib/format'
import { RUN_STATES } from '../../lib/paymentRuns'
import { can, useSession } from '../../lib/session/session'
import { Amount, PRIMARY_BUTTON, RunStatePill } from './RunParts'
import plusIcon from '../../assets/bill-capture/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import viewIcon from '../../assets/actions/view.svg'
import kpiDraftIcon from '../../assets/bills/kpi-attention.svg'
import kpiScheduledIcon from '../../assets/bills/kpi-due.svg'
import kpiPaidIcon from '../../assets/bills/kpi-ready.svg'
import kpiCountIcon from '../../assets/bills/kpi-payable.svg'

/**
 * Expenditure › Payments: every run, by state, and the way into a new one.
 *
 * The Payments frame (163:16960) draws the run itself; this list has no frame of its own. It
 * follows the other Expenditure lists (owner, 4 Nov 2026): four summary cards, tabs with counts,
 * a search and sort toolbar, the dark table head and a row menu, as on Bills. The cards and counts
 * are worked out from the full list of runs (`GET /v1/payment-runs`), which the server already
 * sends whole; the table keeps its own state-filtered read. It has no bank format column: Fawtir
 * makes no bank files (owner, 9 Oct 2026).
 */
/**
 * The tabs. No run reaches "Sent to bank" now that no file is made; a run sent before that still
 * shows under All, with its pill.
 */
const LISTED_STATES = RUN_STATES.filter((entry) => entry !== 'EXPORTED')

type RunSort = 'newest' | 'oldest' | 'dateSoonest' | 'amountHigh' | 'amountLow'
const RUN_SORTS: { value: RunSort; labelKey: string }[] = [
  { value: 'newest', labelKey: 'paymentRuns.sort.newest' },
  { value: 'oldest', labelKey: 'paymentRuns.sort.oldest' },
  { value: 'dateSoonest', labelKey: 'paymentRuns.sort.dateSoonest' },
  { value: 'amountHigh', labelKey: 'paymentRuns.sort.amountHigh' },
  { value: 'amountLow', labelKey: 'paymentRuns.sort.amountLow' },
]
const runDay = (run: PaymentRunDto) => run.paidOn ?? run.paymentDate
const runAmount = (run: PaymentRunDto) =>
  run.state === 'PAID' && run.paidTotal != null ? run.paidTotal : run.netTotal

function sortRuns(runs: PaymentRunDto[], sort: RunSort): PaymentRunDto[] {
  const byCreated = (a: PaymentRunDto, b: PaymentRunDto) => a.createdAt.localeCompare(b.createdAt)
  const copy = [...runs]
  switch (sort) {
    case 'oldest':
      return copy.sort(byCreated)
    case 'dateSoonest':
      // Undated runs last.
      return copy.sort((a, b) => (runDay(a) ?? '9999').localeCompare(runDay(b) ?? '9999'))
    case 'amountHigh':
      return copy.sort((a, b) => runAmount(b) - runAmount(a))
    case 'amountLow':
      return copy.sort((a, b) => runAmount(a) - runAmount(b))
    default:
      return copy.sort((a, b) => byCreated(b, a))
  }
}

/** Today in Muscat, the day the "paid this month" card counts from. */
function muscatMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' })
    .format(new Date())
    .slice(0, 7)
}

export function PaymentRunsListPage() {
  return (
    <AppShell>
      <PaymentRunsList />
    </AppShell>
  )
}

function PaymentRunsList() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const [state, setState] = useState<PaymentRunState | null>(null)
  const path = runsListPath(state)
  const runs = useApiRead<PaymentRunDto[]>(path, () => loadRuns(path))
  // Every run, for the cards and the tab counts; the same read as the table's when on All.
  const allPath = runsListPath(null)
  const all = useApiRead<PaymentRunDto[]>(allPath, () => loadRuns(allPath))
  const [typed, setTyped] = useState('')
  const [sort, setSort] = useState<RunSort>('newest')
  const allRuns = all.read.status === 'ready' ? all.read.data : null
  const shown = useMemo(() => {
    if (runs.read.status !== 'ready') return []
    const query = typed.trim().toLowerCase()
    const matched = query
      ? runs.read.data.filter((run) =>
          [run.reference, run.runReference ?? ''].some((text) =>
            text.toLowerCase().includes(query),
          ),
        )
      : runs.read.data
    return sortRuns(matched, sort)
  }, [runs.read, typed, sort])
  const countOf = (entry: PaymentRunState | null) =>
    allRuns === null
      ? null
      : entry === null
        ? allRuns.length
        : allRuns.filter((run) => run.state === entry).length

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[720px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('paymentRuns.title')}
          </h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('paymentRuns.subtitle')}
          </p>
        </div>
        {can(session, 'invoice.payment.manage') ? (
          <Link to="/expenditure/payments/new" className={PRIMARY_BUTTON}>
            <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
            {t('paymentRuns.newRun')}
          </Link>
        ) : null}
      </div>

      {allRuns !== null ? <RunKpiCards runs={allRuns} /> : null}

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div
          role="tablist"
          className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4 max-md:gap-x-5"
        >
          {[null, ...LISTED_STATES].map((entry) => {
            const active = state === entry
            return (
              <button
                key={entry ?? 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setState(entry)}
                className={[
                  'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {entry ? t(`paymentRuns.state.${entry}`) : t('paymentRuns.all')}
                {countOf(entry) !== null ? (
                  <span
                    aria-hidden="true"
                    className={[
                      'inline-flex h-[18px] items-center justify-center rounded-full bg-primary-25 px-1.5 text-xs font-semibold',
                      active ? 'text-primary-800' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {formatCount(countOf(entry)!, i18n.language)}
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
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t('paymentRuns.searchPlaceholder')}
              aria-label={t('paymentRuns.searchPlaceholder')}
              maxLength={100}
              className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          {/* TODO(backend): EXPENDITURE.md row 2.35, payment-run export; no export endpoint yet, so
              the toolbar draws Sort only (owner, 4 Nov 2026). */}
          <SortMenu
            value={sort}
            options={RUN_SORTS}
            label={t('billsPage.sort')}
            width={240}
            onChange={setSort}
          />
        </div>

        {runs.read.status === 'loading' ? (
          <LoadingNotice />
        ) : runs.read.status === 'failed' ? (
          <ApiReadFailure error={runs.read.error} retry={runs.retry} />
        ) : shown.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm font-medium text-text-quaternary">
            {typed.trim()
              ? t('paymentRuns.noMatch')
              : state
                ? t('paymentRuns.noneInState')
                : t('paymentRuns.none')}
          </p>
        ) : (
          <RowsView>
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                  <th className="px-6 py-3 text-start font-semibold">{t('paymentRuns.col.run')}</th>
                  <th className="px-3 py-3 text-start font-semibold">
                    {t('paymentRuns.col.state')}
                  </th>
                  <th className="px-3 py-3 text-start font-semibold">
                    {t('paymentsPage.paymentDate')}
                  </th>
                  <th className="px-3 py-3 text-start font-semibold">
                    {t('paymentsPage.runReference')}
                  </th>
                  <th className="px-3 py-3 text-end font-semibold">
                    {t('paymentsPage.leavingYourAccount')}
                  </th>
                  <th className="w-12 py-3 pe-4" />
                </tr>
              </thead>
              <tbody>
                {shown.map((run) => {
                  // A paid run is dated the day it was paid (`paidOn`, backend #480); a server
                  // without it shows the planned date, as before.
                  const day = run.paidOn ?? run.paymentDate
                  // A paid run with bills taken out: what left the account is what was paid.
                  const split =
                    run.state === 'PAID' && run.paidTotal != null && (run.takenOutTotal ?? 0) > 0
                  return (
                    <tr key={run.id} className="border-b border-surface-background last:border-0">
                      <td className="px-6 py-4">
                        <Link
                          to={`/expenditure/payments/${run.id}`}
                          className="text-sm font-semibold text-primary-700 hover:underline"
                        >
                          {run.reference}
                        </Link>
                        <p className="mt-1 text-xs font-medium text-text-quaternary">
                          {t('paymentRuns.createdOn', {
                            date: formatInstantDay(run.createdAt, i18n.language),
                          })}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <RunStatePill state={run.state} />
                      </td>
                      <td className="px-3 py-4 text-sm font-medium text-text-secondary">
                        {day ? formatDate(day, i18n.language) : t('paymentRuns.noDate')}
                      </td>
                      <td className="px-3 py-4 text-sm font-medium text-text-secondary">
                        {run.runReference ?? t('paymentRuns.noReference')}
                      </td>
                      <td className="px-3 py-4 text-end">
                        {/* A cancelled run pays nothing, whatever its bills added up to. */}
                        {run.state === 'CANCELLED' ? (
                          <span className="text-sm font-medium text-text-quaternary">
                            {t('paymentRuns.nothingSent')}
                          </span>
                        ) : (
                          <>
                            <Amount
                              value={split ? run.paidTotal! : run.netTotal}
                              currency={run.currency}
                              className="text-sm font-semibold text-text-primary"
                            />
                            {/* A paid run with bills taken out: what was paid and what was not,
                                under its total, as on the run itself (owner, 9 Oct 2026, D2). */}
                            {split ? (
                              <p className="mt-0.5 text-end text-[10px] font-medium leading-[1.2] text-text-muted">
                                {withRial(
                                  t('paymentRuns.paidAndTakenOut', {
                                    paid: `${run.currency} ${formatAmount(run.paidTotal!, run.currency, i18n.language)}`,
                                    takenOut: `${run.currency} ${formatAmount(run.takenOutTotal!, run.currency, i18n.language)}`,
                                  }),
                                )}
                              </p>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="py-4 pe-4 text-end">
                        <ActionMenu
                          floating
                          label={t('paymentRuns.rowMenuLabel', { reference: run.reference })}
                          items={[
                            {
                              id: 'open',
                              labelKey: 'paymentRuns.openRun',
                              icon: viewIcon,
                              to: `/expenditure/payments/${run.id}`,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </RowsView>
        )}
      </section>
    </div>
  )
}

/** The four figures over the list, worked out from every run, in the Bills cards' style. */
function RunKpiCards({ runs }: { runs: PaymentRunDto[] }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const currency = runs[0]?.currency ?? 'OMR'
  const money = (value: number) => formatAmount(value, currency, language)
  const sum = (list: PaymentRunDto[]) => list.reduce((total, run) => total + runAmount(run), 0)
  const drafts = runs.filter((run) => run.state === 'DRAFT')
  const scheduled = runs.filter((run) => run.state === 'SCHEDULED' || run.state === 'EXPORTED')
  const nextDate = scheduled
    .map((run) => run.paymentDate)
    .filter((day): day is string => day !== null)
    .sort()[0]
  const month = muscatMonth()
  const paidThisMonth = runs.filter(
    (run) => run.state === 'PAID' && (runDay(run) ?? run.paidAt ?? '').startsWith(month),
  )
  const cards = [
    {
      id: 'drafts',
      icon: kpiDraftIcon,
      tint: 'bg-neutral-25',
      title: t('paymentRuns.kpi.drafts'),
      figure: money(sum(drafts)),
      meta: t('paymentRuns.kpi.runs', { count: drafts.length }),
    },
    {
      id: 'scheduled',
      icon: kpiScheduledIcon,
      tint: 'bg-primary-50',
      title: t('paymentRuns.kpi.scheduled'),
      figure: money(sum(scheduled)),
      meta: [
        t('paymentRuns.kpi.runs', { count: scheduled.length }),
        nextDate ? t('paymentRuns.kpi.next', { date: formatDate(nextDate, language) }) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {
      id: 'paid',
      icon: kpiPaidIcon,
      tint: 'bg-success-100',
      title: t('paymentRuns.kpi.paidMonth'),
      figure: money(sum(paidThisMonth)),
      meta: t('paymentRuns.kpi.runs', { count: paidThisMonth.length }),
    },
    {
      id: 'all',
      icon: kpiCountIcon,
      tint: 'bg-pending-100',
      title: t('paymentRuns.kpi.allRuns'),
      figure: formatCount(runs.length, language),
      money: false,
      meta: t('paymentRuns.kpi.cancelled', {
        count: runs.filter((run) => run.state === 'CANCELLED').length,
      }),
    },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((kpi) => (
        <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-2">
            <span
              className={[
                'flex size-[45px] shrink-0 items-center justify-center rounded-full',
                kpi.tint,
              ].join(' ')}
            >
              <img src={kpi.icon} alt="" className="size-6" />
            </span>
            <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">{kpi.title}</h3>
          </div>
          <div className="flex items-center gap-1 text-text-secondary">
            {kpi.money === false ? null : <RialMark className="w-8 shrink-0" />}
            <p className="text-[32px] font-semibold leading-[1.2] tabular-nums">{kpi.figure}</p>
          </div>
          <p className="text-sm font-medium leading-[1.4] text-text-tertiary">{kpi.meta}</p>
        </article>
      ))}
    </div>
  )
}
