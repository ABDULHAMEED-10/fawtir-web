import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { ErpShell, Pill } from './ErpShell'
import { GUIDED_MAPPING_FORMAT, useErpMapping, useErpMappingReload } from './ErpMappingGate'
import { CodeEditor } from './shared/CodeEditor'
import { SamplePicker } from './shared/SamplePicker'
import { Button, Input, Modal } from '../../components/ui'
import {
  deactivateMappingProfile,
  dryRunMappingProfile,
  saveMappingProfile,
  type MappingDryRunDto,
} from '../../api/erp/mapping'
import { ApiError } from '../../api'
import { handWritten } from '../../lib/erp/draft'
import { shortHash } from '../../lib/erp/mappingState'
import { sessionSamples } from '../../lib/erp/sample'
import infoIcon from '../../assets/settings/info.svg'
import downloadIcon from '../../assets/settings/download-ink.svg'

/** How long the editor waits after the last keystroke before parking the draft for this visit. */
const DRAFT_DEBOUNCE_MS = 300

type Outcome =
  | { kind: 'saved'; version: number; hash: string }
  | { kind: 'refused'; message: string }
  | { kind: 'deactivated' }
  | { kind: 'dryRun'; result: MappingDryRunDto }
  | { kind: 'dryRunFailed'; message: string }

/**
 * Settings › Integration › ERP mapping › Advanced (docs/erp-and-console-plan.md §2.5, A.5).
 *
 * The hand-written expression, for the invoices the guided mapping cannot express. Saving here
 * makes this text the thing that runs; the banner says so while a guided mapping also exists,
 * because the two are not merged — one replaces the other.
 *
 * **The expression is compiled by the server before it is stored.** A malformed one is refused
 * here with the engine's own message, rather than first failing on a real tax document. Dry run
 * sends the *unsaved* text as a supplied expression, which is precisely what that endpoint is for:
 * it runs in the production engine and is never persisted, so iterating cannot change what the
 * tenant's live invoices are mapped by.
 *
 * Nothing here computes a content hash locally. The hash is the server's SHA-256 of the stored
 * content, it is what certification is keyed on, and a lookalike computed in the browser would be
 * a number that means nothing.
 */
