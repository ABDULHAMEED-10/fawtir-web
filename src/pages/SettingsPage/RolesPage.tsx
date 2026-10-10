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
import {
  PEOPLE_PATH,
  ROLES_PATH,
  ROLES_PERMISSION,
  USERS_PERMISSION,
  loadPeople,
  loadRoles,
  type RoleDto,
  type UserPage,
} from '../../api/settings/people'

/**
 * Settings › Roles: the company's roles and the permissions each one holds, from `GET /v1/roles`.
 * The screen used to draw a sample company's five roles, a custom "wholesale" role and a 16-row
 * matrix of invented abilities; it now shows the server's own role list, read-only. How many
 * people hold each role is counted from `GET /v1/users` only when the reader may list people.
 */
export function RolesPage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="people">
      <SettingsHeader title={t('people.roles.title')} subtitle={t('people.roles.subtitle')} />
      <Gate />
    </SettingsShell>
  )
}

/** Inside the shell, which is what provides the session the permission is read from. */
function Gate() {
  return useCan(ROLES_PERMISSION) ? <RoleList /> : <PermissionDeniedNotice />
}

function RoleList() {
  const { t } = useTranslation()
  const roles = useApiRead<RoleDto[]>(ROLES_PATH, loadRoles)
  const mayListPeople = useCan(USERS_PERMISSION)
  const people = useApiRead<UserPage>(mayListPeople ? PEOPLE_PATH : null, loadPeople).read

  if (roles.read.status === 'loading') return <LoadingNotice />
  if (roles.read.status === 'failed') return <ApiReadFailure error={roles.read.error} retry={roles.retry} />
  if (roles.read.data.length === 0) return <Notice body={t('people.roles.empty')} />

  const holders = (code: string): number | null =>
    people.status === 'ready' && people.data.totalElements === people.data.content.length
      ? people.data.content.filter((person) => person.roles.includes(code)).length
      : null

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {roles.read.data.map((role) => {
        const held = holders(role.code)
        const codes = [...role.permissionCodes].sort()
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
            {held !== null ? (
              <p className="text-sm font-medium text-text-secondary">
                {held === 0 ? t('roles.nobodyYet') : t('roles.people', { count: held })}
              </p>
            ) : null}
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-primary-700">
                {t('people.roles.permissions', { count: codes.length })}
              </summary>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {codes.map((code) => (
                  <li
                    key={code}
                    dir="ltr"
                    className="rounded-sm bg-surface-background px-2 py-0.5 font-mono text-xs text-text-secondary"
                  >
                    {code}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )
      })}
    </div>
  )
}
