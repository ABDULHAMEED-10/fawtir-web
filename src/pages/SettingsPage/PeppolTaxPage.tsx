import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { ParticipantStandingSection } from './ParticipantStandingSection'
import { Switch } from '../../components/ui'
import { COMPANY, longDate, shortDate } from '../../lib/settings'
import {
  CERTIFICATES,
  certificateState,
  CERT_WARNED_ON,
  RENEWAL_STEPS,
  PEPPOL_VISIBILITY,
  REGISTRATION_ROWS,
  OPEN_BRANCHES,
  type Certificate,
} from '../../lib/settingsCompany'
import shieldIcon from '../../assets/settings/tile-peppol.svg'
import copyIcon from '../../assets/settings/copy.svg'
import urgentIcon from '../../assets/settings/cert-urgent.svg'
import soonIcon from '../../assets/settings/cert-soon.svg'
import okIcon from '../../assets/settings/cert-ok.svg'
import tickIcon from '../../assets/settings/check-white.svg'
import downloadIcon from '../../assets/settings/download-ink.svg'

const TONE_ICON = { urgent: urgentIcon, soon: soonIcon, ok: okIcon }

const TONE_EDGE = {
  urgent: 'border-s-4 border-s-danger-700 bg-[#fdf4f2]',
  soon: 'border-s-4 border-s-pending-500 bg-[#fbf8f2]',
  ok: 'border-s-4 border-s-[#4c6c5a] bg-[#f4f8f5]',
}

const TONE_TINT = {
  urgent: 'bg-danger-100',
  soon: 'bg-pending-100',
  ok: 'bg-success-100',
}

const TONE_BAR = { urgent: 'bg-danger-700', soon: 'bg-pending-500', ok: 'bg-[#4c6c5a]' }

const TONE_TEXT = { urgent: 'text-danger-700', soon: 'text-pending-700', ok: 'text-[#3d5648]' }

/**
 * Settings › Peppol and tax (Figma 135:36580).
 *
 * The identity and the three certificates that keep it working. A certificate's colour and its
 * bar both come from the days it has left, so the screen cannot show a calm green bar above an
 * expiry that is two days away.
 */
