import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { useApiRead } from '../../hooks'
import { useCan, useSession } from '../../lib/session/session'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { Input, Switch } from '../../components/ui'
import {
  ROLES_PATH,
  ROLES_PERMISSION,
  USERS_PERMISSION,
  inviteUser,
  loadRoles,
  type RoleDto,
} from '../../api/settings/people'
import { describeApiFailure } from '../../lib/apiFailure'
import { permissionWords } from '../../lib/permissionLabels'
import tickIcon from '../../assets/settings/check-green.svg'
import circleIcon from '../../assets/settings/minus-amber.svg'
import chipYesIcon from '../../assets/settings/check-green.svg'
import sendIcon from '../../assets/settings/check-white.svg'

/**
 * Settings › Invite someone (Figma 135:38912), through `POST /v1/users/invitations`
 * (`InviteUserRequest`: an email and role codes, nothing else).
 *
 * PR #166 emptied the form of its sample employee and, with it, removed the fields the request
 * cannot carry. The design keeps them, so they are drawn again: the name, the branches, the note
 * and the "ask for two-step" switch are shown disabled with "Not available yet" and are never
 * sent (the server refuses unknown members), and the email preview is built from the session and
 * the form, labelled as a preview. Each gap is a SETTINGS.md row (7.1 to 7.5).
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
  const session = useSession()
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

  const roleList = roles.read.status === 'ready' ? roles.read.data : []
  const chosenNames = roleList
    .filter((role) => chosen.includes(role.code))
    .map((role) => role.name)
  const filledIn = email.trim().includes('@')

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {sent ? (
        <Notice
          body={t('people.invite.sent', { email: sent.email })}
          action={{ label: t('common.close'), onClick: () => setSent(null) }}
        />
      ) : null}
      {failure ? <Notice body={failure} /> : null}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Panel title={t('invite.whoTitle')} note={t('invite.whoNote')}>
            <div className="grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                {/* TODO(backend): SETTINGS.md row 7.1. The request carries no name. */}
                <Input
                  bordered
                  label={t('invite.name')}
                  value=""
                  disabled
                  readOnly
                  hint={t('invite.notAvailableYet')}
                />
                <Input
                  bordered
                  type="email"
                  label={t('invite.email')}
                  requiredMark
                  required
                  maxLength={255}
                  autoComplete="off"
                  dir="ltr"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {/* TODO(backend): SETTINGS.md row 7.3. The request carries no note. */}
              <label className="block">
                <span className="mb-1 flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-text-primary">
                  {t('invite.note')}
                  <span className="text-xs font-normal text-text-quaternary">
                    {t('invite.notAvailableYet')}
                  </span>
                </span>
                <textarea
                  disabled
                  value=""
                  readOnly
                  rows={3}
                  className="w-full resize-none rounded-sm border border-border-default bg-white px-3 py-2.5 text-sm font-medium text-text-primary outline-none disabled:opacity-50"
                />
              </label>
            </div>
          </Panel>

          <Panel
            title={t('invite.whatTitle')}
            note={t('invite.whatNote')}
            action={
              mayListRoles ? (
                <Link
                  to="/settings/roles"
                  className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                >
                  {t('invite.compareRoles')}
                </Link>
              ) : undefined
            }
          >
            {!mayListRoles ? (
              <p className="text-sm font-medium text-text-tertiary">
                {t('people.invite.defaultRoleOnly')}
              </p>
            ) : roles.read.status === 'loading' ? (
              <LoadingNotice />
            ) : roles.read.status === 'failed' ? (
              <ApiReadFailure error={roles.read.error} retry={roles.retry} />
            ) : (
              <fieldset className="flex flex-col gap-2.5">
                <legend className="sr-only">{t('invite.whatTitle')}</legend>
                {roleList
                  .filter((role) => role.enabled)
                  .map((role) => (
                    <RoleChoice
                      key={role.id}
                      role={role}
                      picked={chosen.includes(role.code)}
                      onChange={(picked) =>
                        setChosen((current) =>
                          picked
                            ? [...current, role.code]
                            : current.filter((code) => code !== role.code),
                        )
                      }
                    />
                  ))}
                <p className="text-xs font-medium text-text-tertiary">
                  {t('people.invite.noRoleMeansDefault')}
                </p>
              </fieldset>
            )}
          </Panel>

          {/* TODO(backend): SETTINGS.md rows 7.2 and 7.4. No branches or two-step request. */}
          <Panel title={t('invite.branchesTitle')} note={t('invite.branchesNote')}>
            <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium text-text-tertiary">
              {t('invite.branchesUnavailable')}
            </p>
            <div className="mt-5 flex items-center justify-between gap-4 rounded-sm border border-border-subtle px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                  {t('invite.askTwoStep')}
                </p>
                <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t('invite.notAvailableYet')}
                </p>
              </div>
              <Switch checked={false} onChange={() => {}} disabled label={t('invite.askTwoStep')} />
            </div>
          </Panel>
        </div>

        <aside className="flex w-full flex-col gap-4 xl:w-[320px] xl:shrink-0">
          {/* TODO(backend): SETTINGS.md row 7.5. The server's own email cannot be previewed. */}
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('invite.whatTheyGet')}
            </h3>
            <div className="mt-3 overflow-hidden rounded-sm border border-border-subtle">
              <p className="bg-[#151c2d] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                {t('invite.theInvitationEmail')}
              </p>
              <div className="bg-white p-4">
                <p className="text-sm font-semibold leading-[1.4] text-text-primary">
                  {t('invite.emailSubject', {
                    who: session?.username ?? t('invite.someone'),
                    company: session?.tenantName ?? t('invite.yourCompany'),
                  })}
                </p>
                {filledIn ? (
                  <p dir="ltr" className="mt-2 text-xs font-medium text-text-tertiary">
                    {email.trim()}
                  </p>
                ) : null}
                <span className="mt-3 inline-flex h-[34px] items-center rounded-sm bg-primary-700 px-3 text-xs font-semibold text-white">
                  {t('invite.acceptTheInvitation')}
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('invite.previewNote')}
            </p>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('invite.whatHappensNext')}
            </h3>
            <dl className="mt-2">
              <Row label={t('invite.emailSent')} value={t('invite.straightAway')} />
              <Row label={t('invite.linkWorksFor')} value={t('invite.notAvailableYet')} muted />
              <Row label={t('invite.placeTaken')} value={t('invite.notAvailableYet')} muted />
              <Row
                label={t('invite.chargedFrom')}
                value={t('invite.notAvailableYet')}
                muted
                last
              />
            </dl>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('invite.ready')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              <Check
                done={filledIn}
                label={filledIn ? t('invite.check.emailFilled') : t('invite.check.emailMissing')}
              />
              <Check
                done
                label={
                  chosenNames.length
                    ? t('invite.check.roleChosen', { role: chosenNames.join(', ') })
                    : t('invite.check.defaultRole')
                }
              />
            </ul>
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {filledIn ? (
            <span dir="ltr">{email.trim()}</span>
          ) : (
            t('invite.footerEmailNeeded')
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to="/settings/team"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('invite.cancel')}
          </Link>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
          >
            <img src={sendIcon} alt="" className="size-4" />
            {sending ? t('people.invite.sending') : t('people.invite.send')}
          </button>
        </div>
      </div>
    </form>
  )
}

