import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../components/ui'
import { formatDay } from '../../../lib/console/format'
import { parseDateKey, toDateKey } from '../../../lib/dates'
import {
  PLAN_OPTIONS,
  SUBSCRIPTIONS_NOW,
  TERMS,
  planLabelKey,
  useSubscriptions,
  type SubscriptionInvoice,
} from '../../../lib/consoleSubscriptions'
import { omr } from '../../../lib/superAdmin'

/**
 * What the subscription modals share: a labelled slot for the controls that draw their own shell
 * (`Select`, `DateField`, the textarea), the footer every one of them ends with, and the small
 * conversions between the store's `Date`s and the `DateField`'s `yyyy-mm-dd` keys.
 *
 * `Input` carries its own label and error line; the others do not, so `Field` gives them the same
 * one. Every slot is marked `data-field` so a failed submit can put focus on the first invalid
 * control the way `focusFirstInvalid` does for named inputs — a `Select` is a button with no
 * `name`, so the form's `elements` cannot find it.
 */

/** The ledger as the hook hands it out; the store does not export the type by name. */
export type Ledger = ReturnType<typeof useSubscriptions>

/** What every action modal is given: the tenant, the live ledger, and where its result goes. */
export type ActionModalProps = {
  tenantId: string
  ledger: Ledger
  /** Preselects an invoice, from a row action or the URL. */
  invoiceId?: string
  onClose: () => void
  /** The line the page shows once the store has changed; the modal closes itself first. */
  onDone: (message: string) => void
}

export type Errors<F extends string> = Partial<Record<F, string>>

export function Field({
  name,
  label,
  required,
  error,
  hint,
  children,
}: {
  name: string
  label: string
  required?: boolean
  error?: string
  hint?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex w-full flex-col gap-1" data-field={name}>
      <span
        id={id}
        className="inline-flex items-center gap-0.5 text-sm font-medium text-text-primary"
      >
        {label}
        {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      </span>
      <div aria-labelledby={id} className={error ? 'rounded-sm ring-1 ring-border-danger' : ''}>
        {children}
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-text-danger">
          {error}
        </p>
      ) : null}
      {!error && hint ? (
        <p className="text-[10px] font-medium leading-[1.2] text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  )
}

/** The app's multi-line field, in the same shell `Select` and `DateField` draw. */
export function TextArea({
  label,
  required,
  error,
  hint,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  required?: boolean
  error?: string
  hint?: string
}) {
  const id = useId()
  return (
    <div className="flex w-full flex-col gap-1" data-field={props.name}>
      <label
        htmlFor={id}
        className="inline-flex items-center gap-0.5 text-sm font-medium text-text-primary"
      >
        {label}
        {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        className={[
          'min-h-[88px] w-full resize-y rounded-sm border bg-surface-tab-bar px-4 py-3 text-sm font-medium leading-[1.4] text-text-secondary outline-none transition-colors placeholder:text-text-placeholder hover:border-primary-500 focus:border-primary-500',
          error ? 'border-border-danger' : 'border-primary-300',
          className,
        ].join(' ')}
        {...props}
      />
      {error ? (
        <p role="alert" className="text-xs font-medium text-text-danger">
          {error}
        </p>
      ) : null}
      {!error && hint ? (
        <p className="text-[10px] font-medium leading-[1.2] text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  )
}

/** Small pills that fill a field with a stock answer — the reasons an activation usually has. */
export function QuickChips({
  options,
  value,
  onPick,
}: {
  options: { id: string; label: string }[]
  value: string
  onPick: (label: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value.trim() === option.label
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onPick(option.label)}
            aria-pressed={active}
            className={[
              'inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors',
              active
                ? 'border-primary-700 bg-primary-700 text-white'
                : 'border-border-default bg-white text-text-secondary hover:border-border-brand-subtle hover:bg-primary-25',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** A label/value line of a summary block, as the console's cards draw them. */
export function SummaryLine({
  label,
  value,
  tone,
}: {
  label: string
  value: ReactNode
  tone?: 'danger'
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0">
      <span className="text-sm font-medium text-text-tertiary">{label}</span>
      <span
        className={`text-end text-sm font-semibold ${tone === 'danger' ? 'text-danger-700' : 'text-text-primary'}`}
      >
        {value}
      </span>
    </div>
  )
}

/** Cancel on the left, the action on the right — `PlanEditor`'s footer, with a danger variant. */
export function ModalFooter({
  formId,
  onCancel,
  submitLabel,
  danger,
  disabled,
}: {
  formId: string
  onCancel: () => void
  submitLabel: string
  danger?: boolean
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap justify-end gap-2.5">
      <Button type="button" size="md" variant="secondary" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      {danger ? (
        <button
          type="submit"
          form={formId}
          disabled={disabled}
          className="inline-flex h-11 items-center justify-center rounded-sm bg-danger-700 px-4 text-base font-semibold text-white transition-colors hover:bg-danger-700/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-danger disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel}
        </button>
      ) : (
        <Button type="submit" form={formId} size="md" disabled={disabled}>
          {submitLabel}
        </Button>
      )}
    </div>
  )
}

/**
 * Moves focus to the first invalid control, in the order the form draws them. The slots are
 * found by `data-field` because a `Select` or `DateField` is a button with no form name.
 */
export function focusFirstInvalidField<F extends string>(
  form: HTMLFormElement,
  order: readonly F[],
  errors: Errors<F>,
) {
  const field = order.find((name) => errors[name])
  if (!field) return
  const slot = form.querySelector<HTMLElement>(`[data-field="${field}"]`)
  const control = slot?.querySelector<HTMLElement>('button, input, textarea')
  control?.focus()
}

/* ------------------------------------------------------------------- dates */

/** The console's clock, as the `DateField` writes it. */
export const TODAY_KEY = toDateKey(SUBSCRIPTIONS_NOW)

export const dateOf = (key: string) => parseDateKey(key)

export function dayLabel(date: Date, language: string) {
  return formatDay(date.toISOString(), language)
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

/** "1,234.500" → 1234.5; anything that is not a number → NaN. */
export function parseAmount(value: string) {
  const cleaned = value
    .replace(/[,\s]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  return cleaned === '' ? NaN : Number(cleaned)
}

/* ----------------------------------------------------------------- options */

export function usePlanOptions() {
  const { t } = useTranslation()
  return PLAN_OPTIONS.map((plan) => ({ value: plan, label: t(planLabelKey(plan)) }))
}

export function useTermOptions() {
  const { t } = useTranslation()
  return TERMS.map((term) => ({ value: term, label: t(`console.subscriptions.term.${term}`) }))
}

export function useInvoiceOptions(invoices: SubscriptionInvoice[]) {
  const { t, i18n } = useTranslation()
  return invoices.map((invoice) => ({
    value: invoice.id,
    label: invoice.number,
    hint: t('console.subscriptionActions.common.invoiceHint', {
      period: `${dayLabel(invoice.periodStart, i18n.language)} → ${dayLabel(invoice.periodEnd, i18n.language)}`,
      total: omr(invoice.total),
    }),
  }))
}

export { omr }
