import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { ActionMenu, FilterMenu, RowsView, SortMenu, withRial } from '../../components/ui'
import {
  MEMBERS,
  TEAM_TABS,
  TEAM_SORTS,
  countTeamTab,
  matchesTeamTab,
  matchesMemberQuery,
  withLogin,
  invited,
  withoutTwoStep,
  signedInThisWeek,
  quiet,
  SEATS,
  EXTRA_PEOPLE_COST,
  REMOVED_COUNT,
  type Member,
  type TeamTab,
} from '../../lib/settingsPeople'
import plusIcon from '../../assets/settings/plus-white.svg'
import searchIcon from '../../assets/invoices/search.svg'
import twoStepOnIcon from '../../assets/settings/check-green.svg'
import twoStepOffIcon from '../../assets/settings/cert-urgent.svg'
import twoStepNeverIcon from '../../assets/settings/minus-amber.svg'
import editIcon from '../../assets/settings/menu-edit.svg'
import listIcon from '../../assets/settings/menu-list.svg'
import deviceIcon from '../../assets/settings/menu-device.svg'
import sparkleIcon from '../../assets/settings/menu-sparkle.svg'
import keyIcon from '../../assets/settings/menu-key.svg'
import signOutIcon from '../../assets/settings/menu-signout.svg'
import removeIcon from '../../assets/settings/menu-remove.svg'

const TWO_STEP = {
  on: { icon: twoStepOnIcon, tint: 'bg-success-100', labelKey: 'team.twoStepOn' },
  off: { icon: twoStepOffIcon, tint: 'bg-danger-100', labelKey: 'team.twoStepOff' },
  never: { icon: twoStepNeverIcon, tint: 'bg-surface-background', labelKey: 'team.twoStepNever' },
}

/**
 * Settings › Team members (Figma 135:38461).
 *
 * The four figures and every tab count are read off the same list the table draws, so filtering
 * to "without two-step" always lands on exactly the number the card claims.
 */
export function TeamPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TeamTab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')

  const rows = useMemo(() => {
    const filtered = MEMBERS.filter(
      (member) => matchesTeamTab(member, tab) && matchesMemberQuery(member, query),
    )
    return [...filtered].sort((a, b) => {
      if (sort === 'recent') return (a.quietDays ?? 9_999) - (b.quietDays ?? 9_999)
      if (sort === 'role') return a.role.localeCompare(b.role)
      return a.name.localeCompare(b.name)
    })
  }, [tab, query, sort])

  const quietest = quiet[0]

  return (
    <SettingsShell group="people">
      <SettingsHeader
        title={t('team.title')}
        subtitle={t('team.subtitle')}
        actions={
          <Link
            to="/settings/team/invite"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-4" />
            {t('team.inviteSomeone')}
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={t('team.kpi.withLogin')}
          value={String(withLogin.length)}
          unit={t('team.kpi.withLoginUnit')}
          note={t('team.kpi.withLoginNote', { count: invited.length })}
        />
        <Kpi
          label={t('team.kpi.signedIn')}
          value={String(signedInThisWeek.length)}
          unit={t('team.kpi.signedInOf', { count: withLogin.length })}
          note={
            quietest
              ? t('team.kpi.signedInNote', {
                  name: quietest.name.split(' ')[0],
                  date: quietest.lastSignedIn?.agoValues?.date ?? '',
                })
              : t('team.kpi.signedInAll')
          }
        />
        <Kpi
          label={t('team.kpi.twoStep')}
          value={String(withoutTwoStep.length)}
          unit={t('team.kpi.twoStepUnit')}
          note={t('team.kpi.twoStepNote')}
          tone="pending"
        />
        <Kpi
          label={t('team.kpi.cost')}
          value={`OMR ${EXTRA_PEOPLE_COST.toFixed(3)}`}
          note={
            MEMBERS.length > SEATS.included
              ? t('team.kpi.costNoteOver', { count: MEMBERS.length - SEATS.included })
              : t('team.kpi.costNote')
          }
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <nav className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5 pt-4">
          {TEAM_TABS.map((entry) => {
            const active = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                aria-pressed={active}
                className={[
                  'inline-flex h-[42px] items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary-700 text-primary-800'
                    : 'border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(entry.labelKey)}
                <span
                  className={[
                    'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                    active
                      ? 'bg-primary-700 text-white'
                      : 'bg-surface-background text-text-tertiary',
                  ].join(' ')}
                >
                  {countTeamTab(entry.id)}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] min-w-[260px] flex-1 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('team.search')}
              aria-label={t('team.search')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <FilterMenu
              label={t('team.filters')}
              value={tab}
              defaultValue="all"
              options={TEAM_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: countTeamTab(entry.id),
              }))}
              onChange={(value) => setTab(value)}
            />
            <SortMenu
              label={t('team.sort')}
              value={sort}
              onChange={setSort}
              options={TEAM_SORTS.map((entry) => ({
                value: entry.id,
                labelKey: entry.labelKey,
              }))}
            />
          </div>
        </div>

        <RowsView>
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                {(['person', 'role', 'branches', 'lastSignedIn', 'twoStep'] as const).map((key) => (
                  <th key={key} className="h-[46px] px-4 text-start font-semibold">
                    {t(`team.col.${key}`)}
                  </th>
                ))}
                <th className="h-[46px] px-4" />
              </tr>
            </thead>
            <tbody>
              {tab === 'removed' ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm font-medium text-text-quaternary"
                  >
                    {t('team.removedEmpty')}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm font-medium text-text-quaternary"
                  >
                    {t('team.empty')}
                  </td>
                </tr>
              ) : (
                rows.map((member) => <MemberRow key={member.id} member={member} />)
              )}
            </tbody>
          </table>
        </RowsView>
      </section>
      <span className="sr-only">{REMOVED_COUNT}</span>
    </SettingsShell>
  )
}

