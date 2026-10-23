import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import { formatCount } from '../../lib/format'
import { useBranchName } from '../../components/branch/useBranchName'
import { Button, RowsView, TableCheckbox } from '../../components/ui'
import { Pill } from '../ErpPage/ErpShell'
import { TBODY_ROW, THEAD_ROW, Td, Th } from '../ErpPage/overview/idiom'
import {
  PEOPLE_PATH,
  USERS_PERMISSION,
  displayName,
  loadPeople,
  type UserPage,
} from '../../api/settings/people'
import {
  BRANCHES_OVERVIEW_PATH,
  loadBranchOverview,
  type BranchOverviewDto,
} from '../../api/settings/branches'
import type {
  PlanChangePlacesDto,
  PlanChangePreviewDto,
  SwitchOffChoice,
} from '../../api/settings/planChanges'

/** The branches overview, the only read that says which branch is the Head Branch. */
const BRANCH_MANAGE = 'branch.manage'

/** An Administrator holds the live ADMIN role (`JdbcDowngradeSwitchOffAdapter`). */
const ADMIN_ROLE = 'ADMIN'

export type SwitchOffPick = {
  /** The choice the shown preview was made with. */
  choice: SwitchOffChoice
  /** A new choice for one kind; the dialog asks the server for the preview again with it. */
  onChoose: (next: SwitchOffChoice) => void
  /** A preview is being read: no ticking until the server has answered. */
  busy: boolean
}

type Row = { id: string; name: string; kept: 'OWNER' | 'ADMINISTRATOR' | 'HEAD_BRANCH' | null }

/**
 * US-4 and BR-5 under PC-7 (`choosesSwitchOff`): a whole period of a smaller plan bought while
 * unpaid, with more users or branches than it includes. Per user and branch the customer keeps it
 * (billed as a paid extra with the period, in the charge above) or switches it off as the period
 * starts. The rows and their columns are the "What switches off" screen's
 * (`DowngradeSwitchOffPage`). Every tick and every "Switches off" is the server's answer for the
 * choice sent (`defaultSwitchOff`), never worked out here; the owner, administrators and the Head
 * Branch cannot be ticked. With no choice the default applies, and the dialog says so.
 */
export function SwitchOffPicker({
  preview,
  plan,
  date,
  pick,
}: {
  preview: PlanChangePreviewDto
  plan: string
  date: string
  pick: SwitchOffPick
}) {
  const { t } = useTranslation()
  const usersOver = (preview.users?.overBy ?? 0) > 0
  const branchesOver = (preview.branches?.overBy ?? 0) > 0
  const chosen = pick.choice.userIds !== null || pick.choice.branchIds !== null
  return (
    <div className="flex flex-col gap-3">
      {usersOver && preview.users ? (
        <UsersChoice
          places={preview.users}
          plan={plan}
          date={date}
          pick={pick}
          choose={(ids) => pick.onChoose({ ...pick.choice, userIds: ids })}
        />
      ) : null}
      {branchesOver && preview.branches ? (
        <BranchesChoice
          places={preview.branches}
          plan={plan}
          date={date}
          pick={pick}
          choose={(ids) => pick.onChoose({ ...pick.choice, branchIds: ids })}
        />
      ) : null}
      {chosen ? (
        <div>
          <Button
            variant="ghost"
            size="md"
            disabled={pick.busy}
            onClick={() => pick.onChoose({ userIds: null, branchIds: null })}
          >
            {t('subscription.switchOff.useDefault')}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">{t('planChange.switchOff.defaultApplies')}</p>
      )}
    </div>
  )
}

