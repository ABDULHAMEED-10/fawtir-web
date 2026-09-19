import { useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { SettingsShell } from '../../pages/SettingsPage/SettingsShell'
import { LockIcon, Rial } from '../ui'
import { FEATURE_LIST, PLAN, hasFeature, type AnyPlanId, type Feature } from '../../lib/plans'
import { planAccessStore, useFeature, useTenantPlan } from '../../lib/planAccess'

/**
 * Reads `?plan=` once per URL change so the harness can open any screen as another plan would
 * see it (`/trade-documents/quotations?plan=starter`). Rendered once, inside the router.
 */
export function PlanFromQuery() {
  const { search } = useLocation()
  useEffect(() => planAccessStore.applySearch(search), [search])
  return null
}

type PlanGatedProps = {
  feature: Feature
  /** The frame the page normally sits in, so the sidebar and topbar stay while the content changes. */
  shell?: 'app' | 'settings'
  children: ReactNode
}

/**
 * Gates a screen by plan. On a plan that carries the feature the page renders as it always has;
 * on one that does not, the page's own frame stays and the content gives way to an upsell panel
 * naming the plan that carries it — greyed with a nudge, never hidden (the client's ruling).
 */
export function PlanGated({ feature, shell = 'app', children }: PlanGatedProps) {
  const { available, neededPlan } = useFeature(feature)
  if (available) return children
  const panel = <UpsellPanel feature={feature} neededPlan={neededPlan} />
  return shell === 'settings' ? (
    <SettingsShell group="integration">{panel}</SettingsShell>
  ) : (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">{panel}</div>
    </AppShell>
  )
}

/** Up to three things the needed plan adds beyond the tenant's own plan, besides the feature asked for. */
function alsoAdds(current: AnyPlanId, needed: AnyPlanId, feature: Feature): Feature[] {
  return FEATURE_LIST.filter(
    (f) => f !== feature && hasFeature(needed, f) && !hasFeature(current, f),
  ).slice(0, 3)
}

function UpsellPanel({ feature, neededPlan }: { feature: Feature; neededPlan: AnyPlanId }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const current = useTenantPlan()
  const planName = t(`plan.planName.${neededPlan}`)
  const more = alsoAdds(current, neededPlan, feature)
  const price = neededPlan === 'enterprise' ? null : PLAN[neededPlan].monthly

  const back = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/dashboard')
  }

  return (
    <section
      aria-labelledby="plan-gate-title"
      className="mx-auto mt-6 flex w-full max-w-[560px] flex-col items-center rounded-md bg-surface-card px-8 py-10 text-center max-md:mt-2 max-md:px-5 max-md:py-7"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-50 text-primary-800">
        <LockIcon size={26} />
      </span>

      <h1
        id="plan-gate-title"
        className="mt-5 text-2xl font-semibold leading-[1.2] text-text-primary"
      >
        {t('planGate.title', { feature: t(`plan.featureShort.${feature}`), plan: planName })}
      </h1>
      <p className="mt-2 text-base font-medium leading-[1.5] text-text-tertiary">
        {t(`planGate.about.${feature}`, { defaultValue: t(`plan.featureName.${feature}`) })}
      </p>

      {more.length > 0 ? (
        <div className="mt-6 w-full rounded-sm bg-surface-background px-5 py-4 text-start">
          <p className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
            {t('planGate.alsoAdds', { plan: planName })}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {more.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-secondary"
              >
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary-700" />
                {t(`plan.featureName.${f}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-6 flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-0.5">
        {price !== null ? (
          <>
            <span className="text-[28px] font-semibold leading-[1.1] text-text-primary">
              <Rial />
            </span>
            <span className="text-[28px] font-semibold leading-[1.1] text-text-primary tabular-nums">
              {price.toFixed(3)}
            </span>
            <span className="text-sm font-medium text-text-quaternary">
              {t('planGate.perMonth')}
            </span>
          </>
        ) : (
          <span className="text-base font-semibold text-text-secondary">
            {t('planGate.enterprisePrice')}
          </span>
        )}
      </p>

      <div className="mt-6 flex w-full flex-wrap justify-center gap-3">
        <Link
          to="/settings/plan"
          className="inline-flex h-11 items-center justify-center rounded-sm bg-primary-700 px-5 text-base font-semibold text-text-on-primary transition-colors hover:bg-primary-800 max-md:w-full"
        >
          {t('planGate.seePlans')}
        </Link>
        <button
          type="button"
          onClick={back}
          className="inline-flex h-11 items-center justify-center rounded-sm border border-border-brand-subtle bg-surface-card px-5 text-base font-semibold text-text-brand transition-colors hover:bg-primary-25 max-md:w-full"
        >
          {t('planGate.back')}
        </button>
      </div>
    </section>
  )
}
