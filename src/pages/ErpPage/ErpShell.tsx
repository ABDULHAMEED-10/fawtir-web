import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import {
  CERT_ROUTES,
  overviewStatus,
  readiness,
  routeStates,
  useErpMapping,
  type OverviewStatus,
  type RouteState,
} from '../../lib/erpMapping'
import { COVERAGE_LIMITS } from '../../lib/erpCatalogue'
import infoIcon from '../../assets/settings/info.svg'

/**
 * The frame every ERP mapping screen shares (docs/erp-and-console-plan.md §2): Settings' shell
 * with the Integration tab lit, the screen's title, and the strip that links the seven screens —
 * Overview · Fields · Preview · Certify · Advanced · History · Samples — with a mark on the ones
 * that need attention.
 */

type Tone = 'danger' | 'success' | 'pending' | 'neutral'

const PILL_TONE: Record<Tone, string> = {
  danger: 'bg-danger-100 text-danger-700',
  success: 'bg-success-100 text-[#3d5648]',
  pending: 'bg-pending-100 text-pending-700',
  neutral: 'bg-surface-background text-text-tertiary',
}

const STATUS_TONE: Record<OverviewStatus, Tone> = {
  NOT_SET_UP: 'neutral',
  DRAFT: 'pending',
  READY_UNCERTIFIED: 'pending',
  PARTIALLY_CERTIFIED: 'pending',
  CERTIFIED: 'success',
  STALE: 'danger',
}

const ROUTE_TONE: Record<RouteState, Tone> = {
  CERTIFIED: 'success',
  FAILED: 'danger',
  NOT_CERTIFIED: 'neutral',
  STALE: 'pending',
}

export function Pill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={`inline-flex h-[24px] items-center gap-1.5 whitespace-nowrap rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px] ${PILL_TONE[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

export function ErpStatusPill({ status }: { status: OverviewStatus }) {
  const { t } = useTranslation()
  return <Pill tone={STATUS_TONE[status]} label={t(`erp.status.${status}`)} />
}

export function RouteStatePill({ state }: { state: RouteState }) {
  const { t } = useTranslation()
  return <Pill tone={ROUTE_TONE[state]} label={t(`erp.routeState.${state}`)} />
}

export const SCREENS = [
  { id: 'overview', to: '/settings/erp-mapping' },
  { id: 'fields', to: '/settings/erp-mapping/fields' },
  { id: 'preview', to: '/settings/erp-mapping/preview' },
  { id: 'certification', to: '/settings/erp-mapping/certification' },
  { id: 'advanced', to: '/settings/erp-mapping/advanced' },
  { id: 'history', to: '/settings/erp-mapping/history' },
  { id: 'samples', to: '/settings/erp-mapping/samples' },
] as const

export type ScreenId = (typeof SCREENS)[number]['id']

/** The strip under the header. A dot marks a screen with something to do. */
export function IntegrationSubnav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const state = useErpMapping()
  const ready = readiness(state)
  const routes = routeStates(state)
  const attention: Partial<Record<ScreenId, number>> = {
    fields: ready.missingRequiredTargets.length + ready.invalidMappings.length,
    certification: CERT_ROUTES.filter(
      (r) => routes[r].state === 'FAILED' || routes[r].state === 'STALE',
    ).length,
  }

  return (
    <nav
      aria-label={t('erp.subnav.label')}
      className="flex items-center gap-1 overflow-x-auto rounded-md bg-surface-card px-2"
    >
      {SCREENS.map((screen) => {
        const active = pathname === screen.to
        const mark = attention[screen.id] ?? 0
        return (
          <Link
            key={screen.id}
            to={screen.to}
            aria-current={active ? 'page' : undefined}
            className={[
              'inline-flex h-[46px] shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
              active
                ? 'border-primary-700 text-primary-800'
                : 'border-transparent text-text-quaternary hover:text-text-secondary',
            ].join(' ')}
          >
            {t(`erp.subnav.${screen.id}`)}
            {mark > 0 ? (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-pending-100 px-1 text-[10px] font-semibold text-pending-700">
                {mark}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

/** The three invoice kinds the guided path cannot express — beside every readiness indicator. */
export function CoverageBanner({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <div
      className={[
        'flex gap-3 rounded-md border border-pending-200 bg-pending-100/60',
        compact ? 'px-4 py-3' : 'p-4',
      ].join(' ')}
    >
      <img src={infoIcon} alt="" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('erp.coverage.banner')}
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {COVERAGE_LIMITS.map((limit) => (
            <li key={limit.id}>
              <Link
                to="/settings/erp-mapping/advanced"
                className="inline-flex h-[24px] items-center rounded-[3px] bg-white px-2 text-[11px] font-semibold text-pending-700 transition-colors hover:bg-pending-100"
              >
                {t(`erp.coverage.${limit.id}`)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function ErpShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle: string
  actions?: ReactNode
  children: ReactNode
}) {
  const state = useErpMapping()
  return (
    <SettingsShell group="integration">
      <SettingsHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <ErpStatusPill status={overviewStatus(state)} />
            {actions}
          </>
        }
      />
      <IntegrationSubnav />
      {children}
    </SettingsShell>
  )
}
