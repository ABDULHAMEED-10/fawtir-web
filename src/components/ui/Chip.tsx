type ChipProps = {
  label: string
  selected?: boolean
  onSelect?: () => void
  interactive?: boolean
}

/** Selectable pill chip (Figma Chip) — text only. */
export function Chip({ label, selected = false, onSelect, interactive = true }: ChipProps) {
  if (!interactive) {
    return (
      <span className="inline-flex h-[37px] items-center justify-center rounded-sm border border-border-brand-subtle bg-primary-50 px-5 text-base font-medium leading-[1.2] text-primary-900">
        {label}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'inline-flex items-center justify-center rounded-full px-5 py-3.5 text-base font-medium leading-[1.2] transition-colors',
        selected
          ? 'bg-primary-700 text-text-on-primary'
          : 'border border-border-default bg-surface-card text-text-secondary hover:border-border-brand-subtle',
      ].join(' ')}
    >
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}
