import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Button, Modal } from '../../components/ui'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  invitationClosed,
  resendInvitation,
  revokeInvitation,
  type InvitationDto,
} from '../../api/settings/people'
import mailIcon from '../../assets/settings/menu-mail.svg'
import closeIcon from '../../assets/settings/menu-close.svg'

/** The sentence for a refused resend or revoke: the server's reason, never a generic "reload". */
function useInvitationFailureText(): (error: unknown) => string {
  const { t } = useTranslation()
  return (error) => {
    if (invitationClosed(error)) return t('people.team.invitation.closed')
    const message = describeApiFailure(error)
    return t(message.key, message.values)
  }
}

/**
 * One waiting invitation's actions on Team members, as a person's row has its menu: send the link
 * again (`POST /v1/users/invitations/{id}/resend`), or take the invitation back
 * (`POST /v1/users/invitations/{id}/revoke`), which asks first. The server decides whether either
 * is still possible; a refusal is said in its own words and the list is read again.
 */
export function InvitationActions({
  invitation,
  onDone,
}: {
  invitation: InvitationDto
  onDone: (message: string) => void
}) {
  const { t } = useTranslation()
  const failureText = useInvitationFailureText()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const email = invitation.email

  const resend = async () => {
    if (busy) return
    setBusy(true)
    try {
      const sent = await resendInvitation(invitation.id)
      onDone(t('people.team.invitation.resent', { email: sent.email || email }))
    } catch (error) {
      onDone(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    setConfirming(false)
    setFailure(null)
  }

  const revoke = async () => {
    setBusy(true)
    setFailure(null)
    try {
      await revokeInvitation(invitation.id)
      setConfirming(false)
      onDone(t('people.team.invitation.revoked', { email }))
    } catch (error) {
      setFailure(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ActionMenu
        label={t('people.team.invitation.actionsFor', { email })}
        floating
        items={[
          {
            id: 'resend',
            labelKey: 'people.team.invitation.resend',
            icon: mailIcon,
            onSelect: () => void resend(),
          },
          {
            id: 'revoke',
            labelKey: 'people.team.invitation.revoke',
            icon: closeIcon,
            danger: true,
            onSelect: () => setConfirming(true),
          },
        ]}
      />
      {/* The menu's cell is end-aligned; the dialog's text reads from the start (EN left, AR right). */}
      <div className="text-start">
        <Modal
          open={confirming}
          onClose={close}
          title={t('people.team.invitation.revokeTitle', { email })}
          footer={
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="secondary" size="md" onClick={close}>
                {t('removal.cancel')}
              </Button>
              <Button size="md" disabled={busy} onClick={() => void revoke()}>
                {busy ? t('removal.saving') : t('people.team.invitation.revokeConfirm')}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium leading-[1.6] text-text-secondary">
              {t('people.team.invitation.revokeBody', { email })}
            </p>
            {failure ? (
              <p role="alert" className="text-sm font-medium text-danger-700">
                {failure}
              </p>
            ) : null}
          </div>
        </Modal>
      </div>
    </>
  )
}
