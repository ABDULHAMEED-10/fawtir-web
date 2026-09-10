import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { Rial, RialText, withRial } from '../../components/ui'
import { longDate, RESETS_ON, RAISED_TODAY, usageForecast } from '../../lib/settings'
import {
  PLANS,
  CURRENT_PLAN,
  USAGE_STATS,
  UPGRADE,
  OVERAGE_ON,
  planFit,
  type Plan,
} from '../../lib/settingsBilling'
import { OPEN_BRANCHES } from '../../lib/settingsCompany'
import tickIcon from '../../assets/settings/check-ink.svg'
import tickGreenIcon from '../../assets/settings/check-green.svg'
import infoIcon from '../../assets/settings/info.svg'

/**
 * Settings › Plan and usage (Figma 135:40605).
 *
 * The forecast is arithmetic, not copy: the daily rate comes from the count and the day of the
 * month, the run-out date from what is left at that rate, and the shortfall from the days still
 * to run. The design printed a rate, a day count and a shortfall that no single calendar
 * supported; here they move together or not at all.
 */
export function PlanPage() {
  const { t } = useTranslation()
  const [overage, setOverage] = useState(OVERAGE_ON)
  const forecast = usageForecast()

  const willRunOut = forecast.shortfall > 0

  return (
    <SettingsShell group="billing">
      <SettingsHeader
        title={t('plan.title')}
        subtitle={t('plan.subtitle')}
        actions={
          <Link
            to="/settings/bills"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('plan.billsAndPayment')}
          </Link>
        }
      />

      {/* Forecast */}
      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap gap-6 p-5">
          <div className="shrink-0">
            <p className="flex items-baseline gap-1">
              <span className="text-[54px] font-semibold leading-[1] text-pending-700 tabular-nums">
                {forecast.used}
              </span>
              <span className="text-lg font-medium text-text-quaternary">
                / {forecast.allowance}
              </span>
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
              {t('plan.invoicesThisMonth')}
            </p>
          </div>

          <div className="min-w-[320px] flex-1">
            <h3 className="text-xl font-medium leading-[1.2] text-text-primary">
              {willRunOut
                ? t('plan.runOutHeadline', { date: longDate(forecast.runOut) })
                : t('plan.comfortableHeadline')}
            </h3>
            <p className="mt-2 max-w-[640px] text-sm font-medium leading-[1.6] text-text-tertiary">
              <Trans
                i18nKey={willRunOut ? 'plan.runOutBody' : 'plan.comfortableBody'}
                values={{
                  perDay: forecast.perDay,
                  days: forecast.daysLeft,
                  short: Math.abs(forecast.shortfall),
                  spare: Math.abs(forecast.shortfall),
                  allowance: forecast.allowance,
                }}
                components={{ b: <b className="font-semibold text-text-primary" /> }}
              />
            </p>

            <span className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-surface-background">
              <span
                className="bg-pending-500"
                style={{ width: `${(forecast.used / forecast.allowance) * 100}%` }}
              />
            </span>
            <p className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-4 text-xs font-medium text-text-quaternary">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px] bg-pending-500" />
                  {t('plan.used', { count: forecast.used })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px] bg-pending-100" />
                  {t('plan.leftAbout', {
                    count: forecast.left,
                    days: forecast.daysOfHeadroom,
                  })}
                </span>
              </span>
              <span className="text-xs font-medium text-text-quaternary">
                {t('plan.resetsOn', { date: longDate(RESETS_ON) })}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2.5">
            <button
              type="button"
              className="inline-flex h-[46px] items-center justify-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t('plan.moveUp')}
            </button>
            <button
              type="button"
              onClick={() => setOverage((current) => !current)}
              className="inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {overage ? t('plan.turnOverageOff') : t('plan.turnOverageOn')}
            </button>
          </div>
        </div>

        <dl className="grid border-t border-surface-background sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label={t('plan.stat.raisedToday')}
            value={String(RAISED_TODAY)}
            note={OPEN_BRANCHES.map(
              (branch) =>
                `${branch.name} ${
                  USAGE_STATS.raisedToday[branch.id as keyof typeof USAGE_STATS.raisedToday] ?? 0
                }`,
            ).join(' · ')}
          />
          <Stat
            label={t('plan.stat.resubmissions')}
            value={t('plan.stat.resubmissionsOf', {
              count: USAGE_STATS.resubmissions,
              total: forecast.used,
            })}
            note={t('plan.stat.resubmissionsNote')}
            tone="pending"
          />
          <Stat
            label={t('plan.stat.busiest')}
            value={String(USAGE_STATS.busiestDayCount)}
            note={`${USAGE_STATS.busiestWeekday} ${longDate(USAGE_STATS.busiestDay)}`}
          />
          <Stat
            label={t('plan.stat.lastMonth')}
            value={String(USAGE_STATS.lastMonth)}
            unit={t('plan.stat.lastMonthOf', { allowance: forecast.allowance })}
            note={
              USAGE_STATS.lastMonth > forecast.allowance * 0.9
                ? t('plan.stat.lastMonthNote')
                : t('plan.stat.lastMonthRoom')
            }
          />
        </dl>
      </section>

      {/* Plans */}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </SettingsShell>
  )
}

