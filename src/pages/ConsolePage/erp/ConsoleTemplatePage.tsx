import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice } from '../../../layouts/ConsoleShell/ConsoleNotice'
import {
  ConsoleStatusPill,
  type ConsolePillTone,
} from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { Input, Modal, RowsView, Select, type SelectOption } from '../../../components/ui'
import { formatMoment } from '../../../lib/console/format'
import {
  TEMPLATE_SAMPLES,
  connectionsOnVersion,
  consoleErpStore,
  draftVersion,
  publishedVersion,
  templateById,
  tenantName,
  useConsoleErp,
  type ConsoleErpState,
  type MappingTemplate,
  type TemplateVersion,
  type TemplateVersionState,
} from '../../../lib/consoleErp'
import {
  MAPPABLE_TARGETS,
  REQUIRED_TARGETS,
  TARGET_BY_ID,
  TRANSFORM_PRESETS,
  type Target,
} from '../../../lib/erpCatalogue'
import type { ConnectionState } from '../../../lib/erpConnector'
import {
  dryRun,
  validate,
  type DryRunResult,
  type Entry,
  type OnUnmapped,
} from '../../../lib/erpMapping'
import { JsonTree } from '../../ErpPage/shared/JsonTree'
import { ModalFooter, SummaryLine } from '../subscriptions/modalFields'
import trashIcon from '../../../assets/catalog/trash-danger.svg'
import plusIcon from '../../../assets/catalog/plus-brand.svg'
import {
  CONSOLE_DANGER,
  CONSOLE_PAGE,
  CONSOLE_PRIMARY,
  CONSOLE_ROWS,
  CONSOLE_SECONDARY,
  CONSOLE_TABLE,
  CONSOLE_THEAD,
  ConsoleButton,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'

const PRIMARY_BUTTON = CONSOLE_PRIMARY
const SECONDARY_BUTTON = CONSOLE_SECONDARY
const DANGER_BUTTON = CONSOLE_DANGER
/** The 42px shell `Select compact` draws, for the two free-text cells of an entry row. */
const CELL_INPUT =
  'h-[42px] w-full min-w-0 rounded-sm border border-border-default bg-white px-2.5 font-mono text-xs font-medium text-text-primary outline-none transition-colors placeholder:text-text-placeholder focus:border-border-brand'

const VERSION_TONE: Record<TemplateVersionState, ConsolePillTone> = {
  draft: 'pending',
  published: 'success',
  retired: 'neutral',
}
const CONNECTION_TONE: Record<ConnectionState, ConsolePillTone> = {
  DRAFT: 'neutral',
  CONNECTED: 'success',
  PAUSED: 'pending',
  ERROR: 'danger',
  DISCONNECTED: 'neutral',
}
const ON_UNMAPPED: OnUnmapped[] = ['FAIL', 'USE_DEFAULT', 'PASS_THROUGH']

/** Empty strings never reach the validator; they mean "not set". */
function normalise(entry: Entry): Entry {
  const next = { ...entry }
  if (!next.sourcePath) delete next.sourcePath
  if (!next.defaultValue) delete next.defaultValue
  if (next.transform !== undefined && !next.transform.trim()) delete next.transform
  if (next.valueMap && Object.keys(next.valueMap).length === 0) delete next.valueMap
  if (!next.valueMapDefault) delete next.valueMapDefault
  return next
}

const presetOf = (transform: string | undefined) =>
  TRANSFORM_PRESETS.find((preset) => preset.fragment === transform)?.id

/**
 * ERP › Mapping templates › one template (docs/erp-and-console-plan.md §9.3): the versions as a
 * strip, the selected one in the editor. Published and retired versions are read-only; the draft
 * is where edits go, and publishing it retires the current version without touching any tenant.
 */
export function ConsoleTemplatePage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const state = useConsoleErp()
  const template = templateById(state, id)

  return (
    <ConsoleShell>
      <div className={CONSOLE_PAGE}>
        {template ? (
          <TemplateScreen template={template} state={state} />
        ) : (
          <>
            <ConsoleBreadcrumbs
              items={[
                { labelKey: 'console.nav.group.erp' },
                { labelKey: 'console.nav.erpTemplates', to: '/console/erp/templates' },
                { label: id ?? '' },
              ]}
            />
            <ConsoleNotice
              badge={t('console.erp.template.notHere')}
              body={t('console.erp.template.notHereBody')}
              action={{ label: t('console.erp.template.backToList'), to: '/console/erp/templates' }}
            />
          </>
        )}
      </div>
    </ConsoleShell>
  )
}

