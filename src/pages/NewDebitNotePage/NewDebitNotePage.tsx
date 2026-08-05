import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu } from '../../components/ui'
import { debitNoteRowActions } from '../../lib/rowActions'
import { DEBIT_BASES, NEW_DEBIT_NOTE, type DebitBasis } from '../../lib/newDebitNote'
import saveDraftIcon from '../../assets/debit-note-create/save-draft.svg'
import invoiceTileIcon from '../../assets/debit-note-create/invoice-tile.svg'
import optCorrectIcon from '../../assets/debit-note-create/opt-correct.svg'
import optAdditionalIcon from '../../assets/debit-note-create/opt-additional.svg'
import optFlatIcon from '../../assets/debit-note-create/opt-flat.svg'
import infoIcon from '../../assets/debit-note-create/info.svg'
import trendUpIcon from '../../assets/debit-note-create/trend-up.svg'
import peppolIcon from '../../assets/debit-note-create/peppol.svg'
import tickCircle from '../../assets/customers/tick-circle.svg'
import issueIcon from '../../assets/customers/save.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import calendarIcon from '../../assets/create-invoice/calendar.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'

const BASIS_ICONS: Record<DebitBasis, string> = {
  correctLines: optCorrectIcon,
  additionalItems: optAdditionalIcon,
  flatCharge: optFlatIcon,
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={['rounded-sm bg-surface-card p-4', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  )
}

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
      {action}
    </div>
  )
}

function FieldLabel({ label, required, hint }: { label: string; required?: boolean; hint?: string }) {
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
}: {
  label: string
  value?: string
  required?: boolean
  hint?: string
  suffix?: 'chevron' | 'calendar'
  brand?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} hint={hint} />
      <div className="flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4">
        <span
          className={[
            'min-w-0 truncate text-sm font-medium',
            value ? (brand ? 'text-primary-900' : 'text-text-secondary') : 'text-text-placeholder',
          ].join(' ')}
        >
          {value || placeholder}
        </span>
        {suffix === 'chevron' ? (
          <img src={chevronIcon} alt="" className="size-5 shrink-0 rotate-90 opacity-70" />
        ) : null}
        {suffix === 'calendar' ? (
          <img src={calendarIcon} alt="" className="size-5 shrink-0 opacity-60" />
        ) : null}
      </div>
    </div>
  )
}

const ITEM_GRID =
  'grid grid-cols-[minmax(180px,306fr)_104px_173px_103px_105px_90px_minmax(90px,1fr)] items-center gap-4'

function ItemCell({ value, select, stepper }: { value: string; select?: boolean; stepper?: boolean }) {
  return (
    <div className="relative">
      <div className="flex h-11 w-full items-center rounded-sm border border-primary-300 bg-surface-tab-bar px-3 pe-8 text-sm font-medium text-text-secondary">
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
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-4 -rotate-90 opacity-70" />
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-4 rotate-90 opacity-70" />
        </span>
      ) : null}
    </div>
  )
}

