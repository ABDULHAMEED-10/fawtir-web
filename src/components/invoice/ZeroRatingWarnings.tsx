import { useTranslation } from 'react-i18next'
import type { ZeroRatingWarningCode } from '../../api/catalog/zeroRating'
import { formatDisplayDate } from '../../lib/dates'

/** One warning as this list draws it; `line` names an invoice line, absent for an item. */
export type ZeroRatingNote = {
  code: ZeroRatingWarningCode
  hsCode: string | null
  /** The date the lists were read for (Z.10). */
  judgedOn: string
  line?: number
}

/**
 * Zero-rating warnings (INCOME.md Z.11, Z.13, Z.15): a VAT category that does not match Oman's
 * zero-rated lists for the HS code. Never blocking: the person checks and decides. Worded here
 * from the code; the server's English `message` is a fallback the screen does not show. Inline,
 * in the pending colour, as warnings are on every other screen.
 */
export function ZeroRatingWarnings({ warnings }: { warnings: readonly ZeroRatingNote[] }) {
  const { t, i18n } = useTranslation()
  if (warnings.length === 0) return null
  return (
    <section
      role="status"
      className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700"
    >
      <p className="font-semibold">{t('zeroRating.title')}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {warnings.map((warning, index) => {
          const text = t(`zeroRating.warning.${warning.code}`, {
            hsCode: warning.hsCode ?? t('zeroRating.noHsCode'),
            date: formatDisplayDate(warning.judgedOn, i18n.language),
          })
          return (
            <li key={`${warning.line ?? 0}-${warning.code}-${index}`}>
              {warning.line ? t('zeroRating.line', { line: warning.line, text }) : text}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
