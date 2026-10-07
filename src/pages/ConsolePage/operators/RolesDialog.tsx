import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Button, Modal } from '../../../components/ui'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import {
  PLATFORM_ROLES,
  TENANT_ADMIN,
  changePlatformRole,
  describeRoleChangeFailure,
  displayName,
  isLastTenantAdmin,
  rolesAfter,
  withPlatformRoles,
  type PlatformRole,
  type PlatformUser,
} from '../../../lib/console/platformOperators'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'

type Pending = { role: PlatformRole; action: 'grant' | 'revoke' }

type RolesDialogProps = {
  user: PlatformUser
  team: readonly PlatformUser[]
  /** The whole team is on screen, so "the last tenant administrator" can be known. */
  wholeTeam: boolean
  /** The signed-in operator's user id. */
  selfId: string
  onClose: () => void
  onChanged: (user: PlatformUser) => void
}

/**
 * One person's platform roles, and the way to give or remove each.
 *
 * Every change is confirmed first: it moves platform authority, applies at once, and is audited
 * against the operator making it. What the backend would refuse is not offered — giving yourself a
 * role (no self-grant), or removing the last tenant administrator — but it still decides.
 */
export function RolesDialog({ user, team, wholeTeam, selfId, onClose, onChanged }: RolesDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [pending, setPending] = useState<Pending | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<FormMessage | null>(null)
  // One confirmation, one request: a double click must not grant, then fail to grant again.
  const inFlight = useRef(false)

  const name = displayName(user)
  const self = user.id === selfId
  const roleName = (role: PlatformRole) => t(`console.operators.role.${role}`)

  const confirm = async () => {
    if (!pending || inFlight.current) return
    inFlight.current = true
    setSaving(true)
    setError(null)
    try {
      const response = await changePlatformRole({ user, ...pending })
      onChanged(withPlatformRoles(user, rolesAfter(pending, response.platformRoles)))
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      setError(describeRoleChangeFailure(failure))
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const close = () => {
    if (!saving) onClose()
  }

  if (pending) {
    const granting = pending.action === 'grant'
    const values = { role: roleName(pending.role), name }
    return (
      <Modal
        open
        onClose={close}
        title={t(granting ? 'console.operators.confirm.giveTitle' : 'console.operators.confirm.removeTitle', values)}
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button
              type="button"
              size="md"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setPending(null)
                setError(null)
              }}
            >
              {t('common.back')}
            </Button>
            <Button type="button" size="md" disabled={saving} onClick={() => void confirm()}>
              {granting
                ? t(saving ? 'console.operators.confirm.giving' : 'console.operators.confirm.give')
                : t(saving ? 'console.operators.confirm.removing' : 'console.operators.confirm.remove')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {t(`console.operators.roleNote.${pending.role}`)}
          </p>
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {granting
              ? t('console.operators.confirm.giveBody', values)
              : self
                ? t('console.operators.confirm.removeSelfBody')
                : t('console.operators.confirm.removeBody', values)}
          </p>
          {!granting && self && pending.role === TENANT_ADMIN ? (
            <p className="text-sm font-semibold leading-[1.6] text-danger-700">
              {t('console.operators.confirm.removeSelfAdminBody')}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {t(error.key, error.values)}
            </p>
          ) : null}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={close}
      title={t('console.operators.dialog.title', { name })}
      subtitle={t('console.operators.dialog.subtitle')}
    >
      <ul className="flex flex-col">
        {PLATFORM_ROLES.map((role) => {
          const held = (user.roles ?? []).includes(role)
          const blocked = held
            ? isLastTenantAdmin(user, team, wholeTeam) && role === TENANT_ADMIN
              ? 'console.operators.lastAdmin'
              : null
            : self
              ? 'console.operators.selfGive'
              : null
          return (
            <li
              key={role}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1 basis-[240px]">
                <p className="text-sm font-semibold text-text-primary">{roleName(role)}</p>
                <p className="mt-0.5 text-xs font-medium leading-[1.5] text-text-tertiary">
                  {t(`console.operators.roleNote.${role}`)}
                </p>
                {blocked ? (
                  <p className="mt-1 text-xs font-medium leading-[1.5] text-pending-700">{t(blocked)}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2.5">
                <ConsoleStatusPill
                  tone={held ? 'success' : 'neutral'}
                  label={t(held ? 'console.operators.held' : 'console.operators.notHeld')}
                />
                <Button
                  type="button"
                  size="md"
                  variant="secondary"
                  disabled={blocked !== null}
                  aria-label={t(held ? 'console.operators.removeRole' : 'console.operators.giveRole', {
                    role: roleName(role),
                  })}
                  onClick={() => setPending({ role, action: held ? 'revoke' : 'grant' })}
                >
                  {t(held ? 'console.operators.remove' : 'console.operators.give')}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
