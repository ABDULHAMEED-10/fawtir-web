import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { ParticipantStandingSection } from './ParticipantStandingSection'
import { useApiRead, type ApiRead } from '../../hooks/useApiRead'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import {
  PARTICIPANT_STANDING_PATH,
  type ParticipantIdStanding,
} from '../../api/peppol/participantStanding'
import {
  SMP_PARTICIPANTS_PATH,
  smpConfirmedActive,
  type SmpParticipantPage,
} from '../../api/peppol/smpParticipants'
import {
  COMPANY_PROFILE_PATH,
  loadCompanyProfile,
  type CompanyProfileDto,
} from '../../api/company/companyProfile'
import {
  BRANCHES_OVERVIEW_PATH,
  branchDisplayName,
  type BranchOverviewDto,
} from '../../api/settings/branches'
import { formatInstantDay } from '../../lib/format'
import { Switch } from '../../components/ui'
import shieldIcon from '../../assets/settings/tile-peppol.svg'
import copyIcon from '../../assets/settings/copy.svg'

/**
 * Settings › Peppol and tax (Figma 135:36580).
 *
 * Everything here is read from the server, and each fact is stated only as far as the server
 * vouches for it. The frame's "live on the network" hero, certificate list, renewal stepper and
 * visibility switches were drawn from fixtures (another company's name and ID) and are gone:
 * Fawtir's own verification, the Oman SMP's confirmation and SML discoverability are three
 * different facts, and none of them is "live".
 */
export function PeppolTaxPage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="company">
      <SettingsHeader title={t('peppolTax.title')} subtitle={t('peppolTax.subtitle')} />
      <PeppolTaxBody />
    </SettingsShell>
  )
}

const CERTIFICATE_IDS = ['signing', 'transport', 'reporting'] as const

/** How the business appears to others on the network, at the frame's usual settings. */
const VISIBILITY = [
  { id: 'directory', on: true },
  { id: 'acceptBills', on: true },
  { id: 'acceptSelfBilling', on: false },
  { id: 'emailCopy', on: false },
] as const

/**
 * Its own component so the standing read starts in the same commit as ParticipantStandingSection's:
 * the shell holds its children back until entitlements arrive, and a read started above it would
 * settle before the section mounted, costing a second GET instead of sharing one.
 */
