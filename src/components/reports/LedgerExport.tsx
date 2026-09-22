import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadReport } from '../../api/reports/reports'
import { saveDownload } from '../../lib/supplierRecord'
import { ledgerExportPath } from '../../api/compliance/activity'
import type { ActivityFilters } from '../../api/compliance/activity'

/**
 * Download the compliance ledger — one row per document — as CSV or XLSX.
 *
 * **Not an export of the compliance summary.** That is four counts and a median; a file of it
 * proves nothing about individual documents. What a tenant is asked to produce is "every document
 * you reported, and when", which is this ledger. The summary screen therefore offers this, rather
 * than a download of its own figures.
 *
 * The filters passed in are the ones the screen is showing, so the file and the page above it
 * cannot disagree about which documents they cover.
 *
 * Separate from `ReportControls` because that component owns a from/to/granularity bar this
 * screen does not have — the ledger is filtered by tab and search, not bucketed by period.
 */
export function LedgerExport({ filters, name }: { filters: ActivityFilters; name: string }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'csv' | 'xlsx' | null>(null)
  const [failed, setFailed] = useState(false)
  const [truncated, setTruncated] = useState(false)

  const download = async (format: 'csv' | 'xlsx') => {
    setBusy(format)
    setFailed(false)
    setTruncated(false)
    try {
      const file = await downloadReport(ledgerExportPath(filters, format))
      // The server caps the file. Said here, because nothing inside the file says it stopped
      // short — and a compliance export that is quietly incomplete is worse than none.
      setTruncated(file.headers.get('X-Fawtir-Export-Truncated') === 'true')
      saveDownload(file, `${name}.${format}`)
    } catch {
      // The ledger is on screen and still readable, so a failed export is a line beside the
      // buttons rather than a notice that replaces the page.
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {(['csv', 'xlsx'] as const).map((format) => (
          <button
            key={format}
            type="button"
            disabled={busy !== null}
            onClick={() => download(format)}
            className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:text-text-tertiary"
          >
            {busy === format ? t('ledgerExport.working') : t(`ledgerExport.${format}`)}
          </button>
        ))}
      </div>
      {failed ? <p className="text-xs font-medium text-danger-700">{t('ledgerExport.failed')}</p> : null}
      {truncated ? <p className="text-xs font-medium text-pending-700">{t('ledgerExport.truncated')}</p> : null}
    </div>
  )
}
