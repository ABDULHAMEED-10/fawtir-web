import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { SETTINGS_TABS, type SettingsTab } from '../../lib/settings'
import { CompanyAvatar } from '../../components/shell/CompanyAvatar'
import { useSession } from '../../lib/session/session'
import chevronIcon from '../../assets/invoices/chevron.svg'

/**
 * The frame every Settings screen sits in — title, the five group tabs and the company
 * switcher (Figma 135:36092 and each of its thirteen siblings).
 *
 * The tabs never change between screens, so they live here rather than being redrawn fourteen
 * times; a screen only says which group it belongs to and the tab lights up accordingly.
 */
export function SettingsShell({
  group,
  children,
}: {
  /** Which tab is lit while this screen is open. */
  group: SettingsTab
  children: ReactNode
}) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const onHub = pathname === '/settings'

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('settings.title')}
          </h1>
          <CompanySwitcher />
        </div>

        {/* Group tabs. On the hub they filter the cards; elsewhere they navigate back to it. */}
        <nav className="flex flex-wrap items-center gap-1 border-b border-border-subtle">
          {SETTINGS_TABS.map((tab) => {
            const active = tab.id === group
            return (
              <Link
                key={tab.id}
                to={tab.id === 'all' ? '/settings' : `/settings?group=${tab.id}`}
                aria-current={active ? 'page' : undefined}
                className={[
                  'inline-flex h-[42px] items-center gap-2 rounded-t-sm px-4 text-sm font-medium transition-colors',
                  active
                    ? 'border-b-2 border-primary-700 bg-primary-25 text-primary-800'
                    : 'border-b-2 border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {tab.id !== 'records' ? (
                  <span
                    className={[
                      'size-1.5 rounded-full',
                      active ? 'bg-primary-700' : 'bg-[#d0d2d5]',
                    ].join(' ')}
                  />
                ) : null}
                {t(tab.labelKey)}
              </Link>
            )
          })}
        </nav>

        {!onHub ? (
          <Link
            to="/settings"
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-text-quaternary transition-colors hover:text-primary-700"
          >
            <img
              src={chevronIcon}
              alt=""
              aria-hidden="true"
              className="size-4 rotate-180 rtl:rotate-0"
            />
            {t('settings.backToSettings')}
          </Link>
        ) : null}

        {children}
      </div>
    </AppShell>
  )
}

/** Which company the settings belong to. One account can hold more than one. */
function CompanySwitcher() {
  const { t } = useTranslation()
  const session = useSession()
  const name = session?.tenantName ?? ''
  return (
    <button
      type="button"
      className="inline-flex h-[42px] shrink-0 items-center gap-2.5 rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-primary transition-colors hover:bg-primary-25"
    >
      <CompanyAvatar name={name} size={24} />
      {name}
      <img
        src={chevronIcon}
        alt=""
        aria-hidden="true"
        className="size-4 -rotate-90"
        title={t('settings.switchCompany')}
      />
    </button>
  )
}

/** The heading every inner Settings screen carries, with its actions on the right. */
export function SettingsHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-[720px]">
        <h2 className="text-2xl font-medium leading-[1.2] text-text-primary">{title}</h2>
        <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{subtitle}</p>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">{actions}</div>
      ) : null}
    </div>
  )
}
