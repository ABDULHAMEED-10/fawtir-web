import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { LineItemsTable, useLineTotals, type LineItem } from '../../components/invoice'
import { formatAtScale } from '../../lib/invoiceMath'
import { ActionMenu, OmAmount } from '../../components/ui'
import {
  EMPTY_PERIODIC_SERIES,
  PERIODIC_SERIES,
  type PeriodicFrequency,
} from '../../lib/periodicInvoice'
import { scheduleRowActions } from '../../lib/rowActions'
import backIcon from '../../assets/invoice-details/back.svg'
import saveIcon from '../../assets/customers/save.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import calendarIcon from '../../assets/create-invoice/calendar.svg'
import customerLogo from '../../assets/periodic/customer-logo.svg'
import peppolIcon from '../../assets/periodic/peppol.svg'
import pauseIcon from '../../assets/periodic/pause.svg'
import clockIcon from '../../assets/periodic/clock.svg'
import toggleOnIcon from '../../assets/periodic/toggle-on.svg'
import infoIcon from '../../assets/periodic/info.svg'
import invoiceTileIcon from '../../assets/periodic/invoice-tile.svg'

function FieldLabel({ label }: { label: string }) {
  return <p className="mb-1 text-sm font-medium text-text-primary">{label}</p>
}

/** Column track widths taken from the Figma row: 306 / 104 / 173 / 103 / 105 / 90 / total / delete. */
/** The lines from the design, costed by the same engine the invoice uses. */
const INITIAL_LINES: LineItem[] = [
  {
    id: '1',
    description: 'Cappuccino - Large',
    unitPrice: '1.8',
    vatRate: '5',
    quantity: '12',
    unit: 'EA',
    discountType: 'PERCENTAGE',
    discountValue: '0',
  },
  {
    id: '2',
    description: 'Coffee Beans 1kg - H Blend',
    unitPrice: '9.5',
    vatRate: '5',
    quantity: '4',
    unit: 'KGM',
    discountType: 'PERCENTAGE',
    discountValue: '10',
  },
]

function NoteLabel({ label, badge }: { label: string; badge: string }) {
  return (
    <p className="mb-1 flex flex-wrap items-baseline gap-2">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <span className="text-xs font-medium text-text-quaternary">{badge}</span>
    </p>
  )
}

function FieldShell({ children, suffix }: { children: ReactNode; suffix?: ReactNode }) {
  return (
    <div className="flex h-[50px] w-full items-center justify-between rounded-sm border border-primary-300 bg-surface-tab-bar px-4">
      <div className="min-w-0 flex-1 text-sm font-medium text-text-secondary">{children}</div>
      {suffix}
    </div>
  )
}

function Toggle({ on, label, hint }: { on: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        <p className="mt-0.5 text-xs font-medium text-text-quaternary">{hint}</p>
      </div>
      {on ? (
        <img src={toggleOnIcon} alt="" className="h-6 w-11 shrink-0" />
      ) : (
        <span className="inline-flex h-6 w-11 shrink-0 rounded-full bg-neutral-100 p-0.5">
          <span className="size-5 rounded-full bg-white shadow-sm" />
        </span>
      )}
    </div>
  )
}

/**
 * One layout, three modes:
 *  - `create` blank series, reached from "New recurring invoice"
 *  - `edit`   filled series, reached from the row menu's Edit action
 *  - `view`   read-only, reached by clicking a row in the list
 */
export type PeriodicMode = 'create' | 'edit' | 'view'

