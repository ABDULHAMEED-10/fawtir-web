import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RowsView } from '../../components/ui'
import { CoverageBanner, ErpShell, RouteStatePill } from './ErpShell'
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
import { eventText } from './overview/files'
import {
  CERT_ROUTES,
  activeProfile,
  mappingRoute,
  mappingStore,
  overviewStatus,
  readiness,
  routeStates,
  shortHash,
  useErpMapping,
  type OverviewStatus,
} from '../../lib/erpMapping'
import { TARGET_BY_ID } from '../../lib/erpCatalogue'
import { shortDate } from '../../lib/settings'
import routeIcon from '../../assets/settings/tile-integration.svg'
import fieldsIcon from '../../assets/settings/check-ink.svg'
import certifiedIcon from '../../assets/settings/cert-ok.svg'
import samplesIcon from '../../assets/settings/folder.svg'
import infoIcon from '../../assets/settings/info.svg'
import tickIcon from '../../assets/settings/check-green.svg'

const SAMPLE_LIMIT = 10

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
 * Four figures, the coverage limits, one row per certification route and the last five things
 * that happened. The call to action follows the status, so the button always says the next step
 * rather than a generic "manage".
 */
export function ErpOverviewPage() {
  const { t, i18n } = useTranslation()
  const state = useErpMapping()
  const status = overviewStatus(state)
  const route = mappingRoute(state)
  const ready = readiness(state)
  const routes = routeStates(state)
  const active = activeProfile(state)
  const [startingOver, setStartingOver] = useState(false)

  const certified = CERT_ROUTES.filter((r) => routes[r].state === 'CERTIFIED').length
  const failed = CERT_ROUTES.filter((r) => routes[r].state === 'FAILED').length
  const stale = CERT_ROUTES.filter((r) => routes[r].state === 'STALE').length
  const missing = ready.missingRequiredTargets.length
  const invalid = ready.invalidMappings.length
  const notSetUp = status === 'NOT_SET_UP'
  const handWrittenOverGuided = route === 'HAND_WRITTEN' && state.guided && state.entries.length > 0

  const termName = (id: string) => {
    const target = TARGET_BY_ID[id]
    if (!target) return id
    return i18n.language.startsWith('ar') ? target.nameAr : target.name
  }

  const fieldsNote = () => {
    if (invalid > 0) return t('erp.overview.kpi.invalid', { count: invalid })
    if (missing === 0) return t('erp.overview.kpi.fieldsComplete')
    const names = ready.missingRequiredTargets.slice(0, 3).map(termName)
    const rest = missing - names.length
    return t('erp.overview.kpi.fieldsMissing', {
      count: missing,
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

  const samplesNote = () => {
    const count = state.samples.length
    if (count === 0) return t('erp.overview.kpi.samplesNone')
    if (count >= SAMPLE_LIMIT) return t('erp.overview.kpi.samplesAtLimit')
    return t('erp.overview.kpi.samplesRoom', { count: SAMPLE_LIMIT - count })
  }

  const routeNote = () => {
    if (!active) return t('erp.route.NONE')
    return t('erp.overview.kpi.profileNote', {
      system: route === 'GUIDED' ? t(`erp.sourceSystem.${state.sourceSystem}`) : active.erpKey,
      version: active.version,
      hash: shortHash(active.contentHash),
    })
  }

  return (
    <ErpShell
      title={t('erp.overview.title')}
      subtitle={t('erp.overview.subtitle')}
      actions={
        <>
          <CallToAction status={status} missing={missing} />
          {notSetUp ? (
            <button
              type="button"
              onClick={() => mappingStore.restoreStory()}
              className={TEXT_BUTTON}
            >
              {t('erp.overview.actions.restoreExample')}
            </button>
          ) : (
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
          value={t(`erp.overview.kpi.routeValue.${route}`)}
          note={routeNote()}
          highlight={route === 'NONE' && !notSetUp}
        />
        <Kpi
          icon={fieldsIcon}
          label={t('erp.overview.kpi.fields')}
          value={String(ready.mappedRequired.length)}
          unit={t('erp.overview.kpi.ofRequired', { count: ready.requiredTargets.length })}
          note={fieldsNote()}
          tone={invalid > 0 ? 'danger' : missing > 0 && !notSetUp ? 'pending' : undefined}
        />
        <Kpi
          icon={certifiedIcon}
          tint="bg-success-100"
          label={t('erp.overview.kpi.certified')}
          value={String(certified)}
          unit={t('erp.overview.kpi.ofRoutes', { count: CERT_ROUTES.length })}
          note={certifiedNote()}
          tone={failed > 0 ? 'danger' : stale > 0 ? 'pending' : undefined}
        />
        <Kpi
          icon={samplesIcon}
          tint="bg-pending-100"
          label={t('erp.overview.kpi.samples')}
          value={String(state.samples.length)}
          unit={t('erp.overview.kpi.ofSamples', { count: SAMPLE_LIMIT })}
          note={samplesNote()}
          tone={state.samples.length >= SAMPLE_LIMIT ? 'pending' : undefined}
        />
      </div>

      {notSetUp ? (
        <EmptyState />
      ) : (
        <>
          {state.guided ? <CoverageBanner /> : null}

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

          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="min-w-0 flex-1">
              <CertificationTable />
            </div>
            <aside className="w-full xl:w-[360px] xl:shrink-0">
              <RecentActivity />
            </aside>
          </div>
        </>
      )}

      <ConfirmModal
        open={startingOver}
        title={t('erp.overview.startOver.title')}
        body={t('erp.overview.startOver.body')}
        confirmLabel={t('erp.overview.startOver.confirm')}
        danger
        onClose={() => setStartingOver(false)}
        onConfirm={() => {
          mappingStore.startOver()
          setStartingOver(false)
        }}
      />
    </ErpShell>
  )
}

/** The next step, as one button. */
function CallToAction({ status, missing }: { status: OverviewStatus; missing: number }) {
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
  const state = useErpMapping()
  const routes = routeStates(state)

  const detail = (route: (typeof CERT_ROUTES)[number]) => {
    const { state: routeState, last, pass } = routes[route]
    if (routeState === 'CERTIFIED' && pass)
      return t('erp.overview.cert.certifiedOn', { date: shortDate(pass.at) })
    if (routeState === 'STALE') return t('erp.overview.cert.staleNote')
    if (last)
      return `${t('erp.overview.cert.failedOn', { date: shortDate(last.at) })} · ${t(
        'erp.overview.cert.findings',
        { count: last.findings.length },
      )}`
    return t('erp.overview.cert.notTried')
  }

  return (
    <SectionCard title={t('erp.overview.cert.title')} note={t('erp.overview.cert.note')}>
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
            {CERT_ROUTES.map((route) => (
              <tr key={route} className={TBODY_ROW}>
                <Td first>
                  <p className="text-sm font-semibold text-text-primary">
                    {t(`erp.certRoute.${route}`)}
                  </p>
                </Td>
                <Td>
                  <RouteStatePill state={routes[route].state} />
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
                    {routes[route].last ? t('erp.overview.cert.rerun') : t('erp.overview.cert.run')}
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </RowsView>
    </SectionCard>
  )
}

/** The last five audit entries, and the way to the whole log. */
function RecentActivity() {
  const { t } = useTranslation()
  const state = useErpMapping()
  const recent = state.events.slice(0, 5)

  return (
    <SectionCard
      title={t('erp.overview.activity.title')}
      note={t('erp.overview.activity.note')}
      className="h-full"
    >
      {recent.length === 0 ? (
        <p className="border-t border-surface-background px-5 py-8 text-center text-sm font-medium text-text-quaternary">
          {t('erp.overview.activity.empty')}
        </p>
      ) : (
        <ul className="border-t border-surface-background">
          {recent.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-1 border-b border-surface-background px-5 py-3.5 last:border-0"
            >
              <p className="text-sm font-medium leading-[1.5] text-text-primary">
                {eventText(t, event)}
              </p>
              <p className="text-xs font-medium text-text-quaternary">
                {t('erp.overview.activity.by', { who: event.by, date: shortDate(event.at) })}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-surface-background px-5 py-4">
        <Link to="/settings/activity-log" className={TEXT_BUTTON}>
          {t('erp.overview.activity.seeAll')}
        </Link>
      </div>
    </SectionCard>
  )
}
