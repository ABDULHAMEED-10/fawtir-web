import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { FileDropzone, RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  IMPORT_MAX_BYTES,
  checkImport,
  commitImport,
  downloadFailedRows,
  downloadImportTemplate,
  importBatchPath,
  loadImportBatch,
  type ImportBatchDto,
  type ImportBatchRowDto,
  type ImportCommitResultDto,
  type ImportSeverity,
  type ImportTarget,
} from '../../api/counterpartyImport'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatInstant } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { saveDownload } from '../../lib/supplierRecord'
import {
  IMPORT_ROUTES,
  IMPORT_TABS,
  batchBlocker,
  comingIn,
  commitSelection,
  fieldLabel,
  importable,
  initialSelection,
  problemNote,
  rowsInTab,
  tabCount,
  type ImportTabId,
} from '../../lib/stagedImport'
import chevronIcon from '../../assets/invoices/chevron.svg'
import checkIcon from '../../assets/bill-detail/tick.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import stopIcon from '../../assets/suppliers/consequence-stop.svg'
import tickIcon from '../../assets/supplier-credit-notes/act-set.svg'
import uploadIcon from '../../assets/bill-capture/file.svg'

const SEVERITY_ROW: Record<ImportSeverity, string> = {
  READY: 'bg-success-100/40',
  NEEDS_A_LOOK: 'bg-pending-100/50',
  CANNOT_IMPORT: 'bg-[#fdf4f2]',
}

const SEVERITY_CHIP: Record<ImportSeverity, string> = {
  READY: 'bg-success-100 text-[#3d5648]',
  NEEDS_A_LOOK: 'bg-pending-100 text-pending-700',
  CANNOT_IMPORT: 'bg-[#f7e0da] text-warning-700',
}

/**
 * Importing counterparties from a file, for suppliers and for customers alike (E-06).
 *
 * The three steps are the API's own: the file is checked and staged without creating anything, the
 * review keeps or leaves out each row, and the commit brings the kept ones in. Nothing here edits
 * a row — the API stages a verdict and cannot take a correction — so a refused row is fixed in the
 * file and checked again, which is what the failed-rows download is for.
 *
 * The batch id lives in the address, so a reload during the review returns to the same batch
 * rather than to an upload box.
 */
export function StagedImportPage({ target }: { target: ImportTarget }) {
  return (
    <AppShell>
      <StagedImport target={target} />
    </AppShell>
  )
}

