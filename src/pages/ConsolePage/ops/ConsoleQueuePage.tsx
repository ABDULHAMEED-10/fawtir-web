import { useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice } from '../../../layouts/ConsoleShell/ConsoleNotice'
import {
  ConsoleStatusPill,
  type ConsolePillTone,
} from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import {
  ConsoleClockIcon,
  ConsoleIncidentIcon,
  ConsoleQueueIcon,
  ConsoleTickIcon,
} from '../../../layouts/ConsoleShell/consoleIcons'
import { FilterMenu, OmAmount, Pager, RowsView } from '../../../components/ui'
import { count, omr, percent, PLATFORM } from '../../../lib/superAdmin'
import { localeFor } from '../../../lib/console/format'
import { tenantName } from '../../../lib/consoleErp'
import {
  NOW,
  consoleOpsStore,
  queueKpis,
  submissionsIn,
  useConsoleOps,
  waitingMinutes,
  type DocumentKind,
  type Lane,
  type Stage,
  type Submission,
} from '../../../lib/consoleOps'
import { QueueKpiCard } from '../subscriptions/QueueKpiCard'
import searchIcon from '../../../assets/dashboard/search.svg'

/**
 * The cross-tenant submission queue — docs/erp-and-console-plan.md §9.3. What is on its way to
 * the Tax Authority or over Peppol right now, what got stuck on the way and what the OTA refused
 * today. The Operations home's "Open the queue" lands here.
 *
 * The lane comes from `?lane=` so the home, a notice or a bookmark can open the stuck or refused
 * lane directly.
 */

const LANES: Lane[] = ['waiting', 'stuck', 'refused', 'done']
const PIPELINE: Stage[] = ['queued', 'validating', 'signing', 'sending', 'awaitingOta']
const KINDS: DocumentKind[] = ['invoice', 'creditNote', 'debitNote', 'selfBilling', 'posReceipt']
const PAGE_SIZE = 15

type KindFilter = 'all' | DocumentKind

/** One tone per stage, so the strip, the pill and the KPI never disagree about a colour. */
const STAGE_TONE: Record<Stage, ConsolePillTone> = {
  queued: 'neutral',
  validating: 'neutral',
  signing: 'neutral',
  sending: 'pending',
  awaitingOta: 'pending',
  stuck: 'danger',
  refused: 'danger',
  accepted: 'success',
}

export function StagePill({ stage }: { stage: Stage }) {
  const { t } = useTranslation()
  return <ConsoleStatusPill tone={STAGE_TONE[stage]} label={t(`console.queue.stage.${stage}`)} />
}

const isLane = (value: string | null): value is Lane => LANES.includes(value as Lane)

