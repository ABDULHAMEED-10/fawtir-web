import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { useApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { Button, Modal, RowsView } from '../../components/ui'
import {
  PEOPLE_PATH,
  ROLES_PATH,
  ROLES_PERMISSION,
  USERS_PERMISSION,
  isJobRole,
  loadPeople,
  loadRoles,
  type RoleDto,
  type UserPage,
} from '../../api/settings/people'
import { ROLES_MANAGE_PERMISSION, deleteRole } from '../../api/settings/roles'
import { roleDeleteRefusal } from '../../lib/roleRefusals'
import { permissionWords, type PermissionWords } from '../../lib/permissionLabels'
import plusIcon from '../../assets/settings/plus-white.svg'
import printIcon from '../../assets/settings/print.svg'
import yesIcon from '../../assets/settings/check-green.svg'
import noIcon from '../../assets/settings/cross-muted.svg'
import limitIcon from '../../assets/settings/minus-amber.svg'

/** Making or changing a role is `admin.roles.manage` on the server (`RoleController`). */
const ROLES_MANAGE = ROLES_MANAGE_PERMISSION

/**
 * Settings › What each role can do (Figma 135:39357): the company's roles from `GET /v1/roles`,
 * how many people hold each counted from `GET /v1/users` when the reader may list people.
 *
 * PR #166 replaced a sample company's five roles with the server's own, but dropped the design's
 * permission matrix and the "Make a role" action, and listed each permission as its raw code. The
 * matrix is back, filled from each role's `permissionCodes` (every code any role holds is a row,
 * grouped by what it concerns, named in words by `permissionWords`), read-only: changing a mark
 * is not available yet. "Make a role" opens the role maker for those who may manage roles.
 *
 * Only job roles are listed (RL-1): approve and view only are permissions a person is given, not
 * roles (RL-2), and technical roles are nobody's job. A role the company made can be changed
 * ("Change it", the role maker) or deleted (`DELETE /v1/roles/{id}`) by those who may manage roles.
 */
export function RolesPage() {
  return (
    <SettingsShell group="people">
      <Header />
      <Gate />
    </SettingsShell>
  )
}

/** Inside the shell, which is what provides the session the permissions are read from. */
function Header() {
  const { t } = useTranslation()
  const mayManageRoles = useCan(ROLES_MANAGE)
  return (
    <SettingsHeader
      title={t('roles.title')}
      subtitle={t('people.roles.subtitle')}
      actions={
        <>
          {/* TODO(backend): SETTINGS.md row 8.2. No export of the role matrix yet. */}
          <button
            type="button"
            disabled
            title={t('roles.notAvailableYet')}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-40"
          >
            <img src={printIcon} alt="" className="size-[18px]" />
            {t('roles.exportPdf')}
            <span className="sr-only">{t('roles.notAvailableYet')}</span>
          </button>
          {mayManageRoles ? (
            <Link
              to="/settings/roles/new"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4" />
              {t('roles.makeARole')}
            </Link>
          ) : null}
        </>
      }
    />
  )
}

/** Inside the shell, which is what provides the session the permission is read from. */
function Gate() {
  return useCan(ROLES_PERMISSION) ? <RoleList /> : <PermissionDeniedNotice />
}

type Row = { code: string } & PermissionWords

function RoleList() {
  const { t, i18n } = useTranslation()
  const roles = useApiRead<RoleDto[]>(ROLES_PATH, loadRoles)
  const mayListPeople = useCan(USERS_PERMISSION)
  const mayManage = useCan(ROLES_MANAGE)
  const [deleting, setDeleting] = useState<RoleDto | null>(null)
  const people = useApiRead<UserPage>(mayListPeople ? PEOPLE_PATH : null, loadPeople).read

  if (roles.read.status === 'loading') return <LoadingNotice />
  if (roles.read.status === 'failed')
    return <ApiReadFailure error={roles.read.error} retry={roles.retry} />
  if (roles.read.data.length === 0) return <Notice body={t('people.roles.empty')} />

  const list = roles.read.data.filter(isJobRole)
  const holders = (code: string): number | null =>
    people.status === 'ready' && people.data.totalElements === people.data.content.length
      ? people.data.content.filter((person) => person.roles.includes(code)).length
      : null

  const rows: Row[] = [...new Set(list.flatMap((role) => role.permissionCodes))]
    .map((code) => ({ code, ...permissionWords(code, t, i18n) }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.action.localeCompare(b.action))
  const groups = [...new Set(rows.map((row) => row.group))]

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((role) => {
          const held = holders(role.code)
          const words = rows.filter((row) => role.permissionCodes.includes(row.code))
          return (
            <section
              key={role.id}
              aria-labelledby={`role-${role.id}`}
              className="flex flex-col gap-2 rounded-md bg-surface-card p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 id={`role-${role.id}`} className="text-lg font-semibold text-text-primary">
                  {role.name}
                </h3>
                <span className="rounded-sm bg-surface-background px-2 py-0.5 text-xs font-semibold text-text-tertiary">
                  {t(role.systemRole ? 'roles.builtIn' : 'roles.yours')}
                </span>
                {!role.enabled ? (
                  <span className="rounded-sm bg-pending-100 px-2 py-0.5 text-xs font-semibold text-text-secondary">
                    {t('people.roles.disabled')}
                  </span>
                ) : null}
              </div>
              {role.description ? (
                <p className="text-sm font-medium text-text-tertiary">{role.description}</p>
              ) : null}
              <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-text-secondary">
                {held !== null ? (
                  <span>{held === 0 ? t('roles.nobodyYet') : t('roles.people', { count: held })}</span>
                ) : (
                  <span />
                )}
                {role.systemRole ? (
                  <span className="text-xs text-text-quaternary">{t('roles.cantBeChanged')}</span>
                ) : mayManage ? (
                  <span className="flex items-center gap-4">
                    <Link
                      to={`/settings/roles/${encodeURIComponent(role.id)}/edit`}
                      aria-label={t('roles.changeRole', { name: role.name })}
                      className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                    >
                      {t('roles.changeIt')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleting(role)}
                      aria-label={t('roles.deleteRole', { name: role.name })}
                      className="text-sm font-semibold text-danger-700 transition-colors hover:text-danger-800"
                    >
                      {t('roles.delete')}
                    </button>
                  </span>
                ) : null}
              </p>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-primary-700">
                  {t('people.roles.permissions', { count: role.permissionCodes.length })}
                </summary>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {words.map((row) => (
                    <li
                      key={row.code}
                      className="rounded-sm bg-surface-background px-2 py-0.5 text-xs font-medium text-text-secondary"
                    >
                      {row.label}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )
        })}
      </div>

      <Matrix roles={list} rows={rows} groups={groups} holders={holders} />

      <DeleteRoleDialog
        role={deleting}
        held={deleting ? holders(deleting.code) : null}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null)
          roles.retry()
        }}
      />
    </>
  )
}

