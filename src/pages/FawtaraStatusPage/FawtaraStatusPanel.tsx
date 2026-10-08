import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExternalLinkIcon } from '../../components/ui'
import type { SignupPaymentMethod } from '../PaymentPage/PaymentForm'
import { FAWTARA_PORTAL_URL } from '../../lib/fawtaraStatus'

type PaymentState = {
  plan?: string
  paymentMethod?: SignupPaymentMethod
  linkVia?: 'now' | 'whatsapp' | 'email'
  addon?: boolean
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
      {state.addon ? (
        <p className="mt-2 text-sm font-medium leading-[1.5] text-text-tertiary">
          {t('fawtaraStatus.subscription.addon')}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Fawtir does not read the Fawtara Portal: whether the OTA has approved Fawtir as this taxpayer's
 * provider is not known here. The panel used to print "Pending approval", a three-step timeline
 * with the request marked sent, and a sample address the approval would be emailed to. It now says
 * what to do on the portal and makes no claim about where the approval stands.
 */
export function FawtaraStatusPanel() {
  const { t } = useTranslation()

  return (
    <div className="flex w-full max-w-[528px] flex-col gap-7">
      <SubscriptionNote />
      <div className="flex flex-col gap-3">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('fawtaraStatus.titleReal')}
        </h2>
        <p className="text-base font-medium leading-[1.2] text-text-quaternary">
          {t('fawtaraStatus.descriptionReal')}
        </p>
      </div>

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
        {t('fawtaraStatus.footerReal')}{' '}
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
