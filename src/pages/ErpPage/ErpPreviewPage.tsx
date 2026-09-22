import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ErpShell } from './ErpShell'
import { GUIDED_MAPPING_FORMAT, useErpMapping } from './ErpMappingGate'
import { JsonTree } from './shared/JsonTree'
import { SamplePicker } from './shared/SamplePicker'
import { dryRunGuidedMapping, dryRunMappingProfile, type MappingDryRunDto } from '../../api/erp/mapping'
import { ApiError } from '../../api'
import { shortHash } from '../../lib/erp/mappingState'
import { sessionSamples } from '../../lib/erp/sample'
import infoIcon from '../../assets/settings/info.svg'

/**
 * Settings › Integration › ERP mapping › Preview (docs/erp-and-console-plan.md §2.3, A.3).
 *
 * One sample through the mapping, side by side: what the ERP sent, and the canonical invoice
 * Fawtir would build from it.
 *
 * **The right pane is the engine's answer, verbatim.** It calls the same dry-run the server runs
 * in production — `POST …/guided/dry-run` for a wizard-authored mapping, `POST …/{format}/dry-run`
 * for a hand-written one — and renders the canonical invoice it returns. Nothing is recomputed
 * here. The design mock ran a JavaScript reimplementation of the mapping to draw this pane, which
 * could only ever agree with the real engine by coincidence.
 *
 * **Nothing is submitted.** A dry run writes no ledger row, consumes no invoice number, generates
 * no PINT-OM, dispatches nothing and does not touch certification. That is what makes it safe to
 * run repeatedly while iterating — and it is also why a clean tree here is not a certified
 * invoice: this stops before the five-layer validation, which only a certification run exercises.
 *
 * The chosen sample lives in the URL (`?sample=`) so a link to a preview is a link to *that*
 * preview.
 */
export function ErpPreviewPage() {
  const { t } = useTranslation()
  const view = useErpMapping()
  const [params, setParams] = useSearchParams()
  const samples = useSyncExternalStore(sessionSamples.subscribe, sessionSamples.snapshot)

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<MappingDryRunDto | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [ranFor, setRanFor] = useState<string | null>(null)

  const requested = params.get('sample') ?? ''
  const chosen = samples.find((sample) => sample.id === requested) ?? samples[0]
  const sampleId = chosen?.id ?? ''

  const guided = view.route === 'GUIDED' && view.guided !== null
  // A hand-written profile can be dry-run too, against the stored expression. Only a tenant with
  // neither a guided mapping nor an active profile has nothing to run.
  const canRun = Boolean(chosen) && (guided || view.activeProfile !== null)

  const choose = (id: string) => {
    setParams({ sample: id }, { replace: true })
    setResult(null)
    setFailure(null)
    setRanFor(null)
  }

  /**
   * Runs the sample.
   *
   * The guided route compiles the stored mapping first and answers 409 when it is incomplete,
   * which is a distinct and actionable state — the reader has fields left to map — so it is
   * reported as that rather than as a failure.
   */
  const run = async () => {
    if (!chosen) return
    setRunning(true)
    setResult(null)
    setFailure(null)
    try {
      const answer = guided
        ? await dryRunGuidedMapping(GUIDED_MAPPING_FORMAT, { document: chosen.payload })
        : await dryRunMappingProfile(GUIDED_MAPPING_FORMAT, { document: chosen.payload })
      setResult(answer)
      setRanFor(chosen.id)
    } catch (error: unknown) {
      setFailure(messageOf(error, t))
      setRanFor(chosen.id)
    } finally {
      setRunning(false)
    }
  }

  const fresh = ranFor === sampleId
  const shown = fresh ? result : null
  const shownFailure = fresh ? failure : null

  const filedTone = shownFailure
    ? 'bg-danger-100 text-danger-700'
    : shown
      ? 'bg-success-100 text-[#3d5648]'
      : 'bg-surface-background text-text-tertiary'

  return (
    <ErpShell title={t('erp.preview.title')} subtitle={t('erp.preview.subtitle')}>
      {view.route === 'HAND_WRITTEN' && view.activeProfile ? (
        <Notice>
          <p className="text-sm font-medium leading-[1.5] text-text-secondary">
            {t('erp.preview.handWrittenRunnable')}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-text-quaternary">
            <span dir="ltr" className="font-mono">
              {t('erp.preview.handWrittenHash', {
                hash: shortHash(view.activeProfile.contentHash),
              })}
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

      {view.route === 'NONE' ? (
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
          <SamplePicker samples={samples} value={sampleId} onChange={choose} />
        </div>
        <button
          type="button"
          onClick={run}
          disabled={!canRun || running}
          className="inline-flex h-[50px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-primary-200"
        >
          {running
            ? t('erp.shared.working')
            : shown || shownFailure
              ? t('erp.preview.runAgain')
              : t('erp.preview.run')}
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
          note={chosen?.label}
        >
          {chosen ? (
            <JsonTree value={chosen.payload} />
          ) : (
            <p className="text-sm font-medium text-text-quaternary">{t('erp.preview.noSample')}</p>
          )}
        </Pane>

        {/* What Fawtir would file */}
        <Pane
          tag={t('erp.preview.filedTag')}
          tagTone={filedTone}
          title={t('erp.preview.filed')}
          note={
            shown
              ? t('erp.preview.ranWith', {
                  source: t(`erp.preview.source.${shown.mapping_source}`),
                  hash: shortHash(shown.content_hash),
                })
              : undefined
          }
        >
          {shownFailure ? (
            <Failure message={shownFailure} />
          ) : shown ? (
            <JsonTree value={shown.canonical_invoice} />
          ) : (
            <p className="text-sm font-medium leading-[1.5] text-text-quaternary">
              {canRun ? t('erp.preview.notRun') : t('erp.preview.none')}
            </p>
          )}
        </Pane>
      </div>
    </ErpShell>
  )
}

/**
 * What the engine said when it refused.
 *
 * One message, not a list, because that is what the engine returns: it stops at the first thing
 * that fails and names the PINT-OM field, which is the output the reader is here for. The message
 * never carries payload content — the engine's error hygiene keeps tenant business data out of it
 * — so it is safe to render as it arrived.
 */
function Failure({ message }: { message: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium leading-[1.6] text-danger-700">{message}</p>
      <Link
        to="/settings/erp-mapping/fields"
        className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
      >
        {t('erp.preview.goToFields')}
      </Link>
    </div>
  )
}

/** A 409 means the guided mapping is not finished — a different thing to say than "it failed". */
function messageOf(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return t('erp.preview.incomplete')
    const detail = error.problem.detail
    if (typeof detail === 'string' && detail) return detail
  }
  return t('erp.preview.failed')
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
