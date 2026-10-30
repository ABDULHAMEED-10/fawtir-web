import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DateField, Rial, Select, withRial } from '../ui'
import { Notice } from '../feedback/ApiNotice'
import { FieldLabel, TextField } from '../form'
import { selectAllOnFocus } from '../invoice'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import { ApiError } from '../../api/errors'
import {
  confirmIntake,
  discardIntake,
  possibleDuplicateOf,
  updateIntake,
  type ConfirmedBillDto,
  type IntakeDocumentTypeDto,
  type IntakeDto,
  type PossibleDuplicateDto,
} from '../../api/expenditure/billIntake'
import {
  loadSupplierOrders,
  supplierOrdersPath,
  type PurchaseOrderRowDto,
} from '../../api/expenditure/supplierRecord'
import { loadSupplierPage, supplierListPath } from '../../api/expenditure/suppliers'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  BILL_CONFIRM_REFUSALS,
  CURRENCIES,
  billProblems,
  billTaxCategories,
  blankLine,
  confidentCount,
  fileKindOf,
  fromIntake,
  linesTotals,
  notReadReason,
  rateOfCategory,
  readingOf,
  savedDetails,
  supplierWithVat,
  toConfirmation,
  toCorrections,
  totalDisagrees,
  type BillField,
  type BillForm,
  type BillLine,
  type BillProblems,
  type ReadField,
  unsureFields,
} from '../../lib/billIntake'
import { formatAmount, formatDate } from '../../lib/format'
import { DESIGN_REFERENCE } from '../../lib/invoiceDraft'
import { useReferenceData } from '../../lib/reference/referenceData'
import { IntakeFilePreview } from './IntakeFilePreview'
import { SupplierPicker } from './SupplierPicker'
import fileIcon from '../../assets/bill-capture/file.svg'
import okCheckIcon from '../../assets/bill-detail/tick.svg'
import orderDocIcon from '../../assets/create-invoice/doc-order.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import matchOkIcon from '../../assets/bills/match-ok.svg'

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

/** What a change to the form settles: the read field it overwrites, so its amber goes. */
const SETTLES: Partial<Record<keyof BillForm, ReadField[]>> = {
  supplierId: ['supplierName', 'supplierVatNumber'],
  supplierName: ['supplierName'],
  billNumber: ['billNumber'],
  issueDate: ['issueDate'],
  dueDate: ['dueDate'],
  currency: ['currency'],
  vat: ['vat'],
  total: ['total'],
}

/** A box drawn amber (as `Select` and `DateField` draw `unsure`): read, not sure, not yet typed. */
const amber = (classes: string, unsure: boolean | undefined) =>
  unsure
    ? classes
        .replace('border-primary-300', 'border-[#d8c9a8]')
        .replace('bg-surface-tab-bar', 'bg-[#faf5ea]')
    : classes

/** The 42px figure box on a line, and the 50px one on the totals. */
const LINE_INPUT =
  'h-[42px] rounded-sm border border-primary-300 bg-surface-tab-bar px-2 text-end text-sm font-medium text-text-secondary outline-none focus:border-primary-700'
const TOTAL_INPUT =
  'h-[42px] w-[140px] rounded-sm border border-primary-300 bg-surface-tab-bar px-3 text-end font-semibold text-text-primary outline-none tabular-nums focus:border-primary-700'

/**
 * A line's VAT as a category, in the cell the rate box had: closed it reads "5% S", open it names
 * each of Oman's four in full (PINT-OM CL-04-OM). Picking one sets the line's rate from it.
 */
export function LineTaxSelect({
  line,
  onChange,
  ariaLabel,
}: {
  line: BillLine
  onChange: (patch: Partial<BillLine>) => void
  ariaLabel: string
}) {
  const { t } = useTranslation()
  const categories = billTaxCategories(useReferenceData() ?? DESIGN_REFERENCE)
  return (
    <Select
      value={line.taxCategoryCode ?? ''}
      onChange={(code) =>
        onChange({ taxCategoryCode: code, vatRate: rateOfCategory(categories, code) })
      }
      options={categories.map((category) => ({
        value: category.code,
        label: t(`createInvoice.taxCategories.${category.code}`, { defaultValue: category.code }),
        // The VAT column is narrow: the rate alone for standard lines, the category letter for the rest.
        shortLabel:
          category.en16931Category === 'S' ? `${Number(category.rate)}%` : category.en16931Category,
      }))}
      placeholder={`${line.vatRate}%`}
      panelWidth={240}
      compact
      tight
      ariaLabel={ariaLabel}
      unsure={line.unsure}
    />
  )
}

