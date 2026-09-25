import { useEffect, useState, type ReactNode } from 'react'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  Combobox,
  DateField,
  OmAmount,
  Select,
  Switch,
  type ActionMenuItem,
  type SelectOption,
} from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useLineTotals } from '../../components/invoice'
import { useApiRead } from '../../hooks'
import { ApiError, type Page } from '../../api'
import {
  createPeriodicSchedule,
  loadPeriodicRuns,
  loadPeriodicSchedule,
  periodicRunsPath,
  periodicSchedulePath,
  setPeriodicActive,
  updatePeriodicSchedule,
  type PeriodicRunDto,
  type PeriodicScheduleDto,
} from '../../api/invoices/periodic'
import {
  CUSTOMERS_PATH,
  customerListPath,
  loadCustomer,
  loadCustomerPage,
  type CustomerDto,
} from '../../api/customers/customers'
import {
  invoicePath,
  loadInvoice,
  loadInternalNote,
  type InvoiceDetailDto,
} from '../../api/invoices/detail'
import { BRANCHES_PATH, loadBranches, type BranchDto } from '../../api/invoices/drafts'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import { FALLBACK_TAX_CATEGORIES as TAX_CATEGORIES } from '../../lib/selfBillCreate'
import { PAYMENT_TERMS } from '../../lib/invoiceDraft'
import { formatAtScale } from '../../lib/invoiceMath'
import { can, useSession } from '../../lib/session/session'
import {
  PERIODIC_INTERVALS,
  PERIODIC_REFUSALS,
  blankPeriodicForm,
  blankPeriodicLine,
  cadenceNote,
  dateForRepeat,
  daysBetween,
  draftedCount,
  endingOf,
  formOfInvoice,
  formOfSchedule,
  linesOfInvoice,
  linesOfTemplate,
  periodicProblems,
  repeatOptions,
  repeatValue,
  scheduleStatus,
  taxRateOf,
  templateOfForm,
  toCreateRequest,
  toUpdateRequest,
  upcomingRuns,
  type PeriodicEnding,
  type PeriodicField,
  type PeriodicForm,
  type PeriodicLine,
  type PeriodicStatus,
} from '../../lib/periodicInvoice'
import { LineComposer } from './LineComposer'
import chevronIcon from '../../assets/invoices/chevron.svg'
import scheduleIcon from '../../assets/periodic/schedule.svg'
import clockIcon from '../../assets/periodic/clock.svg'
import pauseIcon from '../../assets/periodic/pause.svg'
import resumeIcon from '../../assets/actions/periodic.svg'
import saveIcon from '../../assets/customers/save.svg'
import infoIcon from '../../assets/periodic/info.svg'
import invoiceTileIcon from '../../assets/periodic/invoice-tile.svg'
import peppolIcon from '../../assets/periodic/peppol.svg'
import customerLogo from '../../assets/periodic/customer-logo.svg'
import viewIcon from '../../assets/actions/view.svg'
import invoiceActionIcon from '../../assets/actions/invoice.svg'

/** The customers list refuses a page over 100, so names are read a hundred at a time. */
const CUSTOMER_PAGE_SIZE = 100
const UPCOMING_COUNT = 4

const muscatToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

const STATUS_STYLES: Record<PeriodicStatus, string> = {
  active: 'bg-success-100 text-success-700',
  paused: 'bg-pending-100 text-pending-700',
  finished: 'bg-neutral-25 text-neutral-700',
  onRequest: 'bg-primary-25 text-primary-700',
  draft: 'bg-neutral-25 text-neutral-700',
}

const RUN_PILL: Record<string, string> = {
  DRAFTED: 'bg-pending-100 text-pending-700',
  FAILED: 'bg-danger-100 text-danger-700',
  SKIPPED: 'bg-neutral-25 text-neutral-700',
  PAID: 'bg-success-100 text-success-700',
  PARTIALLY_PAID: 'bg-pending-100 text-pending-700',
  UNPAID: 'bg-warning-100 text-warning-700',
}

const ENDINGS: PeriodicEnding[] = ['never', 'date', 'count']

const FIELD =
  'flex h-[50px] w-full items-center rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder focus:border-primary-500 disabled:border-border-subtle'

/**
 * One periodic schedule (I-13, Figma 154:164555): setting one up, reading it and editing it are
 * the same screen, as the design draws them: the document on the left, the schedule on the right,
 * the lines below, then what it has raised and what is to come.
 *
 * The design sets a schedule up **from scratch**: customer, details, lines, schedule, notes. The
 * API knows only "copy invoice X on a cadence", so the schedule half goes to its routes as before
 * and the document half travels as the schedule's own template (TODO(backend), see
 * `PeriodicTemplateDto`). An invoice handed over as `?template=<id>` (from the invoice pages) or a
 * schedule as `?copy=<id>` (the list's Duplicate) is a pre-fill, never the only door.
 */
