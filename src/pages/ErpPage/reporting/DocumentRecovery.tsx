import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../../../components/ui'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { hasPermission } from '../../../lib/identity/entitlements'
import { useSubscriptionAllows } from '../../../lib/subscriptionReadOnly'
import { RECOVER_PERMISSION, type SourceDocumentDto } from '../../../api/erp/reporting'
import { recoveryOffer, type RecoveryNotice } from '../../../lib/erp/recovery'
import { SECONDARY_BUTTON, SectionCard } from '../overview/idiom'
import { useCode } from './reportingHooks'

const NOTICE_TONE: Record<RecoveryNotice['tone'], string> = {
  success: 'bg-success-100 text-success-700',
  neutral: 'bg-surface-background text-text-secondary',
  warning: 'bg-pending-100 text-pending-700',
  danger: 'bg-danger-100 text-danger-700',
}

/**
 * The answer, focused when it arrives: the dialog that asked has closed and the button that opened
 * it may be gone after the re-read, so focus would otherwise fall to the page's start.
 */
export function RecoveryNoticeBanner({ notice }: { notice: RecoveryNotice }) {
  const { t } = useTranslation()
  const code = useCode()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [notice])

  const success = notice.tone === 'success' || notice.tone === 'neutral'
  const key =
    notice.kind === 'succeeded' && !notice.invoiceCreated ? 'succeededNoInvoice' : notice.kind
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={success ? 'status' : 'alert'}
      className={[
        'rounded-md px-4 py-3 text-sm leading-[1.5] outline-none focus-visible:outline-2 focus-visible:outline-border-brand',
        NOTICE_TONE[notice.tone],
      ].join(' ')}
    >
      <p className="font-semibold">{t(`erp.reporting.recover.result.${key}.title`)}</p>
      <p className="mt-0.5 font-medium">
        {t(`erp.reporting.recover.result.${key}.body`, {
          reason: notice.reason ? code('reason', notice.reason) : '',
        })}
      </p>
      {notice.retry ? (
        <p className="mt-1 text-xs font-medium">{t('erp.reporting.recover.mayRetry')}</p>
      ) : null}
    </div>
  )
}

/**
 * The recovery card, drawn only for a document the server's state says ran out of automatic
 * attempts. It is an exceptional action, so it is never a row action on a list and never shown on
 * a document that has another way forward.
 */
export function RecoveryCard({
  document,
  busy,
  onRecover,
}: {
  document: SourceDocumentDto
  busy: boolean
  onRecover: () => Promise<void>
}) {
  const { t } = useTranslation()
  const { entitlements } = useEntitlements()
  const [confirming, setConfirming] = useState(false)
  // No snapshot means no offer: the button is shown only to someone the server will let through.
  const canRecover = entitlements !== null && hasPermission(entitlements, RECOVER_PERMISSION)
  // Recovery contacts the ERP and can issue an invoice, so it stops while the subscription is
  // read-only (ST-2): the action is hidden, and the line at the top of the screen says why.
  const mayRecover = useSubscriptionAllows('ERP')
  const offer = recoveryOffer(document, canRecover)
  if (offer === 'none') return null

  return (
    <SectionCard title={t('erp.reporting.recover.title')} note={t('erp.reporting.recover.note')}>
      <div className="flex flex-col items-start gap-3 px-5 pb-5">
        <p className="text-sm text-text-secondary">{t('erp.reporting.recover.explain')}</p>
        {!mayRecover ? null : offer === 'offer' ? (
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            {busy ? t('erp.reporting.recover.working') : t('erp.reporting.recover.action')}
          </button>
        ) : (
          <p role="note" className="text-sm font-medium text-text-quaternary">
            {t('erp.reporting.recover.noPermission')}
          </p>
        )}
      </div>
      <RecoveryDialog
        open={confirming}
        busy={busy}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await onRecover()
          setConfirming(false)
        }}
      />
    </SectionCard>
  )
}

function RecoveryDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      // The request is already with the server; closing would hide its answer, not stop it.
      onClose={busy ? () => {} : onClose}
      title={t('erp.reporting.recover.confirmTitle')}
      width={520}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button type="button" size="md" variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="button" size="md" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? t('erp.reporting.recover.working') : t('erp.reporting.recover.confirm')}
          </Button>
        </div>
      }
    >
      <div className="text-sm font-medium leading-[1.6] text-text-tertiary">
        <p>{t('erp.reporting.recover.confirmIntro')}</p>
        <ul className="mt-2 list-disc ps-5">
          <li>{t('erp.reporting.recover.confirmRefetch')}</li>
          <li>{t('erp.reporting.recover.confirmOnlyThis')}</li>
          <li>{t('erp.reporting.recover.confirmCheckpoint')}</li>
          <li>{t('erp.reporting.recover.confirmSameContent')}</li>
        </ul>
      </div>
    </Modal>
  )
}
