import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Select } from '../../components/ui'
import {
  CADENCES,
  CATEGORY_OPTIONS,
  CHASE_AFTER_OPTIONS,
  DAY_OPTIONS,
  NOTIFY_OPTIONS,
  PAYMENT_DUE_OPTIONS,
  PREPARED_BY_OPTIONS,
  RECURRING_BILLS,
  toNumber,
  toOmr,
  VAT_TREATMENT_OPTIONS,
  type Cadence,
} from '../../lib/recurringBills'
import chevronIcon from '../../assets/invoices/chevron.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

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

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
      {label}
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
    </span>
  )
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={[
        'relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full transition-colors',
        on ? 'bg-primary-700' : 'bg-[#d0d2d5]',
      ].join(' ')}
    >
      <span
        className={[
          'absolute size-[22px] rounded-full bg-white transition-all',
          on ? 'start-[26px]' : 'start-[3px]',
        ].join(' ')}
      />
    </button>
  )
}

/** A row in "When to tell you": a label, an explanation, and one control on the right. */
function RuleRow({
  title,
  note,
  control,
  divider = true,
}: {
  title: string
  note: string
  control: React.ReactNode
  divider?: boolean
}) {
  return (
    <div
      className={[
        'flex flex-wrap items-center justify-between gap-4 py-4',
        divider ? 'border-b border-border-subtle' : '',
      ].join(' ')}
    >
      <div className="min-w-[240px] flex-1">
        <p className="text-base font-medium leading-[1.2] text-text-primary">{title}</p>
        <p className="mt-1 text-sm font-medium leading-[1.35] text-text-quaternary">{note}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

export function NewRecurringBillPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [preparedBy, setPreparedBy] = useState(PREPARED_BY_OPTIONS[0].value)
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0].value)
  const [name, setName] = useState('Shop rent Nizwa branch')
  const [reference, setReference] = useState('03215879464817')
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [arrivesAround, setArrivesAround] = useState('28th')
  const [paymentDue, setPaymentDue] = useState(PAYMENT_DUE_OPTIONS[1].value)
  const [watchingFrom, setWatchingFrom] = useState('Aug 2026')
  const [amount, setAmount] = useState('1,200.000')
  const [vatTreatment, setVatTreatment] = useState(VAT_TREATMENT_OPTIONS[0].value)
  const [tolerance, setTolerance] = useState(10)
  const [chaseAfter, setChaseAfter] = useState(CHASE_AFTER_OPTIONS[1].value)
  const [flagOutside, setFlagOutside] = useState(true)
  const [autoApprove, setAutoApprove] = useState(false)
  const [notify, setNotify] = useState(NOTIFY_OPTIONS[0].value)

  /** The tolerance band, recomputed as the amount or the percentage moves. */
  const band = useMemo(() => {
    const value = toNumber(amount)
    const spread = (value * tolerance) / 100
    return { low: toOmr(value - spread), high: toOmr(value + spread) }
  }, [amount, tolerance])

  /**
   * Past bills from the chosen supplier.
   *
   * Figma lists Muscat Roastery, Sohar Packaging and Nizwa Hardware here regardless of who is
   * selected — pasted from the payment run. Filtering by the supplier is the only version of
   * this panel that means anything.
   */
  const pastBills = useMemo(
    () => RECURRING_BILLS.filter((bill) => bill.supplier === preparedBy),
    [preparedBy],
  )

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/expenditure/recurring-bills"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
          >
            {t('recurringBills.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {t('recurringBills.form.new')}
          </span>
        </div>

        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('recurringBills.form.title')}
          </h1>
          <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
            {t('recurringBills.form.subtitle')}
          </p>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* 1 */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={1} title={t('recurringBills.form.whatIsIt')} />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('recurringBills.form.preparedBy')} required />
                  <Select
                    value={preparedBy}
                    onChange={setPreparedBy}
                    options={PREPARED_BY_OPTIONS}
                    ariaLabel={t('recurringBills.form.preparedBy')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('recurringBills.form.category')} required />
                  <Select
                    value={category}
                    onChange={setCategory}
                    options={CATEGORY_OPTIONS}
                    ariaLabel={t('recurringBills.form.category')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('recurringBills.form.whatToCallIt')} required />
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-[50px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('recurringBills.form.theirReference')} />
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    className="h-[50px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none"
                  />
                </div>
              </div>
            </section>

            {/* 2 */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={2} title={t('recurringBills.form.whenItArrives')} />

              <div
                role="group"
                aria-label={t('recurringBills.form.whenItArrives')}
                className="mt-4 grid grid-cols-2 gap-1 rounded-sm border border-border-subtle bg-white p-1 md:grid-cols-4"
              >
                {CADENCES.map((option) => {
                  const active = option.id === cadence
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setCadence(option.id)}
                      aria-pressed={active}
                      className={[
                        'inline-flex h-[46px] items-center justify-center rounded-sm text-base transition-colors',
                        active
                          ? 'bg-primary-25 font-semibold text-primary-800'
                          : 'font-medium text-text-tertiary hover:text-text-secondary',
                      ].join(' ')}
                    >
                      {t(option.labelKey)}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('recurringBills.form.arrivesAround')} required />
                  <Select
                    value={arrivesAround}
                    onChange={setArrivesAround}
                    options={DAY_OPTIONS}
                    ariaLabel={t('recurringBills.form.arrivesAround')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('recurringBills.form.paymentDue')} />
                  <Select
                    value={paymentDue}
                    onChange={setPaymentDue}
                    options={PAYMENT_DUE_OPTIONS}
                    ariaLabel={t('recurringBills.form.paymentDue')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('recurringBills.form.watchingFrom')} />
                  <input
                    value={watchingFrom}
                    onChange={(event) => setWatchingFrom(event.target.value)}
                    className="h-[50px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none"
                  />
                </div>
              </div>
            </section>

            {/* 3 */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={3} title={t('recurringBills.form.whatItCosts')} />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('recurringBills.form.usualAmount')} required />
                  <div className="flex h-[50px] items-center gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4">
                    <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
                    <input
                      value={amount}
                      inputMode="decimal"
                      onChange={(event) => setAmount(event.target.value)}
                      aria-label={t('recurringBills.form.usualAmount')}
                      className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('recurringBills.form.vatTreatment')} />
                  <Select
                    value={vatTreatment}
                    onChange={setVatTreatment}
                    options={VAT_TREATMENT_OPTIONS}
                    ariaLabel={t('recurringBills.form.vatTreatment')}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-border-subtle p-4">
                <div className="min-w-[260px] flex-1">
                  <p className="text-base font-medium leading-[1.2] text-text-primary">
                    {t('recurringBills.form.tellMeIfItMoves')}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-[1.4] text-text-quaternary">
                    {t('recurringBills.form.toleranceNote', { low: band.low, high: band.high })}
                  </p>
                </div>
                <div className="inline-flex shrink-0 items-center rounded-sm border border-border-subtle bg-white">
                  <button
                    type="button"
                    onClick={() => setTolerance((value) => Math.max(0, value - 1))}
                    aria-label={t('recurringBills.form.decreaseTolerance')}
                    className="inline-flex size-11 items-center justify-center text-lg font-semibold text-text-tertiary transition-colors hover:bg-primary-25"
                  >
                    −
                  </button>
                  <span className="w-14 text-center text-base font-semibold text-text-primary tabular-nums">
                    {tolerance}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setTolerance((value) => Math.min(100, value + 1))}
                    aria-label={t('recurringBills.form.increaseTolerance')}
                    className="inline-flex size-11 items-center justify-center text-lg font-semibold text-text-tertiary transition-colors hover:bg-primary-25"
                  >
                    +
                  </button>
                </div>
              </div>
            </section>

            {/* 4 */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={4} title={t('recurringBills.form.whenToTellYou')} />
              <div className="mt-2">
                <RuleRow
                  title={t('recurringBills.form.ifNotArrived')}
                  note={t('recurringBills.form.ifNotArrivedNote')}
                  control={
                    <div className="w-[190px]">
                      <Select
                        value={chaseAfter}
                        onChange={setChaseAfter}
                        options={CHASE_AFTER_OPTIONS}
                        ariaLabel={t('recurringBills.form.ifNotArrived')}
                        compact
                      />
                    </div>
                  }
                />
                <RuleRow
                  title={t('recurringBills.form.ifOutsideRange')}
                  note={t('recurringBills.form.ifOutsideRangeNote')}
                  control={
                    <Toggle
                      on={flagOutside}
                      onChange={setFlagOutside}
                      label={t('recurringBills.form.ifOutsideRange')}
                    />
                  }
                />
                <RuleRow
                  title={t('recurringBills.form.autoApprove')}
                  note={t('recurringBills.form.autoApproveNote')}
                  control={
                    <Toggle
                      on={autoApprove}
                      onChange={setAutoApprove}
                      label={t('recurringBills.form.autoApprove')}
                    />
                  }
                />
                <RuleRow
                  divider={false}
                  title={t('recurringBills.form.whoGetsTold')}
                  note={t('recurringBills.form.whoGetsToldNote')}
                  control={
                    <div className="w-[190px]">
                      <Select
                        value={notify}
                        onChange={setNotify}
                        options={NOTIFY_OPTIONS}
                        ariaLabel={t('recurringBills.form.whoGetsTold')}
                        compact
                      />
                    </div>
                  }
                />
              </div>
            </section>

            <div className="flex flex-wrap justify-end gap-3">
              <Link
                to="/expenditure/recurring-bills"
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('recurringBills.form.cancel')}
              </Link>
              <button
                type="button"
                onClick={() => navigate('/expenditure/recurring-bills')}
                className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t('recurringBills.form.startWatching')}
              </button>
            </div>
          </div>

          {/* What it adds up to */}
          <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('recurringBills.form.whatYoureSettingUp')}
              </h2>

              <div className="mt-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
                <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-primary-800">
                  {t('recurringBills.form.inPlainWords')}
                </p>
                <p className="mt-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                  {t('recurringBills.form.plainWordsPrefix')}{' '}
                  <span className="font-semibold text-text-primary">OMR {amount}</span>{' '}
                  {t('recurringBills.form.plainWordsFrom')}{' '}
                  <span className="font-semibold text-text-primary">{preparedBy}</span>,{' '}
                  {t('recurringBills.form.plainWordsExpected')}{' '}
                  <span className="font-semibold text-text-primary">
                    {t(`recurringBills.form.when.${cadence}`, { day: arrivesAround })}
                  </span>
                  . {t('recurringBills.form.plainWordsNotify', { who: notify, day: '30th' })}{' '}
                  {t('recurringBills.form.plainWordsTolerance', { percent: tolerance })}
                </p>
              </div>

              <ol className="mt-5 flex flex-col">
                {[
                  {
                    day: arrivesAround.replace(/\D/g, ''),
                    title: t('recurringBills.form.timeline.expected', { day: arrivesAround }),
                    note: t('recurringBills.form.timeline.expectedNote'),
                  },
                  {
                    day: '30',
                    title: t('recurringBills.form.timeline.flagged'),
                    note: t('recurringBills.form.timeline.flaggedNote', { who: notify }),
                  },
                  {
                    day: '5',
                    title: t('recurringBills.form.timeline.due'),
                    note: t('recurringBills.form.timeline.dueNote'),
                  },
                ].map((step, index, all) => (
                  <li key={step.title} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-background text-[11px] font-semibold text-text-tertiary">
                        {step.day}
                      </span>
                      {index < all.length - 1 ? (
                        <span className="w-px flex-1 bg-border-subtle" />
                      ) : null}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                        {step.title}
                      </p>
                      <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                        {step.note}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('recurringBills.form.pastBills')}
              </h2>
              {pastBills.length === 0 ? (
                <p className="mt-4 text-sm font-medium leading-[1.4] text-text-tertiary">
                  {t('recurringBills.form.noPastBills', { supplier: preparedBy })}
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-4">
                  {pastBills.map((bill) => (
                    <li key={bill.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-[1.2] text-text-primary">
                          {bill.title}
                        </p>
                        <p className="mt-0.5 text-xs font-medium leading-[1.2] text-text-muted">
                          {t(bill.cadenceKey)}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1">
                        <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                        <span className="text-sm font-semibold text-text-secondary">
                          {bill.amount}
                        </span>
                      </span>
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
