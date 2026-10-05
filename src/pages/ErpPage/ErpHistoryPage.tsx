import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RowsView } from '../../components/ui'
import { ErpShell, Pill } from './ErpShell'
import { GUIDED_MAPPING_FORMAT, useErpMapping, useErpMappingReload } from './ErpMappingGate'
import { TabStrip } from './overview/TabStrip'
import {
  ConfirmModal,
  EmptyRow,
  Mono,
  SMALL_BUTTON,
  TBODY_ROW,
  THEAD_ROW,
  Td,
  Th,
} from './overview/idiom'
import { deactivateMappingProfile } from '../../api/erp/mapping'
import { shortHash } from '../../lib/erp/mappingState'
import { shortDate } from '../../lib/settings'
import { sourceSystemName } from '../../lib/erp/sourceSystem'
import { documentKindName } from './shared/documentKind'
import infoIcon from '../../assets/settings/info.svg'

const TABS = [
  { id: 'profiles', labelKey: 'erp.history.tab.profiles' },
  { id: 'certifications', labelKey: 'erp.history.tab.certifications' },
] as const
type Tab = (typeof TABS)[number]['id']

/**
 * Settings › Integration › ERP mapping › History (docs/erp-and-console-plan.md §2.6, A.6).
 *
 * Two ledgers, both real: every expression that ever ran, and every certification attempt.
 *
 * **The draft-revision ledger the design called for is not here.** The guided mapping is one row
 * per (tenant, format) under an optimistic lock — there is no revision table and no restore
 * endpoint, so there is nothing to list and no older set of entries to bring back. What *is*
 * versioned is the compiled expression: a save deactivates the previous profile and inserts a new
 * one rather than overwriting, precisely so the expression a past invoice was generated under stays
 * readable. That is the Profiles tab, and it is the history that matters for an audit.
 */
export function ErpHistoryPage() {
  const { t } = useTranslation()
  const view = useErpMapping()
  const [tab, setTab] = useState<Tab>('profiles')
  const counts: Record<Tab, number> = {
    profiles: view.profiles.length,
    certifications: view.history.length,
  }

  return (
    <ErpShell title={t('erp.history.title')} subtitle={t('erp.history.subtitle')}>
      <div className="flex gap-3 rounded-md border border-border-subtle bg-surface-card p-4">
        <img src={infoIcon} alt="" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
          {t('erp.history.revisionsNote')}
        </p>
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip tabs={TABS} value={tab} onChange={setTab} count={(id) => counts[id]} />
        {tab === 'profiles' ? <Profiles /> : null}
        {tab === 'certifications' ? <Certifications /> : null}
      </section>
    </ErpShell>
  )
}

/* -------------------------------------------------------------- profiles */

/**
 * Every expression this tenant has had, newest first.
 *
 * The active one can be deactivated, which retires every certification keyed on its hash and stops
 * the tenant submitting until a new expression is stored and certified again. The superseded rows
 * are retained and cannot be deleted — that is the point of them.
 */
