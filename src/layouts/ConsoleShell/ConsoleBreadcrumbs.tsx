import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import chevronIcon from '../../assets/invoices/chevron.svg'

export type ConsoleCrumb = { labelKey?: string; label?: string; to?: string }

/**
 * The way back from a console screen to the page it sits under, drawn as the Settings screens'
 * back link (`ConsoleSettingsFrame`) so every console screen opens the same way (owner, 24 Oct
 * 2026: the "Console › Tenants › Al Noor" trail read differently from the rest of the console).
 *
 * Screens still pass their full trail; the link goes to the nearest crumb above the screen that
 * has an address. The screen's own name is its page title, so it is not repeated here, and a
 * screen with nothing above it but the console itself draws nothing.
 */
export function ConsoleBreadcrumbs({ items }: { items: ConsoleCrumb[] }) {
  const { t } = useTranslation()
  // A lone crumb is the page above (a screen still loading draws only that); otherwise the last
  // crumb is the screen itself.
  const above = items.length > 1 ? items.slice(0, -1) : items
  const parent = [...above].reverse().find((crumb) => crumb.to)
  if (!parent?.to) return null
  const label = parent.labelKey ? t(parent.labelKey) : (parent.label ?? '')

  return (
    <nav aria-label={t('console.crumb.label')}>
      <Link
        to={parent.to}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-text-quaternary transition-colors hover:text-primary-700"
      >
        <img
          src={chevronIcon}
          alt=""
          aria-hidden="true"
          className="size-4 rotate-180 rtl:rotate-0"
        />
        {label}
      </Link>
    </nav>
  )
}
