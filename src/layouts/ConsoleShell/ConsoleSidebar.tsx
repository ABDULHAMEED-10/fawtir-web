import { useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '../../components/BrandLogo'
import { UserMenu } from '../../components/shell'
import { NavSettingsIcon } from '../AppShell/navIcons'
import { CloseIcon } from '../../components/ui/icons'
import { useDrawer } from '../../hooks/useDrawer'
import { CONSOLE_NAV, type ConsoleNavItem } from '../../lib/consoleNav'
import { CONSOLE_SETTINGS_CARDS, CONSOLE_SETTINGS_PATH } from '../../lib/console/consoleSettingsHub'
import {
  hasPermission,
  isPlatformOperator,
  type Entitlements,
} from '../../lib/identity/entitlements'
import { ACCOUNT_EMAIL_CONFIRM_ROUTE } from '../../lib/identity/accountEmail'
import { initialsOf } from '../../lib/format'

// Console only: confirming an email change is for Fawtir operators, and the console's user menu
// is the one every signed-in operator sees, role or no role (P8).
const CONSOLE_USER_ITEMS = [
  { id: 'confirmEmail', labelKey: 'console.user.confirmEmail', to: ACCOUNT_EMAIL_CONFIRM_ROUTE },
] as const

/**
 * A tenant user who opens a console address gets the no-access notice and no platform menu: the
 * console's screens and its prices (Plans and rates) are the platform's, not a company's. An
 * operator sees the items their permissions cover.
 */
function visibleConsoleNav(entitlements: Entitlements | null) {
  if (entitlements === null || !isPlatformOperator(entitlements)) return []
  return CONSOLE_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      (typeof item.requires === 'string' ? [item.requires] : (item.requires ?? [])).every((code) =>
        hasPermission(entitlements, code),
      ),
    ),
  })).filter((group) => group.items.length > 0)
}

/** Every address a link is lit on: its own and the tabs that have no link of their own. */
function linkRoutes(item: ConsoleNavItem): readonly string[] {
  return [item.to, ...(item.alsoActiveOn ?? [])]
}

/** Settings and every screen a Settings card opens: the bottom Settings link is lit on them. */
const SETTINGS_ROUTES = [
  CONSOLE_SETTINGS_PATH,
  ...CONSOLE_SETTINGS_CARDS.map((card) => card.to.split('?')[0]),
]

/** A page that has a sidebar link of its own lights that link, not Settings. */
const OWN_LINKS = CONSOLE_NAV.flatMap((group) => group.items.flatMap(linkRoutes))

/**
 * The console's routes are flat, so a match is exact or a child path of it. A link with a query
 * (one section of a page) is lit only when the address carries that query too.
 */
function isActive(pathname: string, to: string, search = '') {
  if (to === '/console') return pathname === '/console'
  const [path, query] = to.split('?')
  if (query !== undefined) {
    const here = new URLSearchParams(search)
    return (
      pathname === path &&
      [...new URLSearchParams(query)].every(([key, value]) => here.get(key) === value)
    )
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

type ConsoleSidebarProps = {
  /** Only meaningful below `lg`, where the sidebar is a drawer rather than a column. */
  open?: boolean
  onClose?: () => void
  /** The signed-in operator, from the backend; empty while it is still being asked. */
  userName: string
  /** Null while still being asked: no menu is drawn until the server says who this is. */
  entitlements?: Entitlements | null
}

/**
 * The Fawtir console's navigation (Figma 143:17005).
 *
 * Flat — no expandable groups and no account switcher, because a console has one account. It
 * behaves as a drawer below `lg` exactly as the tenant sidebar does, sharing `useDrawer` so the
 * keyboard behaviour of the two cannot drift apart.
 */
export function ConsoleSidebar({
  open = false,
  onClose = () => {},
  userName,
  entitlements = null,
}: ConsoleSidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const panelRef = useRef<HTMLElement>(null)
  useDrawer(open, onClose, panelRef)
  // On an address one link names with its query, only that link is lit, not the page's own.
  const onQueryLink = OWN_LINKS.some(
    (to) => to.includes('?') && isActive(location.pathname, to, location.search),
  )
  const settingsActive =
    SETTINGS_ROUTES.some((to) => isActive(location.pathname, to)) &&
    !OWN_LINKS.some((to) => isActive(location.pathname, to, location.search))

  return (
    <aside
      ref={panelRef}
      className={[
        'flex h-dvh w-[248px] shrink-0 flex-col border-e border-black/10 bg-surface-tab-bar',
        'max-lg:fixed max-lg:inset-y-0 max-lg:start-0 max-lg:z-50 max-lg:shadow-2xl',
        open
          ? 'max-lg:visible max-lg:translate-x-0'
          : 'max-lg:invisible max-lg:-translate-x-full max-lg:rtl:translate-x-full',
      ].join(' ')}
    >
      <div className="relative flex h-[74px] w-full items-center justify-center">
        <BrandLogo size="md" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute end-3 inline-flex size-9 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-primary-25 lg:hidden"
        >
          <CloseIcon size={18} />
        </button>
      </div>
      <div className="h-px w-full bg-black/10" />

      <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[21px] pb-4">
        {visibleConsoleNav(entitlements).map((group) => (
          <div key={group.id} className="flex flex-col gap-[7px]">
            <p className="text-xs font-semibold uppercase tracking-[1.44px] text-text-quaternary">
              {t(group.labelKey)}
            </p>
            <div className="flex flex-col">
              {group.items.map((item) => {
                const active = linkRoutes(item).some(
                  (to) =>
                    isActive(location.pathname, to, location.search) &&
                    (!onQueryLink || to.includes('?')),
                )
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      // A long label wraps to a second line rather than being cut off.
                      'flex min-h-11 w-full items-center gap-1.5 rounded-md px-3 py-2 transition-colors',
                      active
                        ? 'bg-primary-50 text-primary-900'
                        : 'text-text-tertiary hover:bg-primary-25 hover:text-text-secondary',
                    ].join(' ')}
                  >
                    <item.Icon active={active} className="size-5 shrink-0" />
                    <span
                      className={[
                        'min-w-0 break-words text-base leading-[1.2]',
                        active ? 'font-semibold text-primary-900' : 'font-medium',
                      ].join(' ')}
                    >
                      {t(item.labelKey)}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto px-[21px] pb-4">
        {entitlements !== null && isPlatformOperator(entitlements) ? (
          <Link
            to={CONSOLE_SETTINGS_PATH}
            aria-current={settingsActive ? 'page' : undefined}
            className={[
              'flex min-h-11 w-full items-center gap-1.5 rounded-md px-3 py-2 transition-colors',
              settingsActive
                ? 'bg-primary-50 text-primary-900'
                : 'text-text-tertiary hover:bg-primary-25 hover:text-text-secondary',
            ].join(' ')}
          >
            <NavSettingsIcon active={settingsActive} className="size-5 shrink-0" />
            <span
              className={[
                'min-w-0 break-words text-base leading-[1.2]',
                settingsActive ? 'font-semibold text-primary-900' : 'font-medium',
              ].join(' ')}
            >
              {t('console.nav.bottomSettings')}
            </span>
          </Link>
        ) : null}

        {/* No role title: the backend's role names are English-only, and ranking an operator's
            several roles into one title would be a claim of our own. */}
        <UserMenu
          name={userName}
          roleKey="console.user.team"
          initials={initialsOf(userName) || null}
          extraItems={CONSOLE_USER_ITEMS}
        />
      </div>
    </aside>
  )
}
