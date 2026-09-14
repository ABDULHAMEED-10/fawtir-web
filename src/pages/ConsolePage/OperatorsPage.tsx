import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Pager, RowsView } from '../../components/ui'
import editIcon from '../../assets/settings/menu-edit.svg'
import keyIcon from '../../assets/settings/menu-key.svg'
import removeIcon from '../../assets/settings/menu-remove.svg'
import sparkleIcon from '../../assets/settings/menu-sparkle.svg'
import mailIcon from '../../assets/settings/menu-mail.svg'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { useRefreshConsoleAccess } from '../../layouts/ConsoleShell/consoleAccessRefresh'
import { ConsoleNotice, ConsoleReadFailure } from '../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import { formatMoment, localeFor } from '../../lib/console/format'
import {
  EXPIRED_INVITATIONS_PATH,
  PENDING_INVITATIONS_PATH,
  openOperatorInvitations,
  withInvitation,
  type Invitation,
} from '../../lib/console/operatorInvitations'
import { withReactivated } from '../../lib/console/operatorReactivation'
import {
  OPERATORS_PERMISSIONS,
  PLATFORM_ROLES,
  displayName,
  isAdminLocked,
  isLastTenantAdmin,
  isPlatformRole,
  operatorsPath,
  type PlatformUser,
  type UserPage,
} from '../../lib/console/platformOperators'
import { peekEntitlements } from '../../lib/identity/entitlements'
import type { FormMessage } from '../../lib/identity/errors'
import { afterLifecycle, type LifecycleAction } from '../../lib/console/operatorLifecycle'
import { ChangeEmailDialog } from './operators/ChangeEmailDialog'
import { DeactivatedOperators, type LifecycleStatus } from './operators/DeactivatedOperators'
import { LifecycleDialog } from './operators/LifecycleDialog'
import { InviteOperatorDialog } from './operators/InviteOperatorDialog'
import { PendingInvitations } from './operators/PendingInvitations'
import { ResetMfaDialog } from './operators/ResetMfaDialog'
import { RolesDialog } from './operators/RolesDialog'

function pageFrom(params: URLSearchParams): number {
  const page = Number(params.get('page'))
  return Number.isInteger(page) && page > 1 ? page : 1
}

/**
 * The platform team — Fawtir's own operators — and which platform roles each holds.
 *
 * One read of the team and one of each open invitation state; deactivated operators are read only
 * when asked for. A role change, an invitation action, a reactivation, a two-step reset or an email
 * change request sends one request and shows what it answers with, so nothing is read again. New
 * operators join by invitation only (P7); an email change is confirmed by the operator on their own
 * page (P8).
 */
export function OperatorsPage() {
  return (
    <ConsoleShell requires={OPERATORS_PERMISSIONS}>
      <OperatorsList />
    </ConsoleShell>
  )
}

