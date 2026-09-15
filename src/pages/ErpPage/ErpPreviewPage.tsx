import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ErpShell } from './ErpShell'
import { JsonTree } from './shared/JsonTree'
import { SamplePicker } from './shared/SamplePicker'
import { termForCanonicalPath, termLabel } from './shared/RuleFindingsTable'
import {
  activeProfile,
  dryRun,
  mappingRoute,
  sampleById,
  shortHash,
  useErpMapping,
  type DryRunError,
} from '../../lib/erpMapping'
import { TARGET_BY_ID } from '../../lib/erpCatalogue'
import infoIcon from '../../assets/settings/info.svg'

/**
 * Settings › Integration › ERP mapping › Preview (docs/erp-and-console-plan.md §2.3, A.3).
 *
 * One sample through the guided mapping, side by side: what the ERP sent and what Fawtir would
 * file. When the mapping refuses, the right pane is the list of refusals, each one a link back
 * into the wizard at the term that caused it. This is level 3 — the mapping and the canonical
 * model, not the Authority's Schematron — and the screen says so rather than let a clean tree
 * read as a certified invoice.
 *
 * The chosen sample lives in the URL (`?sample=`) so a link to a preview is a link to *that*
 * preview; `?run=1` runs it on arrival.
 */
export function ErpPreviewPage() {
  const { t, i18n } = useTranslation()
  const state = useErpMapping()
  const [params, setParams] = useSearchParams()

  const route = mappingRoute(state)
  const active = activeProfile(state)
  const hasGuided = state.guided && state.entries.length > 0
  const canRun = hasGuided && route !== 'HAND_WRITTEN'

  const requested = params.get('sample') ?? ''
  const sampleId = sampleById(state, requested) ? requested : (state.samples[0]?.id ?? '')
  const sample = sampleById(state, sampleId)

  const [ranFor, setRanFor] = useState<string | null>(
    params.get('run') === '1' && canRun ? sampleId : null,
  )
  const result = useMemo(
    () => (canRun && sample && ranFor === sample.id ? dryRun(state.entries, sample.payload) : null),
    [canRun, sample, ranFor, state.entries],
  )

  const choose = (id: string) => {
    setParams({ sample: id }, { replace: true })
    setRanFor(null)
  }
  const run = () => {
    if (!sample) return
    setParams({ sample: sample.id, run: '1' }, { replace: true })
    setRanFor(sample.id)
  }

  const filedTone = result
    ? result.errors.length
      ? 'bg-danger-100 text-danger-700'
      : 'bg-success-100 text-[#3d5648]'
    : 'bg-surface-background text-text-tertiary'
  const filedNote = result
    ? result.errors.length
      ? t('erp.preview.errorsHeadline', { count: result.errors.length })
      : t('erp.preview.passedNote')
    : undefined

  return (
    <ErpShell title={t('erp.preview.title')} subtitle={t('erp.preview.subtitle')}>
      {route === 'HAND_WRITTEN' && active ? (
        <Notice>
          <p className="text-sm font-medium leading-[1.5] text-text-secondary">
            {t('erp.preview.handWritten')}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-text-quaternary">
            <span dir="ltr" className="font-mono">
              {t('erp.preview.handWrittenHash', { hash: shortHash(active.contentHash) })}
            </span>
            <Link
              to="/settings/erp-mapping/advanced"
              className="font-semibold text-primary-700 hover:text-primary-800"
            >
              {t('erp.preview.openAdvanced')}
            </Link>
          </p>
        </Notice>
      ) : null}

      {!hasGuided && route !== 'HAND_WRITTEN' ? (
        <Notice>
          <p className="text-sm font-medium leading-[1.5] text-text-secondary">
            {t('erp.preview.none')}
          </p>
          <Link
            to="/settings/erp-mapping/fields"
            className="mt-1.5 inline-block text-xs font-semibold text-primary-700 hover:text-primary-800"
          >
            {t('erp.preview.goToFields')}
          </Link>
        </Notice>
      ) : null}

      {/* Toolbar */}
      <section className="flex flex-wrap items-end gap-3 rounded-md bg-surface-card p-5">
        <div className="w-full max-w-[460px] max-lg:max-w-none">
          <SamplePicker samples={state.samples} value={sampleId} onChange={choose} />
        </div>
        <button
          type="button"
          onClick={run}
          disabled={!sample || !canRun}
          className="inline-flex h-[50px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-primary-200"
        >
          {result ? t('erp.preview.runAgain') : t('erp.preview.run')}
        </button>
        <div className="ms-auto flex flex-col items-end gap-1 max-lg:w-full max-lg:items-start">
          <span
            dir="ltr"
            className="inline-flex h-[24px] items-center rounded-[3px] bg-primary-50 px-2 font-mono text-[11px] font-semibold text-primary-800"
          >
            {t('erp.preview.level')}
          </span>
          <span className="text-xs font-medium text-text-quaternary">
            {t('erp.preview.levelNote')}
          </span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* What the ERP sent */}
        <Pane
          tag={t('erp.preview.sentTag')}
          tagTone="bg-primary-50 text-primary-800"
          title={t('erp.preview.sent')}
          note={sample?.label}
        >
          {sample ? (
            <JsonTree value={sample.payload} />
          ) : (
            <p className="text-sm font-medium text-text-quaternary">{t('erp.preview.noSample')}</p>
          )}
        </Pane>

        {/* What Fawtir would file */}
        <Pane
          tag={t('erp.preview.filedTag')}
          tagTone={filedTone}
          title={t('erp.preview.filed')}
          note={filedNote}
        >
          {!result ? (
            <p className="text-sm font-medium leading-[1.5] text-text-quaternary">
              {route === 'HAND_WRITTEN'
                ? t('erp.preview.handWrittenShort')
                : canRun
                  ? t('erp.preview.notRun')
                  : t('erp.preview.none')}
            </p>
          ) : result.errors.length ? (
            <Refusals
              errors={result.errors}
              canonical={result.canonical}
              language={i18n.language}
            />
          ) : (
            <>
              <JsonTree value={result.canonical} />
              {result.notes.length ? <Notes notes={result.notes} /> : null}
            </>
          )}
        </Pane>
      </div>
    </ErpShell>
  )
}

