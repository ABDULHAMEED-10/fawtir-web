import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, FileDropzone, Rial, Select, withRial } from '../../components/ui'
import { FieldLabel, TextField } from '../../components/form'
import { selectAllOnFocus } from '../../components/invoice'
import {
  BillFilePicker,
  SupplierPicker,
  useElapsedSeconds,
  type PickedSupplier,
} from '../../components/bills'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api/errors'
import {
  INTAKE_LIVE_MAX_MB,
  INTAKE_MAX_BYTES,
  confirmIntake,
  discardIntake,
  loadIntake,
  loadIntakeFile,
  type IntakeDto,
} from '../../api/expenditure/billIntake'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  overrideExtras,
  overrideRefused,
  reviewAfterRefusal,
  type DuplicateOverride,
  type DuplicateReview,
} from '../../lib/billDuplicateOverride'
import { DuplicateReviewPanel } from '../../components/bills/DuplicateReviewPanel'
import {
  BILL_CONFIRM_REFUSALS,
  CONFIDENT_AT,
  EXPENSE_CATEGORIES,
  RECEIPT_FILE_TYPES,
  billProblems,
  blankBillForm,
  fileKindOf,
  fromIntake,
  guessedCategory,
  notReadReason,
  readingOf,
  toConfirmation,
  unsureFields,
  vatIncluded,
  vatWorkedOut,
  type BillForm,
  type BillProblems,
  type ReadField,
} from '../../lib/billIntake'
import { uploadInTurn } from '../../lib/billUpload'
import { formatAmount, formatDate } from '../../lib/format'
import { muscatToday } from '../../lib/invoiceIssue'
import { can, useSession } from '../../lib/session/session'
import cameraIcon from '../../assets/bill-capture/camera.svg'
import thumbCheckIcon from '../../assets/bill-capture/thumb-check.svg'
import photoIcon from '../../assets/bill-capture/photo.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import rotateIcon from '../../assets/bill-capture/rotate.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import okCheckIcon from '../../assets/bill-detail/tick.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

type VatRate = '5' | '0' | 'exempt'
type Paid = 'onSpot' | 'owing'
type Method = 'cash' | 'card' | 'pettyCash'

type Receipt = {
  intake: IntakeDto
  file: File
  status: 'todo' | 'saved'
  /**
   * Saved held as a possible duplicate (PRV43-WEBEXP L-2). The confirmed bill carries no hold, so
   * this is what the save sent: the listing of the one copy the server said it would hold against
   * (`heldForReviewIfListed`).
   */
  held?: boolean
  form: BillForm
  vatNumber: string | null
  vatRate: VatRate
  /**
   * The VAT field follows the rate until someone types in it. A VAT the reader worked out from
   * the total rather than read (`reading.workedOut` has `vat`) counts as not typed, so it stays
   * amber (EXPENDITURE.md 1.10).
   */
  vatTyped: boolean
  category: string
  /** The category is the reader's guess (`reading.category`), not yet changed by the person. */
  categoryGuessed: boolean
  /** That guess scored below 0.9, so the picker is amber until a category is chosen. */
  categoryUnsure: boolean
  /** Read fields still amber: unsure on the photo and not typed over since (row 1.10). */
  unsure: ReadField[]
  /** The design's optional note: sent on confirm and kept on the bill (EXPENDITURE.md 1.8). */
  note: string
  paid: Paid
  method: Method
}

const VAT_RATES: { id: VatRate; key: string; category: 'S5' | 'Z0' | 'E0' }[] = [
  { id: '5', key: 'scanReceipts.vat.five', category: 'S5' },
  { id: '0', key: 'scanReceipts.vat.zero', category: 'Z0' },
  { id: 'exempt', key: 'scanReceipts.vat.exempt', category: 'E0' },
]

/**
 * UNCL4461, as the payment ledger records it. Petty cash is cash in the ledger's eyes: it goes
 * as `10` with `pettyCash: true`, and the server writes its fixed reference on the payment
 * (EXPENDITURE.md 1.9).
 */
