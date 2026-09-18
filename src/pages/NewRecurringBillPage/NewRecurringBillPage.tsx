import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField } from '../../components/ui'
import { SupplierPicker } from '../../components/bills'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api'
import {
  createRecurringBill,
  loadRecurringBill,
  recurringBillPath,
  updateRecurringBill,
  type RecurringBillDto,
} from '../../api/expenditure/recurringBills'
import { describeApiFailure } from '../../lib/apiFailure'
import { can, useSession } from '../../lib/session/session'
import {
  INTERVALS,
  MODES,
  RECURRING_REFUSALS,
  blankRecurringForm,
  formOf,
  plainWords,
  recurringProblems,
  toRecurringRequest,
  type RecurringField,
  type RecurringForm,
} from '../../lib/recurringBills'
import chevronIcon from '../../assets/invoices/chevron.svg'

const muscatToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

const FIELD = 'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Setting up a recurring bill, and editing one (E-12).
 *
 * The mode decides the rest of the form: a watch that expects the supplier's bill asks when it
 * usually arrives and how far the amount may move, while one that raises the bill itself asks only
 * when to start. The fields the chosen mode does not use are not sent, because the server refuses
 * an arrival day on a raising watch and requires one on a watching one.
 */
export function NewRecurringBillPage() {
  const { id } = useParams()
  return (
    <AppShell>
      <RecurringBillForm key={id ?? 'new'} id={id ?? null} />
    </AppShell>
  )
}

