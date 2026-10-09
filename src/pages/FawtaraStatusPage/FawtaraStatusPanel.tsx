import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ExternalLinkIcon } from '../../components/ui'
import {
  FAWTARA_PORTAL_URL,
  SUPPORT_EMAIL,
  goingLiveSteps,
  needsPortalRequest,
  type GoingLivePhase,
  type GoingLiveStep,
} from '../../lib/fawtaraStatus'
import { planDisplayName, type OnboardingState } from '../../lib/onboarding'

function StepMarker({ step, number }: { step: GoingLiveStep; number: number }) {
  if (step.state === 'done') {
    return (
      <span className="flex size-[27px] items-center justify-center rounded-full bg-success-700">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="m3 7.2 2.7 2.7L11 4.6"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }

  if (step.state === 'failed') {
    return (
      <span className="flex size-[27px] items-center justify-center rounded-full bg-danger-700">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="m3 3 6 6M9 3 3 9" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    )
  }

  if (step.state === 'current') {
    return (
      <span className="flex size-8 items-center justify-center rounded-full border border-pending-200">
        <span className="flex size-[27px] items-center justify-center rounded-full bg-pending-700 text-base font-medium leading-[1.2] text-white">
          {number}
        </span>
      </span>
    )
  }

  return (
    <span className="flex size-[27px] items-center justify-center rounded-full bg-neutral-100">
      <span className="size-3.5 rounded-full bg-white" />
    </span>
  )
}

const WAITING = {
  box: 'border-pending-200 bg-pending-100',
  dot: 'bg-pending-500',
  text: 'text-pending-700',
}
const FAILED = {
  box: 'border-danger-700/20 bg-danger-100',
  dot: 'bg-danger-700',
  text: 'text-danger-700',
}

const BADGE_TONE: Record<GoingLivePhase, { box: string; dot: string; text: string }> = {
  review: WAITING,
  rejected: FAILED,
  request: WAITING,
  accepting: WAITING,
  registering: WAITING,
  connected: {
    box: 'border-success-700/20 bg-success-100',
    dot: 'bg-success-700',
    text: 'text-success-700',
  },
  declined: FAILED,
  expired: FAILED,
}

/** The plan and payment carried from sign-up; absent after sign-in or on a fresh tab. */
function PlanNote({ choice }: { choice: OnboardingState }) {
  const { t, i18n } = useTranslation()
  const { plan, paymentMethod } = choice
  if (!plan) return null
  // The trial as the status read reported it; with no report the note makes no trial claim.
  const trialDays = choice.planTerms?.trialDays
  const lines =
    plan === 'enterprise'
      ? [t('fawtaraStatus.plan.enterprise')]
      : [
          trialDays === undefined || trialDays === 0
            ? null
            : trialDays === null
              ? t('fawtaraStatus.plan.noTrial')
              : t('fawtaraStatus.plan.trial', { count: trialDays }),
          paymentMethod
            ? t('fawtaraStatus.plan.paidBy', {
                method:
                  paymentMethod === 'cardLink'
                    ? t(`signupReview.payment.cardLink.${choice.linkVia ?? 'email'}`)
                    : t(`signupReview.payment.${paymentMethod}`),
              })
            : null,
        ].filter((line): line is string => Boolean(line))
  return (
    <div className="rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 py-3.5">
      <p className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
        {t('fawtaraStatus.plan.title')}
      </p>
      <p className="mt-1 text-sm font-semibold text-text-primary">
        {planDisplayName(t, choice, i18n.language)}
      </p>
      {lines.map((line) => (
        <p key={line} className="mt-1 text-sm font-medium leading-[1.5] text-text-tertiary">
          {line}
        </p>
      ))}
    </div>
  )
}

type GoingLivePanelProps = {
  phase: GoingLivePhase
  /** The inbox the next decision is emailed to, when this tab knows it. */
  email?: string
  /** The sign-up choices, when the panel closes the sign-up flow. */
  choice?: OnboardingState
  /** What the reader can do next besides the portal, such as signing in. */
  action?: ReactNode
}

/**
 * The "getting you live" panel in the Fawtara status frame's layout (Figma "Fawtara status",
 * 154:85557). Corrected from the frame: steps in time order rather than upward, the real email
 * instead of the sample one, and a review step before Fawtara because sign-up now ends here.
 */
export function FawtaraStatusPanel({ phase, email, choice, action }: GoingLivePanelProps) {
  const { t } = useTranslation()
  const steps = goingLiveSteps(phase)
  const tone = BADGE_TONE[phase]
  const showPortal = needsPortalRequest(phase)

  return (
    <div className="flex w-full max-w-[660px] flex-col gap-7">
      <div className="flex flex-col gap-3">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t(`fawtaraStatus.${phase}.title`)}
        </h2>
        <p className="text-base font-medium leading-[1.4] text-text-quaternary">
          {t(`fawtaraStatus.${phase}.description`)}
        </p>
      </div>

      <span
        className={`inline-flex w-fit items-center gap-3 rounded-full border px-3 py-[5px] ${tone.box}`}
      >
        <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
        <span className={`text-sm font-medium leading-[1.5] ${tone.text}`}>
          {t(`fawtaraStatus.${phase}.badge`)}
        </span>
      </span>

      <ol className="flex flex-col">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1
          return (
            <li
              key={step.id}
              className="flex"
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              <div className="flex w-[52px] shrink-0 flex-col items-center">
                <span className="flex h-8 items-center justify-center">
                  <StepMarker step={step} number={index + 1} />
                </span>
                {!isLast ? (
                  <span className="min-h-[30px] w-0.5 flex-1 bg-neutral-100" aria-hidden="true" />
                ) : null}
              </div>

              <div className={['min-w-0 pt-1.5', isLast ? '' : 'pb-5'].join(' ')}>
                <p
                  className={[
                    'text-base font-medium leading-[1.2]',
                    step.state === 'upcoming' ? 'text-text-muted' : 'text-text-secondary',
                  ].join(' ')}
                >
                  {t(step.labelKey)}
                </p>
                {step.statusKey && step.state !== 'upcoming' ? (
                  <p
                    className={[
                      'mt-1 text-sm font-medium leading-[1.3]',
                      step.state === 'current'
                        ? 'text-pending-700'
                        : step.state === 'failed'
                          ? 'text-text-danger'
                          : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {t(step.statusKey)}
                  </p>
                ) : null}
                {/* How to send the request, under its step while it is the one to do. */}
                {step.id === 'request' && showPortal ? (
                  <ol className="mt-2 flex list-decimal flex-col gap-1 ps-4 text-sm font-medium leading-[1.4] text-text-tertiary">
                    {(['h1', 'h2', 'h3', 'h4'] as const).map((key) => (
                      <li key={key}>{t(`fawtaraStatus.howTo.${key}`)}</li>
                    ))}
                  </ol>
                ) : null}
                {step.id === 'request' && showPortal ? (
                  <p className="mt-2 text-xs font-medium leading-[1.4] text-text-quaternary">
                    {t('fawtaraStatus.howTo.switching')}
                  </p>
                ) : null}
                {step.id === 'request' && showPortal ? (
                  <a
                    href={FAWTARA_PORTAL_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 inline-flex w-fit items-center gap-3 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 py-3.5 text-sm font-semibold leading-[1.2] text-[#3a3a3a] transition-colors hover:bg-neutral-25"
                  >
                    {t('fawtaraStatus.openPortal')}
                    <ExternalLinkIcon
                      size={20}
                      className="shrink-0 text-text-quaternary rtl:-scale-x-100"
                    />
                  </a>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>

      {action ? <div className="flex flex-wrap items-center gap-3">{action}</div> : null}

      {choice ? <PlanNote choice={choice} /> : null}

      {phase === 'connected' ? null : (
        <div className="flex flex-col gap-0.5 text-xs font-medium leading-[1.5] text-text-quaternary">
          <p className="font-semibold text-text-secondary">{t(`fawtaraStatus.${phase}.timing`)}</p>
          <p className="break-words">
            {email ? (
              <Trans
                i18nKey={`fawtaraStatus.${phase}.emailNote`}
                values={{ email }}
                components={{ b: <b dir="ltr" className="font-semibold text-text-secondary" /> }}
              />
            ) : (
              t(`fawtaraStatus.${phase}.emailNoteNoAddress`)
            )}
          </p>
          <p>
            {t('fawtaraStatus.slow')}{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-semibold text-text-brand hover:underline"
            >
              {t('fawtaraStatus.contactSupport')}
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
