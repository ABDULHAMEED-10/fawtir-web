import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, RowsView } from '../../components/ui'
import { ErpShell, Pill } from './ErpShell'
import { TabStrip } from './overview/TabStrip'
import {
  ConfirmModal,
  EmptyRow,
  Mono,
  SMALL_BUTTON,
  TBODY_ROW,
  TEXT_BUTTON,
  THEAD_ROW,
  Td,
  Th,
} from './overview/idiom'
import {
  activeProfile,
  mappingStore,
  sampleById,
  shortHash,
  useErpMapping,
  type Profile,
  type Revision,
  type SaveResult,
} from '../../lib/erpMapping'
import { shortDate } from '../../lib/settings'
import tickIcon from '../../assets/settings/check-green.svg'
import infoIcon from '../../assets/settings/info.svg'

const TABS = [
  { id: 'revisions', labelKey: 'erp.history.tab.revisions' },
  { id: 'profiles', labelKey: 'erp.history.tab.profiles' },
  { id: 'certifications', labelKey: 'erp.history.tab.certifications' },
] as const
type Tab = (typeof TABS)[number]['id']

type Restored =
  { kind: 'saved'; from: number; result: SaveResult } | { kind: 'stale' } | { kind: 'notFound' }

/**
 * Settings › Integration › ERP mapping › History (docs/erp-and-console-plan.md §2.6, A.6).
 *
 * Three ledgers: every saved revision of the guided mapping (with Restore, which is an ordinary
 * save of an older set of entries), every profile that ever ran or was compiled, and every
 * certification attempt. Nothing here is edited; it is read, and occasionally brought back.
 */
export function ErpHistoryPage() {
  const { t } = useTranslation()
  const state = useErpMapping()
  const [tab, setTab] = useState<Tab>('revisions')
  const counts: Record<Tab, number> = {
    revisions: state.revisions.length,
    profiles: state.profiles.length,
    certifications: state.attempts.length,
  }

  return (
    <ErpShell title={t('erp.history.title')} subtitle={t('erp.history.subtitle')}>
      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip tabs={TABS} value={tab} onChange={setTab} count={(id) => counts[id]} />
        {tab === 'revisions' ? <Revisions /> : null}
        {tab === 'profiles' ? <Profiles /> : null}
        {tab === 'certifications' ? <Certifications /> : null}
      </section>
    </ErpShell>
  )
}

/* ------------------------------------------------------------- revisions */

