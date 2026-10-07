import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmailText } from './EmailText'
import { ApiError } from '../../../api'
import { RowsView } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import type { ConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { formatDay } from '../../../lib/console/format'
import {
  describeInvitationActionFailure,
  resendOperatorInvitation,
  revokeInvitation,
  type Invitation,
} from '../../../lib/console/operatorInvitations'
import { forgetEntitlements } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../../lib/identity/login'
import {
  CONSOLE_CARD,
  CONSOLE_ROWS,
  CONSOLE_TABLE,
  CONSOLE_TABLE_BODY,
  CONSOLE_THEAD,
  ConsoleButton,
} from '../../../layouts/ConsoleShell/consoleStyle'

type Action = 'resend' | 'revoke'

/**
 * The operator invitations still open — waiting, or expired but not yet accepted or revoked.
 * An expired one stays here because the backend still counts it as open: it blocks a new
 * invitation to the same address until it is resent or revoked.
 */
export function PendingInvitations({
  read,
  invitations,
  retry,
  onChanged,
}: {
  /** The combined state of the two reads the list is built from. */
  read: ConsoleRead<unknown>
  invitations: readonly Invitation[]
  retry: () => void
  onChanged: (invitation: Invitation, action: Action) => void
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<{ id: string; action: Action } | null>(null)
  const [failure, setFailure] = useState<{ id: string; message: FormMessage } | null>(null)
  // One action at a time across the list: resend and revoke on the same invitation must not race.
  const inFlight = useRef(false)

  const act = async (invitation: Invitation, action: Action) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy({ id: invitation.id, action })
    setFailure(null)
    try {
      const changed = action === 'resend' ? await resendOperatorInvitation(invitation) : await revokeInvitation(invitation)
      onChanged(changed, action)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      setFailure({ id: invitation.id, message: describeInvitationActionFailure(error) })
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  let body
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.operators.pending.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (invitations.length === 0) {
    body = <p className="py-6 text-center text-sm font-medium text-text-tertiary">{t('console.operators.pending.empty')}</p>
  } else {
    body = (
      <RowsView className={CONSOLE_ROWS}>
        <table className={`${CONSOLE_TABLE} min-w-[640px]`}>
          <thead>
            <tr className={CONSOLE_THEAD}>
              <th className="px-4 py-3 text-start font-semibold">{t('console.operators.pending.col.email')}</th>
              <th className="px-2 py-3 text-start font-semibold">{t('console.operators.pending.col.sent')}</th>
              <th className="px-2 py-3 text-start font-semibold">{t('console.operators.pending.col.expires')}</th>
              <th className="px-4 py-3 text-end font-semibold">
                <span className="sr-only">{t('console.operators.col.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation) => {
              const expired = invitation.status === 'EXPIRED'
              const rowBusy = busy?.id === invitation.id
              return (
                <tr key={invitation.id} className="border-b border-[#f3f3f3] last:border-b-0">
                  <td className="px-4 py-4 text-sm font-medium text-text-primary">
                    <EmailText email={invitation.email} />
                    {failure?.id === invitation.id ? (
                      <span role="alert" className="mt-1 block text-xs font-medium text-danger-700">
                        {t(failure.message.key, failure.message.values)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-text-secondary">
                    {formatDay(invitation.lastSentAt, i18n.language)}
                    {invitation.sentCount > 1 ? (
                      <span className="mt-1 block text-xs text-text-quaternary">
                        {t('console.operators.pending.sentTimes', { count: invitation.sentCount })}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-text-secondary">
                    {expired ? (
                      <ConsoleStatusPill tone="pending" label={t('console.operators.pending.expired')} />
                    ) : (
                      formatDay(invitation.expiresAt, i18n.language)
                    )}
                  </td>
                  <td className="px-4 py-4 text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      <ConsoleButton
                        type="button"
                        size="md"
                        variant="small"
                        disabled={busy !== null}
                        aria-label={t('console.operators.pending.resendFor', { email: invitation.email })}
                        onClick={() => void act(invitation, 'resend')}
                      >
                        {rowBusy && busy?.action === 'resend'
                          ? t('console.operators.pending.resending')
                          : t('console.operators.pending.resend')}
                      </ConsoleButton>
                      <ConsoleButton
                        type="button"
                        size="md"
                        variant="small"
                        disabled={busy !== null}
                        aria-label={t('console.operators.pending.revokeFor', { email: invitation.email })}
                        onClick={() => void act(invitation, 'revoke')}
                      >
                        {rowBusy && busy?.action === 'revoke'
                          ? t('console.operators.pending.revoking')
                          : t('console.operators.pending.revoke')}
                      </ConsoleButton>
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

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-medium leading-[1.2] text-text-primary">{t('console.operators.pending.title')}</h2>
      <div className={`${CONSOLE_CARD} ${CONSOLE_TABLE_BODY}`}>{body}</div>
    </section>
  )
}
