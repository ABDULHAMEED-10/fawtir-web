import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CloseIcon, LockIcon } from '../../components/ui/icons'
import { useDrawer } from '../../hooks/useDrawer'
import {
  DASHBOARD_NAV,
  SETTINGS_NAV,
  type NavChild,
  type NavGroup,
  type NavItem,
} from '../../lib/dashboard'
import { useUnreadReminders } from '../../lib/notifications'
import { REQUIRE_SESSION, can, useSession } from '../../lib/session/session'
import { initialsOf } from '../../lib/format'
import type { Entitlements } from '../../lib/identity/entitlements'
import type { AnyPlanId, Feature } from '../../lib/plans'
import { featureAccess, useTenantPlan } from '../../lib/planAccess'
import { BrandLogo } from '../../components/BrandLogo'
import { AccountSwitcher, UserMenu } from '../../components/shell'
import chevron from '../../assets/dashboard/chevron.svg'

/** The sidebar's count: the design's 18px round badge, drawn only where a real count backs it. */
export const NAV_BADGE =
  'inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary-700 text-[10px] font-extrabold leading-none text-white'

type SidebarNavItemProps = {
  to: string
  Icon: ComponentType<{ className?: string; active?: boolean }>
  label: string
  badge?: number
  active?: boolean
  onClick?: () => void
  /** Set when the plan lacks the destination: greyed, never lit, a lock at the end. */
  locked?: Lock
}

/** The plan a locked entry would need, for the tooltip and the glyph's label. */
type Lock = { plan: AnyPlanId }

/**
 * Whether the plan the tenant is on carries a nav entry's feature. A group's feature covers its
 * children; an entry with no feature is on every plan. Locked entries still navigate — the route
 * shows the upgrade nudge — so the reader can always see what a plan would give them.
 */
function lockFor(plan: AnyPlanId, feature: Feature | undefined): Lock | undefined {
  if (!feature) return undefined
  const access = featureAccess(plan, feature)
  return access.available ? undefined : { plan: access.neededPlan }
}

function lockTitle(t: (key: string, values?: Record<string, string>) => string, lock: Lock) {
  return t('dashboard.nav.lockedOn', { plan: t(`plan.planName.${lock.plan}`) })
}

function LockGlyph({ lock }: { lock: Lock }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex shrink-0 items-center text-text-quaternary/70">
      <LockIcon size={14} />
      <span className="sr-only">{lockTitle(t, lock)}</span>
    </span>
  )
}

function SidebarNavItem({ to, Icon, label, badge, active, onClick, locked }: SidebarNavItemProps) {
  const { t } = useTranslation()
  const lit = active && !locked
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={lit ? 'page' : undefined}
      title={locked ? lockTitle(t, locked) : undefined}
      className={[
        'flex h-11 w-full items-center gap-1.5 rounded-md px-3 transition-colors',
        lit
          ? 'bg-primary-50 text-primary-900'
          : locked
            ? 'text-text-quaternary/60 hover:bg-primary-25'
            : 'text-text-tertiary hover:bg-primary-25 hover:text-text-secondary',
      ].join(' ')}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <Icon active={lit} className="size-5 shrink-0" />
        <span
          className={[
            'truncate text-base leading-[1.2]',
            lit ? 'font-semibold text-primary-900' : 'font-medium',
          ].join(' ')}
        >
          {label}
        </span>
      </span>
      {badge != null && !locked ? <span className={NAV_BADGE}>{badge}</span> : null}
      {locked ? <LockGlyph lock={locked} /> : null}
    </Link>
  )
}

