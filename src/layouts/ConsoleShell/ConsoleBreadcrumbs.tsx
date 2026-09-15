import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import chevronIcon from '../../assets/invoices/chevron.svg'

export type ConsoleCrumb = { labelKey?: string; label?: string; to?: string }

/**
 * Where a console screen sits — "Console › Tenants › Al Noor Trading LLC" — drawn exactly as the
 * catalogue's breadcrumb is (CatalogShell), so both halves of the product read the same way.
 *
 * The root is always the console itself; the screen passes the rest. Every crumb but the last
 * links, the last is the screen you are on.
 */
export function ConsoleBreadcrumbs({ items }: { items: ConsoleCrumb[] }) {
  const { t } = useTranslation()
  const crumbs: ConsoleCrumb[] = [{ labelKey: 'console.crumb.root', to: '/console' }, ...items]

  return (
    <nav aria-label={t('console.crumb.label')} className="flex flex-wrap items-center gap-2">
      {crumbs.map((crumb, index) => {
        const label = crumb.labelKey ? t(crumb.labelKey) : (crumb.label ?? '')
        const last = index === crumbs.length - 1
        return (
          <span key={label + index} className="flex items-center gap-2">
            {crumb.to && !last ? (
              <Link
                to={crumb.to}
                className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-primary-700"
              >
                {label}
              </Link>
            ) : (
              <span
                className={[
                  'text-2xl font-medium leading-[1.2]',
                  last ? 'text-text-primary' : 'text-text-quaternary',
                ].join(' ')}
              >
                {label}
              </span>
            )}
            {last ? null : (
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
            )}
          </span>
        )
      })}
    </nav>
  )
}
