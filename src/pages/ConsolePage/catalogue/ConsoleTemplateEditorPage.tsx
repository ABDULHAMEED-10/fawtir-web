import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleSettingsFrame } from '../../../layouts/ConsoleShell/ConsoleSettingsFrame'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_LINK,
  CONSOLE_PAGE,
  CONSOLE_SMALL,
  ConsoleButton,
  ConsoleCardHead,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import {
  CATALOGUE_MANAGE_PERMISSION,
  CONSOLE_BUSINESS_TYPES_PATH,
  downloadImportFormat,
  importTemplateCsv,
  publishTemplate,
  readTemplateVersion,
  saveTemplateDraft,
  templatePath,
  TEMPLATE_DRAFT_CONFLICT,
  type ConsoleBusinessTypeDto,
  type ConsoleTemplateDto,
  type ConsoleTemplateVersionDto,
  type TemplateRowError,
} from '../../../api/platform/businessTypes'
import type { TemplateGroupDto } from '../../../api/catalog/templates'
import {
  BUSINESS_TYPES_PATH,
  addItem,
  addKind,
  fieldWordKey,
  itemCount,
  moveNode,
  newGroup,
  newItem,
  newKind,
  nodeOfPath,
  refusalKey,
  removeNode,
  sameNode,
  templateRowErrors,
  updateNode,
  type NodeRef,
} from '../../../lib/console/catalogueTemplates'
import { saveDownload } from '../../../lib/supplierRecord'
import { formatInstant } from '../../../lib/format'
import { NodeEditor } from './TemplateNodeEditor'

const K = 'console.templateEditor.'

/**
 * Console › Settings › Business types › Template (Catalogue guide 1A): the catalogue template of
 * one sub business type, Group › Kind › Item, with no prices. The draft is edited here or replaced
 * by a spreadsheet; publishing copies it to a new version, which is what companies are offered.
 * Earlier versions can be looked at, read only.
 *
 * No Figma frame and no comparable console editor: kept simple and functional on the console's
 * cards (house standard, handbook 3.3), a tree on one side and the chosen entry's fields on the
 * other.
 */
export function ConsoleTemplateEditorPage() {
  return (
    <ConsoleShell requires={CATALOGUE_MANAGE_PERMISSION}>
      <TemplateEditor />
    </ConsoleShell>
  )
}

type Busy = 'save' | 'import' | 'publish' | 'version' | 'format' | null