function OperatorsList() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const page = pageFrom(params)
  const { read, retry } = useConsoleRead<UserPage>(operatorsPath(page - 1))
  const refreshAccess = useRefreshConsoleAccess()
  // The shell renders this screen only once the entitlements are known.
  const selfId = peekEntitlements()?.userId ?? ''
  const [changed, setChanged] = useState<ReadonlyMap<string, PlatformUser>>(() => new Map())
  const [reactivated, setReactivated] = useState<readonly PlatformUser[]>([])
  const [managingId, setManagingId] = useState<string | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [emailingId, setEmailingId] = useState<string | null>(null)
  const [lifecycle, setLifecycle] = useState<{ id: string; action: LifecycleAction } | null>(null)
  // Whether each person changed here is now active or deactivated; outranks what the reads said.
  const [statuses, setStatuses] = useState<ReadonlyMap<string, LifecycleStatus>>(() => new Map())
  const [deactivatedHere, setDeactivatedHere] = useState<readonly PlatformUser[]>([])
  const [notice, setNotice] = useState<FormMessage | null>(null)
  const [inviting, setInviting] = useState(false)
  const [invitationChanges, setInvitationChanges] = useState<readonly Invitation[]>([])
  const pending = useConsoleRead<Invitation[]>(PENDING_INVITATIONS_PATH)
  const expired = useConsoleRead<Invitation[]>(EXPIRED_INVITATIONS_PATH)
  const number = new Intl.NumberFormat(localeFor(i18n.language))

  const goTo = (next: number) => setParams(next > 1 ? new URLSearchParams({ page: String(next) }) : new URLSearchParams())

  const loaded = read.status === 'ready' ? read.data : null
  const wholeTeam = loaded !== null && loaded.number === 0 && loaded.totalElements <= loaded.content.length
  const listed = loaded ? withReactivated(loaded.content, reactivated, wholeTeam) : []
  const team = listed.filter((user) => statuses.get(user.id) !== 'deactivated').map((user) => changed.get(user.id) ?? user)
  // Someone reactivated while the team spans pages is not placed on this one, but their roles
  // can still be managed straight away.
  const managed = team.find((user) => user.id === managingId) ?? reactivated.find((user) => user.id === managingId)
  const managing = managed ? (changed.get(managed.id) ?? managed) : null
  const resetting = team.find((user) => user.id === resettingId) ?? null
  const changing = lifecycle ? (team.find((user) => user.id === lifecycle.id) ?? null) : null
  const setStatus = (id: string, status: LifecycleStatus) => setStatuses((current) => new Map(current).set(id, status))
  const emailing = team.find((user) => user.id === emailingId) ?? null

  const invitationsRead =
    pending.read.status === 'failed'
      ? pending.read
      : expired.read.status === 'failed'
        ? expired.read
        : pending.read.status === 'ready' && expired.read.status === 'ready'
          ? pending.read
          : ({ status: 'loading' } as const)
  const invitations =
    pending.read.status === 'ready' && expired.read.status === 'ready'
      ? invitationChanges.reduce(withInvitation, openOperatorInvitations(pending.read.data, expired.read.data))
      : []
  const invitationChanged = (invitation: Invitation, message: FormMessage) => {
    setInvitationChanges((current) => [...current, invitation])
    setNotice(message)
  }

  let body
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.operators.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (team.length === 0) {
    body =
      read.data.totalElements === 0 ? (
        <p className="rounded-md bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
          {t('console.operators.empty')}
        </p>
      ) : (
        <ConsoleNotice
          body={t('console.verification.pastEnd')}
          action={{ label: t('console.verification.firstPage'), onClick: () => goTo(1) }}
        />
      )
  } else {
    body = (
      <section className="flex flex-col rounded-md bg-surface-card">
        <div className="px-6 py-4">
          <TeamTable
            team={team}
            selfId={selfId}
            onManage={(user) => {
              setNotice(null)
              setManagingId(user.id)
            }}
            onChangeEmail={(user) => {
              setNotice(null)
              setEmailingId(user.id)
            }}
            onResetMfa={(user) => {
              setNotice(null)
              setResettingId(user.id)
            }}
            onLifecycle={(user, action) => {
              setNotice(null)
              setLifecycle({ id: user.id, action })
            }}
          />
        </div>
        {loaded && loaded.totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-6 py-4">
            <p className="text-sm font-medium text-text-tertiary">
              {t('console.verification.showing', {
                from: number.format(loaded.number * loaded.size + 1),
                to: number.format(loaded.number * loaded.size + loaded.content.length),
                total: number.format(loaded.totalElements),
              })}
            </p>
            <Pager
              page={loaded.number + 1}
              pageCount={loaded.totalPages}
              onChange={goTo}
              labels={{
                nav: t('console.verification.pager.label'),
                previous: t('console.verification.pager.previous'),
                next: t('console.verification.pager.next'),
              }}
            />
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('console.operators.title')}</h1>
          <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
            {t('console.operators.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNotice(null)
            setInviting(true)
          }}
          className="inline-flex h-[46px] shrink-0 items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
        >
          {t('console.operators.invite.open')}
        </button>
      </div>

      {notice ? (
        <p role="status" className="rounded-md bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary">
          {t(notice.key, notice.values)}
        </p>
      ) : null}

      {body}

      <PendingInvitations
        read={invitationsRead}
        invitations={invitations}
        retry={() => {
          pending.retry()
          expired.retry()
        }}
        onChanged={(invitation, action) =>
          invitationChanged(invitation, {
            key: action === 'resend' ? 'console.operators.pending.resent' : 'console.operators.pending.revoked',
            values: { email: invitation.email },
          })
        }
      />

      <DeactivatedOperators
        deactivatedHere={deactivatedHere}
        statuses={statuses}
        onReactivated={(user) => {
          setStatus(user.id, 'active')
          // The reactivated person replaces any copy of them held from before, roles included.
          setChanged((current) => {
            const next = new Map(current)
            next.delete(user.id)
            return next
          })
          setReactivated((current) => [...current.filter((other) => other.id !== user.id), user])
          setNotice({ key: 'console.operators.reactivate.done', values: { name: displayName(user) } })
          // They are back with no role at all; the next thing an administrator does is decide
          // which one, if any — through the Roles dialog, the only path platform roles travel.
          setManagingId(user.id)
        }}
      />

      {inviting ? (
        <InviteOperatorDialog
          onClose={() => setInviting(false)}
          onInvited={(invitation) => {
            setInviting(false)
            invitationChanged(invitation, { key: 'console.operators.invite.sent', values: { email: invitation.email } })
          }}
        />
      ) : null}

      {changing && lifecycle ? (
        <LifecycleDialog
          user={changing}
          action={lifecycle.action}
          lastAdmin={lifecycle.action !== 'unlock' && isLastTenantAdmin(changing, team, wholeTeam)}
          onClose={() => setLifecycle(null)}
          onDone={() => {
            const { action } = lifecycle
            setLifecycle(null)
            const after = afterLifecycle(changing, action)
            if (action === 'deactivate') {
              setStatus(changing.id, 'deactivated')
              setDeactivatedHere((current) => [after, ...current.filter((other) => other.id !== changing.id)])
            } else {
              setChanged((current) => new Map(current).set(changing.id, after))
            }
            setNotice({ key: `console.operators.lifecycle.${action}Done`, values: { name: displayName(changing) } })
          }}
        />
      ) : null}

      {emailing ? (
        <ChangeEmailDialog
          user={emailing}
          self={emailing.id === selfId}
          onClose={() => setEmailingId(null)}
          onRequested={(answer) => {
            setEmailingId(null)
            // Nothing moved, so the row keeps the address it shows.
            const values = {
              name: displayName(emailing),
              newEmail: answer.requestedEmail,
              currentEmail: answer.currentEmail,
              expires: answer.expiresAt ? formatMoment(answer.expiresAt, i18n.language) : '',
            }
            setNotice(
              answer.status === 'ALREADY_APPLIED'
                ? { key: 'console.operators.emailChange.already', values }
                : { key: emailing.id === selfId ? 'console.operators.emailChange.pendingSelf' : 'console.operators.emailChange.pending', values },
            )
          }}
        />
      ) : null}

      {resetting ? (
        <ResetMfaDialog
          user={resetting}
          onClose={() => setResettingId(null)}
          onReset={(answer) => {
            setResettingId(null)
            setChanged((current) => new Map(current).set(resetting.id, { ...resetting, mfaEnabled: false }))
            const name = displayName(resetting)
            setNotice(
              answer.revokedSessions === 0
                ? { key: 'console.operators.mfaReset.doneNoSessions', values: { name } }
                : { key: 'console.operators.mfaReset.done', values: { name, count: answer.revokedSessions } },
            )
          }}
        />
      ) : null}

      {managing ? (
        <RolesDialog
          user={managing}
          team={team}
          wholeTeam={wholeTeam}
          selfId={selfId}
          onClose={() => setManagingId(null)}
          onChanged={(user) => {
            setManagingId(null)
            if (user.id === selfId) {
              // The cached entitlements still claim the old authority; ask again, which
              // re-reads this list too — or ends at "no access" if that was the point.
              refreshAccess()
              return
            }
            setChanged((current) => new Map(current).set(user.id, user))
            setNotice({ key: 'console.operators.saved', values: { name: displayName(user) } })
          }}
        />
      ) : null}
    </div>
  )
}

