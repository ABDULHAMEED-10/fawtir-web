import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Combobox, DateField, RowsView, type SelectOption } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
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
  type RecurrenceInterval,
} from '../../api/invoices/periodic'
import { customerListPath, loadCustomerPage, type CustomerDto } from '../../api/customers/customers'
import { invoiceListPath, loadInvoicePage, type InvoiceRowDto } from '../../api/invoices/list'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import {
  PERIODIC_INTERVALS,
  PERIODIC_REFUSALS,
  blankPeriodicForm,
  draftedCount,
  formOfSchedule,
  periodicProblems,
  toCreateRequest,
  toUpdateRequest,
  type PeriodicField,
  type PeriodicForm,
} from '../../lib/periodicInvoice'
import chevronIcon from '../../assets/invoices/chevron.svg'

const muscatToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

const FIELD = 'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * One periodic schedule (I-13): reading it, setting one up, and editing it.
 *
 * A schedule carries no lines of its own — it names an invoice whose content each run copies — so
 * setting one up is choosing a customer and one of their invoices, not composing a document. The
 * customer and the template are fixed afterwards, as the API has them.
 */
export function PeriodicInvoicePage({ mode }: { mode: 'view' | 'create' | 'edit' }) {
  const { id } = useParams()
  return (
    <AppShell>
      {mode === 'view' && id ? <ScheduleView key={id} id={id} /> : <ScheduleForm key={id ?? 'new'} id={mode === 'edit' ? (id ?? null) : null} />}
    </AppShell>
  )
}

function Breadcrumb({ title }: { title: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link to="/income/periodic" className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700">
        {t('periodicList.title')}
      </Link>
      <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
      <span className="text-2xl font-medium leading-[1.2] text-text-primary">{title}</span>
    </div>
  )
}