function TemplateEditor() {
  const { t, i18n } = useTranslation()
  const { code = '' } = useParams()
  const { read, retry } = useConsoleRead<ConsoleTemplateDto>(templatePath(code))
  const names = useConsoleRead<ConsoleBusinessTypeDto[]>(CONSOLE_BUSINESS_TYPES_PATH).read
  const fileRef = useRef<HTMLInputElement>(null)

  const [template, setTemplate] = useState<ConsoleTemplateDto | null>(null)
  const [groups, setGroups] = useState<TemplateGroupDto[]>([])
  const [dirty, setDirty] = useState(false)
  const [selected, setSelected] = useState<NodeRef | null>(null)
  const [viewing, setViewing] = useState<ConsoleTemplateVersionDto | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [rowErrors, setRowErrors] = useState<{ from: 'import' | 'save'; rows: TemplateRowError[] }>(
    { from: 'save', rows: [] },
  )
  const [done, setDone] = useState<string | null>(null)

  /** What the server holds becomes the screen's draft; with no draft yet, the published one. */
  const apply = (dto: ConsoleTemplateDto) => {
    setTemplate(dto)
    setGroups(dto.draft?.groups ?? dto.published?.groups ?? [])
    setDirty(false)
    setSelected(null)
    setConflict(false)
  }

  useEffect(() => {
    if (read.status === 'ready') apply(read.data)
  }, [read])

  const sub =
    names.status === 'ready'
      ? names.data.flatMap((type) => type.subTypes).find((entry) => entry.code === code)
      : undefined
  const subName = sub?.nameEn ?? code

  const edit = (next: TemplateGroupDto[], select?: NodeRef | null) => {
    setGroups(next)
    setDirty(true)
    setDone(null)
    if (select !== undefined) setSelected(select)
  }

  const fail = (error: unknown, from: 'import' | 'save') => {
    const rows = templateRowErrors(error)
    setRowErrors({ from, rows })
    setConflict(error instanceof ApiError && error.problemType === TEMPLATE_DRAFT_CONFLICT)
    setRefusal(refusalKey(error))
  }

  const begin = (what: Busy) => {
    setBusy(what)
    setRefusal(null)
    setDone(null)
    setRowErrors({ from: 'save', rows: [] })
  }

  const expectedRevision = template?.draft?.revision ?? 0

  const saveDraft = async () => {
    begin('save')
    try {
      apply(await saveTemplateDraft(code, groups, expectedRevision))
      setDone(t(`${K}saved`))
    } catch (error) {
      fail(error, 'save')
    } finally {
      setBusy(null)
    }
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    begin('import')
    try {
      apply(await importTemplateCsv(code, file, expectedRevision))
      setDone(t(`${K}imported`))
    } catch (error) {
      fail(error, 'import')
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const publish = async () => {
    begin('publish')
    try {
      const answer = await publishTemplate(code)
      apply(answer)
      setDone(t(`${K}publishedNow`, { version: answer.versions[0]?.version ?? '' }))
    } catch (error) {
      fail(error, 'save')
    } finally {
      setBusy(null)
    }
  }

  const view = async (version: number) => {
    begin('version')
    try {
      setViewing(await readTemplateVersion(code, version))
      setSelected(null)
    } catch (error) {
      setRefusal(refusalKey(error))
    } finally {
      setBusy(null)
    }
  }

  const downloadFormat = async () => {
    begin('format')
    try {
      saveDownload(await downloadImportFormat(), 'catalogue-template.csv')
    } catch (error) {
      setRefusal(refusalKey(error))
    } finally {
      setBusy(null)
    }
  }

  const frame = (
    <ConsoleSettingsFrame tab="platform" back={{ to: BUSINESS_TYPES_PATH, label: t(`${K}back`) }} />
  )

  if (template === null) {
    return (
      <div className={CONSOLE_PAGE}>
        {frame}
        {read.status === 'failed' ? (
          <ConsoleReadFailure error={read.error} retry={retry} />
        ) : (
          <ConsoleNotice busy body={t(`${K}loading`)} />
        )}
      </div>
    )
  }

  const readOnly = viewing !== null
  const shown = viewing?.groups ?? groups
  const hasDraft = template.draft !== null
  const latest = template.versions[0]
  const errorNodes =
    rowErrors.from === 'save' ? rowErrors.rows.map((row) => nodeOfPath(row.path)) : []

  return (
    <div className={CONSOLE_PAGE}>
      {frame}
      <ConsolePageHeader
        level="section"
        title={t(`${K}title`, { name: subName })}
        subtitle={t(`${K}subtitle`)}
        actions={
          readOnly ? null : (
            <>
              <ConsoleButton
                variant="secondary"
                disabled={busy !== null || dirty}
                onClick={() => fileRef.current?.click()}
              >
                {busy === 'import' ? t(`${K}importing`) : t(`${K}import`)}
              </ConsoleButton>
              <ConsoleButton
                variant="secondary"
                disabled={busy !== null || dirty || !hasDraft}
                onClick={publish}
              >
                {busy === 'publish' ? t(`${K}publishing`) : t(`${K}publish`)}
              </ConsoleButton>
              <ConsoleButton disabled={busy !== null || !dirty} onClick={saveDraft}>
                {busy === 'save' ? t(`${K}saving`) : t(`${K}saveDraft`)}
              </ConsoleButton>
            </>
          )
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label={t(`${K}import`)}
        onChange={(event) => void importFile(event.target.files?.[0])}
      />

      {/* Where the draft stands, and what companies are offered today. */}
      <section className={`${CONSOLE_CARD} flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4`}>
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary">
          <ConsoleStatusPill
            tone={hasDraft ? 'info' : 'neutral'}
            label={t(hasDraft ? `${K}draftPill` : `${K}noDraftPill`)}
          />
          {template.draft
            ? t(`${K}draftLine`, {
                count: template.draft.itemCount,
                date: formatInstant(template.draft.updatedAt, i18n.language),
              })
            : t(`${K}noDraftLine`)}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary">
          <ConsoleStatusPill
            tone={latest ? 'success' : 'neutral'}
            label={t(latest ? `${K}publishedPill` : `${K}notPublishedPill`)}
          />
          {latest
            ? t(`${K}publishedLine`, {
                version: latest.version,
                count: latest.itemCount,
                date: formatInstant(latest.publishedAt, i18n.language),
              })
            : t(`${K}notPublishedLine`)}
        </span>
        <button type="button" className={`${CONSOLE_LINK} ms-auto`} onClick={downloadFormat}>
          {t(`${K}downloadFormat`)}
        </button>
      </section>

      {dirty || readOnly || done || refusal ? (
        <div className="flex flex-col gap-3">
          {dirty && !readOnly ? (
            <Callout tone="info">
              <span>{t(`${K}unsaved`, { count: itemCount(groups) })}</span>
              <button
                type="button"
                className={CONSOLE_LINK}
                onClick={() => template && apply(template)}
              >
                {t(`${K}undo`)}
              </button>
            </Callout>
          ) : null}
          {readOnly && viewing ? (
            <Callout tone="info">
              <span>
                {t(`${K}viewingVersion`, {
                  version: viewing.version,
                  date: formatInstant(viewing.publishedAt, i18n.language),
                })}
              </span>
              <button type="button" className={CONSOLE_LINK} onClick={() => setViewing(null)}>
                {t(`${K}backToDraft`)}
              </button>
            </Callout>
          ) : null}
          {done ? <Callout tone="good">{done}</Callout> : null}
          {refusal ? (
            <Callout tone="bad">
              <span>{t(refusal)}</span>
              {conflict ? (
                <button type="button" className={CONSOLE_LINK} onClick={retry}>
                  {t(`${K}reload`)}
                </button>
              ) : null}
            </Callout>
          ) : null}
          {rowErrors.rows.length > 0 ? (
            <RowErrors from={rowErrors.from} rows={rowErrors.rows} />
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <TemplateTree
          groups={shown}
          selected={selected}
          errorNodes={errorNodes}
          readOnly={readOnly}
          onSelect={setSelected}
          onAddGroup={() => edit([...groups, newGroup(t(`${K}newGroup`))], { g: groups.length })}
        />
        <section className={CONSOLE_CARD}>
          {selected ? (
            <NodeEditor
              key={`${selected.g}.${selected.k ?? ''}.${selected.i ?? ''}.${readOnly}`}
              groups={shown}
              at={selected}
              readOnly={readOnly}
              onChange={(patch) => edit(updateNode(groups, selected, patch))}
              onMove={(by) => {
                const index = selected.i ?? selected.k ?? selected.g
                const to = index + by
                const next =
                  selected.i !== undefined
                    ? { ...selected, i: to }
                    : selected.k !== undefined
                      ? { ...selected, k: to }
                      : { ...selected, g: to }
                edit(moveNode(groups, selected, by), next)
              }}
              onRemove={() => edit(removeNode(groups, selected), null)}
              onAddChild={() => {
                if (selected.k === undefined) {
                  const kinds = groups[selected.g]?.kinds.length ?? 0
                  edit(addKind(groups, selected.g, newKind(t(`${K}newKind`))), {
                    g: selected.g,
                    k: kinds,
                  })
                } else if (selected.i === undefined) {
                  const items = groups[selected.g]?.kinds[selected.k]?.items.length ?? 0
                  edit(addItem(groups, selected.g, selected.k, newItem(t(`${K}newItem`))), {
                    g: selected.g,
                    k: selected.k,
                    i: items,
                  })
                }
              }}
            />
          ) : (
            <p className="px-5 py-12 text-center text-sm font-medium text-text-tertiary">
              {shown.length === 0 ? t(`${K}emptyTemplate`) : t(`${K}pickSomething`)}
            </p>
          )}
        </section>
      </div>

      <Versions
        template={template}
        viewing={viewing?.version ?? null}
        busy={busy !== null}
        onView={view}
      />
    </div>
  )
}

function Callout({ tone, children }: { tone: 'info' | 'good' | 'bad'; children: ReactNode }) {
  const style =
    tone === 'bad'
      ? 'bg-danger-100 text-danger-700'
      : tone === 'good'
        ? 'bg-success-100 text-success-700'
        : 'bg-primary-25 text-primary-800'
  return (
    <p
      role={tone === 'bad' ? 'alert' : 'status'}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm px-4 py-3 text-sm font-medium ${style}`}
    >
      {children}
    </p>
  )
}

/** The rows the server refused, all of them (at most 200), in its order. */
function RowErrors({ from, rows }: { from: 'import' | 'save'; rows: TemplateRowError[] }) {
  const { t } = useTranslation()
  return (
    <section className={CONSOLE_CARD} aria-label={t(`${K}rowErrorsTitle`)}>
      <ConsoleCardHead
        title={t(from === 'import' ? `${K}rowErrorsImport` : `${K}rowErrorsSave`, {
          count: rows.length,
        })}
        note={t(`${K}rowErrorsNote`)}
      />
      <ul className="max-h-[320px] overflow-y-auto">
        {rows.map((row, index) => {
          const fieldKey = fieldWordKey(row.field)
          return (
            <li
              key={index}
              className="border-t border-border-subtle px-5 py-2.5 text-[13px] leading-[1.5] text-text-secondary first:border-t-0"
            >
              <span className="font-semibold text-text-primary">
                {row.row !== null ? t(`${K}row`, { row: row.row }) : t(`${K}entry`)}
                {fieldKey ? ` · ${t(fieldKey)}` : ''}
              </span>
              {/* TODO(backend): CONSOLE.md row 6.1, a code per row error so it can be worded in
                  both languages; until then the server's own sentence is shown. */}
              {row.message ? (
                <span dir="auto" className="ms-2 text-text-muted">
                  {row.message}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function TemplateTree({
  groups,
  selected,
  errorNodes,
  readOnly,
  onSelect,
  onAddGroup,
}: {
  groups: TemplateGroupDto[]
  selected: NodeRef | null
  errorNodes: (NodeRef | null)[]
  readOnly: boolean
  onSelect: (at: NodeRef) => void
  onAddGroup: () => void
}) {
  const { t } = useTranslation()
  const flagged = (at: NodeRef) =>
    errorNodes.some(
      (node) =>
        node !== null &&
        node.g === at.g &&
        (at.k === undefined || node.k === at.k) &&
        (at.i === undefined || node.i === at.i),
    )
  const row = (at: NodeRef, label: string, count: string | null, depth: 0 | 1 | 2) => {
    const on = sameNode(at, selected)
    return (
      <button
        type="button"
        onClick={() => onSelect(at)}
        aria-current={on ? 'true' : undefined}
        className={[
          'flex w-full min-w-0 items-center gap-2 py-2.5 pe-5 text-start text-sm transition-colors',
          depth === 0 ? 'ps-5 font-semibold' : depth === 1 ? 'ps-9 font-medium' : 'ps-[52px]',
          on
            ? 'border-s-[3px] border-s-primary-700 bg-primary-25 text-primary-800'
            : 'text-text-primary hover:bg-primary-25',
        ].join(' ')}
      >
        <bdi className="min-w-0 flex-1 truncate">{label || t(`${K}unnamed`)}</bdi>
        {flagged(at) ? (
          <span
            className="size-2 shrink-0 rounded-full bg-danger-700"
            aria-label={t(`${K}hasErrors`)}
          />
        ) : null}
        {count ? (
          <span className="shrink-0 text-xs font-medium text-text-quaternary">{count}</span>
        ) : null}
      </button>
    )
  }
  return (
    <section className={CONSOLE_CARD}>
      <ConsoleCardHead
        title={t(`${K}treeTitle`)}
        note={t(`${K}treeNote`, { groups: groups.length, items: itemCount(groups) })}
        action={
          readOnly ? null : (
            <button type="button" className={CONSOLE_SMALL} onClick={onAddGroup}>
              {t(`${K}addGroup`)}
            </button>
          )
        }
      />
      {groups.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm font-medium text-text-tertiary">
          {t(`${K}noGroups`)}
        </p>
      ) : (
        <ul className="max-h-[640px] overflow-y-auto py-1">
          {groups.map((group, g) => {
            const open = selected?.g === g
            return (
              <li key={g}>
                {row({ g }, group.name, t(`${K}kindCount`, { count: group.kinds.length }), 0)}
                {open ? (
                  <ul>
                    {group.kinds.map((kind, k) => (
                      <li key={k}>
                        {row(
                          { g, k },
                          kind.name,
                          t(`${K}itemCount`, { count: kind.items.length }),
                          1,
                        )}
                        {selected?.k === k ? (
                          <ul>
                            {kind.items.map((item, i) => (
                              <li key={i}>{row({ g, k, i }, item.name, null, 2)}</li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Versions({
  template,
  viewing,
  busy,
  onView,
}: {
  template: ConsoleTemplateDto
  viewing: number | null
  busy: boolean
  onView: (version: number) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <section className={CONSOLE_CARD}>
      <ConsoleCardHead title={t(`${K}versionsTitle`)} note={t(`${K}versionsNote`)} />
      {template.versions.length === 0 ? (
        <p className="px-5 py-6 text-sm font-medium text-text-tertiary">{t(`${K}noVersions`)}</p>
      ) : (
        <ul>
          {template.versions.map((version, index) => (
            <li
              key={version.version}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 first:border-t-0"
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary">
                <span className="font-semibold text-text-primary">
                  {t(`${K}version`, { version: version.version })}
                </span>
                {index === 0 ? <ConsoleStatusPill tone="success" label={t(`${K}offered`)} /> : null}
                <span>
                  {t(`${K}versionLine`, {
                    count: version.itemCount,
                    date: formatInstant(version.publishedAt, i18n.language),
                  })}
                </span>
              </span>
              <button
                type="button"
                className={CONSOLE_SMALL}
                disabled={busy || viewing === version.version}
                onClick={() => onView(version.version)}
              >
                {viewing === version.version ? t(`${K}viewing`) : t(`${K}view`)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
