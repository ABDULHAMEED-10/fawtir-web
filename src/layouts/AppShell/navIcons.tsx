/** Sidebar nav icons — matched to Figma Nav bar Icons (20×20, stroke #444957 / active #1A2F6E). */

type IconProps = { className?: string; active?: boolean }

function stroke(active?: boolean) {
  return active ? '#1A2F6E' : '#444957'
}

export function NavDashboardIcon({ className = '', active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 10.5V16.5C3 17.05 3.45 17.5 4 17.5H8V12.5H12V17.5H16C16.55 17.5 17 17.05 17 16.5V10.5L10 4.5L3 10.5Z"
        stroke={stroke(active)}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 17.5V12.5H12.5V17.5" stroke={stroke(active)} strokeWidth="1.5" />
    </svg>
  )
}

export function NavInvoicesIcon({ className = '', active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 3.5H14C14.55 3.5 15 3.95 15 4.5V16.5L13.5 15.5L12 16.5L10.5 15.5L9 16.5L7.5 15.5L6 16.5V4.5C6 3.95 6.45 3.5 7 3.5H6Z"
        stroke={stroke(active)}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 7H12M8 10H12M8 13H11" stroke={stroke(active)} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function NavExpenditureIcon({ className = '', active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="5" width="15" height="11" rx="1.5" stroke={stroke(active)} strokeWidth="1.5" />
      <path d="M2.5 8.5H17.5" stroke={stroke(active)} strokeWidth="1.5" />
      <path d="M6 12H8" stroke={stroke(active)} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function NavCatalogIcon({ className = '', active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 3.5H13.5L16 6V16.5C16 17.05 15.55 17.5 15 17.5H5C4.45 17.5 4 17.05 4 16.5V3.5Z"
        stroke={stroke(active)}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M13.5 3.5V6H16" stroke={stroke(active)} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 9.5H13M7 12.5H13M7 15.5H11" stroke={stroke(active)} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function NavCustomersIcon({ className = '', active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="6.5" r="2.5" stroke={stroke(active)} strokeWidth="1.5" />
      <path
        d="M4.5 16.5C4.5 13.5 6.9 11.5 10 11.5C13.1 11.5 15.5 13.5 15.5 16.5"
        stroke={stroke(active)}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="15" cy="7" r="1.5" stroke={stroke(active)} strokeWidth="1.3" />
      <circle cx="5" cy="7" r="1.5" stroke={stroke(active)} strokeWidth="1.3" />
    </svg>
  )
}

export function NavSuppliersIcon({ className = '', active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.5 8L10 3.5L16.5 8V16.5C16.5 17.05 16.05 17.5 15.5 17.5H4.5C3.95 17.5 3.5 17.05 3.5 16.5V8Z"
        stroke={stroke(active)}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 17.5V11.5H12V17.5" stroke={stroke(active)} strokeWidth="1.5" />
    </svg>
  )
}

export function NavTddIcon({ className = '', active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 2.5L15.5 4.5V9.5C15.5 13 13.2 15.8 10 17C6.8 15.8 4.5 13 4.5 9.5V4.5L10 2.5Z"
        stroke={stroke(active)}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 9.5L9.2 11.2L12.8 7.6" stroke={stroke(active)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function NavDocumentsIcon({ className = '', active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 3.5H12L15.5 7V16.5C15.5 17.05 15.05 17.5 14.5 17.5H5.5C4.95 17.5 4.5 17.05 4.5 16.5V4.5C4.5 3.95 4.95 3.5 5.5 3.5H5Z"
        stroke={stroke(active)}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 3.5V7H15.5" stroke={stroke(active)} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.5 10.5H12.5M7.5 13.5H11" stroke={stroke(active)} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function NavReportsIcon({ className = '', active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 16.5H16.5" stroke={stroke(active)} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 16.5V10.5" stroke={stroke(active)} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 16.5V6.5" stroke={stroke(active)} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14.5 16.5V8.5" stroke={stroke(active)} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function NavSettingsIcon({ className = '', active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="2.5" stroke={stroke(active)} strokeWidth="1.5" />
      <path
        d="M10 2.5V4M10 16V17.5M17.5 10H16M4 10H2.5M15.3 4.7L14.2 5.8M5.8 14.2L4.7 15.3M15.3 15.3L14.2 14.2M5.8 5.8L4.7 4.7"
        stroke={stroke(active)}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
