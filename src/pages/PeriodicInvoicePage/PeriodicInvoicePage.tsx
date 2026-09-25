import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { invoiceListPath, loadInvoicePage, type InvoiceRowDto } from '../../api/invoices/list'
import {
  invoicePath,
  loadInvoice,
  loadInternalNote,
  type InvoiceDetailDto,
} from '../../api/invoices/detail'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import { TAX_CATEGORIES } from '../../lib/catalogues'
import { formatAtScale } from '../../lib/invoiceMath'
import { can, useSession } from '../../lib/session/session'
import {
  PERIODIC_INTERVALS,
  PERIODIC_REFUSALS,
  blankPeriodicForm,
  cadenceNote,
  daysBetween,
  draftedCount,
  endingOf,
  formOfSchedule,
  periodicProblems,
  scheduleStatus,
  toCreateRequest,
  toUpdateRequest,
  upcomingRuns,
  type PeriodicEnding,
  type PeriodicField,
  type PeriodicForm,
  type PeriodicStatus,
} from '../../lib/periodicInvoice'
import { LineComposer, kindOfUnit, type ComposerLine } from '../NewSelfBillPage/LineComposer'
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

const RUN_PILL: Record<PeriodicRunDto['outcome'], string> = {
  DRAFTED: 'bg-pending-100 text-pending-700',
  FAILED: 'bg-danger-100 text-danger-700',
  SKIPPED: 'bg-neutral-25 text-neutral-700',
}

const ENDINGS: PeriodicEnding[] = ['never', 'date', 'count']