function Matrix({
  roles,
  rows,
  groups,
  holders,
}: {
  roles: RoleDto[]
  rows: Row[]
  groups: string[]
  holders: (code: string) => number | null
}) {
  const { t } = useTranslation()
  if (rows.length === 0) return null

  return (
    <section
      aria-labelledby="roles-matrix"
      className="overflow-hidden rounded-md bg-surface-card"
    >
      <h3 id="roles-matrix" className="sr-only">
        {t('roles.whatTheyCanDo')}
      </h3>
      <RowsView>
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th className="w-[300px] px-5 pb-3 pt-5 text-start align-bottom">
                <span className="text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                  {t('roles.whatTheyCanDo')}
                </span>
              </th>
              {roles.map((role) => {
                const held = holders(role.code)
                return (
                  <th
                    key={role.id}
                    className="w-[110px] border-s border-surface-background px-2 pb-3 pt-5 text-center align-bottom"
                  >
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-text-primary">
                      {role.name}
                    </span>
                    {held !== null ? (
                      <span className="mt-0.5 block text-[10px] font-medium text-text-quaternary">
                        {held === 0 ? t('roles.nobodyYet') : t('roles.people', { count: held })}
                      </span>
                    ) : null}
                    <span className="mt-1.5 inline-flex h-[18px] items-center rounded-[3px] bg-surface-background px-1.5 text-[9px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
                      {t(role.systemRole ? 'roles.builtIn' : 'roles.yours')}
                    </span>
                    <span dir="ltr" className="mt-2 block text-[10px] font-medium text-text-quaternary">
                      {role.permissionCodes.filter((code) => rows.some((r) => r.code === code)).length}
                      /{rows.length}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr className="bg-primary-25">
                  <td
                    colSpan={roles.length + 1}
                    className="px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.6px] text-primary-800"
                  >
                    {group}
                  </td>
                </tr>
                {rows
                  .filter((row) => row.group === group)
                  .map((row) => (
                    <tr key={row.code} className="border-b border-surface-background last:border-0">
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium leading-[1.3] text-text-primary">
                          {row.action}
                        </p>
                      </td>
                      {roles.map((role) => {
                        const grant = role.permissionCodes.includes(row.code)
                        const name = grant ? t('roles.legend.can') : t('roles.legend.cant')
                        return (
                          <td
                            key={role.id}
                            className="border-s border-surface-background px-2 py-3 text-center"
                          >
                            <span
                              role="img"
                              aria-label={`${row.label}, ${role.name}: ${name}`}
                              className={[
                                'mx-auto flex size-7 items-center justify-center rounded-md',
                                grant ? 'bg-success-100' : 'bg-surface-background',
                              ].join(' ')}
                            >
                              <img src={grant ? yesIcon : noIcon} alt="" className="size-4" />
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </RowsView>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
        <span className="flex flex-wrap items-center gap-4">
          <Legend icon={yesIcon} tint="bg-success-100" label={t('roles.legend.can')} />
          {/* TODO(backend): SETTINGS.md row 8.3. A grant has no limit ("own branch") yet. */}
          <Legend
            icon={limitIcon}
            tint="bg-pending-100"
            label={`${t('roles.legend.limited')}: ${t('roles.notAvailableYet')}`}
          />
          <Legend icon={noIcon} tint="bg-surface-background" label={t('roles.legend.cant')} />
        </span>
        {/* TODO: changing a mark needs PATCH /v1/roles/{id}, which the server has
            (docs/frontend/PLATFORM_USER_BACKEND_CONTRACT_REVIEW.md R5); not wired here yet. */}
        <span className="text-xs font-medium text-text-quaternary">
          {t('roles.changeNotAvailable')}
        </span>
      </div>
    </section>
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

/** Asks before deleting a role the company made, and says why the server refused if it did. */
function DeleteRoleDialog({
  role,
  held,
  onClose,
  onDeleted,
}: {
  role: RoleDto | null
  held: number | null
  onClose: () => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [shownFor, setShownFor] = useState<string | null>(null)
  if ((role?.id ?? null) !== shownFor) {
    setShownFor(role?.id ?? null)
    setFailure(null)
  }

  const close = () => {
    if (!busy) onClose()
  }
  const confirm = async () => {
    if (!role || busy) return
    setBusy(true)
    setFailure(null)
    try {
      await deleteRole(role.id)
      onDeleted()
    } catch (error) {
      const message = roleDeleteRefusal(error)
      setFailure(t(message.key, message.values))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={role !== null}
      onClose={close}
      title={t('roles.deleteTitle', { name: role?.name ?? '' })}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" size="md" onClick={close}>
            {t('makeRole.cancel')}
          </Button>
          <Button variant="danger" size="md" disabled={busy} onClick={confirm}>
            {busy ? t('roles.deleting') : t('roles.deleteConfirm')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {held ? t('roles.deleteHeld', { count: held }) : t('roles.deleteExplain')}
        </p>
        {failure ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {failure}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
