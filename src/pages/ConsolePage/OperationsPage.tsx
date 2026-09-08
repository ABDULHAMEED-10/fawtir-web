import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ConsoleShell } from '../../layouts/ConsoleShell'
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
  REVENUE_PER_TENANT,
  WORTH_A_LOOK,
  count,
  omr,
  percent,
  tenantById,
} from '../../lib/superAdmin'

const TONE = {
  bad: 'text-danger-700',
  watch: 'text-pending-700',
  calm: 'text-text-tertiary',
} as const

function KpiCard({
  icon,
  title,
  value,
  suffix,
  note,
  tone = 'calm',
}: {
  icon: React.ReactNode
  title: string
  value: string
  suffix?: string
  note: string
  tone?: 'bad' | 'watch' | 'calm' | 'good'
}) {
  const valueTone =
    tone === 'bad' ? 'text-danger-700' : tone === 'watch' ? 'text-pending-700' : 'text-text-primary'
  return (
    <article className="flex min-w-[240px] flex-1 flex-col gap-2.5 rounded-md bg-surface-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-background">
          {icon}
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{title}</h3>
      </div>
      <p className={`text-[32px] font-semibold leading-[1.2] ${valueTone}`}>
        {value}
        {suffix ? (
          <span className="ms-1.5 text-base font-medium text-text-quaternary">{suffix}</span>
        ) : null}
      </p>
      <p className="text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

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

  return (
    <svg viewBox={`0 -10 ${width} ${height + 40}`} className="w-full" role="img" aria-label={label}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={labelWidth} x2={width} y1={y(tick)} y2={y(tick)} stroke="#eceef2" />
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
        textAnchor="end"
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

function ConnectionLine({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0">
      <span className="text-sm font-medium text-text-tertiary">{label}</span>
      <span
        className={`text-sm font-semibold ${tone === 'bad' ? 'text-danger-700' : 'text-text-primary'}`}
      >
        {value}
      </span>
    </div>
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
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('console.operations.title')}
            </h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
              {t('console.operations.subtitle', { when, tenants: count(PLATFORM.live) })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('console.operations.postNotice')}
            </button>
            <Link
              to="/console/queue"
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t('console.operations.openQueue')}
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <KpiCard
            icon={<ConsoleTickIcon className="size-[18px] text-success-700" />}
            title={t('console.operations.filedToday')}
            value={count(PLATFORM.filedToday)}
            note={t('console.operations.filedTodayNote', {
              accepted: percent(PLATFORM.acceptedFirstTimeToday),
              refused: percent(1 - PLATFORM.acceptedFirstTimeToday),
            })}
          />
          <KpiCard
            icon={<ConsoleClockIcon className="size-[18px] text-pending-700" />}
            title={t('console.operations.waiting')}
            value={count(PLATFORM.waiting)}
            note={t('console.operations.waitingNote', {
              oldest: PLATFORM.oldestWaitMinutes,
              normal: PLATFORM.normalWaitSeconds,
            })}
          />
          <KpiCard
            icon={<ConsoleIncidentIcon className="size-[18px] text-danger-700" />}
            title={t('console.operations.ourFault')}
            value={count(PLATFORM.ourFault)}
            note={t('console.operations.ourFaultNote')}
            tone="bad"
          />
          <KpiCard
            icon={<ConsoleBuildingIcon className="size-[18px] text-primary-700" />}
            title={t('console.operations.filingToday')}
            value={count(PLATFORM.filingToday)}
            suffix={t('console.operations.ofTenants', { total: count(PLATFORM.live) })}
            note={t('console.operations.filingTodayNote', { quiet: QUIET_TODAY })}
          />
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <section className="flex min-w-[320px] flex-1 flex-col rounded-md bg-surface-card">
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('console.operations.byHour')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('console.operations.byHourNote')}
              </p>
            </div>
            <div className="px-5 py-4">
              <ByHourChart
                label={t('console.operations.now')}
                slowedLabel={t('console.operations.slowedAt', { time: OTA.slowedAt })}
              />
            </div>
            <p className="border-t border-border-subtle px-5 py-4 text-sm font-medium leading-[1.5] text-text-tertiary">
              {t('console.operations.byHourStory', { time: OTA.slowedAt })}
            </p>
          </section>

          <section className="flex w-full flex-col rounded-md bg-surface-card p-5 xl:w-[380px] xl:shrink-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('console.operations.connection')}
              </h2>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-pending-100 px-2.5 text-xs font-semibold uppercase tracking-[0.04em] text-pending-700">
                <span className="size-1.5 rounded-full bg-pending-700" />
                {t(`console.ota.${OTA.state}`)}
              </span>
            </div>
            <div className="mt-3">
              <ConnectionLine
                label={t('console.ota.answering')}
                value={t(OTA.answering ? 'common.yes' : 'common.no')}
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
                tone="bad"
              />
              <ConnectionLine
                label={t('console.ota.as4')}
                value={t(OTA.as4Healthy ? 'console.ota.healthy' : 'console.ota.unhealthy')}
              />
              <ConnectionLine
                label={t('console.ota.smp')}
                value={t(OTA.smpHealthy ? 'console.ota.healthy' : 'console.ota.unhealthy')}
              />
            </div>
            <Link
              to="/compliance/activity/call-log"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('console.ota.openCallLog')}
            </Link>
            <button
              type="button"
              className="mt-2 inline-flex h-11 items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('console.ota.statusPage')}
            </button>
          </section>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <section className="flex min-w-[320px] flex-1 flex-col rounded-md bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div>
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('console.worth.title')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('console.worth.subtitle')}
                </p>
              </div>
              <Link
                to="/console/tenants"
                className="text-sm font-semibold text-primary-700 hover:text-primary-800"
              >
                {t('console.worth.all', { count: count(PLATFORM.live) })}
              </Link>
            </div>
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
                      className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-primary-25"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background text-xs font-semibold text-text-tertiary">
                        {tenant.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium leading-[1.2] text-text-primary">
                          {tenant.name}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {tenant.town} · {t(`console.plan.${tenant.plan}`)} ·{' '}
                          {t(tenant.ageKey, tenant.ageValues)}
                        </span>
                      </span>
                      <span className="text-end">
                        <span className={`block text-sm font-semibold ${TONE[worth.tone]}`}>
                          {t(worth.noteKey, worth.noteValues)}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t(worth.detailKey, worth.detailValues)}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
            <p className="border-t border-border-subtle px-5 py-4 text-sm font-medium leading-[1.5] text-text-tertiary">
              {t('console.worth.story')}
            </p>
          </section>

          <section className="flex w-full flex-col rounded-md bg-surface-card p-5 xl:w-[380px] xl:shrink-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('console.across.title')}
              </h2>
              <span className="text-sm font-semibold text-primary-700">
                {t('console.across.thisMonth')}
              </span>
            </div>
            <div className="mt-3">
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
              />
              <ConnectionLine
                label={t('console.across.nearQuota')}
                value={t('console.across.tenantsCount', { count: PLATFORM.nearQuota })}
              />
              <ConnectionLine
                label={t('console.across.certificates')}
                value={t('console.across.within30', { count: PLATFORM.certificatesExpiring })}
                tone="bad"
              />
              <ConnectionLine
                label={t('console.across.revenue')}
                value={`OMR ${omr(PLATFORM.revenue)}`}
              />
              <ConnectionLine
                label={t('console.across.left')}
                value={String(PLATFORM.leftThisMonth)}
              />
            </div>
            <p className="mt-3 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('console.across.average', { amount: omr(REVENUE_PER_TENANT) })}
            </p>
          </section>
        </div>
      </div>
    </ConsoleShell>
  )
}
