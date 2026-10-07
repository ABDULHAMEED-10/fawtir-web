import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { withRial } from '../../components/ui'
import {
  ConsoleBuildingIcon,
  ConsoleClockIcon,
  ConsoleIncidentIcon,
  ConsoleTickIcon,
} from '../../layouts/ConsoleShell/consoleIcons'
import {
  BY_HOUR,
  BY_HOUR_MAX,
  NOW,
  OTA,
  PLATFORM,
  QUIET_TODAY,
  REVENUE,
  REVENUE_PER_TENANT,
  WORTH_A_LOOK,
  count,
  percent,
  tenantById,
} from '../../lib/superAdmin'
import {
  connectionsNeedingAttention,
  platformErpKpis,
  tenantName,
  useConsoleErp,
} from '../../lib/consoleErp'
import { attentionReason } from './erp/erpShared'
import { formatAmount } from '../../lib/format'
import { ConsoleStatusPill } from '../../layouts/ConsoleShell/ConsoleStatusPill'
import { CONSOLE_CARD, CONSOLE_CARD_FOOT, CONSOLE_CARD_HEAD, CONSOLE_CARD_NOTE, CONSOLE_CARD_TITLE, CONSOLE_LINK, CONSOLE_PAGE, CONSOLE_PRIMARY, CONSOLE_ROW, CONSOLE_SECONDARY, CONSOLE_SMALL, ConsoleCardHead, ConsoleKpi, ConsolePageHeader } from '../../layouts/ConsoleShell/consoleStyle'
import { CONSOLE_TONE_TEXT } from '../../layouts/ConsoleShell/consoleTones'

const TONE = {
  bad: CONSOLE_TONE_TEXT.bad,
  watch: CONSOLE_TONE_TEXT.watch,
  calm: 'text-text-muted',
} as const

/** The "Tenants worth a look" avatar, tinted like the reason beside it. */
const AVATAR_TONE = {
  bad: 'bg-danger-100 text-danger-700',
  watch: 'bg-pending-100 text-pending-500',
  calm: 'bg-surface-background text-text-muted',
} as const

