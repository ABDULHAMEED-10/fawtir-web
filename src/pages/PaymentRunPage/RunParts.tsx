import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Modal, RialMark, withRial } from '../../components/ui'
import { TextField } from '../../components/form'
import {
  addToRun,
  cancelRun,
  candidatesPath,
  createPayerAccount,
  createRun,
  loadCandidates,
  removeFromRun,
  type PayerAccountDto,
  type PaymentRunDto,
  type PaymentRunItemDto,
  type PaymentRunState,
} from '../../api/expenditure/paymentRuns'
import { formatAmount } from '../../lib/format'
import {
  BIC_SHAPE,
  actionsFor,
  formatLabelKey,
  ibanValid,
  refusalOf,
  supplierTile,
} from '../../lib/paymentRuns'
import spreadsheetIcon from '../../assets/payment-run-menu/sheet.svg'
import emailIcon from '../../assets/payment-run-menu/email.svg'
import bankIcon from '../../assets/payment-run-menu/format.svg'
import copyIcon from '../../assets/payment-run-menu/copy.svg'
import resetIcon from '../../assets/payment-run-menu/reset.svg'
import deleteIcon from '../../assets/payment-run-menu/delete.svg'

export const HEADER_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50'
export const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60'

const STATE_TONE: Record<PaymentRunState, string> = {
  DRAFT: 'border border-border-subtle bg-[#f4f5f7] text-[#474a5e]',
  SCHEDULED: 'bg-primary-50 text-primary-800',
  EXPORTED: 'bg-pending-100 text-pending-700',
  PAID: 'bg-success-100 text-success-700',
  CANCELLED: 'bg-danger-100 text-[#7a1009]',
}

export function RunStatePill({ state }: { state: PaymentRunState }) {
  const { t } = useTranslation()
  return (
    <span
      className={[
        'inline-flex h-[31px] items-center gap-2 rounded-sm px-3 text-sm font-semibold',
        STATE_TONE[state],
      ].join(' ')}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {t(`paymentRuns.state.${state}`)}
    </span>
  )
}

export function SectionTitle({
  step,
  title,
  note,
}: {
  step: number
  title: string
  note?: string
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="inline-flex size-6 shrink-0 translate-y-0.5 items-center justify-center rounded-[5px] bg-primary-50 text-[13px] font-extrabold leading-[1.2] text-primary-800">
        {step}
      </span>
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
      {note ? <span className="text-sm font-medium text-text-quaternary">{note}</span> : null}
    </div>
  )
}

const AMOUNT_SIZE = {
  sm: { mark: 'w-4', text: 'text-sm font-medium text-text-tertiary' },
  md: { mark: 'w-4', text: 'text-sm font-semibold text-text-secondary' },
  lg: { mark: 'w-7', text: 'text-[28px] font-semibold leading-[1.2] text-text-primary' },
} as const

/** A figure with the rial sign in its own colour; any other currency is written with its code. */
export function Amount({
  value,
  currency,
  size = 'sm',
  className,
}: {
  value: number
  currency: string
  size?: keyof typeof AMOUNT_SIZE
  /** Replaces the size's text classes: a green saving, a red overdue figure. */
  className?: string
}) {
  const { i18n } = useTranslation()
  const style = AMOUNT_SIZE[size]
  const text = className ?? style.text
  return (
    <span className={['inline-flex items-center gap-1 tabular-nums', text].join(' ')}>
      {currency === 'OMR' ? (
        <RialMark className={[style.mark, 'shrink-0'].join(' ')} />
      ) : (
        <span className="text-xs font-semibold text-text-quaternary">{currency}</span>
      )}
      <span>{formatAmount(value, currency, i18n.language)}</span>
    </span>
  )
}

/** The initials tile the frames draw where a supplier logo would sit. */
export function SupplierTile({ name, size = 'md' }: { name: string | null; size?: 'sm' | 'md' }) {
  const tile = supplierTile(name)
  return (
    <span
      aria-hidden="true"
      className={[
        'flex shrink-0 items-center justify-center rounded-sm font-bold',
        size === 'md' ? 'size-9 text-xs' : 'size-6 rounded-[3px] text-[9px]',
        tile.tint,
      ].join(' ')}
    >
      {tile.initials}
    </span>
  )
}

export function ConfirmModal({
  title,
  body,
  confirm,
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  body: string
  confirm: string
  danger?: boolean
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
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary"
          >
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
            className={[
              'inline-flex h-[42px] items-center rounded-sm px-5 text-sm font-semibold text-white disabled:opacity-60',
              danger ? 'bg-danger-700 hover:bg-[#7a1009]' : 'bg-primary-700 hover:bg-primary-800',
            ].join(' ')}
          >
            {confirm}
          </button>
        </div>
      }
    >
      <p className="text-sm font-medium leading-[1.5] text-text-secondary">{withRial(body)}</p>
    </Modal>
  )
}

