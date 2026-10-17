import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { useApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import { usePlanName } from '../../hooks/usePlanName'
import { formatDate } from '../../lib/format'
import { ApiError } from '../../api'
import {
  Notice,
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { RowsView, TableCheckbox } from '../../components/ui'
import { Pill } from '../ErpPage/ErpShell'
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SectionCard,
  TBODY_ROW,
  THEAD_ROW,
  Td,
  Th,
} from '../ErpPage/overview/idiom'
import {
  DOWNGRADE_CHOICE_NOT_ALLOWED,
  SUBSCRIPTION_PATH,
  SWITCH_OFF_PATH,
  loadSubscription,
  loadSwitchOff,
  saveSwitchOffChoice,
  type DowngradeSwitchOffDto,
  type SubscriptionStatusDto,
} from '../../api/settings/subscription'
import {
  PEOPLE_PATH,
  USERS_PERMISSION,
  displayName,
  loadPeople,
  type UserPage,
} from '../../api/settings/people'

/** Reading and recording the choice are both `tenant.plan.manage` on the server. */
const PLAN_MANAGE = 'tenant.plan.manage'

/**
 * Settings › Plan › What switches off: the customer's choice of which users and branches go off
 * when a downgrade waiting for renewal applies (Business Rules BR-5 and US-4), from
 * `GET/PUT /v1/settings/subscription/scheduled-change/switch-off`. No Figma frame: built in the
 * house standard from Plan and usage and Branches.
 *
 * The server keeps the rule: the chosen go first, then the most recently added, and only as many
 * as the new plan requires; the owner, administrators and the Head Branch always stay. So the
 * screen lets the customer tick at most that many, and every "switches off" mark is the server's
 * own answer, never worked out here.
 */
export function DowngradeSwitchOffPage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="billing" back={{ to: '/settings/plan', label: t('plan.title') }}>
      <SettingsHeader
        title={t('subscription.switchOff.title')}
        subtitle={t('subscription.switchOff.subtitle')}
      />
      <SwitchOffBody />
    </SettingsShell>
  )
}

/** Inside the shell, which is what provides the session the permission is read from. */
function SwitchOffBody() {
  const mayManage = useCan(PLAN_MANAGE)
  if (!mayManage) return <PermissionDeniedNotice />
  return <SwitchOffChoice />
}

function SwitchOffChoice() {
  const { t } = useTranslation()
  const read = useApiRead<DowngradeSwitchOffDto>(SWITCH_OFF_PATH, loadSwitchOff)
  const [latest, setLatest] = useState<DowngradeSwitchOffDto | null>(null)

  if (read.read.status === 'loading') return <LoadingNotice />
  if (read.read.status === 'failed') {
    const error = read.read.error
    if (error instanceof ApiError && error.problemType === DOWNGRADE_CHOICE_NOT_ALLOWED) {
      return (
        <Notice
          body={t('subscription.switchOff.noneWaiting')}
          action={{ label: t('subscription.switchOff.backToPlan'), to: '/settings/plan' }}
        />
      )
    }
    return <ApiReadFailure error={error} retry={read.retry} />
  }
  const view = latest ?? read.read.data
  // A fresh form whenever the server answers, so the ticks always start from what it recorded.
  return <ChoiceForm key={`${view.choiceRecordedAt ?? 'none'}`} view={view} onSaved={setLatest} />
}

