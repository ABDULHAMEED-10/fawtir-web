import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { NEW_SELF_BILL, SELF_BILL_KINDS, type SelfBillKind } from '../../lib/selfBillCreate'
import { AGREEMENT_ROWS } from '../../lib/agreements'
import { dueDateFor } from '../../lib/invoiceIssue'
import { useLineTotals } from '../../components/invoice'
import {
  DateField,
  LockIcon,
  OmAmount,
  Popover,
  Select,
  Switch,
  type SelectOption,
} from '../../components/ui'
import { LineComposer, type ComposerLine } from './LineComposer'
import { formatAtScale } from '../../lib/invoiceMath'
import businessIcon from '../../assets/create-invoice/business.svg'
import statutoryIcon from '../../assets/customers/type-government.svg'
import tickCircle from '../../assets/customers/tick-circle.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import backIcon from '../../assets/invoice-details/back.svg'
import savedIcon from '../../assets/self-bill-detail/saved.svg'
import peppolIcon from '../../assets/periodic/peppol.svg'
import customerLogo from '../../assets/periodic/customer-logo.svg'
import eyeIcon from '../../assets/actions/view.svg'
import saveDraftIcon from '../../assets/customers/save.svg'
import arrowIcon from '../../assets/create-invoice/arrow.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'
import signedIcon from '../../assets/agreements/signed.svg'

/**
 * New self-billed invoice (Figma 154:161180). Not integrated yet: the form is creatable from
 * scratch on the page, with the design's mock document as its starting values, and follows the
 * client's composer rules through `LineComposer`.
 */

/** The two lines from the design, priced through the same engine the invoice uses. */
const INITIAL_LINES: ComposerLine[] = [
  {
    id: '1',
    kind: 'goods',
    description: 'Cappuccino - Large',
    unitPrice: '1.800',
    vatRate: '5',
    quantity: '12',
    unit: 'EA',
    discountType: 'PERCENTAGE',
    discountValue: '0',
  },
  {
    id: '2',
    kind: 'goods',
    description: 'Coffee Beans 1kg - H Blend',
    unitPrice: '9.500',
    vatRate: '5',
    quantity: '4',
    unit: 'KGM',
    discountType: 'PERCENTAGE',
    discountValue: '10',
  },
]

const KIND_ICONS: Record<SelfBillKind, string> = {
  agreed: businessIcon,
  statutory: statutoryIcon,
}

const TERMS = ['NET0', 'NET15', 'NET30', 'NET60', 'EOM', 'ADVANCE'] as const
const TAX_CATEGORIES = ['S5', 'Z0', 'E0', 'AE0'] as const
/** The line rate each document category implies; the category is the document's, not the line's. */
const RATE_OF_CATEGORY: Record<(typeof TAX_CATEGORIES)[number], string> = {
  S5: '5',
  Z0: '0',
  E0: '0',
  AE0: '0',
}
const PAYMENT_METHODS = ['30', '10', '20', '48', '68'] as const
const BRANCHES: SelectOption[] = [
  { value: 'main', label: 'Al Bahja Coffee (Main)' },
  { value: 'seeb', label: 'Al Bahja Coffee (Seeb)' },
]
const CURRENCIES: SelectOption[] = [{ value: 'OMR', label: 'OMR - Omani Rial' }]

type Supplier = { name: string; vat: string; onPeppol: boolean; agreement: string | null }

/** The suppliers with an agreement on file, offered by the "Change" picker. */
const SUPPLIERS: Supplier[] = [
  {
    name: NEW_SELF_BILL.supplier.name,
    vat: NEW_SELF_BILL.supplier.vat,
    onPeppol: true,
    agreement: NEW_SELF_BILL.agreementRef,
  },
  ...AGREEMENT_ROWS.filter((row) => row.supplier !== NEW_SELF_BILL.supplier.name).map((row) => ({
    name: row.supplier,
    vat: row.vat,
    onPeppol: row.onPeppol,
    agreement: row.kind === 'agreed' ? row.reference : null,
  })),
]

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
        {step}
      </span>
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
    </div>
  )
}

