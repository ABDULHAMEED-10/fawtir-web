import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { FilterMenu } from '../../components/ui'
import {
  ACTIVITY,
  ACTIVITY_SUMMARY,
  ACTIVITY_TABS,
  DOCUMENT_KINDS,
  OTA_ACCEPTANCE,
  countTab,
  matchesTab,
  type ActivityEvent,
  type ActivityTabId,
  type Channel,
  type Outcome,
} from '../../lib/activity'
import kpiClearedIcon from '../../assets/activity/kpi-cleared.svg'
import kpiWaitingIcon from '../../assets/activity/kpi-waiting.svg'
import kpiAttentionIcon from '../../assets/activity/kpi-attention.svg'
import kpiVolumeIcon from '../../assets/activity/kpi-volume.svg'
import peppolIcon from '../../assets/activity/ch-peppol.svg'
import otaIcon from '../../assets/activity/ch-ota.svg'
import outIcon from '../../assets/activity/dir-out.svg'
import inIcon from '../../assets/activity/dir-in.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/bills/filter.svg'

const CHANNEL_STYLE: Record<Channel, { icon: string; tone: string }> = {
  peppol: { icon: peppolIcon, tone: 'bg-primary-50 text-primary-800' },
  ota: { icon: otaIcon, tone: 'bg-success-100 text-[#3d5648]' },
}

const OUTCOME_STYLE: Record<Outcome, { chip: string; dot: string }> = {
  cleared: { chip: 'bg-success-100 text-[#3d5648]', dot: 'bg-[#3d5648]' },
  waiting: { chip: 'bg-pending-100 text-pending-700', dot: 'bg-pending-700' },
  attention: { chip: 'bg-warning-100 text-warning-700', dot: 'bg-warning-700' },
  failed: { chip: 'bg-surface-background text-text-quaternary', dot: 'bg-text-quaternary' },
}

export function ActivityPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<ActivityTabId>('all')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [channel, setChannel] = useState('all')

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return ACTIVITY.filter((event) => {
      const inTab = matchesTab(event, tab)
      const inKind = kind === 'all' || event.documentKind === kind
      const inChannel = channel === 'all' || event.channel === channel
      const matches =
        needle === '' ||
        event.document.toLowerCase().includes(needle) ||
        event.party.toLowerCase().includes(needle)
      return inTab && inKind && inChannel && matches
    })
  }, [channel, kind, query, tab])

  /** The list is grouped by day, newest day first, as the design language elsewhere does. */
  const days = useMemo(() => {
    const grouped = new Map<string, ActivityEvent[]>()
    for (const event of rows) {
      const list = grouped.get(event.day) ?? []
      list.push(event)
      grouped.set(event.day, list)
    }
    return [...grouped.entries()]
  }, [rows])

  const oldestWaiting = ACTIVITY.find((event) => event.outcome === 'waiting')

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="max-w-[820px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('activity.title')}
          </h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('activity.subtitle')}
          </p>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Kpi
            icon={kpiClearedIcon}
            tile="bg-success-100"
            label={t('activity.kpi.cleared')}
            value={ACTIVITY_SUMMARY.cleared}
            note={t('activity.kpi.clearedNote')}
          />
          <Kpi
            icon={kpiWaitingIcon}
            tile="bg-pending-100"
            label={t('activity.kpi.waiting')}
            value={ACTIVITY_SUMMARY.waiting}
            note={t('activity.kpi.waitingNote', {
              minutes: oldestWaiting?.detailValues?.minutes ?? '0',
            })}
          />
          <Kpi
            icon={kpiAttentionIcon}
            tile="bg-warning-700"
            label={t('activity.kpi.attention')}
            value={ACTIVITY_SUMMARY.attention}
            note={t('activity.kpi.attentionNote')}
            emphasis
          />
          <Kpi
            icon={kpiVolumeIcon}
            tile="bg-primary-50"
            label={t('activity.kpi.volume')}
            value={ACTIVITY_SUMMARY.today}
            note={t('activity.kpi.volumeNote', { count: ACTIVITY_SUMMARY.documents })}
          />
        </div>

        {/* Feed */}
        <section className="rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
            {ACTIVITY_TABS.map((entry) => {
              const isActive = entry.id === tab
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  className={[
                    'inline-flex h-[54px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary-700 text-primary-700'
                      : 'border-transparent text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(entry.labelKey)}
                  <span
                    className={[
                      'text-xs font-semibold',
                      isActive ? 'text-primary-700' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {countTab(entry.id)}
                  </span>
                </button>
              )
            })}
            <p className="ms-auto hidden text-xs font-medium text-text-quaternary lg:block">
              {t('activity.acceptanceRate', { percent: OTA_ACCEPTANCE })}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <label className="relative flex h-[46px] w-full max-w-[344px] items-center">
              <img
                src={searchIcon}
                alt=""
                className="pointer-events-none absolute start-3.5 size-5 opacity-60"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('activity.searchPlaceholder')}
                className="h-full w-full rounded-sm border border-border-subtle bg-white ps-11 pe-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary focus:border-primary-300"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2.5">
              <FilterMenu
                label={t('activity.filters')}
                value={kind}
                defaultValue="all"
                icon={filterIcon}
                width={240}
                options={[
                  { value: 'all', label: t('activity.allKinds') },
                  ...DOCUMENT_KINDS.map((id) => ({
                    value: id,
                    label: t(`activity.kind.${id}`),
                  })),
                ]}
                onChange={setKind}
              />
              <FilterMenu
                label={t('activity.col.network')}
                value={channel}
                defaultValue="all"
                options={[
                  { value: 'all', label: t('activity.col.network') },
                  { value: 'peppol', label: t('activity.channel.peppol') },
                  { value: 'ota', label: t('activity.channel.ota') },
                ]}
                onChange={setChannel}
              />
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="py-16 text-center text-sm font-medium text-text-quaternary">
              {t('activity.empty')}
            </p>
          ) : (
            days.map(([day, events]) => (
              <div key={day}>
                <p className="border-y border-surface-background bg-surface-background/40 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
                  {t(`activity.${day}`)}
                </p>
                <ul>
                  {events.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </ul>
              </div>
            ))
          )}

          {rows.length > 0 ? (
            <p className="px-5 py-4 text-sm font-medium text-text-quaternary">
              {t('activity.showing', { shown: rows.length, total: ACTIVITY.length })}
            </p>
          ) : null}
        </section>
      </div>
    </AppShell>
  )
}