function TemplateScreen({
  template,
  state,
}: {
  template: MappingTemplate
  state: ConsoleErpState
}) {
  const { t, i18n } = useTranslation()
  const published = publishedVersion(template)
  const draft = draftVersion(template)
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [done, setDone] = useState<string | null>(null)
  const selected =
    template.versions.find((v) => v.id === selectedId) ?? draft ?? published ?? template.versions[0]
  const versions = [...template.versions].sort((a, b) => a.version - b.version)
  const moment = (date: Date) => formatMoment(date.toISOString(), i18n.language)

  return (
    <>
      <ConsoleBreadcrumbs
        items={[
          { labelKey: 'console.nav.group.erp' },
          { labelKey: 'console.nav.erpTemplates', to: '/console/erp/templates' },
          { label: template.name },
        ]}
      />

      <ConsolePageHeader
        title={template.name}
        aside={
          <ConsoleStatusPill
            size="header"
            tone="neutral"
            label={t(`erp.connector.product.${template.product}`)}
          />
        }
        subtitle={t('console.erp.template.productLine', {
          product: t(`erp.connector.product.${template.product}`),
          erpVersion: template.erpVersion,
          schema: selected.schemaVersion,
        })}
      />

      {done ? (
        <p
          role="status"
          className="rounded-md bg-success-100 px-5 py-4 text-sm font-medium leading-[1.6] text-success-700"
        >
          {done}
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-text-quaternary">
          {t('console.erp.template.versions')}
        </h2>
        <div className="flex flex-wrap gap-2">
          {versions.map((version) => {
            const active = version.id === selected.id
            return (
              <button
                key={version.id}
                type="button"
                onClick={() => {
                  setSelectedId(version.id)
                  setDone(null)
                }}
                aria-pressed={active}
                className={[
                  'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors',
                  active
                    ? 'border-primary-700 bg-primary-700 text-white'
                    : 'border-border-default bg-white text-text-secondary hover:border-border-brand-subtle hover:bg-primary-25',
                ].join(' ')}
              >
                v{version.version}
                <span
                  className={`text-xs font-medium ${active ? 'text-white/80' : 'text-text-quaternary'}`}
                >
                  · {t(`console.erp.template.state.${version.state}`)}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
          {selected.publishedAt
            ? t('console.erp.template.publishedLine', {
                date: moment(selected.publishedAt),
                by: selected.publishedBy ?? selected.savedBy,
              })
            : t('console.erp.template.savedLine', {
                date: moment(selected.savedAt),
                by: selected.savedBy,
              })}
          {selected.note ? <> · {selected.note}</> : null}
        </p>
      </section>

      <VersionEditor
        key={selected.id}
        template={template}
        version={selected}
        state={state}
        draftExists={Boolean(draft)}
        onDone={setDone}
        onSelect={setSelectedId}
      />
    </>
  )
}

/* ----------------------------------------------------------------- editor */

function VersionEditor({
  template,
  version,
  state,
  draftExists,
  onDone,
  onSelect,
}: {
  template: MappingTemplate
  version: TemplateVersion
  state: ConsoleErpState
  draftExists: boolean
  onDone: (message: string) => void
  onSelect: (id: string | undefined) => void
}) {
  const { t, i18n } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  const termName = (target: Target) => (arabic ? target.nameAr : target.name)
  const editable = version.state === 'draft'
  const published = publishedVersion(template)

  const [entries, setEntries] = useState<Entry[]>(version.entries)
  const [note, setNote] = useState(version.note)
  const [dirty, setDirty] = useState(false)
  const [modal, setModal] = useState<'publish' | 'discard' | null>(null)
  const [valueMapFor, setValueMapFor] = useState<string | null>(null)
  const [adding, setAdding] = useState('')
  const [result, setResult] = useState<DryRunResult | null>(null)

  const readiness = useMemo(() => validate(entries), [entries])
  const requiredIds = new Set(REQUIRED_TARGETS.map((target) => target.id))
  const mapped = new Set(entries.map((entry) => entry.businessTermId))
  const unmapped = MAPPABLE_TARGETS.filter((target) => !mapped.has(target.id))
  const onVersion = connectionsOnVersion(state, version.id)
  const onPublished = published ? connectionsOnVersion(state, published.id).length : 0
  const sample = TEMPLATE_SAMPLES[template.product === 'ERPNEXT' ? 'ERPNEXT' : 'ODOO']
  const productLabel = t(`erp.connector.product.${template.product}`)

  const update = (businessTermId: string, patch: Partial<Entry>) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.businessTermId === businessTermId ? normalise({ ...entry, ...patch }) : entry,
      ),
    )
    setDirty(true)
    setResult(null)
  }
  const remove = (businessTermId: string) => {
    setEntries((current) =>
      current
        .filter((entry) => entry.businessTermId !== businessTermId)
        .map((entry, ordinal) => ({ ...entry, ordinal })),
    )
    setDirty(true)
    setResult(null)
  }
  const add = () => {
    if (!adding) return
    setEntries((current) => [
      ...current,
      { businessTermId: adding, onUnmapped: 'FAIL', ordinal: current.length },
    ])
    setAdding('')
    setDirty(true)
    setResult(null)
  }

  const save = () => {
    consoleErpStore.saveTemplateDraft(template.id, entries, note.trim())
    setDirty(false)
    onDone(t('console.erp.template.done.saved', { version: version.version }))
  }
  const startNew = () => {
    const from = published ?? version
    const id = consoleErpStore.saveTemplateDraft(template.id, from.entries, '')
    onSelect(id)
    onDone(
      t('console.erp.template.done.created', {
        version: Math.max(...template.versions.map((v) => v.version)) + 1,
        from: from.version,
      }),
    )
  }
  const publish = () => {
    if (dirty) consoleErpStore.saveTemplateDraft(template.id, entries, note.trim())
    consoleErpStore.publishTemplate(template.id)
    setDirty(false)
    setModal(null)
    onDone(
      t('console.erp.template.done.published', { version: version.version, name: template.name }),
    )
  }
  const discard = () => {
    consoleErpStore.discardTemplateDraft(template.id)
    setModal(null)
    onSelect(undefined)
    onDone(t('console.erp.template.done.discarded', { version: version.version }))
  }

  const transformOptions = (entry: Entry): SelectOption[] => {
    const preset = presetOf(entry.transform)
    return [
      { value: 'none', label: t('console.erp.template.none') },
      ...TRANSFORM_PRESETS.map((p) => ({
        value: p.id,
        label: t(`erp.preset.${p.id}`),
        shortLabel: t(`console.erp.template.presetShort.${p.id}`),
      })),
      ...(entry.transform && !preset
        ? [{ value: 'custom', label: t('console.erp.template.custom') }]
        : []),
    ]
  }
  const onUnmappedOptions: SelectOption[] = ON_UNMAPPED.map((value) => ({
    value,
    label: t(`erp.onUnmapped.${value}`),
    shortLabel: t(`console.erp.template.onUnmappedShort.${value}`),
  }))
  const errorsFor = (businessTermId: string) =>
    readiness.invalidMappings.filter((m) => m.businessTermId === businessTermId)

  const valueMapEntry = valueMapFor
    ? entries.find((entry) => entry.businessTermId === valueMapFor)
    : undefined

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-surface-card px-5 py-4">
        <div className="flex min-w-0 flex-1 basis-[320px] items-center gap-3">
          <ConsoleStatusPill
            tone={VERSION_TONE[version.state]}
            label={`v${version.version} · ${t(`console.erp.template.state.${version.state}`)}`}
          />
          {editable ? (
            dirty ? (
              <span className="text-xs font-semibold text-pending-700">
                {t('console.erp.template.unsaved')}
              </span>
            ) : null
          ) : (
            <span className="text-sm font-medium text-text-tertiary">
              {t(
                draftExists
                  ? 'console.erp.template.readOnly'
                  : 'console.erp.template.readOnlyNoDraft',
                {
                  version: version.version,
                  state: t(`console.erp.template.state.${version.state}`),
                },
              )}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 max-md:basis-full">
          {editable ? (
            <>
              <button type="button" onClick={() => setModal('discard')} className={DANGER_BUTTON}>
                {t('console.erp.template.discard')}
              </button>
              <button type="button" onClick={save} className={SECONDARY_BUTTON}>
                {t('console.erp.template.saveDraft')}
              </button>
              <button type="button" onClick={() => setModal('publish')} className={PRIMARY_BUTTON}>
                {t('console.erp.template.publish')}
              </button>
            </>
          ) : draftExists ? null : (
            <button type="button" onClick={startNew} className={PRIMARY_BUTTON}>
              {t('console.erp.template.startNew')}
            </button>
          )}
        </div>
        {editable ? (
          <div className="basis-full">
            <Input
              bordered
              name="note"
              label={t('console.erp.template.note')}
              placeholder={t('console.erp.template.notePlaceholder')}
              value={note}
              autoComplete="off"
              onChange={(event) => {
                setNote(event.target.value)
                setDirty(true)
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-start gap-4 max-lg:flex-col">
        <section className="flex min-w-0 flex-1 flex-col rounded-sm bg-surface-card max-lg:w-full">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-4">
            <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('console.erp.template.entries')}
            </h2>
            <span className="text-xs font-medium text-text-quaternary">
              {t('console.erp.template.entriesCount', { count: entries.length })}
            </span>
          </div>
          <RowsView className={`${CONSOLE_ROWS} max-md:pt-2`}>
            <table className={`${CONSOLE_TABLE} min-w-[700px]`}>
              <thead>
                <tr className={CONSOLE_THEAD}>
                  <th className="w-[136px] px-3 py-3 text-start font-semibold">
                    {t('console.erp.template.col.target')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.erp.template.col.sourceDefault')}
                  </th>
                  <th className="w-[160px] px-2 py-3 text-start font-semibold">
                    {t('console.erp.template.col.transformMap')}
                  </th>
                  <th className="w-[136px] px-2 py-3 text-start font-semibold">
                    {t('console.erp.template.col.onUnmapped')}
                  </th>
                  {editable ? <th className="w-10 px-1 py-3" /> : null}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const target = TARGET_BY_ID[entry.businessTermId]
                  const errors = errorsFor(entry.businessTermId)
                  const pairs = Object.keys(entry.valueMap ?? {}).length
                  const preset = presetOf(entry.transform)
                  const codeField = Boolean(target?.codeList || target?.lookup)
                  const sourceLabel = `${t('console.erp.template.col.source')} ${entry.businessTermId}`
                  const defaultLabel = `${t('console.erp.template.col.default')} ${entry.businessTermId}`
                  return (
                    <tr
                      key={entry.businessTermId}
                      className={[
                        'border-b border-[#f3f3f3] align-top last:border-b-0',
                        errors.length ? 'bg-danger-100/30' : '',
                      ].join(' ')}
                    >
                      <td className="px-3 py-3">
                        <span className="flex items-baseline gap-1.5">
                          <span
                            dir="ltr"
                            className="shrink-0 font-mono text-[11px] font-semibold text-text-tertiary"
                          >
                            {entry.businessTermId}
                          </span>
                          {requiredIds.has(entry.businessTermId) ? (
                            <span
                              className="text-base leading-3 text-primary-700"
                              title={t('console.erp.template.required')}
                            >
                              *
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-sm font-medium leading-[1.3] text-text-primary">
                          {target ? termName(target) : entry.businessTermId}
                        </span>
                        {errors.map((error) => (
                          <span
                            key={error.errorCode}
                            role="alert"
                            className="mt-1 block text-xs font-medium leading-[1.4] text-danger-700"
                          >
                            {t(`erp.error.${error.errorCode}`, error.values)}
                          </span>
                        ))}
                      </td>
                      <td className="px-2 py-3">
                        {editable ? (
                          <div className="flex flex-col gap-1.5">
                            <input
                              dir="ltr"
                              spellCheck={false}
                              autoComplete="off"
                              aria-label={sourceLabel}
                              title={entry.sourcePath || undefined}
                              value={entry.sourcePath ?? ''}
                              placeholder={t('console.erp.template.sourcePlaceholder')}
                              onChange={(event) =>
                                update(entry.businessTermId, {
                                  sourcePath: event.target.value.trim(),
                                })
                              }
                              className={CELL_INPUT}
                            />
                            <label className="flex items-center gap-2">
                              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-quaternary">
                                {t('console.erp.template.defaultLabel')}
                              </span>
                              <input
                                dir="ltr"
                                autoComplete="off"
                                aria-label={defaultLabel}
                                title={entry.defaultValue || undefined}
                                value={entry.defaultValue ?? ''}
                                placeholder={t('console.erp.template.defaultPlaceholder')}
                                onChange={(event) =>
                                  update(entry.businessTermId, { defaultValue: event.target.value })
                                }
                                className={[CELL_INPUT, 'h-8'].join(' ')}
                              />
                            </label>
                          </div>
                        ) : (
                          <>
                            <span
                              dir="ltr"
                              className="block font-mono text-xs [overflow-wrap:anywhere] font-medium leading-[1.5] text-text-primary"
                            >
                              {entry.sourcePath ?? '—'}
                            </span>
                            {entry.defaultValue ? (
                              <span className="mt-1 block text-xs font-medium text-text-quaternary">
                                {t('console.erp.template.defaultLabel')}:{' '}
                                <span dir="ltr" className="font-mono text-text-secondary">
                                  {entry.defaultValue}
                                </span>
                              </span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {editable ? (
                          <Select
                            compact
                            value={preset ?? (entry.transform ? 'custom' : 'none')}
                            options={transformOptions(entry)}
                            ariaLabel={`${t('console.erp.template.col.transform')} ${entry.businessTermId}`}
                            onChange={(value) =>
                              update(entry.businessTermId, {
                                transform:
                                  value === 'none'
                                    ? undefined
                                    : value === 'custom'
                                      ? entry.transform
                                      : TRANSFORM_PRESETS.find((p) => p.id === value)?.fragment,
                              })
                            }
                          />
                        ) : (
                          <span className="block text-sm font-medium leading-[1.5] text-text-primary">
                            {preset
                              ? t(`erp.preset.${preset}`)
                              : entry.transform
                                ? t('console.erp.template.custom')
                                : '—'}
                          </span>
                        )}
                        <span className="mt-1.5 flex items-center gap-2 whitespace-nowrap text-xs font-medium text-text-quaternary">
                          <span>
                            {t('console.erp.template.col.valueMap')}:{' '}
                            <span className="text-text-secondary">
                              {codeField || pairs
                                ? t('console.erp.template.pairs', { count: pairs })
                                : '—'}
                            </span>
                          </span>
                          {editable && (codeField || pairs) ? (
                            <button
                              type="button"
                              onClick={() => setValueMapFor(entry.businessTermId)}
                              className="font-semibold text-primary-700 transition-colors hover:text-primary-800"
                            >
                              {t('console.erp.template.edit')}
                            </button>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        {editable ? (
                          <Select
                            compact
                            value={entry.onUnmapped}
                            options={onUnmappedOptions}
                            ariaLabel={`${t('console.erp.template.col.onUnmapped')} ${entry.businessTermId}`}
                            onChange={(value) =>
                              update(entry.businessTermId, { onUnmapped: value as OnUnmapped })
                            }
                          />
                        ) : (
                          <span className="block text-sm font-medium leading-[1.5] text-text-primary">
                            {t(`erp.onUnmapped.${entry.onUnmapped}`)}
                          </span>
                        )}
                      </td>
                      {editable ? (
                        <td className="px-1 py-3">
                          <button
                            type="button"
                            onClick={() => remove(entry.businessTermId)}
                            aria-label={t('console.erp.template.remove', {
                              term: entry.businessTermId,
                            })}
                            className="inline-flex size-[42px] items-center justify-center rounded-sm transition-colors hover:bg-danger-100/60"
                          >
                            <img src={trashIcon} alt="" className="size-4" />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </RowsView>
          {editable ? (
            <div className="flex flex-wrap items-end gap-3 border-t border-border-subtle px-5 py-4">
              <div className="min-w-0 flex-1 basis-[280px]">
                <span className="mb-1 block text-sm font-medium text-text-primary">
                  {t('console.erp.template.addField')}
                </span>
                {unmapped.length ? (
                  <Select
                    value={adding}
                    onChange={setAdding}
                    placeholder={t('console.erp.template.addFieldPick')}
                    ariaLabel={t('console.erp.template.addField')}
                    options={unmapped.map((target) => ({
                      value: target.id,
                      label: `${target.id} · ${termName(target)}`,
                      hint: t(`erp.section.${target.section}`, { defaultValue: target.section }),
                    }))}
                  />
                ) : (
                  <p className="text-sm font-medium text-text-tertiary">
                    {t('console.erp.template.allMapped')}
                  </p>
                )}
              </div>
              <ConsoleButton type="button" size="md" variant="secondary" disabled={!adding} onClick={add}>
                <img src={plusIcon} alt="" className="me-1.5 size-4" />
                {t('console.erp.template.add')}
              </ConsoleButton>
            </div>
          ) : null}
        </section>

        <aside className="flex w-[300px] shrink-0 flex-col gap-4 self-start max-lg:w-full lg:sticky lg:top-4">
          <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('console.erp.template.readiness.title')}
              </h2>
              <ConsoleStatusPill
                tone={readiness.readyForActivation ? 'success' : 'danger'}
                label={t(
                  readiness.readyForActivation
                    ? 'console.erp.template.readiness.ready'
                    : 'console.erp.template.readiness.notReady',
                )}
              />
            </div>
            <SummaryLine
              label={t('console.erp.template.readiness.required')}
              value={`${readiness.mappedRequired.length} / ${readiness.requiredTargets.length}`}
              tone={readiness.missingRequiredTargets.length ? 'danger' : undefined}
            />
            {readiness.missingRequiredTargets.length ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-text-quaternary">
                  {t('console.erp.template.readiness.missing')}
                </h3>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {readiness.missingRequiredTargets.map((id) => (
                    <li
                      key={id}
                      className="flex items-baseline gap-1.5 text-sm font-medium text-text-secondary"
                    >
                      <span
                        dir="ltr"
                        className="shrink-0 font-mono text-[11px] font-semibold text-text-tertiary"
                      >
                        {id}
                      </span>
                      <span className="min-w-0">
                        {TARGET_BY_ID[id] ? termName(TARGET_BY_ID[id]) : id}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {readiness.invalidMappings.length ? (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-text-quaternary">
                  {t('console.erp.template.readiness.invalid')}
                </h3>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {readiness.invalidMappings.map((invalid, index) => (
                    <li
                      key={`${invalid.businessTermId}-${invalid.errorCode}-${index}`}
                      className="text-sm font-medium leading-[1.4] text-danger-700"
                    >
                      <span dir="ltr" className="me-1.5 font-mono text-[11px] font-semibold">
                        {invalid.businessTermId}
                      </span>
                      <span className="text-text-secondary">
                        {t(`erp.error.${invalid.errorCode}`, invalid.values)}
                      </span>
                      <span
                        dir="ltr"
                        className="ms-1.5 font-mono text-[11px] font-semibold text-text-quaternary"
                      >
                        {invalid.errorCode}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!readiness.missingRequiredTargets.length && !readiness.invalidMappings.length ? (
              <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
                {t('console.erp.template.readiness.allGood')}
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-5">
            <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('console.erp.template.dryRun.title')}
            </h2>
            <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
              {t('console.erp.template.dryRun.hint', { product: productLabel })}
            </p>
            <ConsoleButton
              type="button"
              size="md"
              variant={result ? 'secondary' : 'primary'}
              onClick={() => setResult(dryRun(entries, sample))}
            >
              {t(result ? 'console.erp.template.dryRun.rerun' : 'console.erp.template.dryRun.run', {
                product: productLabel,
              })}
            </ConsoleButton>
            {result ? (
              result.canonical ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-text-quaternary">
                    {t('console.erp.template.dryRun.output')}
                  </h3>
                  <div className="max-h-[420px] overflow-y-auto">
                    <JsonTree value={result.canonical} openDepth={1} />
                  </div>
                  {result.notes.length ? (
                    <ul className="flex flex-col gap-1">
                      {result.notes.map((n, index) => (
                        <li
                          key={`${n.field}-${index}`}
                          className="text-xs font-medium leading-[1.4] text-text-tertiary"
                        >
                          {t(n.messageKey, n.values)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-danger-700">
                    {t('console.erp.template.dryRun.refusals')}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-start">
                      <thead>
                        <tr className="text-[11px] font-semibold uppercase text-text-quaternary">
                          <th className="py-1.5 pe-2 text-start font-semibold">
                            {t('console.erp.template.dryRun.col.field')}
                          </th>
                          <th className="py-1.5 text-start font-semibold">
                            {t('console.erp.template.dryRun.col.problem')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((error, index) => (
                          <tr
                            key={`${error.field}-${index}`}
                            className="border-t border-border-subtle align-top"
                          >
                            <td
                              dir="ltr"
                              className="py-2 pe-2 font-mono text-[11px] font-semibold text-text-tertiary"
                            >
                              {error.field}
                            </td>
                            <td className="py-2 text-xs font-medium leading-[1.4] text-text-secondary">
                              {t(error.messageKey, error.values)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : null}
          </section>

          <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="min-w-0 text-base font-semibold leading-[1.2] text-text-primary">
                {t('console.erp.template.tenants.title')}
              </h2>
              <span className="shrink-0 whitespace-nowrap text-xs font-medium text-text-quaternary">
                {t('console.erp.template.tenants.count', { count: onVersion.length })}
              </span>
            </div>
            {onVersion.length ? (
              <ul className="flex flex-col divide-y divide-border-subtle">
                {onVersion.map((connection) => (
                  <li
                    key={connection.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <Link
                      to={`/console/erp/connections/${connection.id}`}
                      className="min-w-0 transition-colors hover:text-primary-700"
                    >
                      <span className="block truncate text-sm font-medium text-text-primary">
                        {tenantName(connection.tenantId)}
                      </span>
                      <span className="block truncate text-xs font-medium text-text-quaternary">
                        {connection.label}
                      </span>
                    </Link>
                    <ConsoleStatusPill
                      tone={CONNECTION_TONE[connection.state]}
                      label={t(`erp.connector.state.${connection.state}`)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
                {t('console.erp.template.tenants.none')}
              </p>
            )}
          </section>
        </aside>
      </div>

      {modal === 'publish' ? (
        <Modal
          open
          width={520}
          onClose={() => setModal(null)}
          title={t('console.erp.template.publishModal.title', { version: version.version })}
          footer={
            <ModalFooter
              formId="publish-template"
              onCancel={() => setModal(null)}
              submitLabel={t('console.erp.template.publishModal.confirm')}
              disabled={!readiness.valid}
            />
          }
        >
          <form
            id="publish-template"
            onSubmit={(event) => {
              event.preventDefault()
              publish()
            }}
            className="flex flex-col gap-3"
          >
            <p className="text-sm font-medium leading-[1.6] text-text-secondary">
              {published
                ? t('console.erp.template.publishModal.body', {
                    version: version.version,
                    name: template.name,
                    count: onPublished,
                    current: published.version,
                  })
                : t('console.erp.template.publishModal.bodyFirst', {
                    version: version.version,
                    name: template.name,
                  })}
            </p>
            {readiness.valid ? null : (
              <p role="alert" className="text-sm font-medium leading-[1.5] text-danger-700">
                {t('console.erp.template.publishModal.notValid')}
              </p>
            )}
          </form>
        </Modal>
      ) : null}

      {modal === 'discard' ? (
        <Modal
          open
          width={520}
          onClose={() => setModal(null)}
          title={t('console.erp.template.discardModal.title', { version: version.version })}
          footer={
            <ModalFooter
              formId="discard-template"
              onCancel={() => setModal(null)}
              submitLabel={t('console.erp.template.discardModal.confirm')}
              danger
            />
          }
        >
          <form
            id="discard-template"
            onSubmit={(event) => {
              event.preventDefault()
              discard()
            }}
          >
            <p className="text-sm font-medium leading-[1.6] text-text-secondary">
              {t('console.erp.template.discardModal.body', {
                current: published?.version ?? '—',
              })}
            </p>
          </form>
        </Modal>
      ) : null}

      {valueMapEntry ? (
        <ValueMapEditor
          entry={valueMapEntry}
          termLabel={
            TARGET_BY_ID[valueMapEntry.businessTermId]
              ? `${valueMapEntry.businessTermId} · ${termName(TARGET_BY_ID[valueMapEntry.businessTermId])}`
              : valueMapEntry.businessTermId
          }
          onClose={() => setValueMapFor(null)}
          onSave={(patch) => {
            update(valueMapEntry.businessTermId, patch)
            setValueMapFor(null)
          }}
        />
      ) : null}
    </>
  )
}

/* -------------------------------------------------------------- value map */

type Pair = { key: string; value: string }

function ValueMapEditor({
  entry,
  termLabel,
  onClose,
  onSave,
}: {
  entry: Entry
  termLabel: string
  onClose: () => void
  onSave: (patch: Pick<Entry, 'valueMap' | 'valueMapDefault'>) => void
}) {
  const { t } = useTranslation()
  const [pairs, setPairs] = useState<Pair[]>(() =>
    Object.entries(entry.valueMap ?? {}).map(([key, value]) => ({ key, value })),
  )
  const [fallback, setFallback] = useState(entry.valueMapDefault ?? '')

  const edit = (index: number, patch: Partial<Pair>) =>
    setPairs((current) => current.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)))

  const submit = () => {
    const valueMap: Record<string, string> = {}
    pairs.forEach((pair) => {
      if (pair.key.trim()) valueMap[pair.key.trim()] = pair.value.trim()
    })
    onSave({
      valueMap: Object.keys(valueMap).length ? valueMap : undefined,
      valueMapDefault: fallback.trim() || undefined,
    })
  }

  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t('console.erp.template.valueMap.title', { term: termLabel })}
      subtitle={t('console.erp.template.valueMap.subtitle')}
      footer={
        <ModalFooter
          formId="value-map"
          onCancel={onClose}
          submitLabel={t('console.erp.template.valueMap.save')}
        />
      }
    >
      <form
        id="value-map"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_1fr_40px] gap-2 text-xs font-semibold uppercase tracking-[0.04em] text-text-quaternary">
            <span>{t('console.erp.template.valueMap.from')}</span>
            <span>{t('console.erp.template.valueMap.to')}</span>
            <span />
          </div>
          {pairs.length ? (
            pairs.map((pair, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_40px] items-center gap-2">
                <input
                  dir="ltr"
                  autoComplete="off"
                  aria-label={t('console.erp.template.valueMap.from')}
                  value={pair.key}
                  onChange={(event) => edit(index, { key: event.target.value })}
                  className={CELL_INPUT}
                />
                <input
                  dir="ltr"
                  autoComplete="off"
                  aria-label={t('console.erp.template.valueMap.to')}
                  value={pair.value}
                  onChange={(event) => edit(index, { value: event.target.value })}
                  className={CELL_INPUT}
                />
                <button
                  type="button"
                  onClick={() => setPairs((current) => current.filter((_, i) => i !== index))}
                  aria-label={t('console.erp.template.valueMap.removePair')}
                  className="inline-flex size-10 items-center justify-center rounded-sm transition-colors hover:bg-danger-100/60"
                >
                  <img src={trashIcon} alt="" className="size-4" />
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm font-medium text-text-tertiary">
              {t('console.erp.template.valueMap.empty')}
            </p>
          )}
          <div>
            <ConsoleButton
              type="button"
              size="md"
              variant="ghost"
              onClick={() => setPairs((current) => [...current, { key: '', value: '' }])}
            >
              <img src={plusIcon} alt="" className="me-1.5 size-4" />
              {t('console.erp.template.valueMap.addPair')}
            </ConsoleButton>
          </div>
        </div>
        <Input
          bordered
          name="valueMapDefault"
          dir="ltr"
          autoComplete="off"
          label={t('console.erp.template.valueMap.default')}
          hint={t('console.erp.template.valueMap.defaultHint')}
          value={fallback}
          onChange={(event) => setFallback(event.target.value)}
          className="font-mono"
        />
      </form>
    </Modal>
  )
}
