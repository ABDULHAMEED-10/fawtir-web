import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import {
  ROLES,
  PERMISSIONS,
  PERMISSION_GROUPS,
  roleHolders,
  type Grant,
  type RoleId,
} from '../../lib/settingsPeople'
import plusIcon from '../../assets/settings/plus-white.svg'
import printIcon from '../../assets/settings/print.svg'
import yesIcon from '../../assets/settings/check-green.svg'
import noIcon from '../../assets/settings/cross-muted.svg'
import limitIcon from '../../assets/settings/minus-amber.svg'
import ownerIcon from '../../assets/settings/tile-peppol.svg'
import managerIcon from '../../assets/settings/menu-people.svg'
import accountantIcon from '../../assets/settings/menu-invoice.svg'
import tillIcon from '../../assets/settings/menu-device.svg'
import wholesaleIcon from '../../assets/settings/menu-copy.svg'
import { RowsView } from '../../components/ui'

const ROLE_ICON: Record<RoleId, string> = {
  owner: ownerIcon,
  manager: managerIcon,
  accountant: accountantIcon,
  till: tillIcon,
  wholesale: wholesaleIcon,
}

const KIND_PILL = {
  fixed: 'bg-surface-background text-text-tertiary',
  builtIn: 'bg-surface-background text-text-tertiary',
  yours: 'bg-primary-50 text-primary-800',
}

/** What a cell cycles to when it is tapped. The owner column never moves. */
const nextGrant = (grant: Grant, hasLimit: boolean): Grant => {
  if (grant === 'no') return 'yes'
  if (grant === 'yes') return hasLimit ? { limitKey: 'roles.limit.ownBranch' } : 'no'
  return 'no'
}

/**
 * Settings › What each role can do (Figma 135:39357).
 *
 * Sixteen permissions across five roles. The design drew four role cards above a five-column
 * matrix; the missing card was Till staff, which one person actually holds, so all five are
 * shown. Every mark is live — tapping one moves that role's grant, and the header counts follow.
 */
