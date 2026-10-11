import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateField, Modal, RialMark, withRial } from '../../components/ui'
import { LoadingNotice, ApiReadFailure } from '../../components/feedback/ApiNotice'
import { selectAllOnFocus } from '../../components/invoice'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import {
  applyOverpaymentCredit,
  billListPath,
  loadBillPage,
  recordOverpaymentRefund,
  type BillDetailDto,
  type BillRowDto,
} from '../../api/expenditure/bills'
import { creditTargetsOf } from '../../lib/billDetail'
import { formatAmount } from '../../lib/format'

/** The credit note page's own field, so the two forms that settle a credit look alike. */
const FIELD =
  'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'
const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60'
const QUIET_BUTTON =
  'inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60'

const parsed = (value: string) => {
  const number = Number(value)
  return value.trim() !== '' && Number.isFinite(number) && number > 0 ? number : null
}

/** The amount as typed for the field, at the currency's three decimals and without separators. */
const typed = (amount: number) => (Math.round(amount * 1000) / 1000).toFixed(3)

/**
 * "Record the supplier's refund" (owner's answer 13, 8 Oct 2026): the money the supplier paid
 * back of what the bill was overpaid by. The form is the credit note page's refund form: the
 * amount (filled with what is still undecided, else all that was overpaid), the day it arrived
 * and an optional reference. The amount is checked against "Overpaid by" before asking.
 */
