import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ErpShell } from './ErpShell'
import { GUIDED_MAPPING_FORMAT, useErpMapping, useErpMappingReload } from './ErpMappingGate'
import { Modal, Select } from '../../components/ui'
import {
  REQUIRED_TARGETS,
  SECTIONS,
  TARGET_BY_ID,
  targetsIn,
  type Section,
  type Target,
} from '../../lib/erpCatalogue'
import {
  MAPPING_SOURCE_SYSTEMS,
  saveGuidedMapping,
  validateGuidedMapping,
  type GuidedMappingRequest,
  type GuidedMappingValidationDto,
  type MappingSourceSystem,
} from '../../api/erp/mapping'
import { ApiError } from '../../api'
import {
  draftOf,
  isBlank,
  isDirty,
  normalise,
  type Draft,
  type DraftEntry,
  type SaveOutcome,
} from '../../lib/erp/draft'
import { NO_READINESS } from '../../lib/erp/mappingState'
import { sourceSystemName } from '../../lib/erp/sourceSystem'
import { flattenKeys, sessionSamples } from '../../lib/erp/sample'
import { FieldRow, ReadOnlyRow } from './fields/FieldRow'
import { SectionCard } from './fields/SectionCard'
import { ReadinessChecklist } from './fields/ReadinessChecklist'
import { errorsFor, jumpTo, rowId, sectionId } from './fields/model'
import { useMappingAccess } from '../../hooks/useErpAccess'

/**
 * How long after the last keystroke the draft is sent for validation.
 *
 * The validate route is a real request behind the gateway's shared rate limit, so edits settle
 * first. Two seconds also matches what a reader reads as "it checked when I stopped typing".
 */
const VALIDATE_AFTER_MS = 2000
const FLASH_MS = 1600

/**
 * Settings › Integration › ERP mapping › Fields (docs/erp-and-console-plan.md §2.2, A.2).
 *
 * One long page, not a stepper: the seven sections in catalogue order, every TENANT_MAPPED term a
 * row, and a readiness checklist that never scrolls away.
 *
 * **The validator is the server's.** The draft is held locally while the reader works and sent to
 * `POST …/guided/validate` two seconds after the last edit; the answer is rendered as it arrives.
 * Nothing here decides whether a mapping is valid — a second validator in the browser would
 * eventually disagree with the one that runs at save time, and the reader would be told their
 * mapping was fine by the screen and refused by the server.
 *
 * Saving sends the version the draft was read at, so a save over someone else's is a 409 and
 * offers a reload rather than silently winning.
 */