/** Green "+ ﷼ amount" — a debit note only ever adds. */
function PlusAmount({
  value,
  size = 'sm',
}: {
  value: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const text = {
    sm: 'text-sm font-semibold',
    md: 'text-[19px] font-semibold',
    lg: 'text-2xl font-semibold',
    xl: 'text-[32px] font-semibold',
  }[size]
  const mark = { sm: 'w-4', md: 'w-5', lg: 'w-6', xl: 'w-8' }[size]

  return (
    <span className="inline-flex items-center gap-1 text-success-700">
      <span className={text}>+</span>
      <img src={omrRowIcon} alt="" className={['h-auto shrink-0', mark].join(' ')} />
      <span className={text}>{value}</span>
    </span>
  )
}

export function NewDebitNotePage() {
  const { t } = useTranslation()
  const doc = NEW_DEBIT_NOTE
  const [basis, setBasis] = useState<DebitBasis>('correctLines')
  const [sendOverPeppol, setSendOverPeppol] = useState(doc.details.sendOverPeppol)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-4">
              <Link
                to="/invoices"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
              >
                {t('newDebitNote.breadcrumbIncome')}
              </Link>
              <Link
                to="/income/debit-notes"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
              >
                {t('newDebitNote.breadcrumbDebitNotes')}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {t('newDebitNote.title')}
              </h1>
              <span className="inline-flex h-[31px] items-center gap-2 rounded-full border border-neutral-200 bg-[#e3e4ea] px-3 text-sm font-semibold text-text-tertiary">
                <span className="size-1.5 rounded-full bg-text-tertiary" />
                {t('newDebitNote.draft')}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base leading-[1.2] text-text-quaternary">
              <span>{t('newDebitNote.adjusting')}</span>
              <span className="font-semibold text-text-primary">{doc.adjustsInvoice}</span>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span>{t('newDebitNote.for')}</span>
              <span className="font-semibold text-text-primary">{doc.customer}</span>
            </p>
          </div>
          {/* Figma order: more · Save draft · Issue debit note */}
          <div className="flex flex-wrap items-center gap-3">
            <ActionMenu
              items={debitNoteRowActions(doc.details.number)}
              label={t('newDebitNote.more')}
              variant="bordered"
            />
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
            >
              <img src={saveDraftIcon} alt="" className="size-6" />
              {t('newDebitNote.saveDraft')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={issueIcon} alt="" className="size-6 brightness-0 invert" />
              {t('newDebitNote.issue')}
            </button>
          </div>
        </div>

        {/* Original invoice + What to credit | Amount to charge */}
        <div className="grid gap-4 xl:grid-cols-[1fr_332px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <SectionTitle title={t('newDebitNote.sections.original')} />
              <div className="flex flex-wrap items-center gap-4 rounded-sm border border-primary-75 bg-primary-25 p-2.5">
                <span className="flex size-[54px] shrink-0 items-center justify-center rounded-sm bg-primary-25">
                  <img src={invoiceTileIcon} alt="" className="size-9" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-base font-medium leading-[1.2] text-text-primary">
                      {doc.original.id}
                    </p>
                    <span className="inline-flex h-[25px] items-center gap-2 rounded-full border border-[#e7e3da] bg-pending-100 px-3 text-sm font-semibold text-pending-700">
                      <span className="size-1.5 rounded-full bg-pending-700" />
                      {t(doc.original.statusKey)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-[1.2] text-text-tertiary">
                    {doc.original.meta}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-8">
                  <div>
                    <p className="text-xs font-medium leading-[1.2] text-[#727579]">
                      {t('newDebitNote.original.invoiceTotal')}
                    </p>
                    <p className="mt-1.5 text-sm font-medium leading-[1.2] text-text-primary">
                      {doc.original.invoiceTotal}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium leading-[1.2] text-[#727579]">
                      {t('newDebitNote.original.alreadyCredited')}
                    </p>
                    <p className="mt-1.5 text-sm font-medium leading-[1.2] text-text-primary">
                      {doc.original.alreadyCredited}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium leading-[1.2] text-[#727579]">
                      {t('newDebitNote.original.creditable')}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold leading-[1.2] text-success-700">
                      {doc.original.creditable}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <SectionTitle title={t('newDebitNote.sections.whatToCredit')} />
              <div className="grid gap-3 md:grid-cols-3">
                {DEBIT_BASES.map((option) => {
                  const active = option.id === basis
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setBasis(option.id)}
                      aria-pressed={active}
                      className={[
                        'flex h-[65px] items-center gap-2 rounded-sm px-3 text-start transition-colors',
                        active
                          ? 'border-2 border-primary-500 bg-primary-50'
                          : 'border border-border-default hover:border-primary-300',
                      ].join(' ')}
                    >
                      <img src={BASIS_ICONS[option.id]} alt="" className="size-6 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium leading-[1.2] text-text-primary">
                          {t(option.titleKey)}
                        </span>
                        <span className="mt-0.5 block text-[10px] font-medium leading-[1.2] text-text-tertiary">
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
              <div className="mt-3 flex items-start gap-2 rounded-sm bg-primary-25 p-3">
                <img src={infoIcon} alt="" className="mt-0.5 size-[17px] shrink-0" />
                <p className="text-sm font-medium leading-[1.4] text-primary-700">
                  {t('newDebitNote.basisNote', { invoice: doc.adjustsInvoice })}
                </p>
              </div>
            </Card>
          </div>

          {/* Amount to charge */}
          <aside>
            <section className="rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('newDebitNote.amount.title')}
              </h2>
              <div className="my-4 h-px bg-[#f3f3f3]" />

              <PlusAmount value={doc.amount.total} size="xl" />
              <span className="mt-3 inline-flex items-center gap-2 rounded-sm bg-success-100 px-3 py-1.5 text-sm font-medium text-success-700">
                <img src={trendUpIcon} alt="" className="size-[18px]" />
                {t('newDebitNote.amount.increasesRevenue')}
              </span>

              <div className="my-4 h-px bg-[#f3f3f3]" />
              <div className="flex flex-col gap-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-tertiary">
                    {t('newDebitNote.amount.netToCharge')}
                  </span>
                  <PlusAmount value={doc.amount.net} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-tertiary">
                    {t('newDebitNote.amount.vatAdded')}
                  </span>
                  <PlusAmount value={doc.amount.vat} />
                </div>
              </div>

              <p className="mt-5 text-xs font-semibold uppercase leading-[1.2] tracking-wide text-text-quaternary">
                {t('newDebitNote.amount.effectOn', { customer: doc.customerShort })}
              </p>
              <div className="mt-3 flex flex-col gap-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-tertiary">
                    {t('newDebitNote.amount.outstanding', { invoice: doc.adjustsInvoice })}
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-success-700">
                    <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                    {doc.amount.outstanding}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-tertiary">
                    {t('newDebitNote.amount.addedByNote')}
                  </span>
                  <PlusAmount value={doc.amount.added} />
                </div>
                <div className="h-px bg-[#f3f3f3]" />
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('newDebitNote.amount.newBalance')}
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-success-700">
                    <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                    {doc.amount.newBalance}
                  </span>
                </div>
              </div>
            </section>
          </aside>
        </div>

        {/* Items — full width */}
        <Card>
          <SectionTitle title={t('newDebitNote.sections.items')} />
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div
                className={[
                  ITEM_GRID,
                  'pb-2 text-xs font-semibold uppercase tracking-wide text-text-quaternary',
                ].join(' ')}
              >
                <span>{t('newDebitNote.col.description')}</span>
                <span>{t('newDebitNote.col.excl')}</span>
                <span>{t('newDebitNote.col.vat')}</span>
                <span>{t('newDebitNote.col.qty')}</span>
                <span>{t('newDebitNote.col.unit')}</span>
                <span>{t('newDebitNote.col.disc')}</span>
                <span>{t('newDebitNote.col.total')}</span>
              </div>
              {doc.items.map((item) => (
                <div key={item.id} className={[ITEM_GRID, 'py-1.5'].join(' ')}>
                  <ItemCell value={item.description} />
                  <ItemCell value={item.excl} />
                  <ItemCell value={item.vat} />
                  <ItemCell value={item.qty} stepper />
                  <ItemCell value={item.unit} select />
                  <ItemCell value={item.discount} />
                  <span className="flex h-11 items-center text-xl font-semibold text-text-primary">
                    {item.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="ms-auto mt-4 flex w-full max-w-[352px] flex-col gap-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('newDebitNote.amount.netToCharge')}
              </span>
              <span className="inline-flex items-center gap-1 text-[19px] font-semibold text-text-tertiary">
                +
                <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
                {doc.itemTotals.net}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('newDebitNote.totals.vatAdded')}
              </span>
              <span className="inline-flex items-center gap-1 text-[19px] font-semibold text-text-tertiary">
                +
                <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
                {doc.itemTotals.vat}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">
                {t('newDebitNote.totals.totalToCharge')}
              </span>
              <PlusAmount value={doc.itemTotals.total} size="lg" />
            </div>
          </div>
        </Card>

        {/* Reason for debit — full width */}
        <Card>
          <SectionTitle
            title={t('newDebitNote.sections.reason')}
            action={
              <span className="inline-flex h-[31px] items-center rounded-full bg-neutral-25 px-3 text-sm font-semibold text-text-tertiary">
                {t('newDebitNote.shownOnNote')}
              </span>
            }
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('newDebitNote.fields.reason')} value={doc.reason.value} required />
            <Field
              label={t('newDebitNote.fields.reference')}
              placeholder={doc.reason.referencePlaceholder}
            />
          </div>
          <div className="mt-4">
            <FieldLabel
              label={t('newDebitNote.fields.noteToCustomer')}
              hint={t('newDebitNote.fields.noteToCustomerHint')}
            />
            <div className="min-h-[50px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-3.5 text-sm font-medium text-text-secondary">
              {doc.reason.note}
            </div>
          </div>
        </Card>

        {/* Debit note details — full width */}
        <Card>
          <SectionTitle title={t('newDebitNote.sections.details')} />
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t('newDebitNote.fields.number')} value={doc.details.number} required />
            <Field
              label={t('newDebitNote.fields.issueDate')}
              value={doc.details.issueDate}
              required
              suffix="calendar"
            />
            <Field
              label={t('newDebitNote.fields.paymentDue')}
              value={doc.details.paymentDue}
              required
              hint={t('newDebitNote.fields.paymentDueHint')}
              suffix="calendar"
            />
            <Field
              label={t('newDebitNote.fields.concerningInvoice')}
              value={doc.details.concerningInvoice}
              brand
            />
            <Field
              label={t('newDebitNote.fields.currency')}
              value={doc.details.currency}
              required
              brand
            />
            <Field
              label={t('newDebitNote.fields.taxCategory')}
              value={doc.details.taxCategory}
              required
              suffix="chevron"
            />
          </div>

          <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('newDebitNote.peppol.title')}
                </p>
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-primary-75 bg-white px-3 text-xs font-semibold text-primary-800">
                  <img src={peppolIcon} alt="" className="size-4" />
                  {t('newDebitNote.peppol.onPeppol')}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-medium leading-[1.3] text-text-tertiary">
                {t('newDebitNote.peppol.hint', { customer: doc.customerShort })}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sendOverPeppol}
              aria-label={t('newDebitNote.peppol.title')}
              onClick={() => setSendOverPeppol((v) => !v)}
              className={[
                'relative h-[23px] w-[42px] shrink-0 rounded-full transition-colors',
                sendOverPeppol ? 'bg-primary-700' : 'bg-neutral-100',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-[2.5px] size-[18px] rounded-full bg-white transition-all',
                  sendOverPeppol ? 'start-[21px]' : 'start-[2.5px]',
                ].join(' ')}
              />
            </button>
          </div>
        </Card>

        {/* Attachments — full width */}
        <Card>
          <SectionTitle title={t('newDebitNote.sections.attachments')} />
          <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border-default py-10">
            <img src={uploadIcon} alt="" className="size-8" />
            <p className="text-base font-medium text-text-secondary">
              {t('newDebitNote.attachments.drop')}
            </p>
            <p className="text-sm font-medium text-text-muted">
              {t('newDebitNote.attachments.hint')}
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
