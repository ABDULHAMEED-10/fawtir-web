/**
 * Sidebar nav icons — Figma "Nav bar Icons" (20×20).
 * Rendered as <img> (CSS mask was showing solid boxes).
 */
import dashboardSrc from '../../assets/dashboard/nav-figma/dashboard.svg'
import incomeSrc from '../../assets/dashboard/nav-figma/income.svg'
import expenditureSrc from '../../assets/dashboard/nav-figma/expenditure.svg'
import catalogSrc from '../../assets/dashboard/nav-figma/catalog.svg'
import customersSrc from '../../assets/dashboard/nav-figma/customers.svg'
import suppliersSrc from '../../assets/dashboard/nav-figma/suppliers.svg'
import tddSrc from '../../assets/dashboard/nav-figma/tdd.svg'
import documentsSrc from '../../assets/dashboard/nav-figma/documents.svg'
import reportsSrc from '../../assets/dashboard/nav-figma/reports.svg'
import settingsSrc from '../../assets/dashboard/nav-figma/settings.svg'

type IconProps = { className?: string; active?: boolean }

/** Recolor #444957 icons to Primary/900 (#1A2F6E) when active. */
const ACTIVE_FILTER =
  'brightness(0) saturate(100%) invert(14%) sepia(55%) saturate(1800%) hue-rotate(205deg) brightness(0.95) contrast(1.05)'

function NavIcon({ src, className = '', active }: IconProps & { src: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={['size-5 shrink-0 object-contain', className].filter(Boolean).join(' ')}
      style={active ? { filter: ACTIVE_FILTER } : undefined}
    />
  )
}

export function NavDashboardIcon(props: IconProps) {
  return <NavIcon src={dashboardSrc} {...props} />
}

export function NavInvoicesIcon(props: IconProps) {
  return <NavIcon src={incomeSrc} {...props} />
}

export function NavExpenditureIcon(props: IconProps) {
  return <NavIcon src={expenditureSrc} {...props} />
}

export function NavCatalogIcon(props: IconProps) {
  return <NavIcon src={catalogSrc} {...props} />
}

export function NavCustomersIcon(props: IconProps) {
  return <NavIcon src={customersSrc} {...props} />
}

export function NavSuppliersIcon(props: IconProps) {
  return <NavIcon src={suppliersSrc} {...props} />
}

export function NavTddIcon(props: IconProps) {
  return <NavIcon src={tddSrc} {...props} />
}

export function NavDocumentsIcon(props: IconProps) {
  return <NavIcon src={documentsSrc} {...props} />
}

export function NavReportsIcon(props: IconProps) {
  return <NavIcon src={reportsSrc} {...props} />
}

export function NavSettingsIcon(props: IconProps) {
  return <NavIcon src={settingsSrc} {...props} />
}
