import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FileDropzone, Input, Modal, RowsView } from '../../components/ui'
import { ErpShell } from './ErpShell'
import {
  ConfirmModal,
  DANGER_TEXT_BUTTON,
  Mono,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SectionCard,
  TBODY_ROW,
  TEXT_BUTTON,
  THEAD_ROW,
  Td,
  Th,
} from './overview/idiom'
import { downloadJson, kilobytes, readJsonFile, yyyymmdd } from './overview/files'
import { GUIDED_MAPPING_FORMAT, useErpMapping, useErpMappingReload } from './ErpMappingGate'
import { saveGuidedMapping, type GuidedMappingValidationDto } from '../../api/erp/mapping'
import { ApiError } from '../../api'
import { withOrdinals, type DraftEntry } from '../../lib/erp/draft'
import {
  SAMPLE_LIMIT,
  flattenKeys,
  sessionSamples,
  type SessionSample,
} from '../../lib/erp/sample'
import { TARGET_BY_ID } from '../../lib/erpCatalogue'
import { shortDate } from '../../lib/settings'
import infoIcon from '../../assets/settings/info.svg'
import downloadIcon from '../../assets/settings/download-ink.svg'
import plusIcon from '../../assets/settings/plus-white.svg'
import tickIcon from '../../assets/settings/check-green.svg'

const LABEL_MAX = 80
const PAYLOAD_MAX = 256 * 1024
const IMPORT_MAX = 1024 * 1024
const PREVIEW_PATHS = 12

type ImportOutcome =
  | { kind: 'saved'; readiness: GuidedMappingValidationDto }
  | { kind: 'refused'; message: string }
  | { kind: 'malformed' }
  | { kind: 'stale' }
  | { kind: 'unknownTerms'; terms: string[] }
  | { kind: 'unreadable' }

/**
 * Settings › Integration › ERP mapping › Samples (docs/erp-and-console-plan.md §2.7, A.7).
 *
 * The invoices the preview and the certification run against, and the guided mapping as a file
 * that can leave and come back. Ten samples, a label of eighty characters, a payload of 256 KiB —
 * the backend's limits, refused here the way it refuses them.
 */