function FieldLabel({
  label,
  required,
  hint,
  htmlFor,
}: {
  label: string
  required?: boolean
  hint?: string
  htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex flex-wrap items-baseline gap-1">
      <span className="text-sm font-medium leading-[1.2] text-text-primary">{label}</span>
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      {hint ? <span className="text-[10px] font-medium text-text-quaternary">{hint}</span> : null}
    </label>
  )
}

const SHELL =
  'flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4'

/** 50px text field, #fafafa on #8095d4, matching every other form on the app. */
function TextField({
  id,
  label,
  value,
  onChange,
  required,
  hint,
  highlighted,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  hint?: string
  /** The design tints the self-bill number's shell. */
  highlighted?: boolean
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} hint={hint} htmlFor={id} />
      <div className={[SHELL, highlighted ? 'bg-primary-25' : ''].join(' ')}>
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={200}
          className="w-full min-w-0 border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
        />
      </div>
    </div>
  )
}

/** A value the page fills for the reader and does not let them edit: the design draws a lock. */
function LockedField({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <FieldLabel label={label} />
      <div title={hint} className={[SHELL, 'border-border-subtle'].join(' ')}>
        <span className="min-w-0 truncate text-sm font-medium text-text-muted">{value}</span>
        <LockIcon className="shrink-0 text-text-quaternary" />
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  required?: boolean
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} />
    </div>
  )
}

function DateInput({
  label,
  value,
  onChange,
  required,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  hint?: string
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} hint={hint} />
      <DateField value={value} onChange={onChange} ariaLabel={label} />
    </div>
  )
}

/** The design's switch sits before its words (Figma 154:161180). */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-0.5 shrink-0">
        <Switch checked={checked} onChange={onChange} label={label} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-[1.2] text-text-primary">{label}</p>
        <p className="mt-1 text-sm font-medium leading-[1.3] text-text-quaternary">{hint}</p>
      </div>
    </div>
  )
}

function NoteField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium leading-[1.2] text-text-primary">{label}</span>
        <span className="text-xs font-medium text-text-quaternary">{hint}</span>
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={1000}
        className="min-h-[85px] w-full resize-y rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium text-text-primary outline-none focus:border-primary-500"
      />
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">{children}</section>
  )
}

/** `dd/mm/yyyy` from the design's mock into the local `yyyy-mm-dd` the date field keeps. */
function dateKeyOf(display: string): string {
  const [day, month, year] = display.split('/')
  return `${year}-${month}-${day}`
}

