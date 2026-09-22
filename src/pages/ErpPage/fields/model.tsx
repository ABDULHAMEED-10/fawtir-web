import { useTranslation } from 'react-i18next'
import type { Target } from '../../../lib/erpCatalogue'

/**
 * Presentation helpers for the Fields editor.
 *
 * The draft's own shape and rules live in `lib/erp/draft.ts`, next to the API types they have to
 * match. Only the things that are genuinely about drawing a row are here.
 */

export { isBlank, normalise, errorsFor, withOrdinals } from '../../../lib/erp/draft'
export type { DraftEntry, Draft } from '../../../lib/erp/draft'

/** The term's name in the reader's language — the catalogue carries both. */
export function useTermName() {
  const { i18n } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  return (target: Target) => (arabic ? target.nameAr : target.name)
}

/**
 * The reader-facing text for one validator refusal.
 *
 * Prefers the translated copy for the error code, and falls back to the server's own `message`
 * when there is no translation for it. The fallback is the point: the validator's codes are a
 * backend enum that can grow, and a code with no translation must still say what is wrong rather
 * than render a raw key or collapse into a generic failure.
 */
export function useMappingError() {
  const { t, i18n } = useTranslation()
  return (error: { errorCode: string; message: string }) => {
    const key = `erp.error.${error.errorCode}`
    return i18n.exists(key) ? t(key) : error.message
  }
}

/** The DOM id a row is reachable by, for the checklist's links and the anchor strip. */
export const rowId = (businessTermId: string) => `erp-term-${businessTermId}`
export const sectionId = (section: string) => `erp-section-${section}`

/** Scrolls a row or section into view inside the app's scrolling `<main>`. */
export function jumpTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
