import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, FileDropzone } from '../../components/ui'
import { FieldLabel, SelectField, TextField } from '../../components/form'
import { BillFilePicker, SupplierPicker, type PickedSupplier } from '../../components/bills'
import { Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { ApiError } from '../../api/errors'
import {
  INTAKE_MAX_BYTES,
  confirmIntake,
  discardIntake,
  possibleDuplicateOf,
  uploadIntake,
  type IntakeDto,
  type PossibleDuplicateDto,
} from '../../api/expenditure/billIntake'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  CONFIRM_REFUSALS,
  EXPENSE_CATEGORIES,
  RECEIPT_FILE_TYPES,
  UPLOAD_REFUSALS,
  billProblems,
  blankBillForm,
  fileKindOf,
  toConfirmation,
  vatIncluded,
  type BillForm,
  type BillProblems,
} from '../../lib/billIntake'
import { formatAmount, formatDate } from '../../lib/format'
import { muscatToday } from '../../lib/invoiceIssue'
import { can, useSession } from '../../lib/session/session'
import cameraIcon from '../../assets/bill-capture/camera.svg'
import thumbCheckIcon from '../../assets/bill-capture/thumb-check.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

type VatRate = '5' | '0' | 'exempt'
type Paid = 'onSpot' | 'owing'
type Method = 'cash' | 'card'

type Receipt = {
  intake: IntakeDto
  file: File
  status: 'todo' | 'saved'
  form: BillForm
  vatNumber: string | null
  vatRate: VatRate
  /** The VAT field follows the rate until someone types in it. */
  vatTyped: boolean
  category: string
  paid: Paid
  method: Method
}

const VAT_RATES: { id: VatRate; key: string }[] = [
  { id: '5', key: 'scanReceipts.vat.five' },
  { id: '0', key: 'scanReceipts.vat.zero' },
  { id: 'exempt', key: 'scanReceipts.vat.exempt' },
]

/** UNCL4461, as the payment ledger records it. Petty cash has no code of its own, so it is not offered. */
const METHOD_CODES: Record<Method, '10' | '48'> = { cash: '10', card: '48' }

function receiptOf({ intake, file }: { intake: IntakeDto; file: File }): Receipt {
  return {
    intake,
    file,
    status: 'todo',
    form: { ...blankBillForm(), issueDate: muscatToday() },
    vatNumber: null,
    vatRate: '5',
    vatTyped: false,
    category: '',
    paid: 'onSpot',
    method: 'cash',
  }
}

/**
 * Bills › Scan receipts (E-10, decision 4). Each photo is stored as its own intake and confirmed
 * one at a time — paid on the spot in cash or by card, or still owing. Nothing is read from a
 * photo, so each receipt is typed from the picture beside it.
 */
export function ScanReceiptsPage() {
  return (
    <AppShell>
      <ScanReceipts />
    </AppShell>
  )
}

function ScanReceipts() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [active, setActive] = useState(0)

  const add = (uploaded: { intake: IntakeDto; file: File }[]) => {
    setReceipts((current) => [...current, ...uploaded.map(receiptOf)])
  }

  const saved = receipts.filter((receipt) => receipt.status === 'saved')
  const percent = receipts.length === 0 ? 0 : Math.round((saved.length / receipts.length) * 100)
  const confirmedTotal = saved
    .filter((receipt) => receipt.form.currency === 'OMR')
    .reduce((sum, receipt) => sum + Number(receipt.form.total), 0)

  const header = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/expenditure/bills" className="text-2xl font-medium leading-[1.2] text-primary-700 hover:text-primary-800">
          {t('billDetail.breadcrumb')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">{t('scanReceipts.breadcrumb')}</span>
      </div>
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('scanReceipts.title')}</h1>
        <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
          {receipts.length === 0 ? t('billIntake.scan.subtitleEmpty') : t('billIntake.scan.subtitle', { count: receipts.length })}
        </p>
      </div>
    </>
  )

  if (!can(session, 'invoice.payment.manage')) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {header}
        <PermissionDeniedNotice />
      </div>
    )
  }

  const receipt = receipts[active]

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {header}

      {receipts.length === 0 ? (
        <BillFilePicker
          accept={RECEIPT_FILE_TYPES}
          source="SCANNED"
          multiple
          title={t('billIntake.scan.choose')}
          hint={t('billIntake.scan.hint')}
          onUploaded={add}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
                <img src={cameraIcon} alt="" className="size-5" />
              </span>
              <div>
                <p className="text-base font-semibold leading-[1.2] text-text-primary">
                  {t('scanReceipts.receiptOf', { current: active + 1, total: receipts.length })}
                </p>
                <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                  {t('billIntake.scan.progress', {
                    saved: saved.length,
                    left: receipts.length - saved.length,
                    total: formatAmount(confirmedTotal, 'OMR', i18n.language),
                  })}
                </p>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-end gap-4">
              <div className="flex min-w-[160px] max-w-[260px] flex-1 flex-col gap-1">
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-white">
                  <span style={{ width: `${percent}%` }} className="block h-full rounded-full bg-primary-700 transition-[width]" />
                </span>
                <span className="text-end text-xs font-semibold text-primary-800">{t('scanReceipts.percentDone', { percent })}</span>
              </div>
              <Link
                to="/expenditure/bills"
                className="inline-flex h-[42px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('billIntake.scan.finishLater')}
              </Link>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto rounded-md bg-surface-card p-4">
            {receipts.map((item, index) => (
              <Thumbnail key={item.intake.id} receipt={item} index={index} active={index === active} onClick={() => setActive(index)} />
            ))}
            <AddMore onUploaded={add} />
          </div>

          {receipt ? (
            <ReceiptEditor
              key={receipt.intake.id}
              receipt={receipt}
              position={{ index: active, total: receipts.length }}
              onChange={(next) => setReceipts((current) => current.map((item, index) => (index === active ? next : item)))}
              onSaved={(next) => {
                setReceipts((current) => current.map((item, index) => (index === active ? next : item)))
                const following = receipts.findIndex((item, index) => index > active && item.status === 'todo')
                if (following !== -1) setActive(following)
              }}
              onDiscarded={() => {
                setReceipts((current) => current.filter((_, index) => index !== active))
                setActive((current) => Math.max(0, Math.min(current, receipts.length - 2)))
              }}
              onMove={(step) => setActive((current) => Math.min(receipts.length - 1, Math.max(0, current + step)))}
            />
          ) : null}
        </>
      )}
    </div>
  )
}

