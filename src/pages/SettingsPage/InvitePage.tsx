import { useState, type FormEvent } from 'react'
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
  ROLES_PATH,
  ROLES_PERMISSION,
  USERS_PERMISSION,
  inviteUser,
  loadRoles,
  type RoleDto,
} from '../../api/settings/people'
import { describeApiFailure } from '../../lib/apiFailure'

/**
 * Settings › Invite someone, through `POST /v1/users/invitations` (`InviteUserRequest`: an email
 * and role codes). The form used to arrive filled in with a sample employee, sample branches and
 * an email preview signed by a sample owner. The server's request carries no name, branch or
 * note, so the form asks for none of them; the invitation email is the server's own.
 */
export function InvitePage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="people" back={{ to: '/settings/team', label: t('team.title') }}>
      <SettingsHeader title={t('invite.title')} subtitle={t('people.invite.subtitle')} />
      <Gate />
    </SettingsShell>
  )
}

/** Inside the shell, which is what provides the session the permission is read from. */
function Gate() {
  return useCan(USERS_PERMISSION) ? <InviteForm /> : <PermissionDeniedNotice />
}

type Sent = { email: string }

function InviteForm() {
  const { t } = useTranslation()
  const mayListRoles = useCan(ROLES_PERMISSION)
  const roles = useApiRead<RoleDto[]>(mayListRoles ? ROLES_PATH : null, loadRoles)
  const [email, setEmail] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending || email.trim() === '') return
    setSending(true)
    setFailure(null)
    try {
      const invitation = await inviteUser(email.trim(), chosen)
      setSent({ email: invitation.email })
      setEmail('')
      setChosen([])
    } catch (error) {
      const message = describeApiFailure(error)
      setFailure(t(message.key, message.values))
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-md bg-surface-card p-5">
      {sent ? (
        <Notice
          body={t('people.invite.sent', { email: sent.email })}
          action={{ label: t('common.close'), onClick: () => setSent(null) }}
        />
      ) : null}
      {failure ? <Notice body={failure} /> : null}

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-text-primary">
        {t('invite.email')}
        <input
          type="email"
          required
          maxLength={255}
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-[46px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium"
        />
        <span className="text-xs font-medium text-text-tertiary">{t('invite.whoNote')}</span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-text-primary">{t('invite.whatTitle')}</legend>
        {!mayListRoles ? (
          <p className="text-sm font-medium text-text-tertiary">{t('people.invite.defaultRoleOnly')}</p>
        ) : roles.read.status === 'loading' ? (
          <LoadingNotice />
        ) : roles.read.status === 'failed' ? (
          <ApiReadFailure error={roles.read.error} retry={roles.retry} />
        ) : (
          <>
            {roles.read.data
              .filter((role) => role.enabled)
              .map((role) => (
                <label key={role.id} className="flex items-start gap-2 text-sm font-medium text-text-primary">
                  <input
                    type="checkbox"
                    checked={chosen.includes(role.code)}
                    onChange={(event) =>
                      setChosen((current) =>
                        event.target.checked
                          ? [...current, role.code]
                          : current.filter((code) => code !== role.code),
                      )
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-semibold">{role.name}</span>
                    {role.description ? (
                      <span className="block text-text-tertiary">{role.description}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            <p className="text-xs font-medium text-text-tertiary">{t('people.invite.noRoleMeansDefault')}</p>
          </>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={sending}
          className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
        >
          {sending ? t('people.invite.sending') : t('people.invite.send')}
        </button>
        <Link to="/settings/team" className="text-sm font-semibold text-text-secondary">
          {t('invite.cancel')}
        </Link>
      </div>
    </form>
  )
}
