import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RowsView } from '../../../components/ui'
import { Pill } from '../ErpShell'
import { Kpi } from '../overview/Kpi'
import {
  Mono,
  PRIMARY_BUTTON,
  SectionCard,
  TBODY_ROW,
  TEXT_BUTTON,
  THEAD_ROW,
  Td,
  Th,
} from '../overview/idiom'
import {
  ConnectionShell,
  MappingStatusPill,
  RunStatePill,
  connectionPath,
  useConnection,
} from './ConnectionShell'
import { DangerZone, PauseResumeButton, Strip, dateTime, thousands, timeOf } from './detailShared'
import { useErpMapping } from '../../../lib/erpMapping'
import {
  addonUsage,
  connectorStore,
  mappingStatusOf,
  productName,
  runsFor,
  templateLabel,
  useConnector,
  watermarkAgeDays,
  watermarkIsStale,
  type CollectResult,
  type Connection,
} from '../../../lib/erpConnector'
import { shortDate } from '../../../lib/settings'
import watermarkIcon from '../../../assets/settings/tile-integration.svg'
import lastRunIcon from '../../../assets/settings/check-ink.svg'
import nextRunIcon from '../../../assets/settings/clock.svg'
import quotaIcon from '../../../assets/settings/folder.svg'

type Notice =
  | { kind: 'refused'; error: Extract<CollectResult, { ok: false }>['error'] }
  | { kind: 'collected'; fetched: number }

/**
 * Settings › Integration › Connected systems › connection › Overview (docs/erp-and-console-plan.md
 * §3, Appendix B "Detail · Overview").
 *
 * What the connection is doing right now, told first when something is wrong: the state banner,
 * then four figures (newest invoice, last run, next run, this month's allowance), how it is set up,
 * the last five runs, what happened recently, and — last — the one thing that cannot be undone.
 */
export function ConnectionOverviewPage() {
  const { t } = useTranslation()
  const connection = useConnection()
  const mapping = useErpMapping()
  const [notice, setNotice] = useState<Notice | null>(null)

  const collect = (c: Connection) => {
    const result = connectorStore.collectNow(c.id, mappingStatusOf(c, mapping))
    setNotice(
      result.ok
        ? { kind: 'collected', fetched: result.run.fetched }
        : { kind: 'refused', error: result.error },
    )
  }

  return (
    <ConnectionShell
      connection={connection}
      actions={
        connection && connection.state !== 'DISCONNECTED' ? (
          <>
            <button type="button" onClick={() => collect(connection)} className={PRIMARY_BUTTON}>
              {t('erp.connector.overview.actions.collectNow')}
            </button>
            <PauseResumeButton connection={connection} />
          </>
        ) : null
      }
    >
      {connection ? (
        <>
          {notice ? <CollectNotice notice={notice} connection={connection} /> : null}
          <StateBanners connection={connection} />
          <Figures connection={connection} />
          <SetupCard connection={connection} />
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <LastRuns connection={connection} />
            <RecentActivity connection={connection} />
          </div>
          <DangerZone connection={connection} />
        </>
      ) : null}
    </ConnectionShell>
  )
}

/** Why Collect now was refused, or what it did. */
function CollectNotice({ notice, connection }: { notice: Notice; connection: Connection }) {
  const { t } = useTranslation()
  if (notice.kind === 'collected')
    return (
      <Strip tone="success">
        {t('erp.connector.overview.collect.done', { count: notice.fetched })}
      </Strip>
    )
  const link =
    notice.error === 'NOT_CERTIFIED'
      ? { to: connectionPath(connection.id, 'mapping'), key: 'openMapping' }
      : notice.error === 'CREDENTIALS'
        ? { to: connectionPath(connection.id, 'settings'), key: 'openSettings' }
        : null
  return (
    <Strip
      tone={notice.error === 'CREDENTIALS' ? 'danger' : 'pending'}
      action={
        link ? (
          <Link to={link.to} className={TEXT_BUTTON}>
            {t(`erp.connector.overview.collect.${link.key}`)}
          </Link>
        ) : null
      }
    >
      {t(`erp.connector.overview.collect.refused.${notice.error}`)}
    </Strip>
  )
}

