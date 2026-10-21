import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionMenu, Button, Modal, Select } from '../../components/ui'
import { LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import { formatInstantDay } from '../../lib/format'
import { placeSentence, useRemovalFailureText } from '../../lib/removalRefusals'
import {
  ADMIN_ROLE,
  ROLES_PATH,
  ROLES_PERMISSION,
  displayName,
  isJobRole,
  loadRoles,
  type CompanyUser,
  type RoleDto,
} from '../../api/settings/people'
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
      {/* The menu's cell is end-aligned; the dialog's text reads from the start (EN left, AR right). */}
      <div className="text-start">
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
            <p className="text-sm font-medium leading-[1.6] text-text-secondary">
              {t('removal.user.records')}
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

/**
 * Team members' "Switched off" tab: the people switched off (`GET /v1/users?status=DEACTIVATED`),
 * each with when and by whom, and "Switch back on". Back on, a person takes a place on the plan like
 * a new one (US-1), with the role the Administrator picks; their old role is preselected.
 */
export function SwitchedOffTable({
  people,
  onDone,
}: {
  people: CompanyUser[]
  onDone: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [choosing, setChoosing] = useState<CompanyUser | null>(null)

  const switchedOffLine = (person: CompanyUser): string | null => {
    // TODO(backend): SETTINGS.md row 6.5. Drawn only once the server says when, and by whom.
    if (!person.deactivatedAt) return null
    const date = formatInstantDay(person.deactivatedAt, i18n.language)
    return person.deactivatedByName
      ? t('removal.user.offOnBy', { date, name: person.deactivatedByName })
      : t('removal.user.offOn', { date })
  }

  return (
    <div className="relative overflow-x-auto">
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
          {people.map((person) => {
            const line = switchedOffLine(person)
            return (
              <tr key={person.id} className="border-b border-surface-background last:border-0">
                <td className={TD}>
                  <span className="font-semibold">{displayName(person)}</span>
                  <span className="block text-text-tertiary">{person.email}</span>
                  {line ? <span className="block text-xs text-text-tertiary">{line}</span> : null}
                </td>
                <td className={`${TD} text-end`}>
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    onClick={() => setChoosing(person)}
                  >
                    {t('removal.menu.backOn')}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {choosing ? (
        <div className="text-start">
          <BackOnDialog
            key={choosing.id}
            person={choosing}
            onClose={() => setChoosing(null)}
            onDone={(message) => {
              setChoosing(null)
              onDone(message)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

/**
 * "Switch back on" asks for the role (RL-1: one job role), with the person's old role preselected.
 * The roles are read with `role.list`; without it the person comes back with the server's default.
 */
function BackOnDialog({
  person,
  onClose,
  onDone,
}: {
  person: CompanyUser
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { t } = useTranslation()
  const failureText = useRemovalFailureText()
  const mayListRoles = useCan(ROLES_PERMISSION)
  const roles = useApiRead<RoleDto[]>(mayListRoles ? ROLES_PATH : null, loadRoles).read
  const jobRoles =
    roles.status === 'ready' ? roles.data.filter((role) => role.enabled && isJobRole(role)) : []
  // The role they held when switched off (TODO(backend): SETTINGS.md row 6.5), else any they still show.
  const held = (person.previousRoles?.length ? person.previousRoles : person.roles).filter((code) =>
    jobRoles.some((role) => role.code === code),
  )
  const oldRole = held.includes(ADMIN_ROLE) ? ADMIN_ROLE : (held[0] ?? '')
  const [picked, setPicked] = useState<string | null>(null)
  const choice = picked ?? oldRole
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const name = displayName(person)
  const chosenRole = jobRoles.find((role) => role.code === choice)

  const confirm = async () => {
    setBusy(true)
    setFailure(null)
    try {
      const back = await switchUserBackOn(person.id, chosenRole?.id)
      // Worded from the answer: a server that does not take the role yet brings them back without one.
      const role = back.roles?.length
        ? (jobRoles.find((entry) => back.roles.includes(entry.code))?.name ?? null)
        : null
      onDone(role ? t('removal.user.backOnAs', { name, role }) : t('removal.user.backOn', { name }))
    } catch (error) {
      setFailure(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('removal.user.backOnTitle', { name })}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" size="md" onClick={onClose}>
            {t('removal.cancel')}
          </Button>
          <Button
            size="md"
            disabled={busy || (jobRoles.length > 0 && !chosenRole)}
            onClick={() => void confirm()}
          >
            {busy ? t('removal.saving') : t('removal.menu.backOn')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {t('removal.user.backOnBody', { name })}
        </p>
        {mayListRoles && roles.status === 'loading' ? <LoadingNotice /> : null}
        {jobRoles.length ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-text-primary">
              {t('removal.user.backOnRole')}
            </span>
            <Select
              value={choice}
              onChange={(value) => {
                setPicked(value)
                setFailure(null)
              }}
              options={jobRoles.map((role) => ({ value: role.code, label: role.name }))}
              placeholder={t('branchAccess.person.pickRole')}
              ariaLabel={t('removal.user.backOnRole')}
            />
          </div>
        ) : roles.status !== 'loading' || !mayListRoles ? (
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('removal.user.backOnNoRoles', { name })}
          </p>
        ) : null}
        {failure ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {failure}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
