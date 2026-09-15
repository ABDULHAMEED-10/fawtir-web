import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErpShell, Pill } from './ErpShell'
import { CodeEditor } from './shared/CodeEditor'
import { Button, Input, Modal } from '../../components/ui'
import {
  activeProfile,
  compile,
  contentHash,
  mappingRoute,
  mappingStore,
  shortHash,
  useErpMapping,
} from '../../lib/erpMapping'
import infoIcon from '../../assets/settings/info.svg'
import downloadIcon from '../../assets/settings/download-ink.svg'

/** How long the editor waits after the last keystroke before parking the draft in the store. */
const DRAFT_DEBOUNCE_MS = 300

/** Lines that differ, position for position; the honest number a text comparison can give. */
function differingLines(a: string, b: string) {
  const left = a.split('\n')
  const right = b.split('\n')
  let count = 0
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) count += 1
  }
  return count
}

type Outcome =
  | { kind: 'saved'; version: number; hash: string }
  | { kind: 'invalid' }
  | { kind: 'deactivated' }
  | { kind: 'dryRun'; hash: string; differing: number | null; identical: boolean }

/**
 * Settings › Integration › ERP mapping › Advanced (docs/erp-and-console-plan.md §2.5, A.5).
 *
 * The hand-written JSONata profile, for the invoices the guided mapping cannot express. Saving
 * here makes this text the thing that runs; the banner says so while a guided mapping also
 * exists, because the two are not merged — one replaces the other. Deactivating leaves nothing
 * running, and the confirm dialog says what that means: every submission fails closed.
 *
 * The unsaved text is parked in the store (debounced) so leaving for the field wizard and coming
 * back does not lose an hour's work.
 */
export function ErpAdvancedPage() {
  const { t } = useTranslation()
  const state = useErpMapping()
  const active = activeProfile(state)
  const route = mappingRoute(state)
  const hasGuided = state.guided && state.entries.length > 0
  const compiledGuided = useMemo(
    () => (hasGuided ? compile(state.entries) : null),
    [hasGuided, state.entries],
  )

  const [text, setText] = useState(() => state.handWrittenDraft || active?.content || '')
  const [erpKey, setErpKey] = useState(() => active?.erpKey ?? state.sourceSystem)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [confirming, setConfirming] = useState(false)

  /* Park the draft in the store, debounced; flush whatever is pending when the screen unmounts. */
  const latest = useRef(text)
  useEffect(() => {
    latest.current = text
    const timer = window.setTimeout(() => mappingStore.setHandWrittenDraft(text), DRAFT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text])
  useEffect(() => () => mappingStore.setHandWrittenDraft(latest.current), [])

  const edit = (next: string) => {
    setText(next)
    setOutcome((current) => (current?.kind === 'invalid' ? null : current))
  }

  const dryRun = () => {
    const identical = compiledGuided !== null && text === compiledGuided
    setOutcome({
      kind: 'dryRun',
      hash: contentHash(text),
      differing: compiledGuided === null ? null : differingLines(text, compiledGuided),
      identical,
    })
  }

  const save = () => {
    const saved = mappingStore.saveHandWritten(text, erpKey.trim() || state.sourceSystem)
    if (saved === 'invalid') {
      setOutcome({ kind: 'invalid' })
      return
    }
    setOutcome({ kind: 'saved', version: saved.version, hash: saved.contentHash })
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

  const deactivate = () => {
    mappingStore.deactivateProfile()
    setConfirming(false)
    setOutcome({ kind: 'deactivated' })
  }

  const invalid = outcome?.kind === 'invalid'

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
              tone={route === 'NONE' ? 'danger' : route === 'GUIDED' ? 'success' : 'pending'}
              label={t(`erp.route.${route}`)}
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
          <div className="max-w-[420px] max-md:max-w-none">
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
              invalid={invalid}
            />
            {invalid ? (
              <p role="alert" className="text-xs font-medium text-text-danger">
                {t('erp.advanced.invalid')}
              </p>
            ) : (
              <p className="text-[10px] font-medium leading-[1.2] text-text-tertiary">
                {text.trim()
                  ? t('erp.advanced.sizeNote', { size: (text.length / 1024).toFixed(1) })
                  : t('erp.advanced.empty')}
              </p>
            )}
          </div>

          {outcome?.kind === 'dryRun' ? (
            <div role="status" className="rounded-sm bg-surface-background/60 p-4">
              <p className="text-sm font-semibold text-text-primary">
                {t('erp.advanced.dryRunTitle')}
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm font-medium leading-[1.5] text-text-secondary">
                <li>
                  {t('erp.advanced.dryRunHash')}{' '}
                  <span dir="ltr" className="inline-block font-mono text-[11px] font-semibold">
                    {shortHash(outcome.hash)}
                  </span>
                </li>
                <li>
                  {outcome.identical
                    ? t('erp.advanced.identical')
                    : outcome.differing === null
                      ? t('erp.advanced.noGuided')
                      : t('erp.advanced.differs', { count: outcome.differing })}
                </li>
                <li className="text-xs text-text-quaternary">{t('erp.advanced.serverNote')}</li>
              </ul>
            </div>
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

          <div className="flex flex-wrap items-center gap-2.5 border-t border-surface-background pt-4">
            <button
              type="button"
              onClick={dryRun}
              disabled={!text.trim()}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('erp.advanced.dryRun')}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!text.trim()}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <img src={downloadIcon} alt="" className="size-[18px]" />
              {t('erp.advanced.download')}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!text.trim()}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:bg-primary-200"
            >
              {t('erp.advanced.save')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!active}
              className="ms-auto inline-flex h-[46px] items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 max-md:ms-0"
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