function PeppolTaxBody() {
  const { t } = useTranslation()
  const standing = useApiRead<ParticipantIdStanding>(PARTICIPANT_STANDING_PATH)

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <ParticipantHero read={standing.read} retry={standing.retry} />

        <ParticipantStandingSection />

        <section className="rounded-md bg-surface-card p-5">
          <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
            {t('peppolTax.certificates')}
          </h3>
          <p className="mt-1 text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('peppolTax.certificatesManaged')}
          </p>
          {/* TODO(backend): docs/backend-guides/SETTINGS.md row 4.3. Nothing reports each
              certificate's issuer and expiry, so the designed rows name them and say so. */}
          <ul className="mt-3 flex flex-col">
            {CERTIFICATE_IDS.map((id) => (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-surface-background py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {t(`peppolTax.cert.${id}`)}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                    {t(`peppolTax.cert.${id}Note`)}
                  </p>
                </div>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('peppolTax.notAvailableYet')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* TODO(backend): docs/backend-guides/SETTINGS.md row 4.4. None of these choices is held
            on the server, so the designed switches are drawn at their usual setting but cannot be
            changed until they can be saved. */}
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
            <span className="inline-flex h-[24px] items-center rounded-[3px] bg-surface-background px-2 text-[11px] font-semibold text-text-quaternary">
              {t('peppolTax.notAvailableYet')}
            </span>
          </div>
          <ul className="flex flex-col">
            {VISIBILITY.map((row) => (
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
                  checked={row.on}
                  onChange={() => {}}
                  disabled
                  label={t(`peppolTax.visibility.${row.id}`)}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="flex w-full flex-col gap-4 xl:w-[320px] xl:shrink-0">
        <RegistrationCard standing={standing.read} />
        <BranchesCard />

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
          </div>
        </section>
      </aside>
    </div>
  )
}

/**
 * Names the Participant ID only when Fawtir verified it under the policy in force. Every other
 * state, and a failed read, shows no ID: a candidate or an outdated verification printed here
 * would read as the company's identity on the network.
 */
function ParticipantHero({
  read,
  retry,
}: {
  read: ApiRead<ParticipantIdStanding>
  retry: () => void
}) {
  const { t, i18n } = useTranslation()
  const [copied, setCopied] = useState(false)

  if (read.status === 'loading') return <LoadingNotice />
  if (read.status === 'failed') return <ApiReadFailure error={read.error} retry={retry} />

  const { state, verification } = read.data
  const verified = state === 'VERIFIED' && verification !== null ? verification : null
  const participantId = verified
    ? `${verified.participantScheme}:${verified.participantValue}`
    : null

  return (
    <section className="rounded-md bg-surface-card px-5 py-8 text-center">
      <span
        className={[
          'mx-auto flex size-[62px] items-center justify-center rounded-full',
          verified ? 'bg-success-100' : 'bg-surface-background',
        ].join(' ')}
      >
        <img src={shieldIcon} alt="" className="size-7" />
      </span>
      <h3 className="mt-4 text-2xl font-medium leading-[1.2] text-text-primary">
        {t(`peppolTax.hero.${state}`)}
      </h3>
      <p className="mx-auto mt-2 max-w-[540px] text-sm font-medium leading-[1.6] text-text-tertiary">
        {verified
          ? t('peppolTax.hero.verifiedOn', {
              date: formatInstantDay(verified.verifiedAt, i18n.language),
            })
          : t('peppolTax.hero.seeBelow')}
      </p>

      {participantId ? (
        <>
          <div className="mx-auto mt-5 flex max-w-[510px] items-center justify-between gap-3 rounded-sm bg-surface-background px-4 py-3">
            <span dir="ltr" className="flex flex-wrap items-baseline gap-2 text-left">
              <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                {t('peppolTax.yourPeppolId')}
              </span>
              <span className="font-mono text-base font-semibold text-text-primary">
                {participantId}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(participantId)
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
        </>
      ) : null}
    </section>
  )
}

function RegistrationCard({ standing }: { standing: ApiRead<ParticipantIdStanding> }) {
  const { t } = useTranslation()
  const smp = useApiRead<SmpParticipantPage>(SMP_PARTICIPANTS_PATH).read
  const profile = useApiRead<CompanyProfileDto>(COMPANY_PROFILE_PATH, loadCompanyProfile).read

  const verification =
    standing.status === 'loading'
      ? t('peppolTax.fact.checking')
      : standing.status === 'failed'
        ? t('peppolTax.fact.notAvailable')
        : standing.data.state === 'VERIFIED'
          ? t('peppolTax.fact.verified')
          : t('peppolTax.fact.notVerified')

  // A 403 (no smp.participant.view) and a failure both say "Not available": neither tells the
  // reader anything about the SMP, and "Not confirmed" would.
  const publication =
    smp.status === 'loading'
      ? t('peppolTax.fact.checking')
      : smp.status === 'failed'
        ? t('peppolTax.fact.notAvailable')
        : smpConfirmedActive(smp.data)
          ? t('peppolTax.fact.published')
          : t('peppolTax.fact.notConfirmed')

  const taxNumber = profile.status === 'ready' ? (profile.data.taxNumber ?? '').trim() : ''

  return (
    <section className="rounded-md bg-surface-card p-5">
      <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
        {t('peppolTax.registration')}
      </h3>
      <dl className="mt-2">
        <Fact label={t('peppolTax.row.verification')}>{verification}</Fact>
        <Fact label={t('peppolTax.row.smpPublication')}>{publication}</Fact>
        {/* TODO(backend): SETTINGS.md 4.1. Nothing in Fawtir queries the SML, so this never
            claims the company can be found there. */}
        <Fact label={t('peppolTax.row.smlDiscovery')} last={!taxNumber}>
          {t('peppolTax.fact.notChecked')}
        </Fact>
        {taxNumber ? (
          <Fact label={t('peppolTax.row.vatNumber')} mono last>
            {taxNumber}
          </Fact>
        ) : null}
      </dl>
    </section>
  )
}

function Fact({
  label,
  mono = false,
  last = false,
  children,
}: {
  label: string
  mono?: boolean
  last?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd
        dir={mono ? 'ltr' : undefined}
        className={[
          'shrink-0 text-end text-sm font-semibold text-text-primary',
          mono ? 'font-mono text-[11px]' : '',
        ].join(' ')}
      >
        {children}
      </dd>
    </div>
  )
}

function BranchesCard() {
  const { t, i18n } = useTranslation()
  // Same key as the account switcher, so the shell and this card share one GET.
  const overview = useApiRead<BranchOverviewDto>(BRANCHES_OVERVIEW_PATH).read
  const open =
    overview.status === 'ready'
      ? overview.data.branches.filter((branch) => branch.active && !branch.closedOn)
      : []

  return (
    <section className="rounded-md bg-surface-card p-5">
      <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
        {t('peppolTax.branchesOnPeppol')}
      </h3>
      {overview.status === 'loading' ? (
        <p className="mt-2 text-sm font-medium text-text-quaternary">
          {t('peppolTax.fact.checking')}
        </p>
      ) : overview.status === 'failed' ? (
        <p className="mt-2 text-sm font-medium text-text-quaternary">
          {t('peppolTax.fact.notAvailable')}
        </p>
      ) : open.length === 0 ? (
        <p className="mt-2 text-sm font-medium text-text-quaternary">
          {t('peppolTax.noOpenBranches')}
        </p>
      ) : (
        <ul className="mt-2">
          {open.map((branch, index) => (
            <li
              key={branch.id}
              className={[
                'flex items-center justify-between gap-3 py-2.5',
                index < open.length - 1 ? 'border-b border-surface-background' : '',
              ].join(' ')}
            >
              <span className="text-sm font-medium text-text-tertiary">
                {branchDisplayName(branch, i18n.language)}
                {branch.headOffice ? ` · ${t('peppolTax.headOffice')}` : ''}
              </span>
              <span className="shrink-0 text-sm font-semibold text-text-primary">
                {t('peppolTax.sharesTheMainId')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
