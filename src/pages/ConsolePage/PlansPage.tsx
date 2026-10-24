import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Rial, withRial } from '../../components/ui'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleSettingsFrame } from '../../layouts/ConsoleShell/ConsoleSettingsFrame'
import { ConsoleNotice, ConsoleReadFailure } from '../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import {
  PLANS_MANAGE_PERMISSION,
  PLANS_PATH,
  PLANS_READ_PERMISSION,
  formatAmount,
  planCardLines,
  withSavedPlans,
  type CatalogueAdminPlan,
} from '../../lib/console/planCatalogue'
import { hasPermission, peekEntitlements } from '../../lib/identity/entitlements'
import { PlanEditor } from './plans/PlanEditor'
import { PlanCountingPanel } from './plans/PlanCountingPanel'
import { PlanHistoryPanel } from './plans/PlanHistoryPanel'
import { displayPlanName } from './plans/planName'
import tickIcon from '../../assets/settings/check-ink.svg'
import {
  CONSOLE_PAGE,
  CONSOLE_PRIMARY,
  CONSOLE_SECONDARY,
  CONSOLE_SMALL,
  ConsolePageHeader,
} from '../../layouts/ConsoleShell/consoleStyle'

/** The address of the plan being edited (`?edit=<code>`), or of a new one (`?edit=new`). */
const EDIT_PARAM = 'edit'
const NEW_PLAN = 'new'

/**
 * The platform's plan catalogue, every plan including the ones no longer offered — one read,
 * and each save's answer merged in place instead of a second read.
 */
export function ConsolePlansPage() {
  return (
    <ConsoleShell requires={PLANS_READ_PERMISSION}>
      <PlanCatalogue />
    </ConsoleShell>
  )
}

function PlanCatalogue() {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<CatalogueAdminPlan[]>(PLANS_PATH)
  const [saved, setSaved] = useState<ReadonlyMap<string, CatalogueAdminPlan>>(() => new Map())
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  // The editor is a page of its own (owner, 24 Oct 2026), with an address: `?edit=<code>`.
  const [params, setParams] = useSearchParams()
  const editCode = params.get(EDIT_PARAM)
  const [history, setHistory] = useState<CatalogueAdminPlan | null>(null)
  const [counting, setCounting] = useState<CatalogueAdminPlan | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Read here, inside the shell: it renders this only once the entitlements are loaded, whereas
  // the app-wide `useCan` answers "yes" to everything outside a session context.
  const entitlements = peekEntitlements()
  const canManage = entitlements ? hasPermission(entitlements, PLANS_MANAGE_PERMISSION) : false

  const plans = read.status === 'ready' ? withSavedPlans(read.data, saved, lastSaved) : null

  const edit = (plan: CatalogueAdminPlan | null) => {
    setNotice(null)
    setParams({ [EDIT_PARAM]: plan ? plan.code : NEW_PLAN })
    window.scrollTo?.({ top: 0 })
  }
  const closeEditor = () => setParams({})
  const editing =
    editCode === null || !plans
      ? null
      : editCode === NEW_PLAN
        ? { plan: null }
        : (() => {
            const plan = plans.find((entry) => entry.code === editCode)
            return plan ? { plan } : null
          })()

  // Another operator changed the plan meanwhile: what this page holds is stale, so the whole
  // catalogue is read again and nothing kept from earlier saves overrides it.
  const reload = () => {
    closeEditor()
    setSaved(new Map())
    setLastSaved(null)
    setNotice(t('console.plans.reloaded'))
    retry()
  }

  let body
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.plans.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (plans && plans.length === 0) {
    body = (
      <p className="rounded-sm bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('console.plans.empty')}
      </p>
    )
  } else if (plans) {
    body = (
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            canManage={canManage}
            onOpen={() => edit(plan)}
            onHistory={() => setHistory(plan)}
            onCounting={() => setCounting(plan)}
          />
        ))}
      </div>
    )
  }

  if (editing && plans) {
    return (
      <div className={CONSOLE_PAGE}>
        <ConsoleSettingsFrame
          tab="plans"
          back={{ to: '/console/plans', label: t('console.plans.title') }}
        />
        <PlanEditor
          presentation="page"
          plan={editing.plan}
          readOnly={!canManage}
          takenCodes={plans.map((plan) => plan.code)}
          onClose={closeEditor}
          onConflict={reload}
          onSaved={(plan) => {
            setSaved((current) => new Map(current).set(plan.code, plan))
            setLastSaved(plan.code)
            closeEditor()
            setNotice(t('console.plans.saved', { name: displayPlanName(plan, i18n.language) }))
          }}
        />
      </div>
    )
  }

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleSettingsFrame tab="plans" />
      <ConsolePageHeader level="section"
        title={t('console.plans.title')}
        subtitle={t('console.plans.subtitle')}
        actions={
          plans && canManage ? (
            <button type="button" onClick={() => edit(null)} className={CONSOLE_PRIMARY}>
              {t('console.plans.add')}
            </button>
          ) : null
        }
      />

      {!canManage ? (
        <p className="rounded-sm bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary">
          {t('console.plans.readOnly')}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-sm bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary"
        >
          {notice}
        </p>
      ) : null}

      {body}


      {history ? <PlanHistoryPanel plan={history} onClose={() => setHistory(null)} /> : null}

      {counting ? (
        <PlanCountingPanel
          plan={counting}
          canManage={canManage}
          onClose={() => setCounting(null)}
        />
      ) : null}
    </div>
  )
}

