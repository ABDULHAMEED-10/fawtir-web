import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, RialMark, Select, Switch, withRial } from '../../components/ui'
import { SupplierPicker } from '../../components/bills'
import { selectAllOnFocus } from '../../components/invoice'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError, type Page } from '../../api'
import {
  createRecurringBill,
  loadRecurringBill,
  recurringBillPath,
  updateRecurringBill,
  type RecurringBillDto,
} from '../../api/expenditure/recurringBills'
import {
  POSSIBLE_RECIPIENTS_PATH,
  loadPossibleRecipients,
  type ReminderRecipientDto,
} from '../../api/expenditure/billReminders'
import { loadSupplierBills, supplierBillsPath } from '../../api/expenditure/supplierRecord'
import type { BillRowDto } from '../../api/expenditure/bills'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import { muscatToday } from '../../lib/invoiceIssue'
import { can, useSession } from '../../lib/session/session'
import {
  CATEGORY_OPTIONS,
  INTERVALS,
  LATE_AFTER_OPTIONS,
  RECURRING_REFUSALS,
  VAT_TREATMENTS,
  WEEKDAY_KEYS,
  blankRecurringForm,
  formOf,
  ordinal,
  plainWords,
  recurringProblems,
  timelineOf,
  toRecurringRequest,
  toleranceBand,
  type RecurringField,
  type RecurringForm,
  type VatTreatment,
} from '../../lib/recurringBills'
import chevronIcon from '../../assets/invoices/chevron.svg'

const FIELD =
  'h-[50px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Add a recurring bill, and edit one (Figma 163:17821).
 *
 * The frame draws a watch: Fawtir expects the supplier's bill and never writes it. A watch the API
 * saved in `RAISE` mode keeps that mode when edited and asks for its first date instead of an
 * arrival day. Fields the mode does not use are not sent: the server refuses an arrival day on a
 * raising watch and requires one on a watching one.
 */
export function NewRecurringBillPage() {
  const { id } = useParams()
  return (
    <AppShell>
      <RecurringBillForm key={id ?? 'new'} id={id ?? null} />
    </AppShell>
  )
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-primary-50 text-[13px] font-extrabold leading-[1.2] text-primary-800">
        {step}
      </span>
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
    </div>
  )
}