function Revisions() {
  const { t } = useTranslation()
  const state = useErpMapping()
  const [restoring, setRestoring] = useState<Revision | null>(null)
  const [restored, setRestored] = useState<Restored | null>(null)
  const active = activeProfile(state)
  const latest = state.revisions[state.revisions.length - 1]
  const rows = [...state.revisions].reverse()

  const restore = () => {
    if (!restoring) return
    const result = mappingStore.restoreRevision(restoring.id, state.version)
    if (result === 'stale' || result === 'notFound') setRestored({ kind: result })
    else setRestored({ kind: 'saved', from: restoring.revisionNo, result })
    setRestoring(null)
  }

  const banner = (): { tone: 'success' | 'pending' | 'danger'; text: string } | null => {
    if (!restored) return null
    if (restored.kind === 'stale') return { tone: 'pending', text: t('erp.history.restore.stale') }
    if (restored.kind === 'notFound')
      return { tone: 'danger', text: t('erp.history.restore.notFound') }
    const { status, readiness } = restored.result
    if (status === 'refused')
      return {
        tone: 'danger',
        text: t('erp.history.restore.refused', { count: readiness.invalidMappings.length }),
      }
    const revision = latest?.revisionNo ?? 0
    const reacquired =
      status === 'activated' &&
      active !== undefined &&
      state.attempts.some((a) => a.passed && a.contentHash === active.contentHash)
    const head = t('erp.history.restore.done', { from: restored.from, revision })
    if (reacquired)
      return { tone: 'success', text: `${head} — ${t('erp.history.restore.reacquired')}` }
    if (status === 'draft')
      return {
        tone: 'pending',
        text: `${head} — ${t('erp.history.restore.draft', {
          count: readiness.missingRequiredTargets.length,
        })}`,
      }
    return { tone: 'success', text: `${head} — ${t('erp.history.restore.activated')}` }
  }
  const line = banner()
  const TONE = {
    success: 'bg-success-100 text-[#3d5648]',
    pending: 'bg-pending-100 text-pending-700',
    danger: 'bg-danger-100 text-danger-700',
  }

  return (
    <>
      {line ? (
        <p
          className={[
            'mx-5 mt-4 flex items-start gap-2 rounded-sm px-3 py-2.5 text-sm font-medium leading-[1.6]',
            TONE[line.tone],
          ].join(' ')}
        >
          <img
            src={line.tone === 'success' ? tickIcon : infoIcon}
            alt=""
            className="mt-0.5 size-4 shrink-0"
          />
          <span>{line.text}</span>
        </p>
      ) : null}
      <RowsView className="mt-4">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('erp.history.revisions.col.revision')}</Th>
              <Th align="end">{t('erp.history.revisions.col.fields')}</Th>
              <Th>{t('erp.history.revisions.col.compiled')}</Th>
              <Th>{t('erp.history.revisions.col.ready')}</Th>
              <Th>{t('erp.history.revisions.col.by')}</Th>
              <Th>{t('erp.history.revisions.col.at')}</Th>
              <Th align="end">{t('erp.history.revisions.col.action')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow columns={7}>{t('erp.history.revisions.empty')}</EmptyRow>
            ) : null}
            {rows.map((revision) => {
              const current = revision.id === latest?.id
              return (
                <tr key={revision.id} className={TBODY_ROW}>
                  <Td first>
                    <p className="text-sm font-semibold text-text-primary tabular-nums">
                      {t('erp.history.revisions.number', { count: revision.revisionNo })}
                    </p>
                    <p className="mt-1 text-xs font-medium text-text-quaternary">
                      {revision.origin === 'RESTORE' && revision.restoredFromRevisionNo
                        ? t('erp.history.revisions.origin.RESTORE_FROM', {
                            count: revision.restoredFromRevisionNo,
                          })
                        : t(`erp.history.revisions.origin.${revision.origin}`)}
                    </p>
                  </Td>
                  <Td align="end">
                    <span className="text-sm font-medium text-text-secondary tabular-nums">
                      {revision.entryCount}
                    </span>
                  </Td>
                  <Td>
                    {revision.compiledContentHash ? (
                      <Mono className="text-text-secondary">
                        {shortHash(revision.compiledContentHash)}
                      </Mono>
                    ) : (
                      <span className="text-sm font-medium text-text-quaternary">
                        {t('erp.history.revisions.notCompiled')}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Pill
                      tone={revision.readyForActivation ? 'success' : 'neutral'}
                      label={
                        revision.readyForActivation
                          ? t('erp.history.revisions.ready')
                          : t('erp.history.revisions.notReady')
                      }
                    />
                  </Td>
                  <Td>
                    <span className="text-sm font-medium text-text-secondary">
                      {revision.savedBy}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-sm font-medium text-text-secondary">
                      {shortDate(revision.savedAt)}
                    </span>
                  </Td>
                  <Td align="end">
                    {current ? (
                      <span className="text-sm font-medium text-text-quaternary">
                        {t('erp.history.revisions.current')}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRestoring(revision)}
                        className={TEXT_BUTTON}
                      >
                        {t('erp.history.revisions.restore')}
                      </button>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </RowsView>

      <ConfirmModal
        open={restoring !== null}
        title={t('erp.history.restore.title', { count: restoring?.revisionNo ?? 0 })}
        body={t('erp.history.restore.body', {
          count: restoring?.entryCount ?? 0,
          date: restoring ? shortDate(restoring.savedAt) : '',
        })}
        confirmLabel={t('erp.history.restore.confirm')}
        onClose={() => setRestoring(null)}
        onConfirm={restore}
      />
    </>
  )
}

/* -------------------------------------------------------------- profiles */

function Profiles() {
  const { t } = useTranslation()
  const state = useErpMapping()
  const [viewing, setViewing] = useState<Profile | null>(null)
  const rows = [...state.profiles].sort((a, b) => b.version - a.version)

  return (
    <>
      <RowsView className="mt-4">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('erp.history.profiles.col.version')}</Th>
              <Th>{t('erp.history.profiles.col.origin')}</Th>
              <Th>{t('erp.history.profiles.col.hash')}</Th>
              <Th>{t('erp.history.profiles.col.erpKey')}</Th>
              <Th>{t('erp.history.profiles.col.created')}</Th>
              <Th align="end">{t('erp.history.profiles.col.action')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow columns={6}>{t('erp.history.profiles.empty')}</EmptyRow>
            ) : null}
            {rows.map((profile) => (
              <tr key={profile.id} className={TBODY_ROW}>
                <Td first>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary tabular-nums">
                      v{profile.version}
                    </span>
                    {profile.active ? (
                      <Pill tone="success" label={t('erp.history.profiles.active')} />
                    ) : null}
                  </span>
                </Td>
                <Td>
                  <span className="text-sm font-medium text-text-secondary">
                    {t(`erp.route.${profile.origin}`)}
                  </span>
                </Td>
                <Td>
                  <Mono className="text-text-secondary">{shortHash(profile.contentHash)}</Mono>
                </Td>
                <Td>
                  <Mono className="text-text-secondary">{profile.erpKey}</Mono>
                </Td>
                <Td>
                  <span className="text-sm font-medium text-text-secondary">
                    {shortDate(profile.createdAt)}
                  </span>
                </Td>
                <Td align="end">
                  <button
                    type="button"
                    onClick={() => setViewing(profile)}
                    className={SMALL_BUTTON}
                  >
                    {t('erp.history.profiles.view')}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </RowsView>

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={t('erp.history.profiles.viewTitle', { count: viewing?.version ?? 0 })}
        subtitle={
          viewing
            ? `${t(`erp.route.${viewing.origin}`)} · ${shortHash(viewing.contentHash)} · ${viewing.erpKey}`
            : undefined
        }
        width={760}
        footer={
          <div className="flex justify-end">
            <Button type="button" size="md" variant="secondary" onClick={() => setViewing(null)}>
              {t('common.close')}
            </Button>
          </div>
        }
      >
        <pre
          dir="ltr"
          className="overflow-x-auto whitespace-pre rounded-sm bg-surface-background p-4 text-start font-mono text-xs leading-[1.6] text-text-primary"
        >
          {viewing?.content}
        </pre>
      </Modal>
    </>
  )
}

/* -------------------------------------------------------- certifications */

function Certifications() {
  const { t } = useTranslation()
  const state = useErpMapping()
  const rows = [...state.attempts].reverse()

  return (
    <RowsView className="mt-4">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className={THEAD_ROW}>
            <Th first>{t('erp.history.cert.col.route')}</Th>
            <Th>{t('erp.history.cert.col.result')}</Th>
            <Th>{t('erp.history.cert.col.profile')}</Th>
            <Th>{t('erp.history.cert.col.sample')}</Th>
            <Th>{t('erp.history.cert.col.transactionType')}</Th>
            <Th>{t('erp.history.cert.col.at')}</Th>
            <Th>{t('erp.history.cert.col.by')}</Th>
            <Th align="end">{t('erp.history.cert.col.findings')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow columns={8}>{t('erp.history.cert.empty')}</EmptyRow>
          ) : null}
          {rows.map((attempt) => (
            <tr key={attempt.id} className={TBODY_ROW}>
              <Td first>
                <span className="text-sm font-semibold text-text-primary">
                  {t(`erp.certRoute.${attempt.route}`)}
                </span>
              </Td>
              <Td>
                <Pill
                  tone={attempt.passed ? 'success' : 'danger'}
                  label={
                    attempt.passed ? t('erp.history.cert.passed') : t('erp.history.cert.failed')
                  }
                />
              </Td>
              <Td>
                <Mono className="text-text-secondary">{shortHash(attempt.contentHash)}</Mono>
              </Td>
              <Td>
                <span className="text-sm font-medium text-text-secondary">
                  {sampleById(state, attempt.sampleId)?.label ?? t('erp.history.cert.sampleGone')}
                </span>
              </Td>
              <Td>
                <Mono className="break-all text-text-secondary">{attempt.transactionType}</Mono>
              </Td>
              <Td>
                <span className="text-sm font-medium text-text-secondary">
                  {shortDate(attempt.at)}
                </span>
              </Td>
              <Td>
                <span className="text-sm font-medium text-text-secondary">{attempt.by}</span>
              </Td>
              <Td align="end">
                <span
                  className={[
                    'text-sm font-semibold tabular-nums',
                    attempt.findings.length > 0 ? 'text-danger-700' : 'text-text-secondary',
                  ].join(' ')}
                >
                  {attempt.findings.length}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </RowsView>
  )
}