const METHOD_CODES: Record<Method, '10' | '48'> = { cash: '10', card: '48', pettyCash: '10' }

const FIELD =
  'h-[50px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder focus:border-primary-700'
/** The same box amber: read from the photo but not sure, or worked out, and not yet typed. */
const AMBER_FIELD = FIELD.replace('border-primary-300', 'border-[#d8c9a8]').replace(
  'bg-surface-tab-bar',
  'bg-[#faf5ea]',
)

/** What a change to the receipt's form settles: the read field it overwrites, so its amber goes. */
const SETTLES: Partial<Record<keyof BillForm, ReadField[]>> = {
  supplierId: ['supplierName', 'supplierVatNumber'],
  supplierName: ['supplierName'],
  billNumber: ['billNumber'],
  issueDate: ['issueDate'],
  total: ['total'],
}

function receiptOf({ intake, file }: { intake: IntakeDto; file: File }): Receipt {
  const form = fromIntake(intake, { ...blankBillForm(), issueDate: muscatToday() })
  const reading = readingOf(intake)
  // Prefilled only when it is one of the categories this screen offers.
  const guess = guessedCategory(intake)
  return {
    intake,
    file,
    status: intake.confirmedBillId ? 'saved' : 'todo',
    form,
    vatNumber: intake.extracted?.supplierVatNumber ?? null,
    // The printed rate, when the receipt says 0%; otherwise the screen's 5%.
    vatRate: reading?.vatRate === 0 ? '0' : '5',
    vatTyped: form.vat !== '' && !vatWorkedOut(intake),
    category: guess ?? '',
    categoryGuessed: guess !== null,
    categoryUnsure: guess !== null && (reading?.categoryConfidence ?? 0) < CONFIDENT_AT,
    unsure: [...unsureFields(intake)],
    note: intake.note ?? '',
    paid: 'onSpot',
    method: 'cash',
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Bills › Scan receipts (Figma 163:22851). Each photo is stored as its own intake and confirmed
 * one at a time: paid on the spot in cash, by card or from petty cash, or still owing. The
 * document reader reads each photo while it uploads (EXPENDITURE.md 1.10): its values are
 * prefilled, unsure ones amber, the category guessed, and a VAT worked out from the total stays
 * amber until typed. A photo that was not read is typed from the picture beside it. `?intake=a,b`
 * brings receipts stored earlier back into the pile, which is how a draft row on the Bills list
 * is finished.
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
  const [params] = useSearchParams()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  /** The files of the last choice that did not become receipts, so none goes without a word. */
  const [notAdded, setNotAdded] = useState<string[]>([])
  const [active, setActive] = useState(0)

  // Receipts stored earlier, named in the URL: fetched once with their files, then part of the pile.
  const resumeIds = useMemo(
    () =>
      (params.get('intake') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    [params],
  )
  const resumeKey = resumeIds.length > 0 ? `/v1/bills/intake?ids=${resumeIds.join(',')}` : null
  const resumed = useApiRead<{ intake: IntakeDto; file: File }[]>(resumeKey, () =>
    Promise.all(
      resumeIds.map(async (id) => {
        const intake = await loadIntake(id)
        return { intake, file: await loadIntakeFile(intake) }
      }),
    ),
  )
  const taken = useRef<string | null>(null)
  useEffect(() => {
    if (resumed.read.status !== 'ready' || taken.current === resumeKey) return
    taken.current = resumeKey
    const fresh = resumed.read.data.filter((entry) => !entry.intake.confirmedBillId)
    setReceipts((current) => [
      ...current,
      ...fresh
        .filter((entry) => !current.some((item) => item.intake.id === entry.intake.id))
        .map(receiptOf),
    ])
  }, [resumed.read, resumeKey])

  const anyRead = receipts.some((item) => readingOf(item.intake) !== null)

  const add = (uploaded: { intake: IntakeDto; file: File }[], problems: string[]) => {
    setReceipts((current) => [...current, ...uploaded.map(receiptOf)])
    setNotAdded(problems)
  }

  const saved = receipts.filter((receipt) => receipt.status === 'saved')
  const percent = receipts.length === 0 ? 0 : Math.round((saved.length / receipts.length) * 100)
  const confirmedTotal = saved
    .filter((receipt) => receipt.form.currency === 'OMR')
    .reduce((sum, receipt) => sum + Number(receipt.form.total), 0)

  const header = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/expenditure/bills"
          className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
        >
          {t('billDetail.breadcrumb')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">
          {t('scanReceipts.breadcrumb')}
        </span>
      </div>
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('scanReceipts.title')}
        </h1>
        <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
          {receipts.length === 0
            ? t('billIntake.scan.subtitleEmpty')
            : anyRead
              ? t('scanReceipts.subtitle', { count: receipts.length })
              : t('billIntake.scan.subtitle', { count: receipts.length })}
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

      {resumeKey && resumed.read.status === 'loading' && receipts.length === 0 ? (
        <LoadingNotice />
      ) : resumeKey && resumed.read.status === 'failed' && receipts.length === 0 ? (
        <ApiReadFailure error={resumed.read.error} retry={resumed.retry} />
      ) : receipts.length === 0 ? (
        <BillFilePicker
          accept={RECEIPT_FILE_TYPES}
          source="SCANNED"
          multiple
          title={t('billIntake.scan.choose')}
          hint={t('billIntake.scan.hint', { mb: INTAKE_LIVE_MAX_MB })}
          onUploaded={add}
        />
      ) : (
        <>
          {notAdded.length > 0 ? (
            <p role="alert" className="text-sm font-medium text-text-danger">
              {notAdded.join(' ')}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
                <img src={cameraIcon} alt="" className="size-5" />
              </span>
              <div>
                <p className="text-base font-semibold leading-[1.2] text-text-primary">
                  {t('scanReceipts.receiptOf', { current: active + 1, total: receipts.length })}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                  <span>
                    {t('billIntake.scan.progressCounts', {
                      saved: saved.length,
                      left: receipts.length - saved.length,
                    })}
                  </span>
                  <span>·</span>
                  <Rial />
                  <span>
                    {t('billIntake.scan.confirmedSoFar', {
                      total: formatAmount(confirmedTotal, 'OMR', i18n.language),
                    })}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-end gap-4">
              <div className="flex min-w-[160px] max-w-[260px] flex-1 flex-col gap-1">
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-white">
                  <span
                    style={{ width: `${percent}%` }}
                    className="block h-full rounded-full bg-primary-700 transition-[width]"
                  />
                </span>
                <span className="text-end text-xs font-semibold text-primary-800">
                  {t('scanReceipts.percentDone', { percent })}
                </span>
              </div>
              <Link
                to="/expenditure/bills"
                className="inline-flex h-[42px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('scanReceipts.saveAll')}
              </Link>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto rounded-md bg-surface-card p-4">
            {receipts.map((item, index) => (
              <Thumbnail
                key={item.intake.id}
                receipt={item}
                index={index}
                active={index === active}
                onClick={() => setActive(index)}
              />
            ))}
            <AddMore onUploaded={add} />
          </div>

          {receipt ? (
            <ReceiptEditor
              key={receipt.intake.id}
              receipt={receipt}
              position={{ index: active, total: receipts.length }}
              onChange={(next) =>
                setReceipts((current) =>
                  current.map((item, index) => (index === active ? next : item)),
                )
              }
              onSaved={(next) => {
                setReceipts((current) =>
                  current.map((item, index) => (index === active ? next : item)),
                )
                const following = receipts.findIndex(
                  (item, index) => index > active && item.status === 'todo',
                )
                if (following !== -1) setActive(following)
              }}
              onDiscarded={() => {
                setReceipts((current) => current.filter((_, index) => index !== active))
                setActive((current) => Math.max(0, Math.min(current, receipts.length - 2)))
              }}
              onMove={(step) =>
                setActive((current) => Math.min(receipts.length - 1, Math.max(0, current + step)))
              }
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

function Thumbnail({
  receipt,
  index,
  active,
  onClick,
}: {
  receipt: Receipt
  index: number
  active: boolean
  onClick: () => void
}) {
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
        active
          ? 'border-primary-700 bg-primary-25'
          : 'border-transparent hover:bg-surface-background',
      ].join(' ')}
    >
      <span className="relative block h-[104px] w-full overflow-hidden rounded-sm bg-[#f7f1e6]">
        {url && fileKindOf(receipt.file) === 'image' ? (
          <img src={url} alt="" className="h-full w-full object-cover object-top" />
        ) : null}
        <span
          className={[
            'absolute end-1 top-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold',
            saved
              ? 'bg-success-700 text-white'
              : active
                ? 'bg-primary-700 text-white'
                : 'bg-white text-text-tertiary ring-1 ring-border-default',
          ].join(' ')}
        >
          {saved ? <img src={thumbCheckIcon} alt="" className="size-2.5" /> : index + 1}
        </span>
      </span>
      <span
        className={[
          'max-w-full truncate text-xs leading-[1.2]',
          active ? 'font-semibold text-primary-800' : 'font-medium text-text-tertiary',
        ].join(' ')}
      >
        {receipt.form.supplierName || receipt.file.name}
      </span>
    </button>
  )
}

function AddMore({
  onUploaded,
}: {
  onUploaded: (uploaded: { intake: IntakeDto; file: File }[], problems: string[]) => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  /** Files the box itself turned away, in the same drop as the ones it passes on. */
  const rejected = useRef<string[]>([])
  // Each photo is read while it uploads, which can take a while: the tile counts the seconds.
  const seconds = useElapsedSeconds(busy)

  const take = async (files: File[]) => {
    const refused = rejected.current
    rejected.current = []
    setBusy(true)
    const result = await uploadInTurn(files, 'SCANNED')
    setBusy(false)
    onUploaded(result.uploaded, [
      ...refused,
      ...result.problems.map((problem) => t(problem.key, problem.values)),
    ])
  }

  return (
    <FileDropzone
      accept={RECEIPT_FILE_TYPES}
      multiple
      maxBytes={INTAKE_MAX_BYTES}
      onFiles={(files) => void take(files)}
      onReject={(reason, file) => {
        rejected.current.push(
          t(
            reason === 'size'
              ? 'billIntake.upload.tooLargeNamed'
              : 'billIntake.upload.wrongTypeNamed',
            { name: file.name },
          ),
        )
        // Nothing else came with it: no upload follows to carry the words up.
        queueMicrotask(() => {
          if (rejected.current.length === 0) return
          onUploaded([], rejected.current)
          rejected.current = []
        })
      }}
      className="flex max-w-[116px] shrink-0 flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-border-default p-2 text-text-tertiary transition-colors hover:border-primary-300 hover:text-primary-700"
    >
      {() => (
        <>
          <img src={plusIcon} alt="" className="size-5" />
          <span className="text-xs font-medium">
            {busy ? t('billIntake.upload.readingShort', { seconds }) : t('scanReceipts.addMore')}
          </span>
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
  const [duplicate, setDuplicate] = useState<DuplicateReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const inFlight = useRef(false)
  const saved = receipt.status === 'saved'
  const form = receipt.form
  const unsure = (field: ReadField) => receipt.unsure.includes(field)
  const notRead = notReadReason(receipt.intake)

  const setForm = (patch: Partial<BillForm>, extra: Partial<Receipt> = {}) => {
    const settled = (Object.keys(patch) as (keyof BillForm)[]).flatMap((key) => SETTLES[key] ?? [])
    const next = {
      ...receipt,
      ...extra,
      form: { ...form, ...patch },
      unsure: receipt.unsure.filter((field) => !settled.includes(field)),
    }
    if (!next.vatTyped) next.form.vat = vatIncluded(next.form.total, next.vatRate)
    if ('supplierId' in patch || 'supplierName' in patch || 'billNumber' in patch)
      setDuplicate(null)
    onChange(next)
  }

  const categoryOptions = useMemo(
    () => [
      { value: '', label: t('billIntake.category.none') },
      ...EXPENSE_CATEGORIES.map((entry) => ({
        value: entry.value,
        label: t(`billIntake.category.${entry.key}`),
      })),
    ],
    [t],
  )
  const error = (field: keyof BillProblems) => (errors[field] ? t(errors[field]!) : undefined)
  // "2 fields to check on this one": what the server would still refuse, counted live.
  const toCheck =
    Object.keys(billProblems(form, { needsNumber: false })).length + (receipt.category ? 0 : 1)

  const save = async (override: DuplicateOverride | null) => {
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
          note: receipt.note,
          ...overrideExtras(override),
          // 0% and Exempt are both a zero rate; the category is what tells them apart.
          taxCategoryCode: VAT_RATES.find((rate) => rate.id === receipt.vatRate)?.category ?? null,
          paidOnTheSpot:
            receipt.paid === 'onSpot'
              ? {
                  methodCode: METHOD_CODES[receipt.method],
                  paymentReference: null,
                  paidOn: form.issueDate,
                  ...(receipt.method === 'pettyCash' ? { pettyCash: true as const } : {}),
                }
              : null,
        }),
      )
      onSaved({
        ...receipt,
        status: 'saved',
        held: override !== null && duplicate?.heldForReview === true && duplicate.seen.length === 1,
      })
    } catch (failure) {
      const same = reviewAfterRefusal(duplicate, failure)
      const overridden = overrideRefused(duplicate, failure)
      if (same) setDuplicate(same)
      else if (overridden) {
        setDuplicate(overridden.review)
        if (!overridden.review) setNotice(t(overridden.key))
      } else if (
        failure instanceof ApiError &&
        failure.code &&
        Object.hasOwn(BILL_CONFIRM_REFUSALS, failure.code)
      ) {
        const refusal = BILL_CONFIRM_REFUSALS[failure.code]
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

  const choice = (selected: boolean, disabled = false) =>
    [
      'inline-flex h-[50px] items-center justify-center gap-1.5 rounded-sm border px-3 text-sm font-semibold transition-colors',
      selected
        ? 'border-primary-700 bg-primary-50 text-primary-800'
        : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
      disabled ? 'cursor-not-allowed opacity-40 hover:bg-white' : '',
    ].join(' ')
  const tool =
    'inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25 disabled:opacity-40'

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save(null)
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-4 xl:flex-row">
        <section className="flex w-full flex-col self-start overflow-hidden rounded-md border border-white bg-surface-card shadow-card xl:w-[400px] xl:shrink-0">
          <div className="flex min-h-[420px] flex-1 items-center justify-center overflow-auto bg-surface-background p-6">
            {url === null ? null : fileKindOf(receipt.file) === 'pdf' ? (
              <iframe
                src={url}
                title={receipt.file.name}
                className="h-[560px] w-full border-0 bg-white"
              />
            ) : (
              <img
                src={url}
                alt={receipt.file.name}
                style={{ transform: `rotate(${rotation}deg) scale(${zoomed ? 1.5 : 1})` }}
                className="max-h-[560px] w-auto rounded-sm bg-white object-contain shadow-card transition-transform"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-4 py-3">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-secondary">
              <img src={photoIcon} alt="" className="size-5 shrink-0" />
              <span className="truncate">
                {receipt.file.name} · {formatBytes(receipt.intake.byteSize || receipt.file.size)}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('scanReceipts.rotate')}
                onClick={() => setRotation((current) => (current + 90) % 360)}
                className={tool}
              >
                <img src={rotateIcon} alt="" className="size-5" />
              </button>
              <button
                type="button"
                aria-label={t('invoiceDetails.zoomIn')}
                aria-pressed={zoomed}
                onClick={() => setZoomed((current) => !current)}
                className={tool}
              >
                <img src={zoomInIcon} alt="" className="size-5" />
              </button>
              <button
                type="button"
                aria-label={t('invoiceDetails.fullscreen')}
                onClick={() => url && window.open(url, '_blank', 'noopener')}
                className={tool}
              >
                <img src={fullscreenIcon} alt="" className="size-5" />
              </button>
              {saved ? null : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void discard()}
                  aria-label={t('scanReceipts.discard')}
                  className={tool}
                >
                  <img src={deleteIcon} alt="" className="size-5" />
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {saved ? (
            <Notice body={t(receipt.held ? 'billIntake.scan.savedHeld' : 'billIntake.scan.saved')} />
          ) : null}
          {notice ? (
            <Notice
              body={notice}
              action={{ label: t('common.close'), onClick: () => setNotice(null) }}
            />
          ) : null}

          <fieldset disabled={saved} className="flex min-w-0 flex-col gap-4">
            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {form.supplierName || receipt.file.name}
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onMove(-1)}
                    disabled={position.index === 0}
                    className="inline-flex h-[42px] items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <img src={chevronIcon} alt="" className="size-4 rotate-180 rtl:rotate-0" />
                    {t('scanReceipts.previous')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(1)}
                    disabled={position.index === position.total - 1}
                    className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('scanReceipts.skip')}
                  </button>
                </div>
              </div>

              {notRead ? (
                // Not read, and why, when it is something the person can act on (1.10).
                <p className="mt-3 flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-[#887147]">
                  <img src={warnIcon} alt="" className="mt-px size-4 shrink-0" />
                  {t(
                    notRead === 'dailyLimit'
                      ? 'billIntake.reading.dailyLimit'
                      : 'apiErrors.planFeatureNotIncluded.receiptScan',
                  )}
                </p>
              ) : null}

              <div className="mt-4 flex flex-col gap-1.5">
                <FieldLabel
                  label={t('scanReceipts.boughtFrom')}
                  required
                  htmlFor="receipt-supplier"
                />
                <SupplierPicker
                  id="receipt-supplier"
                  value={{
                    id: form.supplierId,
                    name: form.supplierName,
                    vatNumber: receipt.vatNumber,
                  }}
                  onPick={(picked: PickedSupplier) =>
                    setForm(
                      { supplierId: picked.id, supplierName: picked.name },
                      { vatNumber: picked.vatNumber },
                    )
                  }
                  error={error('supplier')}
                  unsure={!form.supplierId && unsure('supplierName')}
                />
                {form.supplierId && receipt.vatNumber ? (
                  <p className="flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-text-tertiary">
                    <img src={okCheckIcon} alt="" className="mt-px size-4 shrink-0" />
                    {t('scanReceipts.onYourList', { vat: receipt.vatNumber })}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <FieldLabel label={t('scanReceipts.date')} required />
                  <DateField
                    value={form.issueDate}
                    onChange={(issueDate) => setForm({ issueDate })}
                    ariaLabel={t('scanReceipts.date')}
                    unsure={unsure('issueDate')}
                  />
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
                  unsure={unsure('billNumber')}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel
                    label={t('scanReceipts.totalPaid')}
                    required
                    htmlFor="receipt-total"
                  />
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-text-secondary">
                      <Rial />
                    </span>
                    <input
                      id="receipt-total"
                      name="total"
                      inputMode="decimal"
                      required
                      value={form.total}
                      onFocus={selectAllOnFocus}
                      onChange={(event) => setForm({ total: event.target.value })}
                      aria-invalid={error('total') ? true : undefined}
                      className={[
                        unsure('total') ? AMBER_FIELD : FIELD,
                        'ps-9 tabular-nums',
                        error('total') ? 'ring-1 ring-border-danger' : '',
                      ].join(' ')}
                    />
                  </div>
                  {error('total') ? (
                    <p role="alert" className="text-xs font-medium text-text-danger">
                      {error('total')}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('scanReceipts.tax')}
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('scanReceipts.vatOnIt')} htmlFor="receipt-vat" />
                  <input
                    id="receipt-vat"
                    name="vat"
                    inputMode="decimal"
                    value={form.vat}
                    onFocus={selectAllOnFocus}
                    onChange={(event) =>
                      onChange({
                        ...receipt,
                        vatTyped: true,
                        form: { ...form, vat: event.target.value },
                        unsure: receipt.unsure.filter((field) => field !== 'vat'),
                      })
                    }
                    aria-invalid={error('vat') ? true : undefined}
                    className={[
                      receipt.vatTyped && !unsure('vat') ? FIELD : AMBER_FIELD,
                      'tabular-nums',
                      error('vat') ? 'ring-1 ring-border-danger' : '',
                    ].join(' ')}
                  />
                  {error('vat') ? (
                    <p role="alert" className="text-xs font-medium text-text-danger">
                      {error('vat')}
                    </p>
                  ) : receipt.vatTyped && !unsure('vat') ? null : (
                    // TODO(backend): EXPENDITURE.md 1.27. Why it is unsure ("That line is smudged
                    // on the photo"); the reading gives a score only.
                    <p className="flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-[#887147]">
                      <img src={warnIcon} alt="" className="mt-px size-4 shrink-0" />
                      {t(
                        receipt.vatTyped
                          ? 'billIntake.reading.unsure'
                          : 'billIntake.scan.vatWorkedOut',
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('scanReceipts.vatRate')} />
                  <div
                    role="group"
                    aria-label={t('scanReceipts.vatRate')}
                    className="flex items-center gap-2"
                  >
                    {VAT_RATES.map((rate) => (
                      <button
                        key={rate.id}
                        type="button"
                        aria-pressed={receipt.vatRate === rate.id}
                        onClick={() => setForm({}, { vatRate: rate.id, vatTyped: false })}
                        className={[choice(receipt.vatRate === rate.id), 'flex-1'].join(' ')}
                      >
                        {t(rate.key)}
                      </button>
                    ))}
                  </div>
                  <p className="flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-text-tertiary">
                    <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                    {t(
                      receipt.vatNumber
                        ? 'scanReceipts.vatOnReceipt'
                        : 'scanReceipts.vatNotOnReceipt',
                    )}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('scanReceipts.whatItWasFor')}
              </h2>
              <div className="mt-4 flex flex-col gap-1.5">
                <FieldLabel label={t('scanReceipts.category')} />
                <Select
                  value={receipt.category}
                  onChange={(category) =>
                    onChange({
                      ...receipt,
                      category,
                      categoryGuessed: false,
                      categoryUnsure: false,
                    })
                  }
                  options={categoryOptions}
                  ariaLabel={t('scanReceipts.category')}
                  unsure={receipt.category === '' || receipt.categoryUnsure}
                />
                {receipt.category === '' ? (
                  <p className="flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-[#887147]">
                    <img src={warnIcon} alt="" className="mt-px size-4 shrink-0" />
                    {t('scanReceipts.pickCategory')}
                  </p>
                ) : receipt.categoryGuessed ? (
                  // TODO(backend): EXPENDITURE.md 1.27. The design names what the guess came from
                  // ("Guessed from wire brush, sealant, drain cover"); the reading carries no reason.
                  <p
                    className={[
                      'flex items-start gap-1.5 text-xs font-medium leading-[1.4]',
                      receipt.categoryUnsure ? 'text-[#887147]' : 'text-text-tertiary',
                    ].join(' ')}
                  >
                    <img
                      src={receipt.categoryUnsure ? warnIcon : infoIcon}
                      alt=""
                      className="mt-px size-4 shrink-0"
                    />
                    {t('billIntake.reading.categoryGuessed')}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex flex-col gap-1.5">
                <label
                  htmlFor="receipt-note"
                  className="flex items-center gap-1.5 text-sm font-medium leading-[1.2] text-text-primary"
                >
                  {t('scanReceipts.note')}
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('scanReceipts.optional')}
                  </span>
                </label>
                <input
                  id="receipt-note"
                  value={receipt.note}
                  maxLength={500}
                  onChange={(event) => onChange({ ...receipt, note: event.target.value })}
                  placeholder={t('scanReceipts.notePlaceholder')}
                  className={FIELD}
                />
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase leading-[1.2] tracking-[1px] text-text-quaternary">
                  {t('scanReceipts.wasItPaid')}
                </p>
                {/* One row of five, as drawn. They are two questions though, whether it was settled
                    and with what, so the last three switch off when nothing was paid. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {(['onSpot', 'owing'] as const).map((paid) => (
                    <button
                      key={paid}
                      type="button"
                      aria-pressed={receipt.paid === paid}
                      onClick={() => onChange({ ...receipt, paid })}
                      className={[
                        choice(receipt.paid === paid),
                        'min-w-[96px] flex-auto whitespace-nowrap',
                      ].join(' ')}
                    >
                      {receipt.paid === paid ? (
                        <img src={okCheckIcon} alt="" className="size-4" />
                      ) : null}
                      {t(
                        paid === 'onSpot'
                          ? 'scanReceipts.paid.onSpot'
                          : 'scanReceipts.paid.stillOwing',
                      )}
                    </button>
                  ))}
                  {(['cash', 'card', 'pettyCash'] as const).map((method) => {
                    const disabled = receipt.paid === 'owing'
                    return (
                      <button
                        key={method}
                        type="button"
                        disabled={disabled}
                        aria-pressed={!disabled && receipt.method === method}
                        onClick={() => onChange({ ...receipt, method })}
                        className={[
                          choice(!disabled && receipt.method === method, disabled),
                          'min-w-[96px] flex-auto whitespace-nowrap',
                        ].join(' ')}
                      >
                        {t(`scanReceipts.paid.${method}`)}
                      </button>
                    )
                  })}
                </div>
                {receipt.paid === 'owing' ? (
                  <p className="mt-3 text-sm font-medium text-text-tertiary">
                    {t('billIntake.scan.owingNote')}
                  </p>
                ) : null}
              </div>
            </section>
          </fieldset>

          {duplicate ? (
            <DuplicateReviewPanel
              review={duplicate}
              onChange={setDuplicate}
              onDifferent={(override) => void save(override)}
              busy={busy}
              sentence={(bill) =>
                withRial(
                  t('billIntake.duplicate.body', {
                    number: bill.supplierBillNumber,
                    date: bill.issueDate ? formatDate(bill.issueDate, i18n.language) : '',
                    total:
                      bill.total === null
                        ? ''
                        : `${formatAmount(bill.total, bill.currencyCode ?? form.currency, i18n.language)} ${bill.currencyCode ?? form.currency}`,
                    source: t(`billIntake.duplicate.source.${bill.source}`),
                  }),
                )
              }
              linkClassName="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
              buttonClassName="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-card px-5 py-4 shadow-card">
        <p className="text-sm font-medium leading-[1.4] text-text-tertiary">
          <span className="font-semibold text-text-primary">
            {t('scanReceipts.footer.toCheck', { count: saved ? 0 : toCheck })}
          </span>{' '}
          {t('scanReceipts.footer.onThisOne')}
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          {saved ? null : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void discard()}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60"
            >
              {t('scanReceipts.discardThisOne')}
            </button>
          )}
          {saved ? (
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={position.index === position.total - 1}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
            >
              {t('scanReceipts.savedNext')}
            </button>
          ) : (
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              <img src={okCheckIcon} alt="" className="size-4 brightness-0 invert" />
              {busy ? t('billIntake.saving') : t('scanReceipts.confirmNext')}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