function RecurringBillForm({ id }: { id: string | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useSession()
  const today = muscatToday()
  const [form, setForm] = useState<RecurringForm>(() => blankRecurringForm(today))
  const [seeded, setSeeded] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<RecurringField, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const existing = useApiRead<RecurringBillDto>(id ? recurringBillPath(id) : null, id ? () => loadRecurringBill(id) : undefined)

  if (!can(session, 'invoice.payment.manage')) {
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
  const words = plainWords(form)

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
        setFailure(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
      }
    } finally {
      setBusy(false)
    }
  }

  // The refusal sits outside the label on purpose: inside it, it becomes part of the field's name
  // and a reader hears "What to call it This field is required" as the label itself.
  const field = (name: RecurringField, label: string, input: React.ReactNode) => (
    <div className="block">
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-text-secondary">{label}</span>
        {input}
      </label>
      {errors[name] ? (
        <p role="alert" className="mt-1 text-xs font-medium text-danger-700">
          {t(errors[name]!)}
        </p>
      ) : null}
    </div>
  )

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/expenditure/recurring-bills" className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700">
          {t('recurringBills.title')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">{t(id ? 'recurringBills.form.editTitle' : 'recurringBills.form.newTitle')}</span>
      </div>

      <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t(id ? 'recurringBills.form.editTitle' : 'recurringBills.form.newTitle')}</h1>

      {failure ? <Notice body={failure} /> : null}

      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('recurringBills.form.whatIsIt')}</h2>
        <div className="mt-4 flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-semibold text-text-secondary">{t('recurringBills.form.mode')}</legend>
            {MODES.map((mode) => (
              <label key={mode} className="flex items-start gap-2 rounded-sm border border-border-subtle px-3 py-2.5">
                <input type="radio" name="mode" value={mode} checked={form.mode === mode} onChange={() => set({ mode })} className="mt-1 accent-primary-700" />
                <span>
                  <span className="block text-sm font-semibold text-text-primary">{t(`recurringBills.mode.${mode}`)}</span>
                  <span className="block text-xs font-medium text-text-quaternary">{t(`recurringBills.modeNote.${mode}`)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <SupplierPicker
            value={{ id: form.supplierId, name: form.supplierName, vatNumber: null }}
            onPick={(supplier) => set({ supplierId: supplier.id, supplierName: supplier.name })}
            error={errors.supplierName ? t(errors.supplierName) : undefined}
          />

          {field('description', t('recurringBills.form.whatToCallIt'), (
            <input value={form.description} onChange={(event) => set({ description: event.target.value })} className={FIELD} maxLength={200} />
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('category', t('recurringBills.form.category'), (
              <input value={form.category} onChange={(event) => set({ category: event.target.value })} className={FIELD} maxLength={60} />
            ))}
            {field('theirReference', t('recurringBills.form.theirReference'), (
              <input value={form.theirReference} onChange={(event) => set({ theirReference: event.target.value })} className={FIELD} maxLength={100} />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('recurringBills.form.whenItArrives')}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field('interval', t('recurringBills.form.howOften'), (
            <select value={form.interval} onChange={(event) => set({ interval: event.target.value as RecurringForm['interval'] })} className={FIELD}>
              {INTERVALS.map((interval) => (
                <option key={interval} value={interval}>
                  {t(`recurringBills.interval.${interval}`)}
                </option>
              ))}
            </select>
          ))}
          {expecting
            ? field('arrivesAroundDay', t(form.interval === 'WEEKLY' ? 'recurringBills.form.arrivesAroundWeekday' : 'recurringBills.form.arrivesAround'), (
                <input value={form.arrivesAroundDay} onChange={(event) => set({ arrivesAroundDay: event.target.value })} inputMode="numeric" className={FIELD} />
              ))
            : field('startDate', t('recurringBills.form.startsOn'), (
                <DateField value={form.startDate} min={today} ariaLabel={t('recurringBills.form.startsOn')} onChange={(startDate) => set({ startDate })} />
              ))}
          {expecting
            ? field('watchingFrom', t('recurringBills.form.watchingFrom'), (
                <DateField value={form.watchingFrom} ariaLabel={t('recurringBills.form.watchingFrom')} onChange={(watchingFrom) => set({ watchingFrom })} />
              ))
            : null}
          {field('paymentTermsDays', t('recurringBills.form.paymentTerms'), (
            <input value={form.paymentTermsDays} onChange={(event) => set({ paymentTermsDays: event.target.value })} inputMode="numeric" className={FIELD} />
          ))}
          {field('paymentDueDay', t('recurringBills.form.paymentDueDay'), (
            <input value={form.paymentDueDay} onChange={(event) => set({ paymentDueDay: event.target.value })} inputMode="numeric" className={FIELD} placeholder={t('recurringBills.form.optional')} />
          ))}
          {field('endDate', t('recurringBills.form.endsOn'), (
            <DateField value={form.endDate} ariaLabel={t('recurringBills.form.endsOn')} onChange={(endDate) => set({ endDate })} />
          ))}
        </div>
      </section>

      <section className="rounded-md bg-surface-card p-6">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('recurringBills.form.whatItCosts')}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field('totalIncludingVat', t('recurringBills.form.usualAmount'), (
            <input value={form.totalIncludingVat} onChange={(event) => set({ totalIncludingVat: event.target.value })} inputMode="decimal" className={FIELD} />
          ))}
          {field('vatAmount', t('recurringBills.form.vatAmount'), (
            <input value={form.vatAmount} onChange={(event) => set({ vatAmount: event.target.value })} inputMode="decimal" className={FIELD} placeholder={t('recurringBills.form.optional')} />
          ))}
        </div>
      </section>

      {expecting ? (
        <section className="rounded-md bg-surface-card p-6">
          <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('recurringBills.form.whenToTellYou')}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {field('tolerancePercent', t('recurringBills.form.tolerance'), (
              <input value={form.tolerancePercent} onChange={(event) => set({ tolerancePercent: event.target.value })} inputMode="decimal" className={FIELD} />
            ))}
            {field('lateAfterDays', t('recurringBills.form.lateAfter'), (
              <input value={form.lateAfterDays} onChange={(event) => set({ lateAfterDays: event.target.value })} inputMode="numeric" className={FIELD} />
            ))}
          </div>
          <label className="mt-4 flex items-start gap-2">
            <input
              type="checkbox"
              checked={form.autoApproveWithinRange}
              onChange={(event) => set({ autoApproveWithinRange: event.target.checked })}
              className="mt-1 size-4 accent-primary-700"
            />
            <span>
              <span className="block text-sm font-semibold text-text-primary">{t('recurringBills.form.autoApprove')}</span>
              <span className="block text-xs font-medium text-text-quaternary">{t('recurringBills.form.autoApproveNote')}</span>
            </span>
          </label>
        </section>
      ) : null}

      <section className="rounded-sm border border-primary-300 bg-primary-25 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">{t('recurringBills.form.inPlainWords')}</p>
        <p className="mt-1.5 text-sm font-medium leading-[1.5] text-text-secondary">{t(words.key, words.values)}</p>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <Link
          to="/expenditure/recurring-bills"
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
          {busy ? t('recurringBills.form.saving') : t(id ? 'recurringBills.form.save' : 'recurringBills.form.start')}
        </button>
      </div>
    </div>
  )
}
