import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { useApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { SortMenu } from '../../components/ui'
import {
  PEOPLE_PATH,
  PENDING_INVITATIONS_PATH,
  USERS_PERMISSION,
  displayName,
  loadPendingInvitations,
  loadPeople,
  type CompanyUser,
  type InvitationDto,
  type UserPage,
} from '../../api/settings/people'
import { PeopleTable } from './people'
import { TH, TD, useBranchNames, useManagesPeople, useRoleNames } from './peopleView'
import { useBranchAccessOn } from '../../lib/identity/branchAccessSwitch'
import { useSession } from '../../lib/session/session'
import { SWITCHED_OFF_PEOPLE_PATH, loadSwitchedOffPeople } from '../../api/settings/removals'
import {
  SUBSCRIPTION_PATH,
  loadSubscription,
  type SubscriptionStatusDto,
} from '../../api/settings/subscription'
import {
  PAID_EXTRAS_PATH,
  freePaidUserPlaces,
  loadPaidExtras,
  type PaidExtrasOverviewDto,
} from '../../api/settings/paidExtras'
import { PersonActions, SwitchedOffTable } from './teamRemoval'
import { InvitationActions } from './teamInvitations'
import { formatInstantDay } from '../../lib/format'
import plusIcon from '../../assets/settings/plus-white.svg'
import searchIcon from '../../assets/invoices/search.svg'

/**
 * The design's tabs (Figma 135:38461). "Not signed in lately" needs a sign-in time the API does
 * not have, so it is drawn and cannot be opened (TODO(backend): SETTINGS.md row 6.1). "Switched
 * off" (id `removed`) is the people switched off (`status=DEACTIVATED`), the Administrator's list
 * only (US-3, LG-2).
 */
type TeamTab = 'all' | 'waiting' | 'quiet' | 'withoutTwoStep' | 'removed'
const TABS: { id: TeamTab; available: boolean }[] = [
  { id: 'all', available: true },
  { id: 'waiting', available: true },
  { id: 'quiet', available: false },
  { id: 'withoutTwoStep', available: true },
  { id: 'removed', available: true },
]

/** "Signed in most recently" needs a sign-in time too, so only these two sorts are offered. */
const SORTS = [
  { value: 'name', labelKey: 'team.sortBy.name' },
  { value: 'role', labelKey: 'team.sortBy.role' },
]

/**
 * Settings › Team members (Figma 135:38461): the company's own people from `GET /v1/users`, and
 * the invitations still waiting from `GET /v1/users/invitations`.
 *
 * PR #166 replaced a sample coffee company's staff with the server's list and dropped the parts
 * the server does not record. The design keeps them: the four figures and the tabs are computed
 * from the same lists the table draws, so "without two-step" always lands on exactly the number
 * the card claims; what no list can answer (sign-in history, the cost of extra people, removed
 * people) reads "Not available yet", each with its SETTINGS.md row.
 */
export function TeamPage() {
  return (
    <SettingsShell group="people">
      <Team />
    </SettingsShell>
  )
}

/** Inside the shell, which is what provides the session the permission is read from. */
function Team() {
  const { t } = useTranslation()
  // The Administrator, or, once branch access is on, a branch administrator for the people of
  // their branches (LG-3). The server says "branch administrator" only while it is on.
  const mayManage = useManagesPeople()
  // Nobody new is added while the subscription is read-only (ST-2); the lists stay.
  const mayInvite = useSubscriptionAllows('ADD_PEOPLE')

  return (
    <>
      <SettingsHeader
        title={t('team.title')}
        subtitle={t('people.team.subtitle')}
        actions={
          mayManage && mayInvite ? (
            <Link
              to="/settings/team/invite"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4" />
              {t('team.inviteSomeone')}
            </Link>
          ) : undefined
        }
      />
      {mayManage ? <TeamLists /> : <PermissionDeniedNotice />}
    </>
  )
}

function TeamLists() {
  const { t } = useTranslation()
  const people = useApiRead<UserPage>(PEOPLE_PATH, loadPeople)
  // The invitation list stays the Administrator's; a branch administrator is not asked for it.
  const isAdministrator = useCan(USERS_PERMISSION)
  const invitations = useApiRead<InvitationDto[]>(
    isAdministrator ? PENDING_INVITATIONS_PATH : null,
    loadPendingInvitations,
  )
  const roleNames = useRoleNames()
  // The Branches column waits for branch access (BA-1): while it is off no branch is read. The
  // Owner mark (OW-1) and each person's page (role, permissions RL-3, handover OW-4) do not.
  const branchAccessOn = useBranchAccessOn()
  const { name: branchName } = useBranchNames(branchAccessOn)
  // `?tab=waiting` opens the invitations (the invite form links here when an address already has one).
  const [params] = useSearchParams()
  const [tab, setTab] = useState<TeamTab>(
    isAdministrator && params.get('tab') === 'waiting' ? 'waiting' : 'all',
  )
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const session = useSession()
  // Switching someone off, or back on, is the Administrator's (DELETE /users/{id} needs
  // admin.users.manage); a branch administrator's list carries no actions.
  // When the paid place of someone switched off ends (the next renewal); undated if unreadable.
  const subscription = useApiRead<SubscriptionStatusDto>(
    isAdministrator ? SUBSCRIPTION_PATH : null,
    loadSubscription,
  )
  // Read when the tab is opened: most visits never look at who is switched off.
  const switchedOff = useApiRead<UserPage>(
    isAdministrator && tab === 'removed' ? SWITCHED_OFF_PEOPLE_PATH : null,
    loadSwitchedOffPeople,
  )
  // Paid user places not in use (option (a), 21 Oct 2026): a switched-off person's place stays paid
  // until the renewal and can go to someone new at no extra charge. Counted from the server's own
  // figures on `GET /v1/settings/plan/extras` (`tenant.plan.read`).
  const mayReadPlan = useCan('tenant.plan.read')
  const extras = useApiRead<PaidExtrasOverviewDto>(
    mayReadPlan ? PAID_EXTRAS_PATH : null,
    loadPaidExtras,
  )
  const freePaidPlaces =
    extras.read.status === 'ready' ? freePaidUserPlaces(extras.read.data.users) : null
  const [done, setDone] = useState<string | null>(null)
  const renewsOn =
    subscription.read.status === 'ready' ? (subscription.read.data.renewsOn ?? null) : null
  const afterChange = (message: string) => {
    setDone(message)
    people.retry()
    switchedOff.retry()
    // A person switched off loses the invitations they sent (IdentityUserDeactivated).
    invitations.retry()
    extras.retry()
  }
  // A resent or revoked invitation, or a refusal of either: the list is read again either way,
  // since a refusal means it changed (accepted, revoked or expired) while it was on screen.
  const afterInvitationChange = (message: string) => {
    setDone(message)
    invitations.retry()
    extras.retry()
  }
  const actions = isAdministrator
    ? (person: CompanyUser) =>
        person.owner || person.id === session?.userId ? null : (
          <PersonActions person={person} renewsOn={renewsOn} onDone={afterChange} />
        )
    : undefined

  const everyone = useMemo(
    () => (people.read.status === 'ready' ? people.read.data.content : []),
    [people.read],
  )
  const waiting = invitations.read.status === 'ready' ? invitations.read.data : null
  const withoutTwoStep = everyone.filter((person) => !person.mfaEnabled)

  const count = (id: TeamTab): number | null =>
    id === 'all'
      ? everyone.length
      : id === 'withoutTwoStep'
        ? withoutTwoStep.length
        : id === 'waiting'
          ? (waiting?.length ?? null)
          : id === 'removed' && switchedOff.read.status === 'ready'
            ? switchedOff.read.data.content.length
            : null

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const base = tab === 'withoutTwoStep' ? everyone.filter((p) => !p.mfaEnabled) : everyone
    const found = needle
      ? base.filter((person) =>
          `${displayName(person)} ${person.email}`.toLowerCase().includes(needle),
        )
      : base
    const key = (person: CompanyUser) =>
      sort === 'role' ? person.roles.map(roleNames).join(', ') : displayName(person)
    return [...found].sort((a, b) => key(a).localeCompare(key(b)))
  }, [everyone, tab, query, sort, roleNames])

  return (
    <>
      <Kpis
        people={people.read.status === 'ready' ? people.read.data : null}
        waiting={waiting}
        withoutTwoStep={withoutTwoStep.length}
        freePaidPlaces={freePaidPlaces}
      />

      <section aria-labelledby="team-people" className="overflow-hidden rounded-md bg-surface-card">
        <h3 id="team-people" className="sr-only">
          {t('people.team.peopleTitle')}
        </h3>
        <nav
          aria-label={t('people.team.peopleTitle')}
          className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5 pt-4"
        >
          {TABS.map((tabEntry) => {
            // Waiting invitations and switched-off people are the Administrator's lists only.
            const entry =
              (tabEntry.id === 'waiting' || tabEntry.id === 'removed') && !isAdministrator
                ? { ...tabEntry, available: false }
                : tabEntry
            const active = entry.id === tab
            const figure = count(entry.id)
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                disabled={!entry.available}
                aria-pressed={active}
                title={entry.available ? undefined : t('team.notAvailableYet')}
                className={[
                  'inline-flex h-[42px] items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  active
                    ? 'border-primary-700 text-primary-800'
                    : 'border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(`team.tab.${entry.id}`)}
                {entry.available ? (
                  figure !== null ? (
                    <span
                      className={[
                        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                        active
                          ? 'bg-primary-700 text-white'
                          : 'bg-surface-background text-text-tertiary',
                      ].join(' ')}
                    >
                      {figure}
                    </span>
                  ) : null
                ) : (
                  <span className="sr-only">{t('team.notAvailableYet')}</span>
                )}
              </button>
            )
          })}
        </nav>

        {done ? (
          <div className="px-5 pt-4">
            <Notice
              body={done}
              action={{ label: t('common.close'), onClick: () => setDone(null) }}
            />
          </div>
        ) : null}

        {tab === 'removed' ? (
          <div className="flex flex-col gap-3 p-5">
            {switchedOff.read.status === 'loading' ? (
              <LoadingNotice />
            ) : switchedOff.read.status === 'failed' ? (
              <ApiReadFailure error={switchedOff.read.error} retry={switchedOff.retry} />
            ) : switchedOff.read.data.content.length === 0 ? (
              <p className="text-sm font-medium text-text-tertiary">{t('removal.user.noneOff')}</p>
            ) : (
              <SwitchedOffTable people={switchedOff.read.data.content} onDone={afterChange} />
            )}
          </div>
        ) : tab === 'waiting' ? (
          <div className="flex flex-col gap-3 p-5">
            <h4 className="text-base font-semibold text-text-primary">
              {t('people.team.invitedTitle')}
            </h4>
            {invitations.read.status === 'loading' ? (
              <LoadingNotice />
            ) : invitations.read.status === 'failed' ? (
              <ApiReadFailure error={invitations.read.error} retry={invitations.retry} />
            ) : invitations.read.data.length === 0 ? (
              <p className="text-sm font-medium text-text-tertiary">
                {t('people.team.noInvitations')}
              </p>
            ) : (
              <InvitationsTable
                invitations={invitations.read.data}
                roleNames={roleNames}
                onDone={afterInvitationChange}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex h-[46px] min-w-0 flex-1 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 md:min-w-[260px]">
                <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('team.search')}
                  aria-label={t('team.search')}
                  className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
                />
              </label>
              <SortMenu label={t('team.sort')} value={sort} onChange={setSort} options={SORTS} />
            </div>
            {people.read.status === 'loading' ? (
              <LoadingNotice />
            ) : people.read.status === 'failed' ? (
              <ApiReadFailure error={people.read.error} retry={people.retry} />
            ) : people.read.data.content.length === 0 ? (
              <Notice body={t('people.team.empty')} />
            ) : rows.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm font-medium text-text-quaternary">
                {t('team.empty')}
              </p>
            ) : (
              <>
                <PeopleTable
                  people={rows}
                  roleNames={roleNames}
                  lastSignedIn
                  branchName={branchAccessOn ? branchName : undefined}
                  personLink={(person) => `/settings/team/${encodeURIComponent(person.id)}`}
                  markOwner
                  actions={actions}
                />
                {people.read.data.totalElements > people.read.data.content.length ? (
                  <p className="text-sm font-medium text-text-tertiary">
                    {t('people.team.more', {
                      shown: people.read.data.content.length,
                      total: people.read.data.totalElements,
                    })}
                  </p>
                ) : null}
              </>
            )}
          </div>
        )}
      </section>
    </>
  )
}

