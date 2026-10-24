import { useSearchParams, Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleSettingsFrame } from '../../layouts/ConsoleShell/ConsoleSettingsFrame'
import { CONSOLE_PAGE } from '../../layouts/ConsoleShell/consoleStyle'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission, type Entitlements } from '../../lib/identity/entitlements'
import {
  CONSOLE_SETTINGS_CARDS,
  CONSOLE_SETTINGS_PATH,
  CONSOLE_SETTINGS_TABS,
  PLATFORM_VALUES_PATH,
  asList,
  type ConsoleSettingsCard,
  type ConsoleSettingsTab,
} from '../../lib/console/consoleSettingsHub'
import chevronIcon from '../../assets/invoices/chevron.svg'
import planIcon from '../../assets/settings/tile-plan.svg'
import billsIcon from '../../assets/settings/tile-bills.svg'
import integrationIcon from '../../assets/settings/tile-integration.svg'
import companyIcon from '../../assets/settings/tile-company.svg'
import peppolIcon from '../../assets/settings/tile-peppol.svg'
import teamIcon from '../../assets/settings/tile-team.svg'
import rolesIcon from '../../assets/settings/tile-roles.svg'
import branchesIcon from '../../assets/settings/tile-branches.svg'
import logIcon from '../../assets/settings/tile-log.svg'
import signingIcon from '../../assets/settings/tile-signing.svg'

const ICONS: Record<ConsoleSettingsCard['icon'], string> = {
  plan: planIcon,
  bills: billsIcon,
  integration: integrationIcon,
  company: companyIcon,
  peppol: peppolIcon,
  team: teamIcon,
  roles: rolesIcon,
  branches: branchesIcon,
  log: logIcon,
  signing: signingIcon,
}

const isTab = (value: string | null): value is ConsoleSettingsTab =>
  CONSOLE_SETTINGS_TABS.some((tab) => tab.id === value)

const holdsAll = (entitlements: Entitlements, codes: readonly string[]) =>
  codes.every((code) => hasPermission(entitlements, code))

/**
 * Console › Settings: every console setting in one place, grouped in tabs, one card per area
 * (owner, 24 Oct 2026). Built like the tenant Settings hub. A card shows only when its page would
 * open for this operator; it says whether they can change it there or only read it, and a sample
 * screen says it is not connected yet.
 */
export function ConsoleSettingsHubPage() {
  const [params] = useSearchParams()
  // A bookmark from before the hub (`/console/settings?section=…`) still opens that section.
  const section = params.get('section')
  if (section) return <Navigate to={`${PLATFORM_VALUES_PATH}?section=${section}`} replace />
  return (
    <ConsoleShell>
      <ConsoleSettingsHub />
    </ConsoleShell>
  )
}

function ConsoleSettingsHub() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const requested = params.get('tab')
  const tab: ConsoleSettingsTab = isTab(requested) ? requested : 'all'
  const { entitlements } = useEntitlements()

  const visible =
    entitlements === null
      ? []
      : CONSOLE_SETTINGS_CARDS.filter((card) => holdsAll(entitlements, asList(card.requires)))

  const groups = CONSOLE_SETTINGS_TABS.filter((entry) => entry.id !== 'all').filter(
    (entry) => tab === 'all' || entry.id === tab,
  )

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleSettingsFrame tab={tab} hub />
      {groups.map((group) => {
        const cards = visible.filter((card) => card.tab === group.id)
        if (cards.length === 0) return null
        return (
          <section key={group.id} className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
              {t(`console.settingsHub.group.${group.id}`)}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <HubCard
                  key={card.id}
                  card={card}
                  canManage={
                    entitlements !== null &&
                    card.manage !== undefined &&
                    holdsAll(entitlements, asList(card.manage))
                  }
                />
              ))}
            </div>
          </section>
        )
      })}
      {tab !== 'all' ? (
        <Link
          to={CONSOLE_SETTINGS_PATH}
          className="mx-auto mt-2 inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('console.settingsHub.showEverything')}
        </Link>
      ) : null}
    </div>
  )
}

/** The pill under a card: whether this operator can change things there or only read them. */
function pillOf(card: ConsoleSettingsCard, canManage: boolean) {
  const neutral = { tone: 'bg-surface-background text-text-tertiary', dot: 'bg-[#a8abb2]' }
  if (card.manage === undefined || canManage)
    return { key: 'console.settingsHub.pill.manage', ...neutral }
  return { key: 'console.settingsHub.pill.viewOnly', ...neutral }
}

function HubCard({ card, canManage }: { card: ConsoleSettingsCard; canManage: boolean }) {
  const { t } = useTranslation()
  const pill = pillOf(card, canManage)
  return (
    <Link
      to={card.to}
      className="group flex flex-col rounded-md bg-surface-card p-5 transition-shadow hover:shadow-card"
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            'flex size-9 shrink-0 items-center justify-center rounded-md',
            'bg-primary-50',
          ].join(' ')}
        >
          <img src={ICONS[card.icon]} alt="" className="size-[18px]" />
        </span>
        <h3 className="flex-1 text-base font-semibold leading-[1.2] text-text-primary">
          {t(`console.settingsHub.card.${card.id}Title`)}
        </h3>
        <img
          src={chevronIcon}
          alt=""
          aria-hidden="true"
          className="size-5 shrink-0 opacity-40 transition-opacity group-hover:opacity-100 rtl:rotate-180"
        />
      </div>
      <p className="mt-3 text-sm font-medium leading-[1.5] text-text-tertiary">
        {t(`console.settingsHub.card.${card.id}Body`)}
      </p>
      <span className="mt-auto flex flex-wrap items-center gap-2.5 pt-4">
        <span
          className={[
            'inline-flex h-[24px] items-center gap-1.5 rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
            pill.tone,
          ].join(' ')}
        >
          <span className={['size-1.5 rounded-full', pill.dot].join(' ')} />
          {t(pill.key)}
        </span>
      </span>
    </Link>
  )
}
