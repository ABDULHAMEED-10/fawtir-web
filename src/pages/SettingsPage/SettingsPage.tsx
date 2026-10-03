import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell } from './SettingsShell'
import { withRial } from '../../components/ui'
import {
  shortMonth,
  SETTINGS_TABS,
  BOOK,
  usageForecast,
  longDate,
  COMPANY,
  type SettingsTab,
} from '../../lib/settings'
import {
  OPEN_BRANCHES,
  CERT_EXPIRES,
  CERT_DAYS_LEFT,
  certificateState,
  SIGNING_CERTIFICATE,
} from '../../lib/settingsCompany'
import { MEMBERS, withoutTwoStep, ROLES, SEATS } from '../../lib/settingsPeople'
import { nextBill, HOW_YOU_PAY } from '../../lib/settingsBilling'
import { LOG_BOOK, LAST_EXPORT_ON } from '../../lib/settingsRecords'
import chevronIcon from '../../assets/invoices/chevron.svg'
import peppolIcon from '../../assets/settings/tile-peppol.svg'
import companyIcon from '../../assets/settings/tile-company.svg'
import branchesIcon from '../../assets/settings/tile-branches.svg'
import teamIcon from '../../assets/settings/tile-team.svg'
import rolesIcon from '../../assets/settings/tile-roles.svg'
import signingIcon from '../../assets/settings/tile-signing.svg'
import planIcon from '../../assets/settings/tile-plan.svg'
import billsIcon from '../../assets/settings/tile-bills.svg'
import logIcon from '../../assets/settings/tile-log.svg'
import exportIcon from '../../assets/settings/tile-export.svg'
import closingIcon from '../../assets/settings/tile-closing.svg'
import integrationIcon from '../../assets/settings/tile-integration.svg'
import connectIcon from '../../assets/settings/tile-connect.svg'
import { useApiRead } from '../../hooks/useApiRead'
import {
  ERP_MAPPING_CARD_KEY,
  loadErpMappingCard,
  type ErpMappingCard,
} from '../../lib/erp/mappingState'
import { listErpConnections } from '../../api/erp/connections'
import { useErpAccess } from '../../hooks/useErpAccess'
import { useFeature } from '../../lib/planAccess'
import type { Feature } from '../../lib/plans'
import { LockIcon } from '../../components/ui/icons'

type Tone = 'danger' | 'success' | 'neutral' | 'pending'

type Card = {
  id: string
  group: Exclude<SettingsTab, 'all'>
  icon: string
  iconTint: string
  to: string
  /** A card can lead with a bar (how much of something is spent) or a row of faces. */
  bar?: { spent: number; tone: Tone }
  faces?: string[]
  /** The wide card carries its figure at full size. */
  figure?: { value: string; unitKey: string; values?: Record<string, string | number | undefined> }
  pillKey: string
  pillValues?: Record<string, string | number | undefined>
  pillTone: Tone
  footKey?: string
  footValues?: Record<string, string | number | undefined>
  bodyValues?: Record<string, string | number | undefined>
  wide?: boolean
  /** The plan feature behind the card; on a plan without it the card greys and wears a lock pill. */
  feature?: Feature
}

const PILL_TONE: Record<Tone, string> = {
  danger: 'bg-danger-100 text-danger-700',
  success: 'bg-success-100 text-[#3d5648]',
  pending: 'bg-pending-100 text-pending-700',
  neutral: 'bg-surface-background text-text-tertiary',
}

const DOT_TONE: Record<Tone, string> = {
  danger: 'bg-danger-700',
  success: 'bg-[#4c6c5a]',
  pending: 'bg-pending-500',
  neutral: 'bg-[#a8abb2]',
}

const BAR_TONE: Record<Tone, string> = {
  danger: 'bg-danger-700',
  success: 'bg-[#4c6c5a]',
  pending: 'bg-pending-500',
  neutral: 'bg-primary-700',
}

