import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DateField } from '../ui'
import { Notice } from '../feedback/ApiNotice'
import { FieldLabel, SelectField, TextField } from '../form'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import { ApiError } from '../../api/errors'
import {
  confirmIntake,
  discardIntake,
  possibleDuplicateOf,
  type ConfirmedBillDto,
  type IntakeDto,
  type PossibleDuplicateDto,
} from '../../api/expenditure/billIntake'
import { loadSupplierOrders, supplierOrdersPath, type PurchaseOrderRowDto } from '../../api/expenditure/supplierRecord'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  CONFIRM_REFUSALS,
  CURRENCIES,
  billProblems,
  blankLine,
  fromIntake,
  linesTotals,
  toConfirmation,
  totalDisagrees,
  type BillField,
  type BillForm,
  type BillLine,
  type BillProblems,
} from '../../lib/billIntake'
import { formatAmount, formatDate } from '../../lib/format'
import { IntakeFilePreview } from './IntakeFilePreview'
import { SupplierPicker } from './SupplierPicker'
import plusIcon from '../../assets/bill-capture/plus.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import warnIcon from '../../assets/bills/match-warn.svg'

/** Orders a bill can still be matched against. */
const BILLABLE = new Set<PurchaseOrderRowDto['state']>(['SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'])

const REQUEST_FIELDS: Record<string, BillField> = {
  supplierName: 'supplier',
  supplierId: 'supplier',
  billNumber: 'billNumber',
  issueDate: 'issueDate',
  dueDate: 'dueDate',
  currency: 'currency',
  vat: 'vat',
  total: 'total',
}

/**
 * A supplier's bill, typed beside its file and confirmed into a payable. Shared by Upload a bill
 * and a supplier's Record a bill, which fixes the supplier.
 */