function EventRow({ event }: { event: ActivityEvent }) {
  const { t } = useTranslation()
  const channel = CHANNEL_STYLE[event.channel]
  const outcome = OUTCOME_STYLE[event.outcome]

  return (
    <li className="flex flex-wrap items-start gap-4 border-b border-surface-background px-5 py-4 last:border-0">
      <span className="w-[52px] shrink-0 pt-0.5 text-sm font-medium text-text-quaternary tabular-nums">
        {event.at}
      </span>

      <span className="flex w-[190px] shrink-0 items-start gap-2.5">
        <img
          src={event.direction === 'outbound' ? outIcon : inIcon}
          alt={t(`activity.direction.${event.direction}`)}
          className="mt-0.5 size-4 shrink-0"
        />
        <span className="min-w-0">
          <Link
            to={`/compliance/activity/${event.id}`}
            className="block text-sm font-semibold text-primary-700 hover:underline"
          >
            {event.document}
          </Link>
          <span className="mt-0.5 block text-xs font-medium leading-[1.4] text-text-quaternary">
            {t(`activity.kind.${event.documentKind}`)} · {event.party}
          </span>
        </span>
      </span>

      <span className="min-w-[200px] flex-1">
        <Link
          to={`/compliance/activity/${event.id}`}
          className="block text-sm font-semibold leading-[1.3] text-text-primary hover:text-primary-700"
        >
          {t(event.stepKey)}
        </Link>
        <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-quaternary">
          {t(event.detailKey, event.detailValues)}
          {event.attempt && event.attempt > 1
            ? ` · ${t('activity.attempt', { n: event.attempt })}`
            : ''}
        </span>
        {event.fawtaraUuid ? (
          <span className="mt-1 block truncate font-mono text-[11px] leading-[1.4] text-text-quaternary">
            {t('activity.fawtaraId')} {event.fawtaraUuid}
          </span>
        ) : null}
      </span>

      <span
        className={[
          'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-[11px] font-semibold uppercase tracking-[0.4px]',
          channel.tone,
        ].join(' ')}
      >
        <img src={channel.icon} alt="" className="size-3" />
        {t(`activity.channel.${event.channel}`)}
      </span>

      <span className="flex w-[210px] shrink-0 items-center justify-end gap-2.5">
        <span
          className={[
            'inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium',
            outcome.chip,
          ].join(' ')}
        >
          <span className={['size-1.5 rounded-full', outcome.dot].join(' ')} />
          {t(`activity.outcome.${event.outcome}`)}
        </span>
        {event.actionKey ? (
          <button
            type="button"
            className="inline-flex h-[32px] shrink-0 items-center whitespace-nowrap rounded-sm border border-border-subtle bg-white px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t(event.actionKey)}
          </button>
        ) : null}
      </span>
    </li>
  )
}

function Kpi({
  icon,
  tile,
  label,
  value,
  note,
  emphasis,
}: {
  icon: string
  tile: string
  label: string
  value: number
  note: string
  emphasis?: boolean
}) {
  return (
    <article
      className={[
        'rounded-md p-5',
        emphasis && value > 0 ? 'border border-[#f0d4ce] bg-[#fdf4f2]' : 'bg-surface-card',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <span
          className={['flex size-9 shrink-0 items-center justify-center rounded-full', tile].join(
            ' ',
          )}
        >
          <img src={icon} alt="" className="size-[18px]" />
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{label}</h3>
      </div>
      <p
        className={[
          'mt-3 text-[28px] font-semibold leading-[1.2] tabular-nums',
          emphasis && value > 0 ? 'text-warning-700' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </p>
      <p className="mt-2 text-xs font-medium leading-[1.3] text-text-quaternary">{note}</p>
    </article>
  )
}
