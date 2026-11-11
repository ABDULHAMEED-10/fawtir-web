import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../ui'
import { Notice } from '../feedback/ApiNotice'
import { ModalFooter, TextArea } from '../../pages/ConsolePage/subscriptions/modalFields'
import {
  amendHeldHsCodes,
  type HeldHsCodeAmendmentDto,
  type InvoiceDetailDto,
} from '../../api/invoices/detail'
import { describeApiFailure } from '../../lib/apiFailure'
import { heldHsRefusal, missingHsLines, OTHER_HS_CODE } from '../../lib/heldHsCodes'

const FORM_ID = 'held-hs-codes'
/** HeldHsCodeAmendmentRequest: `@Size(max = 12)` per code, `@Size(max = 250)` for the reason. */
const MAX_CODE = 12
const MAX_REASON = 250

/**
 * Adds the HS code (or Other) to each goods line an issued invoice was held for, and releases it
 * under the same number (owner v2 A1, K5). Every missing line must be given a code before it is
 * sent: a release with a line still missing would only be held again at dispatch. Whether a code is
 * on the Oman list (CL-08-OM-HS) is the server's to say; it refuses one that is not, by line.
 */
export function HeldHsCodesModal({
  invoice,
  onClose,
  onDone,
}: {
  invoice: InvoiceDetailDto
  onClose: () => void
  onDone: (result: HeldHsCodeAmendmentDto) => void
}) {
  const { t } = useTranslation()
  const lines = missingHsLines(invoice)
  const [codes, setCodes] = useState<Record<number, string>>({})
  const [reason, setReason] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Two clicks in one tick both run before `busy` renders the button disabled.
  const inFlight = useRef(false)

  const codeOf = (lineNumber: number) => (codes[lineNumber] ?? '').trim()
  const ready = lines.length > 0 && lines.every((line) => codeOf(line.lineNumber) !== '') && reason.trim() !== ''

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ready || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFailure(null)
    try {
      onDone(
        await amendHeldHsCodes(invoice.id, {
          expectedVersion: invoice.version,
          lines: lines.map((line) => ({ lineNumber: line.lineNumber, hsCode: codeOf(line.lineNumber) })),
          reason: reason.trim(),
        }),
      )
    } catch (error) {
      const refusal = heldHsRefusal(error)
      if (refusal) {
        setFailure(t(refusal.key, refusal.values))
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

  // Closing mid-request would hide the answer to a change that still happens.
  const close = busy ? () => undefined : onClose

  return (
    <Modal
      open
      width={560}
      onClose={close}
      title={t('heldHs.title', { number: invoice.invoiceNumber ?? '' })}
      subtitle={t('heldHs.subtitle')}
      footer={
        <ModalFooter
          formId={FORM_ID}
          onCancel={close}
          submitLabel={busy ? t('heldHs.saving') : t('heldHs.submit')}
          disabled={busy || !ready}
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {failure ? <Notice body={failure} /> : null}
        {lines.length === 0 ? (
          <p className="text-sm font-medium text-text-secondary">{t('heldHs.noLines')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lines.map((line) => {
              const label = t('heldHs.lineLabel', { line: line.lineNumber, description: line.description })
              return (
                <li key={line.lineNumber} className="flex flex-col gap-1.5">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-text-primary">{label}</span>
                    <input
                      value={codes[line.lineNumber] ?? ''}
                      inputMode="numeric"
                      dir="ltr"
                      maxLength={MAX_CODE}
                      onChange={(event) =>
                        setCodes((before) => ({ ...before, [line.lineNumber]: event.target.value }))
                      }
                      className="h-10 rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none focus:border-primary-500"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setCodes((before) => ({ ...before, [line.lineNumber]: OTHER_HS_CODE }))}
                    aria-label={t('heldHs.useOtherFor', { line: line.lineNumber })}
                    className="w-fit text-xs font-semibold text-primary-700 hover:underline"
                  >
                    {t('heldHs.useOther')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <TextArea
          label={t('heldHs.reason')}
          required
          name="reason"
          value={reason}
          maxLength={MAX_REASON}
          onChange={(event) => setReason(event.target.value)}
        />
        <p className="text-xs font-medium text-text-tertiary">{t('heldHs.sameNumber')}</p>
      </form>
    </Modal>
  )
}
