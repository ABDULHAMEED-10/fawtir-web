import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { OmAmount } from '../../components/ui'
import {
  CREDIT_NOTE,
  CREDITABLE,
  deriveCredit,
  formatCredit,
  type CreditMode,
} from '../../lib/creditNote'
import backIcon from '../../assets/invoice-details/back.svg'
import menuIcon from '../../assets/invoices/menu.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import calendarIcon from '../../assets/create-invoice/calendar.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'
import peppolIcon from '../../assets/create-invoice/peppol.svg'
import toggleOnIcon from '../../assets/create-invoice/toggle-on.svg'
import saveDraftIcon from '../../assets/credit-note/save-draft.svg'
import issueIcon from '../../assets/credit-note/issue.svg'
import invoiceIcon from '../../assets/credit-note/invoice-icon.svg'
import fullInvoiceIcon from '../../assets/credit-note/full-invoice.svg'
import linesIcon from '../../assets/credit-note/lines.svg'
import omrIcon from '../../assets/invoices/omr-row.svg'
import customAmountIcon from '../../assets/credit-note/custom-amount.svg'
import tickIcon from '../../assets/credit-note/tick.svg'
import warningIcon from '../../assets/credit-note/warning.svg'
import arrowDownIcon from '../../assets/credit-note/arrow-down.svg'

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