export function BillIntakeForm({
  intake,
  file,
  lockedSupplier,
  cancelTo,
  onSaved,
}: {
  intake: IntakeDto
  file: File
  lockedSupplier?: { id: string; name: string; vatNumber: string | null }
  cancelTo: string
  onSaved: (bill: ConfirmedBillDto) => void
}) {
  const { t, i18n } = useTranslation()
  const [form, setForm] = useState<BillForm>(() => {
    const filled = fromIntake(intake)
    return lockedSupplier ? { ...filled, supplierId: lockedSupplier.id, supplierName: lockedSupplier.name } : filled
  })
  const [vatNumber, setVatNumber] = useState<string | null>(lockedSupplier?.vatNumber ?? null)
  const [errors, setErrors] = useState<BillProblems>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<PossibleDuplicateDto | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const set = (patch: Partial<BillForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    // A changed supplier or number is a different question: the duplicate warning no longer applies.
    if ('supplierId' in patch || 'supplierName' in patch || 'billNumber' in patch) setDuplicate(null)
  }
  const setLine = (id: string, patch: Partial<BillLine>) => set({ lines: form.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)) })

  const totals = useMemo(() => linesTotals(form.lines), [form.lines])
  const disagrees = totalDisagrees(form)
  const extractedVat = intake.extracted?.supplierVatNumber?.trim().toUpperCase() ?? null
  const vatMatches = Boolean(form.supplierId && vatNumber && extractedVat && vatNumber.toUpperCase() === extractedVat)

  const ordersPath = form.supplierId ? supplierOrdersPath(form.supplierId, 0, 50) : null
  const orders = useApiRead<Page<PurchaseOrderRowDto>>(ordersPath, () => loadSupplierOrders(ordersPath!))
  const billable = orders.read.status === 'ready' ? orders.read.data.items.filter((order) => BILLABLE.has(order.state)) : []

  const money = (value: number | string, currency = form.currency) => formatAmount(value, currency, i18n.language)
  const error = (field: BillField) => (errors[field] ? t(errors[field]!) : undefined)

  const save = async (notDuplicateOf: string | null) => {
    if (inFlight.current) return
    const problems = billProblems(form, { needsNumber: true })
    setErrors(problems)
    if (Object.keys(problems).length > 0) {
      setNotice(t('billIntake.fixFirst'))
      return
    }
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      onSaved(await confirmIntake(intake.id, toConfirmation(form, { notDuplicateOf })))
    } catch (failure) {
      const same = possibleDuplicateOf(failure)
      if (same) {
        setDuplicate(same)
      } else if (failure instanceof ApiError && failure.code && CONFIRM_REFUSALS[failure.code]) {
        const refusal = CONFIRM_REFUSALS[failure.code]
        if (refusal.field) setErrors({ [refusal.field]: refusal.key })
        setNotice(refusal.field ? t('billIntake.fixFirst') : t(refusal.key))
      } else if (failure instanceof ApiError && failure.fieldErrors.length > 0) {
        const placed: BillProblems = {}
        for (const entry of failure.fieldErrors) {
          const field = entry.field.startsWith('lines') ? 'lines' : REQUEST_FIELDS[entry.field.split('.')[0]]
          if (field) placed[field] = field === 'lines' ? 'billIntake.error.lines' : 'billIntake.error.refused'
        }
        setErrors(placed)
        setNotice(t('billIntake.fixFirst'))
      } else {
        const described = describeApiFailure(failure)
        setNotice(t(described.key, described.values))
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const discard = async () => {
    // Best effort: an intake left behind is listed as unconfirmed, not lost.
    await discardIntake(intake.id).catch(() => undefined)
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save(null)
      }}
      className="flex flex-col gap-4 xl:flex-row"
    >
      <IntakeFilePreview file={file} filledFromXml={intake.extractionStatus === 'EXTRACTED'} />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <p className="rounded-sm bg-primary-25 px-4 py-3 text-sm font-medium leading-[1.4] text-text-secondary">
          {intake.extractionStatus === 'EXTRACTED' ? t('billIntake.checkFilled') : t('billIntake.typeItIn')}
        </p>
        {notice ? <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

        <section className="rounded-md bg-surface-card p-5">
          <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('uploadBill.whoSentIt')}</h2>
          <div className="mt-4 flex flex-col gap-1.5">
            <FieldLabel label={t('billIntake.supplier')} required htmlFor="bill-supplier" />
            {lockedSupplier ? (
              <p id="bill-supplier" className="text-base font-semibold text-text-primary">
                {lockedSupplier.name}
              </p>
            ) : (
              <SupplierPicker
                id="bill-supplier"
                value={{ id: form.supplierId, name: form.supplierName, vatNumber }}
                onPick={(picked) => {
                  setVatNumber(picked.vatNumber)
                  set({ supplierId: picked.id, supplierName: picked.name, purchaseOrderId: '' })
                }}
                error={error('supplier')}
              />
            )}
            {vatMatches ? <p className="text-xs font-medium text-success-700">{t('uploadBill.vatMatches')}</p> : null}
            {!form.supplierId && extractedVat ? (
              <p className="text-xs font-medium text-text-tertiary">{t('billIntake.vatOnFile', { vat: extractedVat })}</p>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              id="bill-number"
              name="billNumber"
              label={t('uploadBill.billNumber')}
              required
              maxLength={200}
              value={form.billNumber}
              onChange={(billNumber) => set({ billNumber })}
              error={error('billNumber')}
            />
            <SelectField
              id="bill-currency"
              name="currency"
              label={t('billIntake.currency')}
              required
              options={[...CURRENCIES]}
              value={form.currency}
              onChange={(currency) => set({ currency })}
              error={error('currency')}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('uploadBill.billDate')} required />
              <DateField value={form.issueDate} onChange={(issueDate) => set({ issueDate })} ariaLabel={t('uploadBill.billDate')} />
              {error('issueDate') ? (
                <p role="alert" className="text-xs font-medium text-text-danger">
                  {error('issueDate')}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('uploadBill.paymentDue')} />
              <DateField value={form.dueDate} onChange={(dueDate) => set({ dueDate })} ariaLabel={t('uploadBill.paymentDue')} min={form.issueDate || undefined} />
              {error('dueDate') ? (
                <p role="alert" className="text-xs font-medium text-text-danger">
                  {error('dueDate')}
                </p>
              ) : (
                <p className="text-xs font-medium text-text-quaternary">{t('billIntake.dueHint')}</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-md bg-surface-card p-5">
          <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('uploadBill.whatTheyCharged')}</h2>
          <p className="mt-1 text-sm font-medium text-text-quaternary">{t('billIntake.linesOptional')}</p>

          {form.lines.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                    <th className="pb-2 text-start font-semibold">{t('uploadBill.col.description')}</th>
                    <th className="pb-2 text-end font-semibold">{t('uploadBill.col.qty')}</th>
                    <th className="pb-2 text-end font-semibold">{t('uploadBill.col.rate')}</th>
                    <th className="pb-2 text-end font-semibold">{t('billIntake.vatPercent')}</th>
                    <th className="pb-2 text-end font-semibold">{t('uploadBill.col.amount')}</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, index) => (
                    <tr key={line.id}>
                      <td className="py-1.5 pe-2">
                        <input
                          value={line.description}
                          onChange={(event) => setLine(line.id, { description: event.target.value })}
                          aria-label={t('uploadBill.col.description')}
                          maxLength={500}
                          className="h-[42px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-3 text-sm font-medium text-text-secondary outline-none"
                        />
                      </td>
                      {(['quantity', 'unitPrice', 'vatRate'] as const).map((key) => (
                        <td key={key} className="px-1 py-1.5">
                          <input
                            value={line[key]}
                            inputMode="decimal"
                            onChange={(event) => setLine(line.id, { [key]: event.target.value })}
                            aria-label={t(`billIntake.lineField.${key}`)}
                            className="h-[42px] w-[80px] rounded-sm border border-primary-300 bg-surface-tab-bar px-2 text-end text-sm font-medium text-text-secondary outline-none"
                          />
                        </td>
                      ))}
                      <td className="ps-1 py-1.5 text-end text-sm font-semibold text-text-secondary tabular-nums">{totals?.lineNets[index]}</td>
                      <td className="ps-1 py-1.5">
                        <button
                          type="button"
                          onClick={() => set({ lines: form.lines.filter((other) => other.id !== line.id) })}
                          aria-label={t('uploadBill.removeLine')}
                          className="inline-flex size-8 items-center justify-center rounded-sm hover:bg-surface-background"
                        >
                          <img src={deleteIcon} alt="" className="size-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {error('lines') ? (
            <p role="alert" className="mt-2 text-xs font-medium text-text-danger">
              {error('lines')}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => set({ lines: [...form.lines, blankLine()] })}
            className="mt-3 inline-flex h-[42px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={plusIcon} alt="" className="size-4" />
            {t('uploadBill.addLine')}
          </button>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextField
              id="bill-vat"
              name="vat"
              label={t('billIntake.vatAmount')}
              inputMode="decimal"
              value={form.vat}
              onChange={(vat) => set({ vat })}
              error={error('vat')}
            />
            <TextField
              id="bill-total"
              name="total"
              label={t('billIntake.totalOnBill')}
              required
              inputMode="decimal"
              value={form.total}
              onChange={(total) => set({ total })}
              error={error('total')}
            />
          </div>

          {totals ? (
            <div className={['mt-4 rounded-sm px-3.5 py-3', disagrees ? 'bg-[#faf5ea]' : 'bg-success-100'].join(' ')}>
              <p className={['flex flex-wrap items-center gap-2 text-xs font-medium leading-[1.4]', disagrees ? 'text-[#887147]' : 'text-success-700'].join(' ')}>
                {disagrees ? <img src={warnIcon} alt="" className="size-4 shrink-0" /> : null}
                <span>
                  {disagrees
                    ? t('billIntake.linesDisagree', { lines: money(totals.total), vat: money(totals.vat) })
                    : form.total.trim()
                      ? t('billIntake.addsUp')
                      : t('billIntake.linesComeTo', { lines: money(totals.total), vat: money(totals.vat) })}
                </span>
                {disagrees || !form.total.trim() ? (
                  <button type="button" onClick={() => set({ total: totals.total, vat: totals.vat })} className="font-semibold text-primary-700 underline">
                    {t('billIntake.useLines')}
                  </button>
                ) : null}
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-md bg-surface-card p-5">
          <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('uploadBill.linkToOrder')}</h2>
          {form.supplierId ? (
            <div className="mt-4">
              <SelectField
                id="bill-order"
                name="purchaseOrderId"
                label={t('billIntake.order')}
                options={[
                  { value: '', label: t('billIntake.letItMatch') },
                  ...billable.map((order) => ({
                    value: order.id,
                    label: t('billIntake.orderOption', {
                      number: order.number ?? '—',
                      date: order.orderDate ? formatDate(order.orderDate, i18n.language) : '—',
                      total: order.totalGross === null ? '—' : money(order.totalGross, order.currency),
                    }),
                  })),
                ]}
                value={form.purchaseOrderId}
                onChange={(purchaseOrderId) => set({ purchaseOrderId })}
                hint={t(form.purchaseOrderId ? 'billIntake.matchedByHand' : 'billIntake.matcherLooks')}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm font-medium leading-[1.4] text-text-tertiary">{t('billIntake.orderNeedsSupplier')}</p>
          )}
        </section>

        {duplicate ? (
          <section role="alert" className="rounded-md border border-[#d8c9a8] bg-[#faf5ea] p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <img src={warnIcon} alt="" className="size-5" />
              {t('billIntake.duplicate.title')}
            </h2>
            <p className="mt-2 text-sm font-medium leading-[1.5] text-text-secondary">
              {t('billIntake.duplicate.body', {
                number: duplicate.supplierBillNumber,
                date: duplicate.issueDate ? formatDate(duplicate.issueDate, i18n.language) : '—',
                total: duplicate.total === null ? '—' : `${money(duplicate.total, duplicate.currencyCode ?? form.currency)} ${duplicate.currencyCode ?? form.currency}`,
                source: t(`billIntake.duplicate.source.${duplicate.source}`),
              })}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to={`/expenditure/bills/${duplicate.billId}`}
                className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
              >
                {t('billIntake.duplicate.open')}
              </Link>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(duplicate.billId)}
                className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
              >
                {t('billIntake.duplicate.different')}
              </button>
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          <Link
            to={cancelTo}
            onClick={() => void discard()}
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('billIntake.discard')}
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
          >
            {busy ? t('billIntake.saving') : t('uploadBill.saveBill')}
          </button>
        </div>
      </div>
    </form>
  )
}
