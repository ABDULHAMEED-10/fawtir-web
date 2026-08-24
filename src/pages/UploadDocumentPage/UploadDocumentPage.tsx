import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, FileDropzone, Select } from '../../components/ui'
import { formatSize } from '../../lib/documents'
import chevronIcon from '../../assets/invoices/chevron.svg'
import fileIcon from '../../assets/bill-capture/file.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import supplierIcon from '../../assets/documents/rec-contract.svg'

/** What the reader found on the file it was given, before anyone edits it. */
const READ = {
  name: 'GCL-rate-card-Aug-2026.pdf',
  pages: 3,
  kb: 412,
  title: 'Gulf Cold Logistics — rate card',
  kind: 'contract',
  dateOn: '2026-08-01',
  validUntil: '2027-07-31',
  belongsTo: 'Gulf Cold Logistics',
  tags: ['Contract', 'Rate card'],
  /** This supplier already has two rate cards on file. */
  version: 3,
}

type Keep = 'forever' | 'matchInvoice' | 'untilDate'

function StepCard({
  step,
  title,
  action,
  children,
}: {
  step: number
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-xs font-semibold text-primary-700">
            {step}
          </span>
          <h2 className="text-xl font-medium leading-[1.2] text-text-primary">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
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
    <span className="flex items-center gap-1 text-sm font-medium leading-[1.2] text-text-primary">
      {label}
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      {optional ? <span className="text-text-quaternary">{optional}</span> : null}
    </span>
  )
}

