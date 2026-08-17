import type { ReactNode } from 'react'

type PlanStat = {
  value: string
  label: string
  icon: ReactNode
}

type PricingCardProps = {
  name: string
  description: string
  priceLabel: ReactNode
  billingNote: string
  stats: PlanStat[]
  features: string[]
  ctaLabel: string
  onCta: () => void
  variant?: 'light' | 'dark'
  badge?: string
  checkIcon: string
}

export function PricingCard({
  name,
  description,
  priceLabel,
  billingNote,
  stats,
  features,
  ctaLabel,
  onCta,
  variant = 'light',
  badge,
  checkIcon,
}: PricingCardProps) {
  const isDark = variant === 'dark'

  return (
    <div className={['relative flex flex-col', badge ? 'pt-5' : ''].join(' ')}>
      {badge ? (
        <div className="absolute start-1/2 top-0 z-10 -translate-x-1/2 rounded-sm bg-surface-card px-7 py-2 shadow-card rtl:translate-x-1/2">
          <p className="whitespace-nowrap text-sm font-semibold leading-[1.2] text-primary-800">
            {badge}
          </p>
        </div>
      ) : null}

      <div
        className={[
          'relative flex w-full max-w-[295px] flex-col gap-4 overflow-hidden rounded-sm p-5',
          isDark
            ? 'min-h-[510px] border border-primary-600 bg-primary-900 text-white'
            : 'border border-primary-25 bg-surface-card',
        ].join(' ')}
      >
        {isDark ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-10 -start-20 h-[280px] w-[480px] rounded-full bg-primary-700/40 blur-[80px]"
          />
        ) : null}

        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex flex-col">
            <h3
              className={[
                'text-2xl font-semibold leading-[1.2]',
                isDark ? 'text-white' : 'text-text-primary',
              ].join(' ')}
            >
              {name}
            </h3>
            <p
              className={[
                'text-sm font-medium leading-[1.2]',
                isDark ? 'text-white/90' : 'text-text-tertiary',
              ].join(' ')}
            >
              {description}
            </p>
          </div>

          <div className="flex flex-col">
            {priceLabel}
            <p
              className={[
                'text-xs font-medium leading-[1.2]',
                isDark ? 'text-primary-25' : 'text-text-tertiary',
              ].join(' ')}
            >
              {billingNote}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {stats.map((stat) => (
              <div
                key={`${stat.value}-${stat.label}`}
                className={[
                  'flex h-[42px] items-center gap-2 rounded-[3px] border px-3',
                  isDark
                    ? 'border-white/10 bg-white/5 backdrop-blur-[17px]'
                    : 'border-primary-50 bg-primary-25',
                ].join(' ')}
              >
                <span className="inline-flex size-4 shrink-0 items-center justify-center">
                  {stat.icon}
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap leading-[1.2]">
                  <span
                    className={[
                      'font-semibold',
                      isDark ? 'text-xl text-white' : 'text-base text-text-secondary',
                    ].join(' ')}
                  >
                    {stat.value}
                  </span>
                  <span
                    className={[
                      'font-medium',
                      isDark ? 'text-sm text-primary-25' : 'text-xs text-text-tertiary',
                    ].join(' ')}
                  >
                    {stat.label}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <ul className="flex flex-col gap-2.5">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-1.5">
                <img src={checkIcon} alt="" className="size-4 shrink-0" />
                <span
                  className={[
                    'text-xs leading-[1.2]',
                    isDark ? 'font-semibold text-white' : 'font-medium text-text-secondary',
                  ].join(' ')}
                >
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={onCta}
          className={[
            'relative z-10 mt-auto flex h-11 w-full items-center justify-center rounded-sm text-sm font-semibold transition-colors',
            isDark
              ? 'border border-border-subtle bg-white text-primary-700 hover:bg-primary-25'
              : 'bg-primary-700 text-white hover:bg-primary-800',
          ].join(' ')}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}
