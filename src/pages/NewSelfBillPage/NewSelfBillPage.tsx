import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { NEW_SELF_BILL, SELF_BILL_KINDS, type SelfBillKind } from '../../lib/selfBillCreate'
import { useLineTotals } from '../../components/invoice'
import { OmAmount, withRial } from '../../components/ui'
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
}: {
  label: string
  required?: boolean
  hint?: string
}) {
  return (
    <div className="mb-1 flex flex-wrap items-baseline gap-1">
      <span className="text-sm font-medium leading-[1.2] text-text-primary">{label}</span>
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      {hint ? <span className="text-[10px] font-medium text-text-quaternary">{hint}</span> : null}
    </div>
  )
}

/** 50px field shell — #fafafa on #8095d4, matching every other form on the app. */
function Field({
  label,
  value,
  required,
  hint,
  select,
  muted,
}: {
  label: string
  value: string
  required?: boolean
  hint?: string
  select?: boolean
  muted?: boolean
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} hint={hint} />
      <div className="flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4">
        <span
          className={[
            'min-w-0 truncate text-sm font-medium',
            muted ? 'text-text-muted' : 'text-text-secondary',
          ].join(' ')}
        >
          {value}
        </span>
        {select ? (
          <img src={chevronIcon} alt="" className="size-5 shrink-0 rotate-90 opacity-70" />
        ) : null}
      </div>
    </div>
  )
}

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
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-[1.2] text-text-primary">{label}</p>
        <p className="mt-1 text-sm font-medium leading-[1.3] text-text-quaternary">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          'relative h-[23px] w-[42px] shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary-700' : 'bg-neutral-100',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-[2.5px] size-[18px] rounded-full bg-white transition-all',
            checked ? 'start-[21px]' : 'start-[2.5px]',
          ].join(' ')}
        />
      </button>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">{children}</section>
  )
}

