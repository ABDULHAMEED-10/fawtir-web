import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../../components/ui'
import { formatAmount, formatInstant } from '../../../lib/format'
import type { ConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import {
  refundReasonKey,
  type SignupPaymentReview,
} from '../../../lib/console/companyVerification'
import { ReviewCard, ReviewLine } from './ReviewCard'
import { paymentStatusKey } from '../../../lib/console/billingPayments'

/**
 * The payment sent with the application, beside the company it pays for (owner, 12 Oct 2026).
 * Read-only: approving the company does not settle the money, and Finance verifies it in the
 * billing queue, where the receipt is opened through the audited proof route. The reviewer sees
 * whether money is held so a FINAL rejection is taken knowing it opens a refund.
 */
export function SignupPaymentPanel({
  read,
  retry,
}: {
  /** Read by the page, which reads it again after a decision that may open a refund case. */
  read: ConsoleRead<SignupPaymentReview>
  retry: () => void
}) {
  const { t, i18n } = useTranslation()

  return (
    <ReviewCard title={t('console.verification.payment.title')}>
      {read.status === 'loading' ? (
        <p className="py-2.5 text-sm font-medium text-text-tertiary">{t('console.verification.payment.loading')}</p>
      ) : read.status === 'failed' ? (
        <ConsoleReadFailure error={read.error} retry={retry} />
      ) : read.data.payment === null ? (
        <p className="py-2.5 text-sm font-medium text-text-tertiary">{t('console.verification.payment.none')}</p>
      ) : (
        <>
          <ReviewLine
            label={t('console.verification.payment.method')}
            value={t(`billing.method.${read.data.payment.method}.title`)}
          />
          <ReviewLine
            label={t('console.verification.payment.amount')}
            value={<OmAmount amount={formatAmount(read.data.payment.amount, 'OMR', i18n.language)} size="xs" />}
          />
          <ReviewLine
            label={t('console.verification.payment.status')}
            value={t(paymentStatusKey(read.data.payment.status, read.data.payment.method))}
          />
          {read.data.payment.reference ? (
            <ReviewLine label={t('console.verification.payment.reference')} value={read.data.payment.reference} />
          ) : null}
          {read.data.payment.customerNote ? (
            <ReviewLine label={t('console.verification.payment.note')} value={read.data.payment.customerNote} />
          ) : null}
          <ReviewLine
            label={t('console.verification.payment.submitted')}
            value={formatInstant(read.data.payment.submittedAt, i18n.language)}
          />
          {/* A transfer's receipt is its uploaded file; cash has the receipt number Finance recorded,
              and no row until one is recorded rather than "None" (H1). */}
          {read.data.payment.proofContentType ? (
            <ReviewLine
              label={t('console.verification.payment.receipt')}
              value={t('console.verification.payment.receiptInQueue')}
            />
          ) : read.data.payment.receiptNumber ? (
            <ReviewLine label={t('console.verification.payment.receipt')} value={read.data.payment.receiptNumber} />
          ) : read.data.payment.method === 'BANK_TRANSFER' ? (
            <ReviewLine
              label={t('console.verification.payment.receipt')}
              value={t('console.verification.payment.noReceipt')}
            />
          ) : null}
          {read.data.refundCase ? (
            <ReviewLine
              label={t('console.verification.payment.refund')}
              value={t(refundReasonKey(read.data.refundCase.reason))}
            />
          ) : null}
        </>
      )}
    </ReviewCard>
  )
}
