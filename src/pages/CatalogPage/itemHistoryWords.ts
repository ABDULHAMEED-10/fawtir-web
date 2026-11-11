import { useTranslation } from 'react-i18next'
import type { ProductHistoryChange, ProductHistoryEntry } from '../../api/catalog/insights'
import { dateLocale, historyFieldKey } from '../../lib/catalogInsights'
import { formatDisplayDate } from '../../lib/dates'

/** The audit event's name in words (`itemHistory.action.<event>`), else the event as sent. */
export function useHistoryWords() {
  const { t, i18n } = useTranslation()
  const action = (entry: Pick<ProductHistoryEntry, 'action'>) =>
    t(`itemHistory.action.${entry.action}`, { defaultValue: t('itemHistory.action.other') })
  const field = (change: Pick<ProductHistoryChange, 'field'>) =>
    t(historyFieldKey(change), { defaultValue: change.field })
  /** When it happened, in the reader's language, as date and time. */
  const when = (iso: string) => {
    const date = new Date(iso)
    return {
      date: formatDisplayDate(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        i18n.language,
      ),
      time: date.toLocaleTimeString(dateLocale(i18n.language), {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
  }
  return { action, field, when }
}