/** Two lines over the same hours: today, and the same day last week. */
function ByHourChart({ label, slowedLabel }: { label: string; slowedLabel: string }) {
  const width = 640
  const height = 210
  const labelWidth = 46
  const band = (width - labelWidth - 40) / (BY_HOUR.hours.length - 1)
  const y = (v: number) => height - (v / BY_HOUR_MAX) * height
  const x = (i: number) => labelWidth + band * i
  const path = (series: readonly number[]) =>
    series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v)}`).join(' ')
  const ticks = [0, 600, 1200, 1800, 2400]
  // Room on the right so the "slowed at" label can sit after its marker line, as the frame draws it.
  const labelRoom = 48

  return (
    <svg
      viewBox={`0 -10 ${width + labelRoom} ${height + 40}`}
      className="w-full"
      role="img"
      aria-label={label}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={labelWidth} x2={width + labelRoom} y1={y(tick)} y2={y(tick)} stroke="#eceef2" />
          <text
            x={labelWidth - 8}
            y={y(tick) + 4}
            textAnchor="end"
            fontSize={11}
            fontWeight={500}
            fill="#8a8e96"
          >
            {count(tick)}
          </text>
        </g>
      ))}

      <path
        d={path(BY_HOUR.lastWeek)}
        fill="none"
        stroke="#c0cae9"
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      <path d={path(BY_HOUR.today)} fill="none" stroke="#2c4eb7" strokeWidth={2.5} />
      <circle
        cx={x(BY_HOUR.today.length - 1)}
        cy={y(BY_HOUR.today.at(-1)!)}
        r={4.5}
        fill="#fff"
        stroke="#2c4eb7"
        strokeWidth={2.5}
      />

      {/* Where the OTA started to slow, which is what the note below the chart explains. */}
      <line
        x1={x(BY_HOUR.slowedAfter)}
        x2={x(BY_HOUR.slowedAfter)}
        y1={-10}
        y2={height}
        stroke="#98140b"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <text
        x={x(BY_HOUR.slowedAfter) + 6}
        y={2}
        fontSize={11}
        fontWeight={600}
        fill="#98140b"
        textAnchor="start"
        direction="ltr"
      >
        {slowedLabel}
      </text>

      {[0, 3, 6, 8].map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height + 22}
          textAnchor="middle"
          fontSize={11}
          fontWeight={500}
          fill="#8a8e96"
        >
          {BY_HOUR.hours[i]}
        </text>
      ))}
      <text
        x={x(BY_HOUR.hours.length - 1)}
        y={height + 22}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="#2c4eb7"
      >
        {label}
      </text>
    </svg>
  )
}

function ConnectionLine({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'bad' | 'watch' | 'good'
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-[9px] text-[13.5px] last:border-b-0">
      <span className="font-medium text-text-muted">{label}</span>
      <span className={`text-end font-semibold ${tone ? CONSOLE_TONE_TEXT[tone] : 'text-text-primary'}`}>
        {withRial(value)}
      </span>
    </div>
  )
}

/**
 * The ERP connections that need a person today — in error or stale — and the add-on requests
 * waiting, with the three most urgent named; the ERP screens hold the rest.
 */
function IntegrationsCard() {
  const { t } = useTranslation()
  const erp = useConsoleErp()
  const kpis = platformErpKpis(erp)
  const attention = connectionsNeedingAttention(erp)
  const listed = [...attention]
    .sort((a, b) => (a.state === 'ERROR' ? 0 : 1) - (b.state === 'ERROR' ? 0 : 1))
    .slice(0, 3)
  const key = (name: string) => `console.operations.integrations.${name}`

  return (
    <section className={`flex flex-col ${CONSOLE_CARD}`}>
      <div className={CONSOLE_CARD_HEAD}>
        <div>
          <h2 className={CONSOLE_CARD_TITLE}>
            {t(key('title'))}
          </h2>
          <p className={CONSOLE_CARD_NOTE}>{t(key('subtitle'))}</p>
        </div>
        <Link to="/console/erp" className={CONSOLE_LINK}>
          {t(key('open'))}
        </Link>
      </div>
      <div className="grid grid-cols-[340px_minmax(0,1fr)] max-lg:grid-cols-1">
        <div className="border-e border-border-subtle px-5 py-2 max-lg:border-b max-lg:border-e-0">
          <ConnectionLine
            label={t(key('inError'))}
            value={count(kpis.inError)}
            tone={kpis.inError > 0 ? 'bad' : undefined}
          />
          <ConnectionLine
            label={t(key('stale'))}
            value={count(kpis.stale)}
            tone={kpis.stale > 0 ? 'watch' : undefined}
          />
          <ConnectionLine label={t(key('requests'))} value={count(kpis.pendingRequests)} />
        </div>
        {listed.length === 0 ? (
          <p className="px-5 py-4 text-sm font-medium leading-[1.5] text-text-tertiary">
            {t(key('allClear'))}
          </p>
        ) : (
          <ul>
            {listed.map((c) => {
              const bad = c.state === 'ERROR'
              return (
                <li key={c.id} className="border-b border-border-subtle last:border-b-0">
                  <Link
                    to={`/console/erp/connections/${c.id}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-primary-25"
                  >
                    <span
                      className={`size-2 shrink-0 rounded-full ${bad ? 'bg-danger-700' : 'bg-pending-500'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-[1.2] text-text-primary">
                        {tenantName(c.tenantId)}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-text-muted">
                        {/* The sample names join place and system with a dash; the copy uses a dot. */}
                        {c.label.replace(/\s+—\s+/g, ' · ')}
                      </span>
                    </span>
                    <span
                      className={`text-end text-[13.5px] font-semibold ${TONE[bad ? 'bad' : 'watch']}`}
                    >
                      {attentionReason(t, c)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {attention.length > listed.length ? (
        <p className={CONSOLE_CARD_FOOT}>
          {t(key('more'), { count: attention.length - listed.length })}
        </p>
      ) : null}
    </section>
  )
}

export function OperationsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const when = `${NOW.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })}, ${NOW.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <ConsoleShell>
      <div className={CONSOLE_PAGE}>
        <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.operations' }]} />
        <ConsolePageHeader
          title={t('console.operations.title')}
          subtitle={t('console.operations.subtitle', { when, tenants: count(PLATFORM.live) })}
          actions={
            <>
              <button type="button" className={CONSOLE_SECONDARY}>
                {t('console.operations.postNotice')}
              </button>
              <Link to="/console/queue" className={CONSOLE_PRIMARY}>
                {t('console.operations.openQueue')}
              </Link>
            </>
          }
        />

        <div className="flex flex-wrap gap-4">
          <ConsoleKpi
            icon={<ConsoleTickIcon className="size-4 text-success-700" />}
            title={t('console.operations.filedToday')}
            value={count(PLATFORM.filedToday)}
            note={t('console.operations.filedTodayNote', {
              accepted: percent(PLATFORM.acceptedFirstTimeToday),
              refused: percent(1 - PLATFORM.acceptedFirstTimeToday),
            })}
            tone="good"
          />
          <ConsoleKpi
            icon={<ConsoleClockIcon className="size-4 text-pending-500" />}
            title={t('console.operations.waiting')}
            value={count(PLATFORM.waiting)}
            note={t('console.operations.waitingNote', {
              oldest: PLATFORM.oldestWaitMinutes,
              normal: PLATFORM.normalWaitSeconds,
            })}
            tone="watch"
          />
          <ConsoleKpi
            icon={<ConsoleIncidentIcon className="size-4 text-danger-700" />}
            title={t('console.operations.ourFault')}
            value={count(PLATFORM.ourFault)}
            note={t('console.operations.ourFaultNote')}
            tone="bad"
          />
          <ConsoleKpi
            icon={<ConsoleBuildingIcon className="size-4 text-primary-700" />}
            title={t('console.operations.filingToday')}
            value={count(PLATFORM.filingToday)}
            suffix={t('console.operations.ofTenants', { total: count(PLATFORM.live) })}
            note={t('console.operations.filingTodayNote', { quiet: QUIET_TODAY })}
          />
        </div>

        <div className={CONSOLE_ROW}>
          <section className={`flex min-w-[320px] flex-1 flex-col max-md:min-w-0 ${CONSOLE_CARD}`}>
            <ConsoleCardHead
              title={t('console.operations.byHour')}
              note={t('console.operations.byHourNote')}
            />
            <div className="p-5">
              <ByHourChart
                label={t('console.operations.now')}
                slowedLabel={t('console.operations.slowedAt', { time: OTA.slowedAt })}
              />
            </div>
            <p className={CONSOLE_CARD_FOOT}>
              {t('console.operations.byHourStory', { time: OTA.slowedAt })}
            </p>
          </section>

          <section className={`flex w-full flex-col xl:w-[380px] xl:shrink-0 ${CONSOLE_CARD}`}>
            <ConsoleCardHead
              title={t('console.operations.connection')}
              action={
                <ConsoleStatusPill
                  size="header"
                  tone="pending"
                  label={t(`console.ota.${OTA.state}`)}
                />
              }
            />
            <div className="p-5">
              <ConnectionLine
                label={t('console.ota.answering')}
                value={t(OTA.answering ? 'common.yes' : 'common.no')}
                tone={OTA.answering ? 'good' : 'bad'}
              />
              <ConnectionLine
                label={t('console.ota.roundTrip')}
                value={t('console.ota.seconds', { value: OTA.roundTripNow })}
                tone="bad"
              />
              <ConnectionLine
                label={t('console.ota.normal')}
                value={t('console.ota.seconds', { value: OTA.roundTripNormal })}
              />
              <ConnectionLine
                label={t('console.ota.errors')}
                value={t('console.ota.inAnHour', { count: OTA.errorsInAnHour })}
                tone="watch"
              />
              <ConnectionLine
                label={t('console.ota.as4')}
                value={t(OTA.as4Healthy ? 'console.ota.healthy' : 'console.ota.unhealthy')}
                tone={OTA.as4Healthy ? 'good' : 'bad'}
              />
              <ConnectionLine
                label={t('console.ota.smp')}
                value={t(OTA.smpHealthy ? 'console.ota.healthy' : 'console.ota.unhealthy')}
                tone={OTA.smpHealthy ? 'good' : 'bad'}
              />
              <div className="mt-5 flex flex-col gap-2">
                <Link to="/compliance/activity/call-log" className={`${CONSOLE_SMALL} w-full`}>
                  {t('console.ota.openCallLog')}
                </Link>
                <button type="button" className={`${CONSOLE_SMALL} w-full`}>
                  {t('console.ota.statusPage')}
                </button>
              </div>
            </div>
          </section>
        </div>

        <IntegrationsCard />

        <div className={CONSOLE_ROW}>
          <section className={`flex min-w-[320px] flex-1 flex-col max-md:min-w-0 ${CONSOLE_CARD}`}>
            <ConsoleCardHead
              title={t('console.worth.title')}
              note={t('console.worth.subtitle')}
              action={
                <Link to="/console/tenants" className={CONSOLE_LINK}>
                  {t('console.worth.all', { count: count(PLATFORM.live) })}
                </Link>
              }
            />
            <ul>
              {WORTH_A_LOOK.map((worth) => {
                const tenant = tenantById(worth.tenantId)
                return (
                  <li
                    key={worth.tenantId}
                    className="border-b border-border-subtle last:border-b-0"
                  >
                    <Link
                      to="/console/tenants"
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 transition-colors hover:bg-primary-25"
                    >
                      <span
                        dir="ltr"
                        className={`flex size-[34px] shrink-0 items-center justify-center rounded-sm text-[11.5px] font-bold ${AVATAR_TONE[worth.tone]}`}
                      >
                        {tenant.initials}
                      </span>
                      <span className="min-w-[180px] flex-1">
                        <span className="block text-sm font-semibold leading-[1.2] text-text-primary">
                          {tenant.name}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-muted">
                          {t(`console.operations.town.${tenant.town}`, { defaultValue: tenant.town })}{' '}
                          · {t(`console.plan.${tenant.plan}`)} ·{' '}
                          {t(tenant.ageKey, tenant.ageValues)}
                        </span>
                      </span>
                      <span className="text-end max-md:w-full max-md:ps-[46px] max-md:text-start">
                        <span className={`block text-[13.5px] font-semibold ${TONE[worth.tone]}`}>
                          {t(worth.noteKey, worth.noteValues)}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-muted">
                          {t(worth.detailKey, worth.detailValues)}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            <p className={CONSOLE_CARD_FOOT}>{t('console.worth.story')}</p>
          </section>

          <section className={`flex w-full flex-col xl:w-[380px] xl:shrink-0 ${CONSOLE_CARD}`}>
            <ConsoleCardHead
              title={t('console.across.title')}
              action={<span className={CONSOLE_LINK}>{t('console.across.thisMonth')}</span>}
            />
            <div className="p-5">
              <ConnectionLine
                label={t('console.across.tenants')}
                value={t('console.across.tenantsValue', {
                  live: count(PLATFORM.live),
                  onboarding: PLATFORM.onboarding,
                })}
              />
              <ConnectionLine
                label={t('console.across.invoices')}
                value={count(PLATFORM.invoicesThisMonth)}
              />
              <ConnectionLine
                label={t('console.across.acceptedFirstTime')}
                value={percent(PLATFORM.acceptedFirstTimeThisMonth)}
                tone="good"
              />
              <ConnectionLine
                label={t('console.across.nearQuota')}
                value={t('console.across.tenantsCount', { count: PLATFORM.nearQuota })}
                tone="watch"
              />
              <ConnectionLine
                label={t('console.across.certificates')}
                value={t('console.across.within30', { count: PLATFORM.certificatesExpiring })}
                tone="bad"
              />
              <ConnectionLine
                label={t('console.across.revenue')}
                value={`OMR ${formatAmount(REVENUE, 'OMR', i18n.language)}`}
              />
              <ConnectionLine
                label={t('console.across.left')}
                value={String(PLATFORM.leftThisMonth)}
              />
            </div>
            <p className={CONSOLE_CARD_FOOT}>
              {withRial(
                t('console.across.average', {
                  amount: formatAmount(REVENUE_PER_TENANT, 'OMR', i18n.language),
                }),
              )}
            </p>
          </section>
        </div>
      </div>
    </ConsoleShell>
  )
}
