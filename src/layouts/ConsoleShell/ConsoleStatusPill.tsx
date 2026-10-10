/** The console's status pill (Figma "Super Admin -> Tenants"), in the app's own tones. */
const TONE = {
  neutral: 'bg-[#f3f4f5] text-text-muted',
  pending: 'bg-pending-100 text-pending-500',
  success: 'bg-success-100 text-success-700',
  danger: 'bg-danger-100 text-danger-700',
  info: 'bg-primary-50 text-primary-700',
} as const

export type ConsolePillTone = keyof typeof TONE

/** In a row: 21 px, 10 px bold. Beside a title: 26 px, 11.5 px semibold. */
const SIZE = {
  row: 'h-[21px] gap-[5px] px-2 text-[10px] font-bold tracking-[0.3px] [&>span]:size-[5px]',
  header: 'h-[26px] gap-1.5 px-[11px] text-[11.5px] font-semibold tracking-[0.3px] [&>span]:size-[7px]',
} as const

export type ConsolePillSize = keyof typeof SIZE

export function ConsoleStatusPill({
  tone,
  label,
  size = 'row',
}: {
  tone: ConsolePillTone
  label: string
  size?: ConsolePillSize
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-sm uppercase ${SIZE[size]} ${TONE[tone]}`}
    >
      <span className="shrink-0 rounded-full bg-current" />
      {label}
    </span>
  )
}
