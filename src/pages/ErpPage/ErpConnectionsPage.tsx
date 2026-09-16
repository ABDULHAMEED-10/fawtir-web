import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { ActionMenu, Rial, withRial } from '../../components/ui'
import { Pill } from './ErpShell'
import {
  ConfirmModal,
  EmptyRow,
  PRIMARY_BUTTON,
  PrimaryLink,
  SectionCard,
  TBODY_ROW,
  TEXT_BUTTON,
  THEAD_ROW,
  Td,
  Th,
} from './overview/idiom'
import {
  ConnectionStatePill,
  MappingStatusPill,
  connectionPath,
} from './connections/ConnectionShell'
import { usePlatformSettings } from '../../lib/platformSettings'
import { SOURCE_SYSTEMS, useErpMapping, type SourceSystem } from '../../lib/erpMapping'
import {
  NOW,
  addonUsage,
  connectorStore,
  liveConnections,
  mappingStatusOf,
  pendingRejections,
  productName,
  useConnector,
  type Addon,
  type AddonState,
  type CollectResult,
  type Connection,
} from '../../lib/erpConnector'
import { shortMonth } from '../../lib/settings'
import connectIcon from '../../assets/settings/tile-connect.svg'
import tickIcon from '../../assets/settings/check-green.svg'
import infoIcon from '../../assets/settings/info.svg'
import clockIcon from '../../assets/settings/clock.svg'
import refreshIcon from '../../assets/settings/refresh.svg'
import openIcon from '../../assets/settings/menu-list.svg'
import collectIcon from '../../assets/settings/menu-sparkle.svg'
import removeIcon from '../../assets/settings/menu-remove.svg'

/** The systems the connector ships adapters for today; the rest are on the way. */
const AVAILABLE: SourceSystem[] = ['ODOO', 'ERPNEXT']
const STEPS = ['collect', 'map', 'writeBack'] as const
const ADDON_STATES: AddonState[] = [
  'INACTIVE',
  'PENDING_PAYMENT',
  'ACTIVE',
  'SUSPENDED',
  'CANCELLED',
]

/**
 * Settings › Integration › Connected systems (docs/erp-and-console-plan.md §3, Appendix B).
 *
 * The screen follows the add-on's state. Not active — the add-on card alone: what automatic
 * extraction does, what it costs (from the console's platform settings, never typed here), which
 * systems it speaks to, and one button that asks the Fawtir team to switch it on. Active — the
 * add-on panel with its two usage bars, then the connections themselves with their state, mapping
 * status, runs and pending rejections. Field mapping itself is part of every plan and lives one
 * screen over.
 */
export function ErpConnectionsPage() {
  const state = useConnector()
  const [params] = useSearchParams()

  // `?addon=INACTIVE` puts the story's add-on into another state — for the responsive harness
  // and the screenshots, which otherwise only ever see the bought add-on.
  useEffect(() => {
    const wanted = params.get('addon') as AddonState | null
    if (wanted && ADDON_STATES.includes(wanted) && wanted !== state.addon.state)
      connectorStore.setAddonState(wanted)
  }, [params, state.addon.state])

  return state.addon.state === 'ACTIVE' ? (
    <ActiveList />
  ) : (
    <InactiveCard addonState={state.addon.state} />
  )
}

/* ------------------------------------------------------------ not active */

