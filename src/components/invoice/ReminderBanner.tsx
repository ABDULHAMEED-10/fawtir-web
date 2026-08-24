import { forwardRef, Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  INVOICE_REMINDER_PLAN,
  stepState,
  type InvoiceReminderPlan,
  type ReminderStepState,
} from '../../lib/invoiceReminder'
import bellIcon from '../../assets/invoice-reminder/bell.svg'
import sendIcon from '../../assets/invoice-reminder/send.svg'
import chevronIcon from '../../assets/invoice-reminder/chevron.svg'
import stepSentIcon from '../../assets/invoice-reminder/step-sent.svg'

/**
 * Reminder strip on a document detail screen (Figma 86:30049).
 *
 * Collapsed it is one 64px row: which reminder is next, when it goes, and the two controls that
 * matter. The chevron reveals the schedule, so the four-node stepper costs nothing until asked
 * for. Sizes here are the design's own — the stepper's fractional type sizes come straight from
 * Figma rather than being rounded, so the panel matches at 100%.
 */

/**
 * Column metrics measured off Figma (86:30049). The nodes are hand-placed there, so the gaps
 * between them differ; `minWidth` keeps English pixel-exact while letting a longer Arabic
 * label widen its own column rather than wrap.
 */
const NODE_MIN_WIDTH = [84, 100, 69, 82]
/** Space between consecutive node columns; the 80px rule is centred inside each. */
const NODE_GAP = [97, 81, 100]

/** The three circle treatments, keyed by how far the sequence has got. */
const CIRCLE_STYLES: Record<ReminderStepState, string> = {
  sent: 'bg-primary-700 text-white',
  next: 'bg-success-100 text-success-700',
  upcoming: 'border-[0.87px] border-border-default text-text-secondary',
}

function ScheduleStepper({ plan, sentCount }: { plan: InvoiceReminderPlan; sentCount: number }) {
  const { t } = useTranslation()

  return (
    <div className="flex items-start overflow-x-auto rounded-sm bg-white ps-[15px] pe-[26px] pt-[18px] pb-[30px]">
      {/* Anchor: the invoice itself, always complete. */}
      <StepNode
        label={t('invoiceReminder.steps.invoiceSent')}
        when={plan.sentOn}
        minWidth={NODE_MIN_WIDTH[0]}
        circle={
          <span className="flex size-[41px] shrink-0 items-center justify-center rounded-full bg-primary-700">
            <img src={stepSentIcon} alt="" className="size-[21px]" />
          </span>
        }
      />

      {plan.steps.map((step, index) => (
        <Fragment key={step.id}>
          <Connector gap={NODE_GAP[index]} />
          <StepNode
            label={t(step.labelKey)}
            when={step.when}
            minWidth={NODE_MIN_WIDTH[index + 1]}
            circle={
              <span
                className={[
                  'flex size-[41px] shrink-0 items-center justify-center rounded-full text-[17.68px] font-semibold leading-[21.22px]',
                  CIRCLE_STYLES[stepState(index, sentCount)],
                ].join(' ')}
              >
                {index + 1}
              </span>
            }
          />
        </Fragment>
      ))}
    </div>
  )
}

/** 80px rule, centred in the gap and level with the middle of the circles it joins. */
function Connector({ gap }: { gap: number }) {
  return (
    <span
      style={{ marginInline: (gap - 80) / 2 }}
      className="mt-[19px] h-[2.6px] w-20 shrink-0 bg-border-subtle"
    />
  )
}

function StepNode({
  label,
  when,
  circle,
  minWidth,
}: {
  label: string
  when: string
  circle: React.ReactNode
  minWidth: number
}) {
  return (
    <div style={{ minWidth }} className="flex shrink-0 flex-col items-center gap-[4.36px]">
      {circle}
      <span className="text-center text-[10.61px] font-semibold uppercase leading-[15.91px] tracking-[1.27px] text-text-tertiary">
        {label}
      </span>
      <span className="-mt-[4.36px] text-center text-[8.84px] font-medium leading-[10.61px] text-text-quaternary">
        {when}
      </span>
    </div>
  )
}

export type ReminderBannerHandle = HTMLDivElement

export const ReminderBanner = forwardRef<
  HTMLDivElement,
  {
    plan?: InvoiceReminderPlan
    /** Opened from outside — the header's "Send reminder" reveals the schedule rather than firing blind. */
    expanded: boolean
    onExpandedChange: (expanded: boolean) => void
  }
>(function ReminderBanner({ plan = INVOICE_REMINDER_PLAN, expanded, onExpandedChange }, ref) {
  const { t } = useTranslation()
  const [sentCount, setSentCount] = useState(0)
  const [paused, setPaused] = useState(false)

  const total = plan.steps.length
  const allSent = sentCount >= total
  const current = Math.min(sentCount + 1, total)

  const sendNow = () => {
    if (allSent) return
    setSentCount((count) => Math.min(total, count + 1))
  }

  return (
    <div
      ref={ref}
      className="flex flex-col gap-4 rounded-sm border border-primary-300 bg-primary-25 p-3"
    >
      <div className="flex min-h-[38px] flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[1.6px] bg-white">
            <img src={bellIcon} alt="" className="size-[19px]" />
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-base font-semibold leading-[1.2] text-text-primary">
              {allSent
                ? t('invoiceReminder.allSent')
                : t('invoiceReminder.title', { current, total })}
            </p>
            <p className="text-xs font-medium leading-[1.2] text-text-quaternary">
              {allSent
                ? t('invoiceReminder.allSentNote')
                : paused
                  ? t('invoiceReminder.pausedNote')
                  : t('invoiceReminder.goesOut', { when: plan.nextAt })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            disabled={allSent}
            className="inline-flex h-[38px] min-w-[101px] items-center justify-center rounded-sm border border-border-subtle bg-white px-2.5 text-sm font-semibold leading-[1.2] text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {paused ? t('invoiceReminder.resume') : t('invoiceReminder.pause')}
          </button>
          <button
            type="button"
            onClick={sendNow}
            disabled={allSent}
            className="inline-flex h-[38px] items-center gap-1.5 rounded-sm border border-border-subtle bg-white ps-2.5 pe-4 text-sm font-semibold leading-[1.2] text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <img src={sendIcon} alt="" className="size-6 shrink-0" />
            {t('invoiceReminder.sendNow')}
          </button>
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            aria-expanded={expanded}
            aria-label={
              expanded ? t('invoiceReminder.hideSchedule') : t('invoiceReminder.showSchedule')
            }
            className="inline-flex size-6 shrink-0 items-center justify-center"
          >
            <img
              src={chevronIcon}
              alt=""
              className={['size-5 transition-transform', expanded ? '' : 'rotate-180'].join(' ')}
            />
          </button>
        </div>
      </div>

      {expanded ? <ScheduleStepper plan={plan} sentCount={sentCount} /> : null}
    </div>
  )
})