/** One role as a card, as the design draws it; what it reaches is named from its permissions. */
function RoleChoice({
  role,
  picked,
  onChange,
}: {
  role: RoleDto
  picked: boolean
  onChange: (picked: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const groups = [
    ...new Set(role.permissionCodes.map((code) => permissionWords(code, t, i18n).group)),
  ].sort((a, b) => a.localeCompare(b))
  const shown = groups.slice(0, 4)

  return (
    <label
      className={[
        'flex cursor-pointer gap-3 rounded-sm border p-4 transition-colors',
        picked ? 'border-primary-700 bg-primary-25' : 'border-border-subtle bg-white hover:bg-primary-25',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={picked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 accent-[#2c4eb7]"
      />
      <span className="min-w-0 flex-1">
        <span
          className={[
            'block text-sm font-semibold',
            picked ? 'text-primary-800' : 'text-text-primary',
          ].join(' ')}
        >
          {role.name}
        </span>
        {role.description ? (
          <span className="mt-1.5 block max-w-[620px] text-sm font-medium leading-[1.6] text-text-tertiary">
            {role.description}
          </span>
        ) : null}
        {shown.length ? (
          <span className="mt-2.5 flex flex-wrap gap-2">
            {shown.map((group) => (
              <span
                key={group}
                className="inline-flex h-[24px] items-center gap-1.5 rounded-[3px] bg-success-100 px-2 text-[11px] font-medium text-[#3d5648]"
              >
                <img src={chipYesIcon} alt="" className="size-3" />
                {group}
              </span>
            ))}
            {groups.length > shown.length ? (
              <span className="inline-flex h-[24px] items-center rounded-[3px] bg-surface-background px-2 text-[11px] font-medium text-text-quaternary">
                {t('invite.moreAreas', { count: groups.length - shown.length })}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </label>
  )
}

function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string
  note: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">{note}</p>
        </div>
        {action}
      </div>
      <div className="p-5 pt-0">{children}</div>
    </section>
  )
}

function Check({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <img src={done ? tickIcon : circleIcon} alt="" className="mt-0.5 size-4 shrink-0" />
      <span
        className={[
          'text-sm font-medium leading-[1.4]',
          done ? 'text-text-secondary' : 'text-text-quaternary',
        ].join(' ')}
      >
        {label}
      </span>
    </li>
  )
}

function Row({
  label,
  value,
  muted,
  last,
}: {
  label: string
  value: string
  muted?: boolean
  last?: boolean
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
        className={[
          'shrink-0 text-sm',
          muted ? 'font-medium text-text-quaternary' : 'font-semibold text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
