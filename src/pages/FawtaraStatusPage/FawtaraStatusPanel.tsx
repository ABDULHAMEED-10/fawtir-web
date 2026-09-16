import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircleIcon, ExternalLinkIcon } from '../../components/ui'
import type { SignupPaymentMethod } from '../PaymentPage/PaymentForm'
import {
  FAWTARA_NOTIFY_EMAIL,
  FAWTARA_PORTAL_URL,
  FAWTARA_STEPS,
  type FawtaraStep,
} from '../../lib/fawtaraStatus'

function StepMarker({ step }: { step: FawtaraStep }) {
  if (step.state === 'done') {
    return <CheckCircleIcon size={27} className="text-success-700" />
  }

  if (step.state === 'current') {
    return (
      <span className="flex size-8 items-center justify-center rounded-full border border-pending-200">
        <span className="flex size-[27px] items-center justify-center rounded-full bg-pending-700 text-base font-medium leading-[1.2] text-white">
          {step.index}
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

type PaymentState = {
  plan?: string
  paymentMethod?: SignupPaymentMethod
  linkVia?: 'now' | 'whatsapp' | 'email'
}

/** How the new account chose to pay, carried from the payment step; absent on a direct visit. */
function SubscriptionNote() {
  const { t } = useTranslation()
  const state = (useLocation().state as PaymentState | null) ?? {}
  if (!state.paymentMethod) return null
  const planName = t(`plans.${state.plan ?? 'premium'}.name`)
  const body =
    state.paymentMethod === 'cardLink'
      ? state.linkVia && state.linkVia !== 'now'
        ? t('fawtaraStatus.subscription.cardLinkSent', {
            via: t(`payment.cardLink.via.${state.linkVia}`).toLowerCase(),
          })
        : t('fawtaraStatus.subscription.cardLink')
      : t(`fawtaraStatus.subscription.${state.paymentMethod}`)
  return (
    <div className="rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 py-3.5">
      <p className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
        {t('fawtaraStatus.subscription.title')}
      </p>
      <p className="mt-1 text-sm font-semibold text-text-primary">
        {t('fawtaraStatus.subscription.awaiting', { plan: planName })}
      </p>
      <p className="mt-1 text-sm font-medium leading-[1.5] text-text-tertiary">{body}</p>
    </div>
  )
}

export function FawtaraStatusPanel() {
  const { t } = useTranslation()

  return (
    <div className="flex w-full max-w-[528px] flex-col gap-7">
      <SubscriptionNote />
      <div className="flex flex-col gap-3">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('fawtaraStatus.title')}
        </h2>
        <p className="text-base font-medium leading-[1.2] text-text-quaternary">
          {t('fawtaraStatus.description')}
        </p>
      </div>

      <span className="inline-flex w-fit items-center gap-3 rounded-full border border-pending-200 bg-pending-100 px-3 py-[5px]">
        <span className="size-1.5 rounded-full bg-pending-500" aria-hidden="true" />
        <span className="text-sm font-medium leading-[1.5] text-pending-700">
          {t('fawtaraStatus.badge')}
        </span>
      </span>

      <ol className="flex flex-col">
        {FAWTARA_STEPS.map((step, index) => {
          const isLast = index === FAWTARA_STEPS.length - 1
          return (
            <li
              key={step.id}
              className="flex"
              aria-current={step.state === 'current' ? 'step' : undefined}
            >
              <div className="flex w-[52px] shrink-0 flex-col items-center">
                <span className="flex h-8 items-center justify-center">
                  <StepMarker step={step} />
                </span>
                {!isLast ? (
                  <span className="min-h-[42px] w-0.5 flex-1 bg-neutral-100" aria-hidden="true" />
                ) : null}
              </div>

              <p
                className={[
                  'pt-1.5 text-base font-medium leading-[1.2]',
                  step.state === 'upcoming' ? 'text-text-muted' : 'text-text-secondary',
                ].join(' ')}
              >
                {t(step.labelKey)}
              </p>
            </li>
          )
        })}
      </ol>

      <a
        href={FAWTARA_PORTAL_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex w-fit items-center gap-3 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 py-3.5 text-sm font-semibold leading-[1.2] text-[#3a3a3a] transition-colors hover:bg-neutral-25"
      >
        {t('fawtaraStatus.openPortal')}
        <ExternalLinkIcon size={20} className="shrink-0 text-text-quaternary" />
      </a>

      <p className="text-xs font-medium leading-[1.2] text-text-quaternary">
        {t('fawtaraStatus.footer', { email: FAWTARA_NOTIFY_EMAIL })}{' '}
        <a
          href="mailto:support@fawtir.om"
          className="font-semibold text-text-brand hover:underline"
        >
          {t('fawtaraStatus.contactSupport')}
        </a>
      </p>
    </div>
  )
}