/** The tenant plan screen's card, showing the catalogue's own figures rather than a sales pitch. */
function PlanCard({
  plan,
  canManage,
  onOpen,
  onHistory,
  onCounting,
}: {
  plan: CatalogueAdminPlan
  canManage: boolean
  onOpen: () => void
  onHistory: () => void
  onCounting: () => void
}) {
  const { t, i18n } = useTranslation()
  const name = displayPlanName(plan, i18n.language)
  return (
    <article className="flex flex-col rounded-sm bg-surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <ConsoleStatusPill
            tone={plan.active ? 'success' : 'neutral'}
            label={plan.active ? t('console.plans.active') : t('console.plans.inactive')}
          />
          {plan.recommended ? (
            <ConsoleStatusPill tone="info" label={t('console.plans.recommendedPill')} />
          ) : null}
          {plan.publicVisible ? null : (
            <ConsoleStatusPill tone="pending" label={t('console.plans.hiddenPill')} />
          )}
        </div>
        <bdi
          dir="ltr"
          className="min-w-0 font-mono text-[11px] font-medium text-text-quaternary [overflow-wrap:anywhere]"
        >
          {plan.code}
        </bdi>
      </div>

      <h3 className="mt-3 text-xl font-medium leading-[1.2] text-text-primary">{name}</h3>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[28px] font-semibold leading-[1.1] text-text-primary">
          <Rial />
        </span>
        <span className="text-[28px] font-semibold leading-[1.1] text-text-primary tabular-nums">
          {formatAmount(plan.currentVersion.monthlyPrice)}
        </span>
        <span className="text-sm font-medium text-text-quaternary">{t('plan.perMonth')}</span>
      </p>
      <p className="mt-1 text-xs font-medium text-text-quaternary">
        {t('console.plans.versionLine', { version: plan.currentVersion.versionNumber })}
      </p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {planCardLines(plan).map((feature) => (
          <li key={feature.key} className="flex items-start gap-2">
            <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-70" />
            <span className="text-sm font-medium leading-[1.4] text-text-tertiary">
              {withRial(t(feature.key, feature.values))}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2 pt-5">
        <button
          type="button"
          onClick={onOpen}
          aria-label={t(canManage ? 'console.plans.editPlan' : 'console.plans.viewPlan', { name })}
          className={`${CONSOLE_SECONDARY} w-full`}
        >
          {canManage ? t('console.plans.edit') : t('console.plans.view')}
        </button>
        <button
          type="button"
          onClick={onHistory}
          aria-label={t('console.plans.historyOf', { name })}
          className={`${CONSOLE_SMALL} w-full`}
        >
          {t('console.plans.history.open')}
        </button>
        <button
          type="button"
          onClick={onCounting}
          aria-label={t('console.plans.counting.openFor', { name })}
          className={`${CONSOLE_SMALL} w-full`}
        >
          {t('console.plans.counting.open')}
        </button>
      </div>
    </article>
  )
}