function Profiles() {
  const { t } = useTranslation()
  const view = useErpMapping()
  const reload = useErpMappingReload()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const deactivate = async () => {
    setBusy(true)
    try {
      await deactivateMappingProfile(GUIDED_MAPPING_FORMAT)
      setConfirming(false)
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="max-md:px-5 max-md:pb-5">
        <RowsView>
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <Th first>{t('erp.history.profiles.col.version')}</Th>
                <Th>{t('erp.history.profiles.col.hash')}</Th>
                <Th>{t('erp.history.profiles.col.erp')}</Th>
                <Th>{t('erp.history.profiles.col.state')}</Th>
                <Th>{t('erp.history.profiles.col.at')}</Th>
                <Th align="end">{t('erp.history.profiles.col.action')}</Th>
              </tr>
            </thead>
            <tbody>
              {view.profiles.length === 0 ? (
                <EmptyRow columns={6}>{t('erp.history.profiles.empty')}</EmptyRow>
              ) : (
                view.profiles.map((profile) => (
                  <tr key={profile.id} className={TBODY_ROW}>
                    <Td first>
                      <span className="text-sm font-semibold text-text-primary tabular-nums">
                        {profile.version}
                      </span>
                    </Td>
                    <Td>
                      <Mono>{shortHash(profile.contentHash)}</Mono>
                    </Td>
                    <Td>
                      <span className="text-sm font-medium text-text-secondary">
                        {profile.erpKey ? sourceSystemName(t, profile.erpKey) : '—'}
                      </span>
                    </Td>
                    <Td>
                      <Pill
                        tone={profile.active ? 'success' : 'neutral'}
                        label={
                          profile.active
                            ? t('erp.history.profiles.active')
                            : t('erp.history.profiles.superseded')
                        }
                      />
                    </Td>
                    <Td>
                      <span className="text-sm font-medium text-text-secondary tabular-nums">
                        {shortDate(new Date(profile.createdAt))}
                      </span>
                    </Td>
                    <Td align="end">
                      {profile.active ? (
                        <button
                          type="button"
                          onClick={() => setConfirming(true)}
                          className={`${SMALL_BUTTON} md:-my-[9px]`}
                        >
                          {t('erp.history.profiles.deactivate')}
                        </button>
                      ) : null}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </RowsView>
      </div>

      <ConfirmModal
        open={confirming}
        title={t('erp.history.profiles.deactivateTitle')}
        body={t('erp.history.profiles.deactivateBody')}
        confirmLabel={busy ? t('erp.shared.working') : t('erp.history.profiles.deactivate')}
        danger
        onClose={() => setConfirming(false)}
        onConfirm={deactivate}
      />
    </>
  )
}

/* -------------------------------------------------------- certifications */

/** Every attempt, pass and fail. Failures are retained deliberately, so this is the dossier. */
function Certifications() {
  const { t } = useTranslation()
  const view = useErpMapping()

  return (
    <div className="max-md:px-5 max-md:pb-5">
      <RowsView>
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('erp.certification.col.route')}</Th>
              <Th>{t('erp.certification.col.result')}</Th>
              <Th>{t('erp.certification.col.hash')}</Th>
              <Th>{t('erp.certification.col.kind')}</Th>
              <Th>{t('erp.certification.col.type')}</Th>
              <Th>{t('erp.certification.col.when')}</Th>
              <Th>{t('erp.certification.col.findings')}</Th>
            </tr>
          </thead>
          <tbody>
            {view.history.length === 0 ? (
              <EmptyRow columns={7}>{t('erp.certification.noHistory')}</EmptyRow>
            ) : (
              view.history.map((attempt) => (
                <tr key={attempt.id} className={TBODY_ROW}>
                  <Td first>
                    <span className="whitespace-nowrap text-sm font-semibold text-text-primary">
                      {t(`erp.certRoute.${attempt.route}`)}
                    </span>
                  </Td>
                  <Td>
                    <Pill
                      tone={attempt.verdict === 'PASSED' ? 'success' : 'danger'}
                      label={
                        attempt.verdict === 'PASSED'
                          ? t('erp.certification.passedPill')
                          : t('erp.certification.failedPill')
                      }
                    />
                  </Td>
                  <Td>
                    <Mono>{shortHash(attempt.content_hash)}</Mono>
                  </Td>
                  <Td>
                    <span className="text-sm font-medium text-text-secondary">
                      {documentKindName(t, attempt.document_kind)}
                    </span>
                  </Td>
                  <Td>
                    <Mono>{attempt.transaction_type}</Mono>
                  </Td>
                  <Td>
                    <span className="text-sm font-medium text-text-secondary tabular-nums">
                      {shortDate(new Date(attempt.certified_at))}
                    </span>
                  </Td>
                  <Td>
                    <span dir="auto" className="block max-w-[280px] text-sm font-medium leading-[1.5] text-text-secondary">
                      {attempt.summary ??
                        t('erp.shared.findingsCount', { count: attempt.error_count })}
                    </span>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </RowsView>
    </div>
  )
}
