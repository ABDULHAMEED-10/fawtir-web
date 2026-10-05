import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RowsView } from '../../components/ui'
import { CoverageBanner, ErpShell, RouteStatePill } from './ErpShell'
import { GUIDED_MAPPING_FORMAT, useErpMapping, useErpMappingReload } from './ErpMappingGate'
import { Kpi } from './overview/Kpi'
import {
  ConfirmModal,
  PrimaryLink,
  SECONDARY_BUTTON,
  SecondaryLink,
  SectionCard,
  TBODY_ROW,
  TEXT_BUTTON,
  THEAD_ROW,
  Td,
  Th,
} from './overview/idiom'
import {
  readinessProgress,
  shortHash,
  type ErpOverviewStatus,
} from '../../lib/erp/mappingState'
import {
  MAPPING_CERTIFICATION_ROUTES,
  archiveGuidedMapping,
  deactivateMappingProfile,
} from '../../api/erp/mapping'
import { TARGET_BY_ID } from '../../lib/erpCatalogue'
import { sourceSystemName } from '../../lib/erp/sourceSystem'
import { shortDate } from '../../lib/settings'
import routeIcon from '../../assets/settings/tile-integration.svg'
import fieldsIcon from '../../assets/settings/check-ink.svg'
import certifiedIcon from '../../assets/settings/cert-ok.svg'
import samplesIcon from '../../assets/settings/folder.svg'
import infoIcon from '../../assets/settings/info.svg'
import tickIcon from '../../assets/settings/check-green.svg'

/** The plain-words list of what the Tax Authority insists on and most ERPs do not hold. */
const OTA_FIELDS = [
  'sellerPhone',
  'address',
  'issueTime',
  'vatin',
  'goodsServices',
  'isic',
  'lineVat',
  'lineTotal',
] as const

/**
 * Settings › Integration › ERP mapping — the overview (docs/erp-and-console-plan.md §2.1, A.1).
 *
 * Four figures, the coverage limits, one row per certification route. Every one of them is read
 * from the backend: the readiness lists come from the guided mapping's own validation, and the
 * route states from the certification gate's answer for the live expression. The call to action
 * follows the status, so the button always says the next step rather than a generic "manage".
 *
 * The activity panel the design called for is not here — mapping administration is audited
 * server-side, but no tenant-facing endpoint exposes it, so there is nothing real to list and a
 * plausible-looking empty log would be a claim that nothing had happened.
 */