export function PeriodicInvoicePage({ mode }: { mode: 'view' | 'create' | 'edit' }) {
  const { id } = useParams()
  return (
    <AppShell>
      <ScheduleComposer key={id ?? 'new'} id={mode === 'create' ? null : (id ?? null)} />
    </AppShell>
  )
}

function ScheduleComposer({ id }: { id: string | null }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const session = useSession()
  const canManage = can(session, 'invoice.draft')
  const locked = !canManage
  const today = muscatToday()
  const [form, setForm] = useState<PeriodicForm>(() => blankPeriodicForm(today))
  const [lines, setLines] = useState<PeriodicLine[]>(() => [blankPeriodicLine('1', '5')])
  const [exclVat, setExclVat] = useState(true)
  const [seeded, setSeeded] = useState<'schedule' | 'invoice' | null>(null)
  const [changingCustomer, setChangingCustomer] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<PeriodicField, string>>>({})
  const [notice, setNotice] = useState<{ key: string } | { body: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // A schedule to edit, or one to duplicate: both seed the form the same way.
  const copyId = id ? null : params.get('copy')
  const sourceId = id ?? copyId
  const existing = useApiRead<PeriodicScheduleDto>(
    sourceId ? periodicSchedulePath(sourceId) : null,
    sourceId ? () => loadPeriodicSchedule(sourceId) : undefined,
  )
  const schedule = existing.read.status === 'ready' ? existing.read.data : null
  const runsPath = id ? periodicRunsPath(id) : null
  const runs = useApiRead<PeriodicRunDto[]>(
    runsPath,
    runsPath ? () => loadPeriodicRuns(runsPath) : undefined,
  )

  // The invoice a schedule was copied from, when it has no template of its own, or the one the
  // invoice pages handed over as a pre-fill.
  const prefillId = !sourceId
    ? params.get('template')
    : schedule && !schedule.template
      ? schedule.templateInvoiceId
      : null
  const prefill = useApiRead<InvoiceDetailDto>(prefillId ? invoicePath(prefillId) : null, () =>
    loadInvoice(prefillId ?? ''),
  )
  const prefillNote = useApiRead<{ internalNote: string | null }>(
    prefillId ? `${invoicePath(prefillId)}/internal-note` : null,
    () => loadInternalNote(prefillId ?? ''),
  )

  useEffect(() => {
    if (!schedule || seeded) return
    setSeeded('schedule')
    const next = formOfSchedule(schedule, today)
    if (copyId) {
      next.firstRunDate = next.firstRunDate < today ? today : next.firstRunDate
      next.occurrences = ''
    }
    setForm(next)
    if (schedule.template) {
      setLines(linesOfTemplate(schedule.template))
      setExclVat(schedule.template.vatMode !== 'INCLUSIVE')
    }
  }, [schedule, seeded, today, copyId])

  useEffect(() => {
    if (seeded === 'invoice' || prefill.read.status !== 'ready') return
    if (prefillNote.read.status === 'loading') return
    const doc = prefill.read.data
    const note = prefillNote.read.status === 'ready' ? prefillNote.read.data.internalNote : null
    setSeeded('invoice')
    setForm((current) => formOfInvoice(current, doc, note))
    if (doc.lines.length > 0) setLines(linesOfInvoice(doc.lines))
    setExclVat(doc.vatMode !== 'INCLUSIVE')
  }, [prefill.read, prefillNote.read, seeded])

  const customerId = form.customerId || null
  const customer = useApiRead<CustomerDto>(
    customerId ? `${CUSTOMERS_PATH}/${customerId}` : null,
    () => loadCustomer(customerId ?? ''),
  )
  const customerRow = customer.read.status === 'ready' ? customer.read.data : null
  const customerName = customerRow?.displayName ?? null
  const customersPath = customerListPath({
    type: null,
    search: '',
    sort: 'NAME_ASC',
    page: 0,
    size: CUSTOMER_PAGE_SIZE,
  })
  const customers = useApiRead<Page<CustomerDto>>(customersPath, () =>
    loadCustomerPage(customersPath),
  )
  const branches = useApiRead<BranchDto[]>(BRANCHES_PATH, loadBranches)
  const branchOptions: SelectOption[] =
    branches.read.status === 'ready'
      ? branches.read.data.map((branch) => ({
          value: branch.id,
          label: branch.name,
          hint: branch.city ?? undefined,
        }))
      : []
  // The branch is pre-filled, as the composer rules say: the first one, until the form names one.
  useEffect(() => {
    if (form.branchId || branchOptions.length === 0) return
    setForm((current) =>
      current.branchId ? current : { ...current, branchId: branchOptions[0].value },
    )
  }, [form.branchId, branchOptions])

  const totals = useLineTotals(lines, exclVat)
  const total = totals.total
  const amount = (value: bigint) => formatAtScale(value)
  // Named as the invoice composer names them, on the trigger and on every line.
  const taxOptions: SelectOption[] = TAX_CATEGORIES.map((category) => ({
    value: category.code,
    label: t(`createInvoice.taxCategories.${category.code}`, { defaultValue: category.code }),
    hint: `EN 16931 · ${category.en16931Category}`,
  }))
  const termsOptions: SelectOption[] = PAYMENT_TERMS.map((term) => ({
    value: term.code,
    label: t(term.labelKey, { defaultValue: term.label }),
  }))
  const currencyOptions: SelectOption[] = [
    { value: 'OMR', label: t('createInvoice.values.currency') },
  ]
  const taxLabel =
    taxOptions.find((option) => option.value === form.taxCategory)?.label ?? form.taxCategory
  const termsLabel =
    termsOptions.find((option) => option.value === form.paymentTerms)?.label ?? null
  const describedLines = lines.filter((line) => line.description.trim()).length

  if (!canManage && !id) {
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

  const set = (changes: Partial<PeriodicForm>) => {
    setForm((current) => ({ ...current, ...changes }))
    setErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(changes) as PeriodicField[]) delete next[key]
      return next
    })
  }

  const setTaxCategory = (taxCategory: string) => {
    set({ taxCategory })
    const rate = taxRateOf(taxCategory)
    setLines((current) => current.map((line) => ({ ...line, vatRate: rate })))
  }

  const changeLines = (next: PeriodicLine[]) => {
    setLines(next)
    setErrors((current) => {
      const rest = { ...current }
      delete rest.lines
      return rest
    })
  }

  const fail = (error: unknown) => {
    const code = error instanceof ApiError ? error.code : null
    if (code && PERIODIC_REFUSALS[code]) {
      setNotice({ key: PERIODIC_REFUSALS[code] })
      return
    }
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice({
      body: message.reference
        ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
        : body,
    })
  }

  const save = async () => {
    const problems = periodicProblems(form, today, Boolean(id), describedLines)
    setErrors(problems)
    setNotice(null)
    if (Object.keys(problems).length > 0 || busy) return
    setBusy(true)
    const template = templateOfForm(form, lines, exclVat, termsLabel)
    try {
      if (id) {
        await updatePeriodicSchedule(id, toUpdateRequest(form, template))
        existing.retry()
        setNotice({ key: 'periodicInvoice.done.saved' })
      } else {
        const saved = await createPeriodicSchedule(toCreateRequest(form, template))
        navigate(`/income/periodic/${saved.id}`, { replace: true })
      }
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async () => {
    if (!id || !schedule || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const saved = await setPeriodicActive(id, !schedule.active)
      existing.retry()
      setNotice(
        schedule.active
          ? { key: 'periodicList.done.paused' }
          : {
              body: t('periodicList.done.resumed', {
                date: formatDate(saved.nextRunDate, language),
              }),
            },
      )
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const status = id && schedule ? scheduleStatus(schedule) : null
  const title =
    [form.subject.trim(), customerName].filter(Boolean).join(', ') ||
    t(id ? 'periodicInvoice.title' : 'periodicInvoice.newTitle')
  const cadence = cadenceNote({ interval: form.interval, nextRunDate: form.firstRunDate || today })
  const cadenceText = t(cadence.key, {
    ...cadence.values,
    ordinal: true,
    weekday: cadence.values?.weekday
      ? t(`periodicList.weekday.${cadence.values.weekday}`)
      : undefined,
    date: cadence.values?.date
      ? formatDate(String(cadence.values.date), language).replace(/\s\d{4}$/, '')
      : undefined,
  })
  const everyText = t(`periodicInvoice.every.${form.interval}`, { cadence: cadenceText })
  const nextRun = (id && schedule?.nextRunDate) || form.firstRunDate
  const daysToNext = nextRun ? daysBetween(today, nextRun) : null
  const ending = endingOf(form)
  // Derived from the cadence (IBR-036-OM), as the server derives it: shown, never chosen.
  const subtype =
    form.interval === 'WEEKLY' || form.interval === 'MONTHLY' ? 'SUMMARY' : 'CONTINUOUS_SUPPLY'
  const upcoming =
    id && schedule
      ? upcomingRuns(
          {
            ...schedule,
            interval: form.interval,
            nextRunDate: form.firstRunDate || schedule.nextRunDate,
            endDate: form.endDate || null,
            remainingOccurrences: form.occurrences.trim() ? Number(form.occurrences) : null,
          },
          UPCOMING_COUNT,
        )
      : []
  const runRows = runs.read.status === 'ready' ? runs.read.data : []
  const started =
    schedule?.createdAt?.slice(0, 10) ??
    (runRows.length > 0
      ? runRows.reduce(
          (oldest, run) => (run.runDate < oldest ? run.runDate : oldest),
          runRows[0].runDate,
        )
      : null)
  const repeats = repeatOptions(form.interval, form.firstRunDate || today)
  const repeatLabel = (option: (typeof repeats)[number]) =>
    t(option.key, {
      ...option.values,
      ordinal: true,
      weekday: option.values?.weekday
        ? t(`periodicList.weekday.${option.values.weekday}`)
        : undefined,
      date: option.values?.date
        ? formatDate(String(option.values.date), language).replace(/\s\d{4}$/, '')
        : undefined,
    })

  const customerOptions: SelectOption[] = (
    customers.read.status === 'ready' ? customers.read.data.items : []
  ).map((row) => ({
    value: row.id,
    label: row.displayName,
    hint: row.profile?.details?.vatRegistrationNumber ?? undefined,
  }))
  const peppolId = customerRow?.profile?.details?.peppolParticipantId ?? null
  const vatNumber = customerRow?.profile?.details?.vatRegistrationNumber ?? null
  const isConsumer = customerRow?.type === 'CONSUMER'

  const headerMenu: ActionMenuItem[] = [
    ...(form.templateInvoiceId
      ? [
          {
            id: 'template',
            labelKey: 'periodicInvoice.openTemplate',
            icon: invoiceActionIcon,
            to: `/invoices/${form.templateInvoiceId}`,
          },
        ]
      : []),
    ...(customerId
      ? [
          {
            id: 'customer',
            labelKey: 'periodicInvoice.openCustomer',
            icon: viewIcon,
            to: `/customers/${customerId}`,
          },
        ]
      : []),
  ]

  const problem = (name: PeriodicField) =>
    errors[name] ? (
      <p role="alert" className="mt-1 text-xs font-medium text-danger-700">
        {t(errors[name]!)}
      </p>
    ) : null

  const chooseCustomer = (value: string) => {
    set({
      customerId: value,
      templateInvoiceId: value === form.customerId ? form.templateInvoiceId : '',
    })
    setChangingCustomer(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {/* Header: breadcrumb, name and status, the cadence in one line, and the actions. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-medium leading-[1.2] text-text-quaternary">
              {t('periodicList.breadcrumbIncome')}
            </span>
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
            <Link
              to="/income/periodic"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('periodicList.title')}
            </Link>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{title}</h1>
            {status ? (
              <span
                className={[
                  'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-medium',
                  STATUS_STYLES[status],
                ].join(' ')}
              >
                <span className="size-1.5 shrink-0 rounded-full bg-current" />
                {t(`periodicList.status.${status}`)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base leading-[1.2] text-text-tertiary">
            <span>{t('periodicInvoice.kind')}</span>
            <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            <span>{everyText}</span>
            {nextRun ? (
              <>
                <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
                <span>{t('periodicInvoice.nextShort')}</span>
                <span className="font-semibold text-text-primary">
                  {formatDate(nextRun, language)}
                </span>
              </>
            ) : null}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-3">
            {id ? (
              <>
                {headerMenu.length > 0 ? (
                  <ActionMenu
                    items={headerMenu}
                    label={t('periodicInvoice.moreActions')}
                    variant="bordered"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => void toggle()}
                  disabled={busy}
                  className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-50"
                >
                  <img src={schedule?.active ? pauseIcon : resumeIcon} alt="" className="size-5" />
                  {t(
                    schedule?.active
                      ? 'periodicInvoice.pauseSeries'
                      : 'periodicInvoice.resumeSeries',
                  )}
                </button>
              </>
            ) : (
              <Link
                to="/income/periodic"
                className="inline-flex h-[46px] items-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
              >
                {t('common.cancel')}
              </Link>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              <img src={saveIcon} alt="" className="size-5 brightness-0 invert" />
              {busy
                ? t('periodicInvoice.saving')
                : t(id ? 'periodicInvoice.saveChanges' : 'periodicInvoice.start')}
            </button>
          </div>
        ) : null}
      </div>

      {notice ? (
        <Notice
          body={'key' in notice ? t(notice.key) : notice.body}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_332px]">
        <div className="flex flex-col gap-4">
          {/* Invoice details: the document half, editable from scratch as the design draws it. */}
          <Card title={t('periodicInvoice.sections.details')}>
            <div>
              <FieldLabel label={t('periodicInvoice.fields.customer')} required />
              {customerId && !changingCustomer ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-2 py-3.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <img src={customerLogo} alt="" className="size-12 rounded-sm object-cover" />
                    <div className="min-w-0">
                      <Link
                        to={`/customers/${customerId}`}
                        className="block truncate text-base font-medium leading-[1.2] text-text-primary hover:text-primary-700 hover:underline"
                      >
                        {customerName ?? t('periodicInvoice.openCustomer')}
                      </Link>
                      <p className="truncate text-xs font-medium leading-[1.2] text-text-quaternary">
                        {[
                          vatNumber ? t('periodicInvoice.vat', { number: vatNumber }) : null,
                          peppolId ? `${peppolId.scheme}:${peppolId.value}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || t('periodicInvoice.noVat')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {customerRow?.peppolDelivery === 'ACTIVE' ? (
                      <span className="inline-flex h-7 items-center gap-1 rounded-full border border-primary-75 bg-white py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                        <img src={peppolIcon} alt="" className="size-4" />
                        {t('periodicInvoice.onPeppol')}
                      </span>
                    ) : null}
                    {locked ? null : (
                      <button
                        type="button"
                        onClick={() => setChangingCustomer(true)}
                        className="inline-flex h-[38px] items-center gap-0.5 rounded-sm border border-border-subtle bg-white py-1.5 ps-3.5 pe-2.5 text-sm font-semibold text-primary-800 hover:bg-primary-25"
                      >
                        {t('periodicInvoice.change')}
                        <img src={chevronIcon} alt="" className="size-5 rotate-90" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <Combobox
                  options={customerOptions}
                  value={form.customerId}
                  onChange={chooseCustomer}
                  ariaLabel={t('periodicInvoice.fields.customer')}
                  placeholder={t('periodicInvoice.chooseCustomer')}
                  searchPlaceholder={t('periodicInvoice.searchCustomers')}
                  emptyText={t('periodicInvoice.noCustomers')}
                />
              )}
              {problem('customerId')}
            </div>

            <TextField
              label={t('periodicInvoice.fields.subject')}
              value={form.subject}
              disabled={locked}
              placeholder={t('periodicInvoice.subjectPlaceholder')}
              onChange={(subject) => set({ subject })}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label={t('periodicInvoice.fields.po')}
                value={form.purchaseOrderReference}
                disabled={locked}
                placeholder={t('periodicInvoice.poPlaceholder')}
                onChange={(purchaseOrderReference) => set({ purchaseOrderReference })}
              />
              <div>
                <FieldLabel label={t('periodicInvoice.fields.paymentTerms')} />
                <Select
                  value={form.paymentTerms}
                  disabled={locked}
                  onChange={(paymentTerms) => set({ paymentTerms })}
                  options={termsOptions}
                  ariaLabel={t('periodicInvoice.fields.paymentTerms')}
                />
              </div>
              <div>
                <FieldLabel label={t('periodicInvoice.fields.currency')} required />
                <Select
                  value={form.currency}
                  disabled={locked}
                  onChange={(currency) => set({ currency })}
                  options={currencyOptions}
                  ariaLabel={t('periodicInvoice.fields.currency')}
                />
              </div>
              <div>
                <FieldLabel label={t('periodicInvoice.fields.taxCategory')} required />
                <Select
                  value={form.taxCategory}
                  disabled={locked}
                  onChange={setTaxCategory}
                  // The full name on the trigger, as the design's field reads ("Standard rate - 5%").
                  options={taxOptions}
                  ariaLabel={t('periodicInvoice.fields.taxCategory')}
                />
              </div>
              <div>
                <FieldLabel label={t('periodicInvoice.fields.branch')} />
                <Select
                  value={form.branchId}
                  disabled={locked}
                  onChange={(branchId) => set({ branchId })}
                  options={branchOptions}
                  placeholder={t('periodicInvoice.chooseBranch')}
                  ariaLabel={t('periodicInvoice.fields.branch')}
                />
              </div>
            </div>
          </Card>

          <Card title={t('periodicInvoice.sections.notes')}>
            <div className="grid gap-4 md:grid-cols-2">
              <NoteField
                label={t('periodicInvoice.fields.noteCustomer')}
                hint={t('periodicInvoice.fields.onInvoice')}
                value={form.customerNote}
                disabled={locked}
                onChange={(customerNote) => set({ customerNote })}
              />
              <NoteField
                label={t('periodicInvoice.fields.internalNote')}
                hint={t('periodicInvoice.fields.private')}
                value={form.internalNote}
                disabled={locked}
                onChange={(internalNote) => set({ internalNote })}
              />
            </div>
          </Card>
        </div>

        {/* Schedule: the half the API's routes take as they are. */}
        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
            <div className="flex items-center gap-2">
              <img src={scheduleIcon} alt="" className="size-6" />
              <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('periodicInvoice.sections.schedule')}
              </h2>
            </div>
            <div className="h-px w-full bg-surface-background" />

            <div className="rounded-sm border border-primary-75 bg-primary-25 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-primary-800">
                {t('periodicInvoice.cadence.title')}
              </p>
              <p className="mt-1 text-sm font-medium leading-[1.4] text-text-primary">
                {t(`periodicInvoice.cadence.${ending}`, {
                  every: everyText,
                  date: form.endDate ? formatDate(form.endDate, language) : '',
                  count: form.occurrences.trim() ? Number(form.occurrences) : 0,
                })}
              </p>
              {nextRun && daysToNext !== null ? (
                <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs font-medium text-text-tertiary">
                  <img src={clockIcon} alt="" className="size-3.5" />
                  {t('periodicInvoice.cadence.next')}
                  <span className="font-semibold text-text-primary">
                    {formatDate(nextRun, language)}
                  </span>
                  {daysToNext >= 0
                    ? t('periodicInvoice.cadence.inDays', { count: daysToNext })
                    : t('periodicInvoice.cadence.overdue')}
                </p>
              ) : null}
            </div>

            <div>
              <FieldLabel label={t('periodicInvoice.frequency')} />
              <div
                role="tablist"
                aria-label={t('periodicInvoice.frequency')}
                className="grid grid-cols-4 rounded-sm border border-border-subtle bg-surface-tab-bar p-1"
              >
                {PERIODIC_INTERVALS.map((option) => {
                  const active = option === form.interval
                  return (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={locked}
                      onClick={() => set({ interval: option })}
                      className={[
                        'h-9 rounded-sm px-1 text-xs font-medium transition-colors',
                        active
                          ? 'bg-white font-semibold text-primary-800 shadow-sm'
                          : 'text-text-quaternary hover:text-text-secondary',
                      ].join(' ')}
                    >
                      {t(`periodicList.interval.${option}`)}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                <span className="font-semibold text-text-secondary">
                  {t(`periodicList.subtype.${subtype}`)}
                </span>{' '}
                · {t('periodicInvoice.fields.subtypeNote')}
              </p>
            </div>

            <div>
              <FieldLabel label={t('periodicInvoice.repeatsOn')} />
              <Select
                value={repeatValue(form.interval, form.firstRunDate || today)}
                disabled={locked}
                ariaLabel={t('periodicInvoice.repeatsOn')}
                onChange={(value) =>
                  set({
                    firstRunDate: dateForRepeat(form.interval, value, form.firstRunDate, today),
                  })
                }
                options={repeats.map((option) => ({
                  value: option.value,
                  label: repeatLabel(option),
                }))}
              />
            </div>

            <div>
              <FieldLabel
                label={t(id ? 'periodicInvoice.fields.nextDraft' : 'periodicInvoice.starts')}
                required
              />
              <DateField
                value={form.firstRunDate}
                min={today}
                disabled={locked}
                ariaLabel={t(id ? 'periodicInvoice.fields.nextDraft' : 'periodicInvoice.starts')}
                onChange={(firstRunDate) => set({ firstRunDate })}
              />
              {problem('firstRunDate')}
            </div>

            <div>
              <FieldLabel label={t('periodicInvoice.ends')} />
              <Select
                value={ending}
                disabled={locked}
                ariaLabel={t('periodicInvoice.ends')}
                onChange={(value) => {
                  const next = value as PeriodicEnding
                  set({
                    endDate: next === 'date' ? form.endDate || form.firstRunDate || today : '',
                    occurrences: next === 'count' ? form.occurrences || '12' : '',
                  })
                }}
                options={ENDINGS.map((value) => ({
                  value,
                  label: t(`periodicInvoice.ending.${value}`),
                }))}
              />
              {ending === 'date' ? (
                <div className="mt-2">
                  <DateField
                    value={form.endDate}
                    min={form.firstRunDate || today}
                    disabled={locked}
                    ariaLabel={t('periodicInvoice.fields.endsOn')}
                    onChange={(endDate) => set({ endDate })}
                  />
                  {problem('endDate')}
                </div>
              ) : null}
              {ending === 'count' ? (
                <div className="mt-2">
                  <div className="flex h-[50px] items-center rounded-sm border border-primary-300 bg-surface-tab-bar px-4">
                    <input
                      value={form.occurrences}
                      disabled={locked}
                      onChange={(event) => set({ occurrences: event.target.value })}
                      inputMode="numeric"
                      onFocus={selectAllOnFocus}
                      aria-label={t('periodicInvoice.fields.left')}
                      className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                    />
                    <span className="text-xs font-medium text-text-quaternary">
                      {t('periodicInvoice.invoicesUnit')}
                    </span>
                  </div>
                  {problem('occurrences')}
                </div>
              ) : null}
            </div>
          </section>

          {/* TODO(backend): `autoIssue` and `notifyOnRun` are sent with the schedule; nothing acts on them yet. */}
          <section className="flex flex-col gap-4 rounded-sm bg-surface-card p-4">
            <SwitchRow
              label={t('periodicInvoice.sendAuto')}
              hint={t('periodicInvoice.sendAutoNote')}
              checked={form.autoIssue}
              disabled={locked}
              onChange={(autoIssue) => set({ autoIssue })}
            />
            <div className="h-px w-full bg-surface-background" />
            <SwitchRow
              label={t('periodicInvoice.notify')}
              hint={t('periodicInvoice.notifyNote')}
              checked={form.notifyOnRun}
              disabled={locked}
              onChange={(notifyOnRun) => set({ notifyOnRun })}
            />
            <p className="text-[11px] font-medium leading-[1.4] text-text-quaternary">
              {t('periodicInvoice.switchesPending')}
            </p>
          </section>
        </aside>
      </div>

      {/* Items: what every run sends, composed here under the line rules. */}
      <LineComposer
        lines={lines}
        onChange={changeLines}
        exclVat={exclVat}
        onExclVatChange={setExclVat}
        totals={totals}
        readOnly={locked}
        taxLabel={taxLabel}
        vatRate={taxRateOf(form.taxCategory)}
        classify={!isConsumer}
        problem={errors.lines ? t(errors.lines) : null}
        titleSlot={
          <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
            {t('periodicInvoice.sections.items')}
          </h2>
        }
        footer={
          <>
            <div className="ms-auto flex w-full max-w-[301px] flex-col gap-3.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-secondary">
                  {t('periodicInvoice.totals.excluding')}
                </span>
                <OmAmount
                  size="xs"
                  amount={amount(totals.taxable)}
                  amountClassName="text-base font-semibold text-text-secondary tabular-nums"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-secondary">
                  {t('periodicInvoice.totals.vat')}
                </span>
                <OmAmount
                  size="xs"
                  amount={amount(totals.vat)}
                  amountClassName="text-base font-semibold text-text-secondary tabular-nums"
                />
              </div>
              <div className="h-px w-full bg-surface-background" />
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-primary">
                  {t('periodicInvoice.totals.total')}
                </span>
                <OmAmount
                  size="sm"
                  amount={amount(total)}
                  amountClassName="text-xl font-semibold text-text-primary tabular-nums"
                />
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-sm bg-surface-background px-4 py-3">
              <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
              <p className="text-sm font-medium leading-[1.4] text-text-secondary">
                {t(
                  form.autoIssue
                    ? 'periodicInvoice.willIssueBefore'
                    : 'periodicInvoice.willRaiseBefore',
                )}{' '}
                <OmAmount
                  size="xs"
                  amount={amount(total)}
                  amountClassName="font-semibold text-text-primary"
                />{' '}
                {t(
                  form.autoIssue
                    ? 'periodicInvoice.willIssueAfter'
                    : 'periodicInvoice.willRaiseAfter',
                  {
                    every: everyText.charAt(0).toLowerCase() + everyText.slice(1),
                    customer: customerName ?? t('periodicInvoice.theCustomer'),
                  },
                )}
              </p>
            </div>
          </>
        }
      />

      {id ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_332px]">
          <Card
            title={t('periodicInvoice.runs')}
            action={
              runs.read.status === 'ready' ? (
                <p className="text-xs font-medium text-text-quaternary">
                  {t('periodicInvoice.draftedCount', { count: draftedCount(runRows) })}
                </p>
              ) : null
            }
          >
            {runs.read.status === 'loading' ? <LoadingNotice /> : null}
            {runs.read.status === 'failed' ? (
              <ApiReadFailure error={runs.read.error} retry={runs.retry} />
            ) : null}
            {runs.read.status === 'ready' && runRows.length === 0 ? (
              <p className="py-6 text-center text-sm font-medium text-text-quaternary">
                {t('periodicInvoice.noRuns')}
              </p>
            ) : null}
            {runRows.map((run) => {
              const pill =
                run.paymentState && run.paymentState !== 'NOT_APPLICABLE'
                  ? {
                      style: RUN_PILL[run.paymentState],
                      key: `periodicInvoice.payment.${run.paymentState}`,
                    }
                  : { style: RUN_PILL[run.outcome], key: `periodicInvoice.pill.${run.outcome}` }
              const runAmount =
                run.totalAmount ?? (run.outcome === 'DRAFTED' ? Number(amount(total)) : null)
              return (
                <div
                  key={`${run.runDate}-${run.createdAt}`}
                  className="flex flex-wrap items-center gap-3 rounded-sm border border-border-subtle px-3 py-3"
                >
                  <img src={invoiceTileIcon} alt="" className="size-9 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium leading-[1.2] text-text-primary">
                      {run.invoiceNumber ?? t(`periodicInvoice.outcome.${run.outcome}`)}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-[1.2] text-text-tertiary">
                      {t(
                        run.invoiceNumber
                          ? 'periodicInvoice.issuedMeta'
                          : 'periodicInvoice.runMeta',
                        {
                          date: formatDate(run.runDate, language),
                        },
                      )}
                      {run.deliveryState
                        ? ` · ${t(
                            [
                              `periodicInvoice.delivery.${run.deliveryState}`,
                              'periodicInvoice.delivery.other',
                            ],
                            { state: run.deliveryState },
                          )}`
                        : run.periodStart && run.periodEnd
                          ? ` · ${formatDate(run.periodStart, language)} to ${formatDate(run.periodEnd, language)}`
                          : ''}
                    </p>
                    {run.failureReason ? (
                      <p className="mt-1 text-xs font-medium text-danger-700">
                        {run.failureReason}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={[
                      'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-medium',
                      pill.style,
                    ].join(' ')}
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-current" />
                    {t(pill.key)}
                  </span>
                  {runAmount !== null ? (
                    <OmAmount
                      size="sm"
                      amount={formatAmount(runAmount, form.currency, language)}
                      amountClassName="text-xl font-semibold text-text-primary tabular-nums"
                    />
                  ) : null}
                  {run.draftInvoiceId ? (
                    <Link
                      to={`/invoices/${run.draftInvoiceId}`}
                      aria-label={t('periodicInvoice.openDraft')}
                      className="inline-flex size-8 items-center justify-center rounded-sm hover:bg-primary-25"
                    >
                      <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
                    </Link>
                  ) : null}
                </div>
              )
            })}
            {schedule?.active && schedule.remainingOccurrences !== 0 ? (
              <div className="flex items-start gap-2 rounded-sm bg-surface-background px-4 py-3">
                <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <p className="text-sm font-medium leading-[1.4] text-text-secondary">
                  {t('periodicInvoice.generatedNextBefore')}{' '}
                  <span className="font-semibold text-text-primary">
                    {formatDate(schedule.nextRunDate, language)}
                  </span>
                  {t('periodicInvoice.generatedNextAfter')}
                </p>
              </div>
            ) : null}
          </Card>

          <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t('periodicInvoice.sections.upcoming')}
            </h2>
            <div className="h-px w-full bg-surface-background" />
            {upcoming.length === 0 ? (
              <p className="py-4 text-center text-sm font-medium text-text-quaternary">
                {t(schedule?.active ? 'periodicInvoice.noUpcoming' : 'periodicList.status.paused')}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {upcoming.map((date, index) => (
                  <li key={date} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                      <span
                        className={[
                          'size-2 shrink-0 rounded-full',
                          index === 0 ? 'bg-primary-700' : 'bg-border-default',
                        ].join(' ')}
                      />
                      {formatDate(date, language)}
                    </span>
                    <OmAmount
                      size="xs"
                      amount={amount(total)}
                      amountClassName="text-sm font-semibold text-text-secondary tabular-nums"
                    />
                  </li>
                ))}
              </ul>
            )}
            <div className="h-px w-full bg-surface-background" />
            <div className="grid grid-cols-3 gap-2">
              <Stat
                label={t('periodicInvoice.upcoming.started')}
                value={started ? formatDate(started, language) : '—'}
              />
              <Stat
                label={t('periodicInvoice.upcoming.issued')}
                value={t('periodicInvoice.upcoming.invoices', {
                  count: schedule?.runCount ?? draftedCount(runRows),
                })}
              />
              <Stat
                label={t('periodicInvoice.upcoming.each')}
                value={
                  <OmAmount
                    size="xs"
                    amount={amount(total)}
                    amountClassName="text-base font-semibold text-text-primary tabular-nums"
                  />
                }
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function Card({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
        {action}
      </div>
      <div className="h-px w-full bg-surface-background" />
      {children}
    </section>
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

/** The design's 50px text field. */
function TextField({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div>
      <FieldLabel label={label} />
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className={FIELD}
      />
    </div>
  )
}

function NoteField({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium leading-[1.2] text-text-primary">{label}</span>
        <span className="text-xs font-medium text-text-quaternary">{hint}</span>
      </div>
      <textarea
        value={value}
        disabled={disabled}
        aria-label={label}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[85px] w-full resize-y rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium leading-[1.4] text-text-primary outline-none placeholder:text-text-placeholder focus:border-primary-500 disabled:border-border-subtle"
      />
    </div>
  )
}

function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-[1.2] text-text-primary">{label}</p>
        <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-text-quaternary">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-text-primary">{value}</p>
    </div>
  )
}