/** The design's four figures. Each is counted from the lists above, or says why it cannot be. */
function Kpis({
  people,
  waiting,
  withoutTwoStep,
  freePaidPlaces,
}: {
  people: UserPage | null
  waiting: InvitationDto[] | null
  withoutTwoStep: number
  freePaidPlaces: number | null
}) {
  const { t } = useTranslation()
  const complete = people !== null && people.totalElements === people.content.length
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label={t('team.kpi.withLogin')}
        value={people ? String(people.totalElements) : null}
        unit={t('team.kpi.withLoginUnit')}
        note={waiting ? t('team.kpi.withLoginNote', { count: waiting.length }) : undefined}
        extraNote={
          freePaidPlaces !== null
            ? t('team.kpi.freePaidPlaces', { count: freePaidPlaces })
            : undefined
        }
      />
      {/* TODO(backend): SETTINGS.md row 6.1. No sign-in time on the user record. */}
      <Kpi label={t('team.kpi.signedIn')} unavailable />
      <Kpi
        label={t('team.kpi.twoStep')}
        value={complete ? String(withoutTwoStep) : null}
        unit={t('team.kpi.twoStepUnit')}
        note={t('team.kpi.twoStepNoteReal')}
        tone="pending"
      />
      {/* TODO(backend): SETTINGS.md row 6.2. What people beyond the plan cost is the server's. */}
      <Kpi label={t('team.kpi.cost')} unavailable />
    </div>
  )
}