function ChoiceForm({
  view,
  onSaved,
}: {
  view: DowngradeSwitchOffDto
  onSaved: (view: DowngradeSwitchOffDto) => void
}) {
  const { t, i18n } = useTranslation()
  const planName = usePlanName()
  const date = (iso: string) => formatDate(iso.slice(0, 10), i18n.language)
  // The view names the plan by code only; the status the Plan page already read has its English
  // name, and an Arabic reader gets the catalogue's Arabic name by the same code.
  const status = useApiRead<SubscriptionStatusDto>(SUBSCRIPTION_PATH, loadSubscription).read
  const waiting = status.status === 'ready' ? status.data.scheduledChange : null
  const plan = planName(
    view.planCode,
    waiting?.planCode === view.planCode ? waiting.planName : view.planCode,
  )
  const on = date(view.effectiveOn)

  const [users, setUsers] = useState(() =>
    view.users.filter((row) => row.chosen).map((row) => row.userId),
  )
  const [branches, setBranches] = useState(() =>
    view.branches.filter((row) => row.chosen).map((row) => row.branchId),
  )
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const userExcess = Math.max(0, view.activeUsers - view.peopleIncluded)
  const branchExcess =
    view.branchesIncluded === null ? 0 : Math.max(0, view.openBranches - view.branchesIncluded)
  const recordedUsers = view.users.filter((row) => row.chosen).map((row) => row.userId)
  const recordedBranches = view.branches.filter((row) => row.chosen).map((row) => row.branchId)
  const changed = !sameSet(users, recordedUsers) || !sameSet(branches, recordedBranches)

  const save = async (userIds: string[], branchIds: string[]) => {
    setSaving(true)
    setFailure(null)
    try {
      onSaved(await saveSwitchOffChoice(userIds, branchIds))
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.problemType === DOWNGRADE_CHOICE_NOT_ALLOWED
          ? 'subscription.switchOff.notAllowed'
          : 'subscription.actionFailed',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <SectionCard
        title={t('subscription.switchOff.summaryTitle', { plan })}
        note={t('subscription.switchOff.summaryNote', { date: on })}
      >
        <div className="flex flex-col gap-5 p-5 pt-0">
          <dl className="grid gap-5 md:grid-cols-2">
            <Fact
              label={t('subscription.switchOff.usersFact')}
              value={t('subscription.switchOff.ofIncluded', {
                active: view.activeUsers,
                included: view.peopleIncluded,
              })}
            />
            <Fact
              label={t('subscription.switchOff.branchesFact')}
              value={
                view.branchesIncluded === null
                  ? t('subscription.switchOff.noBranchLimit', { open: view.openBranches })
                  : t('subscription.switchOff.ofIncluded', {
                      active: view.openBranches,
                      included: view.branchesIncluded,
                    })
              }
            />
          </dl>
          <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium leading-[1.6] text-text-secondary">
            {t('subscription.switchOff.howItWorks', { date: on })}
          </p>
        </div>
      </SectionCard>

      <UsersCard
        view={view}
        chosen={users}
        setChosen={setUsers}
        excess={userExcess}
        on={on}
        date={date}
      />
      <BranchesCard
        view={view}
        chosen={branches}
        setChosen={setBranches}
        excess={branchExcess}
        on={on}
        date={date}
      />

      {userExcess > 0 || branchExcess > 0 || view.choiceRecordedAt ? (
        <div className="flex flex-col gap-3">
          {view.choiceRecordedAt && !changed ? (
            <p role="status" className="text-sm font-medium text-text-tertiary">
              {t('subscription.switchOff.recordedOn', { date: date(view.choiceRecordedAt) })}
            </p>
          ) : null}
          {changed ? (
            <p role="status" className="text-sm font-medium text-text-tertiary">
              {t('subscription.switchOff.unsaved')}
            </p>
          ) : null}
          {failure ? (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {t(failure)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={saving || !changed}
              onClick={() => save(users, branches)}
            >
              {t('subscription.switchOff.save')}
            </button>
            {view.choiceRecordedAt ? (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={saving}
                onClick={() => save([], [])}
              >
                {t('subscription.switchOff.useDefault')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

function UsersCard({
  view,
  chosen,
  setChosen,
  excess,
  on,
  date,
}: {
  view: DowngradeSwitchOffDto
  chosen: string[]
  setChosen: (ids: string[]) => void
  excess: number
  on: string
  date: (iso: string) => string
}) {
  const { t } = useTranslation()
  // Names come from the team list, which needs its own permission; without it a row reads by the
  // day the person was added, never by a raw id.
  const mayReadPeople = useCan(USERS_PERMISSION)
  const people = useApiRead<UserPage>(mayReadPeople ? PEOPLE_PATH : null, loadPeople).read
  const person = (id: string) =>
    people.status === 'ready' ? people.data.content.find((user) => user.id === id) : undefined

  return (
    <SectionCard
      title={t('subscription.switchOff.usersTitle')}
      note={
        excess > 0
          ? t('subscription.switchOff.usersChoose', { count: excess, date: on })
          : t('subscription.switchOff.usersAllStay')
      }
    >
      <RowsView>
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('subscription.switchOff.col.switchOff')}</Th>
              <Th>{t('subscription.switchOff.col.user')}</Th>
              <Th>{t('subscription.switchOff.col.added')}</Th>
              <Th>{t('subscription.switchOff.col.onDate', { date: on })}</Th>
            </tr>
          </thead>
          <tbody>
            {view.users.map((row) => {
              const user = person(row.userId)
              const name = user
                ? displayName(user)
                : t('subscription.switchOff.userAdded', { date: date(row.addedAt) })
              const ticked = chosen.includes(row.userId)
              const full = !ticked && chosen.length >= excess
              return (
                <tr key={row.userId} className={TBODY_ROW}>
                  <Td first>
                    {row.candidate ? (
                      <TableCheckbox
                        checked={ticked}
                        disabled={full}
                        ariaLabel={t('subscription.switchOff.chooseUser', { name })}
                        onChange={() => setChosen(toggle(chosen, row.userId))}
                      />
                    ) : null}
                  </Td>
                  <Td>
                    <p className="text-sm font-semibold text-text-primary">{name}</p>
                    {user ? (
                      <p
                        dir="ltr"
                        className="text-xs font-medium text-text-quaternary rtl:text-end"
                      >
                        {user.email}
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    <span className="text-sm font-medium text-text-secondary">
                      {date(row.addedAt)}
                    </span>
                  </Td>
                  <Td>
                    <Outcome kept={row.kept} switchesOff={row.switchesOff} />
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </RowsView>
    </SectionCard>
  )
}

function BranchesCard({
  view,
  chosen,
  setChosen,
  excess,
  on,
  date,
}: {
  view: DowngradeSwitchOffDto
  chosen: string[]
  setChosen: (ids: string[]) => void
  excess: number
  on: string
  date: (iso: string) => string
}) {
  const { t } = useTranslation()
  return (
    <SectionCard
      title={t('subscription.switchOff.branchesTitle')}
      note={
        view.branchesIncluded === null
          ? t('subscription.switchOff.branchesUnlimited')
          : excess > 0
            ? t('subscription.switchOff.branchesChoose', { count: excess, date: on })
            : t('subscription.switchOff.branchesAllStay')
      }
    >
      <RowsView>
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('subscription.switchOff.col.switchOff')}</Th>
              <Th>{t('subscription.switchOff.col.branch')}</Th>
              <Th>{t('subscription.switchOff.col.added')}</Th>
              <Th>{t('subscription.switchOff.col.onDate', { date: on })}</Th>
            </tr>
          </thead>
          <tbody>
            {view.branches.map((row) => {
              const ticked = chosen.includes(row.branchId)
              const full = !ticked && chosen.length >= excess
              return (
                <tr key={row.branchId} className={TBODY_ROW}>
                  <Td first>
                    {row.candidate ? (
                      <TableCheckbox
                        checked={ticked}
                        disabled={full}
                        ariaLabel={t('subscription.switchOff.chooseBranch', { name: row.name })}
                        onChange={() => setChosen(toggle(chosen, row.branchId))}
                      />
                    ) : null}
                  </Td>
                  <Td>
                    <p className="text-sm font-semibold text-text-primary">{row.name}</p>
                  </Td>
                  <Td>
                    <span className="text-sm font-medium text-text-secondary">
                      {date(row.addedAt)}
                    </span>
                  </Td>
                  <Td>
                    <Outcome kept={row.kept} switchesOff={row.switchesOff} />
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </RowsView>
    </SectionCard>
  )
}

/** The server's answer for one row, in words: why it always stays, or what the renewal does. */
function Outcome({ kept, switchesOff }: { kept: string | null; switchesOff: boolean }) {
  const { t } = useTranslation()
  if (kept === 'OWNER' || kept === 'ADMINISTRATOR' || kept === 'HEAD_BRANCH') {
    return <Pill tone="neutral" label={t(`subscription.switchOff.kept.${kept}`)} />
  }
  if (kept) return <Pill tone="neutral" label={t('subscription.switchOff.kept.other')} />
  return switchesOff ? (
    <Pill tone="pending" label={t('subscription.switchOff.switchesOff')} />
  ) : (
    <Pill tone="success" label={t('subscription.switchOff.staysOn')} />
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm font-medium text-text-quaternary">{label}</dt>
      <dd className="text-base font-semibold text-text-primary">{value}</dd>
    </div>
  )
}

function toggle(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}
