import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ACTIVITY_DETAIL, type Journey, type ReportVersion } from '../../lib/activityDetail'
import chevronIcon from '../../assets/invoices/chevron.svg'
import portalIcon from '../../assets/invoice-details/fullscreen.svg'
import otaIcon from '../../assets/activity/ch-ota.svg'
import peppolIcon from '../../assets/activity/ch-peppol.svg'
import stepDoneIcon from '../../assets/activity/step-done.svg'
import stepFailedIcon from '../../assets/activity/step-failed.svg'
import warnIcon from '../../assets/activity/warn-danger.svg'
import fileIcon from '../../assets/bill-capture/file.svg'
import shieldIcon from '../../assets/bill-detail/compliance.svg'
import sendIcon from '../../assets/activity/ch-peppol.svg'
import cardIcon from '../../assets/suppliers/kpi-owe.svg'

const JOURNEY_ICON: Record<string, string> = { ota: otaIcon, peppol: peppolIcon }

const COPY_ICON: Record<string, string> = {
  accepted: fileIcon,
  withdrawn: fileIcon,
  ack: shieldIcon,
  replies: sendIcon,
  invoice: cardIcon,
}

export function ActivityEventPage() {
  const { t } = useTranslation()
  const record = ACTIVITY_DETAIL
  const invoice = record.invoice
  const [copied, setCopied] = useState(false)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Breadcrumb */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/compliance/activity"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {t('activity.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">{invoice}</span>
        </div>

        {/* Title row */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{invoice}</h1>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-xs font-medium text-[#3d5648]">
                <span className="size-1.5 rounded-full bg-[#3d5648]" />
                {t('activityDetail.reportedAccepted')}
              </span>
              <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-surface-background px-2.5 text-xs font-medium text-text-quaternary">
                <span className="size-1.5 rounded-full bg-text-quaternary" />
                {t('activityDetail.earlierSuperseded', { count: record.supersededCount })}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium leading-[1.4] text-text-tertiary">
              {t('activityDetail.identity', {
                customer: record.customer,
                issued: record.issued,
                amount: record.amount,
              })}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <Link
              to={`/invoices/${invoice}`}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('activityDetail.openInvoice')}
            </Link>
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
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('activityDetail.whereItWent')}
              </h2>
              <div className="mt-4 flex flex-col gap-7">
                {record.journeys.map((journey) => (
                  <JourneyBlock key={journey.id} journey={journey} customer={record.customer} />
                ))}
              </div>
            </section>

            {/* The rejection */}
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('activityDetail.whyTurnedDown')}
              </h2>

              <div className="mt-4 rounded-sm border border-[#f0d4ce] bg-[#fdf4f2] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-danger-700">
                    <img src={warnIcon} alt="" className="size-[18px]" />
                    {t(record.rejection.headlineKey)}
                  </p>
                  <span className="shrink-0 rounded-sm bg-white px-2 py-1 font-mono text-[11px] font-semibold text-danger-700">
                    {record.rejection.code}
                  </span>
                </div>

                <p className="mt-3 text-sm font-medium leading-[1.6] text-text-secondary">
                  <Trans
                    i18nKey={record.rejection.bodyKey}
                    components={{ b: <span className="font-semibold text-text-primary" /> }}
                  />
                </p>

                <pre className="mt-3 overflow-x-auto rounded-sm bg-white p-3 text-left font-mono text-[11px] leading-[1.6] text-text-tertiary">
                  {record.rejection.raw}
                </pre>

                <div className="mt-3 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                  >
                    {t('activityDetail.seeWhatChanged')}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                  >
                    {t('activityDetail.otherInvoices')}
                  </button>
                </div>
              </div>
            </section>

            {/* Versions */}
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('activityDetail.whatOtaHolds')}
              </h2>
              <div className="mt-4 flex flex-col gap-3">
                {record.versions.map((version) => (
                  <VersionBlock key={version.id} version={version} invoice={invoice} />
                ))}
              </div>
            </section>

            {/* Route */}
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('activityDetail.whichRoute')}
              </h2>
              <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <RouteField
                  label={t('activityDetail.route.scenario')}
                  value={t(record.route.scenarioKey)}
                />
                <RouteField
                  label={t('activityDetail.route.documentsExchanged')}
                  value={t(record.route.documentsKey)}
                />
                <RouteField
                  label={t('activityDetail.route.yourId')}
                  value={record.route.ourId}
                  mono
                />
                <RouteField
                  label={t('activityDetail.route.theirId')}
                  value={record.route.theirId}
                  mono
                />
                <RouteField
                  label={t('activityDetail.route.standIn')}
                  value={t(record.route.standInKey)}
                />
                <RouteField
                  label={t('activityDetail.route.profile')}
                  value={record.route.profile}
                />
              </dl>
            </section>
          </div>

          {/* Side column */}
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('activityDetail.checkItYourself')}
              </h3>

              <div className="mt-3 rounded-sm border border-primary-300 bg-primary-25 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-primary-700">
                  {t('activityDetail.fawtaraReference')}
                </p>
                <p className="mt-1 font-mono text-base font-semibold text-text-primary">
                  {record.proof.reference}
                </p>
              </div>

              <dl className="mt-3 flex flex-col">
                <SideRow label={t('activityDetail.tddUuid')} value={record.proof.uuid} mono />
                <SideRow
                  label={t('activityDetail.acceptedLabel')}
                  value={record.proof.acceptedAt}
                  last
                />
              </dl>

              <div className="mt-4 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(record.proof.reference)
                    setCopied(true)
                  }}
                  className="inline-flex h-[40px] flex-1 items-center justify-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {copied ? t('activityDetail.copiedReference') : t('activityDetail.copyReference')}
                </button>
                <button
                  type="button"
                  className="inline-flex h-[40px] flex-1 items-center justify-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('activityDetail.openPortal')}
                </button>
              </div>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('activityDetail.howLongKept')}
              </h3>
              <dl className="mt-3 flex flex-col">
                <SideRow
                  label={t('activityDetail.retention.keptUntil')}
                  value={record.retention.keptUntil}
                />
                <SideRow
                  label={t('activityDetail.retention.timeRemaining')}
                  value={t(record.retention.remainingKey)}
                />
                <SideRow
                  label={t('activityDetail.retention.reasonLabel')}
                  value={t(record.retention.reasonKey)}
                />
                <SideRow
                  label={t('activityDetail.retention.integrity')}
                  value={t(record.retention.integrityKey)}
                  last
                />
              </dl>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                  {t('activityDetail.takeACopy')}
                </h3>
                <button
                  type="button"
                  className="text-sm font-semibold text-primary-700 hover:underline"
                >
                  {t('activityDetail.getZip')}
                </button>
              </div>
              <ul className="mt-2 flex flex-col">
                {record.copies.map((copy, index) => (
                  <li
                    key={copy.id}
                    className={[
                      'flex items-center gap-3 py-3',
                      index < record.copies.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-background">
                      <img src={COPY_ICON[copy.id]} alt="" className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                        {t(copy.titleKey)}
                      </p>
                      <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                        {t(copy.metaKey)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-text-quaternary">
                      {copy.size}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('activityDetail.sendItAgain')}
              </h3>
              <p className="mt-2.5 text-sm font-medium leading-[1.5] text-text-tertiary">
                {t(record.resend.bodyKey)}
              </p>
              <button
                type="button"
                disabled={!record.resend.possible}
                className="mt-4 inline-flex h-[42px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-quaternary disabled:cursor-not-allowed"
              >
                {t('activityDetail.resend.nothing')}
              </button>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

function JourneyBlock({ journey, customer }: { journey: Journey; customer: string }) {
  const { t } = useTranslation()

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary-50">
            <img src={JOURNEY_ICON[journey.id]} alt="" className="size-[18px]" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-[1.3] text-text-primary">
              {t(journey.titleKey, { customer })}
            </p>
            <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
              {t(journey.subtitleKey)}
            </p>
          </div>
        </div>
        <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-xs font-medium text-[#3d5648]">
          <span className="size-1.5 rounded-full bg-[#3d5648]" />
          {t(journey.verdictKey)}
        </span>
      </div>

      {/* The rail: a dot per step, the connector red where it broke. */}
      <ol className="mt-4 flex overflow-x-auto pb-1">
        {journey.steps.map((step, index) => {
          const previous = journey.steps[index - 1]
          const brokeHere = step.state === 'failed' || previous?.state === 'failed'
          return (
            <li key={step.id} className="flex min-w-[132px] flex-1 flex-col">
              <div className="flex items-center">
                {index > 0 ? (
                  <span
                    className={[
                      'h-[2px] flex-1',
                      brokeHere ? 'bg-danger-700' : 'bg-[#4c6c5a]',
                    ].join(' ')}
                  />
                ) : (
                  <span className="flex-1" />
                )}
                <img
                  src={step.state === 'failed' ? stepFailedIcon : stepDoneIcon}
                  alt=""
                  className="size-5 shrink-0"
                />
                {index < journey.steps.length - 1 ? (
                  <span
                    className={[
                      'h-[2px] flex-1',
                      step.state === 'failed' ? 'bg-danger-700' : 'bg-[#4c6c5a]',
                    ].join(' ')}
                  />
                ) : (
                  <span className="flex-1" />
                )}
              </div>
              <p
                className={[
                  'mt-2 px-1 text-center text-xs font-semibold leading-[1.3]',
                  step.state === 'failed' ? 'text-danger-700' : 'text-text-primary',
                ].join(' ')}
              >
                {t(step.labelKey)}
              </p>
              <p className="mt-1 px-1 text-center text-[11px] font-medium leading-[1.4] text-text-quaternary">
                {step.at}
              </p>
              {step.note || step.noteKey ? (
                <p className="px-1 text-center text-[11px] font-medium leading-[1.4] text-text-quaternary">
                  {step.noteKey ? t(step.noteKey) : step.note}
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

  return (
    <div
      className={[
        'rounded-sm border p-4',
        version.live ? 'border-[#cfe0d5] bg-[#eef5f0]' : 'border-border-subtle bg-white',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={[
              'flex size-8 shrink-0 items-center justify-center rounded-sm text-xs font-semibold',
              version.live
                ? 'bg-[#4c6c5a] text-white'
                : 'bg-surface-background text-text-quaternary',
            ].join(' ')}
          >
            {version.version}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-[1.3] text-text-primary">
              {t(version.headlineKey, { at: version.at })}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-[1.5] text-text-quaternary">
              {version.uuid} ·{' '}
              {version.reference
                ? t('activity.fawtara', { ref: version.reference })
                : t(version.referenceNoteKey ?? '')}
            </p>
          </div>
        </div>
        <span
          className={[
            'shrink-0 text-[11px] font-semibold uppercase tracking-[0.6px]',
            version.live ? 'text-[#3d5648]' : 'text-text-quaternary',
          ].join(' ')}
        >
          {version.live ? t('activityDetail.liveAtOta') : t('activityDetail.superseded')}
        </span>
      </div>
      <p className="mt-2.5 text-xs font-medium leading-[1.6] text-text-tertiary">
        {t(version.bodyKey, { invoice })}
      </p>
    </div>
  )
}

function RouteField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium leading-[1.3] text-text-quaternary">{label}</dt>
      <dd
        className={[
          'mt-1 text-sm leading-[1.4] text-text-primary',
          mono ? 'font-mono text-xs' : 'font-medium',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}

function SideRow({
  label,
  value,
  mono,
  last,
}: {
  label: string
  value: string
  mono?: boolean
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
          'shrink-0 text-sm text-text-primary',
          mono ? 'font-mono text-xs' : 'font-semibold',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