function Kpi({
  label,
  value = null,
  unit,
  note,
  extraNote,
  tone,
  unavailable,
}: {
  label: string
  value?: string | null
  unit?: string
  note?: string
  extraNote?: string
  tone?: 'pending'
  unavailable?: boolean
}) {
  const { t } = useTranslation()
  return (
    <article className="rounded-md bg-surface-card p-5">
      <h3 className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
        {label}
      </h3>
      {unavailable ? (
        <p className="mt-2 text-sm font-medium leading-[1.6] text-text-quaternary">
          {t('team.notAvailableYet')}
        </p>
      ) : (
        <p className="mt-2 flex items-baseline gap-2">
          <span
            className={[
              'text-[28px] font-semibold leading-[1.2] tabular-nums',
              tone === 'pending' ? 'text-pending-700' : 'text-text-primary',
            ].join(' ')}
          >
            {value ?? '—'}
          </span>
          {unit ? <span className="text-sm font-medium text-text-quaternary">{unit}</span> : null}
        </p>
      )}
      {note ? (
        <p className="mt-2 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
      ) : null}
      {extraNote ? (
        <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">{extraNote}</p>
      ) : null}
    </article>
  )
}

function InvitationsTable({
  invitations,
  roleNames,
  onDone,
}: {
  invitations: InvitationDto[]
  roleNames: (code: string) => string
  onDone: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead className="border-b border-border-subtle">
          <tr>
            <th className={TH}>{t('people.col.email')}</th>
            <th className={TH}>{t('team.col.role')}</th>
            <th className={TH}>{t('people.col.expires')}</th>
            <th className={TH}>
              <span className="sr-only">{t('removal.actionsColumn')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((invitation) => (
            <tr key={invitation.id} className="border-b border-surface-background last:border-0">
              <td className={TD}>{invitation.email}</td>
              <td className={TD}>
                {invitation.roleCodes.length
                  ? invitation.roleCodes.map(roleNames).join(', ')
                  : t('people.defaultRole')}
              </td>
              <td className={TD}>{formatInstantDay(invitation.expiresAt, i18n.language)}</td>
              <td className={`${TD} text-end`}>
                <InvitationActions invitation={invitation} onDone={onDone} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
