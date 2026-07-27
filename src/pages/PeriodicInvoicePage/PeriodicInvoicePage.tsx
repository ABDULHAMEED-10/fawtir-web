import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { OmAmount } from '../../components/ui'
import { PERIODIC_SERIES, type PeriodicFrequency } from '../../lib/periodicInvoice'
import backIcon from '../../assets/invoice-details/back.svg'
import menuIcon from '../../assets/invoices/menu.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import calendarIcon from '../../assets/create-invoice/calendar.svg'
import customerLogo from '../../assets/periodic/customer-logo.svg'
import peppolIcon from '../../assets/periodic/peppol.svg'
import pauseIcon from '../../assets/periodic/pause.svg'
import scheduleIcon from '../../assets/periodic/schedule.svg'
import clockIcon from '../../assets/periodic/clock.svg'
import toggleOnIcon from '../../assets/periodic/toggle-on.svg'
import deleteIcon from '../../assets/periodic/delete.svg'
import plusIcon from '../../assets/periodic/plus.svg'
import infoIcon from '../../assets/periodic/info.svg'

function FieldLabel({ label }: { label: string }) {
  return <p className="mb-1 text-sm font-medium text-text-primary">{label}</p>
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

export function PeriodicInvoicePage() {
  const { t } = useTranslation()
  const series = PERIODIC_SERIES
  const [frequency, setFrequency] = useState<PeriodicFrequency>(series.schedule.frequency)
  const [exclVat, setExclVat] = useState(true)

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
              <span className="text-2xl font-medium text-text-quaternary">
                {t('periodicInvoice.breadcrumb')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {series.title}
              </h1>
              <span className="inline-flex h-[31px] items-center gap-2 rounded-full bg-success-100 px-3 text-sm font-semibold text-success-700">
                <span className="size-1.5 rounded-full bg-success-700" />
                {t('periodicInvoice.active')}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base text-text-quaternary">
              <span>{t('periodicInvoice.recurring')}</span>
              <span className="size-1 rounded-full bg-text-quaternary" />
              <span>{series.cadence}</span>
              <span className="size-1 rounded-full bg-text-quaternary" />
              <span>
                {t('periodicInvoice.next')} <span className="font-semibold text-text-primary">{series.nextRun}</span>
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800"
            >
              {t('periodicInvoice.saveChanges')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
            >
              <img src={pauseIcon} alt="" className="size-6" />
              {t('periodicInvoice.pauseSeries')}
            </button>
            <button
              type="button"
              aria-label={t('periodicInvoice.more')}
              className="inline-flex size-[46px] items-center justify-center rounded-sm border border-black/[0.06] bg-[#fdfdfd]"
            >
              <img src={menuIcon} alt="" className="size-6" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">
                {t('periodicInvoice.invoiceDetails')}
              </h2>
              <div className="my-3 h-px bg-border-subtle" />

              <p className="mb-2 text-sm font-medium text-text-primary">{t('periodicInvoice.customer')}</p>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-3 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <img src={customerLogo} alt="" className="size-12 rounded-sm object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{series.customer.name}</p>
                    <p className="truncate text-xs font-medium text-text-quaternary">{series.customer.vat}</p>
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
                    <FieldShell suffix={<img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />}>
                      {series.paymentTerms}
                    </FieldShell>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel label={t('periodicInvoice.fields.currency')} />
                    <FieldShell suffix={<img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />}>
                      {series.currency}
                    </FieldShell>
                  </div>
                  <div>
                    <FieldLabel label={t('periodicInvoice.fields.tax')} />
                    <FieldShell suffix={<img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />}>
                      {series.taxCategory}
                    </FieldShell>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel label={t('periodicInvoice.fields.branch')} />
                    <FieldShell suffix={<img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />}>
                      {series.branch}
                    </FieldShell>
                  </div>
                  <div>
                    <FieldLabel label={t('periodicInvoice.fields.project')} />
                    <FieldShell suffix={<img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />}>
                      {series.project}
                    </FieldShell>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">{t('periodicInvoice.notesTitle')}</h2>
              <div className="my-3 h-px bg-border-subtle" />
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <FieldLabel label={t('periodicInvoice.noteCustomer')} />
                  <div className="min-h-[90px] rounded-sm border border-border-subtle bg-surface-tab-bar px-4 py-3 text-sm font-medium text-text-secondary">
                    {series.noteCustomer}
                  </div>
                </div>
                <div>
                  <FieldLabel label={t('periodicInvoice.noteInternal')} />
                  <div className="min-h-[90px] rounded-sm border border-border-subtle bg-surface-tab-bar px-4 py-3 text-sm font-medium text-text-secondary">
                    {series.noteInternal}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-sm bg-surface-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-medium text-text-secondary">{t('periodicInvoice.items')}</h2>
                <div className="inline-flex rounded-sm border border-border-subtle bg-surface-tab-bar p-0.5">
                  <button
                    type="button"
                    onClick={() => setExclVat(true)}
                    className={['rounded-sm px-3 py-1.5 text-xs font-semibold', exclVat ? 'bg-white text-primary-800' : 'text-text-quaternary'].join(' ')}
                  >
                    {t('periodicInvoice.exclVat')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExclVat(false)}
                    className={['rounded-sm px-3 py-1.5 text-xs font-semibold', !exclVat ? 'bg-white text-primary-800' : 'text-text-quaternary'].join(' ')}
                  >
                    {t('periodicInvoice.inclVat')}
                  </button>
                </div>
              </div>
              <div className="mb-3 h-px bg-border-subtle" />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-start">
                  <thead>
                    <tr className="text-xs font-semibold uppercase tracking-wide text-text-quaternary">
                      <th className="pb-2 font-semibold">{t('periodicInvoice.col.description')}</th>
                      <th className="pb-2 font-semibold">{t('periodicInvoice.col.excl')}</th>
                      <th className="pb-2 font-semibold">{t('periodicInvoice.col.vat')}</th>
                      <th className="pb-2 font-semibold">{t('periodicInvoice.col.qty')}</th>
                      <th className="pb-2 font-semibold">{t('periodicInvoice.col.unit')}</th>
                      <th className="pb-2 font-semibold">{t('periodicInvoice.col.disc')}</th>
                      <th className="pb-2 text-end font-semibold">{t('periodicInvoice.col.total')}</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {series.items.map((item) => (
                      <tr key={item.id} className="border-t border-surface-background">
                        <td className="py-3 pe-2 text-sm font-medium text-text-primary">{item.description}</td>
                        <td className="py-3 text-sm text-text-secondary">{item.excl}</td>
                        <td className="py-3 text-sm text-text-secondary">{item.vat}</td>
                        <td className="py-3 text-sm text-text-secondary">{item.qty}</td>
                        <td className="py-3 text-sm text-text-secondary">{item.unit}</td>
                        <td className="py-3 text-sm text-text-secondary">{item.discount}</td>
                        <td className="py-3 text-end text-sm font-semibold text-text-primary">{item.total}</td>
                        <td className="py-3 ps-2">
                          <img src={deleteIcon} alt="" className="size-5 opacity-70" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-border-default py-3 text-sm font-semibold text-primary-800"
              >
                <img src={plusIcon} alt="" className="size-5" />
                {t('periodicInvoice.addLine')}
              </button>
              <div className="mt-4 ms-auto flex w-full max-w-[280px] flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-tertiary">{t('periodicInvoice.totalExcl')}</span>
                  <OmAmount size="xs" amount={series.totals.excluding} amountClassName="text-sm font-semibold" />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-tertiary">{t('periodicInvoice.vat')}</span>
                  <OmAmount size="xs" amount={series.totals.vat} amountClassName="text-sm font-semibold" />
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-text-primary">{t('periodicInvoice.totalAmount')}</span>
                  <OmAmount size="sm" amount={series.totals.total} amountClassName="text-base font-semibold" />
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-sm border border-primary-50 bg-primary-25 p-3">
                <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <p className="text-xs font-medium leading-[1.3] text-text-tertiary">
                  {t('periodicInvoice.itemsBanner', { amount: series.totals.total, customer: series.customer.name })}
                </p>
              </div>
            </section>

            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">{t('periodicInvoice.generated')}</h2>
              <div className="my-3 h-px bg-border-subtle" />
              {series.generated.map((inv) => (
                <Link
                  key={inv.id}
                  to={`/invoices/${inv.id}`}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-3 py-3 hover:bg-primary-25/50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-medium text-text-primary">{inv.id}</p>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e3da] bg-warning-100 px-2.5 py-0.5 text-xs font-semibold text-[#6d5a39]">
                        <span className="size-1.5 rounded-full bg-[#6d5a39]" />
                        {t('invoicesPage.status.partial')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-text-quaternary">{inv.meta}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <OmAmount size="sm" amount={inv.amount} amountClassName="text-base font-semibold" />
                    <img src={chevronIcon} alt="" className="size-5 rotate-180 opacity-60" />
                  </div>
                </Link>
              ))}
              <div className="mt-3 flex items-start gap-2 rounded-sm border border-primary-50 bg-primary-25 p-3">
                <img src={clockIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <p className="text-xs font-medium text-text-tertiary">
                  {t('periodicInvoice.nextBanner', { date: series.nextRun })}
                </p>
              </div>
            </section>
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[332px]">
            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">{t('periodicInvoice.schedule')}</h2>
              <div className="my-3 h-px bg-border-subtle" />
              <div className="mb-4 rounded-sm border border-primary-75 bg-primary-25 p-3">
                <div className="flex items-start gap-2">
                  <img src={scheduleIcon} alt="" className="size-5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{series.schedule.summary}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-text-quaternary">
                      <img src={clockIcon} alt="" className="size-3.5" />
                      {series.schedule.nextIn}
                    </p>
                  </div>
                </div>
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-quaternary">
                {t('periodicInvoice.frequency')}
              </p>
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-sm border border-primary-50 bg-primary-25 p-1 sm:grid-cols-4">
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
                        'rounded-sm px-2 py-2 text-xs font-semibold transition-colors',
                        active ? 'bg-white text-primary-800 shadow-sm' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {t(labelKey)}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <FieldLabel label={t('periodicInvoice.repeatsOn')} />
                  <FieldShell suffix={<img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />}>
                    {series.schedule.repeatsOn}
                  </FieldShell>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel label={t('periodicInvoice.starts')} />
                    <FieldShell suffix={<img src={calendarIcon} alt="" className="size-5 opacity-60" />}>
                      {series.schedule.starts}
                    </FieldShell>
                  </div>
                  <div>
                    <FieldLabel label={t('periodicInvoice.ends')} />
                    <FieldShell suffix={<img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />}>
                      {series.schedule.ends}
                    </FieldShell>
                  </div>
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

            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">{t('periodicInvoice.upcoming')}</h2>
              <div className="my-3 h-px bg-border-subtle" />
              <div className="flex flex-col gap-3">
                {series.upcoming.map((row) => (
                  <div key={row.date} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-text-secondary">{row.date}</span>
                    <OmAmount size="xs" amount={row.amount} amountClassName="text-sm font-semibold" />
                  </div>
                ))}
              </div>
              <div className="my-3 h-px bg-border-subtle" />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-text-quaternary">
                <span>
                  {t('periodicInvoice.started')} {series.started}
                </span>
                <span>
                  {t('periodicInvoice.issued')} {series.issuedCount}
                </span>
                <span className="inline-flex items-center gap-1">
                  {t('periodicInvoice.each')}
                  <OmAmount size="xs" amount={series.totals.total} amountClassName="text-xs font-semibold text-text-primary" />
                </span>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
