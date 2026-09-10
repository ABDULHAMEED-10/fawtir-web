import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { RialText } from '../../components/ui'
import {
  QUOTA_LEFT,
  TDD_RESUBMIT,
  UNDECLARED_VAT,
  formatOmr,
  type ChangeRow,
} from '../../lib/tddResubmit'
import chevronIcon from '../../assets/invoices/chevron.svg'
import warnIcon from '../../assets/activity/warn-danger.svg'
import quotaWarnIcon from '../../assets/activity/warn-amber.svg'
import tickIcon from '../../assets/activity/check-filled.svg'
import crossIcon from '../../assets/suppliers/consequence-stop.svg'
import sendIcon from '../../assets/activity/ch-peppol.svg'

export function TddResubmitPage() {
  const { t } = useTranslation()
  const record = TDD_RESUBMIT
  const invoice = record.invoice

  const [peppolId, setPeppolId] = useState(record.fix.suggested)
  const [required, setRequired] = useState(false)

  const valid = record.fix.pattern.test(peppolId.trim())
  const invoices = record.rejection.sameCauseCount

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-24">
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
            to={`/compliance/activity/${invoice}`}
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {invoice}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {t('tddResubmit.breadcrumb')}
          </span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[820px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('tddResubmit.title', { invoice })}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.5] text-[#8f8f8f]">
              {t('tddResubmit.subtitle', { customer: record.customer })}
            </p>
          </div>
          <Link
            to={`/invoices/${invoice}`}
            className="inline-flex h-[46px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('tddResubmit.openInvoice')}
          </Link>
        </div>

        {/* What the Authority said */}
        <section className="rounded-md border border-[#f0d4ce] bg-[#fdf4f2] p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-sm bg-white">
              <img src={warnIcon} alt="" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2.5">
                <span className="text-lg font-semibold leading-[1.2] text-danger-700">
                  {t(record.rejection.headlineKey)}
                </span>
                <span className="rounded-sm bg-white px-2 py-1 font-mono text-[11px] font-semibold text-danger-700">
                  {record.rejection.code}
                </span>
              </p>
              <p className="mt-2.5 text-sm font-medium leading-[1.6] text-text-secondary">
                <Trans
                  i18nKey={record.rejection.bodyKey}
                  values={{ customer: record.customerLegal }}
                  components={{ b: <span className="font-semibold text-text-primary" /> }}
                />
              </p>
              <pre className="mt-3 overflow-x-auto rounded-sm bg-white p-3 text-left font-mono text-[11px] leading-[1.6] text-text-tertiary">
                {record.rejection.raw}
              </pre>

              <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
                <Stat
                  label={t('tddResubmit.rejection.turnedDown')}
                  value={record.rejection.turnedDownAt}
                />
                <Stat
                  label={t('tddResubmit.rejection.attemptsSoFar')}
                  value={String(record.rejection.attemptsSoFar)}
                />
                <Stat
                  label={t('tddResubmit.rejection.undeclaredFor')}
                  value={t(record.rejection.undeclaredForKey)}
                />
                <Stat
                  label={t('tddResubmit.rejection.sameCause')}
                  value={t('tddResubmit.rejection.invoices', { count: invoices })}
                />
              </dl>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* 1 Fix */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={1} title={t('tddResubmit.fixItWhere')} />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-300 bg-primary-25 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white text-xs font-semibold text-primary-800">
                    {record.customerInitials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold leading-[1.2] text-text-primary">
                      {record.customerLegal}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-[1.4] text-text-tertiary">
                      {t(record.customerNoteKey)}
                    </p>
                  </div>
                </div>
                <Link
                  to="/customers"
                  className="inline-flex h-[42px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('tddResubmit.openCustomer')}
                </Link>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="peppol-id"
                  className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary"
                >
                  {t('tddResubmit.peppolIdLabel')}
                  <span className="text-xl leading-4 text-primary-700">*</span>
                </label>
                <div
                  className={[
                    'mt-1.5 flex h-[50px] items-center gap-2 rounded-sm border px-4',
                    valid ? 'border-[#cfe0d5] bg-[#eef5f0]' : 'border-danger-700 bg-white',
                  ].join(' ')}
                >
                  <input
                    id="peppol-id"
                    value={peppolId}
                    onChange={(event) => setPeppolId(event.target.value)}
                    className="w-full min-w-0 border-0 bg-transparent font-mono text-sm text-text-secondary outline-none"
                  />
                  {valid ? <img src={tickIcon} alt="" className="size-5 shrink-0" /> : null}
                </div>
                <p
                  className={[
                    'mt-1.5 text-xs font-medium leading-[1.4]',
                    valid ? 'text-text-quaternary' : 'text-danger-700',
                  ].join(' ')}
                >
                  {valid
                    ? t('tddResubmit.peppolIdHint', { vat: record.vat })
                    : t('tddResubmit.peppolIdInvalid')}
                </p>
              </div>
            </section>

            {/* 2 What changes */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={2} title={t('tddResubmit.whatWillChange')} />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                      <th className="h-[44px] rounded-s-sm px-4 text-start font-semibold">
                        {t('tddResubmit.col.field')}
                      </th>
                      <th className="h-[44px] px-4 text-start font-semibold">
                        {t('tddResubmit.col.turnedDown')}
                      </th>
                      <th className="h-[44px] rounded-e-sm px-4 text-start font-semibold">
                        {t('tddResubmit.col.aboutToSend')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.changes.map((row) => (
                      <ChangeTableRow key={row.id} row={row} peppolId={peppolId} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 3 Cost */}
            <section className="rounded-md bg-surface-card p-5">
              <SectionTitle step={3} title={t('tddResubmit.whatItCosts')} />
              <div className="mt-4 rounded-sm bg-surface-background p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                  <img src={quotaWarnIcon} alt="" className="size-4" />
                  {t('tddResubmit.quotaHeadline')}
                </p>

                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white">
                  <span
                    className="bg-primary-700"
                    style={{ width: `${(record.quota.used / record.quota.allowance) * 100}%` }}
                  />
                  <span
                    className="bg-[#4c6c5a]"
                    style={{
                      width: `${(record.quota.aboutToUse / record.quota.allowance) * 100}%`,
                    }}
                  />
                </div>

                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    {
                      tone: 'bg-primary-700',
                      text: t('tddResubmit.quotaUsed', { count: record.quota.used }),
                    },
                    {
                      tone: 'bg-[#4c6c5a]',
                      text: t('tddResubmit.quotaAboutTo', { count: record.quota.aboutToUse }),
                    },
                    {
                      tone: 'bg-border-default',
                      text: t('tddResubmit.quotaLeft', {
                        count: QUOTA_LEFT,
                        allowance: record.quota.allowance,
                      }),
                    },
                  ].map((entry) => (
                    <li key={entry.text} className="flex items-center gap-1.5">
                      <span className={['size-2.5 rounded-[2px]', entry.tone].join(' ')} />
                      <span className="text-xs font-medium text-text-tertiary">{entry.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          {/* Side */}
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('tddResubmit.ifYouLeaveIt')}
              </h3>
              <ul className="mt-3 flex flex-col gap-3">
                {[
                  <Trans
                    key="sales"
                    i18nKey="tddResubmit.leaveIt.salesUndeclared"
                    values={{
                      amount: `OMR ${formatOmr(record.ifYouLeaveIt.undeclaredInclusive)}`,
                    }}
                    components={{
                      b: <RialText as="span" className="font-semibold text-text-primary" />,
                    }}
                  />,
                  <Trans
                    key="vat"
                    i18nKey="tddResubmit.leaveIt.vatMissing"
                    values={{ amount: `OMR ${formatOmr(UNDECLARED_VAT)}` }}
                    components={{
                      b: <RialText as="span" className="font-semibold text-text-primary" />,
                    }}
                  />,
                  t('tddResubmit.leaveIt.unreported'),
                  t('tddResubmit.leaveIt.futureFails'),
                ].map((line, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <img src={crossIcon} alt="" className="mt-1 size-3 shrink-0" />
                    <span className="text-sm font-medium leading-[1.5] text-text-tertiary">
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('tddResubmit.thisAttempt')}
              </h3>
              <dl className="mt-3 flex flex-col">
                <Row label={t('tddResubmit.attempt.invoice')} value={invoice} />
                <Row label={t('tddResubmit.attempt.customer')} value={record.customer} />
                <Row
                  label={t('tddResubmit.attempt.turnedDown')}
                  value={record.rejection.turnedDownAt}
                  danger
                />
                <Row
                  label={t('tddResubmit.attempt.willBeAttempt')}
                  value={String(record.rejection.attemptsSoFar + 1)}
                />
                <Row
                  label={t('tddResubmit.attempt.fixingAlongside')}
                  value={t('tddResubmit.attempt.moreInvoices', { count: invoices - 1 })}
                />
                <Row
                  label={t('tddResubmit.attempt.quotaAfter')}
                  value={t('tddResubmit.attempt.left', { count: QUOTA_LEFT })}
                  last
                />
              </dl>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('tddResubmit.stopRecurring')}
              </h3>
              <p className="mt-2.5 text-sm font-medium leading-[1.6] text-text-tertiary">
                {t('tddResubmit.stopRecurringBody')}
              </p>
              <button
                type="button"
                onClick={() => setRequired(true)}
                disabled={required}
                className={[
                  'mt-4 inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-sm border text-sm font-semibold transition-colors',
                  required
                    ? 'border-[#cfe0d5] bg-[#eef5f0] text-[#3d5648]'
                    : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                ].join(' ')}
              >
                {required ? <img src={tickIcon} alt="" className="size-4" /> : null}
                {required ? t('tddResubmit.madeRequired') : t('tddResubmit.makeRequired')}
              </button>
            </section>
          </aside>
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 -mx-4 mt-auto border-t border-border-subtle bg-surface-card px-4 py-4">
        <div className="mx-auto flex w-full max-w-[1144px] flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-text-tertiary">
            {t('tddResubmit.footer', { invoices, quota: invoices })}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/compliance/activity"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('tddResubmit.cancel')}
            </Link>
            <button
              type="button"
              disabled={!valid}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-50"
            >
              {t('tddResubmit.saveOnly')}
            </button>
            <button
              type="button"
              disabled={!valid}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
            >
              <img src={sendIcon} alt="" className="size-4 brightness-0 invert" />
              {invoices > 1 ? t('tddResubmit.fixAndSend') : t('tddResubmit.fixAndSendOne')}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function ChangeTableRow({ row, peppolId }: { row: ChangeRow; peppolId: string }) {
  const { t } = useTranslation()
  /** Only the corrected field differs; everything else is carried over untouched. */
  const changes = Boolean(row.after)

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-4 py-3.5 text-sm font-medium text-text-secondary">{t(row.fieldKey)}</td>
      <td className="px-4 py-3.5">
        {row.beforeEmpty ? (
          <span className="text-sm font-medium italic text-danger-700">
            {t('tddResubmit.empty')}
          </span>
        ) : (
          <span
            className={[
              'text-sm text-text-secondary',
              row.mono ? 'font-mono text-xs' : 'font-medium',
            ].join(' ')}
          >
            {row.before}
          </span>
        )}
      </td>
      <td className="px-4 py-3.5">
        {changes ? (
          <span className="font-mono text-xs font-semibold text-[#3d5648]">{peppolId}</span>
        ) : (
          <span className="text-sm font-medium text-text-quaternary">
            {t('tddResubmit.unchanged')}
          </span>
        )}
      </td>
    </tr>
  )
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
        {step}
      </span>
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-danger-700">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  )
}

function Row({
  label,
  value,
  danger,
  last,
}: {
  label: string
  value: string
  danger?: boolean
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
          'shrink-0 text-sm font-semibold',
          danger ? 'text-danger-700' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
