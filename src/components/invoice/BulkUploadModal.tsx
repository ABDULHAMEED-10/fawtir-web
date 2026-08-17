import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileDropzone } from '../ui'
import { formatFileSize } from '../../lib/files'
import closeIcon from '../../assets/add-customer/close.svg'
import uploadIcon from '../../assets/invoices/bulk-upload.svg'

type Phase = 'pick' | 'working' | 'done'

/** One accepted file plus the outcome the importer reported for it. */
type Entry = {
  file: File
  status: 'queued' | 'imported' | 'failed'
  message?: string
}

const ACCEPT = '.csv,.xlsx,.xls,.xml,.pdf'
const MAX_BYTES = 20 * 1024 * 1024

/**
 * Bulk import of invoices from a spreadsheet or a folder of UBL/PDF documents.
 *
 * Nothing is created until "Import" is pressed, and the result list stays on screen afterwards
 * so a partial import is visible rather than silent. The upload itself is the one seam the
 * backend has to fill: `POST /api/v1/invoice-imports` multipart, returning per-file results.
 */
export function BulkUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('pick')
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState<string>()

  if (!open) return null

  const reset = () => {
    setPhase('pick')
    setEntries([])
    setError(undefined)
  }

  const close = () => {
    reset()
    onClose()
  }

  const addFiles = (files: File[]) => {
    setError(undefined)
    setEntries((current) => [
      ...current,
      ...files
        .filter((file) => !current.some((entry) => entry.file.name === file.name))
        .map((file) => ({ file, status: 'queued' as const })),
    ])
  }

  const runImport = async () => {
    setPhase('working')
    // Stands in for the upload; the shape of the response is what matters to the caller.
    await new Promise((resolve) => setTimeout(resolve, 900))
    setEntries((current) =>
      current.map((entry) =>
        entry.file.size === 0
          ? { ...entry, status: 'failed' as const, message: t('invoicesPage.bulk.emptyFile') }
          : { ...entry, status: 'imported' as const },
      ),
    )
    setPhase('done')
  }

  const importedCount = entries.filter((entry) => entry.status === 'imported').length
  const failedCount = entries.filter((entry) => entry.status === 'failed').length

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('invoicesPage.bulk.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-md bg-white shadow-card">
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t('invoicesPage.bulk.title')}
            </h2>
            <p className="mt-1 text-sm font-medium leading-[1.3] text-text-quaternary">
              {t('invoicesPage.bulk.subtitle')}
            </p>
          </div>
          <button type="button" onClick={close} aria-label={t('common.close')}>
            <img src={closeIcon} alt="" className="size-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <FileDropzone
            accept={ACCEPT}
            multiple
            maxBytes={MAX_BYTES}
            onFiles={addFiles}
            onReject={(reason, file) =>
              setError(
                reason === 'size'
                  ? t('invoicesPage.bulk.tooLarge', { name: file.name })
                  : t('invoicesPage.bulk.wrongType', { name: file.name }),
              )
            }
          >
            {({ dragging }) => (
              <div
                className={[
                  'flex flex-col items-center gap-2 rounded-sm border border-dashed px-6 py-8 text-center transition-colors',
                  dragging
                    ? 'border-primary-700 bg-primary-25'
                    : 'border-border-default bg-surface-tab-bar',
                ].join(' ')}
              >
                <img src={uploadIcon} alt="" className="size-8" />
                <p className="text-sm font-semibold text-text-secondary">
                  {t('invoicesPage.bulk.dropHere')}
                </p>
                <p className="text-xs font-medium text-text-quaternary">
                  {t('invoicesPage.bulk.formats')}
                </p>
              </div>
            )}
          </FileDropzone>

          {error ? (
            <p className="mt-3 text-xs font-medium text-danger-700" role="alert">
              {error}
            </p>
          ) : null}

          {entries.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {entries.map((entry) => (
                <li
                  key={entry.file.name}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-3 py-2.5"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-text-secondary">
                      {entry.file.name}
                    </span>
                    <span className="text-xs font-medium text-text-quaternary">
                      {formatFileSize(entry.file.size)}
                      {entry.message ? ` · ${entry.message}` : ''}
                    </span>
                  </span>
                  {entry.status === 'queued' ? (
                    <button
                      type="button"
                      onClick={() =>
                        setEntries((current) =>
                          current.filter((item) => item.file.name !== entry.file.name),
                        )
                      }
                      aria-label={t('invoicesPage.bulk.remove', { name: entry.file.name })}
                      className="shrink-0"
                    >
                      <img src={closeIcon} alt="" className="size-5" />
                    </button>
                  ) : (
                    <span
                      className={[
                        'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                        entry.status === 'imported'
                          ? 'bg-success-100 text-success-700'
                          : 'bg-danger-100 text-danger-700',
                      ].join(' ')}
                    >
                      {entry.status === 'imported'
                        ? t('invoicesPage.bulk.imported')
                        : t('invoicesPage.bulk.failed')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {phase === 'done' ? (
            <p className="mt-4 text-sm font-medium text-text-secondary">
              {t('invoicesPage.bulk.summary', { imported: importedCount, failed: failedCount })}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border-subtle px-6 py-4">
          <button
            type="button"
            onClick={close}
            className="h-[46px] rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
          >
            {phase === 'done' ? t('common.close') : t('common.cancel')}
          </button>
          {phase !== 'done' ? (
            <button
              type="button"
              disabled={entries.length === 0 || phase === 'working'}
              onClick={runImport}
              className="h-[46px] rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === 'working'
                ? t('invoicesPage.bulk.importing')
                : t('invoicesPage.bulk.import', { count: entries.length })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
