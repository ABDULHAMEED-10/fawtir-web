import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileDropzone, Modal, OmAmount } from '../ui'
import { Notice } from '../feedback/ApiNotice'
import { ClassificationField } from './ClassificationField'
import {
  IMPORT_INSTANT_ROWS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  cancelInvoiceImport,
  checkInvoiceImport,
  commitInvoiceImport,
  downloadImportReport,
  downloadInvoiceTemplate,
  loadInvoiceImport,
  type ImportKind,
  type InvoiceImportBatchDto,
} from '../../api/invoices/import'
import {
  IMPORT_KINDS,
  IMPORT_STEPS,
  allClassified,
  classificationAnswers,
  classificationKey,
  importProgress,
  importStepOf,
  isImportWorking,
  missingImportPermission,
} from '../../lib/invoiceImport'
import { describeApiFailure, isNotFound } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatInstant } from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
import { can, useSession } from '../../lib/session/session'
import bulkUploadIcon from '../../assets/invoices/bulk-upload.svg'
import businessIcon from '../../assets/create-invoice/business.svg'
import consumerIcon from '../../assets/create-invoice/consumer.svg'
import governmentIcon from '../../assets/create-invoice/government.svg'
import uploadIcon from '../../assets/bill-capture/file.svg'
import tickIcon from '../../assets/supplier-credit-notes/act-set.svg'

/** How often a background check or creation is read again. */
const POLL_MS = 1500

const KIND_ICONS: Record<ImportKind, string> = {
  BUSINESS: businessIcon,
  CONSUMER: consumerIcon,
  GOVERNMENT: governmentIcon,
}

const OUTLINE =
  'inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50'
const PRIMARY =
  'inline-flex h-[46px] items-center justify-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:bg-primary-200'

/**
 * Bulk upload of income invoices: prepare, validate, preview, result, in one dialog (the approved
 * Invoice Import guide, 28 Sep 2026). A file with one invoice in it is the single case; the dialog
 * never asks which. Everything lands as a draft, and the whole file is taken or none of it.
 *
 * No Figma frame: the owner approved building it on the existing theme and components (handbook,
 * "Figma exceptions"). The routes are TODO(backend), see `src/api/invoices/import.ts`.
 */