/** "12 s" under a minute, "6 min" under an hour, "2 h 5 min" after that. */
function waitLabel(t: TFunction, s: Submission) {
  const seconds = Math.max(0, Math.round((NOW.getTime() - s.since.getTime()) / 1000))
  if (seconds < 60) return t('console.queue.wait.seconds', { count: seconds })
  const minutes = waitingMinutes(s)
  if (minutes < 60) return t('console.queue.wait.minutes', { count: minutes })
  return t('console.queue.wait.hours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
}

/** The store's rows in the order an operator works them: oldest first, accepted newest first. */
function orderFor(lane: Lane) {
  return (a: Submission, b: Submission) =>
    lane === 'done' ? b.since.getTime() - a.since.getTime() : a.since.getTime() - b.since.getTime()
}

export function ConsoleQueuePage() {
  const { t, i18n } = useTranslation()
  const ops = useConsoleOps()
  const [searchParams, setSearchParams] = useSearchParams()
  const laneParam = searchParams.get('lane')
  const lane: Lane = isLane(laneParam) ? laneParam : 'waiting'
  const [stageFilter, setStageFilter] = useState<Stage | null>(null)
  const [kind, setKind] = useState<KindFilter>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [done, setDone] = useState<string | null>(null)

  const kpis = queueKpis(ops)
  const timeOf = (date: Date) =>
    new Intl.DateTimeFormat(localeFor(i18n.language), {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)

  const setLane = (next: Lane) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'waiting') params.delete('lane')
    else params.set('lane', next)
    setSearchParams(params, { replace: true })
    setStageFilter(null)
    setPage(1)
  }
  const pickStage = (stage: Stage) => {
    // A chip on the strip narrows the waiting lane to that stage; the same chip again clears it.
    if (lane !== 'waiting') setLane('waiting')
    setStageFilter((current) => (current === stage ? null : stage))
    setPage(1)
  }

  const needle = query.trim().toLowerCase()
  const rows = useMemo(() => {
    const listed = submissionsIn(ops, lane)
      .filter((s) => (stageFilter ? s.stage === stageFilter : true))
      .filter((s) => (kind === 'all' ? true : s.kind === kind))
      .filter((s) =>
        needle ? `${s.documentNo} ${tenantName(s.tenantId)}`.toLowerCase().includes(needle) : true,
      )
    return listed.sort(orderFor(lane))
  }, [ops, lane, stageFilter, kind, needle])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const laneCount = (id: Lane) => submissionsIn(ops, id).length

  const redrive = (s: Submission) => {
    consoleOpsStore.redrive(s.id)
    setDone(t('console.queue.done.redriven', { document: s.documentNo }))
  }
  const notify = (s: Submission) => {
    consoleOpsStore.notifyTenant(s.id)
    setDone(
      t('console.queue.done.notified', { document: s.documentNo, tenant: tenantName(s.tenantId) }),
    )
  }

  const showsError = lane === 'stuck' || lane === 'refused'
  const showsActions = showsError

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.queue' }]} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('console.queue.title')}
            </h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
              {t('console.queue.subtitle', {
                waiting: count(kpis.waiting),
                stuck: kpis.stuck,
                refused: count(kpis.refusedToday),
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <Link
              to="/console/incidents"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('console.queue.incidentsLink')}
            </Link>
            <Link
              to="/console"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('console.queue.operationsLink')}
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <QueueKpiCard
            icon={<ConsoleClockIcon className="size-[18px] text-pending-700" />}
            title={t('console.queue.kpi.waiting')}
            value={count(kpis.waiting)}
            note={t('console.queue.kpi.waitingNote', {
              oldest: kpis.oldestWaitMinutes,
              normal: PLATFORM.normalWaitSeconds,
            })}
            tone="watch"
          />
          <QueueKpiCard
            icon={<ConsoleIncidentIcon className="size-[18px] text-danger-700" />}
            title={t('console.queue.kpi.stuck')}
            value={String(kpis.stuck)}
            note={t('console.queue.kpi.stuckNote')}
            tone={kpis.stuck > 0 ? 'bad' : 'calm'}
          />
          <QueueKpiCard
            icon={<ConsoleQueueIcon className="size-[18px] text-primary-700" />}
            title={t('console.queue.kpi.refused')}
            value={count(kpis.refusedToday)}
            note={t('console.queue.kpi.refusedNote', {
              share: percent(kpis.refusedToday / kpis.acceptedToday),
            })}
          />
          <QueueKpiCard
            icon={<ConsoleTickIcon className="size-[18px] text-success-700" />}
            title={t('console.queue.kpi.accepted')}
            value={count(kpis.acceptedToday)}
            note={t('console.queue.kpi.acceptedNote', {
              share: percent(PLATFORM.acceptedFirstTimeToday),
            })}
          />
        </div>

        {done ? (
          <ConsoleNotice
            badge={t('console.queue.done.badge')}
            body={done}
            action={{ label: t('console.queue.done.dismiss'), onClick: () => setDone(null) }}
          />
        ) : null}

        {/* The pipeline: every stage a document passes through, with what is at each one now. */}
        <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md bg-surface-card px-6 py-4">
          <ol className="flex flex-wrap items-center gap-y-2 max-md:gap-x-2">
            {PIPELINE.map((stage, index) => {
              const active = stageFilter === stage
              return (
                <li key={stage} className="flex items-center">
                  {index > 0 ? (
                    // The connector only reads as a pipeline on one line; stacked on a phone it dangles.
                    <span
                      aria-hidden="true"
                      className="mx-1.5 h-px w-4 bg-border-default max-md:hidden"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => pickStage(stage)}
                    aria-pressed={active}
                    className={[
                      'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors',
                      active
                        ? 'border-primary-700 bg-primary-700 text-white'
                        : 'border-border-subtle bg-white text-text-secondary hover:border-border-brand-subtle hover:bg-primary-25',
                    ].join(' ')}
                  >
                    {t(`console.queue.stage.${stage}`)}
                    <span
                      className={[
                        'text-xs font-semibold',
                        active ? 'text-white/80' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {kpis.byStage[stage]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-2 md:ms-auto">
            <button
              type="button"
              onClick={() => setLane('stuck')}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-danger-100 px-3 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100/70"
            >
              {t('console.queue.stage.stuck')}
              <span className="text-xs font-semibold">{kpis.byStage.stuck}</span>
            </button>
            <button
              type="button"
              onClick={() => setLane('refused')}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-danger-100 px-3 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100/70"
            >
              {t('console.queue.stage.refused')}
              <span className="text-xs font-semibold">{kpis.byStage.refused}</span>
            </button>
          </div>
        </section>

        <section className="flex flex-col rounded-md bg-surface-card">
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border-subtle px-6 pt-4">
            {LANES.map((id) => {
              const active = id === lane
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLane(id)}
                  aria-pressed={active}
                  className={[
                    'relative flex items-center gap-1.5 pb-3 text-base transition-colors',
                    active
                      ? 'font-semibold text-primary-800'
                      : 'font-medium text-text-tertiary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(`console.queue.lane.${id}`)}
                  <span className="text-xs font-semibold text-text-quaternary">
                    {laneCount(id)}
                  </span>
                  {active ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary-700" />
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
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
                placeholder={t('console.queue.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
              {stageFilter ? (
                <button
                  type="button"
                  onClick={() => setStageFilter(null)}
                  className="inline-flex h-11 items-center gap-2 rounded-sm border border-primary-700 bg-primary-25 px-4 text-sm font-semibold text-primary-800"
                >
                  {t(`console.queue.stage.${stageFilter}`)}
                  <span aria-hidden="true">×</span>
                </button>
              ) : null}
              <FilterMenu<KindFilter>
                label={t('console.queue.filter.kind')}
                value={kind}
                defaultValue="all"
                onChange={(value) => {
                  setKind(value)
                  setPage(1)
                }}
                width={200}
                options={[
                  { value: 'all', label: t('console.queue.filter.kindAll') },
                  ...KINDS.map((id) => ({ value: id, label: t(`console.queue.kind.${id}`) })),
                ]}
              />
            </div>
          </div>

          <RowsView className="px-6 pb-6">
            <table className="w-full min-w-[1000px] border-collapse text-start">
              <thead>
                <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                  <th className="px-4 py-3 text-start font-semibold">
                    {t('console.queue.col.tenant')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.queue.col.document')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.queue.col.stage')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t(
                      lane === 'done' ? 'console.queue.col.accepted' : 'console.queue.col.waiting',
                    )}
                  </th>
                  <th className="px-2 py-3 text-end font-semibold">
                    {t('console.queue.col.attempts')}
                  </th>
                  <th className="px-2 py-3 text-end font-semibold">
                    {t('console.queue.col.amount')}
                  </th>
                  {showsError ? (
                    <th className="px-2 py-3 text-start font-semibold">
                      {t('console.queue.col.error')}
                    </th>
                  ) : null}
                  {showsActions ? <th className="w-[160px] px-2 py-3" /> : null}
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className="border-b border-[#f3f3f3] last:border-b-0">
                    <td className="px-4 py-4">
                      <Link
                        to={`/console/tenants/${s.tenantId}`}
                        className="text-sm font-medium leading-[1.2] text-text-primary transition-colors hover:text-primary-700"
                      >
                        {tenantName(s.tenantId)}
                      </Link>
                    </td>
                    <td className="px-2 py-4">
                      <bdi
                        dir="ltr"
                        className="block text-sm font-semibold text-text-primary !whitespace-nowrap"
                      >
                        {s.documentNo}
                      </bdi>
                      <span className="mt-1 block text-xs font-medium text-text-quaternary">
                        {t(`console.queue.kind.${s.kind}`)}
                      </span>
                    </td>
                    <td className="px-2 py-4">
                      <StagePill stage={s.stage} />
                    </td>
                    <td className="px-2 py-4">
                      <span
                        className={[
                          'block whitespace-nowrap text-sm font-medium',
                          lane === 'stuck' ? 'text-danger-700' : 'text-text-primary',
                        ].join(' ')}
                      >
                        {lane === 'done' ? timeOf(s.since) : waitLabel(t, s)}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-text-quaternary">
                        {t('console.queue.issuedAt', { time: timeOf(s.issuedAt) })}
                      </span>
                    </td>
                    <td className="px-2 py-4 text-end text-sm font-medium text-text-primary">
                      {s.attempts}
                    </td>
                    <td className="px-2 py-4 text-end">
                      <OmAmount
                        size="xs"
                        amount={omr(s.amount)}
                        className="whitespace-nowrap"
                        amountClassName="text-sm font-semibold text-text-primary"
                      />
                    </td>
                    {showsError ? (
                      <td className="px-2 py-4">
                        {s.error ? (
                          <>
                            <bdi
                              dir="ltr"
                              className="inline-flex h-6 items-center rounded-sm bg-danger-100 px-1.5 font-mono text-xs font-semibold text-danger-700"
                            >
                              {s.error.code}
                            </bdi>
                            <span className="mt-1 block max-w-[300px] text-xs font-medium leading-[1.4] text-text-tertiary">
                              {s.error.message}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-medium text-text-quaternary">—</span>
                        )}
                      </td>
                    ) : null}
                    {showsActions ? (
                      <td className="px-2 py-4 text-end">
                        {s.stage === 'stuck' && s.canRedrive ? (
                          <button
                            type="button"
                            onClick={() => redrive(s)}
                            className="inline-flex h-9 items-center rounded-sm bg-primary-700 px-3 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                          >
                            {t('console.queue.action.redrive')}
                          </button>
                        ) : null}
                        {s.stage === 'refused' ? (
                          s.tenantNotifiedAt ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex h-9 cursor-not-allowed items-center whitespace-nowrap rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-quaternary"
                            >
                              {t('console.queue.action.told', { time: timeOf(s.tenantNotifiedAt) })}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => notify(s)}
                              className="inline-flex h-9 items-center whitespace-nowrap rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                            >
                              {t('console.queue.action.notify')}
                            </button>
                          )
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
                {t('console.queue.noResults')}
              </p>
            ) : null}
          </RowsView>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-6 py-4">
            <div>
              <p className="text-sm font-medium text-text-tertiary">
                {rows.length === 0
                  ? t('console.queue.showingNone')
                  : t('console.queue.showing', {
                      from: (current - 1) * PAGE_SIZE + 1,
                      to: Math.min(current * PAGE_SIZE, rows.length),
                      total: rows.length,
                      lane: t(`console.queue.lane.${lane}`).toLowerCase(),
                    })}
              </p>
              {lane === 'waiting' ? (
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('console.queue.sampleNote', { waiting: count(kpis.waiting) })}
                </p>
              ) : null}
            </div>
            {pageCount > 1 ? (
              <Pager
                page={current}
                pageCount={pageCount}
                onChange={setPage}
                labels={{
                  nav: t('console.queue.pager.label'),
                  previous: t('console.queue.pager.previous'),
                  next: t('console.queue.pager.next'),
                }}
              />
            ) : null}
          </div>
        </section>
      </div>
    </ConsoleShell>
  )
}
