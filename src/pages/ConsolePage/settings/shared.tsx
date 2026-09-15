import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Select, Switch, type SelectOption } from '../../../components/ui'
import lockIcon from '../../../assets/settings/menu-key.svg'
import infoIcon from '../../../assets/settings/info.svg'
import crossIcon from '../../../assets/settings/cross-muted.svg'

/**
 * The pieces every Console settings section is drawn from — the same card, switch row and
 * footer the tenant Settings screens use (SigningInPage, CompanyProfilePage), so an operator
 * who knows one knows the other.
 */

export function SettingsSectionCard({
  title,
  note,
  onSubmit,
  children,
  footer,
}: {
  title: string
  note?: string
  /** Given, the card is a form: Enter in a field saves the section. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  children: ReactNode
  footer?: ReactNode
}) {
  const body = (
    <>
      <div className="p-5">
        <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h2>
        {note ? (
          <p className="mt-1 max-w-[640px] text-xs font-medium leading-[1.5] text-text-quaternary">
            {note}
          </p>
        ) : null}
      </div>
      {children}
      {footer}
    </>
  )
  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      {onSubmit ? (
        <form noValidate onSubmit={onSubmit}>
          {body}
        </form>
      ) : (
        body
      )}
    </section>
  )
}

/** Save, Reset to defaults, and the audit line — one per section card. */
export function SectionFooter({
  dirty,
  isDefault,
  savedBy,
  onReset,
}: {
  dirty: boolean
  isDefault: boolean
  /** The "Saved by … · …" line, already formatted. */
  savedBy?: string
  onReset: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-subtle px-5 py-4">
      {dirty ? (
        <p className="me-auto text-xs font-medium text-pending-700">
          {t('console.settings.unsaved')}
        </p>
      ) : savedBy ? (
        <p role="status" className="me-auto text-xs font-medium text-text-quaternary">
          {savedBy}
        </p>
      ) : null}
      {!isDefault ? (
        <Button type="button" variant="secondary" size="md" onClick={onReset}>
          {t('console.settings.reset')}
        </Button>
      ) : null}
      <Button type="submit" size="md" disabled={!dirty}>
        {t('console.settings.save')}
      </Button>
    </div>
  )
}

/** A small heading that groups rows inside one card. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-surface-background px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-[0.04em] text-text-quaternary">
      {children}
    </p>
  )
}

export function SwitchRow({
  title,
  note,
  checked,
  onChange,
  disabled,
}: {
  title: string
  note?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-[1.3] text-text-primary">{title}</p>
        {note ? (
          <p className="mt-1 max-w-[560px] text-xs font-medium leading-[1.5] text-text-quaternary">
            {note}
          </p>
        ) : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  )
}

/** A row that shows a value the platform fixes, with the lock that says so. */
export function LockedRow({ title, note, value }: { title: string; note?: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-4 max-md:flex-col max-md:items-start">
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-[1.3] text-text-primary">{title}</p>
        {note ? (
          <p className="mt-1 max-w-[560px] text-xs font-medium leading-[1.5] text-text-quaternary">
            {note}
          </p>
        ) : null}
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-800">
        <img src={lockIcon} alt="" className="size-3 opacity-60" />
        {value}
      </span>
    </div>
  )
}

/** Two fields a row on a wide screen, one below the other on a phone. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 border-t border-surface-background p-5 sm:grid-cols-2">
      {children}
    </div>
  )
}

export function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <Select ariaLabel={label} value={value} onChange={onChange} options={options} />
      {hint ? (
        <p className="text-[10px] font-medium leading-[1.2] text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  )
}

/** A number typed as text, validated on Save — the plan editor's idiom. */
export function NumberField({
  name,
  label,
  value,
  onChange,
  hint,
  error,
  decimal,
  leadingIcon,
  trailingIcon,
}: {
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  /** The message to show, already translated. */
  error?: string
  decimal?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}) {
  return (
    <Input
      bordered
      name={name}
      label={label}
      hint={hint}
      error={error}
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      spellCheck={false}
      dir="ltr"
      leadingIcon={leadingIcon}
      trailingIcon={trailingIcon}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/** A sentence under the rows — where a related value lives, or why a rule is as it is. */
export function NoteLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 border-t border-surface-background px-5 py-3.5 text-xs font-medium leading-[1.5] text-text-quaternary">
      <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/**
 * A list of whole numbers — notice days, reminder days, percentage thresholds — drawn as chips
 * with a small field to add one. The list is kept sorted and without repeats.
 */
export function DayListField({
  label,
  hint,
  values,
  onChange,
  format,
  min = 1,
  max,
  error,
}: {
  label: string
  hint?: string
  values: number[]
  onChange: (values: number[]) => void
  /** How one chip reads: "day 7", "50 %". */
  format: (value: number) => string
  min?: number
  max?: number
  /** A section-level error for the whole list (from Save). */
  error?: string
}) {
  const { t } = useTranslation()
  const [pending, setPending] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const add = () => {
    const text = pending.trim()
    if (text === '') return
    const value = Number(text)
    if (!Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
      setLocalError(
        max !== undefined
          ? t('console.settings.error.wholeBetween', { min, max })
          : t('console.settings.error.wholeFrom', { min }),
      )
      return
    }
    if (values.includes(value)) {
      setLocalError(t('console.settings.error.duplicate'))
      return
    }
    onChange([...values, value].sort((a, b) => a - b))
    setPending('')
    setLocalError(null)
  }

  const message = localError ?? error

  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {values.length === 0 ? (
          <span className="text-xs font-medium text-text-quaternary">
            {t('console.settings.dayList.none')}
          </span>
        ) : null}
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-primary-50 ps-3 pe-1.5 text-sm font-semibold text-primary-800"
          >
            {format(value)}
            <button
              type="button"
              onClick={() => onChange(values.filter((entry) => entry !== value))}
              aria-label={t('console.settings.dayList.remove', { value: format(value) })}
              className="inline-flex size-6 items-center justify-center rounded-full transition-colors hover:bg-primary-100"
            >
              <img src={crossIcon} alt="" className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={pending}
          aria-label={t('console.settings.dayList.inputLabel', { label })}
          aria-invalid={message ? true : undefined}
          onChange={(event) => {
            setPending(event.target.value)
            setLocalError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
          className={[
            'h-11 w-24 rounded-sm border bg-white px-3 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-brand',
            message ? 'border-border-danger' : 'border-border-default',
          ].join(' ')}
        />
        <Button type="button" variant="secondary" size="md" onClick={add}>
          {t('console.settings.dayList.add')}
        </Button>
      </div>
      {message ? (
        <p className="text-xs font-medium text-text-danger">{message}</p>
      ) : hint ? (
        <p className="text-[10px] font-medium leading-[1.2] text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  )
}

/** The chips above a WhatsApp template: the placeholders the message may carry. */
export function PlaceholderChips({
  tokens,
  onInsert,
}: {
  tokens: readonly string[]
  onInsert: (token: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tokens.map((token) => {
        const placeholder = '{{' + token + '}}'
        return (
          <button
            key={token}
            type="button"
            dir="ltr"
            onClick={() => onInsert(placeholder)}
            title={t('console.settings.payments.insertPlaceholder')}
            className="inline-flex h-7 items-center rounded-full border border-border-subtle bg-surface-background px-2.5 font-mono text-[11px] font-semibold text-text-secondary transition-colors hover:border-border-brand-subtle hover:text-primary-800"
          >
            {placeholder}
          </button>
        )
      })}
    </div>
  )
}

export function TextareaField({
  name,
  label,
  value,
  onChange,
  rows = 4,
  dir,
  error,
  children,
}: {
  name?: string
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  dir?: 'ltr' | 'rtl'
  error?: string
  /** Drawn between the label and the box — the placeholder chips. */
  children?: ReactNode
}) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {children}
      <textarea
        name={name}
        value={value}
        dir={dir}
        rows={rows}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={[
          'w-full resize-y rounded-sm border bg-white px-3 py-2.5 text-sm font-medium leading-[1.5] text-text-primary outline-none transition-colors focus:border-border-brand',
          error ? 'border-border-danger' : 'border-border-default',
        ].join(' ')}
      />
      {error ? <p className="text-xs font-medium text-text-danger">{error}</p> : null}
    </label>
  )
}