/* A refusal per line, each pointing back into the wizard. */
function Refusals({
  errors,
  canonical,
  language,
}: {
  errors: DryRunError[]
  canonical: Record<string, unknown> | null
  language: string
}) {
  const { t } = useTranslation()
  const [showPartial, setShowPartial] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-surface-background rounded-sm border border-surface-background">
        {errors.map((error, index) => {
          const term =
            (error.businessTermId ? TARGET_BY_ID[error.businessTermId] : undefined) ??
            termForCanonicalPath(error.field)
          return (
            <li
              key={`${error.field}-${error.messageKey}-${index}`}
              className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span dir="ltr" className="font-mono text-[11px] font-semibold text-text-primary">
                    {error.field}
                  </span>
                  {term ? (
                    <span className="inline-flex h-[22px] items-center rounded-[3px] bg-surface-background px-2 text-[11px] font-medium text-text-tertiary">
                      {termLabel(term, language)}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm font-medium leading-[1.5] text-danger-700">
                  {t(error.messageKey, error.values)}
                </p>
              </div>
              {term ? (
                <Link
                  to={`/settings/erp-mapping/fields#${term.id}`}
                  className="shrink-0 whitespace-nowrap text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                >
                  {t('erp.shared.goToField')}
                </Link>
              ) : null}
            </li>
          )
        })}
      </ul>
      {canonical ? (
        <div>
          <button
            type="button"
            onClick={() => setShowPartial((current) => !current)}
            aria-expanded={showPartial}
            className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
          >
            {showPartial ? t('erp.preview.hidePartial') : t('erp.preview.showPartial')}
          </button>
          {showPartial ? (
            <div className="mt-3">
              <JsonTree value={canonical} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/* Transforms the mock cannot run; the server will. */
function Notes({ notes }: { notes: DryRunError[] }) {
  const { t } = useTranslation()
  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
        {t('erp.preview.notes')}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {notes.map((note, index) => (
          <li
            key={`${note.field}-${index}`}
            className="text-xs font-medium leading-[1.5] text-text-quaternary"
          >
            <span dir="ltr" className="font-mono text-[11px]">
              {note.field}
            </span>
            {' · '}
            {t(note.messageKey, note.values)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Pane({
  tag,
  tagTone,
  title,
  note,
  children,
}: {
  tag: string
  tagTone: string
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center gap-2.5 p-5">
        <span
          className={[
            'inline-flex h-[22px] items-center rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.5px]',
            tagTone,
          ].join(' ')}
        >
          {tag}
        </span>
        <span className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</span>
        {note ? <span className="text-xs font-medium text-text-quaternary">{note}</span> : null}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border border-pending-200 bg-pending-100/60 p-4">
      <img src={infoIcon} alt="" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
