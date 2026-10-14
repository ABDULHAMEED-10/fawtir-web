import { useTranslation } from 'react-i18next'
import type { SignupStatusResponse } from '../../lib/identity/onboarding'
import { asSentence, isConfirmedPayment, rejectionReasonLabel } from '../../lib/identity/signupRejection'
import { SUPPORT_EMAIL } from '../../lib/fawtaraStatus'

/**
 * A registration Fawtir closed with a final rejection. Nothing can be corrected or submitted, so
 * the screen says why, whether a confirmed payment comes back, and who to contact.
 */
export function SignupClosedPanel({ status }: { status: SignupStatusResponse }) {
  const { t, i18n } = useTranslation()
  const reason = status.rejectionReason
  return (
    <div className="flex w-full max-w-[660px] flex-col gap-7">
      <div className="flex flex-col gap-3">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('signupPending.closed.title')}
        </h2>
        {reason ? (
          <p className="text-base font-medium leading-[1.4] text-text-quaternary">
            {t('signupPending.closed.reason', { reason: asSentence(rejectionReasonLabel(reason, t, i18n)) })}
          </p>
        ) : null}
        <p className="text-base font-medium leading-[1.4] text-text-quaternary">
          {t('signupPending.closed.final')}
        </p>
        {isConfirmedPayment(status.signupPayment?.status) ? (
          <p className="text-base font-medium leading-[1.4] text-text-quaternary">
            {t('signupPending.closed.refund')}
          </p>
        ) : null}
        <p className="text-base font-medium leading-[1.4] text-text-quaternary">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-text-brand hover:underline">
            {t('signupPending.closed.contact')}
          </a>
        </p>
      </div>
    </div>
  )
}
