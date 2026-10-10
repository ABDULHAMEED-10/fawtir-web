import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Modal, RialMark, withRial } from '../../components/ui'
import { CheckboxRow, TextAreaField, TextField } from '../../components/form'
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
  type TakeOut,
} from '../../api/expenditure/paymentRuns'
import { formatAmount } from '../../lib/format'
import {
  BIC_SHAPE,
  actionsFor,
  ibanValid,
  markPaidBlockKey,
  refusalOf,
  sum,
  supplierTile,
} from '../../lib/paymentRuns'
import spreadsheetIcon from '../../assets/payment-run-menu/sheet.svg'
import emailIcon from '../../assets/payment-run-menu/email.svg'
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
  children,
}: {
  title: string
  body: string
  confirm: string
  danger?: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
  /** What the confirmation asks for beyond the sentence: a tick, a reason, bills to take out. */
  children?: ReactNode
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
      {children}
    </Modal>
  )
}

/**
 * Mark a run paid (owner, 8 Oct 2026; from a draft or scheduled run too since 9 Oct 2026): every
 * bill of the run is listed, and any can be taken out of the run with a reason, as it was not paid.
 * A bill the server says cannot be marked paid now (`markPaidBlock`) starts ticked, with why beside
 * it, as on the run page. With a bill
 * ticked the button reads "Mark the others paid"; with every bill ticked there is nothing left to
 * mark paid, so the button becomes the run's own "Cancel the run" and leads to that dialog instead.
 */