export function ErpOverviewPage() {
  const { t, i18n } = useTranslation()
  const view = useErpMapping()
  const reload = useErpMappingReload()
  const progress = readinessProgress(view.readiness)
  const [startingOver, setStartingOver] = useState(false)
  const [clearing, setClearing] = useState(false)

  const certified = MAPPING_CERTIFICATION_ROUTES.filter(
    (route) => view.certification[route].state === 'CERTIFIED',
  ).length
  const failed = MAPPING_CERTIFICATION_ROUTES.filter(
    (route) => view.certification[route].state === 'FAILED',
  ).length
  const stale = MAPPING_CERTIFICATION_ROUTES.filter(
    (route) => view.certification[route].state === 'STALE',
  ).length
  const notSetUp = view.status === 'NOT_SET_UP'
  const handWrittenOverGuided =
    view.route === 'HAND_WRITTEN' && (view.guided?.mappings.length ?? 0) > 0

  const termName = (id: string) => {
    const target = TARGET_BY_ID[id]
    if (!target) return id
    return i18n.language.startsWith('ar') ? target.nameAr : target.name
  }

  const fieldsNote = () => {
    if (progress.invalid > 0) return t('erp.overview.kpi.invalid', { count: progress.invalid })
    if (progress.missing === 0) return t('erp.overview.kpi.fieldsComplete')
    const names = (view.readiness?.missingRequiredTargets ?? []).slice(0, 3).map(termName)
    const rest = progress.missing - names.length
    return t('erp.overview.kpi.fieldsMissing', {
      count: progress.missing,
      names: rest > 0 ? `${names.join(', ')} +${rest}` : names.join(', '),
    })
  }

  const certifiedNote = () => {
    if (failed === 0 && stale === 0)
      return certified === 0
        ? t('erp.overview.kpi.certifiedNone')
        : t('erp.overview.kpi.certifiedClean')
    return [
      failed > 0 ? t('erp.overview.kpi.failedCount', { count: failed }) : null,
      stale > 0 ? t('erp.overview.kpi.staleCount', { count: stale }) : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const profilesNote = () => {
    if (view.profiles.length === 0) return t('erp.overview.kpi.profilesNone')
    return view.activeProfile
      ? t('erp.overview.kpi.profilesActive', { hash: shortHash(view.activeProfile.contentHash) })
      : t('erp.overview.kpi.profilesInactive')
  }

  const routeNote = () => {
    if (!view.activeProfile) return t('erp.route.NONE')
    return t('erp.overview.kpi.profileNote', {
      system:
        view.route === 'GUIDED' && view.guided
          ? sourceSystemName(t, view.guided.sourceSystem)
          : view.activeProfile.erpKey
            ? sourceSystemName(t, view.activeProfile.erpKey)
            : t('erp.overview.kpi.erpKeyUnset'),
      version: view.activeProfile.version,
      hash: shortHash(view.activeProfile.contentHash),
    })
  }

  /**
   * Start over means: archive the guided mapping and deactivate the live profile.
   *
   * Both are real endpoints and both are soft — the guided row is archived and the profile row is
   * retained as a superseded revision, so History still shows what was there. It is destructive
   * enough to confirm, because it retires every certification along with the expression.
   */
  const startOver = async () => {
    setClearing(true)
    try {
      if (view.guided) await archiveGuidedMapping(GUIDED_MAPPING_FORMAT)
      if (view.activeProfile) await deactivateMappingProfile(GUIDED_MAPPING_FORMAT)
      setStartingOver(false)
      reload()
    } finally {
      setClearing(false)
    }
  }

  return (
    <ErpShell
      title={t('erp.overview.title')}
      subtitle={t('erp.overview.subtitle')}
      actions={
        <>
          <CallToAction status={view.status} missing={progress.missing} />
          {notSetUp ? null : (
            <button
              type="button"
              onClick={() => setStartingOver(true)}
              className={SECONDARY_BUTTON}
            >
              {t('erp.overview.actions.startOver')}
            </button>
          )}
        </>
      }
    >
      {/* The four figures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={routeIcon}
          label={t('erp.overview.kpi.route')}
          value={t(`erp.overview.kpi.routeValue.${view.route}`)}
          note={routeNote()}
          highlight={view.route === 'NONE' && !notSetUp}
        />
        <Kpi
          icon={fieldsIcon}
          label={t('erp.overview.kpi.fields')}
          value={String(progress.mapped)}
          unit={t('erp.overview.kpi.ofRequired', { count: progress.required })}
          note={fieldsNote()}
          tone={
            progress.invalid > 0
              ? 'danger'
              : progress.missing > 0 && !notSetUp
                ? 'pending'
                : undefined
          }
        />
        <Kpi
          icon={certifiedIcon}
          tint="bg-success-100"
          label={t('erp.overview.kpi.certified')}
          value={String(certified)}
          unit={t('erp.overview.kpi.ofRoutes', { count: MAPPING_CERTIFICATION_ROUTES.length })}
          note={certifiedNote()}
          tone={failed > 0 ? 'danger' : stale > 0 ? 'pending' : undefined}
        />
        {/*
          Profiles, not samples. The design's fourth figure counted stored sample payloads, and
          nothing stores one — see SAMPLES in UNSUPPORTED_CAPABILITIES. Mapping revisions are real
          and are the figure a tenant actually needs here: every save supersedes rather than
          overwrites, so this is how many expressions this tenant has had.
        */}
        <Kpi
          icon={samplesIcon}
          tint="bg-pending-100"
          label={t('erp.overview.kpi.profiles')}
          value={String(view.profiles.length)}
          note={profilesNote()}
        />
      </div>

      {notSetUp ? (
        <EmptyState />
      ) : (
        <>
          {view.guided ? <CoverageBanner /> : null}

          {handWrittenOverGuided ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-pending-200 bg-pending-100/60 p-4">
              <img src={infoIcon} alt="" aria-hidden="true" className="size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-[1.4] text-text-primary">
                  {t('erp.overview.handWritten.title')}
                </p>
                <p className="mt-0.5 text-sm font-medium leading-[1.5] text-text-secondary">
                  {t('erp.overview.handWritten.body')}
                </p>
              </div>
              <Link to="/settings/erp-mapping/advanced" className={TEXT_BUTTON}>
                {t('erp.overview.handWritten.open')}
              </Link>
            </div>
          ) : null}

          <CertificationTable />
        </>
      )}

      <ConfirmModal
        open={startingOver}
        title={t('erp.overview.startOver.title')}
        body={t('erp.overview.startOver.body')}
        confirmLabel={clearing ? t('erp.shared.working') : t('erp.overview.startOver.confirm')}
        danger
        onClose={() => setStartingOver(false)}
        onConfirm={startOver}
      />
    </ErpShell>
  )
}

/** The next step, as one button. */
function CallToAction({ status, missing }: { status: ErpOverviewStatus; missing: number }) {
  const { t } = useTranslation()
  switch (status) {
    case 'NOT_SET_UP':
      return null
    case 'DRAFT':
      return (
        <PrimaryLink to="/settings/erp-mapping/fields">
          {missing > 0
            ? t('erp.overview.cta.finish', { count: missing })
            : t('erp.overview.cta.finishFixing')}
        </PrimaryLink>
      )
    case 'READY_UNCERTIFIED':
      return (
        <PrimaryLink to="/settings/erp-mapping/certification">
          {t('erp.overview.cta.certify')}
        </PrimaryLink>
      )
    case 'CERTIFIED':
      return (
        <SecondaryLink to="/settings/erp-mapping/certification">
          {t('erp.overview.cta.certify')}
        </SecondaryLink>
      )
    default:
      return (
        <PrimaryLink to="/settings/erp-mapping/certification">
          {t('erp.overview.cta.recertify')}
        </PrimaryLink>
      )
  }
}

/** NOT_SET_UP: what the Tax Authority needs, and the two ways to give it. */
function EmptyState() {
  const { t } = useTranslation()
  return (
    <section className="rounded-md bg-surface-card p-5">
      <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
        {t('erp.overview.empty.title')}
      </h3>
      <p className="mt-1 max-w-[720px] text-sm font-medium leading-[1.6] text-text-tertiary">
        {t('erp.overview.empty.body')}
      </p>
      <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {OTA_FIELDS.map((field) => (
          <li key={field} className="flex items-start gap-2">
            <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
            <span className="text-sm font-medium leading-[1.4] text-text-secondary">
              {t(`erp.overview.empty.field.${field}`)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 border-t border-surface-background pt-5 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
            {t('erp.overview.empty.guided')}
          </p>
          <div className="mt-auto">
            <PrimaryLink to="/settings/erp-mapping/fields">
              {t('erp.overview.cta.start')}
            </PrimaryLink>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
            {t('erp.overview.empty.hand')}
          </p>
          <div className="mt-auto">
            <SecondaryLink to="/settings/erp-mapping/advanced">
              {t('erp.overview.cta.upload')}
            </SecondaryLink>
          </div>
        </div>
      </div>
    </section>
  )
}

/** One row per route: the state, what happened last, and the way to run it. */
function CertificationTable() {
  const { t } = useTranslation()
  const view = useErpMapping()

  const detail = (route: (typeof MAPPING_CERTIFICATION_ROUTES)[number]) => {
    const { state, last, pass } = view.certification[route]
    if (state === 'CERTIFIED' && pass)
      return t('erp.overview.cert.certifiedOn', { date: shortDate(new Date(pass.certified_at)) })
    if (state === 'STALE') return t('erp.overview.cert.staleNote')
    if (last)
      return `${t('erp.overview.cert.failedOn', {
        date: shortDate(new Date(last.certified_at)),
      })} · ${t('erp.overview.cert.findings', { count: last.error_count })}`
    return t('erp.overview.cert.notTried')
  }

  return (
    <SectionCard title={t('erp.overview.cert.title')} note={t('erp.overview.cert.note')}>
      <div className="max-md:px-5 max-md:pb-5">
        <RowsView>
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <Th first>{t('erp.overview.cert.col.route')}</Th>
                <Th>{t('erp.overview.cert.col.state')}</Th>
                <Th>{t('erp.overview.cert.col.detail')}</Th>
                <Th align="end">{t('erp.overview.cert.col.action')}</Th>
              </tr>
            </thead>
            <tbody>
              {MAPPING_CERTIFICATION_ROUTES.map((route) => (
                <tr key={route} className={TBODY_ROW}>
                  <Td first>
                    <p className="text-sm font-semibold text-text-primary">
                      {t(`erp.certRoute.${route}`)}
                    </p>
                  </Td>
                  <Td>
                    <RouteStatePill state={view.certification[route].state} />
                  </Td>
                  <Td>
                    <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
                      {detail(route)}
                    </p>
                  </Td>
                  <Td align="end">
                    <Link
                      to={`/settings/erp-mapping/certification?route=${route}`}
                      className={`${TEXT_BUTTON} whitespace-nowrap`}
                    >
                      {view.certification[route].last
                        ? t('erp.overview.cert.rerun')
                        : t('erp.overview.cert.run')}
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </RowsView>
      </div>
    </SectionCard>
  )
}
