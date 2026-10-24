/** Icons the Fawtir console needs that the tenant app has no use for. */
export type IconProps = { className?: string; active?: boolean }

/** A queue that keeps going round — the submissions waiting to be filed. */
export function ConsoleQueueIcon({ className = '', active = false }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3.5 10a6.5 6.5 0 0 1 11-4.7M16.5 10a6.5 6.5 0 0 1-11 4.7"
        stroke={active ? 'currentColor' : 'currentColor'}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M14.5 2.5v3h-3M5.5 17.5v-3h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Something is wrong and a person is needed. */
export function ConsoleIncidentIcon({ className = '' }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M10 3.2 17.4 16H2.6L10 3.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 8v3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="13.6" r="0.85" fill="currentColor" />
    </svg>
  )
}

/** A subscription: the bill and the money that settles it. */
export function ConsoleSubscriptionIcon({ className = '' }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5 3.5h10a1 1 0 0 1 1 1v12l-2.4-1.5L11.2 16.5 8.8 15 6.4 16.5 4 15V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 7.5h5.6M7.2 10.5h3.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** What a tenant pays, and on which plan. */
export function ConsolePlansIcon({ className = '' }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="2.5" y="5" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** Filed and accepted. */
export function ConsoleTickIcon({ className = '' }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4.5 10.4 8.2 14l7.3-8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Waiting its turn. */
export function ConsoleClockIcon({ className = '' }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6v4.3l2.8 1.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A business on the platform. */
export function ConsoleBuildingIcon({ className = '' }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3.5 17V7.6L10 3l6.5 4.6V17"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 17v-4h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

/** A link taken apart — a company leaving Fawtir. */
export function ConsoleUnlinkIcon({ className = '' }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8.2 6.4 9.6 5a3.2 3.2 0 0 1 4.5 4.5l-1.4 1.4M11.8 13.6 10.4 15a3.2 3.2 0 0 1-4.5-4.5l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M4 4l1.6 1.6M16 16l-1.6-1.6M3 8h1.8M17 12h-1.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
