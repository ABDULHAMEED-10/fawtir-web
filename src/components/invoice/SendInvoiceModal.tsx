import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../ui'
import { Notice } from '../feedback/ApiNotice'
import { ModalFooter } from '../../pages/ConsolePage/subscriptions/modalFields'
import { newSendKey, sendInvoice, type InvoiceSendResultDto } from '../../api/invoices/detail'
import { describeApiFailure } from '../../lib/apiFailure'
import { sendRefusalKey } from '../../lib/invoiceDispatch'

const FORM_ID = 'send-invoice'

/**
 * The confirmation before one issued document is processed for the network.
 *
 * The Idempotency-Key is minted once, when the confirmation opens: a double click, an Enter held
 * down or a retry after a dropped connection is the same send, which the server answers once. A
 * refusal of the request itself (already being sent, nothing owed) stays here; anything the server
 * processed, whether queued or refused by validation, is handed back for the page to show.
 */
export function SendInvoiceModal({
  invoiceId,
  invoiceNumber,
  onClose,
  onSent,
}: {
  invoiceId: string
  invoiceNumber: string | null
  onClose: () => void
  onSent: (result: InvoiceSendResultDto) => void
}) {
  const { t } = useTranslation()
  const [key] = useState(newSendKey)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Two clicks in one tick both run before `busy` renders the button disabled.
  const inFlight = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFailure(null)
    try {
      onSent(await sendInvoice(invoiceId, key))
    } catch (error) {
      const refusal = sendRefusalKey(error)
      if (refusal) {
        setFailure(t(refusal))
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setFailure(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  // Closing mid-request would hide the answer to a send that still happens.
  const close = busy ? () => undefined : onClose

  return (
    <Modal
      open
      width={520}
      onClose={close}
      title={t('invoiceDispatch.modal.title', { number: invoiceNumber ?? '' })}
      subtitle={t('invoiceDispatch.modal.subtitle')}
      footer={
        <ModalFooter
          formId={FORM_ID}
          onCancel={close}
          submitLabel={busy ? t('invoiceDispatch.modal.sending') : t('invoiceDispatch.modal.submit')}
          disabled={busy}
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {failure ? <Notice body={failure} /> : null}
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">{t('invoiceDispatch.modal.body')}</p>
        <p className="text-sm font-semibold leading-[1.5] text-text-primary">{t('invoiceDispatch.modal.final')}</p>
      </form>
    </Modal>
  )
}
