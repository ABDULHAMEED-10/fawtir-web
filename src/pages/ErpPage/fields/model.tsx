import { useTranslation } from 'react-i18next'
import type { Target } from '../../../lib/erpCatalogue'
import type { Entry, InvalidMapping } from '../../../lib/erpMapping'

/** The term's name in the reader's language — the catalogue carries both. */
export function useTermName() {
  const { i18n } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  return (target: Target) => (arabic ? target.nameAr : target.name)
}

/** The DOM id a row is reachable by, for the checklist's links and the anchor strip. */
export const rowId = (businessTermId: string) => `erp-term-${businessTermId}`
export const sectionId = (section: string) => `erp-section-${section}`

/** An entry with nothing in it is not an entry — the row drops out of the draft. */
export function isBlank(entry: Entry) {
  return (
    !entry.sourcePath &&
    !entry.defaultValue &&
    entry.transform === undefined &&
    !entry.valueMap &&
    !entry.valueMapDefault
  )
}

/** Empty strings never reach the validator; they mean "not set". */
export function normalise(entry: Entry): Entry {
  const next = { ...entry }
  if (!next.sourcePath) delete next.sourcePath
  if (!next.defaultValue) delete next.defaultValue
  if (next.transform !== undefined && !next.transform.trim()) delete next.transform
  if (next.valueMap && Object.keys(next.valueMap).length === 0) delete next.valueMap
  if (!next.valueMapDefault) delete next.valueMapDefault
  return next
}

export const errorsFor = (invalid: InvalidMapping[], businessTermId: string) =>
  invalid.filter((m) => m.businessTermId === businessTermId)

/** Scrolls a row or section into view inside the app's scrolling `<main>`. */
export function jumpTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