/** ERROR, PAUSED and a stale watermark each get their own line; more than one may show. */
function StateBanners({ connection: c }: { connection: Connection }) {
  const { t } = useTranslation()
  const pauseReason = c.pauseReason
  const age = watermarkAgeDays(c)
  return (
    <>
      {c.state === 'ERROR' ? (
        <Strip
          tone="danger"
          action={
            <Link to={connectionPath(c.id, 'settings')} className={TEXT_BUTTON}>
              {t('erp.connector.overview.banner.replaceCredentials')}
            </Link>
          }
        >
          {t(`erp.connector.overview.banner.error.${c.errorKey ?? 'threeFailures'}`, {
            count: c.consecutiveFailures,
          })}
        </Strip>
      ) : null}
      {c.state === 'PAUSED' && c.pausedAt ? (
        <Strip tone="pending">
          {t('erp.connector.overview.banner.paused', {
            date: shortDate(c.pausedAt),
            reason: pauseReason ? ` · ${pauseReason}` : '',
          })}
        </Strip>
      ) : null}
      {c.state === 'DISCONNECTED' ? (
        <Strip tone="neutral">{t('erp.connector.overview.banner.disconnected')}</Strip>
      ) : null}
      {watermarkIsStale(c) && c.watermark && age !== null ? (
        <Strip tone="pending">
          {t('erp.connector.overview.banner.stale', {
            count: age,
            erpNumber: c.watermark.erpNumber,
            date: shortDate(c.watermark.issuedAt),
          })}
        </Strip>
      ) : null}
    </>
  )
}

/** The four figures. */
function Figures({ connection: c }: { connection: Connection }) {
  const { t } = useTranslation()
  const state = useConnector()
  const usage = addonUsage(state)
  const lastRun = runsFor(state, c.id)[0]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* An ERP number is longer than a figure, so it is drawn a size down and may break. */}
      <FigureCard
        icon={watermarkIcon}
        label={t('erp.connector.overview.kpi.watermark')}
        value={
          <span
            dir="ltr"
            className={[
              'break-all text-[22px] font-semibold leading-[1.2] tabular-nums',
              watermarkIsStale(c) ? 'text-pending-700' : 'text-text-primary',
            ].join(' ')}
          >
            {c.watermark?.erpNumber ?? '—'}
          </span>
        }
        note={
          c.watermark
            ? t('erp.connector.overview.kpi.watermarkNote', {
                date: dateTime(c.watermark.issuedAt),
              })
            : t('erp.connector.overview.kpi.watermarkNone')
        }
      />
      {/* Last run carries a pill beside the time, which Kpi's plain `value` cannot hold. */}
      <FigureCard
        icon={lastRunIcon}
        label={t('erp.connector.overview.kpi.lastRun')}
        value={
          <>
            <span className="text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
              {c.lastRunAt ? timeOf(c.lastRunAt) : '—'}
            </span>
            {lastRun ? <RunStatePill state={lastRun.state} /> : null}
          </>
        }
        note={
          c.lastRunAt
            ? lastRun
              ? t('erp.connector.overview.kpi.lastRunNote', {
                  date: shortDate(c.lastRunAt),
                  fetched: lastRun.fetched,
                  created: lastRun.created,
                })
              : shortDate(c.lastRunAt)
            : t('erp.connector.overview.kpi.lastRunNone')
        }
      />
      <Kpi
        icon={nextRunIcon}
        tint="bg-pending-100"
        label={t('erp.connector.overview.kpi.nextRun')}
        value={
          c.state === 'PAUSED'
            ? t('erp.connector.state.PAUSED')
            : c.nextRunAt
              ? timeOf(c.nextRunAt)
              : '—'
        }
        note={
          c.state === 'PAUSED'
            ? t('erp.connector.overview.kpi.nextRunPaused')
            : c.nextRunAt
              ? t('erp.connector.overview.kpi.nextRunNote', {
                  date: shortDate(c.nextRunAt),
                  schedule: t(`erp.connector.schedule.${c.scheduleMinutes}`),
                })
              : t('erp.connector.overview.kpi.nextRunNone')
        }
        tone={c.state === 'PAUSED' ? 'pending' : undefined}
      />
      <Kpi
        icon={quotaIcon}
        tint="bg-success-100"
        label={t('erp.connector.overview.kpi.collected')}
        value={thousands(usage.collected)}
        unit={t('erp.connector.overview.kpi.ofAllowance', {
          limit: thousands(usage.collectedLimit),
        })}
        note={t('erp.connector.overview.kpi.collectedNote', {
          percent: Math.round(usage.collectedSpent * 100),
          date: shortDate(state.addon.resetsOn),
        })}
        tone={usage.collectedSpent >= 0.8 ? 'pending' : undefined}
      />
    </div>
  )
}

