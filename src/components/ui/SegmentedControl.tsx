type SegmentOption<T extends string> = {
  value: T
  label: string
}

type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        'inline-flex w-[180px] items-start overflow-hidden rounded-sm border border-primary-50 bg-primary-25 p-1',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={[
              'flex h-9 w-[86px] items-center justify-center rounded-sm px-[15px] text-base transition-colors',
              active
                ? 'bg-surface-card font-semibold text-primary-800'
                : 'bg-transparent font-medium text-text-quaternary hover:text-text-secondary',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
