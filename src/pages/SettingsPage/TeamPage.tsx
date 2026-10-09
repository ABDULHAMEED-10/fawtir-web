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
import {
  PEOPLE_PATH,
  PENDING_INVITATIONS_PATH,
  USERS_PERMISSION,
  loadPendingInvitations,
  loadPeople,
  type InvitationDto,
  type UserPage,
} from '../../api/settings/people'
import { PeopleTable } from './people'
import { TH, TD, useRoleNames } from './peopleView'
import plusIcon from '../../assets/settings/plus-white.svg'

/**
 * Settings › Team members: the company's own people from `GET /v1/users`, and the invitations
 * still waiting from `GET /v1/users/invitations`. It used to list a sample coffee company's staff,
 * with sign-in history and seat costs no server records; only what the server returns is drawn.
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
  const mayManage = useCan(USERS_PERMISSION)

  return (
    <>
      <SettingsHeader
        title={t('team.title')}
        subtitle={t('people.team.subtitle')}
        actions={
          mayManage ? (
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
  const invitations = useApiRead<InvitationDto[]>(PENDING_INVITATIONS_PATH, loadPendingInvitations)
  const roleNames = useRoleNames()

  return (
    <>
      <section aria-labelledby="team-people" className="flex flex-col gap-3 rounded-md bg-surface-card p-5">
        <h3 id="team-people" className="text-lg font-semibold text-text-primary">
          {t('people.team.peopleTitle')}
        </h3>
        {people.read.status === 'loading' ? (
          <LoadingNotice />
        ) : people.read.status === 'failed' ? (
          <ApiReadFailure error={people.read.error} retry={people.retry} />
        ) : people.read.data.content.length === 0 ? (
          <Notice body={t('people.team.empty')} />
        ) : (
          <>
            <PeopleTable people={people.read.data.content} roleNames={roleNames} />
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
      </section>

      <section aria-labelledby="team-invited" className="flex flex-col gap-3 rounded-md bg-surface-card p-5">
        <h3 id="team-invited" className="text-lg font-semibold text-text-primary">
          {t('people.team.invitedTitle')}
        </h3>
        {invitations.read.status === 'loading' ? (
          <LoadingNotice />
        ) : invitations.read.status === 'failed' ? (
          <ApiReadFailure error={invitations.read.error} retry={invitations.retry} />
        ) : invitations.read.data.length === 0 ? (
          <p className="text-sm font-medium text-text-tertiary">{t('people.team.noInvitations')}</p>
        ) : (
          <InvitationsTable invitations={invitations.read.data} roleNames={roleNames} />
        )}
      </section>
    </>
  )
}

function InvitationsTable({
  invitations,
  roleNames,
}: {
  invitations: InvitationDto[]
  roleNames: (code: string) => string
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]">
        <thead className="border-b border-border-subtle">
          <tr>
            <th className={TH}>{t('people.col.email')}</th>
            <th className={TH}>{t('team.col.role')}</th>
            <th className={TH}>{t('people.col.expires')}</th>
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
              <td className={TD}>{new Date(invitation.expiresAt).toLocaleDateString(i18n.language)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