export function RolesPage() {
  const { t } = useTranslation()

  /** Overrides layered over the shipped matrix, so "reset" is simply dropping them. */
  const [changes, setChanges] = useState<Record<string, Grant>>({})

  const grantFor = (permissionId: string, role: RoleId): Grant => {
    const key = `${permissionId}:${role}`
    if (key in changes) return changes[key]
    return PERMISSIONS.find((entry) => entry.id === permissionId)!.by[role]
  }

  const cycle = (permissionId: string, role: RoleId) => {
    const permission = PERMISSIONS.find((entry) => entry.id === permissionId)!
    if (role === 'owner' || permission.ownerOnly) return
    const hasLimit = permission.group === 'money' || permission.group === 'selling'
    setChanges((current) => ({
      ...current,
      [`${permissionId}:${role}`]: nextGrant(grantFor(permissionId, role), hasLimit),
    }))
  }

  const held = (role: RoleId) =>
    PERMISSIONS.filter((permission) => grantFor(permission.id, role) !== 'no').length

  return (
    <SettingsShell group="people">
      <SettingsHeader
        title={t('roles.title')}
        subtitle={t('roles.subtitle')}
        actions={
          <>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={printIcon} alt="" className="size-[18px]" />
              {t('roles.exportPdf')}
            </button>
            <Link
              to="/settings/roles/new"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4" />
              {t('roles.makeARole')}
            </Link>
          </>
        }
      />

      {/* Role cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {ROLES.map((role) => {
          const holders = roleHolders(role.id)
          const waiting = holders.filter((member) => member.invited).length
          return (
            <article key={role.id} className="flex flex-col rounded-md bg-surface-card p-4">
              <div className="flex items-center gap-2.5">
                <span
                  className={[
                    'flex size-8 shrink-0 items-center justify-center rounded-md',
                    role.kind === 'yours' ? 'bg-primary-50' : 'bg-surface-background',
                  ].join(' ')}
                >
                  <img src={ROLE_ICON[role.id]} alt="" className="size-4" />
                </span>
                <h3 className="text-sm font-semibold leading-[1.2] text-text-primary">
                  {t(`team.role.${role.id}`)}
                </h3>
              </div>
              <p className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1">
                  {holders.length === 0 ? (
                    <span className="text-xs font-medium text-text-quaternary">
                      {t('roles.nobodyYet')}
                    </span>
                  ) : (
                    <>
                      {holders.map((member) => (
                        <span
                          key={member.id}
                          className="flex size-6 items-center justify-center rounded-full bg-primary-50 text-[9px] font-semibold text-primary-800"
                        >
                          {member.initials}
                        </span>
                      ))}
                      <span className="ms-1 text-xs font-medium text-text-quaternary">
                        {waiting === holders.length
                          ? t('roles.invited', { count: waiting })
                          : t('roles.people', { count: holders.length })}
                      </span>
                    </>
                  )}
                </span>
                {role.kind === 'fixed' ? (
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('roles.cantBeChanged')}
                  </span>
                ) : (
                  <Link
                    to="/settings/roles/new"
                    className="text-xs font-semibold text-primary-700 transition-colors hover:text-primary-800"
                  >
                    {t('roles.changeIt')}
                  </Link>
                )}
              </p>
            </article>
          )
        })}
      </div>

      {/* Matrix */}
      <section className="overflow-hidden rounded-md bg-surface-card">
        <RowsView>
          <table className="w-full min-w-[940px] border-collapse">
            <thead>
              <tr>
                <th className="w-[340px] px-5 pb-3 pt-5 text-start align-bottom">
                  <span className="text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                    {t('roles.whatTheyCanDo')}
                  </span>
                </th>
                {ROLES.map((role) => {
                  const holders = roleHolders(role.id)
                  return (
                    <th
                      key={role.id}
                      className="w-[110px] border-s border-surface-background px-2 pb-3 pt-5 text-center align-bottom"
                    >
                      <span className="mx-auto flex size-8 items-center justify-center rounded-md bg-primary-50">
                        <img src={ROLE_ICON[role.id]} alt="" className="size-4" />
                      </span>
                      <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.4px] text-text-primary">
                        {t(`team.role.${role.id}`)}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-medium text-text-quaternary">
                        {holders.length === 0
                          ? t('roles.nobodyYet')
                          : holders.every((member) => member.invited)
                            ? t('roles.invited', { count: holders.length })
                            : t('roles.people', { count: holders.length })}
                      </span>
                      <span
                        className={[
                          'mt-1.5 inline-flex h-[18px] items-center rounded-[3px] px-1.5 text-[9px] font-semibold uppercase tracking-[0.4px]',
                          KIND_PILL[role.kind],
                        ].join(' ')}
                      >
                        {t(`roles.${role.kind}`)}
                      </span>
                      <span className="mt-2 block text-[10px] font-medium text-text-quaternary">
                        {held(role.id)}/{PERMISSIONS.length}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {PERMISSION_GROUPS.map((group) => (
                <Fragment key={group}>
                  <tr className="bg-primary-25">
                    <td
                      colSpan={ROLES.length + 1}
                      className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.6px] text-primary-800"
                    >
                      {t(`roles.group.${group}`)}
                    </td>
                  </tr>
                  {PERMISSIONS.filter((permission) => permission.group === group).map(
                    (permission) => (
                      <tr
                        key={permission.id}
                        className="border-b border-surface-background last:border-0"
                      >
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium leading-[1.3] text-text-primary">
                            {t(`roles.perm.${permission.id}`)}
                          </p>
                          <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                            {t(`roles.perm.${permission.id}Note`)}
                          </p>
                        </td>
                        {ROLES.map((role) => {
                          const grant = grantFor(permission.id, role.id)
                          const locked = role.id === 'owner' || permission.ownerOnly
                          return (
                            <td
                              key={role.id}
                              className="border-s border-surface-background px-2 py-3 text-center"
                            >
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => cycle(permission.id, role.id)}
                                aria-label={`${t(`roles.perm.${permission.id}`)} — ${t(
                                  `team.role.${role.id}`,
                                )}`}
                                className={[
                                  'mx-auto flex size-7 items-center justify-center rounded-md transition-colors',
                                  grant === 'yes'
                                    ? 'bg-success-100'
                                    : grant === 'no'
                                      ? 'bg-surface-background'
                                      : 'bg-pending-100',
                                  locked ? 'cursor-default' : 'hover:ring-2 hover:ring-primary-300',
                                ].join(' ')}
                              >
                                <img
                                  src={
                                    grant === 'yes' ? yesIcon : grant === 'no' ? noIcon : limitIcon
                                  }
                                  alt=""
                                  className="size-4"
                                />
                              </button>
                              {typeof grant === 'object' ? (
                                <span className="mt-1 block text-[10px] font-medium text-pending-700">
                                  {t(grant.limitKey)}
                                </span>
                              ) : null}
                            </td>
                          )
                        })}
                      </tr>
                    ),
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </RowsView>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
          <span className="flex flex-wrap items-center gap-4">
            <Legend icon={yesIcon} tint="bg-success-100" label={t('roles.legend.can')} />
            <Legend icon={limitIcon} tint="bg-pending-100" label={t('roles.legend.limited')} />
            <Legend icon={noIcon} tint="bg-surface-background" label={t('roles.legend.cant')} />
          </span>
          <span className="text-xs font-medium text-text-quaternary">{t('roles.tapToChange')}</span>
        </div>
      </section>
    </SettingsShell>
  )
}

function Legend({ icon, tint, label }: { icon: string; tint: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={['flex size-5 items-center justify-center rounded-[4px]', tint].join(' ')}>
        <img src={icon} alt="" className="size-3" />
      </span>
      <span className="text-xs font-medium text-text-tertiary">{label}</span>
    </span>
  )
}
