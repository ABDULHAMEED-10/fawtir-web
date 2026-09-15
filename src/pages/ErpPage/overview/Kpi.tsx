/**
 * The figure card the Catalog screens open with (CatalogShell's `Kpi`), redrawn here so the ERP
 * screens do not reach across into another page's module.
 */
export function Kpi({
  icon,
  tint = 'bg-primary-50',
  label,
  value,
  unit,
  note,
  tone,
  highlight,
}: {
  icon: string
  tint?: string
  label: string
  value: string
  unit?: string
  note: string
  tone?: 'pending' | 'danger'
  /** The card painted in sand because it is the one asking for something. */
  highlight?: boolean
}) {
  return (
    <article
      className={['rounded-md p-5', highlight ? 'bg-pending-100/70' : 'bg-surface-card'].join(' ')}
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            highlight ? 'bg-pending-200/60' : tint,
          ].join(' ')}
        >
          <img src={icon} alt="" className="size-[18px]" />
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{label}</h3>
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span
          className={[
            'text-[28px] font-semibold leading-[1.2] tabular-nums',
            tone === 'pending'
              ? 'text-pending-700'
              : tone === 'danger'
                ? 'text-danger-700'
                : 'text-text-primary',
          ].join(' ')}
        >
          {value}
        </span>
        {unit ? <span className="text-sm font-medium text-text-quaternary">{unit}</span> : null}
      </p>
      <p className="mt-2 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}