/** Decision 3: an administrator adds the account money leaves from without leaving the run. */
export function AddPayerAccountModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (account: PayerAccountDto) => void
}) {
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
    if (bic.trim() && !BIC_SHAPE.test(bic.trim().toUpperCase()))
      next.bic = t('paymentRuns.account.bicInvalid')
    setErrors(next)
    if (Object.keys(next).length > 0 || busy) return
    setBusy(true)
    setNotice(null)
    try {
      onAdded(
        await createPayerAccount({
          name: name.trim(),
          iban: iban.replace(/\s+/g, '').toUpperCase(),
          bic: bic.trim() ? bic.trim().toUpperCase() : null,
        }),
      )
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
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
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
        <TextField
          id="payer-name"
          name="name"
          label={t('paymentRuns.account.name')}
          required
          maxLength={140}
          value={name}
          onChange={setName}
          error={errors.name}
        />
        <TextField
          id="payer-iban"
          name="iban"
          label={t('paymentRuns.account.iban')}
          required
          maxLength={42}
          value={iban}
          onChange={setIban}
          error={errors.iban}
        />
        <TextField
          id="payer-bic"
          name="bic"
          label={t('paymentRuns.account.bic')}
          maxLength={11}
          value={bic}
          onChange={setBic}
          error={errors.bic}
        />
      </div>
    </Modal>
  )
}

/**
 * The run's "3 Dot" menu (Figma 163:24153): this run, start again, delete.
 *
 * Copying, resetting and deleting are the API's own calls. A spreadsheet export and a remittance
 * e-mail have nothing behind them yet: each says so when chosen.
 */
export function RunMenu({
  run,
  items,
  onNotice,
  onChanged,
}: {
  run: PaymentRunDto
  items: PaymentRunItemDto[]
  onNotice: (text: string) => void
  /** The run was reset or cancelled: reload it. */
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState<'reset' | 'delete' | null>(null)
  const editable = actionsFor(run.state).canCancel

  const notYet = () => onNotice(t('paymentRuns.menu.notYet'))

  const copy = async () => {
    try {
      const created = await createRun({ currency: run.currency })
      const suppliers = new Set(items.map((item) => item.supplierId).filter(Boolean))
      const offered = await loadCandidates(candidatesPath(created.id, run.currency, null))
      const fresh = offered
        .filter((bill) => bill.supplierId && suppliers.has(bill.supplierId))
        .map((bill) => bill.billId)
      if (fresh.length > 0) await addToRun(created.id, fresh)
      navigate(`/expenditure/payments/${created.id}`)
    } catch (error) {
      onNotice(refusalOf(error, t))
    }
  }

  const reset = async () => {
    try {
      for (const item of items) await removeFromRun(run.id, item.billId)
      setConfirming(null)
      onChanged()
    } catch (error) {
      setConfirming(null)
      onNotice(refusalOf(error, t))
    }
  }

  const remove = async () => {
    try {
      await cancelRun(run.id)
      setConfirming(null)
      onChanged()
    } catch (error) {
      setConfirming(null)
      onNotice(refusalOf(error, t))
    }
  }

  return (
    <>
      <ActionMenu
        label={t('paymentsInvoices.moreActions')}
        variant="bordered"
        wide
        floating
        items={[
          // TODO(backend): a spreadsheet of the run (every bill and transfer as .xlsx).
          {
            id: 'sheet',
            sectionKey: 'paymentRuns.menu.thisRun',
            labelKey: 'paymentRuns.menu.exportSheet',
            descriptionKey: 'paymentRuns.menu.exportSheetNote',
            icon: spreadsheetIcon,
            onSelect: notYet,
          },
          // TODO(backend): a remittance advice e-mail to each supplier in the run.
          {
            id: 'remit',
            labelKey: 'paymentRuns.menu.remittance',
            descriptionKey: 'paymentRuns.menu.remittanceNote',
            icon: emailIcon,
            onSelect: notYet,
          },
          {
            id: 'format',
            labelKey: 'paymentRuns.menu.changeFormat',
            descriptionKey: 'paymentRuns.menu.changeFormatNote',
            values: { format: t(formatLabelKey(run.format)) },
            icon: bankIcon,
            to: `/expenditure/payments/${run.id}#format`,
          },
          {
            id: 'copy',
            sectionKey: 'paymentRuns.menu.startAgain',
            labelKey: 'paymentRuns.menu.copyRun',
            descriptionKey: 'paymentRuns.menu.copyRunNote',
            icon: copyIcon,
            onSelect: () => void copy(),
          },
          ...(editable
            ? [
                {
                  id: 'reset',
                  labelKey: 'paymentRuns.menu.reset',
                  descriptionKey: 'paymentRuns.menu.resetNote',
                  icon: resetIcon,
                  onSelect: () => setConfirming('reset'),
                },
                {
                  id: 'delete',
                  labelKey: 'paymentRuns.menu.delete',
                  icon: deleteIcon,
                  danger: true,
                  onSelect: () => setConfirming('delete'),
                },
              ]
            : []),
        ]}
      />
      {confirming === 'reset' ? (
        <ConfirmModal
          title={t('paymentRuns.menu.resetTitle', { reference: run.reference })}
          body={t('paymentRuns.menu.resetBody')}
          confirm={t('paymentRuns.menu.reset')}
          onClose={() => setConfirming(null)}
          onConfirm={reset}
        />
      ) : null}
      {confirming === 'delete' ? (
        <ConfirmModal
          title={t('paymentRuns.confirmCancel.title', { reference: run.reference })}
          body={t('paymentRuns.confirmCancel.body')}
          confirm={t('paymentRuns.menu.delete')}
          danger
          onClose={() => setConfirming(null)}
          onConfirm={remove}
        />
      ) : null}
    </>
  )
}
