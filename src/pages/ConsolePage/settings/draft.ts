import {
  DEFAULT_SETTINGS,
  type PlatformSettings,
  type Section,
} from '../../../lib/platformSettings'

/**
 * A section as the form holds it: every number (and the nullable "none" numbers) becomes text,
 * so a half-typed "5." or an emptied field can sit there until Save validates it, the way
 * `PlanFormValues` does for the plan editor. Day lists stay numbers — the chip field only ever
 * adds a whole day at a time.
 */
export type Formed<T> = T extends number | null
  ? string
  : T extends readonly number[]
    ? T
    : T extends object
      ? { [K in keyof T]: Formed<T[K]> }
      : T

export type Forms = { [S in Section]: Formed<PlatformSettings[S]> }

/** Error messages by field path (`bank.iban`), as i18n keys. */
export type FieldErrors = Record<string, string | undefined>

type Plain = Record<string, unknown>

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Numbers to text, nulls to empty, everything else as it is. */
export function toFormValue<T>(value: T): Formed<T> {
  if (typeof value === 'number') return String(value) as Formed<T>
  if (value === null) return '' as Formed<T>
  if (isPlain(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toFormValue(entry)]),
    ) as Formed<T>
  }
  return value as Formed<T>
}

/**
 * Text back to the setting's own type, using the launch default as the template for which
 * fields are numbers: a default of `null` means empty text is "none".
 */
export function fromFormValue<T>(form: Formed<T>, template: T): T {
  if (typeof template === 'number') return Number(form) as T
  if (template === null) return (form === '' ? null : Number(form)) as T
  if (isPlain(template)) {
    const source = form as Plain
    return Object.fromEntries(
      Object.entries(template).map(([key, entry]) => [key, fromFormValue(source[key], entry)]),
    ) as T
  }
  return form as unknown as T
}

export const toForm = <S extends Section>(_section: S, values: PlatformSettings[S]): Forms[S] =>
  toFormValue(values) as Forms[S]

export const fromForm = <S extends Section>(section: S, form: Forms[S]): PlatformSettings[S] =>
  fromFormValue(form as Formed<PlatformSettings[S]>, DEFAULT_SETTINGS[section])

/* ------------------------------------------------------------------ validation */

const E = 'console.settings.error.'

type NumberRule = {
  /** Lowest value allowed, inclusive. */
  min?: number
  /** Highest value allowed, inclusive. */
  max?: number
  integer?: boolean
  /** Empty text is allowed and means "none". */
  optional?: boolean
}

/** One number field's error, as an i18n key, or nothing. */
export function numberError(text: string, rule: NumberRule = {}): string | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return rule.optional ? undefined : `${E}required`
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return `${E}number`
  if (rule.integer && !Number.isInteger(value)) return `${E}integer`
  if (rule.min !== undefined && rule.max !== undefined && (value < rule.min || value > rule.max)) {
    return rule.min === 0 && rule.max === 100 ? `${E}percent` : `${E}between`
  }
  if (rule.min !== undefined && value < rule.min) {
    return rule.min === 0 ? `${E}nonNegative` : rule.min === 1 ? `${E}atLeastOne` : `${E}between`
  }
  return undefined
}

export function requiredError(text: string): string | undefined {
  return text.trim() === '' ? `${E}required` : undefined
}

/** Drops the entries that hold nothing, so `isClean` and the dirty dot read the same map. */
export function compact(errors: FieldErrors): FieldErrors {
  return Object.fromEntries(Object.entries(errors).filter(([, value]) => value))
}

/* ------------------------------------------------------------------ section props */

export type Update<S extends Section> = (updater: (form: Forms[S]) => Forms[S]) => void

/** What every section body is given: its draft, a way to change it, and Save's errors. */
export type SectionProps<S extends Section> = {
  form: Forms[S]
  set: Update<S>
  errors: FieldErrors
}

/** How one section moves between the store and its form, and what Save checks. */
export type SectionSpec<S extends Section> = {
  toForm: (values: PlatformSettings[S]) => Forms[S]
  fromForm: (form: Forms[S]) => PlatformSettings[S]
  validate: (form: Forms[S]) => FieldErrors
}

export function spec<S extends Section>(
  section: S,
  validate: (form: Forms[S]) => FieldErrors,
  overrides: Partial<Pick<SectionSpec<S>, 'toForm' | 'fromForm'>> = {},
): SectionSpec<S> {
  return {
    toForm: (values) => toForm(section, values),
    fromForm: (form) => fromForm(section, form),
    ...overrides,
    validate,
  }
}
