import type { ReactNode } from 'react'
import tickCircle from '../../assets/icons/tick-circle.svg'

type SelectionCardProps = {
  title: string
  description: string
  icon: ReactNode
  selected?: boolean
  onSelect: () => void
}

export function SelectionCard({
  title,
  description,
  icon,
  selected = false,
  onSelect,
}: SelectionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        'flex w-full items-center justify-between gap-3 rounded-sm p-4 text-start transition-colors',
        selected
          ? 'border-2 border-primary-500 bg-primary-50'
          : 'border-2 border-border-default bg-surface-card hover:border-border-brand-subtle',
      ].join(' ')}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="inline-flex size-6 shrink-0 items-center justify-center text-text-primary">
          {icon}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-base font-medium tracking-[0.16px] text-[#0c0d34]">{title}</span>
          <span className="text-xs font-medium tracking-[0.12px] text-black/80">{description}</span>
        </span>
      </span>

      {selected ? (
        <img src={tickCircle} alt="" aria-hidden="true" className="size-[18px] shrink-0" />
      ) : null}
    </button>
  )
}