export function ErpFieldsPage() {
  const { t } = useTranslation()
  const view = useErpMapping()
  const reloadView = useErpMappingReload()
  const access = useMappingAccess()
  const [params] = useSearchParams()
  const samples = useSyncExternalStore(sessionSamples.subscribe, sessionSamples.snapshot)

  /* ------------------------------------------------------------ the draft */
  const [draft, setDraft] = useState<Draft>(() => draftOf(view.guided))
  const [baseline, setBaseline] = useState<Draft>(() => draftOf(view.guided))
  const [sampleId, setSampleId] = useState('')
  const [readiness, setReadiness] = useState<GuidedMappingValidationDto>(
    () => view.readiness ?? NO_READINESS,
  )
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveOutcome | null>(null)
  const [stale, setStale] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const opened = params.get('open')?.split(':') ?? []
  const pickerFor = opened[0] === 'picker' ? opened[1] : undefined

  const dirty = useMemo(() => isDirty(draft, baseline), [draft, baseline])

  const sample = samples.find((s) => s.id === sampleId) ?? samples[0]
  const keys = useMemo(() => (sample ? flattenKeys(sample.payload) : []), [sample])
  const byTerm = useMemo(
    () => new Map(draft.entries.map((entry) => [entry.businessTermId, entry])),
    [draft.entries],
  )

  const requestOf = (next: Draft): GuidedMappingRequest => ({
    sourceSystem: next.sourceSystem,
    expectedVersion: next.version,
    mappings: next.entries,
  })

  /* ------------------------------------- validation, 2 s after the last edit */
  const skipValidate = useRef(true)
  useEffect(() => {
    if (skipValidate.current) {
      skipValidate.current = false
      return
    }
    // Validate is a mapping.manage route; a reader's edit would only earn a 403 every 2 s.
    if (!access.manage) return
    setChecking(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      validateGuidedMapping(GUIDED_MAPPING_FORMAT, requestOf(draft), {
        signal: controller.signal,
      })
        .then((answer) => {
          setReadiness(answer)
          setChecking(false)
        })
        .catch((error: unknown) => {
          // An abort is this effect being superseded by a newer edit, not a failure to report.
          if (controller.signal.aborted) return
          setChecking(false)
          setFailure(describe(error, t))
        })
    }, VALIDATE_AFTER_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // requestOf and draft.sourceSystem are covered by `draft`; t is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const update = (businessTermId: string, patch: Partial<DraftEntry>) => {
    setResult(null)
    setFailure(null)
    setDraft((current) => {
      const index = current.entries.findIndex((e) => e.businessTermId === businessTermId)
      const base: DraftEntry =
        index >= 0
          ? current.entries[index]
          : {
              businessTermId,
              ordinal: current.entries.reduce((max, e) => Math.max(max, e.ordinal), -1) + 1,
            }
      const next = normalise({ ...base, ...patch })
      const entries = isBlank(next)
        ? index >= 0
          ? current.entries.filter((_, i) => i !== index)
          : current.entries
        : index >= 0
          ? current.entries.map((e, i) => (i === index ? next : e))
          : [...current.entries, next]
      return { ...current, entries }
    })
  }

  /**
   * Saves the draft.
   *
   * Three answers matter. A 409 means someone else saved first and the only safe move is to re-read
   * — offering to merge would mean guessing which of two mappings the reader meant. A 400 is a
   * structurally invalid entry, and the server's sentence is shown as it arrived. Anything else
   * succeeded, and whether it also compiled and activated a profile is what the server's
   * `readyForActivation` says, not something inferred here.
   */
  const save = async () => {
    setSaving(true)
    setFailure(null)
    try {
      const answer = await saveGuidedMapping(GUIDED_MAPPING_FORMAT, requestOf(draft))
      setReadiness(answer)
      setChecking(false)
      setResult({
        status: answer.readyForActivation ? 'activated' : 'draft',
        readiness: answer,
      })
      skipValidate.current = true
      setBaseline(draft)
      // The roll-up above — status pill, subnav badges, profile list — is now behind.
      reloadView()
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409) {
        setStale(true)
        return
      }
      if (error instanceof ApiError && error.status === 400) {
        setResult({ status: 'refused', message: refusalOf(error, t) })
        return
      }
      setFailure(describe(error, t))
    } finally {
      setSaving(false)
    }
  }

  /** Discards the local draft and takes the server's copy, after a lost race or on demand. */
  const reload = () => {
    skipValidate.current = true
    const fresh = draftOf(view.guided)
    setDraft(fresh)
    setBaseline(fresh)
    setReadiness(view.readiness ?? NO_READINESS)
    setChecking(false)
    setResult(null)
    setStale(false)
    setFailure(null)
    reloadView()
  }

  const jumpToRow = (businessTermId: string) => {
    jumpTo(rowId(businessTermId))
    setFlash(businessTermId)
    window.setTimeout(
      () => setFlash((current) => (current === businessTermId ? null : current)),
      FLASH_MS,
    )
  }

  /* ------------------------------------------------------------ per section */
  // A required term with an entry the validator refuses is not mapped yet: counting it made a
  // section read "4/4" in green while one of its four was flagged invalid.
  const invalidTerms = new Set(readiness.invalidMappings.map((mapping) => mapping.businessTermId))
  const sectionCounts = (section: Section) => {
    const required = REQUIRED_TARGETS.filter((target) => target.section === section)
    const mapped = required.filter(
      (target) =>
        readiness.mappedRequiredTargets.includes(target.id) && !invalidTerms.has(target.id),
    )
    // Sections with nothing required (Payment) still say how many of their fields are filled.
    const filled = draft.entries.filter(
      (entry) => TARGET_BY_ID[entry.businessTermId]?.section === section,
    ).length
    // Any refused entry in the section, required or not (IBT-009 is optional), keeps it from
    // reading as done: the chip then says so instead of showing a green 4/4.
    const invalid = readiness.invalidMappings.filter(
      (mapping) =>
        mapping.businessTermId !== null && TARGET_BY_ID[mapping.businessTermId]?.section === section,
    ).length
    return { mapped: mapped.length, total: required.length, filled, invalid }
  }

  const row = (target: Target, inGroup = false) =>
    target.origin === 'TENANT_MAPPED' ? (
      <FieldRow
        key={target.id}
        target={target}
        entry={byTerm.get(target.id)}
        errors={errorsFor(readiness.invalidMappings, target.id)}
        keys={keys}
        hasSample={Boolean(sample)}
        onChange={(patch) => update(target.id, patch)}
        initialPickerOpen={pickerFor === target.id}
        flash={flash === target.id}
        inGroup={inGroup}
      />
    ) : (
      <ReadOnlyRow key={target.id} target={target} />
    )

  /** Catalogue order, except that an `eitherOf` pair is drawn together as one requirement. */
  const rowsFor = (section: Section) => {
    const targets = targetsIn(section)
    const drawn = new Set<string>()
    return targets.map((target) => {
      if (drawn.has(target.id)) return null
      drawn.add(target.id)
      const partner = target.eitherOf ? TARGET_BY_ID[target.eitherOf] : undefined
      if (!partner || partner.section !== section) return row(target)
      drawn.add(partner.id)
      return (
        <li
          key={`${target.id}+${partner.id}`}
          className="border-t border-surface-background px-5 py-4"
        >
          <div className="rounded-sm border border-primary-200 bg-primary-25/40">
            <div className="px-5 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-primary-800">
                {t('erp.fields.eitherOf')}
              </p>
              <p className="mt-0.5 text-xs font-medium leading-[1.5] text-text-quaternary">
                {t('erp.fields.eitherOfNote')}
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-primary-100">
              {row(target, true)}
              {row(partner, true)}
            </ul>
          </div>
        </li>
      )
    })
  }

  return (
    <ErpShell title={t('erp.fields.title')} subtitle={t('erp.fields.subtitle')}>
      {failure ? (
        <p role="alert" className="rounded-md bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* The sections */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Source system and sample */}
          <section className="rounded-md bg-surface-card p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-text-secondary">
                  {t('erp.fields.sourceSystem')}
                  <span className="font-normal text-text-quaternary">
                    {t('erp.fields.sourceSystemNote')}
                  </span>
                </span>
                <Select
                  ariaLabel={t('erp.fields.sourceSystem')}
                  value={draft.sourceSystem}
                  onChange={(value) => {
                    setResult(null)
                    setDraft((current) => ({
                      ...current,
                      sourceSystem: value as MappingSourceSystem,
                    }))
                  }}
                  options={MAPPING_SOURCE_SYSTEMS.map((system) => ({
                    value: system,
                    label: sourceSystemName(t, system),
                  }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-text-secondary">
                  {t('erp.fields.sample')}
                  <span className="font-normal text-text-quaternary">
                    {t('erp.unsupported.SAMPLES')}
                  </span>
                </span>
                {samples.length > 0 ? (
                  <Select
                    ariaLabel={t('erp.fields.sample')}
                    value={sample?.id ?? ''}
                    onChange={setSampleId}
                    options={samples.map((s) => ({
                      value: s.id,
                      label: s.label,
                      hint: t('erp.fields.sampleHint', { count: flattenKeys(s.payload).length }),
                    }))}
                  />
                ) : (
                  <p className="flex min-h-[50px] items-center rounded-sm border border-dashed border-border-default px-4 text-sm font-medium text-text-quaternary">
                    <span>
                      {t('erp.fields.noSample')}{' '}
                      <Link
                        to="/settings/erp-mapping/samples"
                        className="font-semibold text-primary-700 hover:text-primary-800"
                      >
                        {t('erp.fields.uploadSample')}
                      </Link>
                    </span>
                  </p>
                )}
              </label>
            </div>
          </section>

          {/* Anchor strip — sticks under the top of the scrolling main on desktop */}
          <nav
            aria-label={t('erp.fields.sections')}
            className="flex items-center gap-1 overflow-x-auto rounded-md bg-surface-card px-2 lg:sticky lg:top-0 lg:z-10"
          >
            {SECTIONS.map((section) => {
              const { mapped, total, filled, invalid } = sectionCounts(section)
              const complete = (total === 0 || mapped === total) && invalid === 0
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => jumpTo(sectionId(section))}
                  className="inline-flex h-[42px] shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-text-quaternary transition-colors hover:text-text-secondary"
                >
                  {t(`erp.section.${section}`)}
                  {total > 0 ? (
                    <span
                      className={[
                        'inline-flex h-[18px] items-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                        invalid > 0
                          ? 'bg-danger-100 text-danger-700'
                          : complete
                            ? 'bg-success-100 text-[#3d5648]'
                            : 'bg-pending-100 text-pending-700',
                      ].join(' ')}
                    >
                      {mapped}/{total}
                    </span>
                  ) : (
                    <span
                      title={t('erp.fields.filledCount', { count: filled })}
                      className="inline-flex h-[18px] items-center rounded-full bg-surface-background px-1.5 text-[10px] font-semibold text-text-tertiary tabular-nums"
                    >
                      {filled}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {SECTIONS.map((section) => {
            const { mapped, total, filled, invalid } = sectionCounts(section)
            return (
              <SectionCard
                key={section}
                section={section}
                mapped={mapped}
                total={total}
                filled={filled}
                invalid={invalid}
              >
                {rowsFor(section)}
              </SectionCard>
            )
          })}
        </div>

        {/* The checklist */}
        <aside className="w-full lg:sticky lg:top-0 lg:w-[320px] lg:shrink-0 lg:self-start">
          <ReadinessChecklist
            readiness={readiness}
            checking={checking}
            dirty={dirty}
            result={result}
            version={baseline.version}
            saving={saving}
            onSave={access.manage ? save : undefined}
            onJump={jumpToRow}
          />
        </aside>
      </div>

      <Modal
        open={stale}
        onClose={() => setStale(false)}
        title={t('erp.fields.staleTitle')}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setStale(false)}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={reload}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t('erp.fields.reload')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {t('erp.fields.staleBodyServer')}
        </p>
      </Modal>
    </ErpShell>
  )
}

/**
 * The server's refusal sentence.
 *
 * Fawtir's validation problems carry `detail`; this route's refusal is one sentence naming the
 * error code and the term, which is more use to a reader than any generic copy would be. Falls
 * back to translated copy only when the body carried nothing.
 */
function refusalOf(error: ApiError, t: (key: string) => string): string {
  const detail = error.problem.detail
  return typeof detail === 'string' && detail ? detail : t('erp.fields.saveRefusedGeneric')
}

function describe(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    const detail = error.problem.detail
    if (typeof detail === 'string' && detail) return detail
  }
  return t('erp.fields.requestFailed')
}