export function UploadDocumentPage() {
  const { t } = useTranslation()

  const [files, setFiles] = useState<{ id: string; name: string; pages: number; kb: number }[]>([
    { id: 'f1', name: READ.name, pages: READ.pages, kb: READ.kb },
  ])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState(READ.title)
  const [kind, setKind] = useState(READ.kind)
  const [dateOn, setDateOn] = useState(READ.dateOn)
  const [validUntil, setValidUntil] = useState(READ.validUntil)
  const [attachTo, setAttachTo] = useState('')
  const [tags, setTags] = useState(READ.tags)
  const [newTag, setNewTag] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [keep, setKeep] = useState<Keep>('forever')
  const [deleteAfter, setDeleteAfter] = useState('')

  const totalKb = files.reduce((sum, file) => sum + file.kb, 0)
  const hasFile = files.length > 0

  const KINDS = [
    { value: 'contract', label: t('documents.upload.kinds.contract') },
    { value: 'deliveryNote', label: t('documents.upload.kinds.deliveryNote') },
    { value: 'warranty', label: t('documents.upload.kinds.warranty') },
    { value: 'letter', label: t('documents.upload.kinds.letter') },
    { value: 'other', label: t('documents.upload.kinds.other') },
  ]

  const KEEP_OPTIONS: { id: Keep; titleKey: string; noteKey: string }[] = [
    {
      id: 'forever',
      titleKey: 'documents.upload.keep.forever',
      noteKey: 'documents.upload.keep.foreverNote',
    },
    {
      id: 'matchInvoice',
      titleKey: 'documents.upload.keep.matchInvoice',
      noteKey: 'documents.upload.keep.matchInvoiceNote',
    },
    {
      id: 'untilDate',
      titleKey: 'documents.upload.keep.untilDate',
      noteKey: 'documents.upload.keep.untilDateNote',
    },
  ]

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
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
          <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">
            {t('documents.upload.subtitle')}
          </p>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <StepCard
              step={1}
              title={t('documents.upload.steps.file')}
              action={
                <button
                  type="button"
                  onClick={() => setAdding((value) => !value)}
                  aria-expanded={adding}
                  className="inline-flex h-[42px] items-center gap-2 rounded-sm border border-dashed border-border-default bg-white px-4 text-sm font-medium text-text-tertiary transition-colors hover:border-primary-300 hover:text-primary-700"
                >
                  <img src={plusIcon} alt="" className="size-4" />
                  {t('documents.upload.addMore')}
                </button>
              }
            >
              {hasFile ? (
                <ul className="flex flex-col gap-2.5">
                  {files.map((file) => (
                    <li
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-[#cfe0d5] bg-[#eef5f0] p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
                          <img src={fileIcon} alt="" className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-base font-semibold leading-[1.2] text-text-primary">
                            {file.name}
                          </p>
                          <p className="mt-1 text-sm font-medium leading-[1.3] text-text-tertiary">
                            {t('documents.upload.fileMeta', {
                              pages: file.pages,
                              size: formatSize(file.kb),
                            })}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFiles((current) => current.filter((entry) => entry.id !== file.id))
                        }
                        className="inline-flex h-[42px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
                      >
                        {t('documents.upload.replace')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* The dropzone appears when there is nothing yet, or on "Add More". */}
              {!hasFile || adding ? (
                <div className={hasFile ? 'mt-3' : ''}>
                  <FileDropzone
                    accept=".pdf,.png,.jpg,.jpeg,.xml"
                    multiple
                    maxBytes={20 * 1024 * 1024}
                    onFiles={(picked) => {
                      setFiles((current) => [
                        ...current,
                        ...picked.map((file, index) => ({
                          id: `f${current.length + index + 1}`,
                          name: file.name,
                          pages: 1,
                          kb: Math.max(1, Math.round(file.size / 1024)),
                        })),
                      ])
                      setAdding(false)
                    }}
                  >
                    {({ dragging }) => (
                      <div
                        className={[
                          'flex flex-col items-center rounded-sm border border-dashed px-6 py-10 text-center transition-colors',
                          dragging
                            ? 'border-primary-700 bg-primary-25'
                            : 'border-border-default bg-white',
                        ].join(' ')}
                      >
                        <span className="flex size-11 items-center justify-center rounded-sm bg-surface-background">
                          <img src={fileIcon} alt="" className="size-5" />
                        </span>
                        <p className="mt-3 text-base font-semibold leading-[1.2] text-text-primary">
                          {t('documents.upload.dropTitle')}
                        </p>
                        <p className="mt-1.5 text-sm font-medium leading-[1.3] text-text-quaternary">
                          {t('documents.upload.dropNote')}
                        </p>
                        <span className="mt-4 inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary">
                          {t('documents.upload.choose')}
                        </span>
                      </div>
                    )}
                  </FileDropzone>
                </div>
              ) : null}
            </StepCard>

            <StepCard step={2} title={t('documents.upload.steps.what')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <FieldLabel label={t('documents.upload.name')} required />
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={t('documents.upload.namePlaceholder')}
                    className="h-[52px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-base font-medium text-text-secondary outline-none focus:border-primary-700"
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('documents.upload.kind')} required />
                  <Select
                    value={kind}
                    onChange={setKind}
                    options={KINDS}
                    ariaLabel={t('documents.upload.kind')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('documents.upload.dateOn')} />
                  <DateField
                    value={dateOn}
                    onChange={setDateOn}
                    ariaLabel={t('documents.upload.dateOn')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel
                    label={t('documents.upload.validUntil')}
                    optional={t('documents.upload.optional')}
                  />
                  <DateField
                    value={validUntil}
                    onChange={setValidUntil}
                    min={dateOn}
                    ariaLabel={t('documents.upload.validUntil')}
                  />
                </div>
              </div>
            </StepCard>

            <StepCard step={3} title={t('documents.upload.steps.belongs')}>
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white">
                    <img src={supplierIcon} alt="" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-[1.2] text-text-primary">
                      {READ.belongsTo}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-[1.3] text-text-tertiary">
                      {t('documents.upload.matched')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-[42px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('documents.upload.change')}
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-1.5">
                <FieldLabel
                  label={t('documents.upload.alsoAttach')}
                  optional={t('documents.upload.optional')}
                />
                <Select
                  value={attachTo}
                  onChange={setAttachTo}
                  placeholder={t('documents.upload.alsoAttachPlaceholder')}
                  options={[
                    { value: 'INV-2038', label: 'INV-2038', hint: 'Nizwa Souq Café · 23 Jun 2026' },
                    { value: 'SO-0073', label: 'SO-0073', hint: 'Standing weekly order' },
                    { value: 'GCL-2301', label: 'GCL-2301', hint: 'Gulf Cold Logistics · 25 Jul' },
                  ]}
                  ariaLabel={t('documents.upload.alsoAttach')}
                />
              </div>

              <div className="mt-4">
                <FieldLabel label={t('documents.upload.tags')} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex h-[38px] items-center gap-2 rounded-sm bg-primary-50 ps-3 pe-2 text-sm font-medium text-primary-700"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setTags((list) => list.filter((entry) => entry !== tag))}
                        aria-label={t('documents.upload.removeTag', { tag })}
                        className="inline-flex size-5 items-center justify-center rounded-full text-base leading-none text-primary-700/70 hover:bg-white hover:text-primary-800"
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
                      className="h-[38px] w-[150px] rounded-sm border border-primary-300 bg-white px-3 text-sm font-medium text-text-secondary outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingTag(true)}
                      className="inline-flex h-[38px] items-center gap-1.5 rounded-sm border border-dashed border-border-default bg-white px-3 text-sm font-medium text-text-tertiary transition-colors hover:border-primary-300 hover:text-primary-700"
                    >
                      <img src={plusIcon} alt="" className="size-3.5" />
                      {t('documents.upload.addTag')}
                    </button>
                  )}
                </div>
              </div>
            </StepCard>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {!hasFile ? (
                <p className="me-auto text-sm font-medium text-warning-700">
                  {t('documents.upload.noFile')}
                </p>
              ) : null}
              <Link
                to="/compliance/documents"
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('documents.upload.cancel')}
              </Link>
              <Link
                to="/compliance/documents"
                aria-disabled={!hasFile}
                onClick={(event) => {
                  if (!hasFile) event.preventDefault()
                }}
                className={[
                  'inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800',
                  hasFile ? '' : 'pointer-events-none opacity-40',
                ].join(' ')}
              >
                {t('documents.upload.save')}
              </Link>
            </div>
          </div>

          {/* Right column */}
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('documents.upload.keepTitle')}
              </h2>
              <div className="mt-4 flex flex-col gap-2.5" role="radiogroup">
                {KEEP_OPTIONS.map((option) => {
                  const active = keep === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setKeep(option.id)}
                      className={[
                        'flex items-start gap-3 rounded-sm border p-4 text-start transition-colors',
                        active
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:border-primary-300',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                          active ? 'border-primary-700' : 'border-border-default',
                        ].join(' ')}
                      >
                        {active ? <span className="size-2.5 rounded-full bg-primary-700" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        {/* Figma runs the title straight into the note with no separator. */}
                        <span className="text-sm font-semibold leading-[1.3] text-text-primary">
                          {t(option.titleKey)}
                        </span>{' '}
                        <span className="text-sm font-medium leading-[1.3] text-text-quaternary">
                          {t(option.noteKey)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {keep === 'untilDate' ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  <FieldLabel label={t('documents.upload.keep.pickDate')} />
                  <DateField
                    value={deleteAfter}
                    onChange={setDeleteAfter}
                    min={dateOn}
                    ariaLabel={t('documents.upload.keep.pickDate')}
                  />
                </div>
              ) : null}
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('documents.upload.onSaveTitle')}
              </h2>
              <dl className="mt-3 flex flex-col">
                {[
                  [t('documents.upload.onSave.fingerprint'), t('documents.upload.onSave.yes')],
                  [
                    t('documents.upload.onSave.version'),
                    t('documents.upload.onSave.versionValue', {
                      current: READ.version,
                      total: READ.version,
                    }),
                  ],
                  [
                    t('documents.upload.onSave.showsOn'),
                    t('documents.upload.onSave.supplierProfile'),
                  ],
                  [
                    t('documents.upload.onSave.searchableBy'),
                    t('documents.upload.onSave.searchableValue'),
                  ],
                  [
                    t('documents.upload.onSave.spaceUsed'),
                    hasFile ? formatSize(totalKb) : t('documents.upload.onSave.nothingYet'),
                  ],
                ].map(([label, value], index, all) => (
                  <div
                    key={String(label)}
                    className={[
                      'flex items-center justify-between gap-3 py-2.5',
                      index < all.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">
                      {String(label)}
                    </dt>
                    <dd className="shrink-0 text-sm font-semibold text-text-primary">
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
