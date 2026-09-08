import { useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '../../components/BrandLogo'
import { UserMenu } from '../../components/shell'
import { NavSettingsIcon } from '../AppShell/navIcons'
import { CloseIcon } from '../../components/ui/icons'
import { useDrawer } from '../../hooks/useDrawer'
import { CONSOLE_NAV, CONSOLE_USER } from '../../lib/consoleNav'
import avatar from '../../assets/dashboard/avatar.png'

/** The console's routes are flat, so a match is exact or a child path of it. */
function isActive(pathname: string, to: string) {
  if (to === '/console') return pathname === '/console'
  return pathname === to || pathname.startsWith(`${to}/`)
}

type ConsoleSidebarProps = {
  /** Only meaningful below `lg`, where the sidebar is a drawer rather than a column. */
  open?: boolean
  onClose?: () => void
}

/**
 * The Fawtir console's navigation (Figma 143:17005).
 *
 * Flat — no expandable groups and no account switcher, because a console has one account. It
 * behaves as a drawer below `lg` exactly as the tenant sidebar does, sharing `useDrawer` so the
 * keyboard behaviour of the two cannot drift apart.
 */
export function ConsoleSidebar({ open = false, onClose = () => {} }: ConsoleSidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const panelRef = useRef<HTMLElement>(null)
  useDrawer(open, onClose, panelRef)

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
        {CONSOLE_NAV.map((group) => (
          <div key={group.id} className="flex flex-col gap-[7px]">
            <p className="text-xs font-semibold uppercase tracking-[1.44px] text-text-quaternary">
              {t(group.labelKey)}
            </p>
            <div className="flex flex-col">
              {group.items.map((item) => {
                const active = isActive(location.pathname, item.to)
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'flex h-11 w-full items-center gap-1.5 rounded-md px-3 transition-colors',
                      active
                        ? 'bg-primary-50 text-primary-900'
                        : 'text-text-tertiary hover:bg-primary-25 hover:text-text-secondary',
                    ].join(' ')}
                  >
                    <item.Icon active={active} className="size-5 shrink-0" />
                    <span
                      className={[
                        'truncate text-base leading-[1.2]',
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
        <Link
          to="/console/settings"
          className="flex h-11 w-full items-center gap-1.5 rounded-md px-3 text-text-tertiary transition-colors hover:bg-primary-25 hover:text-text-secondary"
        >
          <NavSettingsIcon className="size-5 shrink-0" />
          <span className="truncate text-base font-medium leading-[1.2]">
            {t('console.nav.bottomSettings')}
          </span>
        </Link>

        <UserMenu name={CONSOLE_USER.name} roleKey={CONSOLE_USER.roleKey} avatar={avatar} />
      </div>
    </aside>
  )
}
