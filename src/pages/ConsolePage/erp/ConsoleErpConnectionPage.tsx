import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice } from '../../../layouts/ConsoleShell/ConsoleNotice'
import {
  ConsoleClockIcon,
  ConsoleQueueIcon,
  ConsoleSubscriptionIcon,
  ConsoleTickIcon,
} from '../../../layouts/ConsoleShell/consoleIcons'
import { RowsView } from '../../../components/ui'
import { formatDay, formatMoment } from '../../../lib/console/format'
import {
  STALE_DAYS,
  addonFor,
  allowanceOf,
  connectionById,
  connectionsFor,
  isStale,
  tenantName,
  useConsoleErp,
  versionById,
  watermarkAgeDays,
} from '../../../lib/consoleErp'
import { count, percent } from '../../../lib/superAdmin'
import { QueueKpiCard } from '../subscriptions/QueueKpiCard'
import {
  AddonActionModals,
  Card,
  ConnectionStatePill,
  ErpAddonCard,
  Line,
  MappingStatusPill,
  RunStatePill,
  TD,
  TH,
  whenLabel,
  type AddonAction,
} from './erpShared'

const CRUMBS = [
  { labelKey: 'console.nav.group.erp' },
  { labelKey: 'console.nav.erpConnections', to: '/console/erp' },
]

/**
 * One tenant's connection as support sees it (docs/erp-and-console-plan.md §9.3): the figures,
 * how it is set up, its recent runs and the tenant's add-on. Read-only by design — credentials are
 * never shown or entered here; the only writes are the add-on actions an operator may take.
 */
