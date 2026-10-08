import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell } from './SettingsShell'
import { withRial } from '../../components/ui'
import { SETTINGS_TABS, BOOK, type SettingsTab } from '../../lib/settings'
import { PLAN_OVERVIEW_PATH, loadPlanOverview, type PlanOverviewDto } from '../../api/settings/plan'
import {
  PEOPLE_PATH,
  ROLES_PATH,
  ROLES_PERMISSION,
  USERS_PERMISSION,
  loadPeople,
  loadRoles,
  type RoleDto,
  type UserPage,
} from '../../api/settings/people'
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
  erpMappingKey,
  loadErpMapping,
  loadErpMappingCard,
  type ErpMappingCard,
  type ErpMappingView,
} from '../../lib/erp/mappingState'
import { sourceSystemName } from '../../lib/erp/sourceSystem'
import { listErpConnections } from '../../api/erp/connections'
import { useErpAccess } from '../../hooks/useErpAccess'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { isPermissionDenied } from '../../lib/apiFailure'
import { useFeature } from '../../lib/planAccess'
import type { Feature } from '../../lib/plans'
import { LockIcon } from '../../components/ui/icons'
import {
  PARTICIPANT_STANDING_PATH,
  type ParticipantIdStanding,
} from '../../api/peppol/participantStanding'
import { BRANCHES_OVERVIEW_PATH, type BranchOverviewDto } from '../../api/settings/branches'

type Tone = 'danger' | 'success' | 'neutral' | 'pending'

