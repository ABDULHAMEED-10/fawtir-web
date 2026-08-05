import { useEffect, useState, type ComponentType } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DASHBOARD_NAV,
  SETTINGS_NAV,
  ACCOUNT,
  USER,
  type NavChild,
  type NavItem,
} from '../../lib/dashboard'
import { BrandLogo } from '../../components/BrandLogo'
import bahjaLogo from '../../assets/dashboard/bahja-logo.svg'
import avatar from '../../assets/dashboard/avatar.png'
import chevron from '../../assets/dashboard/chevron.svg'

type SidebarNavItemProps = {
  to: string
  Icon: ComponentType<{ className?: string; active?: boolean }>
  label: string
  badge?: number
  active?: boolean
  onClick?: () => void
}

function SidebarNavItem({ to, Icon, label, badge, active, onClick }: SidebarNavItemProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex h-11 w-full items-center gap-1.5 rounded-md px-3 transition-colors',
        active
          ? 'bg-primary-50 text-primary-900'
          : 'text-text-tertiary hover:bg-primary-25 hover:text-text-secondary',
      ].join(' ')}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <Icon active={active} className="size-5 shrink-0" />
        <span
          className={[
            'truncate text-base leading-[1.2]',
            active ? 'font-semibold text-primary-900' : 'font-medium',
          ].join(' ')}
        >
          {label}
        </span>
      </span>
      {badge != null ? (
        <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary-700 text-[10px] font-extrabold leading-none text-white">
          {badge}
        </span>
      ) : null}
    </Link>
  )
}

function isPathActive(pathname: string, to: string) {
  if (to === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
  if (to === '/invoices') return pathname === '/invoices' || pathname.startsWith('/invoices/')
  return pathname === to || pathname.startsWith(`${to}/`)
}

/** A group is open when the route matches any of its own child paths. */
function isGroupActive(pathname: string, item: NavItem) {
  return (item.children ?? []).some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`))
}

function ExpandableNavItem({ item }: { item: NavItem }) {
  const { t } = useTranslation()
  const location = useLocation()
  const groupActive = isGroupActive(location.pathname, item)
  const [open, setOpen] = useState(groupActive)

  useEffect(() => {
    if (groupActive) setOpen(true)
  }, [groupActive])

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v: boolean) => !v)}
        className={[
          'flex h-11 w-full items-center gap-1.5 rounded-md px-3 transition-colors',
          groupActive
            ? 'text-primary-900'
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
        {item.badge != null ? (
          <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-primary-700 text-[10px] font-extrabold leading-none text-white">
            {item.badge}
          </span>
        ) : null}
        <img
          src={chevron}
          alt=""
          className={['size-4 opacity-60 transition-transform', open ? 'rotate-90' : ''].join(' ')}
        />
      </button>

      {open && item.children ? (
        <div className="ms-6 flex flex-col py-2">
          {item.children.map((child: NavChild) => {
            const childActive = isPathActive(location.pathname, child.to)
            return (
              <Link
                key={child.id}
                to={child.to}
                aria-current={childActive ? 'page' : undefined}
                className={[
                  'flex w-[168px] items-center rounded-md px-3 py-2 text-base leading-[1.2] transition-colors',
                  childActive
                    ? 'bg-primary-50 font-medium text-primary-900'
                    : 'font-medium text-text-tertiary hover:bg-primary-25 hover:text-text-secondary',
                ].join(' ')}
              >
                {t(child.labelKey)}
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const location = useLocation()

  return (
    <aside className="flex h-dvh w-[248px] shrink-0 flex-col border-e border-black/10 bg-surface-tab-bar">
      <div className="flex h-[74px] w-full items-center justify-center">
        <BrandLogo size="md" />
      </div>
      <div className="h-px w-full bg-black/10" />

      <div className="px-[21px] pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-sm border border-black/[0.06] bg-surface-tab-bar p-[9px] text-start"
        >
          <span className="flex min-w-0 items-center gap-[7px]">
            <img src={bahjaLogo} alt="" className="size-[31px] shrink-0 rounded-full object-cover" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium leading-[1.2] text-[#3e443e]">
                {ACCOUNT.name}
              </span>
              <span className="block truncate text-xs font-medium leading-[1.2] text-text-quaternary">
                {t(ACCOUNT.planKey)}
              </span>
            </span>
          </span>
          <img src={chevron} alt="" className="size-5 rotate-90 opacity-70" />
        </button>
      </div>

      <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-[21px] pb-4">
        {DASHBOARD_NAV.map((group) => (
          <div key={group.id} className="flex flex-col gap-[7px]">
            <p className="text-xs font-semibold uppercase tracking-[1.44px] text-text-quaternary">
              {t(group.labelKey)}
            </p>
            <div className="flex flex-col">
              {group.items.map((item) =>
                item.children ? (
                  <ExpandableNavItem key={item.id} item={item} />
                ) : (
                  <SidebarNavItem
                    key={item.id}
                    to={item.to}
                    Icon={item.Icon}
                    label={t(item.labelKey)}
                    badge={item.badge}
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
        <button
          type="button"
          className="mt-1 flex w-full items-center justify-between rounded-sm border border-black/[0.06] bg-[#292d32] p-[9px] text-start"
        >
          <span className="flex min-w-0 items-center gap-[7px]">
            <img src={avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium leading-[1.2] text-white">
                {USER.name}
              </span>
              <span className="block truncate text-xs font-medium leading-[1.2] text-white/70">
                {t(USER.roleKey)}
              </span>
            </span>
          </span>
          <img src={chevron} alt="" className="size-5 rotate-90 brightness-0 invert opacity-80" />
        </button>
      </div>
    </aside>
  )
}
