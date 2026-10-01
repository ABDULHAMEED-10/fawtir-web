import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Combobox, DateField, FileDropzone, Select, type SelectOption } from '../../components/ui'
import { Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import {
  loadSupplierPage,
  supplierListPath,
  type SupplierListRowDto,
} from '../../api/expenditure/suppliers'
import {
  loadSupplierDocuments,
  supplierDocumentsPath,
  uploadSupplierDocument,
  type DocumentKind,
  type SupplierDocumentDto,
} from '../../api/expenditure/supplierRecord'
import { describeApiFailure } from '../../lib/apiFailure'
import { can, useSession } from '../../lib/session/session'
import { formatDate } from '../../lib/format'
import { formatBytes } from '../../lib/documentArchive'
import chevronIcon from '../../assets/invoices/chevron.svg'
import selectChevron from '../../assets/create-invoice/chevron.svg'
import fileIcon from '../../assets/bill-capture/file.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
// A tick, as the frame's Save button draws it (ok-check.svg is a file outline).
import checkIcon from '../../assets/supplier-credit-notes/act-set.svg'
import supplierIcon from '../../assets/documents/rec-contract.svg'

/** The supplier documents endpoint takes at most 10 MiB a file. */
const MAX_BYTES = 10 * 1024 * 1024
const SEARCH_DELAY_MS = 250

const KINDS: DocumentKind[] = ['AGREEMENT', 'CERTIFICATE', 'PRICE_LIST', 'CORRESPONDENCE', 'OTHER']

type Keep = 'forever' | 'matchInvoice' | 'untilDate'
const KEEP_OPTIONS: Keep[] = ['forever', 'matchInvoice', 'untilDate']

type Picked = { id: string; name: string; vatNumber: string | null }

/**
 * Compliance › Documents › Upload a document (Figma 154:140599).
 *
 * The paper is filed with `POST /v1/suppliers/{id}/documents` (`supplier.manage`), the one route
 * that stores a paper of your own, so "Who or what it belongs to" picks a supplier. The name, kind
 * and date go as the API takes them; "Valid until" and the tags ride in the document's note, which
 * is where a person reading it on the supplier's page will find them.
 *
 * TODO(backend): reading the file for a title, a date and a match (ask 3.13), a retention choice
 * (ask 3.14), attaching to a customer, an invoice, an order or a catalogue item, and tags of their
 * own (ask 3.15). Each is drawn and kept in the form; none is sent.
 */
export function UploadDocumentPage() {
  return (
    <AppShell>
      <UploadDocument />
    </AppShell>
  )
}

/** Inside the shell, where the session is: whether the reader may file a paper is read from it. */
function UploadDocument() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const navigate = useNavigate()
  const session = useSession()
  const allowed = can(session, 'supplier.manage')

  const [files, setFiles] = useState<File[]>([])
  const [adding, setAdding] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<DocumentKind>('AGREEMENT')
  const [dateOn, setDateOn] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [supplier, setSupplier] = useState<Picked | null>(null)
  const [attachTo, setAttachTo] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [keep, setKeep] = useState<Keep>('forever')
  const [deleteAfter, setDeleteAfter] = useState('')
  const [errors, setErrors] = useState<{ file?: string; title?: string; supplier?: string }>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const docsPath = supplier ? supplierDocumentsPath(supplier.id) : null
  const onFile = useApiRead<SupplierDocumentDto[]>(docsPath, () =>
    loadSupplierDocuments(supplier!.id),
  )
  const sameSeries =
    onFile.read.status === 'ready' && title.trim()
      ? onFile.read.data.filter((entry) => entry.document.series === title.trim()).length
      : 0

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  const hasFile = files.length > 0

  const kindOptions: SelectOption[] = KINDS.map((value) => ({
    value,
    label: t(`documents.upload.kinds.${value}`),
  }))

  const note = [
    validUntil
      ? t('documents.upload.noteValidUntil', { date: formatDate(validUntil, language) })
      : null,
    tags.length ? t('documents.upload.noteTags', { tags: tags.join(', ') }) : null,
  ]
    .filter(Boolean)
    .join('. ')

  const save = async () => {
    const next: typeof errors = {}
    if (!hasFile) next.file = t('documents.upload.noFile')
    if (!title.trim()) next.title = t('validation.required')
    if (!supplier) next.supplier = t('documents.upload.noOwner')
    setErrors(next)
    setNotice(null)
    if (Object.keys(next).length > 0 || !supplier) return
    setBusy(true)
    try {
      for (const [index, file] of files.entries()) {
        await uploadSupplierDocument(supplier.id, {
          file,
          title: files.length > 1 && index > 0 ? `${title.trim()} (${index + 1})` : title,
          kind,
          // One title is one series, so a later rate card supersedes the one before it.
          series: files.length > 1 ? '' : title,
          documentDate: dateOn,
          note,
        })
      }
      navigate(`/suppliers/${encodeURIComponent(supplier.id)}`)
    } catch (error) {
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setNotice(
        message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1144px] flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/compliance/documents"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {t('documents.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {t('documents.upload.breadcrumb')}
          </span>
        </div>

        <div className="-mt-2">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('documents.upload.title')}
          </h1>
          <p className="mt-2 text-sm font-medium leading-[1.4] text-text-quaternary">
            {/* An upload is kept on the supplier's profile, not in the Peppol archive.
                TODO(backend): uploads in the archive, DOCUMENTS.md row 3.26. */}
            {t('documents.upload.subtitle')}
          </p>
        </div>

        {!allowed ? <Notice body={t('documents.upload.notAllowed')} /> : null}
        {notice ? (
          <Notice
            body={notice}
            action={{ label: t('common.close'), onClick: () => setNotice(null) }}
          />
        ) : null}

        <div className="flex flex-col gap-5 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <StepCard
              step={1}
              title={t('documents.upload.steps.file')}
              action={
                <button
                  type="button"
                  onClick={() => setAdding((value) => !value)}
                  aria-expanded={adding}
                  className="inline-flex h-[36px] items-center gap-2 rounded-sm border border-dashed border-border-default bg-white px-3.5 text-sm font-medium text-text-quaternary transition-colors hover:border-primary-300 hover:text-primary-700"
                >
                  <img src={plusIcon} alt="" className="size-4" />
                  {t('documents.upload.addMore')}
                </button>
              }
            >
              {hasFile ? (
                <ul className="flex flex-col gap-2.5">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-[#cfe0d5] bg-[#e7efe9] p-4"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
                          <img src={fileIcon} alt="" className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="break-all text-base font-medium leading-[1.2] text-text-primary">
                            {file.name}
                          </p>
                          <p className="mt-1.5 text-xs font-medium leading-[1.3] text-text-tertiary">
                            {t('documents.upload.fileMeta', {
                              type: (file.name.split('.').pop() ?? '').toUpperCase(),
                              size: formatBytes(file.size),
                            })}
                          </p>
                        </div>
                      </div>
                      {/* Beside the file, as the frame draws it: the dropzone's full-width button
                          pushed "Replace" onto a line of its own. */}
                      <div className="shrink-0 [&>button]:w-auto">
                        <FileDropzone
                          accept=".pdf,.png,.jpg,.jpeg,.xml"
                          maxBytes={MAX_BYTES}
                          onFiles={(picked) =>
                            setFiles((current) =>
                              current.map((entry, at) => (at === index ? picked[0] : entry)),
                            )
                          }
                          onReject={(reason) =>
                            setRejected(
                              t(
                                reason === 'size'
                                  ? 'documents.upload.tooLarge'
                                  : 'documents.upload.wrongType',
                              ),
                            )
                          }
                        >
                          {() => (
                            <span className="inline-flex h-[40px] shrink-0 cursor-pointer items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-white/70">
                              {t('documents.upload.replace')}
                            </span>
                          )}
                        </FileDropzone>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              {!hasFile || adding ? (
                <div className={hasFile ? 'mt-3' : ''}>
                  <FileDropzone
                    accept=".pdf,.png,.jpg,.jpeg,.xml"
                    multiple
                    maxBytes={MAX_BYTES}
                    onFiles={(picked) => {
                      setRejected(null)
                      setErrors((current) => ({ ...current, file: undefined }))
                      setFiles((current) => [...current, ...picked])
                      if (!title && picked[0])
                        setTitle(picked[0].name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
                      setAdding(false)
                    }}
                    onReject={(reason) =>
                      setRejected(
                        t(
                          reason === 'size'
                            ? 'documents.upload.tooLarge'
                            : 'documents.upload.wrongType',
                        ),
                      )
                    }
                  >
                    {({ dragging }) => (
                      <div
                        className={[
                          'flex flex-col items-center rounded-sm border border-dashed px-6 py-10 text-center transition-colors',
                          dragging
                            ? 'border-primary-700 bg-primary-25'
                            : 'border-border-default bg-white',
                          errors.file ? 'border-border-danger' : '',
                        ].join(' ')}
                      >
                        <span className="flex size-11 items-center justify-center rounded-sm bg-surface-background">
                          <img src={fileIcon} alt="" className="size-5" />
                        </span>
                        <p className="mt-3 text-base font-medium leading-[1.2] text-text-primary">
                          {t('documents.upload.dropTitle')}
                        </p>
                        <p className="mt-1.5 text-sm font-medium leading-[1.3] text-text-quaternary">
                          {t('documents.upload.dropNote')}
                        </p>
                        <span className="mt-4 inline-flex h-[40px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary">
                          {t('documents.upload.choose')}
                        </span>
                      </div>
                    )}
                  </FileDropzone>
                </div>
              ) : null}
              {rejected || errors.file ? (
                <p role="alert" className="mt-2 text-xs font-medium text-text-danger">
                  {rejected ?? errors.file}
                </p>
              ) : null}
            </StepCard>

            <StepCard step={2} title={t('documents.upload.steps.what')}>
              <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <FieldLabel label={t('documents.upload.name')} required />
                  <input
                    value={title}
                    maxLength={200}
                    onChange={(event) => {
                      setTitle(event.target.value)
                      setErrors((current) => ({ ...current, title: undefined }))
                    }}
                    placeholder={t('documents.upload.namePlaceholder')}
                    aria-invalid={Boolean(errors.title)}
                    className={[
                      'h-[46px] rounded-sm border bg-surface-tab-bar px-4 text-base font-medium text-text-secondary outline-none focus:border-primary-700',
                      errors.title ? 'border-border-danger' : 'border-primary-300',
                    ].join(' ')}
                  />
                  {errors.title ? (
                    <span className="text-xs font-medium text-text-danger">{errors.title}</span>
                  ) : null}
                </label>
                <div className="flex flex-col gap-2">
                  <FieldLabel label={t('documents.upload.kind')} required />
                  <Select
                    value={kind}
                    onChange={(value) => setKind(value as DocumentKind)}
                    options={kindOptions}
                    ariaLabel={t('documents.upload.kind')}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <FieldLabel label={t('documents.upload.dateOn')} />
                  <DateField
                    value={dateOn}
                    onChange={setDateOn}
                    ariaLabel={t('documents.upload.dateOn')}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <FieldLabel
                    label={t('documents.upload.validUntil')}
                    optional={t('documents.upload.optional')}
                  />
                  <DateField
                    value={validUntil}
                    onChange={setValidUntil}
                    min={dateOn || undefined}
                    ariaLabel={t('documents.upload.validUntil')}
                  />
                </div>
              </div>
            </StepCard>

            <StepCard step={3} title={t('documents.upload.steps.belongs')}>
              <OwnerPicker
                value={supplier}
                onPick={(picked) => {
                  setSupplier(picked)
                  setErrors((current) => ({ ...current, supplier: undefined }))
                }}
                error={errors.supplier}
              />

              <div className="mt-5 flex flex-col gap-2">
                <FieldLabel
                  label={t('documents.upload.alsoAttach')}
                  optional={t('documents.upload.optional')}
                />
                {/* TODO(backend): attaching a paper to an invoice, an order or an item (ask 3.15). */}
                <Select
                  value={attachTo}
                  onChange={setAttachTo}
                  placeholder={t('documents.upload.alsoAttachPlaceholder')}
                  options={[]}
                  ariaLabel={t('documents.upload.alsoAttach')}
                />
              </div>

              <div className="mt-5">
                <FieldLabel label={t('documents.upload.tags')} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex h-[34px] items-center gap-3 rounded-sm bg-primary-50 ps-3 pe-2.5 text-sm font-medium text-primary-700"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTags((list) => list.filter((entry) => entry !== tag))}
                        aria-label={t('documents.upload.removeTag', { tag })}
                        className="inline-flex size-5 items-center justify-center rounded-full text-base leading-none text-primary-700 hover:bg-white"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {addingTag ? (
                    <input
                      autoFocus
                      value={newTag}
                      onChange={(event) => setNewTag(event.target.value)}
                      onBlur={() => setAddingTag(false)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && newTag.trim()) {
                          event.preventDefault()
                          setTags((list) =>
                            list.includes(newTag.trim()) ? list : [...list, newTag.trim()],
                          )
                          setNewTag('')
                          setAddingTag(false)
                        }
                        if (event.key === 'Escape') setAddingTag(false)
                      }}
                      placeholder={t('documents.upload.newTagPlaceholder')}
                      aria-label={t('documents.upload.newTagPlaceholder')}
                      className="h-[34px] w-[150px] rounded-sm border border-primary-300 bg-white px-3 text-sm font-medium text-text-secondary outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingTag(true)}
                      className="inline-flex h-[34px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-tertiary transition-colors hover:border-primary-300 hover:text-primary-700"
                    >
                      <img src={plusIcon} alt="" className="size-3.5" />
                      {t('documents.upload.addTag')}
                    </button>
                  )}
                </div>
              </div>
            </StepCard>
          </div>

          <aside className="flex w-full flex-col gap-5 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-6">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('documents.upload.keepTitle')}
              </h2>
              {/* TODO(backend): a retention choice on an uploaded paper (ask 3.14); kept in the form. */}
              <div
                className="mt-4 flex flex-col gap-2.5"
                role="radiogroup"
                aria-label={t('documents.upload.keepTitle')}
              >
                {KEEP_OPTIONS.map((option) => {
                  const on = keep === option
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setKeep(option)}
                      className={[
                        'flex items-start gap-3 rounded-sm border p-4 text-start transition-colors',
                        on
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:border-primary-300',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                          on ? 'border-primary-700' : 'border-border-default',
                        ].join(' ')}
                      >
                        {on ? <span className="size-2.5 rounded-full bg-primary-700" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 leading-[1.35]">
                        <span className="text-sm font-medium text-text-primary">
                          {t(`documents.upload.keep.${option}`)}
                        </span>{' '}
                        <span className="text-xs font-medium text-text-quaternary">
                          {t(`documents.upload.keep.${option}Note`)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {keep === 'untilDate' ? (
                <div className="mt-3 flex flex-col gap-2">
                  <FieldLabel label={t('documents.upload.keep.pickDate')} />
                  <DateField
                    value={deleteAfter}
                    onChange={setDeleteAfter}
                    min={dateOn || undefined}
                    ariaLabel={t('documents.upload.keep.pickDate')}
                  />
                </div>
              ) : null}
            </section>

            <section className="rounded-md bg-surface-card p-6">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('documents.upload.onSaveTitle')}
              </h2>
              <dl className="mt-3 flex flex-col">
                {[
                  [t('documents.upload.onSave.fingerprint'), t('documents.upload.onSave.yes')],
                  [
                    t('documents.upload.onSave.version'),
                    supplier && title.trim() && files.length === 1
                      ? t('documents.upload.onSave.versionValue', {
                          current: sameSeries + 1,
                          total: sameSeries + 1,
                        })
                      : t('documents.upload.onSave.first'),
                  ],
                  [
                    t('documents.upload.onSave.showsOn'),
                    supplier
                      ? t('documents.upload.onSave.supplierProfile')
                      : t('documents.upload.onSave.nothingYet'),
                  ],
                  [
                    t('documents.upload.onSave.searchableBy'),
                    t('documents.upload.onSave.searchableValue'),
                  ],
                  [
                    t('documents.upload.onSave.spaceUsed'),
                    hasFile ? formatBytes(totalBytes) : t('documents.upload.onSave.nothingYet'),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">
                      {label}
                    </dt>
                    <dd className="text-end text-sm font-medium text-text-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </aside>
        </div>

        <div className="sticky bottom-0 -mx-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3 md:-mx-6 md:px-6">
          <p className="text-sm font-medium text-text-secondary">
            {hasFile
              ? `${t('documents.upload.fileCount', { count: files.length })} · ${formatBytes(totalBytes)}`
              : t('documents.upload.noFileYet')}
          </p>
          <div className="flex items-center gap-2.5">
            <Link
              to="/compliance/documents"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-base font-medium text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('common.cancel')}
            </Link>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !allowed}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-base font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              <img src={checkIcon} alt="" className="size-5 brightness-0 invert" />
              {busy ? t('documents.upload.saving') : t('documents.upload.save')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function StepCard({
  step,
  title,
  action,
  children,
}: {
  step: number
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-xs font-medium text-primary-700">
            {step}
          </span>
          <h2 className="text-xl font-medium leading-[1.2] text-text-primary">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function FieldLabel({
  label,
  required,
  optional,
}: {
  label: string
  required?: boolean
  optional?: string
}) {
  return (
    <span className="flex items-center gap-1 text-sm font-medium leading-[1.2] text-text-tertiary">
      {label}
      {required ? <span className="text-primary-700">*</span> : null}
      {optional ? <span className="text-text-quaternary">{optional}</span> : null}
    </span>
  )
}

/** The supplier the paper is filed against, searched on the server (`supplier.read`). */
function OwnerPicker({
  value,
  onPick,
  error,
}: {
  value: Picked | null
  onPick: (picked: Picked) => void
  error?: string
}) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)

  useEffect(() => {
    if (typed === null) return
    const timer = window.setTimeout(() => setQuery(typed), typed === '' ? 0 : SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed])

  const path =
    query === null
      ? null
      : supplierListPath({ filter: 'ACTIVE', q: query, sort: 'NAME', page: 0, pageSize: 20 })
  const found = useApiRead<Page<SupplierListRowDto>>(path, () => loadSupplierPage(path!))
  const rows = found.read.status === 'ready' ? found.read.data.items : []
  const options: SelectOption[] = rows.map((row) => ({
    value: row.id,
    label: row.displayName,
    hint: row.vatNumber ? t('documents.upload.supplierVat', { vat: row.vatNumber }) : undefined,
  }))
  const emptyText =
    found.read.status === 'failed'
      ? t(describeApiFailure(found.read.error).key)
      : found.read.status === 'loading' || query === null
        ? t('documents.upload.searching')
        : t('documents.upload.noSupplier')

  return (
    <div className="flex flex-col gap-1.5">
      <Combobox
        value={value?.id ?? ''}
        onChange={(id) => {
          const row = rows.find((candidate) => candidate.id === id)
          if (row) onPick({ id: row.id, name: row.displayName, vatNumber: row.vatNumber })
        }}
        options={options}
        onSearch={setTyped}
        searchPlaceholder={t('documents.upload.searchSupplier')}
        ariaLabel={t('documents.upload.steps.belongs')}
        emptyText={emptyText}
        renderTrigger={({ open }) => (
          <span
            className={[
              'flex w-full flex-wrap items-center justify-between gap-4 rounded-sm border p-4 text-start',
              value
                ? 'border-primary-300 bg-primary-25'
                : 'border-dashed border-border-default bg-white',
              error ? 'border-border-danger' : '',
            ].join(' ')}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white">
                <img src={supplierIcon} alt="" className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-medium leading-[1.2] text-text-primary">
                  {value ? value.name : t('documents.upload.chooseOwner')}
                </span>
                <span className="mt-1 block text-xs font-medium leading-[1.3] text-text-tertiary">
                  {value
                    ? value.vatNumber
                      ? t('documents.upload.ownerNoteVat', { vat: value.vatNumber })
                      : t('documents.upload.ownerNote')
                    : t('documents.upload.chooseOwnerNote')}
                </span>
              </span>
            </span>
            <span className="inline-flex h-[40px] shrink-0 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary">
              {value ? t('documents.upload.change') : t('documents.upload.choose')}
              {value ? null : (
                <img
                  src={selectChevron}
                  alt=""
                  className={['size-4', open ? '-rotate-90' : 'rotate-90'].join(' ')}
                />
              )}
            </span>
          </span>
        )}
      />
      {error ? (
        <p role="alert" className="text-xs font-medium text-text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
