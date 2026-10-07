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
  planHighlights,
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
                / {forecast.allowance.toLocaleString('en-US')}
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
                  allowance: forecast.allowance.toLocaleString('en-US'),
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
            unit={t('plan.stat.lastMonthOf', {
              allowance: forecast.allowance.toLocaleString('en-US'),
            })}
            note={
              USAGE_STATS.lastMonth > forecast.allowance * 0.9
                ? t('plan.stat.lastMonthNote')
                : t('plan.stat.lastMonthRoom')
            }
          />
        </dl>
      </section>

      {/* Plans */}
      {/* All four plans, as /plans and /pricing list them; Enterprise has no price to print. */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
        <EnterpriseCard />
      </div>

      <AddonsSection />
    </SettingsShell>
  )
}

/**
 * What the account has on top of the plan: today only ERP integration.
 *
 * This section used to draw an ERP add-on from the in-memory connector mock: a state, a monthly
 * usage figure, a reset date, launch prices and a "switch on" button that changed nothing but the
 * page. None of it was the organisation's. ERP is enabled per organisation by Fawtir (backend
 * Phase 3) and has no billing or usage endpoint yet, so the section says that and points to where
 * the real state is shown, rather than inventing one.
 */
function AddonsSection() {
  const { t } = useTranslation()
  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="p-5">
        <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
          {t('plan.addons.title')}
        </h3>
        <p className="mt-0.5 text-xs font-medium leading-[1.5] text-text-quaternary">
          {t('plan.addons.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-5 border-t border-surface-background p-5">
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-text-primary">
              {t('plan.addons.extraction.name')}
            </p>
            <span className="inline-flex h-[24px] items-center gap-1.5 rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
              <span className="size-1.5 rounded-full bg-current" />
              {t('plan.addons.state.managedByFawtir')}
            </span>
          </div>
          <p className="mt-1 max-w-[560px] text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('plan.addons.extraction.body')}
          </p>
          <p className="mt-3 max-w-[560px] text-sm font-medium leading-[1.6] text-text-secondary">
            {t('plan.addons.extraction.realState')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Link
            to="/settings/erp"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('plan.addons.openIntegration')}
          </Link>
        </div>
      </div>
    </section>
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

/**
 * Enterprise: Business Plus with documents, people and branches agreed on a call, so it shows
 * "Custom" where the others show a price, and its one action is to talk to the team (the
 * Contact page, as on /pricing). Same card as the other plans.
 */
function EnterpriseCard() {
  const { t } = useTranslation()
  const features = (['f1', 'f2', 'f3', 'f4', 'f5'] as const).map((key) =>
    t(`plans.enterprise.features.${key}`),
  )

  return (
    <article className="flex flex-col rounded-md bg-surface-card p-5">
      <span className="inline-flex h-[24px] w-fit items-center rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
        {t('plan.larger')}
      </span>

      <h3 className="mt-3 text-xl font-medium leading-[1.2] text-text-primary">
        {t('plan.planName.enterprise')}
      </h3>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[28px] font-semibold leading-[1.1] text-text-primary">
          {t('plans.enterprise.price')}
        </span>
        <span className="text-sm font-medium text-text-quaternary">
          {t('plans.enterprise.billingNote')}
        </span>
      </p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-70" />
            <span className="text-sm font-medium leading-[1.4] text-text-tertiary">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-5">
        <Link
          to="/contact"
          className="inline-flex h-[46px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('plans.talkToTeam')}
        </Link>
      </div>
    </article>
  )
}

function PlanCard({ plan }: { plan: Plan }) {
  const { t } = useTranslation()
  const current = plan.id === CURRENT_PLAN.id
  const better = plan.monthly > CURRENT_PLAN.monthly
  const smaller = plan.monthly < CURRENT_PLAN.monthly
  const fit = planFit(plan)
  const highlights = planHighlights(plan.id)

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
    // What the plan switches on, from the catalogue's own feature matrix: the plan it builds on,
    // a few runs of features, and whether automatic ERP extraction can be bought or comes free.
    ...(highlights.plus
      ? [t('plan.feature.everythingIn', { plan: t(`plan.planName.${highlights.plus}`) })]
      : []),
    ...highlights.lines.map((line) =>
      line.map((feature) => t(`plan.featureShort.${feature}`)).join(' · '),
    ),
    t('plan.feature.extraction', {
      name: t('plan.extraction.name'),
      availability: t(`plan.extraction.${highlights.extraction}`),
    }),
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

      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
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
        <span className="whitespace-nowrap text-sm font-medium text-text-quaternary">
          {t('plan.perMonth')}
        </span>
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
