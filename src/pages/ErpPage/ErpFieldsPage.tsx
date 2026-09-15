import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ErpShell } from './ErpShell'
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
  SOURCE_SYSTEMS,
  flattenKeys,
  mappingStore,
  useErpMapping,
  validate,
  type Entry,
  type Readiness,
  type SaveResult,
  type SourceSystem,
} from '../../lib/erpMapping'
import { FieldRow, ReadOnlyRow } from './fields/FieldRow'
import { SectionCard } from './fields/SectionCard'
import { ReadinessChecklist } from './fields/ReadinessChecklist'
import { ValueMapModal } from './fields/ValueMapModal'
import { errorsFor, isBlank, jumpTo, normalise, rowId, sectionId } from './fields/model'

/** The backend rate-limits validation (30 req/min shared), so edits settle before it runs. */
const VALIDATE_AFTER_MS = 2000
const FLASH_MS = 1600

/**
 * Settings › Integration › ERP mapping › Fields (docs/erp-and-console-plan.md §2.2, A.2).
 *
 * One long page, not a stepper: the seven sections in catalogue order, every TENANT_MAPPED term
 * a row, and a readiness checklist that never scrolls away. The draft is local — copied from the
 * store on arrival, validated two seconds after the last edit, written back with the version it
 * was read at so a save over someone else's is refused rather than silently winning.
 */
export function ErpFieldsPage() {
  const { t } = useTranslation()
  const state = useErpMapping()
  const [params] = useSearchParams()

  /* ------------------------------------------------------------ the draft */
  const [draft, setDraft] = useState<Entry[]>(() => state.entries)
  const [sourceSystem, setSourceSystem] = useState<SourceSystem>(state.sourceSystem)
  const [baseline, setBaseline] = useState(() => ({
    entries: state.entries,
    sourceSystem: state.sourceSystem,
    version: state.version,
  }))
  const [sampleId, setSampleId] = useState(state.samples[0]?.id ?? '')
  const [readiness, setReadiness] = useState<Readiness>(() => validate(state.entries))
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)
  const [stale, setStale] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const opened = params.get('open')?.split(':') ?? []
  const [valueMapFor, setValueMapFor] = useState<string | null>(
    opened[0] === 'valueMap' && TARGET_BY_ID[opened[1]] ? opened[1] : null,
  )
  const pickerFor = opened[0] === 'picker' ? opened[1] : undefined

  const dirty = useMemo(
    () =>
      sourceSystem !== baseline.sourceSystem ||
      JSON.stringify(draft) !== JSON.stringify(baseline.entries),
    [draft, sourceSystem, baseline],
  )

  const sample = state.samples.find((s) => s.id === sampleId) ?? state.samples[0]
  const keys = useMemo(() => (sample ? flattenKeys(sample.payload) : []), [sample])
  const byTerm = useMemo(() => new Map(draft.map((e) => [e.businessTermId, e])), [draft])

  /* --------------------------------------------- validation, 2 s after idle */
  const skipValidate = useRef(true)
  useEffect(() => {
    if (skipValidate.current) {
      skipValidate.current = false
      return
    }
    setChecking(true)
    const timer = window.setTimeout(() => {
      setReadiness(validate(draft))
      setChecking(false)
    }, VALIDATE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [draft])

  /* ------------------------------------------------- after a save, re-sync */
  const resync = useRef(false)
  useEffect(() => {
    if (!resync.current) return
    resync.current = false
    skipValidate.current = true
    setDraft(state.entries)
    setSourceSystem(state.sourceSystem)
    setBaseline({
      entries: state.entries,
      sourceSystem: state.sourceSystem,
      version: state.version,
    })
  }, [state.entries, state.sourceSystem, state.version])

  const update = (businessTermId: string, patch: Partial<Entry>) => {
    setResult(null)
    setDraft((current) => {
      const index = current.findIndex((e) => e.businessTermId === businessTermId)
      const base: Entry =
        index >= 0
          ? current[index]
          : {
              businessTermId,
              onUnmapped: 'FAIL',
              ordinal: current.reduce((max, e) => Math.max(max, e.ordinal), -1) + 1,
            }
      const next = normalise({ ...base, ...patch })
      if (isBlank(next)) return index >= 0 ? current.filter((_, i) => i !== index) : current
      if (index >= 0) return current.map((e, i) => (i === index ? next : e))
      return [...current, next]
    })
  }

  const save = () => {
    const outcome = mappingStore.saveGuided(draft, sourceSystem, baseline.version)
    if (outcome === 'stale') {
      setStale(true)
      return
    }
    setResult(outcome)
    setReadiness(outcome.readiness)
    setChecking(false)
    if (outcome.status !== 'refused') resync.current = true
  }

  const reload = () => {
    skipValidate.current = true
    setDraft(state.entries)
    setSourceSystem(state.sourceSystem)
    setBaseline({
      entries: state.entries,
      sourceSystem: state.sourceSystem,
      version: state.version,
    })
    setReadiness(validate(state.entries))
    setChecking(false)
    setResult(null)
    setStale(false)
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
  const sectionCounts = (section: Section) => {
    const required = REQUIRED_TARGETS.filter((target) => target.section === section)
    const mapped = required.filter((target) => readiness.mappedRequired.includes(target.id))
    return { mapped: mapped.length, total: required.length }
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
        onOpenValueMap={() => setValueMapFor(target.id)}
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

  const valueMapTarget = valueMapFor ? TARGET_BY_ID[valueMapFor] : undefined

  return (
    <ErpShell title={t('erp.fields.title')} subtitle={t('erp.fields.subtitle')}>
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
                  value={sourceSystem}
                  onChange={(value) => {
                    setResult(null)
                    setSourceSystem(value as SourceSystem)
                  }}
                  options={SOURCE_SYSTEMS.map((system) => ({
                    value: system,
                    label: t(`erp.sourceSystem.${system}`),
                  }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-text-secondary">
                  {t('erp.fields.sample')}
                  <span className="font-normal text-text-quaternary">
                    {t('erp.fields.sampleNote')}
                  </span>
                </span>
                {state.samples.length > 0 ? (
                  <Select
                    ariaLabel={t('erp.fields.sample')}
                    value={sample?.id ?? ''}
                    onChange={setSampleId}
                    options={state.samples.map((s) => ({
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
              const { mapped, total } = sectionCounts(section)
              const complete = total === 0 || mapped === total
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
                        complete
                          ? 'bg-success-100 text-[#3d5648]'
                          : 'bg-pending-100 text-pending-700',
                      ].join(' ')}
                    >
                      {mapped}/{total}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>

          {SECTIONS.map((section) => {
            const { mapped, total } = sectionCounts(section)
            return (
              <SectionCard key={section} section={section} mapped={mapped} total={total}>
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
            onSave={save}
            onJump={jumpToRow}
          />
        </aside>
      </div>

      {valueMapTarget ? (
        <ValueMapModal
          key={valueMapTarget.id}
          open
          onClose={() => setValueMapFor(null)}
          target={valueMapTarget}
          entry={byTerm.get(valueMapTarget.id)}
          sample={sample}
          onSave={(patch) => update(valueMapTarget.id, patch)}
        />
      ) : null}

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
          {t('erp.fields.staleBody', { version: state.version })}
        </p>
      </Modal>
    </ErpShell>
  )
}
