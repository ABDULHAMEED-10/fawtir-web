import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { CALL_DETAIL, CALL_TOTAL_MS, formatSeconds } from '../../lib/otaCallLog'
import chevronIcon from '../../assets/invoices/chevron.svg'
import copyIcon from '../../assets/invoice-details/copy.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import stepDoneIcon from '../../assets/activity/step-done.svg'
import stepFailedIcon from '../../assets/activity/step-failed.svg'
import stepWaitingIcon from '../../assets/activity/ack-late.svg'
import stepIdleIcon from '../../assets/activity/ack-none.svg'

const STEP_ICON: Record<string, string> = {
  done: stepDoneIcon,
  waiting: stepWaitingIcon,
  failed: stepFailedIcon,
  idle: stepIdleIcon,
}

/**
 * One OTA call in full: Compliance › Activity › Call log › Detail (Figma 154:109008).
 *
 * TODO(backend): there is no call-log endpoint (asks row 2.20), so this is the design's call; the
 * links out of it go to the ledger, searched for the invoice.
 *
 * Both halves of the exchange verbatim. When the Authority refuses a document, the request and
 * the reply are the only things that settle what actually happened, so they are shown as sent
 * rather than summarised.
 */
export function OtaCallDetailPage() {
  const { t } = useTranslation()
  const call = CALL_DETAIL
  const [copied, setCopied] = useState('')

  const copy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text)
    setCopied(id)
  }

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
          <Link
            to="/compliance/activity/call-log"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {t('callLog.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary tabular-nums">
            {call.at}
          </span>
        </div>

        {/* Title */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p dir="ltr" className="flex flex-wrap items-center gap-2.5 text-left">
              <span className="inline-flex h-[24px] items-center rounded-[3px] bg-surface-background px-2 font-mono text-[11px] font-semibold uppercase text-text-tertiary">
                {call.method}
              </span>
              <span className="font-mono text-[28px] font-semibold leading-[1.2] text-text-primary">
                {call.path}
              </span>
              <span className="inline-flex h-[24px] items-center rounded-[3px] bg-danger-100 px-2 font-mono text-[11px] font-semibold text-danger-700">
                {call.status}
              </span>
            </p>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('callDetail.subtitle', {
                date: call.date,
                at: call.at,
                invoice: call.invoice,
                seconds: formatSeconds(CALL_TOTAL_MS),
              })}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
            <button
              type="button"
              onClick={() =>
                copy(
                  'curl',
                  `curl -X ${call.method} ${call.request.headers[0].value} \\\n  -H 'Content-Type: application/xml'`,
                )
              }
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {copied === 'curl' ? t('callDetail.copied') : t('callDetail.copyCurl')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('callDetail.downloadBoth')}
            </button>
            <Link
              to={`/compliance/activity?q=${call.invoice}`}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t('callDetail.openInvoice', { invoice: call.invoice })}
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* Request */}
            <Exchange
              tagKey="callDetail.sent"
              tagTone="bg-primary-50 text-primary-800"
              titleKey="callDetail.whatFawtirSent"
              noteKey="callDetail.theTaxDataDocument"
              headers={call.request.headers}
              body={call.request.body}
              faultLine={call.request.faultLine}
              onCopy={() => copy('request', call.request.body.join('\n'))}
              copied={copied === 'request'}
            />

            {/* Response */}
            <Exchange
              tagKey="callDetail.cameBack"
              tagTone="bg-success-100 text-[#3d5648]"
              titleKey="callDetail.whatOtaAnswered"
              note={t('callDetail.secondsLater', { seconds: formatSeconds(CALL_TOTAL_MS) })}
              headers={call.response.headers}
              body={call.response.body}
              highlight={['OTA-E-2041', 'false', 'REJECTED']}
              onCopy={() => copy('response', call.response.body.join('\n'))}
              copied={copied === 'response'}
            />

            {/* Timeline */}
            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {t('callDetail.secondBySecond')}
                </h2>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('callDetail.startToFinish', { seconds: formatSeconds(CALL_TOTAL_MS) })}
                </span>
              </div>
              <ol className="mt-4 flex flex-col">
                {call.steps.map((step, index) => (
                  <li
                    key={step.id}
                    className={[
                      'flex items-start gap-3 py-3',
                      index < call.steps.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <img src={STEP_ICON[step.state]} alt="" className="mt-0.5 size-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p
                        className={[
                          'text-sm font-semibold leading-[1.3]',
                          step.state === 'failed' ? 'text-danger-700' : 'text-text-primary',
                        ].join(' ')}
                      >
                        {t(`callDetail.step.${step.id}`, { status: call.status })}
                      </p>
                      <p className="mt-1 font-mono text-[11px] leading-[1.5] text-text-quaternary">
                        {step.at ? (
                          <span dir="ltr" className="inline-block">{`${step.at} · `}</span>
                        ) : null}
                        <span className="font-sans font-medium">{t(step.noteKey)}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* Side */}
          <aside className="flex w-full flex-col gap-4 xl:w-[300px] xl:shrink-0">
            <Card title={t('callDetail.theCall')}>
              <Row label={t('callDetail.when')} value={`${call.date.slice(0, 6)} ${call.at}`} />
              <Row label={t('callDetail.typeLabel')} value={t(call.typeKey)} />
              <Row
                label={t('callDetail.answerLabel')}
                value={`${call.status} · ${t(call.answerKey)}`}
                danger
              />
              <Row label={t('callDetail.roundTrip')} value={formatSeconds(CALL_TOTAL_MS)} />
              <Row
                label={t('callDetail.attempt')}
                value={t('callDetail.attemptOf', {
                  n: call.attempt,
                  total: call.attemptsAllowed,
                })}
              />
              <Row label={t('callDetail.quotaUsed')} value={String(call.quotaUsed)} last />
            </Card>

            <Card title={t('callDetail.whereTimeWent')}>
              <ul className="flex flex-col gap-2.5 pt-1">
                {call.timing.map((phase) => (
                  <li key={phase.id} className="flex items-center gap-3">
                    <span className="w-[70px] shrink-0 text-xs font-medium text-text-tertiary">
                      {t(`callDetail.phase.${phase.id}`)}
                    </span>
                    <span className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-background">
                      <span
                        className={phase.id === 'theirSide' ? 'bg-pending-500' : 'bg-primary-700'}
                        style={{ width: `${(phase.ms / CALL_TOTAL_MS) * 100}%` }}
                      />
                    </span>
                    <span className="w-[52px] shrink-0 text-end text-xs font-medium text-text-secondary tabular-nums">
                      {phase.ms >= 1000 ? `${(phase.ms / 1000).toFixed(2)}s` : `${phase.ms}ms`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title={t('callDetail.referencesToQuote')}>
              <Row label={t('callDetail.requestId')} value={call.references.requestId} mono />
              <Row label={t('callDetail.traceId')} value={call.references.traceId} mono />
              <Row
                label={t('callDetail.documentUuid')}
                value={call.references.documentUuid}
                mono
                last
              />
              <button
                type="button"
                onClick={() =>
                  copy(
                    'refs',
                    `${call.references.requestId}\n${call.references.traceId}\n${call.references.documentUuid}`,
                  )
                }
                className="mt-3 inline-flex h-[40px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {copied === 'refs' ? t('callDetail.copied') : t('callDetail.copyAllThree')}
              </button>
            </Card>

            <Card title={t('callDetail.relatedCalls')}>
              <Row
                label={t('callDetail.sameInvoice')}
                value={t('callDetail.nCalls', { count: call.related.sameInvoice })}
              />
              <Row
                label={t('callDetail.sameErrorCode')}
                value={t('callDetail.nThisWeek', { n: call.related.sameErrorThisWeek })}
                accent
              />
              <Row
                label={t('callDetail.sameCustomer')}
                value={t('callDetail.nRefused', { n: call.related.sameCustomerRefused })}
                last
              />
              <Link
                to="/compliance/activity/call-log"
                className="mt-3 inline-flex h-[40px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('callDetail.showAllThree')}
              </Link>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

function Exchange({
  tagKey,
  tagTone,
  titleKey,
  noteKey,
  note,
  headers,
  body,
  faultLine,
  highlight,
  onCopy,
  copied,
}: {
  tagKey: string
  tagTone: string
  titleKey: string
  noteKey?: string
  note?: string
  headers: { key: string; value: string }[]
  body: string[]
  /** 1-indexed line the Authority objected to. */
  faultLine?: number
  /** Tokens to pick out in the body. */
  highlight?: string[]
  onCopy: () => void
  copied: boolean
}) {
  const { t } = useTranslation()

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="flex flex-wrap items-center gap-2.5">
          <span
            className={[
              'inline-flex h-[22px] items-center rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.5px]',
              tagTone,
            ].join(' ')}
          >
            {t(tagKey)}
          </span>
          <span className="text-lg font-semibold leading-[1.2] text-text-primary">
            {t(titleKey)}
          </span>
          <span className="text-xs font-medium text-text-quaternary">
            {note ?? (noteKey ? t(noteKey) : '')}
          </span>
        </p>
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            aria-label={t('callDetail.copyBody')}
            className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
          >
            <img src={copyIcon} alt="" className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t('callDetail.downloadBody')}
            className="inline-flex size-8 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
          >
            <img src={downloadIcon} alt="" className="size-4" />
          </button>
        </span>
      </div>

      {copied ? (
        <p className="px-5 pb-2 text-xs font-medium text-[#3d5648]">{t('callDetail.copied')}</p>
      ) : null}

      <dl
        dir="ltr"
        className="grid gap-x-6 gap-y-2 bg-surface-background/60 px-5 py-4 text-left sm:grid-cols-[150px_1fr]"
      >
        {headers.map((header) => (
          <div key={header.key} className="contents">
            <dt className="font-mono text-[11px] text-text-quaternary">{header.key}</dt>
            <dd className="break-all font-mono text-[11px] text-text-secondary">{header.value}</dd>
          </div>
        ))}
      </dl>

      <pre
        dir="ltr"
        className="overflow-x-auto bg-white px-5 py-4 text-left font-mono text-[11px] leading-[1.7]"
      >
        {body.map((line, index) => {
          const number = index + 1
          const fault = faultLine === number
          const marked =
            highlight?.some((token) => line.includes(token)) && !line.trim().startsWith('//')
          return (
            <div
              key={number}
              className={['flex gap-4 whitespace-pre', fault ? '-mx-5 bg-[#fdf4f2] px-5' : ''].join(
                ' ',
              )}
            >
              <span className="w-6 shrink-0 select-none text-end text-text-quaternary">
                {number}
              </span>
              <span
                className={[
                  fault ? 'text-danger-700' : marked ? 'text-primary-800' : 'text-text-secondary',
                  fault || marked ? 'font-semibold' : '',
                ].join(' ')}
              >
                {line}
              </span>
            </div>
          )
        })}
      </pre>
    </section>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <h3 className="text-base font-semibold leading-[1.2] text-text-primary">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function Row({
  label,
  value,
  mono,
  danger,
  accent,
  last,
}: {
  label: string
  value: string
  mono?: boolean
  danger?: boolean
  accent?: boolean
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
        dir={mono ? 'ltr' : undefined}
        className={[
          'shrink-0 text-sm',
          mono ? 'font-mono text-[11px] font-semibold' : 'font-semibold',
          danger ? 'text-danger-700' : accent ? 'text-pending-700' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