type Card = {
  id: string
  group: Exclude<SettingsTab, 'all'>
  icon: string
  iconTint: string
  to: string
  /** A card can lead with a bar: how much of something is spent. */
  bar?: { spent: number; tone: Tone }
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

  const { i18n } = useTranslation()
  // Two reads, not the mapping screens' eight — see loadErpMappingCard. Asked only of a reader the
  // mapping routes admit (Phase 9): the card used to read for everyone and fold a 403, a failure
  // and the wait itself into "Not set up", telling a reader without access that the company had
  // no mapping.
  const { entitlements } = useEntitlements()
  const mayReadMapping =
    entitlements !== null &&
    (hasPermission(entitlements, 'admin.settings.manage') ||
      hasPermission(entitlements, 'mapping.read'))
  const mappingCard = useApiRead<ErpMappingCard>(mayReadMapping ? ERP_MAPPING_CARD_KEY : null, () =>
    loadErpMappingCard('JSON'),
  )
  /** Why the card has no status yet, when it has none: never folded into "not set up". */
  const mappingWait: 'NO_ACCESS' | 'CHECKING' | 'UNAVAILABLE' | null = !mayReadMapping
    ? 'NO_ACCESS'
    : mappingCard.read.status === 'loading'
      ? 'CHECKING'
      : mappingCard.read.status === 'failed'
        ? isPermissionDenied(mappingCard.read.error)
          ? 'NO_ACCESS'
          : 'UNAVAILABLE'
        : null
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
  // The two reads cannot tell "certified" from "partly certified" or "re-certify": that needs all
  // four routes. So once a mapping has a live profile, the card reads the same view the mapping
  // overview reads (same cache key, so opening the overview next costs nothing) and shows the
  // overview's own status, so the hub and the page never disagree. Tenants with no live mapping,
  // the ones who never use ERP, still make only the two reads.
  const hasLiveMapping =
    mappingCard.read.status === 'ready' &&
    mappingCard.read.data.status !== 'NOT_SET_UP' &&
    mappingCard.read.data.status !== 'DRAFT'
  const mappingView = useApiRead<ErpMappingView>(
    hasLiveMapping ? erpMappingKey('JSON') : null,
    () => loadErpMapping('JSON'),
  )
  const mappingStatus =
    mappingView.read.status === 'ready' ? mappingView.read.data.status : mapping.status
  // The real count, and only when the reader may see it: a user without erp.connection.read gets
  // no request rather than a 403 on every visit to Settings. The card previously showed a
  // mock-derived count, an "N need attention" badge for a state the backend does not have, and a
  // "{{collected}} of {{limit}} this month" figure for extraction that does not run.
  const { access: erpAccess } = useErpAccess()
  const connectionCount = useApiRead(erpAccess.read ? 'settings-erp-connection-count' : null, () =>
    listErpConnections(false).then((page) => page.total),
  )
  const connections = connectionCount.read.status === 'ready' ? connectionCount.read.data : null
  // The Peppol and Branches cards used to print another company's Participant ID, a certificate
  // expiry and branch names from fixtures. They now read the same keys their pages read, and say
  // nothing beyond what those reads answer.
  const standingRead = useApiRead<ParticipantIdStanding>(PARTICIPANT_STANDING_PATH).read
  const standing = standingRead.status === 'ready' ? standingRead.data : null
  const standingFailed = standingRead.status === 'failed'
  const overviewRead = useApiRead<BranchOverviewDto>(BRANCHES_OVERVIEW_PATH).read
  const overviewFailed = overviewRead.status === 'failed'
  const openBranches = useMemo(
    () =>
      overviewRead.status === 'ready'
        ? overviewRead.data.branches.filter((branch) => branch.active && !branch.closedOn)
        : null,
    [overviewRead],
  )

  // The plan, role and sign-in cards used to print a sample company's 880 of 1,000, its five roles
  // and "1 without two-step". Each now reads the endpoint its screen reads, only when the reader
  // may, and shows no figure rather than a guessed one while it cannot.
  const planRead = useApiRead<PlanOverviewDto>(PLAN_OVERVIEW_PATH, loadPlanOverview).read
  const planOverview =
    planRead.status === 'ready' && planRead.data?.plan && planRead.data?.usage ? planRead.data : null
  const planFailed = planRead.status === 'failed'
  const mayListRoles = entitlements !== null && hasPermission(entitlements, ROLES_PERMISSION)
  const rolesRead = useApiRead<RoleDto[]>(mayListRoles ? ROLES_PATH : null, loadRoles).read
  const roleCount = rolesRead.status === 'ready' ? rolesRead.data.length : null
  const mayListPeople = entitlements !== null && hasPermission(entitlements, USERS_PERMISSION)
  const peopleRead = useApiRead<UserPage>(mayListPeople ? PEOPLE_PATH : null, loadPeople).read
  const withoutApp =
    peopleRead.status === 'ready' && peopleRead.data.totalElements === peopleRead.data.content.length
      ? peopleRead.data.content.filter((person) => person.enabled && !person.mfaEnabled).length
      : null
  const periodEnd = planOverview
    ? new Date(`${planOverview.usage.period.end}T00:00:00`).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'long',
      })
    : ''

  const cards = useMemo<Card[]>(
    () => [
      {
        id: 'peppol',
        group: 'company',
        icon: peppolIcon,
        iconTint: standing?.state === 'VERIFIED' ? 'bg-success-100' : 'bg-primary-50',
        to: '/settings/peppol',
        pillKey:
          standing !== null
            ? standing.state === 'VERIFIED'
              ? 'settings.card.peppolPillVerified'
              : 'settings.card.peppolPillNotVerified'
            : standingFailed
              ? 'settings.card.pillNotAvailable'
              : 'settings.card.pillChecking',
        pillTone:
          standing === null ? 'neutral' : standing.state === 'VERIFIED' ? 'success' : 'pending',
        footKey:
          standing?.state === 'VERIFIED' && standing.verification
            ? 'settings.card.peppolFoot'
            : undefined,
        footValues: {
          id: standing?.verification
            ? `${standing.verification.participantScheme}:${standing.verification.participantValue}`
            : '',
        },
      },
      {
        id: 'company',
        group: 'company',
        icon: companyIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/company',
        pillKey: 'settings.card.teamPillOpen',
        pillTone: 'neutral',
      },
      {
        id: 'branches',
        group: 'company',
        icon: branchesIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/branches',
        pillKey:
          openBranches !== null
            ? 'settings.card.branchesPill'
            : overviewFailed
              ? 'settings.card.pillNotAvailable'
              : 'settings.card.pillChecking',
        pillValues: { count: openBranches?.length ?? 0 },
        pillTone: 'neutral',
        footKey: openBranches && openBranches.length > 0 ? 'settings.card.branchesFoot' : undefined,
        footValues: { names: openBranches?.map((branch) => branch.name).join(' · ') ?? '' },
      },
      {
        id: 'team',
        group: 'people',
        icon: teamIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/team',
        // The faces, seat count and seat price were sample people and a sample price list.
        pillKey: 'settings.card.teamPillOpen',
        pillTone: 'neutral',
      },
      {
        id: 'roles',
        group: 'people',
        icon: rolesIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/roles',
        pillKey: roleCount !== null ? 'settings.card.rolesPill' : 'settings.card.teamPillOpen',
        pillValues: { count: roleCount ?? 0 },
        pillTone: 'neutral',
      },
      {
        id: 'signing',
        group: 'people',
        icon: signingIcon,
        iconTint: withoutApp ? 'bg-pending-100' : 'bg-primary-50',
        to: '/settings/signing-in',
        pillKey: withoutApp !== null ? 'settings.card.signingPillNoApp' : 'settings.card.teamPillOpen',
        pillValues: { count: withoutApp ?? 0 },
        pillTone: withoutApp ? 'pending' : 'neutral',
      },
      {
        id: 'erpOverview',
        group: 'integration',
        feature: 'erpMapping',
        icon: integrationIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/erp',
        pillKey: 'settings.card.erpOverviewPill',
        pillTone: 'neutral',
        footKey: 'settings.card.erpOverviewFoot',
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
        pillKey: `settings.card.erpMappingPill.${mappingWait ?? mappingStatus}`,
        pillTone:
          mappingWait !== null
            ? 'neutral'
            : mappingStatus === 'CERTIFIED'
              ? 'success'
              : mappingStatus === 'NOT_SET_UP'
                ? 'neutral'
                : // Same tones as the mapping screens' own status pill (ErpShell), bar STALE's red.
                  mappingStatus === 'STALE' ||
                    mappingStatus === 'DRAFT' ||
                    mappingStatus === 'PARTIALLY_CERTIFIED' ||
                    mappingStatus === 'READY_UNCERTIFIED'
                  ? 'pending'
                  : 'neutral',
        footKey:
          mappingWait === 'NO_ACCESS'
            ? 'settings.card.erpMappingFootNoAccess'
            : mappingWait !== null
              ? 'settings.card.erpMappingFootUnknown'
              : mapping.hasGuided
                ? 'settings.card.erpMappingFoot'
                : 'settings.card.erpMappingFootNone',
        footValues: {
          system: mapping.sourceSystem ? sourceSystemName(t, mapping.sourceSystem) : '',
          mapped: mapping.mapped,
          required: mapping.required,
        },
      },
      {
        id: 'connections',
        group: 'integration',
        feature: 'erpMapping',
        icon: connectIcon,
        iconTint:
          connections !== null && connections > 0 ? 'bg-success-100' : 'bg-surface-background',
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
        id: 'apiPush',
        group: 'integration',
        feature: 'erpMapping',
        icon: connectIcon,
        iconTint: 'bg-surface-background',
        to: '/settings/erp/api-push',
        pillKey: 'settings.card.apiPushPill',
        pillTone: 'neutral',
        footKey: 'settings.card.apiPushFoot',
      },
      {
        id: 'erpActivity',
        group: 'integration',
        feature: 'erpMapping',
        icon: logIcon,
        iconTint: 'bg-surface-background',
        to: '/settings/erp/documents',
        pillKey: 'settings.card.erpActivityPill',
        pillTone: 'neutral',
        footKey: 'settings.card.erpActivityFoot',
      },
      {
        id: 'erpAccess',
        group: 'integration',
        feature: 'erpMapping',
        icon: logIcon,
        iconTint: 'bg-surface-background',
        to: '/settings/erp/access',
        pillKey: 'settings.card.erpAccessPill',
        pillTone: 'neutral',
        footKey: 'settings.card.erpAccessFoot',
      },
      {
        id: 'plan',
        group: 'billing',
        icon: planIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/plan',
        wide: true,
        figure: planOverview
          ? {
              value: planOverview.usage.used.toLocaleString(i18n.language),
              unitKey: 'settings.card.planOf',
              values: { allowance: planOverview.usage.quota.toLocaleString(i18n.language) },
            }
          : undefined,
        bar:
          planOverview && planOverview.usage.quota > 0
            ? { spent: planOverview.usage.used / planOverview.usage.quota, tone: 'neutral' }
            : undefined,
        pillKey: planOverview
          ? 'settings.card.planPillName'
          : planFailed
            ? 'settings.card.pillNotAvailable'
            : 'settings.card.pillChecking',
        pillValues: { name: planOverview?.plan.name ?? '' },
        pillTone: 'neutral',
        footKey: planOverview ? 'settings.card.planFootReal' : undefined,
        footValues: { date: periodEnd },
      },
      {
        id: 'bills',
        group: 'billing',
        icon: billsIcon,
        iconTint: 'bg-surface-background',
        to: '/settings/bills',
        pillKey: 'moduleUnavailable.badge',
        pillTone: 'neutral',
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
        // The monthly count was the sample log's; the real log has no count endpoint.
        footKey: 'settings.card.logFootReal',
      },
      {
        id: 'export',
        group: 'records',
        icon: exportIcon,
        iconTint: 'bg-primary-50',
        to: '/settings/export',
        pillKey: 'moduleUnavailable.badge',
        pillTone: 'neutral',
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
        pillKey: 'moduleUnavailable.badge',
        pillTone: 'neutral',
      },
    ],
    [
      t,
      roleCount,
      withoutApp,
      planOverview,
      planFailed,
      periodEnd,
      i18n.language,
      mapping,
      mappingStatus,
      mappingWait,
      connections,
      standing,
      standingFailed,
      openBranches,
      overviewFailed,
    ],
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

      {!card.figure ? (
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