export function MarkPaidModal({
  run,
  items,
  onConfirm,
  onCancelInstead,
  onClose,
}: {
  run: PaymentRunDto
  items: PaymentRunItemDto[]
  onConfirm: (takeOut: TakeOut[]) => Promise<void>
  onCancelInstead: () => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(items.filter((item) => item.markPaidBlock).map((item) => item.billId)),
  )
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [missing, setMissing] = useState<Set<string>>(new Set())

  const everything = items.length > 0 && items.every((item) => ticked.has(item.billId))
  const paying = items.filter((item) => !ticked.has(item.billId))
  const amount = ticked.size === 0 ? run.netTotal : sum(paying.map((item) => item.amount))

  const toggle = (billId: string, on: boolean) => {
    setTicked((current) => {
      const next = new Set(current)
      if (on) next.add(billId)
      else next.delete(billId)
      return next
    })
    if (!on) setMissing((current) => new Set([...current].filter((id) => id !== billId)))
  }

  const confirm = async () => {
    if (everything) {
      onCancelInstead()
      return
    }
    const takeOut = items
      .filter((item) => ticked.has(item.billId))
      .map((item) => ({ billId: item.billId, reason: (reasons[item.billId] ?? '').trim() }))
    const unexplained = new Set(
      takeOut.filter((entry) => !entry.reason).map((entry) => entry.billId),
    )
    setMissing(unexplained)
    if (unexplained.size > 0) return
    await onConfirm(takeOut)
  }

  return (
    <ConfirmModal
      title={t('paymentRuns.confirmPaid.title', { reference: run.reference })}
      body={t('paymentRuns.confirmPaid.body', {
        // The code before the figure, so the sign drawn in its place stands before it, as
        // everywhere else in the app (owner, 9 Oct 2026).
        amount: `${run.currency} ${formatAmount(amount, run.currency, i18n.language)}`,
      })}
      confirm={
        everything
          ? t('paymentRuns.cancel')
          : ticked.size > 0
            ? t('paymentRuns.markOthersPaid')
            : t('paymentRuns.markPaid')
      }
      danger={everything}
      onClose={onClose}
      onConfirm={confirm}
    >
      {items.length > 0 ? (
        <ul className="mt-5 overflow-hidden rounded-sm border border-border-subtle">
          {items.map((item, index) => {
            const on = ticked.has(item.billId)
            const block = markPaidBlockKey(item.markPaidBlock?.code)
            return (
              <li
                key={item.billId}
                className={[
                  'flex flex-col gap-3 px-4 py-3',
                  index > 0 ? 'border-t border-border-subtle' : '',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                      {item.supplierBillNumber ?? t('paymentRuns.unnumbered')}
                    </p>
                    <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">
                      {item.supplierName ?? t('paymentRuns.noSupplier')}
                    </p>
                    {block ? <MarkPaidBlockChip label={t(block)} /> : null}
                  </div>
                  <div className="ms-auto">
                    <Amount value={item.amount} currency={run.currency} />
                  </div>
                </div>
                <CheckboxRow
                  id={`take-out-${item.billId}`}
                  name={`takeOut-${item.billId}`}
                  label={t('paymentRuns.takeOutOfRun')}
                  checked={on}
                  onChange={(next) => toggle(item.billId, next)}
                />
                {on ? (
                  <TextAreaField
                    id={`take-out-reason-${item.billId}`}
                    name={`takeOutReason-${item.billId}`}
                    label={t('billDetail.reject.reason')}
                    rows={2}
                    minHeightClass="min-h-[64px]"
                    maxLength={1000}
                    value={reasons[item.billId] ?? ''}
                    onChange={(next) =>
                      setReasons((current) => ({ ...current, [item.billId]: next }))
                    }
                    error={missing.has(item.billId) ? t('validation.required') : undefined}
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </ConfirmModal>
  )
}

/**
 * Why a bill in a live run cannot be marked paid now (`markPaidBlock`): "On hold" and the like,
 * on its row of the run and in the Mark as paid dialog.
 */
export function MarkPaidBlockChip({ label }: { label: string }) {
  return (
    <span className="mt-1 inline-flex items-center rounded-sm bg-pending-100 px-3 py-1 text-[10px] font-medium leading-[1.2] text-pending-700">
      {label}
    </span>
  )
}

/**
 * Cancel a sent run (owner, 8 Oct 2026): only on the person's word that the bank paid nothing from
 * the file, and with a reason. Every bill goes back to "to pay".
 */
export function CancelSentRunModal({
  run,
  onConfirm,
  onClose,
}: {
  run: PaymentRunDto
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [paidNothing, setPaidNothing] = useState(false)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ tick?: boolean; reason?: boolean }>({})

  const confirm = async () => {
    const next = { tick: !paidNothing, reason: !reason.trim() }
    setErrors(next)
    if (next.tick || next.reason) return
    await onConfirm(reason.trim())
  }

  return (
    <ConfirmModal
      title={t('paymentRuns.confirmCancel.title', { reference: run.reference })}
      body={t('paymentRuns.confirmCancel.body')}
      confirm={t('paymentRuns.cancel')}
      danger
      onClose={onClose}
      onConfirm={confirm}
    >
      <div className="mt-5 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <CheckboxRow
            id="bank-paid-nothing"
            name="bankPaidNothing"
            label={t('paymentRuns.bankPaidNothing')}
            checked={paidNothing}
            onChange={(next) => {
              setPaidNothing(next)
              if (next) setErrors((current) => ({ ...current, tick: false }))
            }}
          />
          {errors.tick ? (
            <p className="text-xs font-medium leading-[1.2] text-text-danger" role="alert">
              {t('validation.required')}
            </p>
          ) : null}
        </div>
        <TextAreaField
          id="cancel-sent-reason"
          name="reason"
          label={t('billDetail.reject.reason')}
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={setReason}
          error={errors.reason ? t('validation.required') : undefined}
        />
      </div>
    </ConfirmModal>
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
 * e-mail have nothing behind them yet: each says so when chosen. "Change the bank format" is not
 * drawn: Fawtir makes no bank files (owner, 9 Oct 2026).
 */
export function RunMenu({
  run,
  items,
  onNotice,
  onChanged,
  onCancelSent,
}: {
  run: PaymentRunDto
  items: PaymentRunItemDto[]
  onNotice: (text: string) => void
  /** The run was reset or cancelled: reload it. */
  onChanged: () => void
  /**
   * Given only for a sent run and someone allowed to cancel it: the menu then offers "Cancel the
   * run", which asks the page for the bank-paid-nothing dialog.
   */
  onCancelSent?: () => void
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
      onNotice(refusalOf(error, t, 'add'))
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
          ...(run.state === 'EXPORTED' && onCancelSent
            ? [
                {
                  id: 'cancelSent',
                  labelKey: 'paymentRuns.cancel',
                  icon: deleteIcon,
                  danger: true,
                  onSelect: onCancelSent,
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
          // The run is cancelled, not deleted: the button says so, as the run's other cancel does.
          confirm={t('paymentRuns.cancel')}
          danger
          onClose={() => setConfirming(null)}
          onConfirm={remove}
        />
      ) : null}
    </>
  )
}
