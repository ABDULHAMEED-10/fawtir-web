import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, Select, TableCheckbox } from '../../components/ui'
import {
  amountValue,
  BANK_FORMATS,
  BLOCKED_BILLS,
  DUE_WINDOWS,
  formatOmr,
  PAY_FROM_ACCOUNTS,
  RUN_BILLS,
  RUN_SUPPLIERS,
  WINDOW_BILLS,
  type BankFormat,
  type DueTone,
  type DueWindow,
} from '../../lib/payments'
import printIcon from '../../assets/invoice-details/print.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import viewInvoiceIcon from '../../assets/bill-capture/file.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import csvIcon from '../../assets/bill-capture/file.svg'
import isoIcon from '../../assets/create-invoice/doc-order.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import omrIcon from '../../assets/invoices/omr.svg'

const DUE_CHIP: Record<DueTone, string> = {
  soon: 'bg-pending-100 text-pending-700',
  later: 'bg-success-100 text-[#3d5648]',
  late: 'bg-danger-100 text-[#7a1009]',
}

const FORMAT_ICONS: Record<BankFormat, string> = {
  csv: csvIcon,
  iso20022: isoIcon,
  printed: printIcon,
}

function SectionTitle({ step, title, note }: { step: number; title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="inline-flex size-6 shrink-0 translate-y-0.5 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
        {step}
      </span>
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
      {note ? <span className="text-sm font-medium text-text-quaternary">{note}</span> : null}
    </div>
  )
}

function Amount({ value, size = 'sm' }: { value: string; size?: 'sm' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-1">
      <img
        src={size === 'lg' ? omrIcon : omrRowIcon}
        alt=""
        className={size === 'lg' ? 'h-auto w-7 shrink-0' : 'h-auto w-4 shrink-0'}
      />
      <span
        className={
          size === 'lg'
            ? 'text-[28px] font-semibold leading-[1.2] text-text-primary'
            : 'text-sm font-medium text-text-tertiary'
        }
      >
        {value}
      </span>
    </span>
  )
}

