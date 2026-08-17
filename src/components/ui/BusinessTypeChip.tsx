type BusinessTypeChipProps = {
  label: string
  iconSrc: string
  selected?: boolean
  onSelect: () => void
}

export function BusinessTypeChip({
  label,
  iconSrc,
  selected = false,
  onSelect,
}: BusinessTypeChipProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3.5 text-base font-medium leading-[1.2] transition-colors',
        selected
          ? 'gap-2.5 bg-primary-700 text-text-on-primary'
          : 'border border-border-default bg-surface-card text-text-secondary hover:border-border-brand-subtle',
      ].join(' ')}
    >
      <img
        src={iconSrc}
        alt=""
        aria-hidden="true"
        className={['size-6 shrink-0 object-contain', selected ? 'brightness-0 invert' : ''].join(
          ' ',
        )}
      />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}
