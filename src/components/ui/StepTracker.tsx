import { useTranslation } from 'react-i18next'
import stepQuoteIcon from '../../assets/quotations/step-quote.svg'
import stepTickIcon from '../../assets/quotations/step-tick.svg'
import stepOrderIcon from '../../assets/quotations/step-order.svg'
import stepClockIcon from '../../assets/quotations/step-clock.svg'
import stepDeclinedIcon from '../../assets/quotations/step-declined.svg'
import stepDraftIcon from '../../assets/quotations/step-draft.svg'

/** Progress circle states, each with its own fill/border/glyph in the design. */
export type StepState = 'done' | 'current' | 'pending' | 'declined' | 'draft' | 'future'

export type TrackerStep = { labelKey: string; state: StepState }

/**
 * Quote → Order → Deliver → Invoice, the chain every trade document travels.
 * `current` is the only filled-blue step and carries the glyph of the step it sits on;
 * everything past it stays an empty grey outline.
 */
const STEP_STYLES: Record<StepState, { circle: string; label: string; icon?: string }> = {
  done: {
    circle: 'bg-[#e6efea] border border-[#b7c4bd]',
    label: 'text-[#2c3342]',
    icon: stepTickIcon,
  },
  current: { circle: 'bg-[#2c4eb7]', label: 'text-[#2c3342]' },
  pending: {
    circle: 'bg-[#f7f1e6] border border-[#cfc6b5]',
    label: 'text-[#2c3342]',
    icon: stepClockIcon,
  },
  declined: {
    circle: 'bg-[#fff0f0] border border-[#d6a19d]',
    label: 'text-[#2c3342]',
    icon: stepDeclinedIcon,
  },
  draft: { circle: 'border border-[#e8e8ea]', label: 'text-[#2c3342]', icon: stepDraftIcon },
  future: { circle: 'border border-[#d0d2d5]', label: 'text-[#737781]' },
}

/** Glyph shown when a step is the filled-blue `current` one, by position in the chain. */
const CURRENT_STEP_ICONS = [stepQuoteIcon, stepOrderIcon, stepOrderIcon, stepQuoteIcon]

/** Table rows use the 31px chain; document headers use the 37px one. */
const SIZES = {
  sm: { circle: 'size-[31px]', width: 'w-[31px]', glyph: 'size-4', line: 'w-[27px] mt-[15px] mx-2', label: 'text-[8px]' },
  md: { circle: 'size-[37px]', width: 'w-[37px]', glyph: 'size-[19px]', line: 'w-8 mt-[18px] mx-[9px]', label: 'text-[9px]' },
} as const

export function StepTracker({
  steps,
  size = 'sm',
}: {
  steps: TrackerStep[]
  size?: keyof typeof SIZES
}) {
  const { t } = useTranslation()
  const s = SIZES[size]

  return (
    <div className="flex items-start">
      {steps.map((step, i) => {
        const style = STEP_STYLES[step.state]
        const icon = style.icon ?? (step.state === 'current' ? CURRENT_STEP_ICONS[i] : undefined)
        return (
          <div key={step.labelKey} className="flex items-start">
            {i > 0 ? (
              <span aria-hidden="true" className={['h-px shrink-0 bg-[#e8e8ea]', s.line].join(' ')} />
            ) : null}
            <div className={['flex flex-col items-center gap-[3px]', s.width].join(' ')}>
              <span
                className={[
                  'flex items-center justify-center rounded-full',
                  s.circle,
                  style.circle,
                ].join(' ')}
              >
                {icon ? <img src={icon} alt="" className={s.glyph} /> : null}
              </span>
              <span
                className={[
                  'whitespace-nowrap font-semibold leading-[1.2]',
                  s.label,
                  style.label,
                ].join(' ')}
              >
                {t(step.labelKey)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
