import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CameraIcon } from '../ui'
import omanFlag from '../../assets/flags/oman.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import checkboxChecked from '../../assets/customers/checkbox-checked.svg'

/**
 * Field chrome measured off Figma: 50px tall, #fafafa fill, 4px radius.
 * Borders differ by state — #d0d2d5 when empty, #8095d4 once a value is present.
 */
const FIELD_BASE =
  'h-[50px] w-full rounded-sm bg-surface-tab-bar px-4 text-sm font-medium outline-none transition-colors placeholder:text-text-placeholder'
const FIELD_EMPTY = 'border border-border-default text-text-secondary focus:border-primary-700'
const FIELD_FILLED = 'border border-primary-300 text-text-secondary focus:border-primary-700'

export function SectionCard({
  step,
  title,
  children,
  action,
}: {
  step: number
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="rounded-sm bg-surface-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
            {step}
          </span>
          <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
        </div>
        {action}
      </div>
      <div className="my-4 h-px bg-surface-background" />
      {children}
    </section>
  )
}

export function FieldLabel({
  label,
  required,
  htmlFor,
}: {
  label: string
  required?: boolean
  htmlFor?: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary"
    >
      <span>{label}</span>
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
    </label>
  )
}

export function TextField({
  id,
  name,
  label,
  placeholder,
  required,
  type = 'text',
  hint,
  defaultValue,
  error,
  value,
  onChange,
  inputMode,
  maxLength,
  autoComplete,
  dir,
}: {
  id: string
  name: string
  label: string
  placeholder?: string
  required?: boolean
  type?: string
  hint?: string
  defaultValue?: string
  /** Already-translated message; replaces the hint while it is present. */
  error?: string
  /** Controlled use: pass both. */
  value?: string
  onChange?: (next: string) => void
  inputMode?: 'text' | 'decimal' | 'numeric' | 'email'
  maxLength?: number
  /** Omitted leaves the browser default, so existing fields are unchanged. */
  autoComplete?: string
  /** `ltr` for a code typed in an Arabic page (a path, a parameter): `/id` must not read `id/`. */
  dir?: 'ltr' | 'rtl'
}) {
  const filled = value !== undefined ? value !== '' : Boolean(defaultValue)
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel label={label} required={required} htmlFor={id} />
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete}
        dir={dir}
        {...(value !== undefined ? { value, onChange: (event) => onChange?.(event.target.value) } : { defaultValue })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={[
          FIELD_BASE,
          filled ? FIELD_FILLED : FIELD_EMPTY,
          error ? 'ring-1 ring-border-danger' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium leading-[1.2] text-text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs font-medium leading-[1.2] text-text-quaternary">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextAreaField({
  id,
  name,
  label,
  placeholder,
  rows = 3,
  /** Tailwind min-height class — Figma draws the email box at 85px. */
  minHeightClass = 'min-h-[85px]',
  value,
  onChange,
  error,
  maxLength,
}: {
  id: string
  name: string
  label: string
  placeholder?: string
  rows?: number
  minHeightClass?: string
  /** Controlled use: pass both. */
  value?: string
  onChange?: (next: string) => void
  /** Already-translated message. */
  error?: string
  maxLength?: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel label={label} htmlFor={id} />
      <textarea
        id={id}
        name={name}
        rows={rows}
        placeholder={placeholder}
        maxLength={maxLength}
        {...(value !== undefined ? { value, onChange: (event) => onChange?.(event.target.value) } : {})}
        aria-invalid={error ? true : undefined}
        className={[
          'w-full resize-y rounded-sm border bg-surface-tab-bar p-4 text-sm font-medium text-text-secondary outline-none transition-colors placeholder:text-text-placeholder focus:border-primary-700',
          error ? 'border-border-danger' : 'border-border-default',
          minHeightClass,
        ].join(' ')}
      />
      {error ? (
        <p className="text-xs font-medium leading-[1.2] text-text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Select fields always carry a value, so they use the filled border plus a chevron suffix. */
export function SelectField({
  id,
  name,
  label,
  options,
  required,
  hint,
  value,
  onChange,
  error,
}: {
  id: string
  name: string
  label: string
  /** Plain strings are their own value; pairs carry a code behind a label. */
  options: string[] | { value: string; label: string }[]
  required?: boolean
  hint?: string
  /** Controlled use: pass both. */
  value?: string
  onChange?: (next: string) => void
  /** Already-translated message. */
  error?: string
}) {
  const pairs = options.map((option) => (typeof option === 'string' ? { value: option, label: option } : option))
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel label={label} required={required} htmlFor={id} />
      <div className="relative">
        <select
          id={id}
          name={name}
          required={required}
          {...(value !== undefined ? { value, onChange: (event) => onChange?.(event.target.value) } : {})}
          aria-invalid={error ? true : undefined}
          className={[FIELD_BASE, FIELD_FILLED, 'appearance-none pe-12', error ? 'ring-1 ring-border-danger' : ''].join(' ')}
        >
          {pairs.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <img
          src={chevronIcon}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute end-4 top-1/2 size-6 -translate-y-1/2 rotate-90 opacity-70"
        />
      </div>
      {error ? (
        <p className="text-xs font-medium leading-[1.2] text-text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs font-medium leading-[1.2] text-text-quaternary">{hint}</p>
      ) : null}
    </div>
  )
}

/** Oman flag + fixed +968 dial code, matching the Figma phone field. */
export function PhoneField({
  id,
  name,
  label,
  placeholder = '9XXX XXXX',
  error,
  value,
  onChange,
}: {
  id: string
  name: string
  label: string
  placeholder?: string
  /** Already-translated message. */
  error?: string
  /** Controlled use: pass both. The +968 the field draws is not part of the value. */
  value?: string
  onChange?: (next: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel label={label} htmlFor={id} />
      <div
        className={[
          'flex h-[50px] w-full items-center gap-2 rounded-sm border bg-surface-tab-bar px-4 transition-colors focus-within:border-primary-700',
          error ? 'border-border-danger' : 'border-border-subtle',
        ].join(' ')}
      >
        <img
          src={omanFlag}
          alt=""
          aria-hidden="true"
          className="size-5 shrink-0 rounded-[2px] object-cover"
        />
        <span className="shrink-0 text-sm font-medium text-text-secondary">+968</span>
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          placeholder={placeholder}
          {...(value !== undefined ? { value, onChange: (event) => onChange?.(event.target.value) } : {})}
          aria-invalid={error ? true : undefined}
          className="h-full w-full min-w-0 border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
        />
      </div>
      {error ? (
        <p className="text-xs font-medium leading-[1.2] text-text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** 20px blue rounded-square tick, as drawn beside the VAT and Peppol fields. */
export function CheckboxRow({
  id,
  name,
  label,
  checked,
  onChange,
}: {
  id: string
  name: string
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={[
          'inline-flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors',
          checked
            ? 'border-primary-700 bg-primary-700'
            : 'border-border-default bg-surface-tab-bar',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-300',
        ].join(' ')}
      >
        {checked ? <img src={checkboxChecked} alt="" className="size-5" /> : null}
      </span>
      <span className="text-sm font-medium leading-[1.2] text-text-primary">{label}</span>
    </label>
  )
}

/** 42×23 pill with an 18px knob — the Figma switch. */
export function Toggle({
  checked,
  onChange,
  label,
  name,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  name?: string
}) {
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          'relative h-[23px] w-[42px] shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary-700' : 'bg-neutral-100',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-[2.5px] size-[18px] rounded-full bg-white transition-all',
            checked ? 'start-[21px]' : 'start-[2.5px]',
          ].join(' ')}
        />
      </button>
      {name ? <input type="hidden" name={name} value={checked ? 'yes' : 'no'} /> : null}
    </>
  )
}

/** Label to the left of the switch — the header "Advanced fields" treatment. */
export function ToggleInline({
  label,
  checked,
  onChange,
  name,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  name?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium leading-[1.2] text-text-primary">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} name={name} />
    </div>
  )
}

/** Stacked label + hint on the left, switch on the right. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  name,
}: {
  label: string
  /** A node, so a sentence with an amount can carry the rial sign. */
  hint?: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
  name?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-[1.2] text-text-primary">{label}</p>
        {hint ? (
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">{hint}</p>
        ) : null}
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} name={name} />
    </div>
  )
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>
}

/**
 * 72×72 dashed drop target with a camera icon and the copy beside it, per Figma.
 * Accepts click-to-browse or a dragged image file.
 */
export function ImageUploadField({
  id,
  name,
  label,
  title,
  hint,
}: {
  id: string
  name: string
  label: string
  title: string
  hint: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const accept = (files: FileList | null) => {
    const file = files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(file)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel label={label} htmlFor={id} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            accept(e.dataTransfer.files)
          }}
          aria-label={title}
          className={[
            'flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-dashed bg-surface-tab-bar transition-colors',
            dragging
              ? 'border-primary-700 bg-primary-25'
              : 'border-neutral-300 hover:border-primary-300',
          ].join(' ')}
        >
          {preview ? (
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <CameraIcon size={30} className="text-text-tertiary" />
          )}
        </button>
        <div className="min-w-0">
          <p className="text-base font-medium leading-[1.2] text-text-primary">{title}</p>
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">{hint}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="sr-only"
        onChange={(e) => accept(e.target.files)}
      />
    </div>
  )
}