function InactiveCard({ addonState }: { addonState: AddonState }) {
  const { t } = useTranslation()
  const { settings } = usePlatformSettings()
  const addon = settings.addons.erpExtraction
  const pending = addonState === 'PENDING_PAYMENT'
  const bannerKey =
    addonState === 'SUSPENDED'
      ? 'erp.connector.list.suspended'
      : addonState === 'CANCELLED'
        ? 'erp.connector.list.cancelled'
        : null

  return (
    <SettingsShell group="integration">
      <SettingsHeader title={t('erp.connections.title')} subtitle={t('erp.connections.subtitle')} />

      {bannerKey ? (
        <div className="flex gap-3 rounded-md border border-pending-200 bg-pending-100/60 p-4">
          <img src={infoIcon} alt="" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-sm font-medium leading-[1.5] text-text-secondary">
              {t(bannerKey)}
            </p>
            <Pill tone="pending" label={t(`erp.connector.addon.state.${addonState}`)} />
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-start gap-4 p-5">
          <span className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-primary-50">
            <img src={connectIcon} alt="" className="size-6" />
          </span>
          <div className="min-w-[240px] flex-1">
            <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t('erp.connections.card.title')}
            </h3>
            <p className="mt-1 max-w-[680px] text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('erp.connections.card.body')}
            </p>
          </div>
        </div>

        {/* What it does, in three steps */}
        <ol className="grid border-t border-surface-background md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="flex gap-3 border-b border-surface-background px-5 py-4 md:border-b-0 md:border-e md:last:border-e-0"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-background text-xs font-semibold text-text-secondary">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-primary">
                  {t(`erp.connections.steps.${step}.title`)}
                </span>
                <span className="mt-0.5 block text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t(`erp.connections.steps.${step}.body`)}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {/* The price, from the console */}
        <div className="grid border-t border-surface-background lg:grid-cols-[1fr_320px]">
          <div className="p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('erp.connections.price.title')}
            </p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[32px] font-semibold leading-[1.1] text-text-primary">
                <Rial />
              </span>
              <span className="text-[32px] font-semibold leading-[1.1] text-text-primary tabular-nums">
                {addon.monthly.toFixed(3)}
              </span>
              <span className="text-sm font-medium text-text-quaternary">
                {t('erp.connections.price.perMonth')}
              </span>
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              <li className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {t('erp.connections.price.documents', {
                    count: addon.documents,
                    formatted: addon.documents.toLocaleString('en-US'),
                  })}
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {withRial(
                    t('erp.connections.price.overage', { amount: addon.overage.toFixed(3) }),
                  )}
                </span>
              </li>
              {addon.includedAt === 'enterprise' ? (
                <li className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                  <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                  <span>{t('erp.connections.price.enterprise')}</span>
                </li>
              ) : null}
            </ul>

            <div className="mt-5">
              {pending ? (
                <p className="flex items-start gap-2 rounded-sm bg-pending-100 px-3 py-2.5 text-sm font-medium leading-[1.6] text-pending-700">
                  <img src={clockIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                  <span>{t('erp.connector.list.pendingPayment')}</span>
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => connectorStore.requestAddon('PURCHASED')}
                    className={PRIMARY_BUTTON}
                  >
                    {t('erp.connections.activate.button')}
                  </button>
                  <span className="text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('erp.connections.activate.note')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Supported systems */}
          <div className="border-t border-surface-background p-5 lg:border-s lg:border-t-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('erp.connections.systems.title')}
            </p>
            <ul className="mt-3 flex flex-col">
              {SOURCE_SYSTEMS.filter((system) => system !== 'CUSTOM').map((system, index, all) => {
                const available = AVAILABLE.includes(system)
                return (
                  <li
                    key={system}
                    className={[
                      'flex items-center justify-between gap-3 py-2.5',
                      index < all.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'text-sm font-semibold',
                        available ? 'text-text-primary' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {t(`erp.sourceSystem.${system}`)}
                    </span>
                    <span
                      className={[
                        'inline-flex h-[24px] items-center gap-1.5 rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
                        available
                          ? 'bg-success-100 text-[#3d5648]'
                          : 'bg-surface-background text-text-tertiary',
                      ].join(' ')}
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      {available
                        ? t('erp.connections.systems.available')
                        : t('erp.connections.systems.coming')}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        <MappingIncludedStrip />
      </section>
    </SettingsShell>
  )
}

/** Mapping is included on every plan — the strip that closes both versions of the screen. */
function MappingIncludedStrip({ standalone = false }: { standalone?: boolean }) {
  const { t } = useTranslation()
  return (
    <div
      className={[
        'flex flex-wrap items-center gap-3 border-surface-background bg-surface-background/60 px-5 py-4',
        standalone ? 'rounded-md bg-surface-card' : 'border-t',
      ].join(' ')}
    >
      <img src={infoIcon} alt="" className="size-4 shrink-0 max-md:hidden" />
      <p className="min-w-0 flex-1 text-sm max-md:basis-full font-medium leading-[1.5] text-text-secondary">
        {t('erp.connections.mapping.note')}
      </p>
      <Link to="/settings/erp-mapping" className={TEXT_BUTTON}>
        {t('erp.connections.mapping.link')}
      </Link>
    </div>
  )
}

/* ---------------------------------------------------------------- active */

type Notice =
  | { kind: 'ok'; label: string; run: string }
  | { kind: 'refused'; label: string; error: Extract<CollectResult, { ok: false }>['error'] }

function ActiveList() {
  const { t } = useTranslation()
  const state = useConnector()
  const mapping = useErpMapping()
  const usage = addonUsage(state)
  const connections = liveConnections(state)
  const atLimit = usage.connections >= usage.connectionsLimit
  const inError = connections.filter((c) => c.state === 'ERROR')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [deleting, setDeleting] = useState<Connection | null>(null)

  const collectNow = (c: Connection) => {
    const result = connectorStore.collectNow(c.id, mappingStatusOf(c, mapping))
    setNotice(
      result.ok
        ? { kind: 'ok', label: c.label, run: result.run.id }
        : { kind: 'refused', label: c.label, error: result.error },
    )
  }

  return (
    <SettingsShell group="integration">
      <SettingsHeader
        title={t('erp.connector.list.title')}
        subtitle={t('erp.connector.list.subtitle')}
        actions={
          atLimit ? (
            <span className="flex flex-col items-end gap-1 max-md:items-start">
              <button type="button" disabled className={PRIMARY_BUTTON}>
                {t('erp.connector.list.connect')}
              </button>
              <span className="text-xs font-medium text-text-quaternary">
                {t('erp.connector.list.connectLimit', { count: usage.connectionsLimit })}
              </span>
            </span>
          ) : (
            <PrimaryLink to="/settings/erp/connections/new">
              {t('erp.connector.list.connect')}
            </PrimaryLink>
          )
        }
      />

      {inError.map((c) => (
        <div
          key={c.id}
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-danger-700/20 bg-danger-100/70 px-4 py-3"
        >
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-danger-700 max-md:hidden"
          />
          <p className="min-w-0 flex-1 text-sm max-md:basis-full font-medium leading-[1.5] text-danger-700">
            {t(`erp.connector.list.errorBanner.${c.errorKey ?? 'threeFailures'}`, {
              label: c.label,
            })}
          </p>
          <Link
            to={connectionPath(c.id, 'settings')}
            className="text-sm font-semibold text-danger-700 underline-offset-2 hover:underline"
          >
            {t('erp.connector.list.errorBanner.link')}
          </Link>
        </div>
      ))}

      <AddonPanel addon={state.addon} usage={usage} />

      <SectionCard
        title={t('erp.connector.list.table.title')}
        note={t('erp.connector.list.table.note', {
          count: usage.connections,
          limit: usage.connectionsLimit,
        })}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm text-text-secondary">
            <thead>
              <tr className={THEAD_ROW}>
                <Th first>{t('erp.connector.list.table.label')}</Th>
                <Th>{t('erp.connector.list.table.state')}</Th>
                <Th>{t('erp.connector.list.table.mapping')}</Th>
                <Th>{t('erp.connector.list.table.lastRun')}</Th>
                <Th>{t('erp.connector.list.table.nextRun')}</Th>
                <Th align="end">{t('erp.connector.list.table.rejections')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {connections.length === 0 ? (
                <EmptyRow columns={7}>
                  <span className="block text-sm font-semibold text-text-secondary">
                    {t('erp.connector.list.empty.title')}
                  </span>
                  <span className="mt-1 block">{t('erp.connector.list.empty.body')}</span>
                  <span className="mt-4 inline-flex">
                    <PrimaryLink to="/settings/erp/connections/new">
                      {t('erp.connector.list.connect')}
                    </PrimaryLink>
                  </span>
                </EmptyRow>
              ) : (
                connections.map((c) => (
                  <ConnectionRow
                    key={c.id}
                    connection={c}
                    onCollect={() => collectNow(c)}
                    onDelete={() => setDeleting(c)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {notice ? (
          <div
            role="status"
            className={[
              'flex flex-wrap items-center gap-3 border-t border-surface-background px-5 py-3 text-sm font-medium leading-[1.5]',
              notice.kind === 'ok'
                ? 'bg-success-100/70 text-[#3d5648]'
                : 'bg-danger-100/70 text-danger-700',
            ].join(' ')}
          >
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" />
            <span className="min-w-0 flex-1">
              {notice.kind === 'ok'
                ? t('erp.connector.list.collected', { label: notice.label, run: notice.run })
                : t(`erp.connector.list.refusal.${notice.error}`, {
                    label: notice.label,
                    date: shortMonth(state.addon.resetsOn),
                  })}
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-sm font-semibold text-current underline-offset-2 hover:underline"
            >
              {t('common.close')}
            </button>
          </div>
        ) : null}

        <MappingIncludedStrip />
      </SectionCard>

      <ConfirmModal
        open={deleting !== null}
        danger
        title={t('erp.connector.list.delete.title', { label: deleting?.label ?? '' })}
        body={t('erp.connector.list.delete.body')}
        confirmLabel={t('erp.connector.list.delete.confirm')}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) connectorStore.remove(deleting.id)
          setDeleting(null)
        }}
      />
    </SettingsShell>
  )
}

/* ---------------------------------------------------------- add-on panel */

function AddonPanel({ addon, usage }: { addon: Addon; usage: ReturnType<typeof addonUsage> }) {
  const { t } = useTranslation()
  const stateTone =
    addon.state === 'ACTIVE' ? 'success' : addon.state === 'INACTIVE' ? 'neutral' : 'pending'

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-primary-50">
            <img src={connectIcon} alt="" className="size-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('erp.connector.addon.title')}
              </h3>
              <Pill tone={stateTone} label={t(`erp.connector.addon.state.${addon.state}`)} />
            </div>
            <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t(`erp.connector.addon.source.${addon.source}`, {
                date: addon.since ? shortMonth(addon.since) : '',
              })}
            </p>
          </div>
        </div>
        <div className="text-end max-md:text-start">
          <p className="text-lg font-semibold leading-[1.2] text-text-primary tabular-nums">
            {withRial(t('erp.connector.addon.price', { amount: addon.price.monthly.toFixed(3) }))}
          </p>
          <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
            {t('erp.connector.addon.priceNote', {
              documents: addon.price.documents.toLocaleString('en-US'),
            })}
          </p>
        </div>
      </div>

      <div className="grid border-t border-surface-background md:grid-cols-2">
        <UsageBar
          label={t('erp.connector.addon.usage.connections')}
          used={usage.connections}
          limit={usage.connectionsLimit}
          spent={usage.connectionsSpent}
          className="border-b border-surface-background md:border-b-0 md:border-e"
        />
        <UsageBar
          label={t('erp.connector.addon.usage.collected')}
          used={usage.collected}
          limit={usage.collectedLimit}
          spent={usage.collectedSpent}
          aside={t('erp.connector.addon.usage.resets', { date: shortMonth(addon.resetsOn) })}
        />
      </div>

      <div className="flex items-start gap-3 border-t border-surface-background px-5 py-3">
        <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
        <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
          {withRial(t('erp.connector.addon.overage', { amount: addon.price.overage.toFixed(3) }))}
        </p>
      </div>
    </section>
  )
}

/** One of the add-on's two limits: the figure, the bar, and what happens at the end of the bar. */
function UsageBar({
  label,
  used,
  limit,
  spent,
  aside,
  className = '',
}: {
  label: string
  used: number
  limit: number
  spent: number
  aside?: string
  className?: string
}) {
  const { t } = useTranslation()
  const tone = spent >= 1 ? 'bg-danger-700' : spent >= 0.8 ? 'bg-pending-500' : 'bg-primary-700'
  const figureTone =
    spent >= 1 ? 'text-danger-700' : spent >= 0.8 ? 'text-pending-700' : 'text-text-primary'
  return (
    <div className={['p-5', className].join(' ')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <p className={['text-sm font-semibold tabular-nums', figureTone].join(' ')}>
          {t('erp.connector.addon.usage.of', {
            used: used.toLocaleString('en-US'),
            limit: limit.toLocaleString('en-US'),
          })}
        </p>
      </div>
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-label={label}
        className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-surface-background"
      >
        <span
          className={['rounded-full transition-[width]', tone].join(' ')}
          style={{ width: `${Math.min(100, spent * 100)}%` }}
        />
      </span>
      {aside ? (
        <p className="mt-2 text-end text-xs font-medium text-text-quaternary">{aside}</p>
      ) : null}
    </div>
  )
}

/* ----------------------------------------------------------------- rows */

const timeOf = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()
/** A time when it is today, a short date otherwise — the runs table reads the same way. */
const whenText = (date: Date) => (sameDay(date, NOW) ? timeOf.format(date) : shortMonth(date))

function ConnectionRow({
  connection: c,
  onCollect,
  onDelete,
}: {
  connection: Connection
  onCollect: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const state = useConnector()
  const mapping = useErpMapping()
  const rejections = pendingRejections(state, c.id)
  const paused = c.state === 'PAUSED'
  const nextRun = c.state === 'CONNECTED' && c.nextRunAt ? whenText(c.nextRunAt) : null

  return (
    <tr className={TBODY_ROW}>
      <Td first>
        <Link
          to={connectionPath(c.id)}
          className="text-sm font-semibold text-text-primary transition-colors hover:text-primary-700"
        >
          {c.label}
        </Link>
        <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
          {productName(c.product)}
          {c.erpVersion ? ` ${c.erpVersion}` : ''}
        </span>
      </Td>
      <Td>
        <ConnectionStatePill state={c.state} />
      </Td>
      <Td>
        <MappingStatusPill status={mappingStatusOf(c, mapping)} />
      </Td>
      <Td className="whitespace-nowrap font-medium tabular-nums">
        {c.lastRunAt ? whenText(c.lastRunAt) : t('erp.connector.list.table.never')}
      </Td>
      <Td className="whitespace-nowrap font-medium tabular-nums">
        {nextRun ?? (
          <span className="text-text-quaternary">{t('erp.connector.list.table.none')}</span>
        )}
      </Td>
      <Td align="end" className="font-medium tabular-nums">
        {rejections > 0 ? (
          <Link
            to={connectionPath(c.id, 'records')}
            className="font-semibold text-danger-700 underline-offset-2 hover:underline"
          >
            {rejections}
          </Link>
        ) : (
          <span className="text-text-quaternary">0</span>
        )}
      </Td>
      <Td align="end" className="w-px">
        <ActionMenu
          floating
          size="md"
          label={t('erp.connector.list.menu.label')}
          items={[
            {
              id: 'open',
              labelKey: 'erp.connector.list.menu.open',
              icon: openIcon,
              to: connectionPath(c.id),
            },
            paused
              ? {
                  id: 'resume',
                  labelKey: 'erp.connector.list.menu.resume',
                  icon: refreshIcon,
                  onSelect: () => connectorStore.resume(c.id),
                }
              : {
                  id: 'pause',
                  labelKey: 'erp.connector.list.menu.pause',
                  icon: clockIcon,
                  onSelect: () => connectorStore.pause(c.id),
                },
            {
              id: 'collect',
              labelKey: 'erp.connector.list.menu.collectNow',
              icon: collectIcon,
              onSelect: onCollect,
            },
            {
              id: 'delete',
              labelKey: 'erp.connector.list.menu.delete',
              icon: removeIcon,
              danger: true,
              onSelect: onDelete,
            },
          ]}
        />
      </Td>
    </tr>
  )
}