export function NewSelfBillPage() {
  const { t } = useTranslation()
  const doc = NEW_SELF_BILL
  const [kind, setKind] = useState<SelfBillKind>('agreed')
  const [exclVat, setExclVat] = useState(true)
  const [lines, setLines] = useState<ComposerLine[]>(INITIAL_LINES)
  const totals = useLineTotals(lines, exclVat)
  const [recordPayment, setRecordPayment] = useState(doc.payment.recordNow)
  const [deliverByEmail, setDeliverByEmail] = useState(doc.payment.deliverByEmail)

  const isAgreed = kind === 'agreed'

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        {/* Header — breadcrumb, draft reference, autosave note and the quota counter. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Self-billed › New self-billed invoice · SB-0115 · Draft */}
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
                    {doc.supplier.name}
                  </p>
                  <p className="truncate text-xs font-medium leading-[1.2] text-text-quaternary">
                    {doc.supplier.vat}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-7 items-center gap-1 rounded-full border border-primary-75 bg-white py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                  <img src={peppolIcon} alt="" className="size-4" />
                  {t('newSelfBill.onPeppol')}
                </span>
                <button
                  type="button"
                  className="inline-flex h-[38px] items-center gap-0.5 rounded-sm border border-border-subtle bg-white py-1.5 ps-3.5 pe-2.5 text-sm font-semibold text-primary-800"
                >
                  {t('newSelfBill.change')}
                  <img src={chevronIcon} alt="" className="size-5 rotate-90" />
                </button>
              </div>
            </div>

            {/* Seller → Buyer, so it is unambiguous who owes whom. */}
            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
              <div className="flex-1 rounded-sm border border-border-subtle bg-surface-tab-bar p-3.5">
                <p className="text-xs font-semibold leading-[1.2] text-text-quaternary">
                  {t('newSelfBill.parties.seller')}
                </p>
                <p className="mt-1.5 text-base font-medium leading-[1.2] text-text-primary">
                  {doc.seller.name}
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

            {isAgreed ? (
              <div className="flex flex-wrap items-center gap-3 rounded-sm bg-success-100 px-4 py-3">
                <img src={signedIcon} alt="" className="size-[18px] shrink-0" />
                <p className="min-w-0 flex-1 text-sm font-medium leading-[1.2] text-[#3d5648]">
                  {t('newSelfBill.agreementBanner', { reference: doc.agreementRef })}
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
            <Field label={t('newSelfBill.fields.number')} value={doc.fields.number} required />
            <Field
              label={t('newSelfBill.fields.issueDate')}
              value={doc.fields.issueDate}
              required
            />
            <Field
              label={t('newSelfBill.fields.supplyDate')}
              value={doc.fields.supplyDate}
              required
              hint={t('newSelfBill.fields.supplyDateHint')}
            />
            <Field
              label={t('newSelfBill.fields.paymentTerms')}
              value={doc.fields.paymentTerms}
              required
              select
            />
            <Field
              label={t('newSelfBill.fields.paymentDue')}
              value={doc.fields.paymentDue}
              required
            />
            <Field
              label={t('newSelfBill.fields.receivingBranch')}
              value={doc.fields.receivingBranch}
              required
              select
            />
            <Field
              label={t('newSelfBill.fields.currency')}
              value={doc.fields.currency}
              required
              select
            />
            <Field
              label={t('newSelfBill.fields.taxCategory')}
              value={doc.fields.taxCategory}
              required
              select
            />
            <Field
              label={t('newSelfBill.fields.agreement')}
              value={doc.fields.agreement}
              muted
              select
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_376px]">
            <Field label={t('newSelfBill.fields.subject')} value={doc.fields.subject} />
            <Field label={t('newSelfBill.fields.poReference')} value={doc.fields.poReference} />
          </div>
        </Card>

        {/* 3 Items supplied to you */}
        <LineComposer
          lines={lines}
          onChange={setLines}
          exclVat={exclVat}
          onExclVatChange={setExclVat}
          totals={totals}
          taxLabel={doc.fields.taxCategory}
          titleSlot={<SectionTitle step={3} title={t('newSelfBill.sections.items')} />}
          footer={
            <>
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
            </>
          }
        />

        {/* 4 Payment to supplier */}
        <Card>
          <SectionTitle step={4} title={t('newSelfBill.sections.payment')} />
          <div className="h-px w-full bg-surface-background" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label={t('newSelfBill.fields.paymentMethod')}
              value={doc.payment.method}
              select
            />
            <Field label={t('newSelfBill.fields.paymentReference')} value={doc.payment.reference} />
          </div>
          <div className="grid gap-6 pt-2 md:grid-cols-2">
            <ToggleRow
              label={t('newSelfBill.toggles.recordPayment')}
              hint={t('newSelfBill.toggles.recordPaymentHint')}
              checked={recordPayment}
              onChange={setRecordPayment}
            />
            <ToggleRow
              label={t('newSelfBill.toggles.deliverByEmail')}
              hint={t('newSelfBill.toggles.deliverByEmailHint')}
              checked={deliverByEmail}
              onChange={setDeliverByEmail}
            />
          </div>
        </Card>

        {/* 5 Notes & attachments */}
        <Card>
          <SectionTitle step={5} title={t('newSelfBill.sections.notes')} />
          <div className="h-px w-full bg-surface-background" />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium leading-[1.2] text-text-primary">
                  {t('newSelfBill.notes.supplier')}
                </span>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('newSelfBill.notes.printed')}
                </span>
              </div>
              <div className="min-h-[85px] rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium text-text-primary">
                {doc.notes.supplier}
              </div>
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium leading-[1.2] text-text-primary">
                  {t('newSelfBill.notes.internal')}
                </span>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('newSelfBill.notes.private')}
                </span>
              </div>
              <div className="min-h-[85px] rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium text-text-primary">
                {withRial(doc.notes.internal)}
              </div>
            </div>
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

      {/* Sticky action bar — starts after the 248px sidebar so it never covers the nav. */}
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