/**
 * One periodic schedule (I-13, Figma 154:164555): reading it, setting one up and editing it are
 * the same screen, as the design draws them — the document on the left, the schedule on the right.
 *
 * A schedule carries no lines of its own — it names an invoice whose content each run copies — so
 * the document half is read from that invoice and shown as the design shows it; what can be
 * changed here is the schedule half, which is all the API's `PUT` takes. The customer and the
 * template are fixed once a schedule exists.
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
  const session = useSession()
  const canManage = can(session, 'invoice.draft')
  const today = muscatToday()
  const [form, setForm] = useState<PeriodicForm>(() => blankPeriodicForm(today))
  const [seeded, setSeeded] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<PeriodicField, string>>>({})
  const [notice, setNotice] = useState<{ key: string } | { body: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [exclVat, setExclVat] = useState(true)
  // TODO(backend): neither switch has a field behind it — runs raise drafts and never issue or
  // send, and nothing e-mails a confirmation. Drawn as designed, switched off, and not offered.
  const [sendAutomatically] = useState(false)
  const [notifyOnRun] = useState(false)

  const existing = useApiRead<PeriodicScheduleDto>(
    id ? periodicSchedulePath(id) : null,
    id ? () => loadPeriodicSchedule(id) : undefined,
  )
  const runsPath = id ? periodicRunsPath(id) : null
  const runs = useApiRead<PeriodicRunDto[]>(
    runsPath,
    runsPath ? () => loadPeriodicRuns(runsPath) : undefined,
  )
  const schedule = existing.read.status === 'ready' ? existing.read.data : null

  if (schedule && !seeded) {
    setSeeded(true)
    setForm(formOfSchedule(schedule, '', ''))
  }

  // The customer's name — which is how anyone recognises the schedule — is read once the id is known.
  const customerId = schedule?.customerId ?? (id ? null : form.customerId || null)
  const customer = useApiRead<CustomerDto>(
    customerId ? `${CUSTOMERS_PATH}/${customerId}` : null,
    () => loadCustomer(customerId ?? ''),
  )
  const customerName = customer.read.status === 'ready' ? customer.read.data.displayName : null
  const customersPath = id
    ? null
    : customerListPath({
        type: null,
        search: '',
        sort: 'NAME_ASC',
        page: 0,
        size: CUSTOMER_PAGE_SIZE,
      })
  const customers = useApiRead<Page<CustomerDto>>(
    customersPath,
    customersPath ? () => loadCustomerPage(customersPath) : undefined,
  )
  // The template is one of this customer's own invoices: its lines, currency and terms are what
  // every run copies, so there is nothing to choose until a customer is.
  const invoicesPath =
    !id && form.customerId
      ? invoiceListPath({
          customerId: form.customerId,
          state: 'DRAFT,ISSUED',
          payment: null,
          type: 'INVOICE',
          from: null,
          to: null,
          search: '',
          sort: 'ISSUED_NEWEST',
          page: 0,
          size: 50,
        })
      : null
  const invoices = useApiRead<Page<InvoiceRowDto>>(
    invoicesPath,
    invoicesPath ? () => loadInvoicePage(invoicesPath) : undefined,
  )
  const templateId = schedule?.templateInvoiceId ?? form.templateInvoiceId ?? ''
  const template = useApiRead<InvoiceDetailDto>(templateId ? invoicePath(templateId) : null, () =>
    loadInvoice(templateId),
  )
  const templateDoc = template.read.status === 'ready' ? template.read.data : null
  const internalNote = useApiRead<{ internalNote: string | null }>(
    templateId ? `${invoicePath(templateId)}/internal-note` : null,
    () => loadInternalNote(templateId),
  )

  const lines = useMemo<ComposerLine[]>(
    () =>
      (templateDoc?.lines ?? []).map((line) => ({
        id: String(line.lineNumber),
        kind: kindOfUnit(line.unitCode),
        description: line.description,
        unitPrice: line.unitPrice.toFixed(3),
        vatRate: String(line.taxRate ?? 0),
        quantity: String(line.quantity),
        unit: line.unitCode,
        discountType: line.discountType,
        discountValue: String(line.discountValue),
      })),
    [templateDoc],
  )
  const totals = useLineTotals(lines, exclVat)
  const total = totals.total
  const amount = (value: bigint) => formatAtScale(value)
  const taxLabel =
    TAX_CATEGORIES.find((category) => category.code === templateDoc?.lines[0]?.taxCategoryCode)
      ?.label ?? t('periodicInvoice.taxByLine')

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
    const problems = periodicProblems(form, today, Boolean(id))
    setErrors(problems)
    setNotice(null)
    if (Object.keys(problems).length > 0 || busy) return
    setBusy(true)
    try {
      if (id) {
        await updatePeriodicSchedule(id, toUpdateRequest(form))
        existing.retry()
        setNotice({ key: 'periodicInvoice.done.saved' })
      } else {
        const saved = await createPeriodicSchedule(toCreateRequest(form))
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
      setSeeded(false)
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

  const status = schedule ? scheduleStatus(schedule) : null
  const subject = templateDoc?.details?.subject?.trim()
  const title = id
    ? [subject, customerName].filter(Boolean).join(', ') || t('periodicInvoice.title')
    : t('periodicInvoice.newTitle')
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
  const nextRun = schedule?.nextRunDate ?? form.firstRunDate
  const daysToNext = nextRun ? daysBetween(today, nextRun) : null
  const ending = endingOf(form)
  // Derived from the cadence (IBR-036-OM), as the server derives it: shown, never chosen.
  const subtype =
    form.interval === 'WEEKLY' || form.interval === 'MONTHLY' ? 'SUMMARY' : 'CONTINUOUS_SUPPLY'
  const upcoming = schedule
    ? upcomingRuns(
        {
          ...schedule,
          ...toUpdateRequest(form),
          remainingOccurrences: form.occurrences.trim() ? Number(form.occurrences) : null,
        },
        UPCOMING_COUNT,
      )
    : []
  const runRows = runs.read.status === 'ready' ? runs.read.data : []
  const started =
    runRows.length > 0
      ? runRows.reduce(
          (oldest, run) => (run.runDate < oldest ? run.runDate : oldest),
          runRows[0].runDate,
        )
      : null

  const customerOptions: SelectOption[] = (
    customers.read.status === 'ready' ? customers.read.data.items : []
  ).map((row) => ({ value: row.id, label: row.displayName }))
  const invoiceOptions: SelectOption[] = (
    invoices.read.status === 'ready' ? invoices.read.data.items : []
  ).map((invoice) => ({
    value: invoice.id,
    label: invoice.invoiceNumber ?? t('periodicInvoice.draftInvoice'),
    hint:
      [
        invoice.details?.subject,
        invoice.totals
          ? formatAmount(invoice.totals.totalAmount, invoice.currency, language)
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
  }))

  const headerMenu: ActionMenuItem[] = [
    ...(templateId
      ? [
          {
            id: 'template',
            labelKey: 'periodicInvoice.openTemplate',
            icon: invoiceActionIcon,
            to: `/invoices/${templateId}`,
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

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {/* Header — breadcrumb, name and status, the cadence in one line, and the actions. */}
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
          {/* Invoice details — the document half, read from the invoice each run copies. */}
          <Card title={t('periodicInvoice.sections.details')}>
            {id ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-2 py-3.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <img src={customerLogo} alt="" className="size-12 rounded-sm object-cover" />
                    <div className="min-w-0">
                      <Link
                        to={`/customers/${schedule?.customerId}`}
                        className="block truncate text-base font-medium leading-[1.2] text-text-primary hover:text-primary-700 hover:underline"
                      >
                        {customerName ?? t('periodicInvoice.openCustomer')}
                      </Link>
                      <p className="truncate text-xs font-medium leading-[1.2] text-text-quaternary">
                        {customer.read.status === 'ready' &&
                        customer.read.data.profile?.details?.vatRegistrationNumber
                          ? t('periodicInvoice.vat', {
                              number: customer.read.data.profile?.details?.vatRegistrationNumber,
                            })
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {customer.read.status === 'ready' &&
                    customer.read.data.peppolDelivery === 'ACTIVE' ? (
                      <span className="inline-flex h-7 items-center gap-1 rounded-full border border-primary-75 bg-white py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                        <img src={peppolIcon} alt="" className="size-4" />
                        {t('periodicInvoice.onPeppol')}
                      </span>
                    ) : null}
                    {/* The customer is fixed once a schedule exists, so the design's "Change" cannot act. */}
                    <button
                      type="button"
                      disabled
                      title={t('periodicInvoice.fixedAfterCreation')}
                      className="inline-flex h-[38px] items-center gap-0.5 rounded-sm border border-border-subtle bg-white py-1.5 ps-3.5 pe-2.5 text-sm font-semibold text-primary-800 disabled:opacity-50"
                    >
                      {t('periodicInvoice.change')}
                      <img src={chevronIcon} alt="" className="size-5 rotate-90" />
                    </button>
                  </div>
                </div>
                <p className="text-xs font-medium leading-[1.4] text-text-quaternary">
                  {t('periodicInvoice.fixedAfterCreation')}{' '}
                  {templateId ? (
                    <Link
                      to={`/invoices/${templateId}`}
                      className="font-semibold text-primary-700 hover:underline"
                    >
                      {t('periodicInvoice.openTemplate')}
                    </Link>
                  ) : null}
                </p>
              </>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel label={t('periodicInvoice.fields.customer')} required />
                  <Combobox
                    options={customerOptions}
                    value={form.customerId}
                    onChange={(value) => set({ customerId: value, templateInvoiceId: '' })}
                    ariaLabel={t('periodicInvoice.fields.customer')}
                    placeholder={t('periodicInvoice.chooseCustomer')}
                    searchPlaceholder={t('periodicInvoice.searchCustomers')}
                  />
                  {problem('customerId')}
                </div>
                <div>
                  <FieldLabel
                    label={t('periodicInvoice.fields.template')}
                    required
                    hint={t('periodicInvoice.templateNote')}
                  />
                  <Combobox
                    options={invoiceOptions}
                    value={form.templateInvoiceId}
                    onChange={(value) => set({ templateInvoiceId: value })}
                    ariaLabel={t('periodicInvoice.fields.template')}
                    placeholder={t(
                      form.customerId
                        ? 'periodicInvoice.chooseTemplate'
                        : 'periodicInvoice.chooseCustomerFirst',
                    )}
                    searchPlaceholder={t('periodicInvoice.searchInvoices')}
                    emptyText={t(
                      form.customerId
                        ? 'periodicInvoice.noInvoices'
                        : 'periodicInvoice.chooseCustomerFirst',
                    )}
                  />
                  {problem('templateInvoiceId')}
                </div>
              </div>
            )}

            <ReadField
              label={t('periodicInvoice.fields.subject')}
              value={templateDoc?.details?.subject}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <ReadField
                label={t('periodicInvoice.fields.po')}
                value={templateDoc?.details?.purchaseOrderReference}
              />
              <ReadField
                label={t('periodicInvoice.fields.paymentTerms')}
                value={templateDoc?.details?.paymentTerms?.label}
                select
              />
              <ReadField
                label={t('periodicInvoice.fields.currency')}
                value={
                  templateDoc
                    ? t(
                        [
                          `periodicInvoice.currency.${templateDoc.currency}`,
                          'periodicInvoice.currency.other',
                        ],
                        { code: templateDoc.currency },
                      )
                    : null
                }
                required
                select
              />
              <ReadField
                label={t('periodicInvoice.fields.taxCategory')}
                value={templateDoc ? taxLabel : null}
                required
                select
              />
              {/* TODO(backend): the invoice carries a branch id and no name. */}
              <ReadField
                label={t('periodicInvoice.fields.branch')}
                value={templateDoc?.branchId}
                select
              />
            </div>
          </Card>

          <Card title={t('periodicInvoice.sections.notes')}>
            <div className="grid gap-4 md:grid-cols-2">
              <NoteField
                label={t('periodicInvoice.fields.noteCustomer')}
                hint={t('periodicInvoice.fields.onInvoice')}
                value={templateDoc?.details?.customerVisibleNote}
              />
              <NoteField
                label={t('periodicInvoice.fields.internalNote')}
                hint={t('periodicInvoice.fields.private')}
                value={
                  internalNote.read.status === 'ready' ? internalNote.read.data.internalNote : null
                }
              />
            </div>
          </Card>
        </div>

        {/* Schedule — the half the API lets this screen change. */}
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
                      disabled={!canManage}
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

            <ReadField label={t('periodicInvoice.repeatsOn')} value={everyText} select />

            <div>
              <FieldLabel
                label={t(id ? 'periodicInvoice.fields.nextDraft' : 'periodicInvoice.starts')}
                required
              />
              <DateField
                value={form.firstRunDate}
                min={today}
                disabled={!canManage}
                ariaLabel={t(id ? 'periodicInvoice.fields.nextDraft' : 'periodicInvoice.starts')}
                onChange={(firstRunDate) => set({ firstRunDate })}
              />
              {problem('firstRunDate')}
            </div>

            <div>
              <FieldLabel label={t('periodicInvoice.ends')} />
              <Select
                value={ending}
                disabled={!canManage}
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
                    disabled={!canManage}
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
                      disabled={!canManage}
                      onChange={(event) => set({ occurrences: event.target.value })}
                      inputMode="numeric"
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

          <section className="flex flex-col gap-4 rounded-sm bg-surface-card p-4">
            <SwitchRow
              label={t('periodicInvoice.sendAuto')}
              hint={t('periodicInvoice.sendAutoNote')}
              checked={sendAutomatically}
            />
            <div className="h-px w-full bg-surface-background" />
            <SwitchRow
              label={t('periodicInvoice.notify')}
              hint={t('periodicInvoice.notifyNote')}
              checked={notifyOnRun}
            />
          </section>
        </aside>
      </div>

      {/* Items — copied from the template on every run, so shown as the design draws them and not edited here. */}
      {templateDoc ? (
        <LineComposer
          lines={lines}
          onChange={() => undefined}
          exclVat={exclVat}
          onExclVatChange={setExclVat}
          totals={totals}
          readOnly
          taxLabel={taxLabel}
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
                  {t('periodicInvoice.willRaiseBefore', { every: everyText })}{' '}
                  <OmAmount
                    size="xs"
                    amount={amount(total)}
                    amountClassName="font-semibold text-text-primary"
                  />{' '}
                  {t('periodicInvoice.willRaiseAfter', {
                    every: everyText.charAt(0).toLowerCase() + everyText.slice(1),
                    customer: customerName ?? t('periodicInvoice.theCustomer'),
                  })}
                  {templateDoc.invoiceNumber
                    ? ` ${t('periodicInvoice.linesFrom', { number: templateDoc.invoiceNumber })}`
                    : ''}
                </p>
              </div>
            </>
          }
        />
      ) : (
        <section className="rounded-sm bg-surface-card p-4">
          <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
            {t('periodicInvoice.sections.items')}
          </h2>
          <div className="my-3 h-px bg-surface-background" />
          {template.read.status === 'loading' ? (
            <LoadingNotice />
          ) : template.read.status === 'failed' ? (
            <ApiReadFailure error={template.read.error} retry={template.retry} />
          ) : (
            <p className="py-6 text-center text-sm font-medium text-text-quaternary">
              {t(id ? 'periodicInvoice.noTemplate' : 'periodicInvoice.chooseTemplateForLines')}
            </p>
          )}
        </section>
      )}

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
            {runRows.map((run) => (
              <div
                key={`${run.runDate}-${run.createdAt}`}
                className="flex flex-wrap items-center gap-3 rounded-sm border border-border-subtle px-3 py-3"
              >
                <img src={invoiceTileIcon} alt="" className="size-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium leading-[1.2] text-text-primary">
                    {t(`periodicInvoice.outcome.${run.outcome}`)}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-[1.2] text-text-tertiary">
                    {t('periodicInvoice.runMeta', { date: formatDate(run.runDate, language) })}
                    {run.periodStart && run.periodEnd
                      ? ` · ${formatDate(run.periodStart, language)} – ${formatDate(run.periodEnd, language)}`
                      : ''}
                  </p>
                  {run.failureReason ? (
                    <p className="mt-1 text-xs font-medium text-danger-700">{run.failureReason}</p>
                  ) : null}
                </div>
                <span
                  className={[
                    'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-medium',
                    RUN_PILL[run.outcome],
                  ].join(' ')}
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-current" />
                  {t(`periodicInvoice.pill.${run.outcome}`)}
                </span>
                {run.outcome === 'DRAFTED' && templateDoc ? (
                  <OmAmount
                    size="sm"
                    amount={amount(total)}
                    amountClassName="text-xl font-semibold text-text-primary tabular-nums"
                  />
                ) : null}
                {run.draftInvoiceId ? (
                  <Link
                    to={`/invoices/${run.draftInvoiceId}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline"
                  >
                    {t('periodicInvoice.openDraft')}
                    <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
                  </Link>
                ) : null}
              </div>
            ))}
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
            <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('periodicList.sweepNote')}
            </p>
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
                    {templateDoc ? (
                      <OmAmount
                        size="xs"
                        amount={amount(total)}
                        amountClassName="text-sm font-semibold text-text-secondary tabular-nums"
                      />
                    ) : null}
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
                value={t('periodicInvoice.upcoming.invoices', { count: draftedCount(runRows) })}
              />
              <Stat
                label={t('periodicInvoice.upcoming.each')}
                value={
                  templateDoc ? (
                    <OmAmount
                      size="xs"
                      amount={amount(total)}
                      amountClassName="text-base font-semibold text-text-primary tabular-nums"
                    />
                  ) : (
                    '—'
                  )
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

/** The design's 50px field, holding a value that lives on the copied invoice rather than here. */
function ReadField({
  label,
  value,
  required,
  select,
}: {
  label: string
  value: string | null | undefined
  required?: boolean
  select?: boolean
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <div className="flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4">
        <span
          className={[
            'min-w-0 truncate text-sm font-medium',
            value ? 'text-text-secondary' : 'text-text-muted',
          ].join(' ')}
        >
          {value || '—'}
        </span>
        {select ? (
          <img src={chevronIcon} alt="" className="size-5 shrink-0 rotate-90 opacity-40" />
        ) : null}
      </div>
    </div>
  )
}

function NoteField({
  label,
  hint,
  value,
}: {
  label: string
  hint: string
  value: string | null | undefined
}) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium leading-[1.2] text-text-primary">{label}</span>
        <span className="text-xs font-medium text-text-quaternary">{hint}</span>
      </div>
      <div
        className={[
          'min-h-[85px] rounded-sm border border-border-subtle bg-surface-tab-bar p-4 text-sm font-medium',
          value ? 'text-text-primary' : 'text-text-muted',
        ].join(' ')}
      >
        {value || '—'}
      </div>
    </div>
  )
}

function SwitchRow({ label, hint, checked }: { label: string; hint: string; checked: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-[1.2] text-text-primary">{label}</p>
        <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">{hint}</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.6px] text-pending-700">
          {t('periodicInvoice.notAvailable')}
        </p>
      </div>
      <Switch checked={checked} onChange={() => undefined} label={label} disabled />
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
