import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Button, Modal } from '../../components/ui'
import { placeSentence, useRemovalFailureText } from '../../lib/removalRefusals'
import { displayName, type CompanyUser } from '../../api/settings/people'
import { switchOffUserNow, switchUserBackOn } from '../../api/settings/removals'
import { SMALL_BUTTON } from '../ErpPage/overview/idiom'
import { TD, TH } from './peopleView'
import closeIcon from '../../assets/settings/menu-close.svg'

/**
 * One person's switch-off on Team members (Business Rules US-2, US-3, LG-2): access ends now, the
 * name stays on their records, and the paid place stays until the renewal. Never offered on the
 * Owner or on the caller's own row; the server refuses both anyway (OW-1, own-account-refused).
 */
export function PersonActions({
  person,
  renewsOn,
  onDone,
}: {
  person: CompanyUser
  renewsOn: string | null
  onDone: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const failureText = useRemovalFailureText()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const name = displayName(person)

  const close = () => {
    setConfirming(false)
    setFailure(null)
  }

  const confirm = async () => {
    setBusy(true)
    setFailure(null)
    try {
      await switchOffUserNow(person.id)
      setConfirming(false)
      onDone(placeSentence(t, 'removal.user', 'done', renewsOn, i18n.language, name))
    } catch (error) {
      setFailure(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ActionMenu
        label={t('removal.actionsFor', { name })}
        floating
        items={[
          {
            id: 'switchOff',
            labelKey: 'removal.menu.switchOff',
            icon: closeIcon,
            danger: true,
            onSelect: () => setConfirming(true),
          },
        ]}
      />
      <Modal
        open={confirming}
        onClose={close}
        title={t('removal.user.title', { name })}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" size="md" onClick={close}>
              {t('removal.cancel')}
            </Button>
            <Button size="md" disabled={busy} onClick={() => void confirm()}>
              {busy ? t('removal.saving') : t('removal.user.confirm')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {t('removal.user.body', { name })}
          </p>
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {placeSentence(t, 'removal.user', 'place', renewsOn, i18n.language, name)}
          </p>
          {failure ? (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {failure}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  )
}

/**
 * Team members' "Removed" tab: the people switched off (`GET /v1/users?status=DEACTIVATED`), each
 * with "Switch back on". Back on, a person takes a place on the plan like a new one (US-1) and
 * comes back with no role.
 */
export function SwitchedOffTable({
  people,
  onDone,
}: {
  people: CompanyUser[]
  onDone: (message: string) => void
}) {
  const { t } = useTranslation()
  const failureText = useRemovalFailureText()
  const [busy, setBusy] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ id: string; text: string } | null>(null)

  const backOn = async (person: CompanyUser) => {
    setBusy(person.id)
    setFailure(null)
    try {
      await switchUserBackOn(person.id)
      onDone(t('removal.user.backOn', { name: displayName(person) }))
    } catch (error) {
      setFailure({ id: person.id, text: failureText(error) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <thead className="border-b border-border-subtle">
          <tr>
            <th className={TH}>{t('team.col.person')}</th>
            <th className={TH}>
              <span className="sr-only">{t('removal.user.backOnColumn')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} className="border-b border-surface-background last:border-0">
              <td className={TD}>
                <span className="font-semibold">{displayName(person)}</span>
                <span className="block text-text-tertiary">{person.email}</span>
                {failure?.id === person.id ? (
                  <span role="alert" className="mt-1 block text-xs font-medium text-danger-700">
                    {failure.text}
                  </span>
                ) : null}
              </td>
              <td className={`${TD} text-end`}>
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  disabled={busy !== null}
                  onClick={() => void backOn(person)}
                >
                  {busy === person.id ? t('removal.saving') : t('removal.menu.backOn')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
