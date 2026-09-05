type IconProps = {
  className?: string
  size?: number
}

export function MailIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3.5 5.5h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m3 6.5 7 5 7-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LockIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="8.5" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 8.5V6.5a3 3 0 0 1 6 0v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function EyeOffIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3 3.5 17 16.5M8.4 8.5A2.5 2.5 0 0 0 11.5 11.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M5.2 5.8C3.7 6.9 2.6 8.4 2 10c1.4 3.5 4.5 5.8 8 5.8 1.5 0 2.9-.4 4.1-1.1M14.2 13.3A8.4 8.4 0 0 0 18 10c-.8-2-2.2-3.6-4-4.6A8.7 8.7 0 0 0 10 4.2c-.7 0-1.4.1-2 .2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function EyeIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M2 10c1.4-3.5 4.5-5.8 8-5.8S16.6 6.5 18 10c-1.4 3.5-4.5 5.8-8 5.8S3.4 13.5 2 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function PhoneIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M7.2 3.5h2.2l1 3.2-1.4 1a9 9 0 0 0 3.8 3.8l1-1.4 3.2 1v2.2A1.5 1.5 0 0 1 15.5 15 11.5 11.5 0 0 1 4 3.5 1.5 1.5 0 0 1 5.5 2h1.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function UserIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 16.5c1.2-2.4 3.1-3.5 5.5-3.5s4.3 1.1 5.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** The three bars that open the navigation on a screen too narrow to keep it on show. */
export function MenuIcon({ className = '', size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Stacked cards — the phone shape for a list. */
export function CardsIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3.5" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11.5" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** Ruled rows and columns — the desk shape for a list. */
export function TableIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14M8.5 8v8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function CloseIcon({ className = '', size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronLeftIcon({ className = '', size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M10 3.5 5.5 8 10 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronRightIcon({ className = '', size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function UsersIcon({ className = '', size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.5" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4 17.5c.8-1.8 2.1-2.7 3.8-2.7M20 17.5c-.8-1.8-2.1-2.7-3.8-2.7M8.2 17.5c1-1.7 2.4-2.5 3.8-2.5s2.8.8 3.8 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BuildingIcon({ className = '', size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 4C4.44772 4 4 4.44772 4 5V19C4 19.5523 4.44772 20 5 20H12H13C13.5523 20 14 19.5523 14 19V5C14 4.44772 13.5523 4 13 4H5ZM5 22H12H13H19C20.6569 22 22 20.6569 22 19V9C22 7.34315 20.6569 6 19 6H16V5C16 3.34315 14.6569 2 13 2H5C3.34315 2 2 3.34315 2 5V19C2 20.6569 3.34315 22 5 22ZM19 20H15.8293C15.9398 19.6872 16 19.3506 16 19V8H19C19.5523 8 20 8.44772 20 9V19C20 19.5523 19.5523 20 19 20ZM7 14H5V16H7V14ZM8 14H10V16H8V14ZM13 14H11V16H13V14ZM17 14H19V16H17V14ZM19 10H17V12H19V10ZM5 10H7V12H5V10ZM10 10H8V12H10V10ZM11 10H13V12H11V10ZM7 6H5V8H7V6ZM8 6H10V8H8V6ZM13 6H11V8H13V6Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function InvoiceIcon({ className = '', size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-1.5 1.2V5A1.5 1.5 0 0 1 7 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 8h6M9 11.5h6M9 15h3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SpreadsheetIcon({ className = '', size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 9.5h16M4 14.5h16M10 4v16" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function SoftwareIcon({ className = '', size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 19.5h8M12 17v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M7.5 9.5h3M7.5 12.5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HashIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.25 8.75H8.75V5.25H5.25V8.75ZM14 5.25V3.5H10.5V0H8.75V3.5H5.25V0H3.5V3.5H0V5.25H3.5V8.75H0V10.5H3.5V14H5.25V10.5H8.75V14H10.5V10.5H14V8.75H10.5V5.25H14Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function CameraIcon({ className = '', size = 30 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M9.5 10.5h1.2l1.1-2h6.4l1.1 2H20.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="15" cy="16" r="3.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function LocationPinIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M10 2.5c-3.1 0-5.6 2.4-5.6 5.4 0 4 5.6 10.1 5.6 10.1s5.6-6.1 5.6-10.1c0-3-2.5-5.4-5.6-5.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="10" cy="7.8" r="1.9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function IdCardIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="2.5"
        y="4.5"
        width="15"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="7.5" cy="9" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11.5 8.5h4M11.5 11.5h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CheckCircleIcon({ className = '', size = 27 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 27 27"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="13.5" cy="13.5" r="12.25" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="m8.5 13.8 3.4 3.4 6.6-6.6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ExternalLinkIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16.5 11.5v4a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12.5 3.5h4v4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m16.5 3.5-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronDownIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
