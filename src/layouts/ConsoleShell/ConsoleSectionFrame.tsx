import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { CONSOLE_SECTIONS, type ConsoleSectionId } from '../../lib/console/consoleSections'

/**
 * The top of a console page that shares its sidebar link with siblings (Tenants, Billing): the
 * section's title and its tabs, drawn as the Settings tabs are. It takes the place of the
 * "Console › Page" breadcrumb; a tab the operator's role cannot open is not shown.
 */
export function ConsoleSectionFrame({ section, tab }: { section: ConsoleSectionId; tab: string }) {
  const { t } = useTranslation()
  const { entitlements } = useEntitlements()
  const { titleKey, tabs } = CONSOLE_SECTIONS[section]
  const visible = tabs.filter(
    (entry) =>
      entry.id === tab || (entitlements !== null && hasPermission(entitlements, entry.requires)),
  )
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t(titleKey)}</h1>
      {visible.length > 1 ? (
        <nav
          aria-label={t(titleKey)}
          className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle"
        >
          {visible.map((entry) => {
            const active = entry.id === tab
            return (
              <Link
                key={entry.id}
                to={entry.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  'inline-flex h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-t-sm px-4 text-sm font-medium transition-colors',
                  active
                    ? 'border-b-2 border-primary-700 bg-primary-25 text-primary-800'
                    : 'border-b-2 border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                <span
                  className={[
                    'size-1.5 rounded-full',
                    active ? 'bg-primary-700' : 'bg-[#d0d2d5]',
                  ].join(' ')}
                />
                {t(entry.labelKey)}
              </Link>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