export function NewCreditNotePage() {
  const { t } = useTranslation()
  const data = CREDIT_NOTE
  const [mode, setMode] = useState<CreditMode>('full')
  const [chosen, setChosen] = useState<string[]>(data.lines.map((line) => line.id))
  const [customAmount, setCustomAmount] = useState(formatCredit(CREDITABLE))

  /**
   * What is actually being credited.
   *
   * Full credits the whole invoice, picking lines credits those lines, and a custom amount is
   * taken as typed — so the summary below always follows the choice above it.
   */
  const gross =
    mode === 'full'
      ? CREDITABLE
      : mode === 'lines'
        ? data.lines
            .filter((line) => chosen.includes(line.id))
            .reduce((sum, line) => sum + line.amount, 0)
        : Number(customAmount.replace(/,/g, '')) || 0
  const summary = deriveCredit(gross)

  const toggleLine = (id: string) =>
    setChosen((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const modes: {
    id: CreditMode
    titleKey: string
    subtitleKey: string
    icon: string
  }[] = [
    {
      id: 'full',
      titleKey: 'creditNote.modes.full',
      subtitleKey: 'creditNote.modes.fullSub',
      icon: fullInvoiceIcon,
    },
    {
      id: 'lines',
      titleKey: 'creditNote.modes.lines',
      subtitleKey: 'creditNote.modes.linesSub',
      icon: linesIcon,
    },
    {
      id: 'custom',
      titleKey: 'creditNote.modes.custom',
      subtitleKey: 'creditNote.modes.customSub',
      icon: customAmountIcon,
    },
  ]

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
                {t('creditNote.breadcrumbIncome')}
                <img src={backIcon} alt="" className="size-6 rotate-180" />
              </Link>
              <span className="text-2xl font-medium text-text-quaternary">
                {t('creditNote.breadcrumb')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {t('creditNote.title')}
              </h1>
              <span className="inline-flex h-[31px] items-center gap-2 rounded-full border border-neutral-200 bg-[#e3e4ea] px-3 text-sm font-semibold text-text-tertiary">
                <span className="size-1.5 rounded-full bg-text-tertiary" />
                {t('creditNote.draft')}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base">
              <span className="font-medium text-text-quaternary">{t('creditNote.reversing')}</span>
              <Link
                to={`/invoices/${data.reversingId}`}
                className="font-semibold text-text-primary hover:text-primary-700"
              >
                {data.reversingId}
              </Link>
              <span className="size-1 rounded-full bg-text-quaternary" />
              <span className="font-medium text-text-quaternary">{t('creditNote.for')}</span>
              <span className="font-semibold text-text-primary">{data.customer}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
            >
              <img src={saveDraftIcon} alt="" className="size-6 rotate-180" />
              {t('creditNote.saveDraft')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800"
            >
              <img src={issueIcon} alt="" className="size-6" />
              {t('creditNote.issue')}
            </button>
            <button
              type="button"
              aria-label={t('creditNote.more')}
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
                {t('creditNote.original')}
              </h2>
              <div className="my-3 h-px bg-border-subtle" />
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-75 bg-primary-25 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex size-[54px] shrink-0 items-center justify-center rounded-sm bg-primary-25">
                    <img src={invoiceIcon} alt="" className="size-9" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-medium text-text-primary">{data.original.id}</p>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7e3da] bg-warning-100 px-2.5 py-0.5 text-xs font-semibold text-[#6d5a39]">
                        <span className="size-1.5 rounded-full bg-[#6d5a39]" />
                        {t('invoicesPage.status.partial')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-text-tertiary">
                      {data.original.issued}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-6 text-end">
                  <div>
                    <p className="text-xs font-medium text-[#727579]">
                      {t('creditNote.invoiceTotal')}
                    </p>
                    <OmAmount
                      size="xs"
                      amount={formatCredit(CREDITABLE)}
                      amountClassName="text-sm font-medium"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#727579]">
                      {t('creditNote.alreadyCredited')}
                    </p>
                    <OmAmount
                      size="xs"
                      amount={formatCredit(data.original.alreadyCredited)}
                      amountClassName="text-sm font-medium"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#727579]">
                      {t('creditNote.creditable')}
                    </p>
                    <OmAmount
                      size="xs"
                      amount={formatCredit(CREDITABLE - gross)}
                      amountClassName="text-sm font-semibold text-[#3d5648]"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">
                {t('creditNote.whatToCredit')}
              </h2>
              <div className="my-3 h-px bg-border-subtle" />
              <div className="grid gap-3 sm:grid-cols-3">
                {modes.map((m) => {
                  const active = mode === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={[
                        'flex h-[65px] items-center justify-between rounded-sm p-4 text-start',
                        active
                          ? 'border border-primary-500 bg-primary-50'
                          : 'border border-border-default bg-surface-card',
                      ].join(' ')}
                    >
                      <span className="flex items-center gap-2">
                        <img src={m.icon} alt="" className="size-6 shrink-0" />
                        <span>
                          <span className="block text-base font-medium tracking-[0.16px] text-text-primary">
                            {t(m.titleKey)}
                          </span>
                          <span className="block text-xs font-medium tracking-[0.12px] text-text-tertiary">
                            {t(m.subtitleKey)}
                          </span>
                        </span>
                      </span>
                      {active ? (
                        <img src={tickIcon} alt="" className="size-[18px] shrink-0" />
                      ) : null}
                    </button>
                  )
                })}
              </div>

              {mode === 'full' ? (
                <div className="mt-3 flex items-start gap-2 rounded-sm border border-[#e7e3da] bg-warning-100 px-3 py-2.5">
                  <img src={warningIcon} alt="" className="mt-0.5 size-5 shrink-0" />
                  <p className="text-sm font-medium text-[#6d5a39]">
                    {t('creditNote.fullWarning')}
                  </p>
                </div>
              ) : null}

              {/* A custom credit is typed, and capped at what is left to credit. */}
              {mode === 'custom' ? (
                <div className="mt-3">
                  <FieldLabel label={t('creditNote.customAmount')} />
                  <div className="flex h-[50px] w-full max-w-[280px] items-center max-md:max-w-none max-md:basis-full gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4">
                    <img src={omrIcon} alt="" className="h-auto w-4 shrink-0" />
                    <input
                      value={customAmount}
                      onChange={(event) => setCustomAmount(event.target.value)}
                      inputMode="decimal"
                      aria-label={t('creditNote.customAmount')}
                      className="w-full min-w-0 border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                    />
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-text-quaternary">
                    {t('creditNote.customMax', { amount: formatCredit(CREDITABLE) })}
                  </p>
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-2">
                {data.lines.map((line) => {
                  const picked = mode === 'full' || chosen.includes(line.id)
                  return (
                    <button
                      key={line.id}
                      type="button"
                      disabled={mode !== 'lines'}
                      onClick={() => toggleLine(line.id)}
                      aria-pressed={picked}
                      className={[
                        'flex w-full items-center justify-between gap-3 rounded-sm border px-3 py-2.5 text-start transition-colors',
                        picked
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white',
                        mode === 'lines' ? 'hover:border-primary-300' : 'cursor-default',
                      ].join(' ')}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        {mode === 'lines' ? (
                          <span
                            className={[
                              'flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border',
                              picked
                                ? 'border-primary-700 bg-primary-700 text-white'
                                : 'border-border-default bg-white',
                            ].join(' ')}
                          >
                            {picked ? <span className="text-[11px] leading-none">✓</span> : null}
                          </span>
                        ) : null}
                        <span className="truncate text-sm font-medium text-text-primary">
                          {line.description}
                        </span>
                      </span>
                      <span
                        className={[
                          'inline-flex shrink-0 items-center gap-1 text-sm font-semibold',
                          picked ? 'text-danger-700' : 'text-text-quaternary',
                        ].join(' ')}
                      >
                        −
                        <OmAmount
                          size="xs"
                          amount={formatCredit(line.amount)}
                          amountClassName={[
                            'text-sm font-semibold',
                            picked ? 'text-danger-700' : 'text-text-quaternary',
                          ].join(' ')}
                        />
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded-sm bg-surface-card p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-medium text-text-secondary">
                  {t('creditNote.reasonTitle')}
                </h2>
                <span className="rounded-sm bg-neutral-25 px-2 py-0.5 text-xs font-medium text-text-quaternary">
                  {t('creditNote.shownOnNote')}
                </span>
              </div>
              <div className="mb-3 h-px bg-border-subtle" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel label={t('creditNote.reason')} />
                  <FieldShell
                    suffix={
                      <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />
                    }
                  >
                    {data.reason}
                  </FieldShell>
                </div>
                <div>
                  <FieldLabel label={t('creditNote.reference')} />
                  <FieldShell>{data.reference}</FieldShell>
                </div>
              </div>
              <div className="mt-4">
                <FieldLabel label={t('creditNote.noteToCustomer')} />
                <div className="min-h-[100px] rounded-sm border border-border-subtle bg-surface-tab-bar px-4 py-3 text-sm font-medium leading-[1.3] text-text-secondary">
                  {data.note}
                </div>
              </div>
            </section>

            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">
                {t('creditNote.detailsTitle')}
              </h2>
              <div className="my-3 h-px bg-border-subtle" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel label={t('creditNote.number')} />
                  <FieldShell>{data.details.number}</FieldShell>
                </div>
                <div>
                  <FieldLabel label={t('creditNote.issueDate')} />
                  <FieldShell
                    suffix={<img src={calendarIcon} alt="" className="size-5 opacity-60" />}
                  >
                    {data.details.issueDate}
                  </FieldShell>
                </div>
                <div>
                  <FieldLabel label={t('creditNote.concerning')} />
                  <FieldShell>{data.details.concerning}</FieldShell>
                </div>
                <div>
                  <FieldLabel label={t('creditNote.currency')} />
                  <FieldShell
                    suffix={
                      <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-60" />
                    }
                  >
                    {data.details.currency}
                  </FieldShell>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-subtle px-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {t('creditNote.sendPeppol')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary-75 bg-primary-25 py-1 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                    <img src={peppolIcon} alt="" className="size-4" />
                    {t('creditNote.onPeppol')}
                  </span>
                  <img src={toggleOnIcon} alt="" className="h-6 w-11" />
                </div>
              </div>
            </section>

            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-xl font-medium text-text-secondary">
                {t('creditNote.attachments')}
              </h2>
              <div className="my-3 h-px bg-border-subtle" />
              <button
                type="button"
                className="flex w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border-default bg-surface-tab-bar px-4 py-8"
              >
                <img src={uploadIcon} alt="" className="size-6" />
                <span className="text-sm font-semibold text-text-secondary">
                  {t('creditNote.dropFiles')}
                </span>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('creditNote.dropHint')}
                </span>
              </button>
            </section>
          </div>

          <aside className="w-full shrink-0 xl:sticky xl:top-4 xl:w-[332px]">
            <section className="rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
              <h3 className="text-base font-medium text-text-primary">
                {t('creditNote.amountToCredit')}
              </h3>
              <div className="my-3 h-px bg-border-subtle" />
              <p className="flex items-center gap-1 text-[32px] font-semibold leading-none text-danger-700">
                −
                <OmAmount
                  size="lg"
                  amount={formatCredit(summary.total)}
                  amountClassName="text-[32px] font-semibold text-danger-700"
                />
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-sm bg-warning-100 px-2 py-1 text-xs font-semibold text-[#6d5a39]">
                <img src={arrowDownIcon} alt="" className="size-3.5" />
                {t('creditNote.reducesRevenue')}
              </span>
              <div className="mt-4 flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">{t('creditNote.netToCredit')}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-text-primary">
                    −
                    <OmAmount
                      size="xs"
                      amount={formatCredit(summary.net)}
                      amountClassName="text-sm font-semibold"
                    />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">{t('creditNote.vatReversed')}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-text-primary">
                    −
                    <OmAmount
                      size="xs"
                      amount={formatCredit(summary.vat)}
                      amountClassName="text-sm font-semibold"
                    />
                  </span>
                </div>
              </div>
              <div className="my-4 h-px bg-border-subtle" />
              <p className="mb-2 text-sm font-semibold text-text-primary">
                {t('creditNote.effectOn', { customer: data.customer })}
              </p>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">{t('creditNote.outstanding')}</span>
                  <OmAmount
                    size="xs"
                    amount={formatCredit(summary.outstanding)}
                    amountClassName="text-sm font-semibold"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">{t('creditNote.applied')}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-danger-700">
                    −
                    <OmAmount
                      size="xs"
                      amount={formatCredit(summary.applied)}
                      amountClassName="text-sm font-semibold text-danger-700"
                    />
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary">{t('creditNote.newBalance')}</span>
                  <OmAmount
                    size="xs"
                    amount={formatCredit(summary.newBalance)}
                    amountClassName="text-sm font-semibold"
                  />
                </div>
              </div>
              <div className="mt-4 rounded-sm border border-success-100 bg-success-100/60 px-3 py-2.5">
                <p className="text-sm font-semibold text-success-700">
                  {t('creditNote.refundDue')}
                </p>
                <OmAmount
                  size="sm"
                  amount={formatCredit(summary.refund)}
                  className="mt-1"
                  amountClassName="text-base font-semibold text-success-700"
                />
                <p className="mt-1 text-xs font-medium text-success-700/80">
                  {t('creditNote.refundHint')}
                </p>
              </div>
              <p className="mt-4 text-center text-[10px] font-medium text-text-quaternary">
                {t('creditNote.footerNote', { id: data.reversingId })}
              </p>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