function StagedImport({ target }: { target: ImportTarget }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const [params, setParams] = useSearchParams()
  const batchId = params.get('batch')
  const [keep, setKeep] = useState<Set<number>>(new Set())
  const [seeded, setSeeded] = useState<string | null>(null)
  const [tab, setTab] = useState<ImportTabId>('cannotImport')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ key: string; values?: Record<string, string | number> } | { body: string } | null>(null)
  const [result, setResult] = useState<ImportCommitResultDto | null>(null)
  const routes = IMPORT_ROUTES[target]

  const read = useApiRead<ImportBatchDto>(batchId ? importBatchPath(target, batchId) : null, batchId ? () => loadImportBatch(target, batchId) : undefined)
  const batch = read.read.status === 'ready' ? read.read.data : null
  const blocker = useMemo(() => (batch ? batchBlocker(batch, new Date()) : null), [batch])

  if (!can(session, 'customer.import')) {
    return (
      <div className="mx-auto w-full max-w-[1144px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  // The first read of a batch decides what is kept: everything the check would bring in.
  if (batch && seeded !== batch.id) {
    setSeeded(batch.id)
    setKeep(initialSelection(batch))
  }

  const failed = (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice({ body: message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body })
  }

  const upload = async (file: File) => {
    setNotice(null)
    setBusy(true)
    try {
      const checked = await checkImport(target, file)
      setParams({ batch: checked.id }, { replace: true })
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  const template = async () => {
    setNotice(null)
    try {
      saveDownload(await downloadImportTemplate(target), `fawtir-${target.toLowerCase()}-template.csv`)
    } catch (error) {
      failed(error)
    }
  }

  const failedRows = async () => {
    if (!batch) return
    setNotice(null)
    try {
      saveDownload(await downloadFailedRows(target, batch.id), `${target.toLowerCase()}-rows-that-failed.csv`)
    } catch (error) {
      failed(error)
    }
  }

  const bringIn = async () => {
    if (!batch || busy) return
    setNotice(null)
    setBusy(true)
    try {
      setResult(await commitImport(target, batch.id, commitSelection(batch, keep)))
    } catch (error) {
      failed(error)
      read.retry()
    } finally {
      setBusy(false)
    }
  }

  const startOver = () => {
    setResult(null)
    setSeeded(null)
    setParams({}, { replace: true })
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={routes.list} className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700">
            {t(`stagedImport.target.${target}.list`)}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">{t('stagedImport.breadcrumb')}</span>
        </div>
        <h1 className="mt-1 text-[32px] font-medium leading-[1.2] text-text-primary">
          {t(batch && !result ? 'stagedImport.reviewTitle' : `stagedImport.target.${target}.title`)}
        </h1>
        <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
          {t(batch && !result ? 'stagedImport.reviewSubtitle' : `stagedImport.target.${target}.subtitle`)}
        </p>
      </div>
      {batchId ? (
        <button
          type="button"
          onClick={startOver}
          className="inline-flex h-[46px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('stagedImport.startOver')}
        </button>
      ) : null}
    </div>
  )

  const steps = (
    <section className="flex flex-wrap items-center gap-4 rounded-md bg-surface-card px-6 py-4">
      {(['upload', 'check', 'bring'] as const).map((step, index, all) => {
        const done = (step === 'upload' && Boolean(batch)) || (step === 'check' && Boolean(result)) || (step === 'bring' && Boolean(result))
        const current = (step === 'upload' && !batch) || (step === 'check' && Boolean(batch) && !result)
        return (
          <div key={step} className="flex flex-1 items-center gap-4">
            <span className="flex items-center gap-2.5">
              <span
                className={[
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  done ? 'bg-success-700 text-white' : current ? 'bg-primary-700 text-white' : 'bg-surface-background text-text-quaternary',
                ].join(' ')}
              >
                {done ? <img src={tickIcon} alt="" className="size-3.5" /> : index + 1}
              </span>
              <span className={['whitespace-nowrap text-sm font-semibold', current ? 'text-primary-700' : done ? 'text-text-secondary' : 'text-text-quaternary'].join(' ')}>
                {t(`stagedImport.step.${step}`)}
              </span>
            </span>
            {index < all.length - 1 ? <span className="h-px flex-1 bg-border-subtle" /> : null}
          </div>
        )
      })}
    </section>
  )

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
      {header}
      {steps}
      {notice ? <Notice body={'key' in notice ? t(notice.key, notice.values) : notice.body} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

      {result ? (
        <section className="rounded-md bg-surface-card p-6">
          <h2 className="text-xl font-medium leading-[1.2] text-text-primary">{t(`stagedImport.target.${target}.done`, { count: result.created })}</h2>
          <p className="mt-2 text-sm font-medium leading-[1.5] text-text-tertiary">
            {t('stagedImport.doneNote', { selected: result.selected, skipped: result.skipped })}
          </p>
          {result.created < result.selected ? (
            <p className="mt-2 text-sm font-medium leading-[1.5] text-warning-700">{t('stagedImport.doneStale', { count: result.selected - result.created })}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              to={routes.list}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t(`stagedImport.target.${target}.seeThem`)}
            </Link>
            <button
              type="button"
              onClick={startOver}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('stagedImport.another')}
            </button>
          </div>
        </section>
      ) : null}

      {!batchId && !result ? (
        <section className="rounded-md bg-surface-card p-6">
          <FileDropzone
            accept=".csv"
            maxBytes={IMPORT_MAX_BYTES}
            onFiles={(files) => void upload(files[0])}
            onReject={(reason, file) => setNotice({ key: `stagedImport.reject.${reason}`, values: { name: file.name } })}
            className="w-full"
          >
            {({ dragging }) => (
              <div
                className={[
                  'flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-12 text-center transition-colors',
                  dragging ? 'border-primary-700 bg-primary-25' : 'border-border-subtle bg-surface-background/40',
                ].join(' ')}
              >
                <img src={uploadIcon} alt="" className="size-8" />
                <p className="text-base font-semibold text-text-primary">{busy ? t('stagedImport.checking') : t('stagedImport.dropHere')}</p>
                <p className="text-sm font-medium text-text-quaternary">{t('stagedImport.fileRules')}</p>
              </div>
            )}
          </FileDropzone>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void template()}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('stagedImport.downloadTemplate')}
            </button>
            <p className="text-sm font-medium text-text-quaternary">{t('stagedImport.templateNote')}</p>
          </div>
        </section>
      ) : null}

      {batchId && read.read.status === 'loading' ? <LoadingNotice /> : null}
      {batchId && read.read.status === 'failed' ? <ApiReadFailure error={read.read.error} retry={read.retry} /> : null}

      {batch && !result ? (
        <>
          {blocker ? (
            <section className="rounded-sm border border-primary-300 bg-primary-25 p-4">
              <p className="text-sm font-medium leading-[1.5] text-text-secondary">{t(`stagedImport.blocked.${blocker}`)}</p>
            </section>
          ) : null}

          <p className="text-sm font-medium text-text-quaternary">
            {t('stagedImport.fileLine', {
              name: batch.filename ?? t('stagedImport.unnamedFile'),
              count: batch.totalRows,
            })}
            {batch.expiresAt ? ` · ${t('stagedImport.expires', { when: formatInstant(batch.expiresAt, language) })}` : ''}
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard tone="ready" icon={checkIcon} title={t('stagedImport.card.ready')} value={batch.counts.ready} note={t('stagedImport.card.readyNote')} />
            <SummaryCard tone="warning" icon={warnIcon} title={t('stagedImport.card.needsALook')} value={batch.counts.needsALook} note={t('stagedImport.card.needsALookNote')} />
            <SummaryCard tone="blocked" icon={stopIcon} title={t('stagedImport.card.cannotImport')} value={batch.counts.cannotImport} note={t('stagedImport.card.cannotImportNote')} />
          </div>

          <section className="rounded-md bg-surface-card">
            <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
              {IMPORT_TABS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="tab"
                  aria-selected={entry === tab}
                  onClick={() => setTab(entry)}
                  className={[
                    'inline-flex h-[54px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                    entry === tab ? 'border-primary-700 text-primary-700' : 'border-transparent text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(`stagedImport.tab.${entry}`)}
                  <span className={['text-xs font-semibold', entry === tab ? 'text-primary-700' : 'text-text-quaternary'].join(' ')}>{tabCount(batch, entry)}</span>
                </button>
              ))}
            </div>

            <RowsView>
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                    <th className="px-5 py-3 text-start font-semibold">{t('stagedImport.col.bringIn')}</th>
                    {(['row', 'name', 'verdict', 'whatsWrong'] as const).map((key) => (
                      <th key={key} className="px-5 py-3 text-start font-semibold">
                        {t(`stagedImport.col.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowsInTab(batch, tab).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-14 text-center text-sm font-medium text-text-quaternary">
                        {t('stagedImport.nothingHere')}
                      </td>
                    </tr>
                  ) : (
                    rowsInTab(batch, tab).map((row) => (
                      <ImportRow
                        key={row.rowNumber}
                        row={row}
                        kept={keep.has(row.rowNumber)}
                        disabled={blocker !== null}
                        onToggle={() =>
                          setKeep((current) => {
                            const next = new Set(current)
                            if (next.has(row.rowNumber)) next.delete(row.rowNumber)
                            else next.add(row.rowNumber)
                            return next
                          })
                        }
                      />
                    ))
                  )}
                </tbody>
              </table>
            </RowsView>
          </section>

          <div className="fixed bottom-0 end-0 start-0 z-20 border-t border-border-subtle bg-white/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1144px] flex-wrap items-center justify-between gap-3 px-6 py-4">
              <p className="text-sm font-medium text-text-tertiary">
                <span className="font-semibold text-text-primary">{t('stagedImport.wouldComeIn', { coming: comingIn(batch, keep), total: batch.totalRows })}</span>{' '}
                {t('stagedImport.leftOut', { count: batch.totalRows - comingIn(batch, keep) })}
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  to={routes.list}
                  className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('common.cancel')}
                </Link>
                <button
                  type="button"
                  disabled={batch.counts.cannotImport === 0}
                  onClick={() => void failedRows()}
                  className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-40"
                >
                  {t('stagedImport.downloadFailed', { count: batch.counts.cannotImport })}
                </button>
                <button
                  type="button"
                  disabled={busy || blocker !== null || comingIn(batch, keep) === 0}
                  onClick={() => void bringIn()}
                  className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
                >
                  <img src={tickIcon} alt="" className="size-4" />
                  {busy ? t('stagedImport.bringingIn') : t('stagedImport.bringIn', { count: comingIn(batch, keep) })}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function ImportRow({ row, kept, disabled, onToggle }: { row: ImportBatchRowDto; kept: boolean; disabled: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const field = fieldLabel(row.field)
  const note = problemNote(row)
  const canKeep = importable(row)

  return (
    <tr className={['border-b border-surface-background last:border-0', canKeep && !kept ? 'opacity-50' : SEVERITY_ROW[row.severity]].join(' ')}>
      <td className="px-5 py-4 align-top">
        {canKeep ? (
          <input
            type="checkbox"
            checked={kept}
            disabled={disabled}
            onChange={onToggle}
            aria-label={t('stagedImport.bringInRow', { row: row.rowNumber })}
            className="size-4 accent-primary-700"
          />
        ) : (
          <span className="text-xs font-semibold uppercase text-warning-700">{t('stagedImport.leftOutRow')}</span>
        )}
      </td>
      <td className="px-5 py-4 align-top text-sm font-medium text-text-quaternary tabular-nums">{row.rowNumber}</td>
      <td className="px-5 py-4 align-top">
        <p className={['text-sm font-semibold', row.displayName ? 'text-text-primary' : 'text-text-quaternary'].join(' ')}>{row.displayName || t('stagedImport.blank')}</p>
        {field ? <p className="mt-1 text-xs font-medium text-text-quaternary">{'key' in field ? t(field.key) : field.text}</p> : null}
      </td>
      <td className="px-5 py-4 align-top">
        <span className={['inline-flex h-[24px] items-center rounded-sm px-2 text-[11px] font-semibold uppercase tracking-[0.4px]', SEVERITY_CHIP[row.severity]].join(' ')}>
          {t(`stagedImport.severity.${row.severity}`)}
        </span>
      </td>
      <td className="px-5 py-4 align-top">
        {note ? (
          <p className={['flex max-w-[360px] items-start gap-2 text-sm font-medium leading-[1.5]', row.severity === 'CANNOT_IMPORT' ? 'text-warning-700' : 'text-pending-700'].join(' ')}>
            <img src={row.severity === 'CANNOT_IMPORT' ? stopIcon : warnIcon} alt="" className="mt-0.5 size-4 shrink-0" />
            {'key' in note ? t(note.key) : note.text}
          </p>
        ) : (
          <p className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-success-700">
            <img src={checkIcon} alt="" className="mt-0.5 size-4 shrink-0" />
            {t('stagedImport.noProblem')}
          </p>
        )}
      </td>
    </tr>
  )
}

function SummaryCard({ tone, icon, title, value, note }: { tone: 'ready' | 'warning' | 'blocked'; icon: string; title: string; value: number; note: string }) {
  const styles = {
    ready: 'border-[#cfe0d5] bg-[#eef5f0] text-[#3d5648]',
    warning: 'border-pending-200 bg-pending-100 text-pending-700',
    blocked: 'border-[#f0d4ce] bg-[#fdf4f2] text-warning-700',
  }[tone]

  return (
    <article className={['rounded-md border p-5', styles].join(' ')}>
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white">
          <img src={icon} alt="" className="size-4" />
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{title}</h3>
      </div>
      <p className="mt-3 text-[32px] font-semibold leading-[1.2] tabular-nums">{value}</p>
      <p className="mt-2 text-sm font-medium leading-[1.4] text-text-tertiary">{note}</p>
    </article>
  )
}

export function ImportSuppliersPage() {
  return <StagedImportPage target="SUPPLIER" />
}

export function ImportCustomersPage() {
  return <StagedImportPage target="CUSTOMER" />
}
