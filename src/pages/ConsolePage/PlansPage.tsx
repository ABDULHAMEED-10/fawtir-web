import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Rial, withRial } from '../../components/ui'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleNotice, ConsoleReadFailure } from '../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import { PLANS_PATH, PLAN_CATALOGUE_PERMISSION, withSavedPlans } from '../../lib/console/planCatalogue'
import { formatOmr, planFeatures, type SubscriptionPlan } from '../../lib/subscriptionPlans'
import { PlanEditor } from './plans/PlanEditor'
import tickIcon from '../../assets/settings/check-ink.svg'

/** `{ plan: null }` is adding a plan. */
type Editing = { plan: SubscriptionPlan | null } | null

/**
 * The platform's plan catalogue, every plan including the ones no longer offered, as the backend
 * holds it — one read, and each save's answer merged in place instead of a second read.
 */
export function ConsolePlansPage() {
  return (
    <ConsoleShell requires={PLAN_CATALOGUE_PERMISSION}>
      <PlanCatalogue />
    </ConsoleShell>
  )
}

function PlanCatalogue() {
  const { t } = useTranslation()
  const { read, retry } = useConsoleRead<SubscriptionPlan[]>(PLANS_PATH)
  const [saved, setSaved] = useState<ReadonlyMap<string, SubscriptionPlan>>(() => new Map())
  const [editing, setEditing] = useState<Editing>(null)
  const [savedName, setSavedName] = useState<string | null>(null)

  const plans = read.status === 'ready' ? withSavedPlans(read.data, saved) : null

  const edit = (plan: SubscriptionPlan | null) => {
    setSavedName(null)
    setEditing({ plan })
  }

  let body
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.plans.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (plans && plans.length === 0) {
    body = (
      <p className="rounded-md bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('console.plans.empty')}
      </p>
    )
  } else if (plans) {
    body = (
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.code} plan={plan} onEdit={() => edit(plan)} />
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('console.plans.title')}</h1>
          <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
            {t('console.plans.subtitle')}
          </p>
        </div>
        {plans ? (
          <button
            type="button"
            onClick={() => edit(null)}
            className="inline-flex h-[46px] shrink-0 items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t('console.plans.add')}
          </button>
        ) : null}
      </div>

      {savedName ? (
        <p
          role="status"
          className="rounded-md bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary"
        >
          {t('console.plans.saved', { name: savedName })}
        </p>
      ) : null}

      {body}

      {editing && plans ? (
        <PlanEditor
          plan={editing.plan}
          takenCodes={plans.map((plan) => plan.code)}
          onClose={() => setEditing(null)}
          onSaved={(plan) => {
            setSaved((current) => new Map(current).set(plan.code, plan))
            setEditing(null)
            setSavedName(plan.name)
          }}
        />
      ) : null}
    </div>
  )
}

/** The tenant plan screen's card, showing the catalogue's own figures rather than a sales pitch. */
function PlanCard({ plan, onEdit }: { plan: SubscriptionPlan; onEdit: () => void }) {
  const { t } = useTranslation()
  return (
    <article className="flex flex-col rounded-md bg-surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <ConsoleStatusPill
          tone={plan.active ? 'success' : 'neutral'}
          label={plan.active ? t('console.plans.active') : t('console.plans.inactive')}
        />
        <span dir="ltr" className="text-xs font-semibold tracking-[0.04em] text-text-quaternary">
          {plan.code}
        </span>
      </div>

      <h3 className="mt-3 text-xl font-medium leading-[1.2] text-text-primary">{plan.name}</h3>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[28px] font-semibold leading-[1.1] text-text-primary">
          <Rial />
        </span>
        <span className="text-[28px] font-semibold leading-[1.1] text-text-primary tabular-nums">
          {formatOmr(plan.monthlyPrice)}
        </span>
        <span className="text-sm font-medium text-text-quaternary">{t('plan.perMonth')}</span>
      </p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {planFeatures(plan).map((feature) => (
          <li key={feature.key} className="flex items-start gap-2">
            <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-70" />
            <span className="text-sm font-medium leading-[1.4] text-text-tertiary">
              {withRial(t(feature.key, feature.values))}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-5">
        <button
          type="button"
          onClick={onEdit}
          aria-label={t('console.plans.editPlan', { name: plan.name })}
          className="inline-flex h-[46px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('console.plans.edit')}
        </button>
      </div>
    </article>
  )
}
