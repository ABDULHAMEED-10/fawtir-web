import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { StepTracker } from '../../components/ui'
import { NEW_QUOTATION, NEW_QUOTATION_STEPS } from '../../lib/newQuotation'
import backIcon from '../../assets/quotation-create/back.svg'
import customerLogo from '../../assets/quotation-create/customer-logo.svg'
import chevronRightIcon from '../../assets/quotation-create/chevron-right.svg'
import warningIcon from '../../assets/quotation-create/warning.svg'
import calendarIcon from '../../assets/quotation-create/calendar.svg'
import plusIcon from '../../assets/quotation-create/plus.svg'
import deleteIcon from '../../assets/quotation-create/delete.svg'
import uploadIcon from '../../assets/quotation-create/upload.svg'
import eyeIcon from '../../assets/quotation-create/eye.svg'
import saveDraftIcon from '../../assets/quotation-create/save-draft.svg'
import sendIcon from '../../assets/quotation-create/send.svg'
import omrIcon from '../../assets/quotations/omr-row.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={['rounded-sm bg-surface-card p-4', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  )
}

/** Each section is numbered — a 24px #f3f3f3 tile with the step number in brand blue. */
function StepTitle({ step, title, action }: { step: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-[5px] bg-[#f3f3f3] text-[13px] font-extrabold leading-none text-[#233e92]">
          {step}
        </span>
        <h2 className="text-xl font-medium leading-[1.2] text-[#2c3342]">{title}</h2>
      </div>
      {action}
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

/** 50px shell — #fafafa on #8095d4, as every other form on the app. */
function Field({
  label,
  value,
  required,
  hint,
  suffix,
  brand,
  placeholder,
  className = '',
}: {
  label: string
  value?: string
  required?: boolean
  hint?: string
  suffix?: 'chevron' | 'calendar'
  brand?: boolean
  placeholder?: string
  className?: string
}) {
  return (
    <div className={className}>
      <FieldLabel label={label} required={required} hint={hint} />
      <div
        className={[
          'flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border bg-surface-tab-bar px-4',
          value ? 'border-primary-300' : 'border-[#e8e8ea]',
        ].join(' ')}
      >
        <span
          className={[
            'min-w-0 truncate text-sm font-medium',
            value ? (brand ? 'text-primary-900' : 'text-text-secondary') : 'text-[#8a8e96]',
          ].join(' ')}
        >
          {value || placeholder}
        </span>
        {suffix === 'chevron' ? (
          <img src={chevronIcon} alt="" className="size-5 shrink-0 rotate-90 opacity-70" />
        ) : null}
        {suffix === 'calendar' ? (
          <img src={calendarIcon} alt="" className="size-5 shrink-0" />
        ) : null}
      </div>
    </div>
  )
}

/** Description | Unit price | VAT | Quantity | Unit | Discount | Tot. Excl. */
const ITEM_GRID =
  'grid grid-cols-[minmax(180px,306fr)_104px_173px_103px_105px_81px_minmax(125px,1fr)] items-center gap-4'

function ItemCell({
  value,
  select,
  stepper,
}: {
  value: string
  select?: boolean
  stepper?: boolean
}) {
  return (
    <div className="relative">
      <div className="flex h-11 w-full items-center rounded-sm border border-primary-300 bg-surface-tab-bar px-4 pe-8 text-sm font-medium text-text-secondary">
        <span className="truncate">{value}</span>
      </div>
      {select ? (
        <img
          src={chevronIcon}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute end-2 top-1/2 size-5 -translate-y-1/2 rotate-90 opacity-70"
        />
      ) : null}
      {stepper ? (
        <span className="pointer-events-none absolute end-2 top-1/2 flex -translate-y-1/2 flex-col">
          <img
            src={chevronIcon}
            alt=""
            aria-hidden="true"
            className="size-4 -rotate-90 opacity-70"
          />
          <img
            src={chevronIcon}
            alt=""
            aria-hidden="true"
            className="size-4 rotate-90 opacity-70"
          />
        </span>
      ) : null}
    </div>
  )
}

function Amount({ value, size = 'sm' }: { value: string; size?: 'sm' | 'md' | 'lg' }) {
  const text = {
    sm: 'text-sm font-semibold',
    md: 'text-[19px] font-semibold',
    lg: 'text-[22px] font-semibold',
  }[size]
  const mark = { sm: 'w-4', md: 'w-5', lg: 'w-6' }[size]
  return (
    <span className="inline-flex items-center gap-0.5">
      <img src={omrIcon} alt="" className={['h-auto shrink-0', mark].join(' ')} />
      <span className={text}>{value}</span>
    </span>
  )
}

export function NewQuotationPage() {
  const { t } = useTranslation()
  const doc = NEW_QUOTATION
  const [vatMode, setVatMode] = useState<'excl' | 'incl'>('excl')

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-3 pb-[91px]">
        {/* Quotations › New quotation + trade-chain tracker */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/trade-documents/quotations"
                className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
              >
                {t('newQuotation.breadcrumb')}
              </Link>
              <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
            </div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">
                {t('newQuotation.title')}
              </h1>
              <span className="text-sm font-medium text-[#8f8f8f]">{doc.number}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-9">
            <StepTracker steps={NEW_QUOTATION_STEPS} />
            <span className="rounded-sm p-2 text-sm font-medium text-[#2c3342]">
              {t(doc.savedLabelKey)}
            </span>
          </div>
        </div>

        {/* 1 Customer (796) | Summary (332) */}
        <div className="grid gap-4 xl:grid-cols-[796fr_332px]">
          <Card>
            <StepTitle step="1" title={t('newQuotation.customer')} />
            {/* Selected customer */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-300 bg-[#f4f6fb] p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-sm">
                  <img src={customerLogo} alt="" className="size-[39px]" />
                </span>
                <div className="flex flex-col gap-[3px]">
                  <p className="text-sm font-medium leading-[1.2] text-[#151c2d]">
                    {doc.customer.name}
                  </p>
                  <p className="text-xs font-medium leading-[1.2] text-[#5b606c]">
                    {doc.customer.vat}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-[38px] items-center gap-0.5 rounded-sm border border-[#e8e8ea] bg-white ps-3.5 pe-2.5 text-sm font-semibold text-[#233e92]"
              >
                {t('newQuotation.change')}
                <img src={chevronRightIcon} alt="" className="size-6 rtl:rotate-180" />
              </button>
            </div>
            {/* A quote is not a tax document, so a prospect needs only a name and email. */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 rounded-sm bg-[#f4f6fb] px-3 py-2">
              <span className="flex min-w-0 flex-1 items-start gap-1.5">
                <img src={warningIcon} alt="" className="mt-0.5 size-[17px] shrink-0" />
                <span className="text-sm font-medium leading-[1.2] text-[#2c3342]">
                  {t('newQuotation.prospectHint')}
                </span>
              </span>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-[#2c4eb7]"
              >
                {t('newQuotation.addProspect')}
                <img src={chevronRightIcon} alt="" className="size-[18px] rtl:rotate-180" />
              </button>
            </div>
          </Card>

          {/* Summary */}
          <aside className="flex flex-col rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
            <h2 className="text-base font-medium leading-[1.2] text-[#151c2d]">
              {t('newQuotation.summary')}
            </h2>
            <dl className="mt-8 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#151c2d]/70">
                  {t('newQuotation.subtotal')}
                </dt>
                <dd className="text-sm text-[#2c3342]">
                  <Amount value={doc.totals.subtotal} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#151c2d]/50">
                  {t('newQuotation.discount')}
                </dt>
                <dd className="inline-flex items-center gap-0.5 text-sm text-[#5b606c]">
                  <span className="text-sm font-semibold">−</span>
                  <Amount value={doc.totals.discount} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#151c2d]/70">{t('newQuotation.net')}</dt>
                <dd className="text-sm text-[#2c3342]">
                  <Amount value={doc.totals.net} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#2c3342]">{t('newQuotation.vatLine')}</dt>
                <dd className="text-sm text-[#2c3342]">
                  <Amount value={doc.totals.vat} />
                </dd>
              </div>
            </dl>
            <div className="mt-auto flex items-center justify-between gap-3 pt-8">
              <span className="text-base font-medium text-[#151c2d]/90">
                {t('newQuotation.totalDue')}
              </span>
              <span className="text-[#151c2d]/90">
                <Amount value={doc.totals.total} size="lg" />
              </span>
            </div>
          </aside>
        </div>

        {/* 2 Quotation details */}
        <Card>
          <StepTitle step="2" title={t('newQuotation.detailsTitle')} />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t('newQuotation.quotationNumber')} value={doc.number} required brand />
            <Field
              label={t('newQuotation.issueDate')}
              value={doc.details.issueDate}
              required
              suffix="calendar"
            />
            <Field
              label={t('newQuotation.validUntil')}
              value={doc.details.validUntil}
              required
              hint={t('newQuotation.validUntilHint')}
              suffix="calendar"
            />
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-[737fr_359px]">
            <Field
              label={t('newQuotation.subject')}
              value={doc.details.subject}
              required
              hint={t('newQuotation.subjectHint')}
            />
            <Field
              label={t('newQuotation.branch')}
              value={doc.details.branch}
              required
              suffix="chevron"
            />
          </div>
        </Card>

        {/* 3 What you're offering */}
        <Card>
          <StepTitle
            step="3"
            title={t('newQuotation.itemsTitle')}
            action={
              <div className="inline-flex items-center gap-[1.5px] rounded-[3px] border border-[#eaedf8]/75 bg-[#f4f6fb] p-[3px]">
                {(['excl', 'incl'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setVatMode(mode)}
                    className={[
                      'h-[27px] rounded-[3px] px-3 text-xs leading-[1.2]',
                      vatMode === mode
                        ? 'bg-white font-semibold text-[#233e92]'
                        : 'font-medium text-[#5b606c]',
                    ].join(' ')}
                  >
                    {t(mode === 'excl' ? 'newQuotation.exclVat' : 'newQuotation.inclVat')}
                  </button>
                ))}
              </div>
            }
          />
          <div className="overflow-x-auto">
            <div className="min-w-[1050px]">
              <div
                className={[
                  ITEM_GRID,
                  'mb-3 text-xs font-semibold leading-[1.2] text-[#5b606c]',
                ].join(' ')}
              >
                <span>{t('newQuotation.col.description')}</span>
                <span>{t('newQuotation.col.unitPrice')}</span>
                <span>{t('newQuotation.col.vat')}</span>
                <span>{t('newQuotation.col.quantity')}</span>
                <span>{t('newQuotation.col.unit')}</span>
                <span>{t('newQuotation.col.discount')}</span>
                <span>{t('newQuotation.col.totExcl')}</span>
              </div>
              <div className="flex flex-col gap-3">
                {doc.items.map((item) => (
                  <div key={item.id} className={ITEM_GRID}>
                    <ItemCell value={item.description} select />
                    <ItemCell value={item.unitPrice} />
                    <ItemCell value={item.vat} />
                    <ItemCell value={item.qty} stepper />
                    <ItemCell value={item.unit} select />
                    <ItemCell value={item.discount} />
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xl font-semibold text-[#151c2d]/90">{item.total}</span>
                      <button
                        type="button"
                        aria-label={t('newQuotation.removeLine')}
                        className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-[#e8e8ea]"
                      >
                        <img src={deleteIcon} alt="" className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="mt-3 flex h-12 w-full items-center justify-center gap-1.5 rounded-sm border border-[#d0d2d5] text-base font-semibold text-[#2c4eb7]"
          >
            <img src={plusIcon} alt="" className="size-6" />
            {t('newQuotation.addLineItem')}
          </button>

          {/* Totals — right aligned under the grid */}
          <div className="mt-6 flex justify-end">
            <dl className="flex w-full max-w-[328px] flex-col gap-3">
              <div className="flex items-center justify-between gap-3 text-[#444957]">
                <dt className="text-sm font-medium">{t('newQuotation.subtotalExcl')}</dt>
                <dd>
                  <Amount value={doc.totals.subtotal} size="md" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-[#444957]">
                <dt className="text-sm font-medium">{t('newQuotation.discount')}</dt>
                <dd>
                  <Amount value={doc.totals.discount} size="md" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-[#444957]">
                <dt className="text-sm font-medium">{t('newQuotation.net')}</dt>
                <dd>
                  <Amount value={doc.totals.net} size="md" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-[#444957]">
                <dt className="text-sm font-medium">{t('newQuotation.vatLine')}</dt>
                <dd>
                  <Amount value={doc.totals.vat} size="md" />
                </dd>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#151c2d]">
                  {t('newQuotation.quotedTotal')}
                </dt>
                <dd className="text-[#2c3342]">
                  <Amount value={doc.totals.total} size="lg" />
                </dd>
              </div>
            </dl>
          </div>
        </Card>

        {/* 4 Terms */}
        <Card>
          <StepTitle step="4" title={t('newQuotation.termsTitle')} />
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label={t('newQuotation.paymentTerms')}
              value={doc.terms.paymentTerms}
              suffix="chevron"
            />
            <Field label={t('newQuotation.expectedDelivery')} value={doc.terms.expectedDelivery} />
            <Field label={t('newQuotation.leadTime')} placeholder={doc.terms.leadTimePlaceholder} />
          </div>
        </Card>

        {/* 5 Notes & attachments */}
        <Card>
          <StepTitle step="5" title={t('newQuotation.notesTitle')} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel
                label={t('newQuotation.noteToCustomer')}
                hint={t('newQuotation.noteToCustomerHint')}
              />
              <p className="min-h-[71px] rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium leading-[1.2] text-[#151c2d]">
                {doc.notes.customer}
              </p>
            </div>
            <div>
              <FieldLabel
                label={t('newQuotation.internalNote')}
                hint={t('newQuotation.internalNoteHint')}
              />
              <p className="min-h-[71px] rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium leading-[1.2] text-[#151c2d]">
                {doc.notes.internal}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <FieldLabel label={t('newQuotation.supportingDocuments')} />
            <div className="flex min-h-[129px] flex-col items-center justify-center gap-2 rounded-sm border border-[#a1a4ab] bg-[#f4f6fb] p-4 text-center">
              <img src={uploadIcon} alt="" className="size-6" />
              <p className="text-base font-medium leading-[1.2] text-[#2c3342]">
                {t('newQuotation.dropFiles')}
              </p>
              <p className="text-sm font-medium leading-[1.2] text-[#737781]">
                {t('newQuotation.dropFilesHint')}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Sticky action bar — sits beside the sidebar, never under it. */}
      <div className="fixed bottom-0 end-0 start-0 z-20 border-t border-black/10 bg-surface-tab-bar md:start-[248px]">
        <div className="mx-auto flex w-full max-w-[1144px] flex-wrap items-center justify-end gap-3 px-4 py-[19px]">
          <button
            type="button"
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-white px-4 text-sm font-semibold text-[#2c3342]"
          >
            <img src={eyeIcon} alt="" className="size-6" />
            {t('newQuotation.preview')}
          </button>
          <button
            type="button"
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-white px-4 text-sm font-semibold text-[#2c3342]"
          >
            <img src={saveDraftIcon} alt="" className="size-6" />
            {t('newQuotation.saveDraft')}
          </button>
          <button
            type="button"
            className="inline-flex h-[54px] items-center gap-1.5 rounded-sm bg-primary-700 px-10 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={sendIcon} alt="" className="size-6" />
            {t('newQuotation.sendQuotation')}
          </button>
        </div>
      </div>
    </AppShell>
  )
}
