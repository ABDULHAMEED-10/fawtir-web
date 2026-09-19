import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/ui'
import { TextField } from '../../components/form'
import { createPayerAccount, type PayerAccountDto, type PaymentRunState } from '../../api/expenditure/paymentRuns'
import { BIC_SHAPE, ibanValid, refusalOf } from '../../lib/paymentRuns'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import omrIcon from '../../assets/invoices/omr.svg'

const STATE_TONE: Record<PaymentRunState, string> = {
  DRAFT: 'bg-[#e3e4ea] text-[#474a5e]',
  SCHEDULED: 'bg-primary-50 text-primary-800',
  EXPORTED: 'bg-pending-100 text-pending-700',
  PAID: 'bg-success-100 text-success-700',
  CANCELLED: 'bg-danger-100 text-[#7a1009]',
}

export function RunStatePill({ state }: { state: PaymentRunState }) {
  const { t } = useTranslation()
  return (
    <span className={['inline-flex h-[28px] items-center gap-2 rounded-full px-3 text-xs font-semibold', STATE_TONE[state]].join(' ')}>
      <span className="size-1.5 rounded-full bg-current" />
      {t(`paymentRuns.state.${state}`)}
    </span>
  )
}

export function SectionTitle({ step, title, note }: { step: number; title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="inline-flex size-6 shrink-0 translate-y-0.5 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
        {step}
      </span>
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
      {note ? <span className="text-sm font-medium text-text-quaternary">{note}</span> : null}
    </div>
  )
}

/** The Rial mark belongs to OMR; any other currency is written with its code. */
export function Amount({ value, currency, size = 'sm' }: { value: string; currency: string; size?: 'sm' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-1">
      {currency === 'OMR' ? (
        <img src={size === 'lg' ? omrIcon : omrRowIcon} alt="" className={size === 'lg' ? 'h-auto w-7 shrink-0' : 'h-auto w-4 shrink-0'} />
      ) : (
        <span className="text-xs font-semibold text-text-quaternary">{currency}</span>
      )}
      <span className={size === 'lg' ? 'text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums' : 'text-sm font-medium text-text-tertiary tabular-nums'}>
        {value}
      </span>
    </span>
  )
}

export function ConfirmModal({
  title,
  body,
  confirm,
  onConfirm,
  onClose,
}: {
  title: string
  body: string
  confirm: string
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (inFlight.current) return
              inFlight.current = true
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                inFlight.current = false
                setBusy(false)
              }
            }}
            className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {confirm}
          </button>
        </div>
      }
    >
      <p className="text-sm font-medium leading-[1.5] text-text-secondary">{body}</p>
    </Modal>
  )
}

/** Decision 3: an administrator adds the account money leaves from without leaving the run. */
export function AddPayerAccountModal({ onClose, onAdded }: { onClose: () => void; onAdded: (account: PayerAccountDto) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [errors, setErrors] = useState<{ name?: string; iban?: string; bic?: string }>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const next: typeof errors = {}
    if (!name.trim()) next.name = t('validation.required')
    if (!ibanValid(iban)) next.iban = t('paymentRuns.account.ibanInvalid')
    if (bic.trim() && !BIC_SHAPE.test(bic.trim().toUpperCase())) next.bic = t('paymentRuns.account.bicInvalid')
    setErrors(next)
    if (Object.keys(next).length > 0 || busy) return
    setBusy(true)
    setNotice(null)
    try {
      onAdded(await createPayerAccount({ name: name.trim(), iban: iban.replace(/\s+/g, '').toUpperCase(), bic: bic.trim() ? bic.trim().toUpperCase() : null }))
    } catch (error) {
      setNotice(refusalOf(error, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('paymentRuns.account.title')}
      subtitle={t('paymentRuns.account.subtitle')}
      footer={
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary">
            {t('common.cancel')}
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white disabled:opacity-60">
            {t('paymentRuns.account.save')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {notice ? (
          <p role="alert" className="text-sm font-medium text-text-danger">
            {notice}
          </p>
        ) : null}
        <TextField id="payer-name" name="name" label={t('paymentRuns.account.name')} required maxLength={140} value={name} onChange={setName} error={errors.name} />
        <TextField id="payer-iban" name="iban" label={t('paymentRuns.account.iban')} required maxLength={42} value={iban} onChange={setIban} error={errors.iban} />
        <TextField id="payer-bic" name="bic" label={t('paymentRuns.account.bic')} maxLength={11} value={bic} onChange={setBic} error={errors.bic} />
      </div>
    </Modal>
  )
}