function ScheduleView({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'invoice.draft')
  const [notice, setNotice] = useState<{ key: string } | { body: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const read = useApiRead<PeriodicScheduleDto>(periodicSchedulePath(id), () => loadPeriodicSchedule(id))
  const runsPath = periodicRunsPath(id)
  const runs = useApiRead<PeriodicRunDto[]>(runsPath, () => loadPeriodicRuns(runsPath))

  if (read.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {read.read.status === 'loading' ? <LoadingNotice /> : <ApiReadFailure error={read.read.error} retry={read.retry} />}
      </div>
    )
  }

  const schedule = read.read.data
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const saved = await setPeriodicActive(id, !schedule.active)
      read.retry()
      setNotice(
        schedule.active
          ? { key: 'periodicList.done.paused' }
          : { body: t('periodicList.done.resumed', { date: formatDate(saved.nextRunDate, language) }) },
      )
    } catch (error) {
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setNotice({ body: message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <Breadcrumb title={t('periodicInvoice.title')} />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('periodicInvoice.title')}</h1>
        <span
          className={[
            'inline-flex h-[31px] items-center rounded-full border px-3 text-sm font-semibold',
            schedule.active ? 'border-success-700 text-success-700' : 'border-border-subtle text-text-tertiary',
          ].join(' ')}
        >
          {t(schedule.active ? 'periodicList.state.active' : 'periodicList.state.paused')}
        </span>
        {canManage ? (
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <Link
              to={`/income/periodic/${id}/edit`}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
            >
              {t('periodicInvoice.edit')}
            </Link>
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={busy}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
            >
              {t(schedule.active ? 'periodicList.menu.pause' : 'periodicList.menu.resume')}
            </button>
          </div>
        ) : null}
      </div>

      {notice ? <Notice body={'key' in notice ? t(notice.key) : notice.body} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('periodicInvoice.whatItDoes')}</h2>
        <p className="mt-1 text-sm font-medium leading-[1.5] text-text-quaternary">{t('periodicInvoice.whatItDoesNote')}</p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={t('periodicInvoice.fields.customer')} value={<Link to={`/customers/${schedule.customerId}`} className="font-semibold text-primary-700 hover:underline">{t('periodicInvoice.openCustomer')}</Link>} />
          <Fact
            label={t('periodicInvoice.fields.template')}
            value={
              schedule.templateInvoiceId ? (
                <Link to={`/invoices/${schedule.templateInvoiceId}`} className="font-semibold text-primary-700 hover:underline">
                  {t('periodicInvoice.openTemplate')}
                </Link>
              ) : (
                <span className="text-text-quaternary">{t('periodicInvoice.noTemplate')}</span>
              )
            }
          />
          <Fact label={t('periodicInvoice.fields.howOften')} value={t(`periodicList.interval.${schedule.interval}`)} />
          <Fact label={t('periodicInvoice.fields.nextDraft')} value={day(schedule.nextRunDate)} />
          <Fact label={t('periodicInvoice.fields.endsOn')} value={day(schedule.endDate)} />
          <Fact
            label={t('periodicInvoice.fields.left')}
            value={schedule.remainingOccurrences === null ? t('periodicList.noLimit') : t('periodicList.leftCount', { count: schedule.remainingOccurrences })}
          />
          <Fact label={t('periodicInvoice.fields.subtype')} value={t(`periodicList.subtype.${schedule.transactionSubtype}`)} note={t('periodicInvoice.fields.subtypeNote')} />
        </div>
      </section>

      <section className="rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-background px-5 py-4">
          <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('periodicInvoice.runs')}</h2>
          {runs.read.status === 'ready' ? (
            <p className="text-xs font-medium text-text-quaternary">{t('periodicInvoice.draftedCount', { count: draftedCount(runs.read.data) })}</p>
          ) : null}
        </div>
        {runs.read.status === 'loading' ? <LoadingNotice /> : null}
        {runs.read.status === 'failed' ? <ApiReadFailure error={runs.read.error} retry={runs.retry} /> : null}
        {runs.read.status === 'ready' ? (
          runs.read.data.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm font-medium text-text-quaternary">{t('periodicInvoice.noRuns')}</p>
          ) : (
            <RowsView>
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                    {(['ran', 'period', 'outcome', 'draft'] as const).map((key) => (
                      <th key={key} className="px-5 py-3 text-start font-semibold">
                        {t(`periodicInvoice.runCol.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.read.data.map((run) => (
                    <tr key={`${run.runDate}-${run.createdAt}`} className="border-b border-surface-background last:border-0">
                      <td className="px-5 py-4 align-top text-sm font-medium text-text-secondary">{day(run.runDate)}</td>
                      <td className="px-5 py-4 align-top text-sm font-medium text-text-tertiary">
                        {run.periodStart && run.periodEnd ? `${day(run.periodStart)} – ${day(run.periodEnd)}` : '—'}
                      </td>
                      <td className="px-5 py-4 align-top text-sm font-medium text-text-secondary">
                        {t(`periodicInvoice.outcome.${run.outcome}`)}
                        {run.failureReason ? <span className="mt-1 block text-xs font-medium text-warning-700">{run.failureReason}</span> : null}
                      </td>
                      <td className="px-5 py-4 align-top text-sm font-medium">
                        {run.draftInvoiceId ? (
                          <Link to={`/invoices/${run.draftInvoiceId}`} className="font-semibold text-primary-700 hover:underline">
                            {t('periodicInvoice.openDraft')}
                          </Link>
                        ) : (
                          <span className="text-text-quaternary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </RowsView>
          )
        ) : null}
      </section>

      <p className="text-xs font-medium leading-[1.5] text-text-quaternary">{t('periodicList.sweepNote')}</p>
    </div>
  )
}

function ScheduleForm({ id }: { id: string | null }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const navigate = useNavigate()
  const session = useSession()
  const today = muscatToday()
  const [form, setForm] = useState<PeriodicForm>(() => blankPeriodicForm(today))
  const [seeded, setSeeded] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<PeriodicField, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const existing = useApiRead<PeriodicScheduleDto>(id ? periodicSchedulePath(id) : null, id ? () => loadPeriodicSchedule(id) : undefined)
  const customersPath = customerListPath({ type: null, search: '', sort: 'NAME_ASC', page: 0, size: 200 })
  const customers = useApiRead<Page<CustomerDto>>(customersPath, () => loadCustomerPage(customersPath))
  // The template is one of this customer's own invoices: its lines, currency and terms are what
  // every run copies, so there is nothing to choose until a customer is.
  const invoicesPath = form.customerId
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
  const invoices = useApiRead<Page<InvoiceRowDto>>(invoicesPath, invoicesPath ? () => loadInvoicePage(invoicesPath) : undefined)

  if (!can(session, 'invoice.draft')) {
    return (
      <div className="mx-auto w-full max-w-[860px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  if (id && existing.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4">
        {existing.read.status === 'loading' ? <LoadingNotice /> : <ApiReadFailure error={existing.read.error} retry={existing.retry} />}
      </div>
    )
  }

  if (id && existing.read.status === 'ready' && !seeded) {
    setSeeded(true)
    setForm(formOfSchedule(existing.read.data, '', ''))
  }

  const set = (changes: Partial<PeriodicForm>) => {
    setForm((current) => ({ ...current, ...changes }))
    setErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(changes) as PeriodicField[]) delete next[key]
      return next
    })
  }

  const customerOptions: SelectOption[] = (customers.read.status === 'ready' ? customers.read.data.items : []).map((customer) => ({
    value: customer.id,
    label: customer.displayName,
  }))

  const invoiceOptions: SelectOption[] = (invoices.read.status === 'ready' ? invoices.read.data.items : []).map((invoice) => ({
    value: invoice.id,
    label: invoice.invoiceNumber ?? t('periodicInvoice.draftInvoice'),
    hint: invoice.totals ? formatAmount(invoice.totals.totalAmount, invoice.currency, language) : undefined,
  }))

  const save = async () => {
    const problems = periodicProblems(form, today, Boolean(id))
    setErrors(problems)
    setFailure(null)
    if (Object.keys(problems).length > 0 || busy) return
    setBusy(true)
    try {
      const saved = id ? await updatePeriodicSchedule(id, toUpdateRequest(form)) : await createPeriodicSchedule(toCreateRequest(form))
      navigate(`/income/periodic/${saved.id}`, { replace: true })
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null
      if (code && PERIODIC_REFUSALS[code]) {
        setFailure(t(PERIODIC_REFUSALS[code]))
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setFailure(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
      }
    } finally {
      setBusy(false)
    }
  }

  const field = (name: PeriodicField, label: string, input: React.ReactNode, note?: string) => (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-text-secondary">{label}</span>
        {input}
      </label>
      {note ? <p className="mt-1 text-xs font-medium text-text-quaternary">{note}</p> : null}
      {errors[name] ? (
        <p role="alert" className="mt-1 text-xs font-medium text-danger-700">
          {t(errors[name]!)}
        </p>
      ) : null}
    </div>
  )

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 pb-10">
      <Breadcrumb title={t(id ? 'periodicInvoice.editTitle' : 'periodicInvoice.newTitle')} />
      <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t(id ? 'periodicInvoice.editTitle' : 'periodicInvoice.newTitle')}</h1>

      {failure ? <Notice body={failure} /> : null}

      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('periodicInvoice.whatToSend')}</h2>
        <p className="mt-1 text-sm font-medium leading-[1.5] text-text-quaternary">{t('periodicInvoice.whatToSendNote')}</p>
        <div className="mt-4 flex flex-col gap-4">
          {id ? (
            <p className="rounded-sm border border-border-subtle bg-surface-background/50 p-3 text-sm font-medium text-text-tertiary">
              {t('periodicInvoice.fixedAfterCreation')}
            </p>
          ) : (
            <>
              {field(
                'customerId',
                t('periodicInvoice.fields.customer'),
                <Combobox
                  options={customerOptions}
                  value={form.customerId}
                  onChange={(value) => set({ customerId: value, templateInvoiceId: '' })}
                  ariaLabel={t('periodicInvoice.fields.customer')}
                  placeholder={t('periodicInvoice.chooseCustomer')}
                  searchPlaceholder={t('periodicInvoice.searchCustomers')}
                />,
              )}
              {field(
                'templateInvoiceId',
                t('periodicInvoice.fields.template'),
                <Combobox
                  options={invoiceOptions}
                  value={form.templateInvoiceId}
                  onChange={(value) => set({ templateInvoiceId: value })}
                  ariaLabel={t('periodicInvoice.fields.template')}
                  placeholder={t(form.customerId ? 'periodicInvoice.chooseTemplate' : 'periodicInvoice.chooseCustomerFirst')}
                  searchPlaceholder={t('periodicInvoice.searchInvoices')}
                  emptyText={t(form.customerId ? 'periodicInvoice.noInvoices' : 'periodicInvoice.chooseCustomerFirst')}
                />,
                t('periodicInvoice.templateNote'),
              )}
            </>
          )}
        </div>
      </section>

      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('periodicInvoice.whenToSend')}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field(
            'interval',
            t('periodicInvoice.fields.howOften'),
            <select value={form.interval} onChange={(event) => set({ interval: event.target.value as RecurrenceInterval })} className={FIELD}>
              {PERIODIC_INTERVALS.map((interval) => (
                <option key={interval} value={interval}>
                  {t(`periodicList.interval.${interval}`)}
                </option>
              ))}
            </select>,
            t('periodicInvoice.fields.subtypeNote'),
          )}
          {field(
            'firstRunDate',
            t(id ? 'periodicInvoice.fields.nextDraft' : 'periodicInvoice.fields.firstDraft'),
            <DateField value={form.firstRunDate} min={today} ariaLabel={t('periodicInvoice.fields.firstDraft')} onChange={(firstRunDate) => set({ firstRunDate })} />,
          )}
          {field(
            'endDate',
            t('periodicInvoice.fields.endsOn'),
            <DateField value={form.endDate} min={form.firstRunDate || today} ariaLabel={t('periodicInvoice.fields.endsOn')} onChange={(endDate) => set({ endDate })} />,
            t('periodicInvoice.fields.endsOnNote'),
          )}
          {field(
            'occurrences',
            t('periodicInvoice.fields.left'),
            <input value={form.occurrences} onChange={(event) => set({ occurrences: event.target.value })} inputMode="numeric" className={FIELD} placeholder={t('periodicInvoice.fields.noLimit')} />,
          )}
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <Link
          to={id ? `/income/periodic/${id}` : '/income/periodic'}
          className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary"
        >
          {t('common.cancel')}
        </Link>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? t('periodicInvoice.saving') : t(id ? 'periodicInvoice.save' : 'periodicInvoice.start')}
        </button>
      </div>
    </div>
  )
}

function Fact({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-text-primary">{value}</p>
      {note ? <p className="mt-1 text-xs font-medium text-text-quaternary">{note}</p> : null}
    </div>
  )
}