export function ErpAdvancedPage() {
  const { t } = useTranslation()
  const view = useErpMapping()
  const reload = useErpMappingReload()
  const samples = useSyncExternalStore(sessionSamples.subscribe, sessionSamples.snapshot)

  const active = view.activeProfile
  const hasGuided = (view.guided?.mappings.length ?? 0) > 0

  const [text, setText] = useState(() => handWritten.read() || active?.content || '')
  const [erpKey, setErpKey] = useState(
    () => active?.erpKey ?? view.guided?.sourceSystem ?? 'CUSTOM',
  )
  const [sampleId, setSampleId] = useState(samples[0]?.id ?? '')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  /* Park the draft for this visit, debounced; flush whatever is pending on unmount. */
  const latest = useRef(text)
  useEffect(() => {
    latest.current = text
    const timer = window.setTimeout(() => handWritten.write(text), DRAFT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text])
  useEffect(() => () => handWritten.write(latest.current), [])

  const edit = (next: string) => {
    setText(next)
    setOutcome((current) => (current?.kind === 'refused' ? null : current))
  }

  const sample = samples.find((s) => s.id === sampleId)

  /** Runs the unsaved text against a sample, in the engine, without storing anything. */
  const dryRun = async () => {
    if (!sample) return
    setBusy(true)
    setOutcome(null)
    try {
      const result = await dryRunMappingProfile(GUIDED_MAPPING_FORMAT, {
        document: sample.payload,
        content: text,
      })
      setOutcome({ kind: 'dryRun', result })
    } catch (error: unknown) {
      setOutcome({ kind: 'dryRunFailed', message: messageOf(error, t) })
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setOutcome(null)
    try {
      const saved = await saveMappingProfile(GUIDED_MAPPING_FORMAT, {
        content: text,
        erpKey: erpKey.trim() || undefined,
      })
      setOutcome({ kind: 'saved', version: saved.version, hash: saved.contentHash })
      handWritten.clear()
      reload()
    } catch (error: unknown) {
      setOutcome({ kind: 'refused', message: messageOf(error, t) })
    } finally {
      setBusy(false)
    }
  }

  const download = () => {
    const blob = new Blob([text], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `fawtir-profile-${(erpKey.trim() || 'profile').replace(/[^\w.-]+/g, '-')}.jsonata`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const deactivate = async () => {
    setBusy(true)
    try {
      await deactivateMappingProfile(GUIDED_MAPPING_FORMAT)
      setConfirming(false)
      setOutcome({ kind: 'deactivated' })
      reload()
    } catch (error: unknown) {
      // Closing the dialog is what lets the refusal be read; left open it hid the only answer.
      setConfirming(false)
      setOutcome({ kind: 'refused', message: messageOf(error, t) })
    } finally {
      setBusy(false)
    }
  }

  const refused = outcome?.kind === 'refused'

  return (
    <ErpShell title={t('erp.advanced.title')} subtitle={t('erp.advanced.subtitle')}>
      {hasGuided ? (
        <div className="flex gap-3 rounded-md border border-pending-200 bg-pending-100/60 p-4">
          <img src={infoIcon} alt="" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p className="text-sm font-medium leading-[1.5] text-text-secondary">
            {t('erp.advanced.banner')}
          </p>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-md bg-surface-card">
        {/* What runs now */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-background p-5">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t('erp.advanced.editor')}
            </h3>
            <p className="mt-0.5 text-xs font-medium text-text-quaternary">
              {t('erp.advanced.editorHint')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-medium text-text-quaternary">
              {t('erp.advanced.runsNow')}
            </span>
            <Pill
              tone={
                view.route === 'NONE' ? 'danger' : view.route === 'GUIDED' ? 'success' : 'pending'
              }
              label={t(`erp.route.${view.route}`)}
            />
            {active ? (
              <span dir="ltr" className="font-mono text-[11px] font-medium text-text-secondary">
                {t('erp.advanced.activeLine', {
                  version: active.version,
                  hash: shortHash(active.contentHash),
                })}
              </span>
            ) : (
              <span className="text-xs font-medium text-danger-700">
                {t('erp.advanced.nothingActive')}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              bordered
              label={t('erp.advanced.erpKey')}
              hint={t('erp.advanced.erpKeyHint')}
              value={erpKey}
              onChange={(event) => setErpKey(event.target.value)}
              dir="ltr"
              className="font-mono"
              maxLength={64}
            />
            <SamplePicker
              samples={samples}
              value={sampleId}
              onChange={setSampleId}
              label={t('erp.advanced.dryRunSample')}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="erp-profile-text" className="text-sm font-medium text-text-primary">
              {t('erp.advanced.profileText')}
            </label>
            <CodeEditor
              id="erp-profile-text"
              value={text}
              onChange={edit}
              ariaLabel={t('erp.advanced.profileText')}
              invalid={refused}
            />
            <p className="text-[10px] font-medium leading-[1.2] text-text-tertiary">
              {text.trim()
                ? t('erp.advanced.sizeNote', { size: (text.length / 1024).toFixed(1) })
                : t('erp.advanced.empty')}
            </p>
          </div>

          {outcome?.kind === 'dryRun' ? (
            <div role="status" className="rounded-sm bg-surface-background/60 p-4">
              <p className="text-sm font-semibold text-text-primary">
                {t('erp.advanced.dryRunTitle')}
              </p>
              <p className="mt-1.5 text-sm font-medium leading-[1.5] text-text-secondary">
                {t('erp.advanced.dryRunHash')}{' '}
                <span dir="ltr" className="inline-block font-mono text-[11px] font-semibold">
                  {shortHash(outcome.result.content_hash)}
                </span>
              </p>
              <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                {t('erp.advanced.dryRunOk')}
              </p>
              <pre
                dir="ltr"
                className="mt-3 max-h-[320px] overflow-auto rounded-sm bg-white p-3 text-left font-mono text-[11px] leading-[1.6] text-text-secondary"
              >
                {JSON.stringify(outcome.result.canonical_invoice, null, 2)}
              </pre>
            </div>
          ) : null}

          {outcome?.kind === 'dryRunFailed' ? (
            <p role="alert" className="text-sm font-medium leading-[1.5] text-danger-700">
              {outcome.message}
            </p>
          ) : null}

          {outcome?.kind === 'refused' ? (
            <p role="alert" className="text-sm font-medium leading-[1.5] text-danger-700">
              {outcome.message}
            </p>
          ) : null}

          {outcome?.kind === 'saved' ? (
            <p role="status" className="text-sm font-semibold text-[#3d5648]">
              {t('erp.advanced.saved', { version: outcome.version })}{' '}
              <span dir="ltr" className="inline-block font-mono text-[11px]">
                {shortHash(outcome.hash)}
              </span>
            </p>
          ) : null}

          {outcome?.kind === 'deactivated' ? (
            <p role="status" className="text-sm font-semibold text-pending-700">
              {t('erp.advanced.deactivated')}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2.5 border-t border-surface-background pt-4 max-md:flex-col max-md:items-stretch">
            <button
              type="button"
              onClick={dryRun}
              disabled={!text.trim() || !sample || busy}
              className="inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('erp.advanced.dryRun')}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!text.trim()}
              className="inline-flex h-[46px] items-center justify-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <img src={downloadIcon} alt="" className="size-[18px]" />
              {t('erp.advanced.download')}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!text.trim() || busy}
              className="inline-flex h-[46px] items-center justify-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-primary-200"
            >
              {busy ? t('erp.shared.working') : t('erp.advanced.save')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!active || busy}
              className="ms-auto inline-flex h-[46px] items-center justify-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 max-md:ms-0"
            >
              {t('erp.advanced.deactivate')}
            </button>
          </div>
        </div>
      </section>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('erp.advanced.confirmTitle')}
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button
              type="button"
              size="md"
              variant="secondary"
              onClick={() => setConfirming(false)}
            >
              {t('common.cancel')}
            </Button>
            <button
              type="button"
              onClick={deactivate}
              className="inline-flex h-11 items-center justify-center rounded-sm bg-danger-700 px-4 text-base font-semibold text-white transition-colors hover:bg-danger-700/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-danger"
            >
              {t('erp.advanced.confirmSubmit')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {t('erp.advanced.confirmBody')}
        </p>
        {active ? (
          <p dir="ltr" className="mt-3 text-left font-mono text-[11px] text-text-quaternary">
            {t('erp.advanced.activeLine', {
              version: active.version,
              hash: shortHash(active.contentHash),
            })}
          </p>
        ) : null}
      </Modal>
    </ErpShell>
  )
}

/** The engine's own words where it gave them — it names the failing construct, which copy cannot. */
function messageOf(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    const detail = error.problem.detail
    if (typeof detail === 'string' && detail) return detail
  }
  return t('erp.advanced.requestFailed')
}
