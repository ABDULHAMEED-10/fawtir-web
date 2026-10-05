import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { useErpMapping } from './ErpMappingGate'
import {
  readinessProgress,
  type ErpOverviewStatus,
  type ErpRouteState,
} from '../../lib/erp/mappingState'
import { MAPPING_CERTIFICATION_ROUTES } from '../../api/erp/mapping'
import infoIcon from '../../assets/settings/info.svg'

/**
 * The frame every ERP mapping screen shares (docs/erp-and-console-plan.md §2): Settings' shell
 * with the Integration tab lit, the screen's title, and the strip that links the seven screens —
 * Overview · Fields · Preview · Certify · Advanced · History · Samples — with a mark on the ones
 * that need attention.
 *
 * Every figure here comes from the backend through {@link useErpMapping}. The status pill is the
 * server's certification answer rolled up, and the subnav counts are the server's own readiness
 * lists; nothing is recomputed from a tenant payload in the browser.
 */

type Tone = 'danger' | 'success' | 'pending' | 'neutral'

const PILL_TONE: Record<Tone, string> = {
  danger: 'bg-danger-100 text-danger-700',
  success: 'bg-success-100 text-[#3d5648]',
  pending: 'bg-pending-100 text-pending-700',
  neutral: 'bg-surface-background text-text-tertiary',
}

const STATUS_TONE: Record<ErpOverviewStatus, Tone> = {
  NOT_SET_UP: 'neutral',
  DRAFT: 'pending',
  READY_UNCERTIFIED: 'pending',
  PARTIALLY_CERTIFIED: 'pending',
  CERTIFIED: 'success',
  STALE: 'danger',
}

const ROUTE_TONE: Record<ErpRouteState, Tone> = {
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

export function ErpStatusPill({ status }: { status: ErpOverviewStatus }) {
  const { t } = useTranslation()
  return <Pill tone={STATUS_TONE[status]} label={t(`erp.status.${status}`)} />
}

export function RouteStatePill({ state }: { state: ErpRouteState }) {
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
  const view = useErpMapping()
  const progress = readinessProgress(view.readiness)
  const attention: Partial<Record<ScreenId, number>> = {
    fields: progress.missing + progress.invalid,
    certification: MAPPING_CERTIFICATION_ROUTES.filter((route) => {
      const state = view.certification[route].state
      return state === 'FAILED' || state === 'STALE'
    }).length,
  }

  return (
    <nav
      aria-label={t('erp.subnav.label')}
      className="-mb-2 flex gap-1 overflow-x-auto border-b border-border-subtle max-md:flex-wrap max-md:overflow-x-visible"
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
              'inline-flex h-[46px] shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors max-md:h-[40px]',
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

/**
 * The invoice kinds the guided path cannot express — beside every readiness indicator.
 *
 * Rendered from the server's own `coverageLimits`, not from a list held here. The two disagreed:
 * the design mock named three limits, and the backend publishes two, having reclassified goods
 * classification as a per-item *conditional* gap — that one depends on the transaction type, so it
 * is not an absolute limit and a tenant issuing only simplified invoices is unaffected by it.
 * Reading the server's list means a reclassification like that shows up here instead of being
 * contradicted, and a limit added later renders without a frontend change.
 *
 * Each id has a translation; an id with none falls back to the server's `summary` rather than
 * rendering blank, because a coverage limit nobody can read is worse than an untranslated one.
 */
export function CoverageBanner({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const view = useErpMapping()
  const limits = view.readiness?.coverageLimits ?? []
  if (limits.length === 0) return null

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
          {limits.map((limit) => {
            const key = `erp.coverage.${limit.id}`
            return (
              <li key={limit.id}>
                <Link
                  to="/settings/erp-mapping/advanced"
                  title={limit.guidance}
                  className="inline-flex min-h-[24px] items-center rounded-[3px] bg-white px-2 py-1 text-[11px] font-semibold leading-[1.3] text-pending-700 transition-colors hover:bg-pending-100"
                >
                  {i18n.exists(key) ? t(key) : limit.summary}
                </Link>
              </li>
            )
          })}
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
  const view = useErpMapping()
  return (
    <SettingsShell group="integration">
      <SettingsHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <ErpStatusPill status={view.status} />
            {/* On a phone the buttons share one row under the pill instead of wrapping one by one. */}
            {actions ? (
              <div className="flex flex-wrap items-center gap-2.5 max-md:w-full max-md:[&>*]:flex-1">
                {actions}
              </div>
            ) : null}
          </>
        }
      />
      <IntegrationSubnav />
      {children}
    </SettingsShell>
  )
}
