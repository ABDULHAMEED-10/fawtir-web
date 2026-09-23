import { createContext, useContext } from 'react'
import type { SelectOption } from '../../components/ui/Select'
import type { ReferenceDataDto, TaxCategoryDto } from '../../api/reference/referenceData'

/**
 * The platform's code lists, handed to every signed-in screen the way the session is.
 *
 * Loaded once by `AppShell` alongside the session and held in context, so a form can read a
 * dropdown's options synchronously instead of every one of them growing a loading branch for a
 * list that changes when the law changes.
 *
 * **Labels are not in the response.** The server sends codes; the display text lives in the locale
 * files under `reference.*`, so Arabic has one home rather than two. A code with no translation
 * falls back to the code itself — visibly odd rather than silently blank, which is what you want
 * when the catalogue gains an entry before the front end has a word for it.
 */

export const ReferenceDataContext = createContext<ReferenceDataDto | null>(null)

export function useReferenceData(): ReferenceDataDto | null {
  return useContext(ReferenceDataContext)
}

type Translate = (key: string, options?: Record<string, unknown>) => string

const label = (t: Translate, group: string, code: string) =>
  t(`reference.${group}.${code}`, { defaultValue: code })

/** Withdrawn entries are never offered, but they still resolve for documents already issued. */
const offered = <T extends { active: boolean }>(rows: T[] | undefined) => (rows ?? []).filter((row) => row.active)

export function taxCategoryOptions(data: ReferenceDataDto | null, t: Translate): SelectOption[] {
  return offered(data?.taxCategories).map((category) => ({
    value: category.code,
    label: label(t, 'taxCategory', category.code),
    hint: `${category.en16931Category} · ${category.rate}%`,
  }))
}

export function unitOptions(data: ReferenceDataDto | null, t: Translate): SelectOption[] {
  return offered(data?.units).map((unit) => ({
    value: unit.code,
    label: label(t, 'unitShort', unit.code),
    hint: label(t, 'unit', unit.code),
  }))
}

export function paymentTermOptions(data: ReferenceDataDto | null, t: Translate): SelectOption[] {
  return offered(data?.paymentTerms).map((term) => ({
    value: term.code,
    label: label(t, 'paymentTerm', term.code),
    hint: t('reference.netDays', { count: term.netDays }),
  }))
}

export function paymentMethodOptions(data: ReferenceDataDto | null, t: Translate): SelectOption[] {
  return offered(data?.paymentMethods).map((method) => ({
    value: method.code,
    label: label(t, 'paymentMethod', method.code),
    hint: `UNCL4461 · ${method.code}`,
  }))
}

/** Net days for a term code — the composer derives the due date from it (INV-PD-005). */
export function netDaysFor(data: ReferenceDataDto | null, code: string | null | undefined): number | null {
  if (!code) return null
  const term = (data?.paymentTerms ?? []).find((row) => row.code === code)
  return term ? term.netDays : null
}

/**
 * The full category record for a code, which the composer needs because a line carries the
 * EN 16931 category and the rate beside its own code.
 *
 * The rate here is what the screen SHOWS. The server derives the rate it stores from
 * `en16931Category` and ignores what the browser sends, so a stale client cannot mis-tax a
 * document — it can only briefly mislabel one.
 */
export function taxCategoryFor(
  data: ReferenceDataDto | null,
  code: string | null | undefined,
): TaxCategoryDto | null {
  if (!code) return null
  return (data?.taxCategories ?? []).find((row) => row.code === code) ?? null
}