/** Kpi's shape with a free-form value — for a figure that is a pill or an ERP number. */
function FigureCard({
  icon,
  label,
  value,
  note,
}: {
  icon: string
  label: string
  value: ReactNode
  note: string
}) {
  return (
    <article className="min-w-0 rounded-md bg-surface-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50">
          <img src={icon} alt="" className="size-[18px]" />
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{label}</h3>
      </div>
      <p className="mt-3 flex min-h-[34px] flex-wrap items-center gap-2">{value}</p>
      <p className="mt-2 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

/** How the connection is set up — a definition list, two columns wide on a desktop. */
function SetupCard({ connection: c }: { connection: Connection }) {
  const { t } = useTranslation()
  const mapping = useErpMapping()
  const status = mappingStatusOf(c, mapping)

  const provenance = () => {
    if (c.mapping.usesTenantMapping) return t('erp.connector.overview.setup.mappingTenant')
    if (!c.mapping.template) return t('erp.connector.overview.setup.mappingByHand')
    return c.mapping.lastEditedAt
      ? t('erp.connector.overview.setup.mappingEdited', {
          template: templateLabel(c.mapping.template),
          date: shortDate(c.mapping.lastEditedAt),
        })
      : t('erp.connector.overview.setup.mappingUnedited', {
          date: shortDate(c.mapping.template.appliedAt),
        })
  }

  const rows: { id: string; value: ReactNode }[] = [
    {
      id: 'product',
      value: `${productName(c.product)} ${c.erpVersion ?? ''}`.trim(),
    },
    { id: 'address', value: <Mono className="text-xs">{c.baseUrl}</Mono> },
    {
      id: 'auth',
      value: (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span>{t(`erp.connector.authKind.${c.authKind}`)}</span>
          <Mono className="text-text-tertiary">{c.credentialHint}</Mono>
        </span>
      ),
    },
    ...(c.database
      ? [{ id: 'database', value: <Mono className="text-xs">{c.database}</Mono> }]
      : []),
    {
      id: 'scopes',
      value: (
        <span className="flex flex-wrap gap-1.5">
          {c.scopes.map((s) => (
            <Pill key={s} tone="neutral" label={t(`erp.connector.scope.${s}`)} />
          ))}
        </span>
      ),
    },
    { id: 'schedule', value: t(`erp.connector.schedule.${c.scheduleMinutes}`) },
    {
      id: 'writeBack',
      value: c.writeBackEnabled
        ? t('erp.connector.overview.setup.on')
        : t('erp.connector.overview.setup.off'),
    },
    {
      id: 'mapping',
      value: (
        <span className="flex flex-wrap items-center gap-2">
          <MappingStatusPill status={status} />
          <span className="text-sm font-medium text-text-tertiary">{provenance()}</span>
        </span>
      ),
    },
    {
      id: 'created',
      value: t('erp.connector.overview.setup.createdValue', {
        date: shortDate(c.createdAt),
        by: c.createdBy,
      }),
    },
  ]
  // The last row of each column loses its hairline so the card ends clean.
  const lastRowStart = rows.length - (rows.length % 2 === 0 ? 2 : 1)

  return (
    <SectionCard
      title={t('erp.connector.overview.setup.title')}
      note={t('erp.connector.overview.setup.note')}
      actions={
        <Link to={connectionPath(c.id, 'settings')} className={TEXT_BUTTON}>
          {t('erp.connector.overview.setup.change')}
        </Link>
      }
    >
      <dl className="grid border-t border-surface-background md:grid-cols-2">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className={[
              'flex flex-col gap-1 border-b border-surface-background px-5 py-3.5',
              index % 2 === 0 ? 'md:border-e' : '',
              index >= lastRowStart ? 'md:border-b-0' : '',
              index === rows.length - 1 ? 'border-b-0' : '',
            ].join(' ')}
          >
            <dt className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t(`erp.connector.overview.setup.row.${row.id}`)}
            </dt>
            <dd className="min-w-0 break-words text-sm font-semibold text-text-primary">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  )
}

/** The last five runs, and the way to all of them. */
function LastRuns({ connection: c }: { connection: Connection }) {
  const { t } = useTranslation()
  const state = useConnector()
  const runs = runsFor(state, c.id).slice(0, 5)

  return (
    <SectionCard
      title={t('erp.connector.overview.runs.title')}
      note={t('erp.connector.overview.runs.note')}
      actions={
        <Link to={connectionPath(c.id, 'runs')} className={TEXT_BUTTON}>
          {t('erp.connector.overview.runs.seeAll')}
        </Link>
      }
    >
      <RowsView>
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('erp.connector.overview.runs.col.time')}</Th>
              <Th>{t('erp.connector.overview.runs.col.trigger')}</Th>
              <Th>{t('erp.connector.overview.runs.col.state')}</Th>
              <Th align="end">{t('erp.connector.overview.runs.col.fetched')}</Th>
              <Th align="end">{t('erp.connector.overview.runs.col.new')}</Th>
              <Th align="end">{t('erp.connector.overview.runs.col.errors')}</Th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-8 text-center text-sm font-medium text-text-quaternary"
                >
                  {t('erp.connector.overview.runs.empty')}
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id} className={TBODY_ROW}>
                  <Td first>
                    <Link
                      to={`${connectionPath(c.id, 'runs')}/${run.id}`}
                      className="text-sm font-semibold text-text-primary tabular-nums hover:text-primary-800"
                    >
                      {timeOf(run.startedAt)}
                    </Link>
                    <p className="text-xs font-medium text-text-quaternary">
                      {shortDate(run.startedAt)}
                    </p>
                  </Td>
                  <Td>
                    <span className="text-sm font-medium text-text-secondary">
                      {t(`erp.connector.runTrigger.${run.trigger}`)}
                    </span>
                  </Td>
                  <Td>
                    <RunStatePill state={run.state} />
                  </Td>
                  <Td align="end" className="text-sm font-medium text-text-secondary tabular-nums">
                    {run.fetched}
                  </Td>
                  <Td align="end" className="text-sm font-medium text-text-secondary tabular-nums">
                    {run.created}
                  </Td>
                  <Td
                    align="end"
                    className={[
                      'text-sm font-semibold tabular-nums',
                      run.errors > 0 ? 'text-danger-700' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {run.errors}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </RowsView>
    </SectionCard>
  )
}

/** The last eight things that happened, newest first. */
function RecentActivity({ connection: c }: { connection: Connection }) {
  const { t } = useTranslation()
  const events = c.events.slice(0, 8)
  return (
    <SectionCard
      title={t('erp.connector.overview.activity.title')}
      note={t('erp.connector.overview.activity.note')}
      className="h-full"
    >
      <ul className="border-t border-surface-background">
        {events.map((e) => (
          <li
            key={e.id}
            className="flex flex-col gap-0.5 border-b border-surface-background px-5 py-3 last:border-0"
          >
            <p className="text-sm font-medium leading-[1.5] text-text-primary">
              {t(`erp.connector.event.${e.actionKey}`, e.values)}
            </p>
            <p className="text-xs font-medium text-text-quaternary">
              {t('erp.connector.overview.activity.by', { when: dateTime(e.at), who: e.by })}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