export function PaymentRunPage() {
  const { t } = useTranslation()
  const [window, setWindow] = useState<DueWindow>('thisWeek')
  const [payBy, setPayBy] = useState('2026-08-03')
  const [selected, setSelected] = useState<string[]>(WINDOW_BILLS.everything)
  const [blockedOpen, setBlockedOpen] = useState(true)
  const [payFrom, setPayFrom] = useState(PAY_FROM_ACCOUNTS[0].value)
  const [reference, setReference] = useState('ALBAHJA-PR-0014')
  const [format, setFormat] = useState<BankFormat>('csv')

  /** Changing the window re-ticks the bills it sweeps in; individual ticks then override it. */
  const applyWindow = (next: DueWindow) => {
    setWindow(next)
    setSelected(WINDOW_BILLS[next])
  }

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )

  /** Bills grouped under their supplier, because each supplier gets one transfer. */
  const groups = useMemo(
    () =>
      RUN_SUPPLIERS.map((supplier) => {
        const bills = RUN_BILLS.filter((bill) => bill.supplierId === supplier.id)
        const chosen = bills.filter((bill) => selected.includes(bill.id))
        const total = chosen.reduce(
          (sum, bill) => sum + amountValue(bill.amount) - amountValue(bill.earlyDiscount ?? '0'),
          0,
        )
        return { supplier, bills, chosen, total }
      }).filter((group) => group.bills.length > 0),
    [selected],
  )

  const chosenBills = RUN_BILLS.filter((bill) => selected.includes(bill.id))
  const billsTotal = chosenBills.reduce((sum, bill) => sum + amountValue(bill.amount), 0)
  const discountTotal = chosenBills.reduce(
    (sum, bill) => sum + amountValue(bill.earlyDiscount ?? '0'),
    0,
  )
  const leaving = billsTotal - discountTotal
  const payingSuppliers = groups.filter((group) => group.chosen.length > 0)

  const toggleSupplier = (supplierId: string) => {
    const ids = RUN_BILLS.filter((bill) => bill.supplierId === supplierId).map((bill) => bill.id)
    const allOn = ids.every((id) => selected.includes(id))
    setSelected((current) =>
      allOn ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])],
    )
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/expenditure/payments"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
            >
              {t('paymentsPage.breadcrumb')}
            </Link>
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
            <span className="text-2xl font-medium leading-[1.2] text-text-quaternary">PR-0014</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('paymentsPage.title')}
            </h1>
            <span className="inline-flex h-[31px] items-center gap-2 rounded-full bg-[#e3e4ea] px-3 text-sm font-semibold text-[#474a5e]">
              <span className="size-1.5 rounded-full bg-[#474a5e]" />
              {t('paymentsPage.draft')}
            </span>

            <div className="ms-auto flex flex-wrap items-center gap-3">
              <button
                type="button"
                title={t('paymentsPage.print')}
                className="inline-flex h-[46px] w-[46px] items-center justify-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white xl:w-auto xl:px-4"
              >
                <img src={printIcon} alt="" className="size-5 shrink-0" />
                <span className="hidden xl:inline">{t('paymentsPage.print')}</span>
              </button>
              <button
                type="button"
                title={t('paymentsPage.download')}
                className="inline-flex h-[46px] w-[46px] items-center justify-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white xl:w-auto xl:px-4"
              >
                <img src={downloadIcon} alt="" className="size-5 shrink-0" />
                <span className="hidden xl:inline">{t('paymentsPage.download')}</span>
              </button>
              <Link
                to="/expenditure/payments/PR-0014/invoices"
                className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                <img src={viewInvoiceIcon} alt="" className="size-5 shrink-0 brightness-0 invert" />
                {t('paymentsPage.viewInvoices')}
              </Link>
            </div>
          </div>

          <p className="text-base font-medium leading-[1.3] text-text-quaternary">
            {t('paymentsPage.subtitle')}
          </p>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* 1 — which bills */}
            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionTitle
                  step={1}
                  title={t('paymentsPage.whichBills')}
                  note={t('paymentsPage.approvedOnly')}
                />
                <button
                  type="button"
                  className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                >
                  {t('paymentsPage.filterBySupplier')}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap text-base font-medium text-text-secondary">
                    {t('paymentsPage.payEverythingDueBy')}
                  </span>
                  <div className="w-[168px]">
                    <DateField
                      value={payBy}
                      onChange={setPayBy}
                      ariaLabel={t('paymentsPage.payEverythingDueBy')}
                    />
                  </div>
                </div>

                <div
                  role="group"
                  aria-label={t('paymentsPage.dueWindow')}
                  className="inline-flex items-center rounded-sm bg-surface-background p-1"
                >
                  {DUE_WINDOWS.map((option) => {
                    const active = option.id === window
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => applyWindow(option.id)}
                        aria-pressed={active}
                        className={[
                          'inline-flex h-9 items-center whitespace-nowrap rounded-sm px-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary-25 font-semibold text-primary-800 shadow-sm'
                            : 'text-text-tertiary hover:text-text-secondary',
                        ].join(' ')}
                      >
                        {t(option.labelKey)}
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className="mt-3 flex items-start gap-1.5 text-sm font-medium leading-[1.4] text-text-tertiary">
                <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-semibold text-text-primary">
                    {t('paymentsPage.fallInWindow', {
                      selected: selected.length,
                      total: RUN_BILLS.length,
                    })}
                  </span>{' '}
                  {t('paymentsPage.fallInWindowNote')}
                </span>
              </p>

              {/* Supplier groups */}
              <div className="mt-4 flex flex-col gap-3">
                {groups.map((group) => {
                  const allOn = group.bills.every((bill) => selected.includes(bill.id))
                  const someOn = !allOn && group.bills.some((bill) => selected.includes(bill.id))
                  return (
                    <div
                      key={group.supplier.id}
                      className="overflow-hidden rounded-sm border border-border-subtle"
                    >
                      <div className="flex flex-wrap items-center gap-3 bg-surface-background px-4 py-3">
                        <TableCheckbox
                          checked={allOn}
                          indeterminate={someOn}
                          onChange={() => toggleSupplier(group.supplier.id)}
                          ariaLabel={t('paymentsPage.selectSupplier', {
                            name: group.supplier.name,
                          })}
                        />
                        <span
                          className={[
                            'flex size-9 shrink-0 items-center justify-center rounded-sm text-xs font-bold',
                            group.supplier.tint,
                          ].join(' ')}
                        >
                          {group.supplier.initials}
                        </span>
                        <div className="min-w-0">
                          <p className="text-base font-semibold leading-[1.2] text-text-primary">
                            {group.supplier.name}
                          </p>
                          <p className="mt-0.5 text-xs font-medium leading-[1.2] text-text-muted">
                            {t('paymentsPage.billsAsOneTransfer', { count: group.chosen.length })}
                          </p>
                        </div>
                        <div className="ms-auto text-end">
                          <Amount value={formatOmr(group.total)} />
                          <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">
                            {t('paymentsPage.oneTransfer')}
                          </p>
                        </div>
                      </div>

                      {group.bills.map((bill) => (
                        <div
                          key={bill.id}
                          className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-4 py-3"
                        >
                          <TableCheckbox
                            checked={selected.includes(bill.id)}
                            onChange={() => toggle(bill.id)}
                            ariaLabel={t('paymentsPage.selectBill', { id: bill.reference })}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                              {bill.reference}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">
                              {t(bill.approvedOn)} ·{' '}
                              {bill.matchedTo.startsWith('paymentsPage.')
                                ? t(bill.matchedTo)
                                : t('paymentsPage.rows.matchedTo', { order: bill.matchedTo })}
                            </p>
                          </div>
                          <span
                            className={[
                              'ms-auto inline-flex items-center rounded-full px-3 py-1 text-[10px] font-medium leading-[1.2]',
                              DUE_CHIP[bill.dueTone],
                            ].join(' ')}
                          >
                            {t(bill.dueLabelKey)}
                          </span>
                          <div className="w-[150px] text-end">
                            <Amount value={bill.amount} />
                            {bill.earlyDiscountNoteKey ? (
                              <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-[#3d5648]">
                                {t(bill.earlyDiscountNoteKey)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>

              {/* Blocked */}
              <div className="mt-4 overflow-hidden rounded-sm">
                <button
                  type="button"
                  onClick={() => setBlockedOpen((open) => !open)}
                  aria-expanded={blockedOpen}
                  className="flex w-full items-center gap-2 py-2 text-start"
                >
                  <img src={infoIcon} alt="" className="size-4 shrink-0" />
                  <span className="text-sm font-medium text-text-tertiary">
                    <span className="font-semibold text-text-primary">
                      {t('paymentsPage.blocked.count', { count: BLOCKED_BILLS.length })}
                    </span>{' '}
                    — {t('paymentsPage.blocked.reason')}
                  </span>
                  <img
                    src={chevronIcon}
                    alt=""
                    className={[
                      'ms-auto size-5 shrink-0 transition-transform',
                      blockedOpen ? '-rotate-90' : 'rotate-90',
                    ].join(' ')}
                  />
                </button>

                {blockedOpen ? (
                  <div className="rounded-sm bg-surface-background">
                    {BLOCKED_BILLS.map((bill, index) => (
                      <div
                        key={bill.id}
                        className={[
                          'flex flex-wrap items-center gap-3 px-4 py-3.5',
                          index > 0 ? 'border-t border-border-subtle' : '',
                        ].join(' ')}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-[1.2] text-text-tertiary">
                            {bill.supplier} · {bill.reference}
                          </p>
                          <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">
                            {t(bill.reasonKey)}
                          </p>
                        </div>
                        <div className="ms-auto">
                          <Amount value={bill.amount} />
                        </div>
                        <Link
                          to={`/expenditure/bills/${bill.id}`}
                          className="inline-flex h-[34px] items-center rounded-sm border border-border-subtle bg-white px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                        >
                          {t('paymentsPage.blocked.openDispute')}
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            {/* 2 — when and from where */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={2} title={t('paymentsPage.whenAndWhere')} />
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
                    {t('paymentsPage.paymentDate')}
                    <span className="text-xl leading-4 text-primary-700">*</span>
                  </span>
                  <DateField
                    value={payBy}
                    onChange={setPayBy}
                    ariaLabel={t('paymentsPage.paymentDate')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
                    {t('paymentsPage.payFrom')}
                    <span className="text-xl leading-4 text-primary-700">*</span>
                  </span>
                  <Select
                    value={payFrom}
                    onChange={setPayFrom}
                    options={PAY_FROM_ACCOUNTS}
                    ariaLabel={t('paymentsPage.payFrom')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-sm font-medium leading-[1.2] text-text-primary">
                      {t('paymentsPage.runReference')}
                    </span>
                    <span className="text-xs font-medium text-text-quaternary">
                      {t('paymentsPage.shownOnStatements')}
                    </span>
                  </span>
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    aria-label={t('paymentsPage.runReference')}
                    className="h-[50px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none"
                  />
                </div>
              </div>
            </section>

            {/* 3 — how to send it */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={3} title={t('paymentsPage.howToSend')} />
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {BANK_FORMATS.map((option) => {
                  const active = option.id === format
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFormat(option.id)}
                      aria-pressed={active}
                      className={[
                        'flex items-start gap-3 rounded-sm border p-4 text-start transition-colors',
                        active
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:border-primary-300',
                      ].join(' ')}
                    >
                      <img
                        src={FORMAT_ICONS[option.id]}
                        alt=""
                        className="mt-0.5 size-5 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium leading-[1.2] text-text-primary">
                          {t(option.titleKey)}
                        </span>
                        <span className="mt-1 block text-xs font-medium leading-[1.3] text-text-quaternary">
                          {t(option.noteKey)}
                        </span>
                      </span>
                      {active ? (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-700">
                          <img src={tickIcon} alt="" className="size-3 brightness-0 invert" />
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </section>
          </div>

          {/* Summary */}
          <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('paymentsPage.thisRun')}
              </h2>
              <dl className="mt-4 flex flex-col gap-3">
                {[
                  [
                    t('paymentsPage.billsSelected'),
                    t('paymentsPage.ofTotal', {
                      selected: selected.length,
                      total: RUN_BILLS.length,
                    }),
                  ],
                  [t('paymentsPage.suppliers'), String(payingSuppliers.length)],
                  [t('paymentsPage.transfers'), String(payingSuppliers.length)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
                    <dd className="text-sm font-semibold text-text-primary">{value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t('paymentsPage.billsTotal')}
                  </dt>
                  <dd>
                    <Amount value={formatOmr(billsTotal)} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t('paymentsPage.earlyDiscount')}
                  </dt>
                  <dd className="flex items-center gap-1 text-sm font-medium text-[#3d5648]">
                    −<Amount value={formatOmr(discountTotal)} />
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-4">
                <span className="text-base font-medium text-text-secondary">
                  {t('paymentsPage.leavingYourAccount')}
                </span>
                <Amount value={formatOmr(leaving)} size="lg" />
              </div>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('paymentsPage.whoGetsPaid')}
              </h2>
              {payingSuppliers.length === 0 ? (
                <p className="mt-4 text-sm font-medium text-text-tertiary">
                  {t('paymentsPage.nobodyYet')}
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-4">
                  {payingSuppliers.map((group) => (
                    <li key={group.supplier.id} className="flex items-center gap-3">
                      <span
                        className={[
                          'flex size-9 shrink-0 items-center justify-center rounded-sm text-xs font-bold',
                          group.supplier.tint,
                        ].join(' ')}
                      >
                        {group.supplier.initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-[1.2] text-text-primary">
                          {group.supplier.name}
                        </p>
                        <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">
                          {t('paymentsPage.billsAsOneTransfer', { count: group.chosen.length })}
                        </p>
                      </div>
                      <Amount value={formatOmr(group.total)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