function isPathActive(pathname: string, to: string) {
  if (to === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
  if (to === '/invoices') return pathname === '/invoices' || pathname.startsWith('/invoices/')
  return pathname === to || pathname.startsWith(`${to}/`)
}

/**
 * The navigation this reader may use: an entry whose destination needs a permission they lack is
 * left out, and so is a group left with nothing in it. Without a session (the guard is off, as in
 * the prototype build) everything shows, as it always has.
 */
function visibleNav(session: Entitlements | null): NavGroup[] {
  return DASHBOARD_NAV.map((group) => ({
    ...group,
    items: group.items.flatMap((item) => {
      if (!can(session, item.requires)) return []
      if (!item.children) return [item]
      const children = item.children.filter((child) => can(session, child.requires))
      return children.length > 0 ? [{ ...item, children }] : []
    }),
  })).filter((group) => group.items.length > 0)
}

/** The first role the server assigned, by its code, as a translated label; anything else reads as a member. */
const KNOWN_ROLES = [
  'ADMIN',
  'FINANCE_MANAGER',
  'ACCOUNTANT',
  'APPROVER',
  'VIEWER',
  'MOBILE_USER',
  'INTEGRATION',
]
function roleKeyOf(session: Entitlements): string {
  const code = session.roles[0]?.code
  return code && KNOWN_ROLES.includes(code) ? `sessionRoles.${code}` : 'sessionRoles.member'
}

/** A group is open when the route matches any of its own child paths. */
function isGroupActive(pathname: string, item: NavItem) {
  return (item.children ?? []).some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`))
}

function ExpandableNavItem({ item, plan }: { item: NavItem; plan: AnyPlanId }) {
  const { t } = useTranslation()
  const location = useLocation()
  const groupLock = lockFor(plan, item.feature)
  const groupActive = isGroupActive(location.pathname, item) && !groupLock
  const [open, setOpen] = useState(groupActive)
  // The bell's own number, from the bell's own read: the two cannot disagree, and nothing more
  // is asked of the server. Nothing unread, nobody's inbox to read, or a read that did not
  // answer, all come back as 0 and no badge is drawn.
  const unreadReminders = useUnreadReminders()

  useEffect(() => {
    if (groupActive) setOpen(true)
  }, [groupActive])

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v: boolean) => !v)}
        title={groupLock ? lockTitle(t, groupLock) : undefined}
        className={[
          'flex h-11 w-full items-center gap-1.5 rounded-md px-3 transition-colors',
          groupActive
            ? 'text-primary-900'
            : groupLock
              ? 'text-text-quaternary/60 hover:bg-primary-25'
              : 'text-text-tertiary hover:bg-primary-25 hover:text-text-secondary',
        ].join(' ')}
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <item.Icon active={groupActive} className="size-5 shrink-0" />
          {/* No truncate — a parent label should never be clipped by the badge/chevron. */}
          <span
            className={[
              'whitespace-nowrap text-base leading-[1.2]',
              groupActive ? 'font-semibold text-primary-900' : 'font-medium',
            ].join(' ')}
          >
            {t(item.labelKey)}
          </span>
        </span>
        {item.badge != null && !groupLock ? <span className={NAV_BADGE}>{item.badge}</span> : null}
        {/* The lock takes the chevron's slot: a parent label is never clipped, and the row still
            opens on click so the reader can see what the group holds. */}
        {groupLock ? (
          <LockGlyph lock={groupLock} />
        ) : (
          <img
            src={chevron}
            alt=""
            className={['size-4 opacity-60 transition-transform', open ? 'rotate-90' : ''].join(
              ' ',
            )}
          />
        )}
      </button>

      {open && item.children ? (
        <div className="ms-6 flex flex-col py-2">
          {item.children.map((child: NavChild) => {
            const lock = groupLock ?? lockFor(plan, child.feature)
            const childActive = isPathActive(location.pathname, child.to) && !lock
            const count = child.count === 'billReminders' && !lock ? unreadReminders : 0
            return (
              <Link
                key={child.id}
                to={child.to}
                aria-current={childActive ? 'page' : undefined}
                title={lock ? lockTitle(t, lock) : undefined}
                className={[
                  'flex w-[168px] items-center gap-1.5 rounded-md px-3 py-2 text-base leading-[1.2] transition-colors',
                  childActive
                    ? 'bg-primary-50 font-medium text-primary-900'
                    : lock
                      ? 'font-medium text-text-quaternary/60 hover:bg-primary-25'
                      : 'font-medium text-text-tertiary hover:bg-primary-25 hover:text-text-secondary',
                ].join(' ')}
              >
                <span className="min-w-0 flex-1 truncate">{t(child.labelKey)}</span>
                {count > 0 ? (
                  <>
                    {/* One figure, as on the bell; the label says the count in full. */}
                    <span data-nav-count aria-hidden="true" className={NAV_BADGE}>
                      {count > 9 ? '9+' : count}
                    </span>
                    <span className="sr-only">
                      {t('dashboard.nav.billRemindersUnread', { count })}
                    </span>
                  </>
                ) : null}
                {lock ? <LockGlyph lock={lock} /> : null}
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Where the reader had scrolled the nav to.
 *
 * Every page renders its own AppShell, so navigating unmounts this sidebar and mounts a fresh
 * one — which would put a reader who had scrolled down to Reports back at the top the moment
 * they clicked one of its children. Kept outside the component so it survives that remount.
 */
let navScrollTop = 0

/** Puts the nav back where it was before the browser paints, so there is no jump to watch. */
function useKeptScroll() {
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const nav = ref.current
    if (!nav) return
    nav.scrollTop = navScrollTop

    const remember = () => {
      navScrollTop = nav.scrollTop
    }
    nav.addEventListener('scroll', remember, { passive: true })
    return () => {
      nav.removeEventListener('scroll', remember)
      // Read the position once more on the way out. A scroll event is not guaranteed to have
      // landed for every way the nav can move, and the node is still in the page at this point.
      if (nav.isConnected) navScrollTop = nav.scrollTop
    }
  }, [])

  return ref
}

type SidebarProps = {
  /** Only meaningful below `lg`, where the sidebar is a drawer rather than a column. */
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ open = false, onClose = () => {} }: SidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const navRef = useKeptScroll()
  const panelRef = useRef<HTMLElement>(null)
  const session = useSession()
  const plan = useTenantPlan()
  useDrawer(open, onClose, panelRef)

  return (
    <aside
      ref={panelRef}
      className={[
        'flex h-dvh w-[248px] shrink-0 flex-col border-e border-black/10 bg-surface-tab-bar',
        // Below lg it leaves the flow and slides in over the page from the leading edge, which
        // `rtl:` flips for Arabic. `invisible` keeps it off the tab order while it is away.
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

      <div className="px-[21px] pt-3">
        <AccountSwitcher />
      </div>

      <nav
        ref={navRef}
        className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[21px] pb-4"
      >
        {visibleNav(session).map((group) => (
          <div key={group.id} className="flex flex-col gap-[7px]">
            <p className="text-xs font-semibold uppercase tracking-[1.44px] text-text-quaternary">
              {t(group.labelKey)}
            </p>
            <div className="flex flex-col">
              {group.items.map((item) =>
                item.children ? (
                  <ExpandableNavItem key={item.id} item={item} plan={plan} />
                ) : (
                  <SidebarNavItem
                    key={item.id}
                    to={item.to}
                    Icon={item.Icon}
                    label={t(item.labelKey)}
                    badge={item.badge}
                    locked={lockFor(plan, item.feature)}
                    active={
                      item.to === '/dashboard'
                        ? item.id === 'dashboard' && location.pathname.startsWith('/dashboard')
                        : isPathActive(location.pathname, item.to)
                    }
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto px-[21px] pb-4">
        <SidebarNavItem
          to={SETTINGS_NAV.to}
          Icon={SETTINGS_NAV.Icon}
          label={t(SETTINGS_NAV.labelKey)}
        />
        {/* No session means the answer is still loading (or, in a development build with the
            guard off, that nobody signed in). The card says so rather than naming somebody: it
            used to fall back to a demo user, whom every real user then saw as themselves. */}
        <UserMenu
          name={
            session?.username ??
            t(REQUIRE_SESSION ? 'shell.user.loading' : 'shell.user.previewNoSession')
          }
          roleKey={session ? roleKeyOf(session) : null}
          initials={session?.username ? initialsOf(session.username) : null}
        />
      </div>
    </aside>
  )
}