export function InvoiceImportModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  /** Drafts were created: the list behind should read again. */
  onCreated: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const [kind, setKind] = useState<ImportKind>('BUSINESS')
  const [batch, setBatch] = useState<InvoiceImportBatchDto | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const step = importStepOf(batch)
  const working = isImportWorking(batch)
  const missing = missingImportPermission(kind, (code) => can(session, code))

  // A background check or creation is read again until it settles.
  const batchId = batch?.id
  useEffect(() => {
    if (!working || !batchId) return
    const timer = window.setTimeout(async () => {
      try {
        const next = await loadInvoiceImport(batchId)
        setBatch(next)
        if (next.state === 'CREATED') onCreated()
      } catch (error) {
        setNotice(failureText(error))
      }
    }, POLL_MS)
    return () => window.clearTimeout(timer)
    // `batch` changes on every read, which re-arms the timer.
  }, [batch, batchId, working]) // eslint-disable-line react-hooks/exhaustive-deps

  const failureText = (error: unknown): string => {
    if (isNotFound(error)) return t('invoiceImport.unavailable')
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    return message.reference
      ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
      : body
  }

  const reset = () => {
    setBatch(null)
    setChosen({})
    setNotice(null)
    setBusy(false)
  }

  const close = () => {
    // A background job keeps running on the server; only the view is closed.
    reset()
    onClose()
  }

  const template = async () => {
    setNotice(null)
    try {
      saveDownload(
        await downloadInvoiceTemplate(kind, language),
        `fawtir-${kind.toLowerCase()}-invoices-template.xlsx`,
      )
    } catch (error) {
      setNotice(failureText(error))
    }
  }

  const upload = async (file: File) => {
    if (missing || busy) return
    setNotice(null)
    setBusy(true)
    try {
      setChosen({})
      setBatch(await checkInvoiceImport(kind, file, language))
    } catch (error) {
      setNotice(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!batch || busy) return
    setNotice(null)
    setBusy(true)
    try {
      const next = await commitInvoiceImport(
        batch.id,
        classificationAnswers(batch.unresolved, chosen),
      )
      setBatch(next)
      if (next.state === 'CREATED') onCreated()
    } catch (error) {
      setNotice(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (batch && batch.state === 'CHECKED') {
      try {
        await cancelInvoiceImport(batch.id)
      } catch {
        // Nothing was created; an unchecked batch expires on the server by itself.
      }
    }
    close()
  }

  const report = async () => {
    if (!batch) return
    setNotice(null)
    try {
      saveDownload(await downloadImportReport(batch.id), `invoice-import-${batch.id}.xlsx`)
    } catch (error) {
      setNotice(failureText(error))
    }
  }

  const amount = (value: number) => (
    <OmAmount amount={formatAmount(value, 'OMR', language)} size="xs" className="justify-end" />
  )

  const footer =
    step === 'prepare' ? (
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" onClick={close} className={OUTLINE}>
          {t('common.close')}
        </button>
      </div>
    ) : step === 'validate' && !working ? (
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" onClick={() => void cancel()} className={OUTLINE}>
          {t('invoiceImport.cancel')}
        </button>
        <button type="button" onClick={reset} className={PRIMARY}>
          {t('invoiceImport.uploadCorrected')}
        </button>
      </div>
    ) : step === 'preview' && batch && !working ? (
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" onClick={() => void cancel()} className={OUTLINE}>
          {t('invoiceImport.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy || !allClassified(batch.unresolved, chosen)}
          className={PRIMARY}
        >
          {t('invoiceImport.create', { count: batch.summary?.invoices ?? 0 })}
        </button>
      </div>
    ) : step === 'result' ? (
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" onClick={() => void report()} className={OUTLINE}>
          {t('invoiceImport.downloadReport')}
        </button>
        <Link to="/invoices?tab=drafts" onClick={close} className={PRIMARY}>
          {t('invoiceImport.seeDrafts')}
        </Link>
      </div>
    ) : working && (batch?.totalRows ?? 0) > IMPORT_INSTANT_ROWS ? (
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" onClick={close} className={OUTLINE}>
          {t('invoiceImport.closeWhileWorking')}
        </button>
      </div>
    ) : undefined

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('invoiceImport.title')}
      subtitle={t('invoiceImport.subtitle')}
      icon={bulkUploadIcon}
      width={760}
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        <ol
          className="flex flex-wrap items-center gap-x-3 gap-y-2"
          aria-label={t('invoiceImport.stepsLabel')}
        >
          {IMPORT_STEPS.map((entry, index) => {
            const at = IMPORT_STEPS.indexOf(step)
            const done = index < at || (entry === 'result' && step === 'result')
            const current = index === at && !done
            return (
              <li
                key={entry}
                aria-current={current ? 'step' : undefined}
                className="flex items-center gap-2"
              >
                <span
                  className={[
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    done
                      ? 'bg-success-700 text-white'
                      : current
                        ? 'bg-primary-700 text-white'
                        : 'bg-surface-background text-text-quaternary',
                  ].join(' ')}
                >
                  {done ? <img src={tickIcon} alt="" className="size-3" /> : index + 1}
                </span>
                <span
                  className={[
                    'text-sm font-semibold',
                    current
                      ? 'text-primary-700'
                      : done
                        ? 'text-text-secondary'
                        : 'text-text-quaternary',
                  ].join(' ')}
                >
                  {t(`invoiceImport.step.${entry}`)}
                </span>
              </li>
            )
          })}
        </ol>

        {notice ? (
          <Notice
            body={notice}
            action={{ label: t('common.close'), onClick: () => setNotice(null) }}
          />
        ) : null}

        {step === 'prepare' ? (
          <>
            <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('invoiceImport.guidance', {
                rows: formatCount(IMPORT_MAX_ROWS, language),
                size: formatCount(IMPORT_MAX_BYTES / (1024 * 1024), language),
              })}
            </p>

            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-2.5 text-sm font-semibold text-text-primary">
                {t('invoiceImport.kindLabel')}
              </legend>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {IMPORT_KINDS.map((entry) => {
                  const active = entry === kind
                  return (
                    <button
                      key={entry}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setKind(entry)}
                      className={[
                        'flex items-center gap-3 rounded-sm border p-3 text-start transition-colors',
                        active
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:bg-primary-25',
                      ].join(' ')}
                    >
                      <img src={KIND_ICONS[entry]} alt="" className="size-8 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-text-primary">
                          {t(`invoiceImport.kind.${entry}`)}
                        </span>
                        <span className="block text-xs font-medium leading-[1.4] text-text-quaternary">
                          {t(`invoiceImport.kindNote.${entry}`)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void template()} className={OUTLINE}>
                {t('invoiceImport.downloadTemplate', { kind: t(`invoiceImport.kind.${kind}`) })}
              </button>
              <p className="text-xs font-medium text-text-quaternary">
                {t('invoiceImport.templateNote')}
              </p>
            </div>

            {missing ? (
              <p
                role="alert"
                className="rounded-sm bg-warning-100 p-3 text-sm font-medium leading-[1.5] text-warning-700"
              >
                {t('invoiceImport.missingPermission', {
                  permission: t(`invoiceImport.permission.${missing.replace('.', '_')}`),
                })}
              </p>
            ) : (
              <FileDropzone
                accept=".xlsx"
                maxBytes={IMPORT_MAX_BYTES}
                onFiles={(files) => void upload(files[0])}
                onReject={(reason, file) =>
                  setNotice(t(`invoiceImport.reject.${reason}`, { name: file.name }))
                }
              >
                {({ dragging }) => (
                  <div
                    className={[
                      'flex flex-col items-center gap-2.5 rounded-md border border-dashed px-6 py-10 text-center transition-colors',
                      dragging
                        ? 'border-primary-700 bg-primary-25'
                        : 'border-border-subtle bg-surface-background/40',
                    ].join(' ')}
                  >
                    <img src={uploadIcon} alt="" className="size-8" />
                    <p className="text-base font-semibold text-text-primary">
                      {busy ? t('invoiceImport.checking') : t('invoiceImport.dropHere')}
                    </p>
                    <p className="text-sm font-medium text-text-quaternary">
                      {t('invoiceImport.fileRules', {
                        rows: formatCount(IMPORT_MAX_ROWS, language),
                        size: formatCount(IMPORT_MAX_BYTES / (1024 * 1024), language),
                      })}
                    </p>
                  </div>
                )}
              </FileDropzone>
            )}
          </>
        ) : null}

        {batch && working ? (
          <section className="flex flex-col gap-2.5" aria-live="polite">
            <p className="text-sm font-semibold text-text-primary">
              {t(
                batch.state === 'CHECKING'
                  ? 'invoiceImport.progressChecking'
                  : 'invoiceImport.progressCreating',
                {
                  done: formatCount(batch.processedRows, language),
                  total: formatCount(batch.totalRows, language),
                },
              )}
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={importProgress(batch)}
              className="h-2 overflow-hidden rounded-full bg-surface-background"
            >
              <div
                className="h-full rounded-full bg-primary-700 transition-[width]"
                style={{ width: `${importProgress(batch)}%` }}
              />
            </div>
            {batch.totalRows > IMPORT_INSTANT_ROWS ? (
              <p className="text-xs font-medium text-text-quaternary">
                {t('invoiceImport.backgroundNote')}
              </p>
            ) : null}
          </section>
        ) : null}

        {batch && !working && batch.duplicateOf && step !== 'result' ? (
          <p className="rounded-sm bg-warning-100 p-3 text-sm font-medium leading-[1.5] text-warning-700">
            {t('invoiceImport.duplicate', {
              who: batch.duplicateOf.uploadedBy,
              when: formatInstant(batch.duplicateOf.uploadedAt, language),
            })}
          </p>
        ) : null}

        {batch && step === 'validate' && !working ? (
          <section className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-danger-700">
              {t('invoiceImport.errorsTitle', {
                count: batch.errors.length,
                name: batch.filename ?? t('invoiceImport.unnamedFile'),
              })}
            </p>
            <p className="text-sm font-medium text-text-tertiary">
              {t('invoiceImport.errorsNote')}
            </p>
            <div className="overflow-x-auto rounded-sm border border-border-subtle">
              <table className="w-full sm:min-w-[480px] text-sm">
                <thead className="bg-surface-background text-start text-xs font-semibold text-text-tertiary">
                  <tr>
                    <th scope="col" className="w-10 px-2 sm:w-16 sm:px-3 py-2 text-start">
                      {t('invoiceImport.col.row')}
                    </th>
                    <th scope="col" className="w-24 px-2 sm:w-36 sm:px-3 py-2 text-start">
                      {t('invoiceImport.col.column')}
                    </th>
                    <th scope="col" className="px-2 py-2 sm:px-3 text-start">
                      {t('invoiceImport.col.message')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batch.errors.map((error, index) => (
                    <tr key={index} className="border-t border-border-subtle align-top">
                      <td className="px-2 py-2 sm:px-3 font-medium tabular-nums text-text-secondary">
                        {formatCount(error.rowNumber, language)}
                      </td>
                      <td className="px-2 py-2 sm:px-3 font-medium text-text-secondary">
                        {error.column}
                      </td>
                      <td className="px-2 py-2 sm:px-3 font-medium break-words text-text-primary">
                        {error.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {batch && step === 'preview' && !working && batch.summary ? (
          <section className="flex flex-col gap-4">
            <div className="grid gap-2.5 sm:grid-cols-3">
              <Figure label={t('invoiceImport.preview.invoices')}>
                {formatCount(batch.summary.invoices, language)}
              </Figure>
              <Figure label={t('invoiceImport.preview.lines')}>
                {formatCount(batch.summary.lines, language)}
              </Figure>
              <Figure label={t('invoiceImport.preview.total')}>
                {amount(batch.summary.total)}
              </Figure>
            </div>

            <div className="overflow-x-auto rounded-sm border border-border-subtle">
              <table className="w-full sm:min-w-[420px] text-sm">
                <thead className="bg-surface-background text-xs font-semibold text-text-tertiary">
                  <tr>
                    <th scope="col" className="px-2 py-2 sm:px-3 text-start">
                      {t('invoiceImport.col.customer')}
                    </th>
                    <th scope="col" className="w-16 px-2 sm:w-24 sm:px-3 py-2 text-end">
                      {t('invoiceImport.col.invoices')}
                    </th>
                    <th scope="col" className="w-28 px-2 sm:w-40 sm:px-3 py-2 text-end">
                      {t('invoiceImport.col.total')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batch.summary.byCustomer.map((row) => (
                    <tr key={row.customerName} className="border-t border-border-subtle">
                      <td className="px-2 py-2 sm:px-3 font-medium break-words text-text-primary">
                        {row.customerName}
                      </td>
                      <td className="px-2 py-2 sm:px-3 text-end font-medium tabular-nums text-text-secondary">
                        {formatCount(row.invoices, language)}
                      </td>
                      <td className="px-2 py-2 sm:px-3 text-end font-medium tabular-nums text-text-secondary">
                        {amount(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {batch.inferred.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('invoiceImport.preview.inferredTitle')}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {batch.inferred.map((item, index) => (
                    <li
                      key={index}
                      className="text-sm font-medium leading-[1.5] text-text-tertiary"
                    >
                      {t('invoiceImport.preview.inferred', {
                        rows: item.rowNumbers.map((row) => formatCount(row, language)).join(', '),
                        column: item.column,
                        value: item.value,
                        match: item.matchedTo,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {batch.unresolved.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('invoiceImport.preview.classifyTitle', { count: batch.unresolved.length })}
                </h3>
                <p className="text-sm font-medium text-text-tertiary">
                  {t('invoiceImport.preview.classifyNote')}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {batch.unresolved.map((item) => {
                    const key = classificationKey(item)
                    const goods = item.itemType === 'GOODS'
                    return (
                      <li
                        key={key}
                        className="grid items-center gap-2 rounded-sm border border-border-subtle p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
                      >
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-semibold text-text-primary">
                            {item.description}
                          </span>
                          <span className="block text-xs font-medium text-text-quaternary">
                            {t(
                              goods
                                ? 'invoiceImport.preview.goodsRows'
                                : 'invoiceImport.preview.serviceRows',
                              {
                                count: item.rowCount,
                              },
                            )}
                          </span>
                        </span>
                        <ClassificationField
                          kind={goods ? 'goods' : 'service'}
                          value={chosen[key] ?? ''}
                          onChange={(code) => setChosen((current) => ({ ...current, [key]: code }))}
                          ariaLabel={t(
                            goods ? 'classification.hsCode' : 'classification.serviceType',
                          )}
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            <p className="text-xs font-medium text-text-quaternary">
              {t('invoiceImport.preview.draftsOnly')}
            </p>
          </section>
        ) : null}

        {batch && step === 'result' ? (
          <section className="flex flex-col gap-3">
            <h3 className="text-base font-semibold text-text-primary">
              {batch.state === 'CANCELLED'
                ? t('invoiceImport.cancelled')
                : t('invoiceImport.createdTitle', { count: batch.created.length })}
            </h3>
            {batch.state === 'CREATED' ? (
              <>
                <p className="text-sm font-medium text-text-tertiary">
                  {t('invoiceImport.createdNote')}
                </p>
                <div className="overflow-x-auto rounded-sm border border-border-subtle">
                  <table className="w-full sm:min-w-[520px] text-sm">
                    <thead className="bg-surface-background text-xs font-semibold text-text-tertiary">
                      <tr>
                        <th scope="col" className="px-2 py-2 sm:px-3 text-start">
                          {t('invoiceImport.col.reference')}
                        </th>
                        <th scope="col" className="px-2 py-2 sm:px-3 text-start">
                          {t('invoiceImport.col.draft')}
                        </th>
                        <th scope="col" className="px-2 py-2 sm:px-3 text-start">
                          {t('invoiceImport.col.customer')}
                        </th>
                        <th scope="col" className="w-24 px-2 sm:w-36 sm:px-3 py-2 text-end">
                          {t('invoiceImport.col.total')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.created.map((row) => (
                        <tr key={row.invoiceId} className="border-t border-border-subtle">
                          <td className="px-2 py-2 sm:px-3 font-medium text-text-secondary">
                            {row.reference}
                          </td>
                          <td className="px-2 py-2 sm:px-3 font-medium">
                            <Link
                              to={`/invoices/${encodeURIComponent(row.invoiceId)}/edit`}
                              onClick={close}
                              className="text-primary-700 hover:underline"
                            >
                              {row.draftNumber ?? t('invoiceImport.openDraft')}
                            </Link>
                          </td>
                          <td className="px-2 py-2 sm:px-3 font-medium break-words text-text-primary">
                            {row.customerName}
                          </td>
                          <td className="px-2 py-2 sm:px-3 text-end font-medium tabular-nums text-text-secondary">
                            {amount(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </Modal>
  )
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-sm border border-border-subtle p-3">
      <p className="text-xs font-medium text-text-quaternary">{label}</p>
      <div className="mt-1 text-lg font-semibold tabular-nums text-text-primary">{children}</div>
    </div>
  )
}