export function ConsoleErpConnectionPage() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const erp = useConsoleErp()
  const connection = connectionById(erp, id)
  const [action, setAction] = useState<AddonAction | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const key = (name: string) => `console.erp.connection.${name}`

  if (!connection) {
    return (
      <ConsoleShell>
        <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
          <ConsoleBreadcrumbs items={[...CRUMBS, { label: id ?? '' }]} />
          <ConsoleNotice
            body={t(key('notFound'))}
            action={{ to: '/console/erp', label: t(key('notFoundBack')) }}
          />
        </div>
      </ConsoleShell>
    )
  }

  const c = connection
  const language = i18n.language
  const day = (date: Date) => formatDay(date.toISOString(), language)
  const moment = (date: Date) => formatMoment(date.toISOString(), language)
  const tenant = tenantName(c.tenantId)
  const addon = addonFor(erp, c.tenantId)
  const allowance = addon ? allowanceOf(addon) : null
  const tenantCollected = connectionsFor(erp, c.tenantId).reduce(
    (sum, x) => sum + x.collectedThisMonth,
    0,
  )
  const share = addon && allowance ? addon.collectedThisMonth / allowance : 0
  const age = watermarkAgeDays(c)
  const stale = isStale(c)
  const lastRun = c.recentRuns[0]
  const template = versionById(erp, c.templateVersionId)

  const banner =
    c.state === 'ERROR'
      ? {
          tone: 'bad' as const,
          text: t(key(`banner.${c.errorKey ?? 'threeFailures'}`), {
            failures: c.consecutiveFailures,
          }),
        }
      : stale
        ? { tone: 'watch' as const, text: t(key('banner.stale'), { count: age ?? 0 }) }
        : null

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <ConsoleBreadcrumbs items={[...CRUMBS, { label: c.label }]} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{c.label}</h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
              <Link
                to={`/console/tenants/${c.tenantId}?tab=erp`}
                className="font-semibold text-primary-700 transition-colors hover:text-primary-800"
              >
                {tenant}
              </Link>
              {' · '}
              {t(key('meta'), {
                product: t(`erp.connector.product.${c.product}`),
                version: c.erpVersion,
                schedule: t(`erp.connector.schedule.${c.scheduleMinutes}`),
              })}
            </p>
            <p className="mt-1.5 text-xs font-medium leading-[1.4] text-text-quaternary">
              {t(key('readOnly'))}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ConnectionStatePill state={c.state} />
            <MappingStatusPill status={c.mappingStatus} />
          </div>
        </div>

        {done ? (
          <p
            role="status"
            className="rounded-md bg-success-100 px-5 py-4 text-sm font-medium leading-[1.6] text-success-700"
          >
            {done}
          </p>
        ) : null}

        {banner ? (
          <p
            role="alert"
            className={`rounded-md px-5 py-4 text-sm font-medium leading-[1.6] ${
              banner.tone === 'bad'
                ? 'bg-danger-100 text-danger-700'
                : 'bg-pending-100 text-pending-700'
            }`}
          >
            {banner.text}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-4">
          <QueueKpiCard
            icon={<ConsoleTickIcon className="size-[18px] text-success-700" />}
            title={t(key('figure.watermark'))}
            value={age === null ? '—' : age === 0 ? t(key('figure.today')) : String(age)}
            suffix={
              age === null || age === 0 ? undefined : t(key('figure.daysOld'), { count: age })
            }
            note={
              c.watermarkAt
                ? t(key('figure.watermarkNote'), { moment: moment(c.watermarkAt) })
                : t(key('figure.nothingYet'))
            }
            tone={age !== null && age >= STALE_DAYS ? 'watch' : 'calm'}
          />
          <QueueKpiCard
            icon={<ConsoleQueueIcon className="size-[18px] text-primary-700" />}
            title={t(key('figure.lastRun'))}
            value={c.lastRunAt ? whenLabel(c.lastRunAt, language) : t(key('figure.never'))}
            note={
              lastRun
                ? t(key('figure.lastRunNote'), {
                    state: t(`erp.connector.runState.${lastRun.state}`),
                    fetched: lastRun.fetched,
                    created: lastRun.created,
                    errors: lastRun.errors,
                  })
                : t(key('figure.nothingYet'))
            }
            tone={
              lastRun?.state === 'FAILED' ? 'bad' : lastRun?.state === 'PARTIAL' ? 'watch' : 'calm'
            }
          />
          <QueueKpiCard
            icon={<ConsoleClockIcon className="size-[18px] text-pending-700" />}
            title={t(key('figure.nextRun'))}
            value={c.nextRunAt ? whenLabel(c.nextRunAt, language) : '—'}
            note={
              c.nextRunAt
                ? t(`erp.connector.schedule.${c.scheduleMinutes}`)
                : t(key(c.state === 'ERROR' ? 'figure.nextRunError' : 'figure.nextRunPaused'))
            }
          />
          <QueueKpiCard
            icon={<ConsoleSubscriptionIcon className="size-[18px] text-primary-700" />}
            title={t(key('figure.collected'))}
            value={count(c.collectedThisMonth)}
            suffix={
              allowance !== null
                ? t(key('figure.collectedOf'), { allowance: count(allowance) })
                : undefined
            }
            note={
              addon && allowance
                ? t(key('figure.collectedNote'), {
                    used: count(tenantCollected),
                    percent: percent(Math.round(share * 1000) / 1000),
                  })
                : t(key('figure.collectedNoAddon'))
            }
            tone={share >= 0.8 ? 'watch' : 'calm'}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-4 max-lg:grid-cols-1">
          <div className="flex min-w-0 flex-col gap-4">
            <Card title={t(key('setup.title'))}>
              <Line
                label={t(key('setup.product'))}
                value={`${t(`erp.connector.product.${c.product}`)} ${c.erpVersion}`}
              />
              <Line
                label={t(key('setup.schedule'))}
                value={t(`erp.connector.schedule.${c.scheduleMinutes}`)}
              />
              <Line
                label={t(key('setup.writeBack'))}
                value={t(key(c.writeBackEnabled ? 'setup.writeBackOn' : 'setup.writeBackOff'))}
              />
              <Line
                label={t(key('setup.template'))}
                value={
                  template ? (
                    <Link
                      to={`/console/erp/templates/${template.template.id}`}
                      className="text-primary-700 transition-colors hover:text-primary-800"
                    >
                      {t(key('setup.templateVersion'), {
                        name: template.template.name,
                        version: template.version.version,
                        date: template.version.publishedAt
                          ? day(template.version.publishedAt)
                          : day(template.version.savedAt),
                      })}
                    </Link>
                  ) : (
                    t(key('setup.handWritten'))
                  )
                }
              />
              <Line
                label={t(key('setup.mapping'))}
                value={t(`erp.connector.mappingStatus.${c.mappingStatus}`)}
              />
              <Line label={t(key('setup.created'))} value={moment(c.createdAt)} />
              <Line label={t(key('setup.id'))} value={<span className="font-mono">{c.id}</span>} />
            </Card>

            <Card title={t(key('runs.title'))} padded={false}>
              {c.recentRuns.length === 0 ? (
                <p className="px-5 py-4 text-sm font-medium text-text-tertiary">
                  {t(key('runs.none'))}
                </p>
              ) : (
                <RowsView className="p-4">
                  <table className="w-full min-w-[560px] border-collapse text-start">
                    <thead>
                      <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                        <th className={TH}>{t(key('runs.col.when'))}</th>
                        <th className={TH}>{t(key('runs.col.state'))}</th>
                        <th className={`${TH} text-end`}>{t(key('runs.col.fetched'))}</th>
                        <th className={`${TH} text-end`}>{t(key('runs.col.created'))}</th>
                        <th className={`${TH} text-end`}>{t(key('runs.col.errors'))}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.recentRuns.map((run, index) => (
                        <tr key={index} className="border-b border-[#f3f3f3] last:border-b-0">
                          <td
                            className={`${TD} whitespace-nowrap text-sm font-medium text-text-primary`}
                          >
                            {moment(run.at)}
                          </td>
                          <td className={TD}>
                            <RunStatePill state={run.state} />
                          </td>
                          <td className={`${TD} text-end text-sm font-medium text-text-primary`}>
                            {count(run.fetched)}
                          </td>
                          <td className={`${TD} text-end text-sm font-medium text-text-primary`}>
                            {count(run.created)}
                          </td>
                          <td
                            className={`${TD} text-end text-sm font-semibold ${run.errors > 0 ? 'text-danger-700' : 'text-text-quaternary'}`}
                          >
                            {run.errors > 0 ? count(run.errors) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </RowsView>
              )}
            </Card>
          </div>

          <ErpAddonCard erp={erp} tenantId={c.tenantId} onAction={setAction} />
        </div>
      </div>

      <AddonActionModals
        action={action}
        erp={erp}
        tenantId={c.tenantId}
        onClose={() => setAction(null)}
        onDone={(message) => {
          setAction(null)
          setDone(message)
        }}
      />
    </ConsoleShell>
  )
}