export function NewSelfBillPage() {
  const { t } = useTranslation()
  const doc = NEW_SELF_BILL
  const [kind, setKind] = useState<SelfBillKind>('agreed')
  const [supplier, setSupplier] = useState<Supplier>(SUPPLIERS[0])
  const [pickingSupplier, setPickingSupplier] = useState(false)
  const changeRef = useRef<HTMLButtonElement>(null)

  const [number, setNumber] = useState(doc.fields.number)
  const [issueDate, setIssueDate] = useState(dateKeyOf(doc.fields.issueDate))
  const [supplyDate, setSupplyDate] = useState(dateKeyOf(doc.fields.supplyDate))
  const [terms, setTerms] = useState<string>('NET30')
  const [paymentDue, setPaymentDue] = useState(dateKeyOf(doc.fields.paymentDue))
  const [branch, setBranch] = useState('main')
  const [currency, setCurrency] = useState('OMR')
  const [taxCategory, setTaxCategory] = useState<string>('S5')
  const [subject, setSubject] = useState(doc.fields.subject)
  const [poReference, setPoReference] = useState(doc.fields.poReference)

  const [exclVat, setExclVat] = useState(true)
  const [lines, setLines] = useState<ComposerLine[]>(INITIAL_LINES)
  const totals = useLineTotals(lines, exclVat)

  const [paymentMethod, setPaymentMethod] = useState('30')
  const [paymentReference, setPaymentReference] = useState(doc.payment.reference)
  const [recordPayment, setRecordPayment] = useState(doc.payment.recordNow)
  const [deliverByEmail, setDeliverByEmail] = useState(doc.payment.deliverByEmail)
  const [noteSupplier, setNoteSupplier] = useState(doc.notes.supplier)
  const [noteInternal, setNoteInternal] = useState(doc.notes.internal)

  const isAgreed = kind === 'agreed'
  const agreementRef = isAgreed ? supplier.agreement : null
  const taxLabel = t(`createInvoice.taxCategories.${taxCategory}`)

  // The due date follows the terms, counted from the issue date, unless the reader sets it.
  const onIssueDate = (next: string) => {
    setIssueDate(next)
    if (next) setPaymentDue(dueDateFor(next, terms))
  }
  const onTerms = (next: string) => {
    setTerms(next)
    if (issueDate) setPaymentDue(dueDateFor(issueDate, next))
  }
  // The category is the document's: every line takes its rate.
  const onTaxCategory = (next: string) => {
    setTaxCategory(next)
    const rate = RATE_OF_CATEGORY[next as (typeof TAX_CATEGORIES)[number]] ?? '0'
    setLines((current) => current.map((line) => ({ ...line, vatRate: rate })))
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        {/* Header: breadcrumb, draft reference, autosave note and the quota counter. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/income/self-billing"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('newSelfBill.breadcrumb')}
            </Link>
            <img
              src={backIcon}
              alt=""
              aria-hidden="true"
              className="size-6 rotate-180 rtl:rotate-0"
            />
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('newSelfBill.title')}
            </h1>
            <span className="ms-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">
              {doc.reference}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <span className="inline-flex items-center gap-2">
              <img src={savedIcon} alt="" className="size-4" />
              <span className="text-sm font-medium leading-[1.2] text-text-secondary">
                {doc.savedNote}
              </span>
            </span>
            {/* Quota: 189×11 track with a blue fill, per Figma. */}
            <span className="flex flex-col gap-1.5">
              <span className="flex items-baseline gap-1">
                <span className="text-[22px] font-semibold leading-[1.2] text-text-primary">
                  {doc.quotaUsed}
                </span>
                <span className="text-[11px] font-medium leading-[1.2] text-text-primary">
                  {doc.quotaTotal}
                </span>
              </span>
              <span className="block h-[11px] w-[189px] overflow-hidden rounded-[2px] bg-white">
                <span
                  className="block h-full rounded-[2px] bg-primary-700"
                  style={{ width: `${doc.quotaPercent}%` }}
                />
              </span>
            </span>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_332px]">
          {/* 1 Supplier you are billing for */}
          <Card>
            <SectionTitle step={1} title={t('newSelfBill.sections.supplier')} />
            <div className="h-px w-full bg-surface-background" />

            <div className="grid gap-4 md:grid-cols-2">
              {SELF_BILL_KINDS.map((option) => {
                const active = option.id === kind
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setKind(option.id)}
                    aria-pressed={active}
                    className={[
                      'flex h-[65px] items-center gap-2 rounded-sm px-4 text-start transition-colors',
                      active
                        ? 'border-2 border-primary-500 bg-primary-50'
                        : 'border border-border-default hover:border-primary-300',
                    ].join(' ')}
                  >
                    <img
                      src={KIND_ICONS[option.id]}
                      alt=""
                      className={['size-6 shrink-0', active ? '' : 'opacity-70'].join(' ')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium leading-[1.2] text-text-primary">
                        {t(option.titleKey)}
                      </span>
                      <span className="block text-xs font-medium leading-[1.2] text-text-tertiary">
                        {t(option.hintKey)}
                      </span>
                    </span>
                    {active ? (
                      <img src={tickCircle} alt="" className="size-[18px] shrink-0" />
                    ) : null}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-2 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <img src={customerLogo} alt="" className="size-12 rounded-sm object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-base font-medium leading-[1.2] text-text-primary">
                    {supplier.name}
                  </p>
                  <p className="truncate text-xs font-medium leading-[1.2] text-text-quaternary">
                    {supplier.vat}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                {supplier.onPeppol ? (
                  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-primary-75 bg-white py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                    <img src={peppolIcon} alt="" className="size-4" />
                    {t('newSelfBill.onPeppol')}
                  </span>
                ) : null}
                <button
                  ref={changeRef}
                  type="button"
                  onClick={() => setPickingSupplier((open) => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={pickingSupplier}
                  className="inline-flex h-[38px] items-center gap-0.5 rounded-sm border border-border-subtle bg-white py-1.5 ps-3.5 pe-2.5 text-sm font-semibold text-primary-800"
                >
                  {t('newSelfBill.change')}
                  <img src={chevronIcon} alt="" className="size-5 rotate-90" />
                </button>
                <Popover
                  open={pickingSupplier}
                  anchorRef={changeRef}
                  onClose={() => setPickingSupplier(false)}
                  width={320}
                  align="end"
                >
                  <ul role="listbox" aria-label={t('newSelfBill.chooseSupplier')} className="py-1">
                    {SUPPLIERS.map((option) => (
                      <li key={option.name}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={option.name === supplier.name}
                          onClick={() => {
                            setSupplier(option)
                            setPickingSupplier(false)
                          }}
                          className={[
                            'flex w-full flex-col items-start px-4 py-2.5 text-start transition-colors hover:bg-primary-25',
                            option.name === supplier.name ? 'bg-primary-25' : '',
                          ].join(' ')}
                        >
                          <span className="text-sm font-semibold text-text-primary">
                            {option.name}
                          </span>
                          <span className="text-xs font-medium text-text-quaternary">
                            {[option.vat, option.agreement].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Popover>
              </div>
            </div>

            {/* Seller → Buyer, so it is unambiguous who owes whom. */}
            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
              <div className="flex-1 rounded-sm border border-border-subtle bg-surface-tab-bar p-3.5">
                <p className="text-xs font-semibold leading-[1.2] text-text-quaternary">
                  {t('newSelfBill.parties.seller')}
                </p>
                <p className="mt-1.5 text-base font-medium leading-[1.2] text-text-primary">
                  {supplier.name}
                </p>
                <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-tertiary">
                  {t(doc.seller.noteKey)}
                </p>
              </div>
              <span className="flex shrink-0 items-center justify-center px-2">
                <img src={arrowIcon} alt="" className="size-6 rtl:rotate-180" />
              </span>
              <div className="flex-1 rounded-sm border border-primary-75 bg-primary-25 p-3.5">
                <p className="text-xs font-semibold leading-[1.2] text-text-quaternary">
                  {t('newSelfBill.parties.buyer')}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-base font-medium leading-[1.2] text-text-primary">
                  {doc.buyer.name}
                  <span className="inline-flex h-[18px] items-center rounded-[2px] bg-primary-700 px-2 text-[10px] font-semibold text-white">
                    {t('newSelfBill.parties.you')}
                  </span>
                </p>
                <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-tertiary">
                  {t(doc.buyer.noteKey)}
                </p>
              </div>
            </div>

            {isAgreed && agreementRef ? (
              <div className="flex flex-wrap items-center gap-3 rounded-sm bg-success-100 px-4 py-3">
                <img src={signedIcon} alt="" className="size-[18px] shrink-0" />
                <p className="min-w-0 flex-1 text-sm font-medium leading-[1.2] text-[#3d5648]">
                  {t('newSelfBill.agreementBanner', { reference: agreementRef })}
                </p>
                <Link
                  to="/income/self-billing/agreements"
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
                >
                  {t('newSelfBill.viewAgreement')}
                  <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
                </Link>
              </div>
            ) : null}
          </Card>

          {/* Summary rail */}
          <aside className="flex flex-col gap-4">
            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('newSelfBill.summary.title')}
              </h2>
              <div className="mt-4 flex flex-col gap-3.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('newSelfBill.summary.subtotal')}
                  </span>
                  <OmAmount
                    size="xs"
                    amount={formatAtScale(totals.subtotal)}
                    amountClassName="font-semibold text-text-secondary"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('newSelfBill.summary.discount')}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-text-quaternary">
                    −
                    <OmAmount
                      size="xs"
                      amount={formatAtScale(totals.itemDiscount + totals.headerDiscount)}
                      amountClassName="font-semibold text-text-quaternary"
                      iconClassName="text-text-quaternary"
                    />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('newSelfBill.summary.net')}
                  </span>
                  <OmAmount
                    size="xs"
                    amount={formatAtScale(totals.taxable)}
                    amountClassName="font-semibold text-text-secondary"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-secondary">
                    {t('newSelfBill.summary.vat')}
                  </span>
                  <OmAmount
                    size="xs"
                    amount={formatAtScale(totals.vat)}
                    amountClassName="font-semibold text-text-secondary"
                  />
                </div>
                <div className="h-px w-full bg-surface-background" />
                <div className="flex items-center justify-between">
                  <span className="text-base font-medium text-text-primary">
                    {t('newSelfBill.summary.totalDue')}
                  </span>
                  <OmAmount
                    size="md"
                    amount={formatAtScale(totals.total)}
                    amountClassName="text-[22px] font-semibold leading-[1.2] text-text-primary"
                  />
                </div>
              </div>
            </section>
            {/* Amber note: a self-bill is an outgoing payable, not revenue. */}
            <p className="rounded-sm bg-pending-100 p-3 text-sm font-medium leading-[1.4] text-text-tertiary">
              {t('newSelfBill.payableNote')}
            </p>
          </aside>
        </div>

        {/* 2 Document details */}
        <Card>
          <SectionTitle step={2} title={t('newSelfBill.sections.document')} />
          <div className="h-px w-full bg-surface-background" />
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              id="sb-number"
              label={t('newSelfBill.fields.number')}
              value={number}
              onChange={setNumber}
              required
              highlighted
            />
            <DateInput
              label={t('newSelfBill.fields.issueDate')}
              value={issueDate}
              onChange={onIssueDate}
              required
            />
            <DateInput
              label={t('newSelfBill.fields.supplyDate')}
              value={supplyDate}
              onChange={setSupplyDate}
              required
              hint={t('newSelfBill.fields.supplyDateHint')}
            />
            <SelectField
              label={t('newSelfBill.fields.paymentTerms')}
              value={terms}
              onChange={onTerms}
              options={TERMS.map((code) => ({
                value: code,
                label: t(`createInvoice.terms.${code}`),
              }))}
              required
            />
            <DateInput
              label={t('newSelfBill.fields.paymentDue')}
              value={paymentDue}
              onChange={setPaymentDue}
              required
            />
            <SelectField
              label={t('newSelfBill.fields.receivingBranch')}
              value={branch}
              onChange={setBranch}
              options={BRANCHES}
              required
            />
            <SelectField
              label={t('newSelfBill.fields.currency')}
              value={currency}
              onChange={setCurrency}
              options={CURRENCIES}
              required
            />
            <SelectField
              label={t('newSelfBill.fields.taxCategory')}
              value={taxCategory}
              onChange={onTaxCategory}
              options={TAX_CATEGORIES.map((code) => ({
                value: code,
                label: t(`createInvoice.taxCategories.${code}`),
              }))}
              required
            />
            <LockedField
              label={t('newSelfBill.fields.agreement')}
              value={agreementRef ?? t('newSelfBill.noAgreement')}
              hint={t('newSelfBill.agreementLocked')}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_376px]">
            <TextField
              id="sb-subject"
              label={t('newSelfBill.fields.subject')}
              value={subject}
              onChange={setSubject}
            />
            <TextField
              id="sb-po"
              label={t('newSelfBill.fields.poReference')}
              value={poReference}
              onChange={setPoReference}
            />
          </div>
        </Card>

        {/* 3 Items supplied to you */}
        <LineComposer
          lines={lines}
          onChange={setLines}
          exclVat={exclVat}
          onExclVatChange={setExclVat}
          totals={totals}
          taxLabel={taxLabel}
          titleSlot={<SectionTitle step={3} title={t('newSelfBill.sections.items')} />}
          footer={
            <div className="ms-auto flex w-full max-w-[301px] flex-col gap-3.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-secondary">
                  {t('newSelfBill.totals.excluding')}
                </span>
                <OmAmount
                  size="xs"
                  amount={formatAtScale(totals.taxable)}
                  amountClassName="text-base font-semibold text-text-secondary"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-secondary">
                  {t('newSelfBill.totals.vat')}
                </span>
                <OmAmount
                  size="xs"
                  amount={formatAtScale(totals.vat)}
                  amountClassName="text-base font-semibold text-text-secondary"
                />
              </div>
              <div className="h-px w-full bg-surface-background" />
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-primary">
                  {t('newSelfBill.totals.total')}
                </span>
                <OmAmount
                  size="sm"
                  amount={formatAtScale(totals.total)}
                  amountClassName="text-xl font-semibold text-text-primary"
                />
              </div>
            </div>
          }
        />

        {/* 4 Payment to supplier */}
        <Card>
          <SectionTitle step={4} title={t('newSelfBill.sections.payment')} />
          <div className="h-px w-full bg-surface-background" />
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label={t('newSelfBill.fields.paymentMethod')}
              value={paymentMethod}
              onChange={setPaymentMethod}
              options={PAYMENT_METHODS.map((code) => ({
                value: code,
                label: t(`createInvoice.paymentMethods.${code}`),
              }))}
            />
            <TextField
              id="sb-payment-reference"
              label={t('newSelfBill.fields.paymentReference')}
              value={paymentReference}
              onChange={setPaymentReference}
            />
          </div>
          <div className="grid gap-6 pt-2 md:grid-cols-2 md:divide-x md:divide-border-subtle">
            <ToggleRow
              label={t('newSelfBill.toggles.recordPayment')}
              hint={t('newSelfBill.toggles.recordPaymentHint')}
              checked={recordPayment}
              onChange={setRecordPayment}
            />
            <div className="md:ps-6">
              <ToggleRow
                label={t('newSelfBill.toggles.deliverByEmail')}
                hint={t('newSelfBill.toggles.deliverByEmailHint')}
                checked={deliverByEmail}
                onChange={setDeliverByEmail}
              />
            </div>
          </div>
        </Card>

        {/* 5 Notes & attachments */}
        <Card>
          <SectionTitle step={5} title={t('newSelfBill.sections.notes')} />
          <div className="h-px w-full bg-surface-background" />
          <div className="grid gap-4 md:grid-cols-2">
            <NoteField
              id="sb-note-supplier"
              label={t('newSelfBill.notes.supplier')}
              hint={t('newSelfBill.notes.printed')}
              value={noteSupplier}
              onChange={setNoteSupplier}
            />
            <NoteField
              id="sb-note-internal"
              label={t('newSelfBill.notes.internal')}
              hint={t('newSelfBill.notes.private')}
              value={noteInternal}
              onChange={setNoteInternal}
            />
          </div>
          <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border-default bg-surface-tab-bar py-8">
            <img src={uploadIcon} alt="" className="size-8" />
            <p className="text-base font-medium text-text-secondary">
              {t('newSelfBill.attachments.drop')}
            </p>
            <p className="text-sm font-medium text-text-muted">
              {t('newSelfBill.attachments.hint')}
            </p>
          </div>
        </Card>
      </div>

      {/* Sticky action bar: starts after the 248px sidebar so it never covers the nav. */}
      <div className="fixed bottom-0 end-0 start-0 z-20 border-t border-black/10 bg-surface-tab-bar md:start-[248px]">
        <div className="mx-auto flex max-w-[1144px] items-center justify-end gap-3 px-4 py-4">
          <button
            type="button"
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
          >
            <img src={eyeIcon} alt="" className="size-6" />
            {t('newSelfBill.actions.preview')}
          </button>
          <button
            type="button"
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
          >
            <img src={saveDraftIcon} alt="" className="size-6" />
            {t('newSelfBill.actions.saveDraft')}
          </button>
          <button
            type="button"
            className="inline-flex h-[54px] min-w-[255px] items-center justify-center gap-1.5 rounded-sm bg-primary-700 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t('newSelfBill.actions.issue')}
            <img
              src={chevronIcon}
              alt=""
              className="size-[18px] brightness-0 invert rtl:rotate-180"
            />
          </button>
        </div>
      </div>
    </AppShell>
  )
}