function RuleRow({
  title,
  note,
  control,
  divider = true,
}: {
  title: string
  note: string
  control: ReactNode
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

function RecurringBillForm({ id }: { id: string | null }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const navigate = useNavigate()
  const session = useSession()
  const today = muscatToday()
  const [form, setForm] = useState<RecurringForm>(() => blankRecurringForm(today))
  const [seeded, setSeeded] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<RecurringField, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canManage = can(session, 'invoice.payment.manage')
  const existing = useApiRead<RecurringBillDto>(
    id && canManage ? recurringBillPath(id) : null,
    id ? () => loadRecurringBill(id) : undefined,
  )
  // The people a watch can tell. `GET /users` needs user-admin rights this reader may not hold;
  // a refusal leaves the field showing whoever is named today.
  const people = useApiRead<ReminderRecipientDto[]>(
    canManage ? POSSIBLE_RECIPIENTS_PATH : null,
    loadPossibleRecipients,
  )
  const roster = people.read.status === 'ready' ? people.read.data : null
  const pastPath = form.supplierId ? supplierBillsPath(form.supplierId, 0, 3) : null
  const past = useApiRead<Page<BillRowDto>>(pastPath, () => loadSupplierBills(pastPath!))

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-[1144px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  if (id && existing.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {existing.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={existing.read.error} retry={existing.retry} />
        )}
      </div>
    )
  }

  if (id && existing.read.status === 'ready' && !seeded) {
    setSeeded(true)
    setForm(formOf(existing.read.data, today))
  }

  const set = (changes: Partial<RecurringForm>) => {
    setForm((current) => ({ ...current, ...changes }))
    setErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(changes) as RecurringField[]) delete next[key]
      return next
    })
  }

  const expecting = form.mode === 'EXPECT'
  const amount = Number(form.totalIncludingVat) || 0
  const tolerance = Number(form.tolerancePercent) || 0
  const band = toleranceBand(amount, tolerance)
  const whoName =
    roster?.find((person) => person.id === form.notifyUserId)?.name ??
    (form.notifyUserId ? t('recurringBills.form.someone') : t('recurringBills.form.nobody'))
  const words = plainWords(form, language, whoName)
  const money = (value: number) => formatAmount(value, 'OMR', language)

  const save = async () => {
    const problems = recurringProblems(form)
    setErrors(problems)
    setFailure(null)
    if (Object.keys(problems).length > 0 || busy) return
    setBusy(true)
    try {
      const request = toRecurringRequest(form)
      const saved = id ? await updateRecurringBill(id, request) : await createRecurringBill(request)
      navigate(`/expenditure/recurring-bills/${saved.id}`, { replace: true })
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null
      if (code && RECURRING_REFUSALS[code]) {
        setFailure(t(RECURRING_REFUSALS[code]))
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setFailure(
          message.reference
            ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
            : body,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  /** A label with the design's blue star, the control, and the refusal under it (outside the label, so it is not read as part of the name). */
  const field = (name: RecurringField, label: string, input: ReactNode, required = false) => (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
          {label}
          {required ? (
            <span aria-hidden="true" className="text-xl leading-4 text-primary-700">
              *
            </span>
          ) : null}
        </span>
        {input}
      </label>
      {errors[name] ? (
        <p role="alert" className="text-xs font-medium text-danger-700">
          {t(errors[name]!)}
        </p>
      ) : null}
    </div>
  )

  const dayOptions =
    form.interval === 'WEEKLY'
      ? WEEKDAY_KEYS.map((key, index) => ({
          value: String(index + 1),
          label: t(`recurringBills.weekday.${key}`),
        }))
      : Array.from({ length: 31 }, (_, index) => ({
          value: String(index + 1),
          label: ordinal(index + 1, language),
        }))
  const dueOptions = [
    { value: '', label: t('recurringBills.form.onArrival') },
    ...Array.from({ length: 28 }, (_, index) => ({
      value: String(index + 1),
      label: t('recurringBills.form.ofNextMonth', { day: ordinal(index + 1, language) }),
    })),
  ]
  const categoryOptions = [
    ...CATEGORY_OPTIONS.map((option) => ({
      value: option.value,
      label: t(`recurringBills.categories.${option.key}`),
    })),
    ...(form.category && !CATEGORY_OPTIONS.some((option) => option.value === form.category)
      ? [{ value: form.category, label: form.category }]
      : []),
  ]
  const lateOptions = LATE_AFTER_OPTIONS.map((days) => ({
    value: String(days),
    label: t(days === 0 ? 'recurringBills.form.straightAway' : 'recurringBills.form.afterDays', {
      count: days,
    }),
  }))
  const whoOptions = roster
    ? [
        { value: '', label: t('recurringBills.form.nobody') },
        ...roster.map((person) => ({ value: person.id, label: person.name })),
      ]
    : null

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/expenditure/recurring-bills"
          className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
        >
          {t('recurringBills.title')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">
          {t(id ? 'recurringBills.form.editCrumb' : 'recurringBills.form.newCrumb')}
        </span>
      </div>

      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t(id ? 'recurringBills.form.editTitle' : 'recurringBills.form.title')}
        </h1>
        <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
          {t('recurringBills.form.subtitle')}
        </p>
      </div>

      {failure ? (
        <Notice
          body={failure}
          action={{ label: t('common.close'), onClick: () => setFailure(null) }}
        />
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* 1 */}
          <section className="rounded-md bg-surface-card p-5">
            <SectionTitle step={1} title={t('recurringBills.form.whatIsIt')} />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span
                  id="recurring-supplier-label"
                  className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary"
                >
                  {t('recurringBills.form.preparedBy')}
                  <span className="text-xl leading-4 text-primary-700">*</span>
                </span>
                <SupplierPicker
                  id="recurring-supplier"
                  value={{ id: form.supplierId, name: form.supplierName, vatNumber: null }}
                  onPick={(supplier) =>
                    set({ supplierId: supplier.id, supplierName: supplier.name })
                  }
                  error={errors.supplierName ? t(errors.supplierName) : undefined}
                />
              </div>
              {field(
                'category',
                t('recurringBills.form.category'),
                <Select
                  value={form.category}
                  onChange={(category) => set({ category })}
                  options={categoryOptions}
                  placeholder={t('recurringBills.form.chooseCategory')}
                  ariaLabel={t('recurringBills.form.category')}
                />,
                true,
              )}
              {field(
                'description',
                t('recurringBills.form.whatToCallIt'),
                <input
                  value={form.description}
                  onChange={(event) => set({ description: event.target.value })}
                  className={FIELD}
                  maxLength={200}
                />,
                true,
              )}
              {field(
                'theirReference',
                t('recurringBills.form.theirReference'),
                <input
                  value={form.theirReference}
                  onChange={(event) => set({ theirReference: event.target.value })}
                  className={FIELD}
                  maxLength={100}
                />,
              )}
            </div>
          </section>

          {/* 2 */}
          <section className="rounded-md bg-surface-card p-5">
            <SectionTitle
              step={2}
              title={t(
                expecting
                  ? 'recurringBills.form.whenItArrives'
                  : 'recurringBills.form.whenItIsRaised',
              )}
            />
            <div
              role="group"
              aria-label={t('recurringBills.form.howOften')}
              className="mt-4 grid grid-cols-2 gap-1 rounded-sm border border-border-subtle bg-white p-1 md:grid-cols-4"
            >
              {INTERVALS.map((interval) => {
                const active = interval === form.interval
                return (
                  <button
                    key={interval}
                    type="button"
                    onClick={() =>
                      set({
                        interval,
                        arrivesAroundDay:
                          interval === 'WEEKLY' && Number(form.arrivesAroundDay) > 7
                            ? '1'
                            : form.arrivesAroundDay,
                      })
                    }
                    aria-pressed={active}
                    className={[
                      'inline-flex h-[46px] items-center justify-center rounded-sm text-base transition-colors',
                      active
                        ? 'bg-primary-25 font-semibold text-primary-800'
                        : 'font-medium text-text-tertiary hover:text-text-secondary',
                    ].join(' ')}
                  >
                    {t(`recurringBills.interval.${interval}`)}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {expecting
                ? field(
                    'arrivesAroundDay',
                    t(
                      form.interval === 'WEEKLY'
                        ? 'recurringBills.form.arrivesOn'
                        : 'recurringBills.form.arrivesAround',
                    ),
                    <Select
                      value={form.arrivesAroundDay}
                      onChange={(arrivesAroundDay) => set({ arrivesAroundDay })}
                      options={dayOptions}
                      ariaLabel={t(
                        form.interval === 'WEEKLY'
                          ? 'recurringBills.form.arrivesOn'
                          : 'recurringBills.form.arrivesAround',
                      )}
                    />,
                    true,
                  )
                : field(
                    'startDate',
                    t('recurringBills.form.startsOn'),
                    <DateField
                      value={form.startDate}
                      min={today}
                      ariaLabel={t('recurringBills.form.startsOn')}
                      onChange={(startDate) => set({ startDate })}
                    />,
                    true,
                  )}
              {field(
                'paymentDueDay',
                t('recurringBills.form.paymentDue'),
                <Select
                  value={form.paymentDueDay}
                  onChange={(paymentDueDay) => set({ paymentDueDay })}
                  options={dueOptions}
                  ariaLabel={t('recurringBills.form.paymentDue')}
                />,
              )}
              {expecting
                ? field(
                    'watchingFrom',
                    t('recurringBills.form.watchingFrom'),
                    <DateField
                      value={form.watchingFrom}
                      ariaLabel={t('recurringBills.form.watchingFrom')}
                      onChange={(watchingFrom) => set({ watchingFrom })}
                    />,
                  )
                : field(
                    'endDate',
                    t('recurringBills.form.endsOn'),
                    <DateField
                      value={form.endDate}
                      ariaLabel={t('recurringBills.form.endsOn')}
                      onChange={(endDate) => set({ endDate })}
                    />,
                  )}
            </div>
          </section>

          {/* 3 */}
          <section className="rounded-md bg-surface-card p-5">
            <SectionTitle step={3} title={t('recurringBills.form.whatItCosts')} />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {field(
                'totalIncludingVat',
                t('recurringBills.form.usualAmount'),
                <span className="flex h-[50px] items-center gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4 focus-within:border-primary-500">
                  <RialMark className="w-5 shrink-0 text-text-secondary" />
                  <input
                    value={form.totalIncludingVat}
                    inputMode="decimal"
                    onFocus={selectAllOnFocus}
                    onChange={(event) => set({ totalIncludingVat: event.target.value })}
                    className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                  />
                </span>,
                true,
              )}
              {field(
                'vatTreatment',
                t('recurringBills.form.vatTreatment'),
                <Select
                  value={form.vatTreatment}
                  onChange={(vatTreatment) => set({ vatTreatment: vatTreatment as VatTreatment })}
                  options={VAT_TREATMENTS.map((value) => ({
                    value,
                    label: t(`recurringBills.vat.${value}`),
                  }))}
                  ariaLabel={t('recurringBills.form.vatTreatment')}
                />,
              )}
            </div>

            {expecting ? (
              <div
                className={[
                  'mt-4 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-border-subtle p-4',
                  form.flagOutsideRange ? '' : 'opacity-50',
                ].join(' ')}
              >
                <div className="min-w-[260px] flex-1">
                  <p className="text-base font-medium leading-[1.2] text-text-primary">
                    {t('recurringBills.form.tellMeIfItMoves')}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-[1.4] text-text-quaternary">
                    {withRial(
                      t('recurringBills.form.toleranceNote', {
                        low: `OMR ${money(band.low)}`,
                        high: `OMR ${money(band.high)}`,
                      }),
                    )}
                  </p>
                  {errors.tolerancePercent ? (
                    <p role="alert" className="mt-1 text-xs font-medium text-danger-700">
                      {t(errors.tolerancePercent)}
                    </p>
                  ) : null}
                </div>
                <div className="inline-flex shrink-0 items-center rounded-sm border border-border-subtle bg-white">
                  <button
                    type="button"
                    disabled={!form.flagOutsideRange}
                    onClick={() => set({ tolerancePercent: String(Math.max(0, tolerance - 1)) })}
                    aria-label={t('recurringBills.form.decreaseTolerance')}
                    className="inline-flex size-11 items-center justify-center text-lg font-semibold text-text-tertiary transition-colors hover:bg-primary-25"
                  >
                    -
                  </button>
                  <input
                    value={form.tolerancePercent}
                    inputMode="numeric"
                    disabled={!form.flagOutsideRange}
                    onFocus={selectAllOnFocus}
                    onChange={(event) =>
                      set({ tolerancePercent: event.target.value.replace(/[^\d.]/g, '') })
                    }
                    aria-label={t('recurringBills.form.tellMeIfItMoves')}
                    className="w-14 border-0 bg-transparent text-center text-base font-semibold text-text-primary outline-none tabular-nums"
                  />
                  <span className="-ms-3 pe-2 text-base font-semibold text-text-primary">%</span>
                  <button
                    type="button"
                    disabled={!form.flagOutsideRange}
                    onClick={() => set({ tolerancePercent: String(Math.min(100, tolerance + 1)) })}
                    aria-label={t('recurringBills.form.increaseTolerance')}
                    className="inline-flex size-11 items-center justify-center text-lg font-semibold text-text-tertiary transition-colors hover:bg-primary-25"
                  >
                    +
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {/* 4 */}
          {expecting ? (
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={4} title={t('recurringBills.form.whenToTellYou')} />
              <div className="mt-2">
                <RuleRow
                  title={t('recurringBills.form.ifNotArrived')}
                  note={t('recurringBills.form.ifNotArrivedNote')}
                  control={
                    <div className="w-[190px]">
                      <Select
                        value={form.lateAfterDays}
                        onChange={(lateAfterDays) => set({ lateAfterDays })}
                        options={lateOptions}
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
                    <Switch
                      checked={form.flagOutsideRange}
                      onChange={(flagOutsideRange) => set({ flagOutsideRange })}
                      label={t('recurringBills.form.ifOutsideRange')}
                    />
                  }
                />
                <RuleRow
                  title={t('recurringBills.form.autoApprove')}
                  note={t('recurringBills.form.autoApproveNote')}
                  control={
                    <Switch
                      checked={form.autoApproveWithinRange}
                      onChange={(autoApproveWithinRange) => set({ autoApproveWithinRange })}
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
                      {whoOptions ? (
                        <Select
                          value={form.notifyUserId ?? ''}
                          onChange={(notifyUserId) => set({ notifyUserId: notifyUserId || null })}
                          options={whoOptions}
                          ariaLabel={t('recurringBills.form.whoGetsTold')}
                          compact
                        />
                      ) : (
                        <span className="block text-end text-sm font-medium text-text-tertiary">
                          {people.read.status === 'loading' ? t('billIntake.searching') : whoName}
                        </span>
                      )}
                    </div>
                  }
                />
              </div>
            </section>
          ) : null}
        </div>

        {/* What you're setting up */}
        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
          <section className="rounded-md bg-surface-card p-5">
            <h2 className="border-b border-surface-background pb-4 text-xl font-medium leading-[1.2] text-text-secondary">
              {t('recurringBills.form.whatYoureSettingUp')}
            </h2>
            <div className="mt-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
              <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.8px] text-primary-800">
                {t('recurringBills.form.inPlainWords')}
              </p>
              <p className="mt-2 text-sm font-medium leading-[1.5] text-text-tertiary">
                {withRial(
                  t(words.key, {
                    ...words.values,
                    amount: `OMR ${amount ? money(amount) : '…'}`,
                    when: t(String(words.values?.when), {
                      day: String(words.values?.day).startsWith('recurringBills.')
                        ? t(String(words.values?.day))
                        : words.values?.day,
                    }),
                  }),
                )}
              </p>
            </div>

            {expecting ? (
              <ol className="mt-5 flex flex-col">
                {timelineOf(form, language).map((step, index, all) => (
                  <li key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-background text-[11px] font-semibold text-text-tertiary">
                        {step.day || '·'}
                      </span>
                      {index < all.length - 1 ? (
                        <span className="w-px flex-1 bg-border-subtle" />
                      ) : null}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                        {t(step.key)}
                      </p>
                      <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                        {t(step.noteKey, { who: whoName })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h2 className="border-b border-surface-background pb-4 text-xl font-medium leading-[1.2] text-text-secondary">
              {t('recurringBills.form.pastBills')}
            </h2>
            {!form.supplierId ? (
              <p className="mt-4 text-sm font-medium leading-[1.4] text-text-tertiary">
                {form.supplierName
                  ? t('recurringBills.form.noPastBills', { supplier: form.supplierName })
                  : t('recurringBills.form.pickSupplierFirst')}
              </p>
            ) : past.read.status === 'loading' ? (
              <LoadingNotice />
            ) : past.read.status === 'failed' ? (
              <p className="mt-4 text-sm font-medium leading-[1.4] text-text-tertiary">
                {t('recurringBills.form.pastBillsUnavailable')}
              </p>
            ) : past.read.data.items.length === 0 ? (
              <p className="mt-4 text-sm font-medium leading-[1.4] text-text-tertiary">
                {t('recurringBills.form.noPastBills', { supplier: form.supplierName })}
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-4">
                {past.read.data.items.slice(0, 3).map((bill) => (
                  <li key={bill.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/expenditure/bills/${bill.id}`}
                        className="truncate text-sm font-semibold leading-[1.2] text-text-primary hover:text-primary-700"
                      >
                        {bill.supplierBillNumber ?? t('paymentRuns.unnumbered')}
                      </Link>
                      <p className="mt-0.5 text-xs font-medium leading-[1.2] text-text-muted">
                        {bill.issueDate ? formatDate(bill.issueDate, language) : ''}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
                      <RialMark className="w-4 shrink-0" />
                      {bill.totalIncludingVat === null
                        ? ''
                        : formatAmount(bill.totalIncludingVat, bill.currencyCode, language)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {/* The bar the frame pins to the bottom: the instruction in a line, cancel, add. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border-subtle bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-[1144px] flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-sm font-medium text-text-secondary max-md:hidden">
            {t(`recurringBills.interval.${form.interval}`)}
            {expecting
              ? ` · ${t(String(words.values?.when), { day: String(words.values?.day).startsWith('recurringBills.') ? t(String(words.values?.day)) : words.values?.day })}`
              : ''}
            {' · '}
            {withRial(
              t('recurringBills.form.aboutFrom', {
                amount: `OMR ${amount ? money(amount) : '…'}`,
                supplier: form.supplierName || '…',
              }),
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3 max-md:w-full max-md:justify-end">
            <Link
              to="/expenditure/recurring-bills"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('common.cancel')}
            </Link>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              {busy
                ? t('common.saving')
                : t(id ? 'recurringBills.form.save' : 'recurringBills.form.add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