export function OverpaymentRefundModal({
  billId,
  currency,
  overpaid,
  suggested,
  today,
  refusal,
  onClose,
  onDone,
}: {
  billId: string
  currency: string
  overpaid: number
  suggested: number
  today: string
  refusal: (error: unknown) => string
  onClose: () => void
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [amount, setAmount] = useState(() => typed(suggested))
  const [refundedOn, setRefundedOn] = useState(today)
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const value = parsed(amount)
  const over = value !== null && value > overpaid

  const save = async () => {
    if (value === null || over || refundedOn === '') return
    setBusy(true)
    setFailure(null)
    try {
      await recordOverpaymentRefund(billId, {
        amount: value,
        refundedOn,
        reference: reference.trim() || null,
      })
      onDone()
    } catch (error) {
      setFailure(refusal(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('billDetail.overpaid.recordRefund')}
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={QUIET_BUTTON}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || value === null || over || refundedOn === ''}
            className={PRIMARY_BUTTON}
          >
            {busy ? t('common.saving') : t('supplierCreditNoteDetail.refundCta')}
          </button>
        </div>
      }
    >
      <p className="text-sm font-medium leading-[1.5] text-text-secondary">
        {t('supplierCreditNoteDetail.refundNote')}
      </p>
      <label className="mt-4 block">
        <span className="text-xs font-semibold text-text-quaternary">
          {t('supplierCreditNoteDetail.amount')}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.001"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onFocus={selectAllOnFocus}
          aria-invalid={over}
          className={`${FIELD} mt-1`}
        />
      </label>
      {over ? (
        <p role="alert" className="mt-1 text-sm font-medium text-warning-700">
          {withRial(
            t('billDetail.overpaid.tooMuch', {
              amount: `OMR ${formatAmount(overpaid, currency, language)}`,
            }),
          )}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-1">
        <span className="text-xs font-semibold text-text-quaternary">
          {t('supplierCreditNoteDetail.paidOn')}
        </span>
        <DateField
          value={refundedOn}
          onChange={setRefundedOn}
          max={today}
          ariaLabel={t('supplierCreditNoteDetail.paidOn')}
        />
      </div>
      <label className="mt-3 block">
        <span className="text-xs font-semibold text-text-quaternary">
          {t('supplierCreditNoteDetail.referenceOptional')}
        </span>
        <input
          type="text"
          maxLength={200}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          className={`${FIELD} mt-1`}
        />
      </label>
      {failure ? (
        <p role="alert" className="mt-3 text-sm font-medium text-warning-700">
          {failure}
        </p>
      ) : null}
    </Modal>
  )
}

/**
 * "Set against a bill": credit kept from this overpaid bill used on another bill of the same
 * supplier, in the same currency. The bill is searched for, not typed, as on the credit note
 * page's "Set against the bill": the server narrows to this supplier (`supplier_id`) and the
 * page then keeps only the bills that can take the credit ({@link creditTargetsOf}). The amount
 * is optional: left blank the server uses the largest that fits both the credit and the bill.
 */
export function OverpaymentApplyModal({
  detail,
  kept,
  refusal,
  onClose,
  onDone,
}: {
  detail: BillDetailDto
  kept: number
  refusal: (error: unknown) => string
  onClose: () => void
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const { bill } = detail
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<{ id: string; label: string; owes: number } | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const billsPath = billListPath({
    filter: 'ALL',
    q: search.trim(),
    source: null,
    sort: 'DUE_SOONEST',
    supplierId: bill.supplierId,
    page: 0,
    pageSize: 20,
  })
  const bills = useApiRead<Page<BillRowDto>>(bill.supplierId ? billsPath : null, () =>
    loadBillPage(billsPath),
  )
  const found =
    bills.read.status === 'ready' ? creditTargetsOf(detail, bills.read.data.items) : null

  const value = parsed(amount)
  const over = value !== null && value > kept
  const money = (figure: number) => formatAmount(figure, bill.currencyCode, language)

  const apply = async () => {
    if (!chosen || over) return
    setBusy(true)
    setFailure(null)
    try {
      await applyOverpaymentCredit(bill.id, chosen.id, value)
      onDone()
    } catch (error) {
      setFailure(refusal(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('billDetail.overpaid.setAgainst')}
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={QUIET_BUTTON}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy || chosen === null || over}
            className={PRIMARY_BUTTON}
          >
            {busy ? t('common.saving') : t('supplierCreditNoteDetail.applyCta')}
          </button>
        </div>
      }
    >
      {chosen ? (
        <p className="text-sm font-semibold text-text-secondary">
          {t('supplierCreditNoteDetail.chosen', { bill: chosen.label })}{' '}
          <button
            type="button"
            onClick={() => setChosen(null)}
            className="font-semibold text-primary-700 hover:underline"
          >
            {t('supplierCreditNoteDetail.change')}
          </button>
        </p>
      ) : (
        <>
          <label className="block">
            <span className="text-xs font-semibold text-text-quaternary">
              {t('supplierCreditNoteDetail.findBill')}
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={bill.supplierName ?? t('supplierCreditNoteDetail.findBillPlaceholder')}
              className={`${FIELD} mt-1`}
            />
          </label>
          <div className="mt-2 max-h-[260px] overflow-y-auto">
            {bills.read.status === 'loading' ? <LoadingNotice /> : null}
            {bills.read.status === 'failed' ? (
              <ApiReadFailure error={bills.read.error} retry={bills.retry} />
            ) : null}
            {found && found.length === 0 ? (
              <p className="text-sm font-medium text-text-quaternary">
                {bill.supplierName === null
                  ? t('supplierCreditNoteDetail.noBills')
                  : t('supplierCreditNoteDetail.noBillsForSupplier', {
                      supplier: bill.supplierName,
                    })}
              </p>
            ) : null}
            {found && found.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {found.map((row) => {
                  const label = row.supplierBillNumber ?? t('supplierCreditNotes.rows.unnumbered')
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setChosen({ id: row.id, label, owes: row.outstandingAmount })
                        }
                        className="w-full rounded-sm bg-white px-3 py-2 text-start text-sm font-medium text-text-secondary hover:bg-primary-50"
                      >
                        {label}
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-text-quaternary">
                          <RialMark className="w-3" />
                          {money(row.outstandingAmount)} {t('supplierCreditNoteDetail.stillOwed')}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        </>
      )}

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-text-quaternary">
          {t('supplierCreditNoteDetail.amountOptional')}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.001"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onFocus={selectAllOnFocus}
          placeholder={money(chosen ? Math.min(kept, chosen.owes) : kept)}
          aria-invalid={over}
          className={`${FIELD} mt-1`}
        />
      </label>
      {over ? (
        <p role="alert" className="mt-1 text-sm font-medium text-warning-700">
          {withRial(t('billDetail.overpaid.overKept', { amount: `OMR ${money(kept)}` }))}
        </p>
      ) : (
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {t('supplierCreditNoteDetail.amountBlankNote')}
        </p>
      )}
      {failure ? (
        <p role="alert" className="mt-3 text-sm font-medium text-warning-700">
          {failure}
        </p>
      ) : null}
    </Modal>
  )
}