function Kpi({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string
  value: string
  unit?: string
  note: string
  tone?: 'pending'
}) {
  return (
    <article className="rounded-md bg-surface-card p-5">
      <h3 className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
        {label}
      </h3>
      <p className="mt-2 flex items-baseline gap-2">
        <span
          className={[
            'text-[28px] font-semibold leading-[1.2] tabular-nums',
            tone === 'pending' ? 'text-pending-700' : 'text-text-primary',
          ].join(' ')}
        >
          {withRial(value)}
        </span>
        {unit ? <span className="text-sm font-medium text-text-quaternary">{unit}</span> : null}
      </p>
      <p className="mt-2 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

function MemberRow({ member }: { member: Member }) {
  const { t } = useTranslation()
  const twoStep = TWO_STEP[member.twoStep]

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-4 py-4 align-top">
        <div className="flex items-start gap-3">
          <span
            className={[
              'flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
              member.you ? 'bg-primary-700 text-white' : 'bg-primary-50 text-primary-800',
            ].join(' ')}
          >
            {member.initials}
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">{member.name}</span>
              {member.you ? (
                <span className="inline-flex h-[20px] items-center rounded-[3px] bg-primary-700 px-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-white">
                  {t('team.you')}
                </span>
              ) : null}
              {member.invited ? (
                <span className="inline-flex h-[20px] items-center rounded-[3px] bg-pending-100 px-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-pending-700">
                  {t('team.invitedAgo', { count: member.invited.daysAgo })}
                </span>
              ) : (member.quietDays ?? 0) > 14 ? (
                <span className="inline-flex h-[20px] items-center rounded-[3px] bg-pending-100 px-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-pending-700">
                  {t('team.quietFor', { count: Math.round((member.quietDays ?? 0) / 7) })}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {member.email}
              {member.invited ? ` · ${t('team.notAcceptedYet')}` : ''}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold text-text-primary">{t(`team.role.${member.role}`)}</p>
        <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
          {t(`team.role.${member.role}Note`)}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <span className="flex flex-wrap gap-1.5">
          {member.branches.length === 0 ? (
            <span className="inline-flex h-[24px] items-center rounded-[3px] bg-primary-50 px-2 text-xs font-medium text-primary-800">
              {t('team.allBranches')}
            </span>
          ) : (
            member.branches.map((branch) => (
              <span
                key={branch}
                className="inline-flex h-[24px] items-center rounded-[3px] bg-surface-background px-2 text-xs font-medium text-text-tertiary"
              >
                {branch}
              </span>
            ))
          )}
        </span>
      </td>

      <td className="px-4 py-4 align-top">
        <p
          className={[
            'text-sm font-medium',
            member.invited
              ? 'text-text-quaternary'
              : (member.quietDays ?? 0) > 14
                ? 'text-pending-700'
                : 'text-text-primary',
          ].join(' ')}
        >
          {member.lastSignedIn
            ? t(member.lastSignedIn.agoKey, member.lastSignedIn.agoValues)
            : t('team.never')}
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {member.lastSignedIn
            ? t(member.lastSignedIn.whereKey, member.lastSignedIn.whereValues)
            : t('team.inviteExpires', { count: member.invited?.expiresInDays ?? 0 })}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          title={t(twoStep.labelKey)}
          className={['flex size-7 items-center justify-center rounded-full', twoStep.tint].join(
            ' ',
          )}
        >
          <img src={twoStep.icon} alt={t(twoStep.labelKey)} className="size-4" />
        </span>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <ActionMenu
          size="md"
          label={t('team.menu.changeRole')}
          items={[
            {
              id: 'changeRole',
              labelKey: 'team.menu.changeRole',
              icon: editIcon,
            },
            {
              id: 'done',
              labelKey: 'team.menu.whatTheyveDone',
              icon: listIcon,
              hint: '412',
              to: '/settings/activity-log',
            },
            {
              id: 'devices',
              labelKey: 'team.menu.whereSignedIn',
              icon: deviceIcon,
              hintKey: 'team.menu.oneDevice',
            },
            {
              id: 'twoStep',
              sectionKey: 'team.menu.signingIn',
              labelKey: 'team.menu.askTwoStep',
              icon: sparkleIcon,
            },
            { id: 'reset', labelKey: 'team.menu.sendPasswordReset', icon: keyIcon },
            { id: 'signOut', labelKey: 'team.menu.signOutEverywhere', icon: signOutIcon },
            { id: 'freeDevice', labelKey: 'team.menu.freeMobileDevice', icon: deviceIcon },
            {
              id: 'remove',
              labelKey: 'team.menu.remove',
              icon: removeIcon,
              hintKey: 'team.menu.freesAPlace',
              danger: true,
            },
          ]}
        />
      </td>
    </tr>
  )
}