export function PeriodicInvoicePage({ mode = 'edit' }: { mode?: PeriodicMode }) {
  const { t } = useTranslation()
  const isCreate = mode === 'create'
  const isView = mode === 'view'
  const series = isCreate ? EMPTY_PERIODIC_SERIES : PERIODIC_SERIES
  const [frequency, setFrequency] = useState<PeriodicFrequency>(series.schedule.frequency)
  const [exclVat, setExclVat] = useState(true)
  const [lines, setLines] = useState<LineItem[]>(INITIAL_LINES)
  const totals = useLineTotals(lines, exclVat)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link
                to="/invoices"
                className="inline-flex items-center gap-1 text-2xl font-medium text-text-quaternary"
              >
                {t('periodicInvoice.breadcrumbIncome')}
                <img src={backIcon} alt="" className="size-6 rotate-180" />
              </Link>
              <Link
                to="/income/periodic"
                className="text-2xl font-medium text-text-quaternary transition-colors hover:text-text-secondary"
              >
                {t('periodicInvoice.breadcrumb')}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {isCreate ? t('periodicInvoice.newTitle') : series.title}
              </h1>
              {isCreate ? null : (
                <span className="inline-flex h-[31px] items-center gap-2 rounded-full border border-[#b7c4bd] bg-success-100 px-3 text-sm font-medium text-success-700">
                  <span className="size-1.5 rounded-full bg-success-700" />
                  {t('periodicInvoice.active')}
                </span>
              )}
            </div>
            {isCreate ? (
              <p className="mt-1 text-base text-text-quaternary">
                {t('periodicInvoice.newSubtitle')}
              </p>
            ) : (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base text-text-quaternary">
                <span>{t('periodicInvoice.recurring')}</span>
                <span className="size-1 rounded-full bg-text-quaternary" />
                <span>{series.cadence}</span>
                <span className="size-1 rounded-full bg-text-quaternary" />
                <span>
                  {t('periodicInvoice.next')}{' '}
                  <span className="font-semibold text-text-primary">{series.nextRun}</span>
                </span>
              </p>
            )}
          </div>
          {/* Figma order, left to right: more · Pause Series · Save changes. */}
          <div className="flex flex-wrap items-center gap-3">
            {isCreate ? (
              <>
                <Link
                  to="/income/periodic"
                  className="inline-flex h-[46px] items-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-white"
                >
                  {t('periodicInvoice.cancel')}
                </Link>
                <button
                  type="button"
                  className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                >
                  <img src={saveIcon} alt="" className="size-6 brightness-0 invert" />
                  {t('periodicInvoice.createSeries')}
                </button>
              </>
            ) : (
              <>
                <ActionMenu
                  items={scheduleRowActions()}
                  label={t('periodicInvoice.more')}
                  variant="bordered"
                />
                <button
                  type="button"
                  className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-white"
                >
                  <img src={pauseIcon} alt="" className="size-6" />
                  {t('periodicInvoice.pauseSeries')}
                </button>
                {isView ? (
                  <Link
                    to="/income/periodic/monthly-coffee-supply/edit"
                    className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    {t('periodicInvoice.editSeries')}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    <img src={saveIcon} alt="" className="size-6 brightness-0 invert" />
                    {t('periodicInvoice.saveChanges')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">
                {t('periodicInvoice.invoiceDetails')}
              </h2>
              <div className="my-3 h-px bg-border-subtle" />

              <p className="mb-2 text-sm font-medium text-text-primary">
                {t('periodicInvoice.customer')}
              </p>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-75 bg-primary-25 px-3 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <img src={customerLogo} alt="" className="size-12 rounded-sm object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {series.customer.name}
                    </p>
                    <p className="truncate text-xs font-medium text-text-quaternary">
                      {series.customer.vat}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary-75 bg-white/70 py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                    <img src={peppolIcon} alt="" className="size-4" />
                    {t('periodicInvoice.onPeppol')}
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded-sm border border-border-subtle bg-white py-1.5 ps-3.5 pe-2.5 text-sm font-semibold text-primary-800"
                  >
                    {t('periodicInvoice.change')}
                    <img src={chevronIcon} alt="" className="size-5 rotate-90" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <FieldLabel label={t('periodicInvoice.fields.subject')} />
                  <FieldShell>{series.subject}</FieldShell>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel label={t('periodicInvoice.fields.po')} />
                    <FieldShell>{series.poReference}</FieldShell>
                  </div>
                  <div>
                    <FieldLabel label={t('periodicInvoice.fields.terms')} />
                    <FieldShell
                      suffix={
                        <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />
                      }
                    >
                      {series.paymentTerms}
                    </FieldShell>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel label={t('periodicInvoice.fields.currency')} />
                    <FieldShell
                      suffix={
                        <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />
                      }
                    >
                      {series.currency}
                    </FieldShell>
                  </div>
                  <div>
                    <FieldLabel label={t('periodicInvoice.fields.tax')} />
                    <FieldShell
                      suffix={
                        <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />
                      }
                    >
                      {series.taxCategory}
                    </FieldShell>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel label={t('periodicInvoice.fields.branch')} />
                    <FieldShell
                      suffix={
                        <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />
                      }
                    >
                      {series.branch}
                    </FieldShell>
                  </div>
                  <div>
                    <FieldLabel label={t('periodicInvoice.fields.project')} />
                    <FieldShell
                      suffix={
                        <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />
                      }
                    >
                      {series.project}
                    </FieldShell>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">
                {t('periodicInvoice.notesTitle')}
              </h2>
              <div className="my-3 h-px bg-border-subtle" />
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <NoteLabel
                    label={t('periodicInvoice.noteCustomer')}
                    badge={t('periodicInvoice.noteOnInvoice')}
                  />
                  <div className="min-h-[71px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-3 text-sm font-medium text-text-secondary">
                    {series.noteCustomer}
                  </div>
                </div>
                <div>
                  <NoteLabel
                    label={t('periodicInvoice.noteInternal')}
                    badge={t('periodicInvoice.notePrivate')}
                  />
                  <div className="min-h-[71px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-3 text-sm font-medium text-text-secondary">
                    {series.noteInternal}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[332px]">
            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">
                {t('periodicInvoice.schedule')}
              </h2>
              <div className="my-3 h-px bg-border-subtle" />
              {/* The "Billing cadence" caption sits inside the tinted card, in brand blue. */}
              <div className="mb-4 rounded-sm border border-primary-75 bg-primary-25 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
                  {t('periodicInvoice.billingCadence')}
                </p>
                <p className="mt-1.5 text-sm font-medium text-text-primary">
                  {series.schedule.summary}
                </p>
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-text-tertiary">
                  <img src={clockIcon} alt="" className="size-[17px] shrink-0" />
                  {series.schedule.nextIn}
                </p>
              </div>
              <FieldLabel label={t('periodicInvoice.frequency')} />
              {/* Segmented control: #fafafa track on #eaedf8, active pill #f4f6fb on #d5dcf1. */}
              <div className="mb-4 grid grid-cols-4 gap-3 rounded-[3px] border border-border-brand-subtle bg-surface-tab-bar p-[3px]">
                {(
                  [
                    ['weekly', 'periodicInvoice.weekly'],
                    ['monthly', 'periodicInvoice.monthly'],
                    ['quarterly', 'periodicInvoice.quarterly'],
                    ['yearly', 'periodicInvoice.yearly'],
                  ] as const
                ).map(([value, labelKey]) => {
                  const active = frequency === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFrequency(value)}
                      className={[
                        'h-11 rounded-[3px] px-1 text-xs font-medium transition-colors',
                        active
                          ? 'border border-primary-75 bg-primary-25 text-primary-800'
                          : 'bg-white text-text-tertiary hover:bg-neutral-25',
                      ].join(' ')}
                    >
                      {t(labelKey)}
                    </button>
                  )
                })}
              </div>
              {/* Repeats on / Starts / Ends are each their own full-width row in Figma. */}
              <div className="flex flex-col gap-3">
                <div>
                  <FieldLabel label={t('periodicInvoice.repeatsOn')} />
                  <FieldShell
                    suffix={
                      <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />
                    }
                  >
                    {series.schedule.repeatsOn}
                  </FieldShell>
                </div>
                <div>
                  <FieldLabel label={t('periodicInvoice.starts')} />
                  <FieldShell
                    suffix={<img src={calendarIcon} alt="" className="size-5 opacity-60" />}
                  >
                    {series.schedule.starts}
                  </FieldShell>
                </div>
                <div>
                  <FieldLabel label={t('periodicInvoice.ends')} />
                  <FieldShell
                    suffix={
                      <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />
                    }
                  >
                    {series.schedule.ends}
                  </FieldShell>
                </div>
                <Toggle
                  on={series.schedule.sendAutomatically}
                  label={t('periodicInvoice.sendAuto')}
                  hint={t('periodicInvoice.sendAutoHint')}
                />
                <Toggle
                  on={series.schedule.notifyOnRun}
                  label={t('periodicInvoice.notify')}
                  hint={t('periodicInvoice.notifyHint')}
                />
              </div>
            </section>
          </aside>
        </div>

        {/* Items spans the full 1144px width in Figma, below the two-column band. */}
        <LineItemsTable
          lines={lines}
          onChange={setLines}
          exclVat={exclVat}
          onExclVatChange={setExclVat}
          totals={totals}
          titleSlot={
            <h2 className="text-xl font-medium text-text-secondary">
              {t('periodicInvoice.items')}
            </h2>
          }
          footer={
            <>
              <div className="ms-auto flex w-full max-w-[280px] flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-tertiary">{t('periodicInvoice.totalExcl')}</span>
                  <OmAmount
                    size="xs"
                    amount={formatAtScale(totals.taxable)}
                    amountClassName="text-sm font-semibold"
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-tertiary">{t('periodicInvoice.vat')}</span>
                  <OmAmount
                    size="xs"
                    amount={formatAtScale(totals.vat)}
                    amountClassName="text-sm font-semibold"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-text-primary">
                    {t('periodicInvoice.totalAmount')}
                  </span>
                  <OmAmount
                    size="sm"
                    amount={formatAtScale(totals.total)}
                    amountClassName="text-base font-semibold"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-sm border border-primary-50 bg-primary-25 p-3">
                <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <p className="text-xs font-medium leading-[1.3] text-text-tertiary">
                  {t('periodicInvoice.itemsBanner', {
                    amount: formatAtScale(totals.total),
                    cadence: t(`periodicInvoice.cadence.${frequency}`),
                    customer: series.customer.name,
                  })}
                </p>
              </div>
            </>
          }
        />

        {isCreate ? null : (
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <section className="rounded-sm bg-surface-card p-4">
                <h2 className="text-xl font-medium text-text-secondary">
                  {t('periodicInvoice.generated')}
                </h2>
                <div className="my-3 h-px bg-border-subtle" />
                {/* Tinted row: #f4f6fb on #eaedf8 with a 54px icon tile, per Figma. */}
                {series.generated.map((inv) => (
                  <Link
                    key={inv.id}
                    to={`/invoices/${inv.id}`}
                    className="flex items-center gap-3 rounded-sm border border-border-brand-subtle bg-primary-25 p-2.5 transition-colors hover:bg-primary-50"
                  >
                    <span className="flex size-[54px] shrink-0 items-center justify-center rounded-sm bg-primary-25">
                      <img src={invoiceTileIcon} alt="" className="size-9" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium leading-[1.2] text-text-primary">
                        {inv.id}
                      </p>
                      <p className="mt-1.5 text-sm font-medium leading-[1.2] text-text-tertiary">
                        {inv.meta}
                      </p>
                    </div>
                    <span className="inline-flex h-[31px] shrink-0 items-center gap-2 rounded-full border border-[#e7e3da] bg-pending-100 px-3 text-sm font-medium text-pending-700">
                      <span className="size-1.5 rounded-full bg-pending-700" />
                      {t('invoicesPage.status.partial')}
                    </span>
                    <OmAmount
                      size="sm"
                      amount={inv.amount}
                      amountClassName="text-2xl font-medium text-text-primary"
                    />
                    <img
                      src={chevronIcon}
                      alt=""
                      className="size-5 shrink-0 opacity-60 rtl:rotate-180"
                    />
                  </Link>
                ))}
                <div className="mt-3 flex items-center gap-2 rounded-sm border border-border-brand-subtle bg-primary-25 px-2 py-2.5">
                  <img src={clockIcon} alt="" className="size-5 shrink-0" />
                  <p className="text-sm font-medium text-text-tertiary">
                    {t('periodicInvoice.nextBanner', { date: series.nextRun })}
                  </p>
                </div>
              </section>
            </div>

            <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[332px]">
              <section className="rounded-sm bg-surface-card p-4">
                <h2 className="text-xl font-medium text-text-secondary">
                  {t('periodicInvoice.upcoming')}
                </h2>
                <div className="my-3 h-px bg-border-subtle" />
                {/* First run carries a blue ring marker; later ones a plain grey dot. */}
                <div className="flex flex-col gap-3">
                  {series.upcoming.map((row, index) => {
                    const isNext = index === 0
                    return (
                      <div key={row.date} className="flex items-center gap-3 text-sm">
                        {isNext ? (
                          <span className="flex size-2.5 shrink-0 items-center justify-center rounded-full bg-primary-50">
                            <span className="size-2 rounded-full bg-primary-700" />
                          </span>
                        ) : (
                          <span className="ms-0.5 size-2 shrink-0 rounded-full bg-neutral-100" />
                        )}
                        <span
                          className={[
                            'flex-1 font-medium',
                            isNext ? 'text-text-primary' : 'text-text-tertiary',
                          ].join(' ')}
                        >
                          {row.date}
                        </span>
                        <OmAmount
                          size="xs"
                          amount={row.amount}
                          amountClassName="text-sm font-medium"
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="my-3 h-px bg-border-subtle" />
                {/* Started / Issued / Each sit in three columns, label above value. */}
                <div className="grid grid-cols-3 gap-3 text-sm font-medium text-text-secondary">
                  <span className="flex flex-col gap-1.5">
                    {t('periodicInvoice.started')}
                    <span className="text-base">{series.started}</span>
                  </span>
                  <span className="flex flex-col gap-1.5">
                    {t('periodicInvoice.issued')}
                    <span className="text-base">{series.issuedCount}</span>
                  </span>
                  <span className="flex flex-col gap-1.5">
                    {t('periodicInvoice.each')}
                    <OmAmount
                      size="xs"
                      amount={series.totals.total}
                      amountClassName="text-base font-medium text-text-secondary"
                    />
                  </span>
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  )
}
