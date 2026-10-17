import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { OmAmount } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  activityDetailPath,
  loadActivityDetail,
  type ActivityDetailDto,
} from '../../api/compliance/activity'
import {
  recordFromDetail,
  type ActivityRecord,
  type Journey,
  type ReportVersion,
} from '../../lib/activityDetail'
import { formatAmount } from '../../lib/format'
import { COMPANY_PROFILE_PATH, loadCompanyProfile } from '../../api/company/companyProfile'
import { candidateParticipantId } from '../../lib/peppolParticipant'
import { can, useSession } from '../../lib/session/session'
import chevronIcon from '../../assets/invoices/chevron.svg'
import portalIcon from '../../assets/invoice-details/fullscreen.svg'
import otaIcon from '../../assets/activity/ch-ota.svg'
import peppolIcon from '../../assets/activity/ch-peppol.svg'
import stepDoneIcon from '../../assets/activity/step-done.svg'
import stepFailedIcon from '../../assets/activity/step-failed.svg'
import stepWaitingIcon from '../../assets/activity/ack-late.svg'
import warnIcon from '../../assets/activity/warn-danger.svg'
import fileIcon from '../../assets/bill-capture/file.svg'
import sendIcon from '../../assets/activity/ch-peppol.svg'
import cardIcon from '../../assets/suppliers/kpi-owe.svg'

const JOURNEY_ICON: Record<Journey['id'], string> = { ota: otaIcon, peppol: peppolIcon }

const COPY_ICON: Record<ActivityRecord['copies'][number]['id'], string> = {
  accepted: fileIcon,
  withdrawn: fileIcon,
  ack: otaIcon,
  replies: sendIcon,
  invoice: cardIcon,
}

const TONE_PILL: Record<Journey['tone'], { pill: string; dot: string }> = {
  good: { pill: 'bg-success-100 text-[#3d5648]', dot: 'bg-[#3d5648]' },
  bad: { pill: 'bg-danger-100 text-danger-700', dot: 'bg-danger-700' },
  waiting: { pill: 'bg-pending-100 text-pending-700', dot: 'bg-pending-700' },
}

const STATUS_BADGE: Record<ActivityRecord['outcome'], { key: string; tone: Journey['tone'] }> = {
  accepted: { key: 'activityDetail.reportedAccepted', tone: 'good' },
  deliveredUnconfirmed: { key: 'activityDetail.status.deliveredUnconfirmed', tone: 'waiting' },
  rejected: { key: 'activityDetail.status.turnedDown', tone: 'bad' },
  // Replaced or cancelled by a report we sent (TDD type R or D), not turned down.
  superseded: { key: 'activityDetail.status.replaced', tone: 'waiting' },
  waiting: { key: 'activityDetail.status.waiting', tone: 'waiting' },
  // Never reached the OTA, so nothing there is awaited (N5); the journey below says the same.
  notSent: { key: 'activityDetail.step.notSentToFawtara', tone: 'waiting' },
  stopped: { key: 'activityDetail.verdict.stoppedAtFawtir', tone: 'bad' },
  notOwed: { key: 'activityDetail.status.notOwed', tone: 'waiting' },
}

const BUTTON =
  'inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25'

/**
 * One document's record: Compliance › Activity › INV-1993 (Figma 154:111026), read from
 * `/v1/compliance/activity/{invoice_uuid}`.
 *
 * "Open invoice" takes the reader to the invoice itself: Figma 154:108267 ("Open invoice") is that
 * screen, the invoice detail with its Compliance card, reached from here.
 */
export function ActivityEventPage() {
  return (
    <AppShell>
      <ActivityRecordScreen />
    </AppShell>
  )
}

function ActivityRecordScreen() {
  const { t, i18n } = useTranslation()
  const { id = '' } = useParams()
  const path = activityDetailPath(id)
  const detail = useApiRead<ActivityDetailDto>(path, () => loadActivityDetail(id))

  const crumbs = (current: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/compliance/activity"
        className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
      >
        {t('activity.title')}
      </Link>
      <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
      <span className="text-2xl font-medium leading-[1.2] text-text-primary">{current}</span>
    </div>
  )

  if (detail.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {crumbs(t('activityDetail.record'))}
        {detail.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={detail.read.error} retry={detail.retry} />
        )}
      </div>
    )
  }

  return <Record record={recordFromDetail(detail.read.data, i18n.language)} crumbs={crumbs} />
}