/**
 * Settings — the hub (Figma 135:36092).
 *
 * Eleven cards in four groups. Each one reports the state of the thing it opens rather than
 * merely naming it, so the page answers "is anything wrong?" before anything is clicked. Every
 * figure comes from the same book the screen behind it uses.
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const group = (params.get('group') ?? 'all') as SettingsTab

  const forecast = usageForecast()
  const bill = nextBill()
  // Two reads, not the mapping screens' eight — see loadErpMappingCard. Until they land the card
  // shows the neutral "not set up" pill rather than a figure it does not have yet.
  const mappingCard = useApiRead<ErpMappingCard>(ERP_MAPPING_CARD_KEY, () =>
    loadErpMappingCard('JSON'),
  )
  // Memoized so the fallback object is not a fresh identity on every render, which would make the
  // cards memo below recompute each time. It was already in that memo's dependency list; the
  // lint only surfaced once the mock connector values left the list and stopped masking it.
  const mapping = useMemo<ErpMappingCard>(
    () =>
      mappingCard.read.status === 'ready'
        ? mappingCard.read.data
        : { hasGuided: false, sourceSystem: null, status: 'NOT_SET_UP', mapped: 0, required: 0 },
    [mappingCard.read],
  )
  const mappingStatus = mapping.status
  // The real count, and only when the reader may see it: a user without erp.connection.read gets
  // no request rather than a 403 on every visit to Settings. The card previously showed a
  // mock-derived count, an "N need attention" badge for a state the backend does not have, and a
  // "{{collected}} of {{limit}} this month" figure for extraction that does not run.
  const { access: erpAccess } = useErpAccess()
  const connectionCount = useApiRead(
    erpAccess.read ? 'settings-erp-connection-count' : null,
    () => listErpConnections(false).then((page) => page.total),
  )
  const connections = connectionCount.read.status === 'ready' ? connectionCount.read.data : null

  const cards = useMemo<Card[]>(
    () => [
      {
        id: 'peppol',
        group: 'company',
        icon: peppolIcon,
        iconTint: CERT_DAYS_LEFT <= 14 ? 'bg-danger-100' : 'bg-primary-50',
        to: '/settings/peppol',
        bar: {
          spent: certificateState(SIGNING_CERTIFICATE).spent,
          tone: CERT_DAYS_LEFT <= 14 ? 'danger' : 'pending',
        },
        pillKey: 'settings.card.peppolPill',
        pillValues: { date: shortMonth(CERT_EXPIRES) },
        pillTone: 'danger',
        footKey: 'settings.card.peppolFoot',
        footValues: { id: COMPANY.peppolId },
      },
      {
        id: 'company',
        group: 'company',
        icon: companyIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/company',
        pillKey: 'settings.card.companyPill',
        pillTone: 'success',
        footKey: 'settings.card.companyFoot',
      },
      {
        id: 'branches',
        group: 'company',
        icon: branchesIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/branches',
        pillKey: 'settings.card.branchesPill',
        pillValues: { count: OPEN_BRANCHES.length },
        pillTone: 'neutral',
        footKey: 'settings.card.branchesFoot',
        footValues: { names: OPEN_BRANCHES.map((branch) => branch.name).join(' · ') },
      },
      {
        id: 'team',
        group: 'people',
        icon: teamIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/team',
        faces: MEMBERS.slice(0, 4).map((member) => member.initials),
        pillKey: 'settings.card.teamPill',
        pillValues: { used: MEMBERS.length, seats: SEATS.included },
        pillTone: 'neutral',
        footKey: 'settings.card.teamFoot',
        footValues: { amount: SEATS.extraMonthly.toFixed(3) },
      },
      {
        id: 'roles',
        group: 'people',
        icon: rolesIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/roles',
        pillKey: 'settings.card.rolesPill',
        pillValues: { count: ROLES.length },
        pillTone: 'neutral',
      },
      {
        id: 'signing',
        group: 'people',
        icon: signingIcon,
        iconTint: 'bg-pending-100',
        to: '/settings/signing-in',
        pillKey: 'settings.card.signingPill',
        pillValues: { count: withoutTwoStep.length },
        pillTone: 'pending',
      },
      {
        id: 'erpMapping',
        group: 'integration',
        feature: 'erpMapping',
        icon: integrationIcon,
        iconTint:
          mappingStatus === 'STALE' || mappingStatus === 'DRAFT'
            ? 'bg-pending-100'
            : 'bg-primary-50',
        to: '/settings/erp-mapping',
        pillKey: `settings.card.erpMappingPill.${mappingStatus}`,
        pillTone:
          mappingStatus === 'CERTIFIED'
            ? 'success'
            : mappingStatus === 'NOT_SET_UP'
              ? 'neutral'
              : mappingStatus === 'STALE' || mappingStatus === 'DRAFT'
                ? 'pending'
                : 'neutral',
        footKey: mapping.hasGuided
          ? 'settings.card.erpMappingFoot'
          : 'settings.card.erpMappingFootNone',
        footValues: {
          system: mapping.sourceSystem ? t(`erp.sourceSystem.${mapping.sourceSystem}`) : '',
          mapped: mapping.mapped,
          required: mapping.required,
        },
      },
      {
        id: 'connections',
        group: 'integration',
        feature: 'erpMapping',
        icon: connectIcon,
        iconTint: connections !== null && connections > 0 ? 'bg-success-100' : 'bg-surface-background',
        to: '/settings/erp/connections',
        // Until the count arrives — or when the reader may not see it — the card says nothing
        // about how many there are, rather than guessing at zero.
        pillKey:
          connections === null
            ? 'settings.card.connectionsPillUnknown'
            : 'settings.card.connectionsPillActive',
        pillValues: { count: connections ?? 0 },
        pillTone: connections !== null && connections > 0 ? 'success' : 'neutral',
        footKey: 'settings.card.connectionsFoot',
      },
      {
        id: 'bridge',
        group: 'integration',
        feature: 'erpMapping',
        icon: connectIcon,
        iconTint: 'bg-surface-background',
        to: '/settings/erp/bridge',
        pillKey: 'settings.card.bridgePill',
        pillTone: 'neutral',
        footKey: 'settings.card.bridgeFoot',
      },
      {
        id: 'plan',
        group: 'billing',
        icon: planIcon,
        iconTint: 'bg-pending-100',
        to: '/settings/plan',
        wide: true,
        figure: {
          value: forecast.used.toLocaleString('en-US'),
          unitKey: 'settings.card.planOf',
          values: { allowance: forecast.allowance },
        },
        bar: { spent: forecast.used / forecast.allowance, tone: 'pending' },
        pillKey: 'settings.card.planPill',
        pillTone: 'pending',
        footKey: 'settings.card.planFoot',
        footValues: { date: longDate(bill.dueOn) },
      },
      {
        id: 'bills',
        group: 'billing',
        icon: billsIcon,
        iconTint: 'bg-success-100',
        to: '/settings/bills',
        pillKey: 'settings.card.billsPill',
        pillTone: 'success',
        footKey: 'settings.card.billsFoot',
        footValues: { method: t(`bills.method.${HOW_YOU_PAY.method}`) },
      },
      {
        id: 'log',
        group: 'records',
        icon: logIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/activity-log',
        pillKey: 'settings.card.logPill',
        pillValues: { years: BOOK.retentionYears },
        pillTone: 'neutral',
        footKey: 'settings.card.logFoot',
        footValues: { count: LOG_BOOK.thisMonth.toLocaleString('en-US') },
      },
      {
        id: 'export',
        group: 'records',
        icon: exportIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/export',
        pillKey: 'settings.card.exportPill',
        pillTone: 'neutral',
        footKey: 'settings.card.exportFoot',
        footValues: { date: longDate(LAST_EXPORT_ON) },
      },
      {
        // The tile grid is otherwise mock-fed; this card carries no figure on purpose, so the most
        // visited Settings screen gains no network read that could fail on it. The live policy is
        // on the page itself.
        id: 'approvals',
        group: 'company',
        icon: rolesIcon,
        iconTint: 'bg-surface-background',
        to: '/settings/approvals',
        pillKey: 'settings.card.approvalsPill',
        pillTone: 'neutral',
        footKey: 'settings.card.approvalsFoot',
      },
      {
        id: 'closing',
        group: 'records',
        icon: closingIcon,
        iconTint: 'bg-surface-background',
        to: '/settings/closing',
        pillKey: 'settings.card.closingPill',
        pillTone: 'neutral',
        footKey: 'settings.card.closingFoot',
      },
    ],
    [forecast, bill, t, mapping, mappingStatus, connections],
  )

  const groups = SETTINGS_TABS.filter((tab) => tab.id !== 'all').filter(
    (tab) => group === 'all' || tab.id === group,
  )

  return (
    <SettingsShell group={group}>
      {groups.map((tab) => {
        const inGroup = cards.filter((card) => card.group === tab.id)
        if (inGroup.length === 0) return null
        return (
          <section key={tab.id} className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
              {t(`settings.group.${tab.id}`)}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {inGroup.map((card) => (
                <HubCard key={card.id} card={card} />
              ))}
            </div>
          </section>
        )
      })}

      {group !== 'all' ? (
        <button
          type="button"
          onClick={() => setParams({})}
          className="mx-auto mt-2 inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('settings.showEverything')}
        </button>
      ) : null}
    </SettingsShell>
  )
}

function HubCard({ card }: { card: Card }) {
  const { t } = useTranslation()
  // A card with no feature is on every plan; the hook still runs so the hook count is constant.
  const access = useFeature(card.feature ?? 'invoices')
  const locked = card.feature ? !access.available : false

  return (
    <Link
      to={card.to}
      className={[
        'group flex flex-col rounded-md p-5 transition-shadow hover:shadow-card',
        locked ? 'bg-surface-card/60' : 'bg-surface-card',
        card.wide ? 'md:col-span-2' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            'flex size-9 shrink-0 items-center justify-center rounded-md',
            locked ? 'bg-surface-background' : card.iconTint,
          ].join(' ')}
        >
          <img
            src={card.icon}
            alt=""
            className={['size-[18px]', locked ? 'opacity-40' : ''].join(' ')}
          />
        </span>
        <h3
          className={[
            'flex-1 text-base font-semibold leading-[1.2]',
            locked ? 'text-text-quaternary' : 'text-text-primary',
          ].join(' ')}
        >
          {t(`settings.card.${card.id}Title`)}
        </h3>
        <img
          src={chevronIcon}
          alt=""
          aria-hidden="true"
          className="size-5 shrink-0 opacity-40 transition-opacity group-hover:opacity-100 rtl:rotate-180"
        />
      </div>

      {card.figure ? (
        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-[34px] font-semibold leading-[1.1] text-pending-700 tabular-nums">
            {card.figure.value}
          </span>
          <span className="text-sm font-medium text-text-quaternary">
            {t(card.figure.unitKey, card.figure.values)}
          </span>
        </p>
      ) : null}

      {card.bar ? (
        <span
          className={[
            'flex h-1.5 w-full overflow-hidden rounded-full bg-surface-background',
            card.figure ? 'mt-3' : 'mt-4',
          ].join(' ')}
        >
          <span
            className={BAR_TONE[card.bar.tone]}
            style={{ width: `${Math.round(card.bar.spent * 100)}%` }}
          />
        </span>
      ) : null}

      {card.faces ? (
        <span className="mt-4 flex items-center gap-1">
          {card.faces.map((initials) => (
            <span
              key={initials}
              className="flex size-7 items-center justify-center rounded-full bg-primary-50 text-[10px] font-semibold text-primary-800"
            >
              {initials}
            </span>
          ))}
          {MEMBERS.length > card.faces.length ? (
            <span className="flex size-7 items-center justify-center rounded-full bg-surface-background text-[10px] font-semibold text-text-tertiary">
              +{MEMBERS.length - card.faces.length}
            </span>
          ) : null}
        </span>
      ) : null}

      {!card.faces && !card.figure ? (
        <p
          className={[
            'mt-3 text-sm font-medium leading-[1.5]',
            locked ? 'text-text-quaternary/80' : 'text-text-tertiary',
          ].join(' ')}
        >
          {t(`settings.card.${card.id}Body`, card.bodyValues)}
        </p>
      ) : null}

      <span className="mt-auto flex flex-wrap items-center gap-2.5 pt-4">
        {locked ? (
          <span className="inline-flex h-[24px] items-center gap-1.5 rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
            <LockIcon size={12} />
            {t('settings.card.lockedPill', { plan: t(`plan.planName.${access.neededPlan}`) })}
          </span>
        ) : (
          <span
            className={[
              'inline-flex h-[24px] items-center gap-1.5 rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
              PILL_TONE[card.pillTone],
            ].join(' ')}
          >
            <span className={['size-1.5 rounded-full', DOT_TONE[card.pillTone]].join(' ')} />
            {t(card.pillKey, card.pillValues)}
          </span>
        )}
        {card.footKey && !locked ? (
          <span className="text-xs font-medium text-text-quaternary">
            {withRial(t(card.footKey, card.footValues))}
          </span>
        ) : null}
      </span>
    </Link>
  )
}