export function ErpSamplesPage() {
  const { t } = useTranslation()
  const samples = useSyncExternalStore(sessionSamples.subscribe, sessionSamples.snapshot)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<SessionSample | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = samples.find((sample) => sample.id === selectedId) ?? samples[0]

  return (
    <ErpShell
      title={t('erp.samples.title')}
      subtitle={t('erp.samples.subtitle')}
      actions={
        <button type="button" onClick={() => setUploading(true)} className={PRIMARY_BUTTON}>
          <img src={plusIcon} alt="" className="size-4" />
          {t('erp.samples.upload.open')}
        </button>
      }
    >
      <SectionCard
        title={t('erp.samples.list.title')}
        note={t('erp.samples.list.note', { count: samples.length, limit: SAMPLE_LIMIT })}
      >
        {/*
          With nothing to list there is no table to switch to cards, so the empty line stands on
          its own: no card/table toggle, and the text wraps inside the card on a phone.
        */}
        {samples.length === 0 ? (
          <p className="border-t border-surface-background px-5 py-8 text-center text-sm font-medium leading-[1.5] text-text-quaternary">
            {t('erp.samples.list.empty')}
          </p>
        ) : (
          <div className="max-md:px-5 max-md:pb-5">
            <RowsView>
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className={THEAD_ROW}>
                    <Th first>{t('erp.samples.col.label')}</Th>
                    <Th align="end">{t('erp.samples.col.size')}</Th>
                    <Th>{t('erp.samples.col.when')}</Th>
                    <Th align="end">{t('erp.samples.col.actions')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((sample) => {
                    const previewing = selected?.id === sample.id
                    return (
                      <tr key={sample.id} className={TBODY_ROW}>
                        <Td first>
                          <p className="text-sm font-semibold leading-[1.4] text-text-primary">
                            {sample.label}
                          </p>

                        </Td>
                        <Td align="end">
                          <span className="text-sm font-medium text-text-secondary tabular-nums">
                            {t('erp.samples.kb', { size: kilobytes(sample.byteSize) })}
                          </span>
                        </Td>
                        {/*
                          No "added by" and no payload hash. Both were properties of a stored sample:
                          nothing records who added one, because the reader added it themselves in this
                          browser, and no digest of a sample payload is kept anywhere.
                        */}
                        <Td>
                          <span className="text-sm font-medium text-text-secondary">
                            {shortDate(sample.addedAt)}
                          </span>
                        </Td>
                        <Td align="end">
                          <span className="flex items-center justify-end gap-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedId(sample.id)}
                              disabled={previewing}
                              className={TEXT_BUTTON}
                            >
                              {previewing
                                ? t('erp.samples.previewing')
                                : t('erp.samples.previewButton')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(sample)}
                              className={DANGER_TEXT_BUTTON}
                            >
                              {t('erp.samples.delete')}
                            </button>
                          </span>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </RowsView>
          </div>
        )}
      </SectionCard>

      {selected ? <SamplePreview sample={selected} /> : null}

      <ImportExport />

      <UploadSampleModal
        open={uploading}
        onClose={() => setUploading(false)}
        onUploaded={(id) => {
          setSelectedId(id)
          setUploading(false)
        }}
      />

      <ConfirmModal
        open={deleting !== null}
        title={t('erp.samples.remove.title')}
        body={t('erp.samples.remove.body', { label: deleting?.label ?? '' })}
        confirmLabel={t('erp.samples.remove.confirm')}
        danger
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) sessionSamples.remove(deleting.id)
          setDeleting(null)
        }}
      />
    </ErpShell>
  )
}

/** The first paths Fawtir read from a sample — proof of what the picker will offer. */
function KeyList({ payload }: { payload: unknown }) {
  const { t } = useTranslation()
  const keys = flattenKeys(payload)
  const shown = keys.slice(0, PREVIEW_PATHS)
  const rest = keys.length - shown.length
  if (keys.length === 0)
    return (
      <p className="text-sm font-medium text-text-quaternary">{t('erp.samples.preview.noKeys')}</p>
    )
  return (
    <>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4">
        {shown.map((key) => (
          <div
            key={key.path}
            className="col-span-2 grid grid-cols-subgrid items-baseline border-b border-surface-background py-2 last:border-0"
          >
            <dt className="min-w-0 truncate">
              <Mono className="text-text-primary">{key.path}</Mono>
            </dt>
            <dd
              dir="ltr"
              className="min-w-0 truncate text-end text-xs font-medium text-text-quaternary"
            >
              {key.type === 'string' ? `"${key.example}"` : key.example}
            </dd>
          </div>
        ))}
      </dl>
      {rest > 0 ? (
        <p className="mt-2 text-xs font-medium text-text-quaternary">
          {t('erp.samples.preview.more', { count: rest })}
        </p>
      ) : null}
    </>
  )
}

function SamplePreview({ sample }: { sample: SessionSample }) {
  const { t } = useTranslation()
  return (
    <SectionCard
      title={t('erp.samples.preview.title', { label: sample.label })}
      note={t('erp.samples.preview.note', { count: PREVIEW_PATHS })}
    >
      <div className="border-t border-surface-background px-5 py-3">
        <KeyList payload={sample.payload} />
      </div>
    </SectionCard>
  )
}

/** The upload dialog: a .json file, a label, the personal-data warning, the backend's two 409s. */
function UploadSampleModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean
  onClose: () => void
  onUploaded: (id: string) => void
}) {
  const { t } = useTranslation()
  const [file, setFile] = useState<{ name: string; size: number; value: unknown } | null>(null)
  const [label, setLabel] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [labelError, setLabelError] = useState<string | null>(null)
  const [atLimit, setAtLimit] = useState(false)

  const reset = () => {
    setFile(null)
    setLabel('')
    setFileError(null)
    setLabelError(null)
    setAtLimit(false)
  }
  const close = () => {
    reset()
    onClose()
  }

  const take = async (chosen: File) => {
    setFileError(null)
    const read = await readJsonFile(chosen)
    if (!read.ok) {
      setFile(null)
      setFileError(t(`erp.samples.upload.error.${read.reason}`))
      return
    }
    setFile({ name: chosen.name, size: chosen.size, value: read.value })
    if (!label.trim()) setLabel(chosen.name.replace(/\.json$/i, '').slice(0, LABEL_MAX))
  }

  const submit = () => {
    if (!file) return
    const trimmed = label.trim()
    if (!trimmed) {
      setLabelError(t('erp.samples.upload.error.labelRequired'))
      return
    }
    // Held for this visit only — nothing stores a sample payload. The label and limit checks
    // stay because they are what keeps the picker readable, not because a server enforces them.
    if (sessionSamples.snapshot().some((sample) => sample.label === trimmed)) {
      setLabelError(t('erp.samples.upload.error.labelExists'))
      return
    }
    if (sessionSamples.snapshot().length >= SAMPLE_LIMIT) {
      setAtLimit(true)
      return
    }
    const created = sessionSamples.add(trimmed, file.value)
    reset()
    onUploaded(created.id)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('erp.samples.upload.title')}
      subtitle={t('erp.samples.upload.subtitle')}
      width={600}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button type="button" size="md" variant="secondary" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="button" size="md" onClick={submit} disabled={!file || atLimit}>
            {t('erp.samples.upload.confirm')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {atLimit ? (
          <p className="flex items-start gap-2 rounded-sm bg-danger-100 px-3 py-2.5 text-sm font-medium leading-[1.6] text-danger-700">
            <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
            <span>{t('erp.samples.upload.error.limit', { count: SAMPLE_LIMIT })}</span>
          </p>
        ) : null}

        <FileDropzone
          accept=".json"
          maxBytes={PAYLOAD_MAX}
          onFiles={(files) => void take(files[0])}
          onReject={(reason) => {
            setFile(null)
            setFileError(t(`erp.samples.upload.error.${reason}`))
          }}
        >
          {({ dragging }) => (
            <span
              className={[
                'flex flex-col items-center gap-1 rounded-sm border border-dashed px-4 py-6 text-center transition-colors',
                dragging
                  ? 'border-primary-700 bg-primary-25'
                  : 'border-border-default bg-surface-background hover:bg-primary-25',
              ].join(' ')}
            >
              <span className="text-sm font-semibold text-text-primary">
                {file ? file.name : t('erp.samples.upload.drop')}
              </span>
              <span className="text-xs font-medium text-text-quaternary">
                {file
                  ? t('erp.samples.upload.chosen', { size: kilobytes(file.size) })
                  : t('erp.samples.upload.dropNote')}
              </span>
            </span>
          )}
        </FileDropzone>
        {fileError ? <p className="text-xs font-medium text-text-danger">{fileError}</p> : null}

        {file ? (
          <div className="rounded-sm bg-surface-background px-4 py-2">
            <p className="pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('erp.samples.upload.read')}
            </p>
            <KeyList payload={file.value} />
          </div>
        ) : null}

        <Input
          bordered
          label={t('erp.samples.upload.label')}
          requiredMark
          value={label}
          maxLength={LABEL_MAX}
          onChange={(event) => {
            setLabel(event.target.value)
            setLabelError(null)
          }}
          error={labelError ?? undefined}
          hint={t('erp.samples.upload.labelHint', { count: label.length, max: LABEL_MAX })}
        />

        <p className="flex items-start gap-2 rounded-sm bg-pending-100/70 px-3 py-2.5 text-xs font-medium leading-[1.6] text-pending-700">
          <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
          <span>{t('erp.samples.upload.personalData')}</span>
        </p>
      </div>
    </Modal>
  )
}

