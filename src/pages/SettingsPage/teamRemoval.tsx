import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Button, Modal } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { useRemovalFailureText } from '../../lib/removalRefusals'
import { displayName, type CompanyUser } from '../../api/settings/people'
import {
  scheduleUserRemoval,
  switchOffUserNow,
  switchUserBackOn,
  waitingFor,
  withdrawUserRemoval,
  type ScheduledRemovalsDto,
} from '../../api/settings/removals'
import { SMALL_BUTTON } from '../ErpPage/overview/idiom'
import { TD, TH } from './peopleView'
import removeIcon from '../../assets/settings/menu-remove.svg'
import closeIcon from '../../assets/settings/menu-close.svg'
import peopleIcon from '../../assets/settings/menu-people.svg'

type Mode = 'atRenewal' | 'now'

/**
 * One person's switch-off actions on Team members (Business Rules US-2, US-3, LG-2): remove at
 * the renewal (or keep them, while that waits) and switch off now. Never offered on the Owner or
 * on the caller's own row; the server refuses both anyway (OW-1, own-account-refused).
 */
export function PersonActions({
  person,
  removals,
  onDone,
}: {
  person: CompanyUser
  removals: ScheduledRemovalsDto | null
  onDone: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const failureText = useRemovalFailureText()
  const [mode, setMode] = useState<Mode | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const waiting = waitingFor(removals, person.id)
  const name = displayName(person)

  const close = () => {
    setMode(null)
    setFailure(null)
  }

  const run = async (work: () => Promise<string>) => {
    setBusy(true)
    setFailure(null)
    try {
      const message = await work()
      setMode(null)
      onDone(message)
    } catch (error) {
      setFailure(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  const confirm = () =>
    run(async () => {
      if (mode === 'now') {
        await switchOffUserNow(person.id)
        return t('removal.user.switchedOff', { name })
      }
      const removal = await scheduleUserRemoval(person.id)
      return removal.status === 'SCHEDULED'
        ? t('removal.user.scheduled', {
            name,
            date: formatDate(removal.effectiveOn, i18n.language),
          })
        : t('removal.user.switchedOff', { name })
    })

  const items = [
    waiting
      ? {
          id: 'keep',
          labelKey: 'removal.menu.keep',
          icon: peopleIcon,
          onSelect: () =>
            void run(async () => {
              await withdrawUserRemoval(person.id)
              return t('removal.user.kept', { name })
            }),
        }
      : removals?.open
        ? {
            id: 'atRenewal',
            labelKey: 'removal.menu.atRenewal',
            icon: removeIcon,
            onSelect: () => setMode('atRenewal'),
          }
        : null,
    {
      id: 'now',
      labelKey: 'removal.menu.now',
      icon: closeIcon,
      danger: true,
      onSelect: () => setMode('now'),
    },
  ].filter((item) => item !== null)

  const renewsOn = removals?.renewsOn ?? null
  return (
    <>
      <ActionMenu label={t('removal.actionsFor', { name })} items={items} floating />
      {failure && mode === null ? (
        <p role="alert" className="mt-1 text-start text-xs font-medium text-danger-700">
          {failure}
        </p>
      ) : null}
      <Modal
        open={mode !== null}
        onClose={close}
        title={
          mode === 'now'
            ? t('removal.user.nowTitle', { name })
            : t('removal.user.atRenewalTitle', { name })
        }
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" size="md" onClick={close}>
              {t('removal.cancel')}
            </Button>
            <Button size="md" disabled={busy} onClick={() => void confirm()}>
              {busy
                ? t('removal.saving')
                : mode === 'now'
                  ? t('removal.user.nowConfirm')
                  : t('removal.user.atRenewalConfirm')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {mode === 'now'
              ? t('removal.user.nowBody', { name })
              : renewsOn
                ? t('removal.user.atRenewalBody', {
                    name,
                    date: formatDate(renewsOn, i18n.language),
                  })
                : t('removal.user.atOnceBody', { name })}
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
