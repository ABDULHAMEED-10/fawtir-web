import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  DOCUMENT_AMOUNTS,
  OUTCOME_TONE,
  TRANSMISSIONS,
  attemptsFor,
  buildUbl,
  findEvent,
  journeyFor,
} from '../../lib/activityDetail'
import chevronIcon from '../../assets/invoices/chevron.svg'
import copyIcon from '../../assets/invoice-details/copy.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import peppolIcon from '../../assets/activity/ch-peppol.svg'
import otaIcon from '../../assets/activity/ch-ota.svg'
import checkIcon from '../../assets/bill-detail/tick.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import stopIcon from '../../assets/suppliers/consequence-stop.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

const OUTCOME_ICON = {
  cleared: checkIcon,
  waiting: warnIcon,
  attention: stopIcon,
  failed: stopIcon,
}

export function ActivityEventPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const [copied, setCopied] = useState(false)

  const event = findEvent(id)
  if (!event) return <Navigate to="/compliance/activity" replace />

  const transmission = TRANSMISSIONS[event.id]
  const journey = journeyFor(event.document)
  const attempts = attemptsFor(event.document)
  const amounts = DOCUMENT_AMOUNTS[event.document]
  const tone = OUTCOME_TONE[event.outcome]
  const xml = buildUbl(event)
  const channelIcon = event.channel === 'peppol' ? peppolIcon : otaIcon

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(xml)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // A blocked clipboard is not worth interrupting the page for.
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/compliance/activity"
                className="text-base font-medium text-text-quaternary hover:text-primary-700"
              >
                {t('activity.title')}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-4 rtl:rotate-180" />
              <span className="text-base font-semibold text-text-primary">{event.document}</span>
            </div>
            <h1 className="mt-1.5 text-[32px] font-medium leading-[1.2] text-text-primary">
              {t(event.stepKey)}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t(`activity.kind.${event.documentKind}`)} ·{' '}
              {t(`activity.direction.${event.direction}`)} · {event.party} ·{' '}
              {t(`activity.${event.day}`)} {event.at}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={copyIcon} alt="" className="size-5" />
              {copied ? t('activityEvent.copied') : t('activityEvent.copyXml')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={downloadIcon} alt="" className="size-5" />
              {t('activityEvent.downloadXml')}
            </button>
            {event.actionKey ? (
              <button
                type="button"
                className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t(event.actionKey)}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* Outcome */}
            <section className={['rounded-md border p-5', tone.bg, tone.border].join(' ')}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white">
                  <img src={OUTCOME_ICON[event.outcome]} alt="" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className={['text-xl font-medium leading-[1.2]', tone.text].join(' ')}>
                    {t(`activity.outcome.${event.outcome}`)} ·{' '}
                    {t(`activity.channel.${event.channel}`)}
                  </h2>
                  <p className="mt-1.5 text-sm font-medium leading-[1.5] text-text-tertiary">
                    {t(event.detailKey, event.detailValues)}
                  </p>
                  {transmission?.responseMessageKey ? (
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary">
                      <span className="rounded-sm bg-white px-2 py-1 font-mono text-xs font-semibold">
                        {transmission.responseCode}
                      </span>
                      {t(transmission.responseMessageKey)}
                    </p>
                  ) : null}
                  {transmission?.responseField ? (
                    <p className="mt-2 break-all font-mono text-xs leading-[1.5] text-text-quaternary">
                      {t('activityEvent.field')}: {transmission.responseField}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Journey */}
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('activityEvent.journey', { document: event.document })}
              </h2>
              <ol className="mt-4 flex flex-col">
                {journey.map((step, index) => {
                  const isCurrent = step.id === event.id
                  const stepTone = OUTCOME_TONE[step.outcome]
                  return (
                    <li key={step.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={[
                            'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                            isCurrent ? 'border-primary-700 bg-primary-25' : 'border-transparent',
                            stepTone.bg,
                          ].join(' ')}
                        >
                          <img
                            src={step.channel === 'peppol' ? peppolIcon : otaIcon}
                            alt=""
                            className="size-3.5"
                          />
                        </span>
                        {index < journey.length - 1 ? (
                          <span className="w-px flex-1 bg-border-subtle" />
                        ) : null}
                      </div>
                      <div className={index < journey.length - 1 ? 'pb-5' : ''}>
                        <p className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              'text-sm leading-[1.3]',
                              isCurrent
                                ? 'font-semibold text-primary-700'
                                : 'font-semibold text-text-primary',
                            ].join(' ')}
                          >
                            {t(step.stepKey)}
                          </span>
                          <span className="text-xs font-medium text-text-quaternary">
                            {t(`activity.${step.day}`)} {step.at}
                          </span>
                          {isCurrent ? (
                            <span className="rounded-sm bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-primary-800">
                              {t('activityEvent.thisEvent')}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                          {t(step.detailKey, step.detailValues)}
                        </p>
                        {step.id !== event.id ? (
                          <Link
                            to={`/compliance/activity/${step.id}`}
                            className="mt-1 inline-block text-xs font-semibold text-primary-700 hover:underline"
                          >
                            {t('activityEvent.openThisStep')}
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>

            {/* Payload */}
            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                    {t('activityEvent.payload')}
                  </h2>
                  <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                    {t('activityEvent.payloadNote')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  <img src={copyIcon} alt="" className="size-4" />
                  {copied ? t('activityEvent.copied') : t('activityEvent.copy')}
                </button>
              </div>
              <pre className="mt-4 max-h-[420px] overflow-auto rounded-sm bg-[#151c2d] p-4 font-mono text-[11px] leading-[1.7] text-[#d5dcf1]">
                {xml}
              </pre>
            </section>
          </div>

          {/* Side */}
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold leading-[1.2] text-text-primary">
                <img src={channelIcon} alt="" className="size-4" />
                {t('activityEvent.thisTransmission')}
              </h2>
              <dl className="mt-3 flex flex-col">
                <Row
                  label={t('activity.col.network')}
                  value={t(`activity.channel.${event.channel}`)}
                />
                <Row
                  label={t('activityEvent.direction')}
                  value={t(`activity.direction.${event.direction}`)}
                />
                <Row
                  label={t('activityEvent.sentAt')}
                  value={`${t(`activity.${event.day}`)} ${event.at}`}
                />
                {event.attempt ? (
                  <Row label={t('activityEvent.attempt')} value={String(event.attempt)} />
                ) : null}
                {transmission?.tookMs ? (
                  <Row
                    label={t('activityEvent.roundTrip')}
                    value={`${(transmission.tookMs / 1000).toFixed(2)}s`}
                  />
                ) : null}
                <Row
                  label={t('activityEvent.messageId')}
                  value={transmission?.messageId ?? '—'}
                  mono
                  last
                />
              </dl>
              {transmission?.endpoint ? (
                <p className="mt-3 break-all rounded-sm bg-surface-background p-3 font-mono text-[11px] leading-[1.6] text-text-tertiary">
                  {transmission.endpoint}
                </p>
              ) : null}
            </section>

            {event.fawtaraUuid ? (
              <section className="rounded-md bg-surface-card p-5">
                <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                  {t('activityEvent.fawtara')}
                </h2>
                <p className="mt-3 break-all rounded-sm bg-success-100 p-3 font-mono text-[11px] leading-[1.6] text-[#2f4438]">
                  {event.fawtaraUuid}
                </p>
                <p className="mt-2.5 text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t('activityEvent.fawtaraNote')}
                </p>
              </section>
            ) : null}

            {attempts.length > 0 ? (
              <section className="rounded-md bg-surface-card p-5">
                <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                  {t('activityEvent.retryHistory')}
                </h2>
                <ul className="mt-3 flex flex-col">
                  {attempts.map((attempt, index) => (
                    <li
                      key={attempt.event.id}
                      className={[
                        'flex items-start gap-3 py-3',
                        index < attempts.length - 1 ? 'border-b border-surface-background' : '',
                      ].join(' ')}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-background text-[11px] font-semibold text-text-tertiary">
                        {attempt.n}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                          {t(`activity.outcome.${attempt.outcome}`)}
                        </p>
                        <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                          {t(`activity.${attempt.event.day}`)} {attempt.event.at}
                          {attempt.transmission?.responseCode
                            ? ` · ${attempt.transmission.responseCode}`
                            : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {attempts.length === 1 && attempts[0].outcome === 'cleared' ? (
                  <p className="mt-2 text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('activityEvent.firstTime')}
                  </p>
                ) : null}
              </section>
            ) : null}

            {amounts ? (
              <section className="rounded-md bg-surface-card p-5">
                <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                  {t('activityEvent.theDocument')}
                </h2>
                <dl className="mt-3 flex flex-col">
                  <Row label={t('activity.col.document')} value={event.document} />
                  <Row
                    label={t('activityEvent.kind')}
                    value={t(`activity.kind.${event.documentKind}`)}
                  />
                  <Row label={t('activityEvent.party')} value={event.party} />
                  <MoneyRow label={t('activityEvent.net')} value={amounts.net} />
                  <MoneyRow label={t('activityEvent.vat')} value={amounts.vat} />
                  <MoneyRow label={t('activityEvent.total')} value={amounts.total} last />
                </dl>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

function Row({
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
        'flex items-start justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="shrink-0 text-sm font-medium leading-[1.3] text-text-tertiary">{label}</dt>
      <dd
        className={[
          'min-w-0 break-all text-end text-sm font-semibold text-text-primary',
          mono ? 'font-mono text-[11px] leading-[1.6]' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}

function MoneyRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">{label}</dt>
      <dd className="flex shrink-0 items-center gap-1 text-sm font-semibold text-text-primary tabular-nums">
        <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
        {value}
      </dd>
    </div>
  )
}