function Note({ tone, children }: { tone: 'warn' | 'ok' | 'info'; children: React.ReactNode }) {
  const icon = tone === 'warn' ? warnIcon : tone === 'ok' ? matchOkIcon : okCheckIcon
  return (
    <p
      className={[
        'flex items-start gap-1.5 text-xs font-medium leading-[1.4]',
        tone === 'warn'
          ? 'text-[#887147]'
          : tone === 'ok'
            ? 'text-success-700'
            : 'text-text-tertiary',
      ].join(' ')}
    >
      <img src={icon} alt="" className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * A supplier's bill, checked or typed beside its file and confirmed into a payable (Figma
 * 163:22397). Shared by Upload a bill and a supplier's Record a bill, which fixes the supplier.
 */
export function BillIntakeForm({
  intake,
  file,
  lockedSupplier,
  cancelTo,
  onSaved,
  onKept,
  onReplace,
  documentTypeCode = '380',
  readSeconds,
}: {
  intake: IntakeDto
  file: File
  /**
   * How long the upload took as the browser measured it, which with reading on is the read
   * ("read in 3 seconds", EXPENDITURE.md 1.6). Unknown for an upload resumed later.
   */
  readSeconds?: number
  lockedSupplier?: { id: string; name: string; vatNumber: string | null }
  cancelTo: string
  onSaved: (bill: ConfirmedBillDto) => void
  /**
   * Where to go once a half-typed bill is saved on the intake for later (`PUT`). Offered only
   * when the caller can bring the person back to it: the Bills page lists unconfirmed uploads.
   */
  onKept?: () => void
  /** "Replace the file": the caller discards this upload and shows the picker again. */
  onReplace?: () => void
  /**
   * What is being confirmed. The same form serves all three because the fields are the same,
   * a supplier, a number, a date, lines and a total, but the type decides which way the money
   * points, so it is stated by the caller rather than guessed from the file.
   */
  documentTypeCode?: IntakeDocumentTypeDto
}) {
  const { t, i18n } = useTranslation()
  const [form, setForm] = useState<BillForm>(() => {
    const filled = fromIntake(intake)
    return lockedSupplier
      ? { ...filled, supplierId: lockedSupplier.id, supplierName: lockedSupplier.name }
      : filled
  })
  const [vatNumber, setVatNumber] = useState<string | null>(lockedSupplier?.vatNumber ?? null)
  const [errors, setErrors] = useState<BillProblems>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<PossibleDuplicateDto | null>(null)
  const [busy, setBusy] = useState<'confirm' | 'keep' | null>(null)
  const [dismissedOrders, setDismissedOrders] = useState<string[]>([])
  /** The read fields still amber: unsure on the file and not typed over since (rows 1.6, 1.10). */
  const [unsure, setUnsure] = useState<Set<ReadField>>(() => unsureFields(intake))
  const inFlight = useRef(false)

  const set = (patch: Partial<BillForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    const settled = (Object.keys(patch) as (keyof BillForm)[]).flatMap((key) => SETTLES[key] ?? [])
    if (settled.some((field) => unsure.has(field)))
      setUnsure((current) => new Set([...current].filter((field) => !settled.includes(field))))
    // A changed supplier or number is a different question: the duplicate warning no longer applies.
    if ('supplierId' in patch || 'supplierName' in patch || 'billNumber' in patch)
      setDuplicate(null)
  }
  const setLine = (id: string, patch: Partial<BillLine>) =>
    set({
      lines: form.lines.map((line) =>
        line.id === id ? { ...line, ...patch, unsure: false } : line,
      ),
    })

  const totals = useMemo(() => linesTotals(form.lines), [form.lines])
  const disagrees = totalDisagrees(form)
  const extractedVat = intake.extracted?.supplierVatNumber?.trim().toUpperCase() ?? null

  // DB-12: a file whose VAT number is a supplier's on the list starts with that supplier picked,
  // instead of naming the number beside an empty picker. Asked once, through the picker's own
  // search; a person's pick is never replaced, and a failed lookup, or one that finds none or
  // several, only leaves the picker as it was, so the lookup's errors are deliberately dropped.
  // The supplier and its VAT number are set together or not at all: `vatMatches` compares them, so
  // a VAT number beside another supplier would claim a match that is not there.
  const picked = useRef(false)
  const startedWithSupplier = useRef(Boolean(form.supplierId))
  const lockedId = lockedSupplier?.id ?? null
  useEffect(() => {
    if (lockedId || !extractedVat) return
    let active = true
    loadSupplierPage(
      supplierListPath({ filter: 'ACTIVE', q: extractedVat, sort: 'NAME', page: 0, pageSize: 20 }),
    ).then(
      (page) => {
        // The search matches part of a name, VAT number or participant ID: with more rows than
        // one page holds, a second supplier with this VAT number could be past it.
        if (page.total === null || page.total > page.items.length) return
        const match = supplierWithVat(page.items, extractedVat)
        if (!active || picked.current || startedWithSupplier.current || !match) return
        setVatNumber(match.vatNumber)
        setForm((current) => ({
          ...current,
          supplierId: match.id,
          supplierName: match.displayName,
          purchaseOrderId: '',
        }))
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [lockedId, extractedVat])

  const vatMatches = Boolean(
    form.supplierId && vatNumber && extractedVat && vatNumber.toUpperCase() === extractedVat,
  )
  const read = intake.extractionStatus === 'EXTRACTED'
  const reading = readingOf(intake)
  const notRead = notReadReason(intake)
  // The design's "2 fields still to check": what the server would still refuse, counted live.
  const toCheck = Object.keys(billProblems(form, { needsNumber: true })).length

  const ordersPath = form.supplierId ? supplierOrdersPath(form.supplierId, 0, 50) : null
  const orders = useApiRead<Page<PurchaseOrderRowDto>>(ordersPath, () =>
    loadSupplierOrders(ordersPath!),
  )
  const billable =
    orders.read.status === 'ready'
      ? orders.read.data.items.filter((order) => BILLABLE.has(order.state))
      : []
  const linked = billable.find((order) => order.id === form.purchaseOrderId) ?? null
  // TODO(backend): the design suggests the order the matcher thinks fits ("Same supplier, same
  // two bag sizes…"); the API only lists the supplier's open orders, so the newest one is offered.
  const suggestion = linked
    ? null
    : (billable.find((order) => !dismissedOrders.includes(order.id)) ?? null)

  // The rial sign stands for OMR only; a bill in another currency names it after the figure.
  const isOmr = form.currency === 'OMR'
  const money = (value: number | string, currency = form.currency) =>
    formatAmount(value, currency, i18n.language)
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
    setBusy('confirm')
    setNotice(null)
    try {
      onSaved(
        await confirmIntake(intake.id, toConfirmation(form, { notDuplicateOf, documentTypeCode })),
      )
    } catch (failure) {
      refuse(failure)
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  /** Save what is typed so far on the intake and leave; the rest is filled in on coming back. */
  const keep = async () => {
    if (inFlight.current || !onKept) return
    const problems = billProblems(form, { needsNumber: false, partial: true })
    setErrors(problems)
    if (Object.keys(problems).length > 0) {
      setNotice(t('billIntake.fixFirst'))
      return
    }
    inFlight.current = true
    setBusy('keep')
    setNotice(null)
    try {
      await updateIntake(intake.id, { extracted: toCorrections(form, vatNumber), documentTypeCode })
      onKept()
    } catch (failure) {
      refuse(failure)
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  // The refusals are the intake's, not the action's: a confirm and a save-for-later fail the same
  // ways, a field the server will not take, an intake already confirmed or gone. The update's
  // field paths sit under `extracted.`, which is stripped so they land on the same inputs.
  const refuse = (failure: unknown) => {
    const same = possibleDuplicateOf(failure)
    if (same) {
      setDuplicate(same)
    } else if (failure instanceof ApiError && failure.code && Object.hasOwn(BILL_CONFIRM_REFUSALS, failure.code)) {
      const refusal = BILL_CONFIRM_REFUSALS[failure.code]
      if (refusal.field) setErrors({ [refusal.field]: refusal.key })
      setNotice(refusal.field ? t('billIntake.fixFirst') : t(refusal.key))
    } else if (failure instanceof ApiError && failure.fieldErrors.length > 0) {
      const placed: BillProblems = {}
      for (const entry of failure.fieldErrors) {
        const path = entry.field.replace(/^extracted\./, '')
        const field = path.startsWith('lines') ? 'lines' : REQUEST_FIELDS[path.split('.')[0]]
        if (field)
          placed[field] = field === 'lines' ? 'billIntake.error.lines' : 'billIntake.error.refused'
      }
      setErrors(placed)
      setNotice(t('billIntake.fixFirst'))
    } else {
      const described = describeApiFailure(failure)
      setNotice(t(described.key, described.values))
    }
  }

  const discard = async () => {
    // Best effort: an intake left behind is listed as unconfirmed, not lost.
    await discardIntake(intake.id).catch(() => undefined)
  }

  const size = formatBytes(intake.byteSize || file.size)
  const counted = confidentCount(intake)
  const fileMeta =
    reading && counted && reading.pageCount !== null && readSeconds !== undefined
      ? // The design's sentence, whole: "1 page · 248 KB · read in 3 seconds · 11 of 13 fields confident".
        t('uploadBill.fileMeta', {
          count: reading.pageCount,
          size,
          seconds: Math.max(1, Math.round(readSeconds)),
          ...counted,
        })
      : [
          ...(reading && reading.pageCount !== null
            ? [t('billIntake.reading.pages', { count: reading.pageCount })]
            : []),
          size,
          reading && counted
            ? t('billIntake.reading.confident', counted)
            : read
              ? t('billIntake.file.readFields', {
                  read: Object.values(intake.extracted?.confidence ?? {}).filter(Boolean).length,
                })
              : savedDetails(intake)
                ? t('billIntake.file.savedEarlier')
                : t(
                    fileKindOf(file) === 'xml'
                      ? 'billIntake.file.xmlNotRead'
                      : 'billIntake.file.notRead',
                  ),
        ].join(' · ')

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save(null)
      }}
      className="flex flex-col gap-4"
    >
      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
            <img src={fileIcon} alt="" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-[1.2] text-text-primary">
              {file.name}
            </p>
            <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">{fileMeta}</p>
            {notRead ? (
              // Why it was not read, when that is something the person can act on.
              <p className="mt-1 text-xs font-medium leading-[1.3] text-[#887147]">
                {t(
                  notRead === 'dailyLimit'
                    ? 'billIntake.reading.dailyLimit'
                    : 'apiErrors.planFeatureNotIncluded.receiptScan',
                )}
              </p>
            ) : null}
          </div>
        </div>
        {onReplace ? (
          <button
            type="button"
            onClick={onReplace}
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('uploadBill.replaceFile')}
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <IntakeFilePreview
          file={file}
          filledFromXml={read}
          pageCount={reading?.pageCount ?? undefined}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t('uploadBill.whoSentIt')}
            </h2>
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
                  onPick={(chosen) => {
                    picked.current = true
                    setVatNumber(chosen.vatNumber)
                    set({ supplierId: chosen.id, supplierName: chosen.name, purchaseOrderId: '' })
                  }}
                  error={error('supplier')}
                  unsure={!form.supplierId && unsure.has('supplierName')}
                />
              )}
              {vatMatches ? (
                <Note tone="info">{t('uploadBill.vatMatches')}</Note>
              ) : !form.supplierId && extractedVat ? (
                <Note tone="info">{t('billIntake.vatOnFile', { vat: extractedVat })}</Note>
              ) : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <TextField
                id="bill-number"
                name="billNumber"
                label={t('uploadBill.billNumber')}
                required
                maxLength={200}
                value={form.billNumber}
                onChange={(billNumber) => set({ billNumber })}
                error={error('billNumber')}
                unsure={unsure.has('billNumber')}
              />
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('uploadBill.billDate')} required />
                <DateField
                  value={form.issueDate}
                  onChange={(issueDate) => set({ issueDate })}
                  ariaLabel={t('uploadBill.billDate')}
                  unsure={unsure.has('issueDate')}
                />
                {error('issueDate') ? (
                  <p role="alert" className="text-xs font-medium text-text-danger">
                    {error('issueDate')}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('uploadBill.paymentDue')} />
                <DateField
                  value={form.dueDate}
                  onChange={(dueDate) => set({ dueDate })}
                  ariaLabel={t('uploadBill.paymentDue')}
                  min={form.issueDate || undefined}
                  unsure={unsure.has('dueDate')}
                />
                {error('dueDate') ? (
                  <p role="alert" className="text-xs font-medium text-text-danger">
                    {error('dueDate')}
                  </p>
                ) : null}
              </div>
            </div>
            {!error('dueDate') ? (
              <div className="mt-3">
                <Note tone={form.dueDate ? 'info' : 'warn'}>
                  {form.dueDate ? t('billIntake.dueHint') : t('uploadBill.noDueDate')}
                </Note>
              </div>
            ) : null}
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('uploadBill.whatTheyCharged')}
              </h2>
              <label className="flex items-center gap-2 text-sm font-medium text-text-tertiary">
                {t('billIntake.currency')}
                <span className="w-[120px]">
                  <Select
                    value={form.currency}
                    onChange={(currency) => set({ currency })}
                    options={CURRENCIES.map((code) => ({ value: code, label: code }))}
                    ariaLabel={t('billIntake.currency')}
                    compact
                    unsure={unsure.has('currency')}
                  />
                </span>
              </label>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                    <th className="pb-2 text-start font-semibold">
                      {t('uploadBill.col.description')}
                    </th>
                    <th className="pb-2 text-end font-semibold">{t('uploadBill.col.qty')}</th>
                    <th className="pb-2 text-end font-semibold">{t('uploadBill.col.rate')}</th>
                    <th className="pb-2 text-end font-semibold">{t('uploadBill.col.vat')}</th>
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
                          onChange={(event) =>
                            setLine(line.id, { description: event.target.value })
                          }
                          aria-label={t('uploadBill.col.description')}
                          maxLength={500}
                          className={amber(
                            'h-[42px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-700',
                            line.unsure,
                          )}
                        />
                      </td>
                      {(['quantity', 'unitPrice'] as const).map((key) => (
                        <td key={key} className="px-1 py-1.5">
                          <span className="relative block w-[72px]">
                            <input
                              value={line[key]}
                              inputMode="decimal"
                              onFocus={selectAllOnFocus}
                              onChange={(event) => setLine(line.id, { [key]: event.target.value })}
                              aria-label={t(`billIntake.lineField.${key}`)}
                              className={[amber(LINE_INPUT, line.unsure), 'w-full'].join(' ')}
                            />
                          </span>
                        </td>
                      ))}
                      <td className="px-1 py-1.5">
                        <span className="relative block w-[72px]">
                          <LineTaxSelect
                            line={line}
                            onChange={(patch) => setLine(line.id, patch)}
                            ariaLabel={t('billIntake.lineField.vatRate')}
                          />
                        </span>
                      </td>
                      <td className="ps-1 py-1.5">
                        <span className="flex h-[42px] w-[92px] items-center justify-end rounded-sm border border-border-subtle bg-white px-2 text-sm font-semibold text-text-secondary tabular-nums">
                          {totals?.lineNets[index]}
                        </span>
                      </td>
                      <td className="ps-1 py-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            set({ lines: form.lines.filter((other) => other.id !== line.id) })
                          }
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

            <button
              type="button"
              onClick={() => set({ lines: [...form.lines, blankLine()] })}
              className="mt-3 inline-flex h-[42px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={plusIcon} alt="" className="size-4" />
              {t('uploadBill.addLine')}
            </button>

            <div className="mt-3">
              {error('lines') ? (
                <p role="alert" className="text-xs font-medium text-text-danger">
                  {error('lines')}
                </p>
              ) : (
                <Note tone="info">{t('billIntake.linesOptional')}</Note>
              )}
            </div>

            <dl className="mt-5 ms-auto flex w-full max-w-[360px] flex-col gap-2">
              <div className="flex items-center justify-between gap-4 py-1">
                <dt className="text-sm font-medium text-text-tertiary">{t('uploadBill.net')}</dt>
                <dd className="flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
                  {isOmr ? <Rial /> : null}
                  {totals ? money(totals.net) : t('billDetail.notStated')}
                  {totals && !isOmr ? ` ${form.currency}` : null}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt>
                  <label htmlFor="bill-vat" className="text-sm font-medium text-text-tertiary">
                    {t('billIntake.vatAmount')}
                  </label>
                </dt>
                <dd className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                  {isOmr ? <Rial /> : null}
                  <input
                    id="bill-vat"
                    name="vat"
                    inputMode="decimal"
                    value={form.vat}
                    onFocus={selectAllOnFocus}
                    onChange={(event) => set({ vat: event.target.value })}
                    aria-invalid={error('vat') ? true : undefined}
                    className={[
                      amber(TOTAL_INPUT, unsure.has('vat')),
                      'text-sm',
                      error('vat') ? 'ring-1 ring-border-danger' : '',
                    ].join(' ')}
                  />
                  {isOmr ? null : <span>{form.currency}</span>}
                </dd>
              </div>
              {error('vat') ? (
                <p role="alert" className="text-end text-xs font-medium text-text-danger">
                  {error('vat')}
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-4 border-t border-surface-background pt-3">
                <dt>
                  <label htmlFor="bill-total" className="text-base font-semibold text-text-primary">
                    {t('billIntake.totalOnBill')}
                    <span className="text-xl leading-4 text-primary-700">*</span>
                  </label>
                </dt>
                <dd className="flex items-center gap-2 text-[22px] font-semibold leading-[1.2] text-text-primary">
                  {isOmr ? <Rial /> : null}
                  <input
                    id="bill-total"
                    name="total"
                    inputMode="decimal"
                    required
                    value={form.total}
                    onFocus={selectAllOnFocus}
                    onChange={(event) => set({ total: event.target.value })}
                    aria-invalid={error('total') ? true : undefined}
                    className={[
                      amber(TOTAL_INPUT, unsure.has('total')),
                      'text-lg',
                      error('total') ? 'ring-1 ring-border-danger' : '',
                    ].join(' ')}
                  />
                  {isOmr ? null : <span>{form.currency}</span>}
                </dd>
              </div>
              {error('total') ? (
                <p role="alert" className="text-end text-xs font-medium text-text-danger">
                  {error('total')}
                </p>
              ) : null}
            </dl>

            {totals ? (
              <div
                className={[
                  'mt-4 rounded-sm px-3.5 py-3',
                  disagrees ? 'bg-[#faf5ea]' : 'bg-success-100',
                ].join(' ')}
              >
                <p
                  className={[
                    'flex flex-wrap items-center gap-2 text-xs font-medium leading-[1.4]',
                    disagrees ? 'text-[#887147]' : 'text-success-700',
                  ].join(' ')}
                >
                  <img
                    src={disagrees ? warnIcon : matchOkIcon}
                    alt=""
                    className="size-4 shrink-0"
                  />
                  <span>
                    {disagrees
                      ? t('billIntake.linesDisagree', {
                          lines: money(totals.total),
                          vat: money(totals.vat),
                        })
                      : form.total.trim()
                        ? t('billIntake.addsUp')
                        : t('billIntake.linesComeTo', {
                            lines: money(totals.total),
                            vat: money(totals.vat),
                          })}
                  </span>
                  {disagrees || !form.total.trim() ? (
                    <button
                      type="button"
                      onClick={() => set({ total: totals.total, vat: totals.vat })}
                      className="font-semibold text-primary-700 underline"
                    >
                      {t('billIntake.useLines')}
                    </button>
                  ) : null}
                </p>
              </div>
            ) : null}
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t('uploadBill.linkToOrder')}
            </h2>

            {!form.supplierId ? (
              <p className="mt-4 text-sm font-medium leading-[1.4] text-text-tertiary">
                {t('billIntake.orderNeedsSupplier')}
              </p>
            ) : linked || suggestion ? (
              <div
                className={[
                  'mt-4 flex flex-wrap items-center justify-between gap-4 rounded-sm border p-4',
                  linked ? 'border-success-700 bg-success-100' : 'border-primary-300 bg-primary-25',
                ].join(' ')}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white">
                    <img src={orderDocIcon} alt="" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-[1.2] text-text-primary">
                      {linked
                        ? t('uploadBill.linkedTo', { order: linked.number ?? linked.id })
                        : t('uploadBill.looksLike', {
                            order: suggestion!.number ?? suggestion!.id,
                          })}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-[1.4] text-text-tertiary">
                      {t('billIntake.orderOption', {
                        number: (linked ?? suggestion)!.number ?? '',
                        date: (linked ?? suggestion)!.orderDate
                          ? formatDate((linked ?? suggestion)!.orderDate!, i18n.language)
                          : '',
                        total:
                          (linked ?? suggestion)!.totalGross === null
                            ? ''
                            : money(
                                (linked ?? suggestion)!.totalGross!,
                                (linked ?? suggestion)!.currency,
                              ),
                      })}
                    </p>
                  </div>
                </div>
                {linked ? (
                  <button
                    type="button"
                    onClick={() => set({ purchaseOrderId: '' })}
                    className="shrink-0 text-sm font-semibold text-primary-700 hover:text-primary-800"
                  >
                    {t('uploadBill.unlink')}
                  </button>
                ) : (
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setDismissedOrders((current) => [...current, suggestion!.id])}
                      className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                    >
                      {t('uploadBill.notThisOne')}
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ purchaseOrderId: suggestion!.id })}
                      className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                    >
                      {t('uploadBill.linkIt')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm font-medium leading-[1.4] text-text-tertiary">
                {orders.read.status === 'loading'
                  ? t('billIntake.searching')
                  : billable.length === 0
                    ? t('billIntake.noOpenOrders')
                    : t('uploadBill.leftUnlinked')}
              </p>
            )}

            <p className="mt-3 flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-text-quaternary">
              <img src={okCheckIcon} alt="" className="mt-px size-4 shrink-0" />
              {t(form.purchaseOrderId ? 'billIntake.matchedByHand' : 'uploadBill.unlinkedHint')}
            </p>
          </section>

          {duplicate ? (
            <section role="alert" className="rounded-md border border-[#d8c9a8] bg-[#faf5ea] p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <img src={warnIcon} alt="" className="size-5" />
                {t('billIntake.duplicate.title')}
              </h2>
              <p className="mt-2 text-sm font-medium leading-[1.5] text-text-secondary">
                {withRial(
                  t('billIntake.duplicate.body', {
                    number: duplicate.supplierBillNumber,
                    date: duplicate.issueDate ? formatDate(duplicate.issueDate, i18n.language) : '',
                    total:
                      duplicate.total === null
                        ? ''
                        : `${money(duplicate.total, duplicate.currencyCode ?? form.currency)} ${duplicate.currencyCode ?? form.currency}`,
                    source: t(`billIntake.duplicate.source.${duplicate.source}`),
                  }),
                )}
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
                  disabled={busy !== null}
                  onClick={() => void save(duplicate.billId)}
                  className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
                >
                  {t('billIntake.duplicate.different')}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-card px-5 py-4 shadow-card">
        <p className="text-sm font-medium leading-[1.4] text-text-tertiary">
          <span className="font-semibold text-text-primary">
            {t('billIntake.footer.toCheck', { count: toCheck })}
          </span>
          {' · '}
          {t(read ? 'billIntake.footer.notReported' : 'billIntake.footer.notReported')}
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <Link
            to={cancelTo}
            onClick={() => void discard()}
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('billIntake.discard')}
          </Link>
          {onKept ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void keep()}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60"
            >
              {busy === 'keep' ? t('billIntake.saving') : t('billIntake.keep')}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy !== null}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
          >
            <img src={okCheckIcon} alt="" className="size-4 brightness-0 invert" />
            {busy === 'confirm' ? t('billIntake.saving') : t('uploadBill.saveBill')}
          </button>
        </div>
      </div>
    </form>
  )
}