function UsersChoice({
  places,
  plan,
  date,
  pick,
  choose,
}: {
  places: PlanChangePlacesDto
  plan: string
  date: string
  pick: SwitchOffPick
  choose: (ids: string[]) => void
}) {
  // Names come from the team list, which needs its own permission; without it the sentence stands.
  const mayReadPeople = useCan(USERS_PERMISSION)
  const people = useApiRead<UserPage>(mayReadPeople ? PEOPLE_PATH : null, loadPeople).read
  const rows: Row[] | null =
    people.status === 'ready'
      ? people.data.content
          .filter((user) => user.enabled && !user.deactivatedAt)
          .map((user) => ({
            id: user.id,
            name: displayName(user),
            kept:
              user.owner === true
                ? 'OWNER'
                : (user.roles ?? []).includes(ADMIN_ROLE)
                  ? 'ADMINISTRATOR'
                  : null,
          }))
      : null
  return (
    <Choice
      kind="users"
      places={places}
      plan={plan}
      date={date}
      rows={rows}
      pick={pick}
      choose={choose}
    />
  )
}

function BranchesChoice({
  places,
  plan,
  date,
  pick,
  choose,
}: {
  places: PlanChangePlacesDto
  plan: string
  date: string
  pick: SwitchOffPick
  choose: (ids: string[]) => void
}) {
  const mayReadBranches = useCan(BRANCH_MANAGE)
  const branchName = useBranchName()
  const overview = useApiRead<BranchOverviewDto>(
    mayReadBranches ? BRANCHES_OVERVIEW_PATH : null,
    () => loadBranchOverview(),
  ).read
  const rows: Row[] | null =
    overview.status === 'ready' && Array.isArray(overview.data.branches)
      ? overview.data.branches
          .filter((branch) => branch.active && !branch.closedOn)
          .map((branch) => ({
            id: branch.id,
            name: branchName.label(branch),
            kept: branch.headBranch === true ? 'HEAD_BRANCH' : null,
          }))
      : null
  return (
    <Choice
      kind="branches"
      places={places}
      plan={plan}
      date={date}
      rows={rows}
      pick={pick}
      choose={choose}
    />
  )
}

function Choice({
  kind,
  places,
  plan,
  date,
  rows,
  pick,
  choose,
}: {
  kind: 'users' | 'branches'
  places: PlanChangePlacesDto
  plan: string
  date: string
  rows: Row[] | null
  pick: SwitchOffPick
  choose: (ids: string[]) => void
}) {
  const { t, i18n } = useTranslation()
  const n = (value: number) => formatCount(value, i18n.language)
  // The server's answer for the choice sent: who switches off; the rest above the plan are extras.
  const off = places.defaultSwitchOff
  const full = off.length >= places.overBy
  return (
    <div className="flex flex-col gap-2">
      <p>
        {t(`planChange.switchOff.${kind}`, {
          count: places.overBy,
          plan,
          included: n(places.included ?? 0),
          inUse: n(places.inUse),
          n: n(places.overBy),
          date,
        })}
      </p>
      {rows ? (
        <RowsView>
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr className={THEAD_ROW}>
                <Th first>{t('subscription.switchOff.col.switchOff')}</Th>
                <Th>
                  {t(
                    kind === 'users'
                      ? 'subscription.switchOff.col.user'
                      : 'subscription.switchOff.col.branch',
                  )}
                </Th>
                <Th>{t('subscription.switchOff.col.onDate', { date })}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const ticked = off.includes(row.id)
                return (
                  <tr key={row.id} className={TBODY_ROW}>
                    <Td first>
                      {row.kept === null ? (
                        <TableCheckbox
                          checked={ticked}
                          disabled={pick.busy || (!ticked && full)}
                          ariaLabel={t(
                            kind === 'users'
                              ? 'subscription.switchOff.chooseUser'
                              : 'subscription.switchOff.chooseBranch',
                            { name: row.name },
                          )}
                          onChange={() => choose(toggle(off, row.id))}
                        />
                      ) : null}
                    </Td>
                    <Td>
                      <p className="text-sm font-semibold text-text-primary">{row.name}</p>
                    </Td>
                    <Td>
                      {row.kept !== null ? (
                        <Pill tone="neutral" label={t(`subscription.switchOff.kept.${row.kept}`)} />
                      ) : ticked ? (
                        <Pill tone="pending" label={t('subscription.switchOff.switchesOff')} />
                      ) : (
                        <Pill tone="success" label={t('subscription.switchOff.staysOn')} />
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </RowsView>
      ) : null}
    </div>
  )
}

function toggle(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]
}