function useObjectUrl(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const created = URL.createObjectURL(file)
    setUrl(created)
    return () => URL.revokeObjectURL(created)
  }, [file])
  return url
}

function Thumbnail({ receipt, index, active, onClick }: { receipt: Receipt; index: number; active: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const url = useObjectUrl(receipt.file)
  const saved = receipt.status === 'saved'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      aria-label={t('scanReceipts.receiptOf', { current: index + 1, total: index + 1 })}
      className={[
        'flex w-[116px] shrink-0 flex-col items-center gap-2 rounded-sm border-2 p-2 transition-colors',
        active ? 'border-primary-700 bg-primary-25' : 'border-transparent hover:bg-surface-background',
      ].join(' ')}
    >
      <span className="relative block h-[104px] w-full overflow-hidden rounded-sm bg-[#f7f1e6]">
        {url && fileKindOf(receipt.file) === 'image' ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
        <span
          className={[
            'absolute end-1 top-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold',
            saved ? 'bg-success-700 text-white' : active ? 'bg-primary-700 text-white' : 'bg-white text-text-tertiary ring-1 ring-border-default',
          ].join(' ')}
        >
          {saved ? <img src={thumbCheckIcon} alt="" className="size-2.5" /> : index + 1}
        </span>
      </span>
      <span className={['max-w-full truncate text-xs leading-[1.2]', active ? 'font-semibold text-primary-800' : 'font-medium text-text-tertiary'].join(' ')}>
        {receipt.form.supplierName || receipt.file.name}
      </span>
    </button>
  )
}

function AddMore({ onUploaded }: { onUploaded: (uploaded: { intake: IntakeDto; file: File }[]) => void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const take = async (files: File[]) => {
    setBusy(true)
    setRefusal(null)
    const uploaded: { intake: IntakeDto; file: File }[] = []
    try {
      for (const file of files) uploaded.push({ intake: await uploadIntake(file, 'SCANNED'), file })
    } catch (error) {
      const coded = error instanceof ApiError && error.code ? UPLOAD_REFUSALS[error.code] : undefined
      const failure = describeApiFailure(error)
      setRefusal(coded ? t(coded) : t(failure.key, failure.values))
    } finally {
      setBusy(false)
      if (uploaded.length > 0) onUploaded(uploaded)
    }
  }

  return (
    <FileDropzone
      accept={RECEIPT_FILE_TYPES}
      multiple
      maxBytes={INTAKE_MAX_BYTES}
      onFiles={(files) => void take(files)}
      onReject={(reason) => setRefusal(t(reason === 'size' ? 'billIntake.upload.tooLarge' : 'billIntake.upload.wrongType'))}
      className="flex w-[116px] shrink-0 flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-border-default p-2 text-text-tertiary transition-colors hover:border-primary-300 hover:text-primary-700"
    >
      {() => (
        <>
          <img src={plusIcon} alt="" className="size-5" />
          <span className="text-xs font-medium">{busy ? t('billIntake.upload.sending') : t('scanReceipts.addMore')}</span>
          {refusal ? (
            <span role="alert" className="text-[11px] font-medium text-text-danger">
              {refusal}
            </span>
          ) : null}
        </>
      )}
    </FileDropzone>
  )
}

function ReceiptEditor({
  receipt,
  position,
  onChange,
  onSaved,
  onDiscarded,
  onMove,
}: {
  receipt: Receipt
  position: { index: number; total: number }
  onChange: (receipt: Receipt) => void
  onSaved: (receipt: Receipt) => void
  onDiscarded: () => void
  onMove: (step: number) => void
}) {
  const { t, i18n } = useTranslation()
  const url = useObjectUrl(receipt.file)
  const [errors, setErrors] = useState<BillProblems>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<PossibleDuplicateDto | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const saved = receipt.status === 'saved'
  const form = receipt.form

  const setForm = (patch: Partial<BillForm>, extra: Partial<Receipt> = {}) => {
    const next = { ...receipt, ...extra, form: { ...form, ...patch } }
    if (!next.vatTyped) next.form.vat = vatIncluded(next.form.total, next.vatRate)
    if ('supplierId' in patch || 'supplierName' in patch || 'billNumber' in patch) setDuplicate(null)
    onChange(next)
  }

  const categoryOptions = useMemo(
    () => [{ value: '', label: t('billIntake.category.none') }, ...EXPENSE_CATEGORIES.map((entry) => ({ value: entry.value, label: t(`billIntake.category.${entry.key}`) }))],
    [t],
  )
  const error = (field: keyof BillProblems) => (errors[field] ? t(errors[field]!) : undefined)

  const save = async (notDuplicateOf: string | null) => {
    if (inFlight.current || saved) return
    const problems = billProblems(form, { needsNumber: false })
    setErrors(problems)
    if (Object.keys(problems).length > 0) {
      setNotice(t('billIntake.fixFirst'))
      return
    }
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      await confirmIntake(
        receipt.intake.id,
        toConfirmation(form, {
          category: receipt.category || null,
          notDuplicateOf,
          paidOnTheSpot: receipt.paid === 'onSpot' ? { methodCode: METHOD_CODES[receipt.method], paymentReference: null, paidOn: form.issueDate } : null,
        }),
      )
      onSaved({ ...receipt, status: 'saved' })
    } catch (failure) {
      const same = possibleDuplicateOf(failure)
      if (same) setDuplicate(same)
      else if (failure instanceof ApiError && failure.code && CONFIRM_REFUSALS[failure.code]) {
        const refusal = CONFIRM_REFUSALS[failure.code]
        if (refusal.field) setErrors({ [refusal.field]: refusal.key })
        setNotice(refusal.field ? t('billIntake.fixFirst') : t(refusal.key))
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
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await discardIntake(receipt.intake.id)
      onDiscarded()
    } catch (failure) {
      const described = describeApiFailure(failure)
      setNotice(t(described.key, described.values))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const choice = (selected: boolean) =>
    [
      'inline-flex h-[42px] items-center rounded-sm border px-4 text-sm font-semibold transition-colors',
      selected ? 'border-primary-700 bg-primary-25 text-primary-800' : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
    ].join(' ')

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      <section className="flex w-full flex-col self-start overflow-hidden rounded-md bg-[#2c3342] xl:w-[520px] xl:shrink-0">
        <div className="flex min-h-[420px] flex-1 items-center justify-center p-6">
          {url === null ? null : fileKindOf(receipt.file) === 'pdf' ? (
            <iframe src={url} title={receipt.file.name} className="h-[560px] w-full border-0 bg-white" />
          ) : (
            <img src={url} alt={receipt.file.name} className="max-h-[560px] w-auto rounded-sm object-contain" />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
          <p className="min-w-0 truncate text-sm font-medium text-white/80">{receipt.file.name}</p>
          {saved ? null : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void discard()}
              aria-label={t('scanReceipts.discard')}
              className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
            >
              <img src={deleteIcon} alt="" className="size-5" />
            </button>
          )}
        </div>
      </section>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save(null)
        }}
        className="flex min-w-0 flex-1 flex-col gap-4"
      >
        {saved ? <Notice body={t('billIntake.scan.saved')} /> : <p className="rounded-sm bg-primary-25 px-4 py-3 text-sm font-medium text-text-secondary">{t('billIntake.scan.typeIt')}</p>}
        {notice ? <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

        <fieldset disabled={saved} className="flex flex-col gap-4">
          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('scanReceipts.boughtFrom')}</h2>
            <div className="mt-4 flex flex-col gap-1.5">
              <FieldLabel label={t('billIntake.supplier')} required htmlFor="receipt-supplier" />
              <SupplierPicker
                id="receipt-supplier"
                value={{ id: form.supplierId, name: form.supplierName, vatNumber: receipt.vatNumber }}
                onPick={(picked: PickedSupplier) => setForm({ supplierId: picked.id, supplierName: picked.name }, { vatNumber: picked.vatNumber })}
                error={error('supplier')}
              />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('scanReceipts.date')} required />
                <DateField value={form.issueDate} onChange={(issueDate) => setForm({ issueDate })} ariaLabel={t('scanReceipts.date')} />
                {error('issueDate') ? (
                  <p role="alert" className="text-xs font-medium text-text-danger">
                    {error('issueDate')}
                  </p>
                ) : null}
              </div>
              <TextField
                id="receipt-number"
                name="receiptNumber"
                label={t('scanReceipts.receiptNumber')}
                maxLength={200}
                value={form.billNumber}
                onChange={(billNumber) => setForm({ billNumber })}
              />
              <TextField
                id="receipt-total"
                name="total"
                label={t('scanReceipts.totalPaid')}
                required
                inputMode="decimal"
                value={form.total}
                onChange={(total) => setForm({ total })}
                error={error('total')}
              />
              <SelectField
                id="receipt-currency"
                name="currency"
                label={t('billIntake.currency')}
                required
                options={['OMR', 'USD', 'EUR', 'AED', 'SAR']}
                value={form.currency}
                onChange={(currency) => setForm({ currency })}
              />
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('scanReceipts.tax')}</h2>
            <div className="mt-4 flex flex-col gap-1.5">
              <FieldLabel label={t('scanReceipts.vatRate')} />
              <div className="flex flex-wrap gap-2">
                {VAT_RATES.map((rate) => (
                  <button key={rate.id} type="button" aria-pressed={receipt.vatRate === rate.id} onClick={() => setForm({}, { vatRate: rate.id, vatTyped: false })} className={choice(receipt.vatRate === rate.id)}>
                    {t(rate.key)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 max-w-[280px]">
              <TextField
                id="receipt-vat"
                name="vat"
                label={t('scanReceipts.vatOnIt')}
                inputMode="decimal"
                value={form.vat}
                onChange={(vat) => onChange({ ...receipt, vatTyped: true, form: { ...form, vat } })}
                error={error('vat')}
                hint={receipt.vatTyped ? undefined : t('billIntake.scan.vatWorkedOut')}
              />
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('scanReceipts.whatItWasFor')}</h2>
            <div className="mt-4 max-w-[360px]">
              <SelectField
                id="receipt-category"
                name="category"
                label={t('scanReceipts.category')}
                options={categoryOptions}
                value={receipt.category}
                onChange={(category) => onChange({ ...receipt, category })}
              />
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{t('scanReceipts.wasItPaid')}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {(['onSpot', 'owing'] as const).map((paid) => (
                <button key={paid} type="button" aria-pressed={receipt.paid === paid} onClick={() => onChange({ ...receipt, paid })} className={choice(receipt.paid === paid)}>
                  {t(paid === 'onSpot' ? 'scanReceipts.paid.onSpot' : 'scanReceipts.paid.stillOwing')}
                </button>
              ))}
            </div>
            {receipt.paid === 'onSpot' ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {(['cash', 'card'] as const).map((method) => (
                  <button key={method} type="button" aria-pressed={receipt.method === method} onClick={() => onChange({ ...receipt, method })} className={choice(receipt.method === method)}>
                    {t(`scanReceipts.paid.${method}`)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm font-medium text-text-tertiary">{t('billIntake.scan.owingNote')}</p>
            )}
          </section>
        </fieldset>

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
                total: duplicate.total === null ? '—' : `${formatAmount(duplicate.total, duplicate.currencyCode ?? form.currency, i18n.language)} ${duplicate.currencyCode ?? form.currency}`,
                source: t(`billIntake.duplicate.source.${duplicate.source}`),
              })}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to={`/expenditure/bills/${duplicate.billId}`} className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25">
                {t('billIntake.duplicate.open')}
              </Link>
              <button type="button" disabled={busy} onClick={() => void save(duplicate.billId)} className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60">
                {t('billIntake.duplicate.different')}
              </button>
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button type="button" disabled={position.index === 0} onClick={() => onMove(-1)} className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-40">
              {t('scanReceipts.previous')}
            </button>
            <button type="button" disabled={position.index === position.total - 1} onClick={() => onMove(1)} className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-40">
              {t('scanReceipts.skip')}
            </button>
          </div>
          {saved ? null : (
            <button type="submit" disabled={busy} className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60">
              {busy ? t('billIntake.saving') : t('scanReceipts.confirmNext')}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
