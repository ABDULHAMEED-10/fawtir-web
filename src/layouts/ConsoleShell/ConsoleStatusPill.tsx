/** The status pill the Operations screen draws for the OTA connection, in the app's own tones. */
const TONE = {
  neutral: 'bg-primary-50 text-text-tertiary',
  pending: 'bg-pending-100 text-pending-700',
  success: 'bg-success-100 text-success-700',
  danger: 'bg-danger-100 text-danger-700',
} as const

export type ConsolePillTone = keyof typeof TONE

export function ConsoleStatusPill({ tone, label }: { tone: ConsolePillTone; label: string }) {
  return (
    <span
      className={`inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold uppercase tracking-[0.04em] ${TONE[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}
