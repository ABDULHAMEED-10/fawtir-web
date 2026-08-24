import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, Select } from '../../components/ui'
import {
  EXPENSE_CATEGORIES,
  SCANNED_RECEIPTS,
  SUPPLIER_OPTIONS,
  type PaidMethod,
  type PaidState,
  type ScannedReceipt,
} from '../../lib/billCapture'
import cameraIcon from '../../assets/bill-capture/camera.svg'
import thumbCheckIcon from '../../assets/bill-capture/thumb-check.svg'
import photoIcon from '../../assets/bill-capture/photo.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import rotateIcon from '../../assets/bill-capture/rotate.svg'
import okCheckIcon from '../../assets/bill-detail/tick.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const UNSURE_SHELL = 'border-[#d8c9a8] bg-[#faf5ea]'
const SURE_SHELL = 'border-primary-300 bg-surface-tab-bar'

const VAT_RATES: { id: ScannedReceipt['vatRate']; labelKey: string }[] = [
  { id: '5', labelKey: 'scanReceipts.vat.five' },
  { id: '0', labelKey: 'scanReceipts.vat.zero' },
  { id: 'exempt', labelKey: 'scanReceipts.vat.exempt' },
]

const PAID_STATES: { id: PaidState; labelKey: string }[] = [
  { id: 'paidOnSpot', labelKey: 'scanReceipts.paid.onSpot' },
  { id: 'stillOwing', labelKey: 'scanReceipts.paid.stillOwing' },
]

const PAID_METHODS: { id: PaidMethod; labelKey: string }[] = [
  { id: 'cash', labelKey: 'scanReceipts.paid.cash' },
  { id: 'card', labelKey: 'scanReceipts.paid.card' },
  { id: 'pettyCash', labelKey: 'scanReceipts.paid.pettyCash' },
]

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
      {label}
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
    </span>
  )
}

