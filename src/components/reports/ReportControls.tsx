import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadReport, type ReportGranularity } from '../../api/reports/reports'
import { saveDownload } from '../../lib/supplierRecord'

const FIELD =
  'h-[40px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

const BUTTON =
  'inline-flex h-[40px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:opacity-50'

export const GRANULARITIES: ReportGranularity[] = ['MONTH', 'QUARTER', 'YEAR']

/**
 * The range and bucket a report is read at, and the two exports of that same view.
 *
 * The export hrefs carry the range the screen is showing rather than the server's defaults, so a
 * downloaded file and the page above it can never disagree about the period they cover.
 */
export function ReportControls({
  from,
  to,
  granularity,
  onChange,
  exports,
  extra,
}: {
  from: string
  to: string
  granularity: ReportGranularity
  onChange: (change: { from?: string; to?: string; granularity?: ReportGranularity }) => void
  /** CSV and XLSX paths for the current view, or null when the report has no export. */
  exports: { csv: string; xlsx: string; name: string } | null
  extra?: React.ReactNode
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<'csv' | 'xlsx' | null>(null)
  const [failed, setFailed] = useState(false)

  const download = async (format: 'csv' | 'xlsx') => {
    if (!exports) return
    setBusy(format)
    setFailed(false)
    try {
      saveDownload(await downloadReport(format === 'csv' ? exports.csv : exports.xlsx), `${exports.name}.${format}`)
    } catch {
      // The report itself is on screen and still readable, so a failed export is a line by the
      // buttons rather than a notice that replaces the page.
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md bg-surface-card p-4">
      <label className="flex flex-col gap-1 text-xs font-semibold text-text-quaternary">
        {t('reports.controls.from')}
        <input type="date" value={from} onChange={(event) => onChange({ from: event.target.value })} className={FIELD} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-text-quaternary">
        {t('reports.controls.to')}
        <input type="date" value={to} onChange={(event) => onChange({ to: event.target.value })} className={FIELD} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-text-quaternary">
        {t('reports.controls.granularity')}
        <select
          value={granularity}
          onChange={(event) => onChange({ granularity: event.target.value as ReportGranularity })}
          className={FIELD}
        >
          {GRANULARITIES.map((option) => (
            <option key={option} value={option}>
              {t(`reports.controls.bucket.${option}`)}
            </option>
          ))}
        </select>
      </label>

      {extra}

      {exports ? (
        <div className="ms-auto flex items-end gap-2">
          <button type="button" disabled={busy !== null} onClick={() => void download('csv')} className={BUTTON}>
            {t(busy === 'csv' ? 'common.saving' : 'reports.controls.csv')}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void download('xlsx')} className={BUTTON}>
            {t(busy === 'xlsx' ? 'common.saving' : 'reports.controls.xlsx')}
          </button>
        </div>
      ) : null}

      {failed ? (
        <p role="alert" className="w-full text-sm font-medium text-warning-700">
          {t('reports.controls.exportFailed')}
        </p>
      ) : null}
    </div>
  )
}