function Stat({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string
  value: string
  unit?: string
  note: string
  tone?: 'pending'
}) {
  return (
    <div className="border-b border-e border-surface-background px-5 py-4 last:border-e-0">
      <dt className="text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.5px] text-text-quaternary">
        {label}
      </dt>
      <dd className="mt-1.5">
        <p className="flex items-baseline gap-1.5">
          <span
            className={[
              'text-lg font-semibold leading-[1.2] tabular-nums',
              tone === 'pending' ? 'text-pending-700' : 'text-text-primary',
            ].join(' ')}
          >
            {value}
          </span>
          {unit ? <span className="text-xs font-medium text-text-quaternary">{unit}</span> : null}
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">{note}</p>
      </dd>
    </div>
  )
}

function PlanCard({ plan }: { plan: Plan }) {
  const { t } = useTranslation()
  const current = plan.id === CURRENT_PLAN.id
  const better = plan.monthly > CURRENT_PLAN.monthly
  const smaller = plan.monthly < CURRENT_PLAN.monthly
  const fit = planFit(plan)

  const features = [
    t('plan.feature.invoices', { count: plan.invoices.toLocaleString('en-US') }),
    plan.extraPerson
      ? t('plan.feature.peopleThen', { count: plan.people, amount: plan.extraPerson.toFixed(3) })
      : plan.id === 'businessPlus'
        ? t('plan.feature.peopleIncluded', { count: plan.people })
        : t('plan.feature.people', { count: plan.people }),
    plan.branches === null
      ? t('plan.feature.unlimitedBranches')
      : t('plan.feature.branches', { count: plan.branches }),
    plan.api ? t('plan.feature.api') : t('plan.feature.noApi'),
    ...(plan.prioritySupport ? [t('plan.feature.prioritySupport')] : []),
  ]

  return (
    <article
      className={[
        'flex flex-col rounded-md bg-surface-card p-5',
        current ? 'ring-1 ring-primary-700' : '',
      ].join(' ')}
    >
      <span
        className={[
          'inline-flex h-[24px] w-fit items-center rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
          current
            ? 'bg-primary-700 text-white'
            : better
              ? 'bg-[#3d5648] text-white'
              : 'bg-surface-background text-text-tertiary',
        ].join(' ')}
      >
        {current ? t('plan.yourPlan') : better ? t('plan.fitsYouBetter') : t('plan.smaller')}
      </span>

      <h3
        className={[
          'mt-3 font-medium leading-[1.2] text-text-primary',
          better ? 'text-2xl' : 'text-xl',
        ].join(' ')}
      >
        {t(`plan.planName.${plan.id}`)}
      </h3>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className={[
            'font-semibold leading-[1.1] text-text-primary',
            better ? 'text-[32px]' : 'text-[28px]',
          ].join(' ')}
        >
          <Rial />
        </span>
        <span
          className={[
            'font-semibold leading-[1.1] text-text-primary tabular-nums',
            better ? 'text-[32px]' : 'text-[28px]',
          ].join(' ')}
        >
          {plan.monthly.toFixed(3)}
        </span>
        <span className="text-sm font-medium text-text-quaternary">{t('plan.perMonth')}</span>
      </p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-70" />
            <span className="text-sm font-medium leading-[1.4] text-text-tertiary">
              {withRial(feature)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-5">
        {better ? (
          <>
            <p className="flex items-start gap-2 rounded-sm bg-success-100 px-3 py-2.5 text-xs font-medium leading-[1.6] text-[#3d5648]">
              <img src={tickGreenIcon} alt="" className="mt-0.5 size-4 shrink-0" />
              <span>
                <Trans
                  i18nKey="plan.wouldCover"
                  values={{ amount: UPGRADE.extraMonthly.toFixed(3) }}
                  components={{ b: <RialText as="b" className="font-semibold" /> }}
                />
              </span>
            </p>
            <button
              type="button"
              className="mt-3 inline-flex h-[46px] w-full items-center justify-center rounded-sm bg-primary-700 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t('plan.moveTo', { plan: t(`plan.planName.${plan.id}`) })}
            </button>
          </>
        ) : current ? (
          <p className="flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.6] text-text-tertiary">
            <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
            <span>
              {fit.invoicesTight && fit.peopleTight
                ? t('plan.atTheCeiling')
                : t('plan.stat.lastMonthRoom')}
            </span>
          </p>
        ) : smaller ? (
          <p className="inline-flex h-[46px] w-full items-center justify-center rounded-sm border border-border-subtle text-sm font-medium text-text-quaternary">
            {t('plan.tooSmall')}
          </p>
        ) : null}
      </div>
    </article>
  )
}