function Note({ tone, children }: { tone: 'warn' | 'info'; children: React.ReactNode }) {
  return (
    <p
      className={[
        'flex items-start gap-1.5 text-xs font-medium leading-[1.4]',
        tone === 'warn' ? 'text-[#887147]' : 'text-text-tertiary',
      ].join(' ')}
    >
      <img src={tone === 'warn' ? warnIcon : infoIcon} alt="" className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** The paper itself, rendered from what was read off it. */
function ReceiptSheet({ receipt, scale = 1 }: { receipt: ScannedReceipt; scale?: number }) {
  return (
    <div
      style={{ width: 220 * scale, fontSize: 9 * scale, padding: 16 * scale }}
      className="shrink-0 bg-white text-center font-medium text-text-secondary"
    >
      <p style={{ fontSize: 11 * scale }} className="font-bold uppercase tracking-[0.5px]">
        {receipt.merchant}
      </p>
      <p style={{ marginTop: 4 * scale }} className="text-text-quaternary">
        {receipt.number}
      </p>
      <div
        style={{ marginTop: 10 * scale, paddingTop: 8 * scale }}
        className="border-t border-dashed border-border-default text-start"
      >
        {receipt.lines.map((line) => (
          <p
            key={line.description}
            className="flex justify-between"
            style={{ paddingBlock: 2 * scale }}
          >
            <span>{line.description}</span>
            <span>{line.amount}</span>
          </p>
        ))}
      </div>
      <div
        style={{ marginTop: 8 * scale, paddingTop: 8 * scale }}
        className="border-t border-dashed border-border-default text-start"
      >
        <p className="flex justify-between" style={{ paddingBlock: 2 * scale }}>
          <span>{'Subtotal'}</span>
          <span>{receipt.subtotal}</span>
        </p>
        <p
          className="flex justify-between text-text-quaternary line-through decoration-1"
          style={{ paddingBlock: 2 * scale }}
        >
          <span>VAT 5%</span>
          <span>{receipt.vat}</span>
        </p>
        <p
          className="flex justify-between font-bold text-text-primary"
          style={{ paddingBlock: 2 * scale, fontSize: 10 * scale }}
        >
          <span>TOTAL</span>
          <span>{receipt.total}</span>
        </p>
      </div>
    </div>
  )
}

export function ScanReceiptsPage() {
  const { t } = useTranslation()
  const receipts = SCANNED_RECEIPTS
  const [activeId, setActiveId] = useState(
    receipts.find((receipt) => receipt.status === 'current')?.id ?? receipts[0].id,
  )
  const [saved, setSaved] = useState<string[]>(
    receipts.filter((receipt) => receipt.status === 'saved').map((receipt) => receipt.id),
  )

  const index = receipts.findIndex((receipt) => receipt.id === activeId)
  const receipt = receipts[index]

  /** One draft per receipt, so moving through the strip does not lose edits. */
  const [drafts, setDrafts] = useState<Record<string, Partial<ScannedReceipt>>>({})
  const [paidState, setPaidState] = useState<Record<string, PaidState>>({})
  const [paidMethod, setPaidMethod] = useState<Record<string, PaidMethod>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})

  const draft = { ...receipt, ...drafts[receipt.id] }
  const patch = (value: Partial<ScannedReceipt>) =>
    setDrafts((current) => ({ ...current, [receipt.id]: { ...current[receipt.id], ...value } }))

  /** Touching a field means a person has confirmed it, so its amber comes off. */
  const touched = drafts[receipt.id] ?? {}
  const vatUnsure = receipt.unsure.includes('vat') && touched.vat === undefined
  const categoryUnsure = receipt.unsure.includes('category') && touched.category === undefined

  const confirmedTotal = useMemo(
    () =>
      saved
        .map((id) => Number(receipts.find((r) => r.id === id)?.total.replace(/,/g, '') ?? 0))
        .reduce((sum, value) => sum + value, 0)
        .toFixed(3),
    [saved, receipts],
  )

  const percent = Math.round((saved.length / receipts.length) * 100)
  const state = paidState[receipt.id] ?? 'paidOnSpot'
  const method = paidMethod[receipt.id] ?? 'cash'

  const goTo = (step: number) => {
    const next = receipts[index + step]
    if (next) setActiveId(next.id)
  }

  const confirm = () => {
    setSaved((current) => (current.includes(receipt.id) ? current : [...current, receipt.id]))
    goTo(1)
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/expenditure/bills"
            className="text-2xl font-medium leading-[1.2] text-primary-700 hover:text-primary-800"
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
            {t('scanReceipts.subtitle', { count: receipts.length })}
          </p>
        </div>

        {/* Where you are in the pile */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
              <img src={cameraIcon} alt="" className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('scanReceipts.receiptOf', { current: index + 1, total: receipts.length })}
              </p>
              <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                {t('scanReceipts.progressMeta', {
                  saved: saved.length,
                  left: receipts.length - saved.length,
                  total: confirmedTotal,
                })}
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

        {/* The pile */}
        <div className="flex gap-3 overflow-x-auto rounded-md bg-surface-card p-4">
          {receipts.map((item, itemIndex) => {
            const isSaved = saved.includes(item.id)
            const active = item.id === activeId
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveId(item.id)}
                aria-current={active}
                className={[
                  'flex w-[116px] shrink-0 flex-col items-center gap-2 rounded-sm border-2 p-2 transition-colors',
                  active
                    ? 'border-primary-700 bg-primary-25'
                    : 'border-transparent hover:bg-surface-background',
                ].join(' ')}
              >
                <span className="relative block w-full overflow-hidden rounded-sm bg-[#f7f1e6]">
                  <span className="flex h-[104px] items-start justify-center overflow-hidden">
                    <ReceiptSheet receipt={item} scale={0.46} />
                  </span>
                  <span
                    className={[
                      'absolute end-1 top-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold',
                      isSaved
                        ? 'bg-success-700 text-white'
                        : active
                          ? 'bg-primary-700 text-white'
                          : 'bg-white text-text-tertiary ring-1 ring-border-default',
                    ].join(' ')}
                  >
                    {isSaved ? (
                      <img src={thumbCheckIcon} alt="" className="size-2.5" />
                    ) : (
                      itemIndex + 1
                    )}
                  </span>
                </span>
                <span
                  className={[
                    'text-xs font-medium leading-[1.2]',
                    active ? 'font-semibold text-primary-800' : 'text-text-tertiary',
                  ].join(' ')}
                >
                  {t(item.labelKey)}
                </span>
              </button>
            )
          })}

          <button
            type="button"
            className="flex w-[116px] shrink-0 flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-border-default p-2 text-text-tertiary transition-colors hover:border-primary-300 hover:text-primary-700"
          >
            <img src={plusIcon} alt="" className="size-5" />
            <span className="text-xs font-medium">{t('scanReceipts.addMore')}</span>
          </button>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          {/* The photo */}
          <section className="flex w-full flex-col self-start overflow-hidden rounded-md bg-[#2c3342] xl:w-[560px] xl:shrink-0">
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="rounded-sm bg-white shadow-card">
                <ReceiptSheet receipt={receipt} scale={1.4} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-white/80">
                <img src={photoIcon} alt="" className="size-5 brightness-0 invert" />
                {receipt.fileName} · {receipt.fileSize}
              </p>
              <div className="flex items-center gap-2">
                {[
                  { icon: rotateIcon, label: t('scanReceipts.rotate') },
                  { icon: zoomInIcon, label: t('invoiceDetails.zoomIn') },
                  { icon: fullscreenIcon, label: t('invoiceDetails.fullscreen') },
                  { icon: deleteIcon, label: t('scanReceipts.discard') },
                ].map((button) => (
                  <button
                    key={button.label}
                    type="button"
                    aria-label={button.label}
                    className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
                  >
                    <img src={button.icon} alt="" className="size-5" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* What we read */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {draft.merchant}
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => goTo(-1)}
                    disabled={index === 0}
                    className="inline-flex h-[42px] items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <img src={chevronIcon} alt="" className="size-4 rotate-180 rtl:rotate-0" />
                    {t('scanReceipts.previous')}
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(1)}
                    disabled={index === receipts.length - 1}
                    className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('scanReceipts.skip')}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-1.5">
                <FieldLabel label={t('scanReceipts.boughtFrom')} required />
                <Select
                  value={draft.merchant}
                  onChange={(value) => patch({ merchant: value })}
                  options={SUPPLIER_OPTIONS}
                  ariaLabel={t('scanReceipts.boughtFrom')}
                />
                <p className="flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-text-tertiary">
                  <img src={okCheckIcon} alt="" className="mt-px size-4 shrink-0" />
                  {t('scanReceipts.vatMatches')}
                </p>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('scanReceipts.date')} required />
                  <DateField
                    value={draft.date}
                    onChange={(value) => patch({ date: value })}
                    ariaLabel={t('scanReceipts.date')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('scanReceipts.receiptNumber')} />
                  <input
                    value={draft.number}
                    onChange={(event) => patch({ number: event.target.value })}
                    className={[
                      'h-[50px] rounded-sm border px-4 text-sm font-medium text-text-secondary outline-none',
                      SURE_SHELL,
                    ].join(' ')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('scanReceipts.totalPaid')} required />
                  <input
                    value={draft.total}
                    inputMode="decimal"
                    onChange={(event) => patch({ total: event.target.value })}
                    className={[
                      'h-[50px] rounded-sm border px-4 text-sm font-medium text-text-secondary outline-none',
                      SURE_SHELL,
                    ].join(' ')}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('scanReceipts.tax')}
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('scanReceipts.vatOnIt')} />
                  <input
                    value={draft.vat}
                    inputMode="decimal"
                    onChange={(event) => patch({ vat: event.target.value })}
                    aria-label={t('scanReceipts.vatOnIt')}
                    className={[
                      'h-[50px] rounded-sm border px-4 text-sm font-medium text-text-secondary outline-none',
                      vatUnsure ? UNSURE_SHELL : SURE_SHELL,
                    ].join(' ')}
                  />
                  {vatUnsure ? <Note tone="warn">{t('scanReceipts.smudged')}</Note> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('scanReceipts.vatRate')} />
                  <div
                    role="group"
                    aria-label={t('scanReceipts.vatRate')}
                    className="flex items-center gap-2"
                  >
                    {VAT_RATES.map((rate) => {
                      const active = draft.vatRate === rate.id
                      return (
                        <button
                          key={rate.id}
                          type="button"
                          onClick={() => patch({ vatRate: rate.id })}
                          aria-pressed={active}
                          className={[
                            'inline-flex h-[50px] flex-1 items-center justify-center rounded-sm border text-sm font-semibold transition-colors',
                            active
                              ? 'border-primary-700 bg-primary-50 text-primary-800'
                              : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                          ].join(' ')}
                        >
                          {t(rate.labelKey)}
                        </button>
                      )
                    })}
                  </div>
                  <Note tone="info">{t('scanReceipts.vatOnReceipt')}</Note>
                </div>
              </div>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('scanReceipts.whatItWasFor')}
              </h2>

              <div className="mt-4 flex flex-col gap-1.5">
                <FieldLabel label={t('scanReceipts.category')} required />
                <Select
                  value={draft.category}
                  onChange={(value) => patch({ category: value })}
                  options={EXPENSE_CATEGORIES.map((category) => ({
                    value: category,
                    label: category,
                  }))}
                  ariaLabel={t('scanReceipts.category')}
                  unsure={categoryUnsure}
                />
                {categoryUnsure ? <Note tone="warn">{t('scanReceipts.guessedFrom')}</Note> : null}
              </div>

              <div className="mt-4 flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium leading-[1.2] text-text-primary">
                  {t('scanReceipts.note')}
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('scanReceipts.optional')}
                  </span>
                </span>
                <input
                  value={notes[receipt.id] ?? ''}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [receipt.id]: event.target.value }))
                  }
                  placeholder={t('scanReceipts.notePlaceholder')}
                  className={[
                    'h-[50px] rounded-sm border px-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder',
                    SURE_SHELL,
                  ].join(' ')}
                />
              </div>

              <div className="mt-5">
                <p className="text-xs font-semibold uppercase leading-[1.2] tracking-[1px] text-text-quaternary">
                  {t('scanReceipts.wasItPaid')}
                </p>
                {/* Figma draws one row of five. They are two questions though — whether it was
                    settled, and with what — so the last three switch off when nothing was paid. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {PAID_STATES.map((option) => {
                    const active = state === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setPaidState((current) => ({ ...current, [receipt.id]: option.id }))
                        }
                        aria-pressed={active}
                        className={[
                          'inline-flex h-[50px] items-center gap-1.5 rounded-sm border px-3 text-sm font-semibold transition-colors',
                          active
                            ? 'border-primary-700 bg-primary-50 text-primary-800'
                            : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                        ].join(' ')}
                      >
                        {active ? <img src={okCheckIcon} alt="" className="size-4" /> : null}
                        {t(option.labelKey)}
                      </button>
                    )
                  })}

                  {PAID_METHODS.map((option) => {
                    const disabled = state === 'stillOwing'
                    const active = !disabled && method === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          setPaidMethod((current) => ({ ...current, [receipt.id]: option.id }))
                        }
                        aria-pressed={active}
                        className={[
                          'inline-flex h-[50px] items-center rounded-sm border px-3 text-sm font-semibold transition-colors',
                          active
                            ? 'border-primary-700 bg-primary-50 text-primary-800'
                            : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                          disabled ? 'cursor-not-allowed opacity-40 hover:bg-white' : '',
                        ].join(' ')}
                      >
                        {t(option.labelKey)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => goTo(1)}
                  disabled={index === receipts.length - 1}
                  className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('scanReceipts.skip')}
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                >
                  {saved.includes(receipt.id)
                    ? t('scanReceipts.savedNext')
                    : t('scanReceipts.confirmNext')}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