export function PeppolTaxPage() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [visibility, setVisibility] = useState(
    () => new Set(PEPPOL_VISIBILITY.filter((row) => row.on).map((row) => row.id)),
  )
  const [checkedNow, setCheckedNow] = useState(false)

  const toggle = (id: string) =>
    setVisibility((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <SettingsShell group="company">
      <SettingsHeader
        title={t('peppolTax.title')}
        subtitle={t('peppolTax.subtitle')}
        actions={
          <button
            type="button"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={downloadIcon} alt="" className="size-[18px]" />
            {t('peppolTax.downloadSummary')}
          </button>
        }
      />

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Live on the network */}
          <section className="rounded-md bg-surface-card px-5 py-8 text-center">
            <span className="mx-auto flex size-[62px] items-center justify-center rounded-full bg-success-100">
              <img src={shieldIcon} alt="" className="size-7" />
            </span>
            <h3 className="mt-4 text-2xl font-medium leading-[1.2] text-text-primary">
              {t('peppolTax.liveHeadline')}
            </h3>
            <p className="mx-auto mt-2 max-w-[540px] text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('peppolTax.liveBody', { date: shortDate(COMPANY.liveSince) })}
            </p>

            <div className="mx-auto mt-5 flex max-w-[510px] items-center justify-between gap-3 rounded-sm bg-surface-background px-4 py-3">
              <span dir="ltr" className="flex flex-wrap items-baseline gap-2 text-left">
                <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                  {t('peppolTax.yourPeppolId')}
                </span>
                <span className="font-mono text-base font-semibold text-text-primary">
                  {COMPANY.peppolId}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(COMPANY.peppolId)
                  setCopied(true)
                }}
                aria-label={t('peppolTax.copyId')}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25"
              >
                <img src={copyIcon} alt="" className="size-[18px]" />
              </button>
            </div>
            {copied ? (
              <p className="mt-2 text-xs font-semibold text-[#3d5648]">{t('peppolTax.copied')}</p>
            ) : null}
          </section>

          <ParticipantStandingSection />

          {/* Certificates */}
          <section className="overflow-hidden rounded-md bg-surface-card">
            <div className="p-5">
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('peppolTax.certificates')}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                {t('peppolTax.certificatesNote')}
              </p>
            </div>
            <ul className="flex flex-col">
              {CERTIFICATES.map((certificate) => (
                <CertificateRow key={certificate.id} certificate={certificate} />
              ))}
            </ul>
          </section>

          {/* Renewal */}
          <section className="rounded-md bg-surface-card">
            <div className="p-5">
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('peppolTax.renewingTitle')}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                {t('peppolTax.renewingNote')}
              </p>
            </div>

            <ol className="flex flex-wrap items-start gap-y-4 border-t border-surface-background px-5 py-6">
              {RENEWAL_STEPS.map((step, index) => (
                <li key={step.id} className="flex min-w-[150px] flex-1 flex-col items-center gap-2">
                  <span className="flex w-full items-center gap-2">
                    <span
                      className={[
                        'h-px flex-1',
                        index === 0 ? 'opacity-0' : 'bg-border-subtle',
                      ].join(' ')}
                    />
                    <span
                      className={[
                        'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        step.state === 'done'
                          ? 'bg-[#4c6c5a] text-white'
                          : step.state === 'current'
                            ? 'bg-danger-700 text-white'
                            : 'border border-border-default bg-white text-text-quaternary',
                      ].join(' ')}
                    >
                      {step.state === 'done' ? (
                        <img src={tickIcon} alt="" className="size-4" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span
                      className={[
                        'h-px flex-1',
                        index === RENEWAL_STEPS.length - 1 ? 'opacity-0' : 'bg-border-subtle',
                      ].join(' ')}
                    />
                  </span>
                  <span
                    className={[
                      'text-center text-sm font-semibold leading-[1.3]',
                      step.state === 'current' ? 'text-danger-700' : 'text-text-primary',
                    ].join(' ')}
                  >
                    {t(`peppolTax.step.${step.id}`)}
                  </span>
                  <span className="text-center text-xs font-medium leading-[1.4] text-text-quaternary">
                    {t(`peppolTax.step.${step.id}Note`, { date: longDate(CERT_WARNED_ON) })}
                  </span>
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center gap-2.5 px-5 pb-5">
              <button
                type="button"
                className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t('peppolTax.startRenewal')}
              </button>
              <button
                type="button"
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('peppolTax.uploadExisting')}
              </button>
              <button
                type="button"
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('peppolTax.remindWeekly')}
              </button>
            </div>
          </section>

          {/* Visibility */}
          <section className="overflow-hidden rounded-md bg-surface-card">
            <div className="flex flex-wrap items-start justify-between gap-3 p-5">
              <div>
                <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {t('peppolTax.appearance')}
                </h3>
                <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                  {t('peppolTax.appearanceNote')}
                </p>
              </div>
              <span className="inline-flex h-[24px] items-center gap-1.5 rounded-[3px] bg-success-100 px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#3d5648]">
                <span className="size-1.5 rounded-full bg-[#4c6c5a]" />
                {t('peppolTax.published')}
              </span>
            </div>
            <ul className="flex flex-col">
              {PEPPOL_VISIBILITY.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                      {t(`peppolTax.visibility.${row.id}`)}
                    </p>
                    <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                      {t(`peppolTax.visibility.${row.id}Note`)}
                    </p>
                  </div>
                  <Switch
                    checked={visibility.has(row.id)}
                    onChange={() => toggle(row.id)}
                    label={t(`peppolTax.visibility.${row.id}`)}
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[320px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('peppolTax.registration')}
              </h3>
              <button
                type="button"
                onClick={() => setCheckedNow(true)}
                className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
              >
                {checkedNow ? t('peppolTax.checked') : t('peppolTax.checkNow')}
              </button>
            </div>
            <dl className="mt-2">
              {REGISTRATION_ROWS.map((row, index) => (
                <div
                  key={row.id}
                  className={[
                    'flex items-center justify-between gap-3 py-2.5',
                    index < REGISTRATION_ROWS.length - 1
                      ? 'border-b border-surface-background'
                      : '',
                  ].join(' ')}
                >
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t(`peppolTax.row.${row.id}`)}
                  </dt>
                  <dd
                    dir={row.mono ? 'ltr' : undefined}
                    className={[
                      'shrink-0 text-sm font-semibold text-text-primary',
                      row.mono ? 'font-mono text-[11px]' : '',
                    ].join(' ')}
                  >
                    {row.valueKey
                      ? t(row.valueKey)
                      : row.value === 'liveSince'
                        ? shortDate(COMPANY.liveSince)
                        : row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('peppolTax.branchesOnPeppol')}
            </h3>
            <ul className="mt-2">
              {OPEN_BRANCHES.map((branch, index) => (
                <li
                  key={branch.id}
                  className={[
                    'flex items-center justify-between gap-3 py-2.5',
                    index < OPEN_BRANCHES.length - 1 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <span className="text-sm font-medium text-text-tertiary">
                    {branch.name}
                    {branch.headOffice ? ` · ${t('peppolTax.headOffice')}` : ''}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-text-primary">
                    {t('peppolTax.sharesTheMainId')}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('peppolTax.ifSomethingBreaks')}
            </h3>
            <div className="mt-3 flex flex-col gap-2.5">
              <Link
                to="/compliance/activity/call-log"
                className="inline-flex h-[42px] items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('peppolTax.seeTddLog')}
              </Link>
              <button
                type="button"
                className="inline-flex h-[42px] items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('peppolTax.testSandbox')}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </SettingsShell>
  )
}

function CertificateRow({ certificate }: { certificate: Certificate }) {
  const { t } = useTranslation()
  const { daysLeft, spent, tone } = certificateState(certificate)
  const months = daysLeft !== null ? Math.round(daysLeft / 30) : 0

  return (
    <li className={['flex flex-wrap items-center gap-4 px-5 py-4', TONE_EDGE[tone]].join(' ')}>
      <span
        className={[
          'flex size-9 shrink-0 items-center justify-center rounded-md',
          TONE_TINT[tone],
        ].join(' ')}
      >
        <img src={TONE_ICON[tone]} alt="" className="size-[18px]" />
      </span>

      <div className="min-w-[220px] flex-1">
        <p className="text-sm font-semibold leading-[1.3] text-text-primary">
          {t(`peppolTax.cert.${certificate.id}`)}
        </p>
        <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
          {t(`peppolTax.cert.${certificate.id}Note`)} ·{' '}
          {certificate.renewsItself
            ? t('peppolTax.renewsItself')
            : t('peppolTax.issuedBy', { who: certificate.issuedBy })}
        </p>
      </div>

      <div className="w-[140px] shrink-0">
        <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-white">
          <span
            className={TONE_BAR[tone]}
            style={{ width: `${Math.round((1 - spent) * 100) || 100}%` }}
          />
        </span>
        <p className={['mt-1.5 text-xs font-semibold', TONE_TEXT[tone]].join(' ')}>
          {certificate.renewsItself
            ? t('peppolTax.renewsItself')
            : daysLeft !== null && daysLeft <= 60
              ? t('peppolTax.daysLeft', { count: daysLeft })
              : t('peppolTax.monthsLeft', { count: months })}
        </p>
      </div>

      <button
        type="button"
        className={[
          'inline-flex h-[38px] shrink-0 items-center rounded-sm px-4 text-sm font-semibold transition-colors',
          tone === 'urgent'
            ? 'bg-primary-700 text-white hover:bg-primary-800'
            : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
        ].join(' ')}
      >
        {tone === 'urgent' ? t('peppolTax.renewIt') : t('peppolTax.details')}
      </button>
    </li>
  )
}