function Record({
  record,
  crumbs,
}: {
  record: ActivityRecord
  crumbs: (current: string) => ReactNode
}) {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const mayResubmit = can(session, 'invoice.submit')
  const [copied, setCopied] = useState(false)
  const number = record.invoice ?? t('activity.unnumbered')
  const status = STATUS_BADGE[record.outcome]
  // Our participant ID is `0248:` and our VAT number (src/lib/peppolParticipant.ts). A profile the
  // reader may not see, or one that fails to load, leaves the field "Not on the record yet".
  // TODO(backend): ACTIVITY.md 2.26. The registered ID can differ from this candidate.
  const profile = useApiRead(COMPANY_PROFILE_PATH, loadCompanyProfile).read
  const ourId = profile.status === 'ready' ? candidateParticipantId(profile.data.taxNumber) : null

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {crumbs(number)}

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{number}</h1>
            <Pill tone={status.tone}>{t(status.key)}</Pill>
            {record.supersededCount > 0 ? (
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-sm border border-border-subtle bg-[#eceef2] px-2.5 text-xs font-medium text-text-tertiary">
                <span className="size-1.5 rounded-full bg-text-tertiary" />
                {t('activityDetail.earlierSuperseded', { count: record.supersededCount })}
              </span>
            ) : null}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm font-medium leading-[1.4] text-text-tertiary">
            {record.customer ? (
              <span>
                {t(record.direction === 'RECEIVED' ? 'activityDetail.from' : 'activityDetail.to')}{' '}
                <span className="text-text-primary">{record.customer}</span>
              </span>
            ) : null}
            <span>- {t('activityDetail.issuedOn', { date: record.issued })}</span>
            {record.amount !== null ? (
              <span className="flex items-center gap-1.5">
                -
                <OmAmount
                  size="xs"
                  amount={formatAmount(record.amount, record.currency, i18n.language)}
                  amountClassName="font-semibold text-text-primary tabular-nums"
                />
              </span>
            ) : null}
            {record.outcome === 'accepted' ? (
              <span>
                -{' '}
                {record.attempts === 1
                  ? t('activityDetail.reportedFirst')
                  : t('activityDetail.reportedOnAttempt', { count: record.attempts })}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
          {record.links.document ? (
            <Link to={`/invoices/${record.invoiceUuid}`} className={BUTTON}>
              {t('activityDetail.openInvoice')}
            </Link>
          ) : null}
          {/* TODO(backend): no portal deep link on the record yet (asks row 2.12). */}
          <button
            type="button"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={portalIcon} alt="" className="size-5 brightness-0 invert" />
            {t('activityDetail.lookOnPortal')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="rounded-md bg-surface-card p-6">
            <h2 className="text-lg font-medium leading-[1.2] text-text-primary">
              {t('activityDetail.whereItWent')}
            </h2>
            <div className="mt-5 flex flex-col gap-8">
              {record.journeys.map((journey) => (
                <JourneyBlock key={journey.id} journey={journey} customer={record.customer} />
              ))}
              {record.journeys.every((journey) => journey.id !== 'peppol') ? (
                <p className="text-sm font-medium text-text-tertiary">
                  {t('activityDetail.noPeppolJourney')}
                </p>
              ) : null}
            </div>
          </section>

          {record.rejection ? (
            <section className="rounded-md bg-surface-card p-6">
              <h2 className="text-lg font-medium leading-[1.2] text-text-primary">
                {record.rejection.later === 'accepted'
                  ? t('activityDetail.whyTurnedDown')
                  : t('activityDetail.whyItWasTurnedDown')}
              </h2>

              <div className="mt-4 rounded-sm border border-[#f0d4ce] bg-[#fdf4f2] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="flex items-center gap-2 text-base font-medium text-danger-700">
                    <img src={warnIcon} alt="" className="size-[18px]" />
                    {t('activityDetail.rejection.whatTheySaid')}
                  </p>
                  {record.rejection.code ? (
                    <span className="shrink-0 rounded-sm bg-white px-2 py-1 font-mono text-[11px] font-semibold text-danger-700">
                      {record.rejection.code}
                    </span>
                  ) : null}
                </div>
                {/* TODO(backend): the frame's cause title, validator line and "See what changed" (asks row 2.24). */}
                <p className="mt-3 text-sm font-medium leading-[1.7] text-text-secondary">
                  {record.rejection.reason}
                </p>
                {/* How it is put right follows from what was refused (ACTIVITY.md 2.30). */}
                <p className="mt-2 text-sm font-medium leading-[1.6] text-text-tertiary">
                  {t(`activityDetail.refusalKind.${record.rejection.kind}`)}
                  {/* In the existing line, not a new mark: the frame has no slot for it. */}
                  {record.rejection.held ? ` ${t('activity.correctionHeld')}` : null}
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {record.rejection.later === 'open' &&
                  (record.resend === 'possible' || record.resend === 'possibleInvoice') &&
                  mayResubmit ? (
                    <Link
                      to={`/compliance/activity/${record.invoiceUuid}/resubmit`}
                      className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
                    >
                      {t('activity.menu.resubmit')}
                    </Link>
                  ) : null}
                  <Link
                    to="/compliance/activity?tab=rejected"
                    className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
                  >
                    {t('activityDetail.otherInvoices')}
                  </Link>
                </div>
              </div>
            </section>
          ) : null}

          {record.versions.length > 0 ? (
            <section className="rounded-md bg-surface-card p-6">
              <h2 className="text-lg font-medium leading-[1.2] text-text-primary">
                {t('activityDetail.whatOtaHolds')}
              </h2>
              <div className="mt-4 flex flex-col gap-3">
                {record.versions.map((version) => (
                  <VersionBlock key={version.id} version={version} invoice={number} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Route */}
          <section className="rounded-md bg-surface-card p-6">
            <h2 className="text-lg font-medium leading-[1.2] text-text-primary">
              {t('activityDetail.whichRoute')}
            </h2>
            <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <RouteField
                label={t('activityDetail.route.scenario')}
                value={
                  record.route.received
                    ? // Reported by us as the receiver (TDT-010 = 02), never a flow we sent.
                      t('activity.route.received')
                    : record.route.flow === 'export'
                      ? record.route.scope
                        ? t('activity.route.exportScope', { scope: record.route.scope })
                        : t('activity.route.exportNoScope')
                      : record.route.flowNumber === null
                        ? t(`activityDetail.route.scenarioOf.${record.route.flow}`)
                        : t('activityDetail.route.flowN', {
                            flow: record.route.flowNumber,
                            what: t(`activityDetail.route.scenarioOf.${record.route.flow}`),
                          })
                }
              />
              <RouteField
                label={t('activityDetail.route.documentsExchanged')}
                value={
                  record.route.mlsCount > 0
                    ? t('activityDetail.route.documentsWithMls', { count: record.route.mlsCount })
                    : t('activityDetail.route.documentsNoMls')
                }
              />
              {/* TODO(backend): neither participant ID is on the record (asks rows 2.13, 2.26). */}
              <RouteField label={t('activityDetail.route.yourId')} value={ourId} mono />
              <RouteField
                label={t('activityDetail.route.theirId')}
                value={record.route.theirId}
                mono
              />
              <RouteField
                label={t('activityDetail.route.standIn')}
                value={
                  record.route.standIn ??
                  t(
                    record.route.flow === 'export'
                      ? 'activityDetail.route.noStandInExport'
                      : 'activityDetail.route.noStandIn',
                  )
                }
                mono={record.route.standIn !== null}
              />
              {/* TODO(backend): ACTIVITY.md 2.27. Billing 1.0.1 until the item carries its CustomizationID. */}
              <RouteField label={t('activityDetail.route.profile')} value={record.route.profile} />
            </dl>
          </section>
        </div>

        {/* Side column */}
        <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-6">
            <h3 className="text-base font-medium leading-[1.2] text-text-primary">
              {t('activityDetail.checkItYourself')}
            </h3>

            <div className="mt-4 rounded-sm border border-primary-300 bg-primary-25 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.7px] text-primary-700">
                {t('activityDetail.fawtaraReference')}
              </p>
              <p className="mt-1.5 font-mono text-sm font-semibold text-text-primary">
                {record.proof.reference ?? t('activityDetail.noReferenceYet')}
              </p>
            </div>

            <dl className="mt-3 flex flex-col">
              <SideRow
                label={t('activityDetail.tddUuid')}
                value={record.proof.uuid ?? t('activity.ref.noUuid')}
                mono={record.proof.uuid !== null}
              />
              <SideRow
                label={t('activityDetail.acceptedLabel')}
                value={record.proof.acceptedAt ?? t('activityDetail.notYet')}
                last
              />
            </dl>

            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={!record.proof.reference}
                onClick={() => {
                  void navigator.clipboard?.writeText(record.proof.reference ?? '')
                  setCopied(true)
                }}
                className="inline-flex h-[34px] flex-1 items-center justify-center rounded-sm border border-border-subtle bg-white px-3 text-[13px] font-medium text-text-secondary transition-colors hover:bg-primary-25 disabled:text-text-quaternary"
              >
                {copied ? t('activityDetail.copiedReference') : t('activityDetail.copyReference')}
              </button>
              <button
                type="button"
                className="inline-flex h-[34px] flex-1 items-center justify-center rounded-sm border border-border-subtle bg-white px-3 text-[13px] font-medium text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('activityDetail.openPortal')}
              </button>
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-6">
            <h3 className="text-base font-medium leading-[1.2] text-text-primary">
              {t('activityDetail.howLongKept')}
            </h3>
            <dl className="mt-3 flex flex-col">
              <SideRow
                label={t('activityDetail.retention.keptUntil')}
                value={record.retention.keptUntil}
              />
              <SideRow
                label={t('activityDetail.retention.timeRemaining')}
                value={t('activityDetail.retention.yearsMonths', {
                  years: record.retention.years,
                  months: record.retention.months,
                })}
              />
              <SideRow
                label={t('activityDetail.retention.reasonLabel')}
                value={t('activityDetail.retention.reason')}
              />
              {/* TODO(backend): the archive's integrity check is not on the record (asks row 2.14). */}
              <SideRow
                label={t('activityDetail.retention.integrity')}
                value={t('activityDetail.retention.checkedToday')}
                tone="text-[#3d5648]"
                last
              />
            </dl>
          </section>

          <section className="rounded-md bg-surface-card p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('activityDetail.takeACopy')}
              </h3>
              <button
                type="button"
                className="text-sm font-medium text-primary-700 hover:underline"
              >
                {t('activityDetail.getZip')}
              </button>
            </div>
            {/* TODO(backend): per-file downloads and sizes are not on the record (asks row 2.15). */}
            <ul className="mt-2 flex flex-col">
              {record.copies.map((copy, index) => (
                <li
                  key={`${copy.id}-${index}`}
                  className={[
                    'flex items-center gap-3 py-3',
                    index < record.copies.length - 1 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-background">
                    <img src={COPY_ICON[copy.id]} alt="" className="size-4" />
                  </span>
                  <p className="min-w-0 flex-1 text-sm font-medium leading-[1.3] text-text-primary">
                    {t(copy.titleKey)}{' '}
                    <span className="text-xs font-medium text-text-quaternary">
                      {t(copy.metaKey, copy.values)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md bg-surface-card p-6">
            <h3 className="text-base font-medium leading-[1.2] text-text-primary">
              {t('activityDetail.sendItAgain')}
            </h3>
            <p className="mt-3 text-sm font-medium leading-[1.6] text-text-tertiary">
              {t(`activityDetail.resend.${record.resend}Body`)}
            </p>
            {(record.resend === 'possible' || record.resend === 'possibleInvoice') &&
            mayResubmit ? (
              <Link
                to={`/compliance/activity/${record.invoiceUuid}/resubmit`}
                className="mt-4 inline-flex h-[34px] w-full items-center justify-center rounded-sm bg-primary-700 text-[13px] font-medium text-white transition-colors hover:bg-primary-800"
              >
                {t('activity.menu.resubmit')}
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="mt-4 inline-flex h-[34px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-[13px] font-medium text-text-secondary disabled:cursor-not-allowed"
              >
                {t('activityDetail.resend.nothing')}
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

function Pill({ tone, children }: { tone: Journey['tone']; children: ReactNode }) {
  return (
    <span
      className={[
        'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium',
        TONE_PILL[tone].pill,
      ].join(' ')}
    >
      <span className={['size-1.5 rounded-full', TONE_PILL[tone].dot].join(' ')} />
      {children}
    </span>
  )
}

function JourneyBlock({ journey, customer }: { journey: Journey; customer: string | null }) {
  const { t } = useTranslation()

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-50">
            <img src={JOURNEY_ICON[journey.id]} alt="" className="size-[18px]" />
          </span>
          <div>
            <p className="text-base font-medium leading-[1.3] text-text-primary">
              {t(journey.titleKey, { customer: customer ?? t('activityDetail.theCustomer') })}
            </p>
            <p className="mt-0.5 text-[13px] font-medium leading-[1.4] text-text-tertiary">
              {t(journey.subtitleKey)}
            </p>
          </div>
        </div>
        <Pill tone={journey.tone}>{t(journey.verdictKey, journey.verdictValues)}</Pill>
      </div>

      {/* The rail: a dot per step at its start, the connector red where it broke. */}
      <ol className="mt-5 flex overflow-x-auto pb-1">
        {journey.steps.map((step, index) => {
          const last = index === journey.steps.length - 1
          const next = journey.steps[index + 1]
          const broken = step.state === 'failed' || next?.state === 'failed'
          return (
            <li key={step.id} className="flex min-w-[128px] flex-1 flex-col">
              <div className="flex items-center">
                <img
                  src={
                    step.state === 'failed'
                      ? stepFailedIcon
                      : step.state === 'waiting'
                        ? stepWaitingIcon
                        : stepDoneIcon
                  }
                  alt=""
                  className="size-5 shrink-0"
                />
                {last ? null : (
                  <span
                    className={[
                      'h-[2px] flex-1',
                      broken
                        ? 'bg-danger-700'
                        : next?.state === 'waiting'
                          ? 'bg-border-default'
                          : 'bg-[#4c6c5a]',
                    ].join(' ')}
                  />
                )}
              </div>
              <p
                className={[
                  'mt-3 pe-2 text-sm font-medium leading-[1.3]',
                  step.state === 'failed' ? 'text-danger-700' : 'text-text-primary',
                ].join(' ')}
              >
                {t(step.labelKey)}
              </p>
              {step.at ? (
                <p className="mt-1.5 pe-2 text-[11px] font-medium leading-[1.4] text-text-tertiary">
                  {step.at}
                </p>
              ) : null}
              {step.note ? (
                <p className="pe-2 text-[11px] font-medium leading-[1.4] text-text-tertiary">
                  {step.note}
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function VersionBlock({ version, invoice }: { version: ReportVersion; invoice: string }) {
  const { t } = useTranslation()
  const live = version.state === 'live'

  return (
    <div
      className={[
        'rounded-sm border p-4',
        live ? 'border-[#cfe0d5] bg-[#e8f0eb]' : 'border-border-subtle bg-white',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={[
              'flex size-9 shrink-0 items-center justify-center rounded-sm text-xs font-semibold',
              live ? 'bg-[#4c6c5a] text-white' : 'bg-surface-background text-text-quaternary',
            ].join(' ')}
          >
            {version.version}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-[1.3] text-text-primary">
              {t(version.headlineKey, { at: version.at ?? '' })}
            </p>
            <p className="mt-1 break-all font-mono text-[11px] leading-[1.5] text-text-quaternary">
              {version.uuid ?? t('activity.ref.noUuid')} ·{' '}
              {version.reference
                ? t('activity.fawtara', { ref: version.reference })
                : t('activityDetail.versions.noReference')}
            </p>
            <p className="mt-2 text-xs font-medium leading-[1.6] text-text-secondary">
              {t(version.bodyKey, { invoice })}
            </p>
          </div>
        </div>
        <span
          className={[
            'shrink-0 text-[10px] font-semibold uppercase tracking-[0.6px]',
            live ? 'text-[#3d5648]' : 'text-text-quaternary',
          ].join(' ')}
        >
          {t(`activityDetail.versionState.${version.state}`)}
        </span>
      </div>
    </div>
  )
}

function RouteField({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null
  mono?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div>
      <dt className="text-xs font-medium leading-[1.3] text-text-tertiary">{label}</dt>
      <dd className="mt-1">
        {value === null ? (
          <span className="text-sm font-medium text-text-quaternary">
            {t('activityDetail.route.notOnRecord')}
          </span>
        ) : mono ? (
          <span className="inline-flex rounded-sm bg-surface-background px-1.5 py-0.5 font-mono text-xs font-semibold text-text-primary">
            {value}
          </span>
        ) : (
          <span className="text-sm font-medium text-text-primary">{value}</span>
        )}
      </dd>
    </div>
  )
}

function SideRow({
  label,
  value,
  mono,
  tone,
  last,
}: {
  label: string
  value: string
  mono?: boolean
  tone?: string
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">{label}</dt>
      <dd
        className={[
          'min-w-0 break-all text-end text-sm',
          mono ? 'font-mono text-xs font-semibold' : 'font-medium',
          tone ?? 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
