import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Notice } from '../feedback/ApiNotice'

/**
 * The app's usual "not available yet" notice (the Bills list's pattern), for trade-document
 * buttons that have no route behind them yet (TRADE_DOCUMENTS.md row T.9). The notice is a
 * closable card the page draws where it already keeps its messages; nothing else moves.
 */
export function useTradeNotice() {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)
  const show = useCallback(
    (key: string, values?: Record<string, string | number>) => setNotice(t(key, values)),
    [t],
  )
  const unavailable = useCallback(() => show('tradeDocs.notAvailableYet'), [show])
  const node = notice ? (
    <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} />
  ) : null
  return { node, show, unavailable }
}