function TeamTable({
  team,
  selfId,
  onManage,
  onChangeEmail,
  onResetMfa,
  onLifecycle,
}: {
  team: readonly PlatformUser[]
  selfId: string
  onManage: (user: PlatformUser) => void
  onChangeEmail: (user: PlatformUser) => void
  onResetMfa: (user: PlatformUser) => void
  onLifecycle: (user: PlatformUser, action: LifecycleAction) => void
}) {
  const { t, i18n } = useTranslation()

  return (
    <RowsView>
      <table className="w-full min-w-[760px] border-collapse text-start">
        <thead>
          <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
            <th className="px-4 py-3 text-start font-semibold">{t('console.operators.col.person')}</th>
            <th className="px-2 py-3 text-start font-semibold">{t('console.operators.col.email')}</th>
            <th className="px-2 py-3 text-start font-semibold">{t('console.operators.col.status')}</th>
            <th className="px-2 py-3 text-start font-semibold">{t('console.operators.col.roles')}</th>
            <th className="px-4 py-3 text-end font-semibold">
              <span className="sr-only">{t('console.operators.col.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {team.map((user) => {
            const name = displayName(user)
            const platformRoles = PLATFORM_ROLES.filter((role) => user.roles.includes(role))
            const otherRoles = user.roles.filter((code) => !isPlatformRole(code))
            return (
              <tr key={user.id} className="border-b border-[#f3f3f3] last:border-b-0">
                <td className="px-4 py-4">
                  <span className="text-base font-medium leading-[1.2] text-text-primary">
                    {name}
                    {user.id === selfId ? (
                      <span className="ms-2 text-xs font-semibold text-primary-800">{t('console.operators.you')}</span>
                    ) : null}
                  </span>
                  {name !== user.username ? (
                    <span className="mt-1 block text-xs font-medium text-text-quaternary">
                      <bdi>{user.username}</bdi>
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-4 text-sm font-medium text-text-secondary">
                  <bdi>{user.email}</bdi>
                </td>
                <td className="px-2 py-4">
                  {!user.enabled ? (
                    <ConsoleStatusPill tone="neutral" label={t('console.operators.status.off')} />
                  ) : user.locked ? (
                    <>
                      <ConsoleStatusPill
                        tone={isAdminLocked(user) ? 'danger' : 'pending'}
                        label={t('console.operators.status.locked')}
                      />
                      {user.lockedUntil ? (
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t('console.operators.lockedUntil', { time: formatMoment(user.lockedUntil, i18n.language) })}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <ConsoleStatusPill tone="success" label={t('console.operators.status.active')} />
                  )}
                </td>
                <td className="px-2 py-4 text-sm font-medium text-text-secondary">
                  {platformRoles.length ? (
                    platformRoles.map((role) => (
                      <span key={role} className="block">
                        {t(`console.operators.role.${role}`)}
                      </span>
                    ))
                  ) : (
                    <span className="text-text-quaternary">{t('console.operators.noRoles')}</span>
                  )}
                  {otherRoles.length ? (
                    <span className="mt-1 block text-xs text-text-quaternary">
                      <bdi>{otherRoles.join(', ')}</bdi>
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-4 text-end">
                  <div className="flex justify-end">
                    <ActionMenu
                      size="md"
                      floating
                      label={t('console.operators.actionsFor', { name })}
                      items={[
                        { id: 'roles', labelKey: 'console.operators.manage', icon: editIcon, onSelect: () => onManage(user) },
                        {
                          id: 'email',
                          labelKey: 'console.operators.emailChange.open',
                          icon: mailIcon,
                          onSelect: () => onChangeEmail(user),
                        },
                        // None of these on your own row. The backend refuses resetting your own
                        // second factor; it does not refuse locking or deactivating yourself, which
                        // would end your own session at once — another operator's call, not a
                        // menu item a slip of the hand reaches.
                        ...(user.id === selfId
                          ? []
                          : [
                              user.locked
                                ? {
                                    id: 'unlock',
                                    labelKey: 'console.operators.lifecycle.unlock',
                                    icon: keyIcon,
                                    onSelect: () => onLifecycle(user, 'unlock'),
                                  }
                                : {
                                    id: 'lock',
                                    labelKey: 'console.operators.lifecycle.lock',
                                    icon: keyIcon,
                                    onSelect: () => onLifecycle(user, 'lock'),
                                  },
                              {
                                id: 'resetTwoStep',
                                labelKey: 'console.operators.mfaReset.open',
                                icon: sparkleIcon,
                                danger: true,
                                onSelect: () => onResetMfa(user),
                              },
                              {
                                id: 'deactivate',
                                labelKey: 'console.operators.lifecycle.deactivate',
                                icon: removeIcon,
                                danger: true,
                                onSelect: () => onLifecycle(user, 'deactivate'),
                              },
                            ]),
                      ]}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </RowsView>
  )
}
