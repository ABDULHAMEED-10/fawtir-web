import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ReportShell } from '../../components/reports'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  REPORT_LISTS_PATH,
  catalogueHref,
  downloadReport,
  loadListsCatalogue,
  type ListsCatalogueDto,
  type ListsDatasetDto,
} from '../../api/reports/reports'
import { saveDownload } from '../../lib/supplierRecord'
import { can, useSession } from '../../lib/session/session'

/**
 * Reports › Downloads (position 7).
 *
 * **Rendered from the server's own catalogue**, not from a list kept here. Each dataset names its
 * title, description, permission, formats, URLs and parameters, so a dataset added or renamed on
 * the server appears correctly without a change on this side — and a hard-coded list, which is
 * what this page had, cannot drift out of step with what actually downloads.
 *
 * A dataset the reader may not download is still shown, greyed, with the permission it wants.
 * Hiding it would leave someone asking a colleague for a file nobody can see exists.
 */
export function ReportsListsPage() {
  const { t } = useTranslation()
  const catalogue = useApiRead<ListsCatalogueDto>(REPORT_LISTS_PATH, loadListsCatalogue)

  return (
    <ReportShell titleKey="reports.lists.title" subtitleKey="reports.lists.subtitle">
      {catalogue.read.status === 'loading' ? <LoadingNotice /> : null}
      {catalogue.read.status === 'failed' ? (
        <ApiReadFailure error={catalogue.read.error} retry={catalogue.retry} />
      ) : null}

      {catalogue.read.status === 'ready' ? (
        catalogue.read.data.datasets.length === 0 ? (
          <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
            {t('reports.lists.empty')}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {catalogue.read.data.datasets.map((dataset) => (
              <DatasetCard key={dataset.key} dataset={dataset} />
            ))}
          </div>
        )
      ) : null}
    </ReportShell>
  )
}

function DatasetCard({ dataset }: { dataset: ListsDatasetDto }) {
  const { t } = useTranslation()
  const session = useSession()
  const allowed = can(session, dataset.permission)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const download = async (format: 'csv' | 'xlsx') => {
    const href = format === 'csv' ? dataset.hrefCsv : dataset.hrefXlsx
    if (!href) return
    setBusy(format)
    setFailed(false)
    try {
      saveDownload(await downloadReport(catalogueHref(href)), `${dataset.key}.${format}`)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="flex flex-col gap-3 rounded-md bg-surface-card p-5">
      <div>
        {/* The server's own title and description, not a translated copy: a dataset added there
            would otherwise appear here as a missing key. */}
        <h3 className="text-base font-semibold leading-[1.2] text-text-secondary">{dataset.title}</h3>
        <p className="mt-1 text-sm font-medium leading-[1.4] text-text-quaternary">{dataset.description}</p>
      </div>

      {dataset.parameters.length > 0 ? (
        <p className="text-xs font-medium text-text-quaternary">
          {t('reports.lists.filters', { list: dataset.parameters.join(', ') })}
        </p>
      ) : null}

      {allowed ? (
        <div className="mt-auto flex flex-wrap items-center gap-2">
          {(['csv', 'xlsx'] as const).map((format) =>
            dataset.formats.includes(format) && (format === 'csv' ? dataset.hrefCsv : dataset.hrefXlsx) ? (
              <button
                key={format}
                type="button"
                disabled={busy !== null}
                onClick={() => void download(format)}
                className="inline-flex h-[40px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:opacity-50"
              >
                {t(busy === format ? 'common.saving' : `reports.controls.${format}`)}
              </button>
            ) : null,
          )}
        </div>
      ) : (
        <p className="mt-auto text-xs font-medium text-text-quaternary">
          {t('reports.lists.needsPermission', { permission: dataset.permission })}
        </p>
      )}

      {failed ? (
        <p role="alert" className="text-sm font-medium text-warning-700">
          {t('reports.controls.exportFailed')}
        </p>
      ) : null}
    </article>
  )
}