/** The guided mapping as a file: out through a download, back in through the validator. */
function ImportExport() {
  const { t } = useTranslation()
  const view = useErpMapping()
  const reload = useErpMappingReload()
  const [exportedAs, setExportedAs] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)

  const entries = view.guided?.mappings ?? []

  /**
   * The stored mapping as a file.
   *
   * Built from what the server returned, not from a local copy, so the file is what is actually
   * stored. The canonical paths the server resolved are deliberately left out: they are display
   * data the server owns, an import does not accept them, and a file carrying a stale one would
   * outlive a catalogue correction.
   */
  const exportFile = () => {
    const name = `fawtir-guided-mapping-${GUIDED_MAPPING_FORMAT}-${yyyymmdd(new Date())}.json`
    downloadJson(name, {
      schema: 'fawtir.guided-mapping/1',
      exportedAt: new Date().toISOString(),
      format: GUIDED_MAPPING_FORMAT,
      sourceSystem: view.guided?.sourceSystem ?? null,
      entries: entries.map((entry) => ({
        businessTermId: entry.businessTermId,
        sourcePath: entry.sourcePath,
        transform: entry.transform,
        defaultValue: entry.defaultValue,
        ordinal: entry.ordinal,
      })),
    })
    setExportedAs(name)
  }

  /**
   * A file back in, through the ordinary save.
   *
   * The shape and the term ids are checked here because a file the reader chose can be anything,
   * and naming the unknown terms is more use than a single 400. Everything else — whether the
   * mapping is structurally sound, whether it is complete, whether it compiles — is the server's
   * answer, from the same route the wizard saves through.
   */
  const importFile = async (chosen: File) => {
    setOutcome(null)
    const read = await readJsonFile(chosen)
    if (!read.ok) {
      setOutcome({ kind: 'unreadable' })
      return
    }
    const file =
      read.value && typeof read.value === 'object'
        ? (read.value as {
            schema?: string
            sourceSystem?: string
            entries?: Partial<DraftEntry>[]
          })
        : {}
    if (file.schema !== 'fawtir.guided-mapping/1' || !Array.isArray(file.entries)) {
      setOutcome({ kind: 'malformed' })
      return
    }
    const unknown = [
      ...new Set(
        file.entries
          .map((entry) => entry.businessTermId)
          .filter((id): id is string => typeof id === 'string' && !TARGET_BY_ID[id]),
      ),
    ]
    if (unknown.length > 0) {
      setOutcome({ kind: 'unknownTerms', terms: unknown })
      return
    }

    try {
      const readiness = await saveGuidedMapping(GUIDED_MAPPING_FORMAT, {
        sourceSystem: (file.sourceSystem ?? view.guided?.sourceSystem ?? 'CUSTOM') as never,
        expectedVersion: view.guided?.version ?? null,
        mappings: withOrdinals(
          file.entries.map((entry) => ({
            businessTermId: String(entry.businessTermId),
            sourcePath: entry.sourcePath ?? undefined,
            transform: entry.transform ?? undefined,
            defaultValue: entry.defaultValue ?? undefined,
            ordinal: 0,
          })),
        ),
      })
      setOutcome({ kind: 'saved', readiness })
      reload()
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409) {
        setOutcome({ kind: 'stale' })
        return
      }
      const detail = error instanceof ApiError ? error.problem.detail : null
      setOutcome({
        kind: 'refused',
        message:
          typeof detail === 'string' && detail ? detail : t('erp.samples.import.requestFailed'),
      })
    }
  }

  const outcomeLine = (): { tone: 'success' | 'pending' | 'danger'; text: string } | null => {
    if (!outcome) return null
    switch (outcome.kind) {
      case 'saved':
        return outcome.readiness.readyForActivation
          ? { tone: 'success', text: t('erp.samples.import.activatedServer') }
          : {
              tone: 'pending',
              text: t('erp.samples.import.draftServer', {
                count: outcome.readiness.missingRequiredTargets.length,
              }),
            }
      case 'refused':
        return { tone: 'danger', text: outcome.message }
      case 'malformed':
        return { tone: 'danger', text: t('erp.samples.import.malformed') }
      case 'unreadable':
        return { tone: 'danger', text: t('erp.samples.import.unreadable') }
      case 'stale':
        return { tone: 'pending', text: t('erp.samples.import.stale') }
      case 'unknownTerms':
        return {
          tone: 'danger',
          text: t('erp.samples.import.unknownTerms', {
            count: outcome.terms.length,
            terms: outcome.terms.join(', '),
          }),
        }
    }
  }
  const line = outcomeLine()
  const TONE = {
    success: 'bg-success-100 text-[#3d5648]',
    pending: 'bg-pending-100 text-pending-700',
    danger: 'bg-danger-100 text-danger-700',
  }

  return (
    <SectionCard title={t('erp.samples.file.title')} note={t('erp.samples.file.note')}>
      <div className="grid border-t border-surface-background md:grid-cols-2">
        <div className="flex flex-col gap-3 border-b border-surface-background p-5 md:border-b-0 md:border-e">
          <h4 className="text-sm font-semibold text-text-primary">
            {t('erp.samples.file.exportTitle')}
          </h4>
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('erp.samples.file.exportBody')}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={exportFile}
              disabled={entries.length === 0}
              className={SECONDARY_BUTTON}
            >
              <img src={downloadIcon} alt="" className="size-[18px]" />
              {t('erp.samples.file.exportButton')}
            </button>
            {entries.length === 0 ? (
              <span className="text-xs font-medium text-text-quaternary">
                {t('erp.samples.file.nothingToExport')}
              </span>
            ) : null}
          </div>
          {exportedAs ? (
            <p className="flex items-start gap-2 text-xs font-medium leading-[1.6] text-[#3d5648]">
              <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
              <span>
                {t('erp.samples.file.exported')} <Mono>{exportedAs}</Mono>
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 p-5">
          <h4 className="text-sm font-semibold text-text-primary">
            {t('erp.samples.file.importTitle')}
          </h4>
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('erp.samples.file.importBody')}
          </p>
          <FileDropzone
            accept=".json"
            maxBytes={IMPORT_MAX}
            onFiles={(files) => void importFile(files[0])}
            onReject={() => setOutcome({ kind: 'unreadable' })}
          >
            {({ dragging }) => (
              <span
                className={[
                  'flex flex-col items-center gap-1 rounded-sm border border-dashed px-4 py-5 text-center transition-colors',
                  dragging
                    ? 'border-primary-700 bg-primary-25'
                    : 'border-border-default bg-surface-background hover:bg-primary-25',
                ].join(' ')}
              >
                <span className="text-sm font-semibold text-text-primary">
                  {t('erp.samples.file.importDrop')}
                </span>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('erp.samples.file.importNote')}
                </span>
              </span>
            )}
          </FileDropzone>
          {line ? (
            <p
              className={[
                'rounded-sm px-3 py-2.5 text-xs font-medium leading-[1.6]',
                TONE[line.tone],
              ].join(' ')}
            >
              {line.text}
            </p>
          ) : null}
        </div>
      </div>
    </SectionCard>
  )
}
