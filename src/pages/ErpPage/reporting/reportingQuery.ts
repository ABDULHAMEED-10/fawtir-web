import { useSearchParams } from 'react-router-dom'
import { REPORT_MAX_PAGE } from '../../../api/erp/reporting'
import { defaultWindow } from '../../../lib/erp/reportingWindow'

/**
 * A report's filters live in the URL, as the compliance ledger's do, so a filtered view can be
 * shared and survives a reload. Every change replaces the history entry, and any change other than
 * the page itself sends the reader back to the first page: a page index carried into a narrower
 * filter points past the end of it.
 */
export function useReportQuery() {
  const [params, setParams] = useSearchParams()

  const get = (key: string) => params.get(key) ?? ''

  /** An allow-listed value, or `''` for anything this build does not offer. */
  const pick = <T extends string>(key: string, allowed: readonly T[]): T | '' => {
    const value = get(key)
    return (allowed as readonly string[]).includes(value) ? (value as T) : ''
  }

  const rawPage = Number.parseInt(get('page') || '1', 10)
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(rawPage, 1), REPORT_MAX_PAGE + 1) : 1

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (!value) next.delete(key)
          else next.set(key, value)
        }
        if (!('page' in changes)) next.delete('page')
        return next
      },
      { replace: true },
    )

  return { params, get, pick, page, update }
}

/**
 * The window from the URL. Without one in the URL, the default; with one, exactly what is there,
 * even when it is wrong, so the reader sees the problem they typed rather than a silent default.
 */
export function readWindow(
  get: (key: string) => string,
  fallback = true,
): { from: string; to: string } {
  const from = get('from')
  const to = get('to')
  if (!from && !to) return fallback ? defaultWindow() : { from: '', to: '' }
  return { from, to }
}
