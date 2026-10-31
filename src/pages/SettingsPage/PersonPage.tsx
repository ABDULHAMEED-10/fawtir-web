import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { useApiRead } from '../../hooks'
import { useCan, useSession } from '../../lib/session/session'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import { useBranchAccessOn } from '../../lib/identity/branchAccessSwitch'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { Button, Input, Modal, Select } from '../../components/ui'
import { SectionCard, SMALL_BUTTON } from '../ErpPage/overview/idiom'
import {
  ADMIN_ROLE,
  PEOPLE_PATH,
  ROLES_PATH,
  ROLES_PERMISSION,
  USERS_PERMISSION,
  displayName,
  isJobRole,
  loadPeople,
  loadRoles,
  roleKind,
  type CompanyUser,
  type RoleDto,
  type UserPage,
} from '../../api/settings/people'
import {
  BRANCH_ADMINISTRATOR_GRANT,
  PERMISSION_CATALOGUE_PATH,
  handOverOwnership,
  isReservedPermission,
  loadPermissionCatalogue,
  loadPerson,
  loadPersonPermissions,
  personPath,
  personPermissionsPath,
  replaceRole,
  savePersonBranches,
  savePersonPermissions,
  type PermissionEntryDto,
  type PersonGrant,
  type PersonPermissionsDto,
} from '../../api/settings/branchAccess'
import { describeApiFailure } from '../../lib/apiFailure'
import { branchAccessRefusalKey } from '../../lib/branchAccessRefusals'
import { permissionWords } from '../../lib/permissionLabels'
import { roleLabel } from '../../lib/roleLabels'
import { OwnerPill } from './people'
import { seesEveryBranch, useBranchNames, useManagesPeople, useRoleNames } from './peopleView'
import { typedOneOfCompanyNames } from '../../lib/typedCompanyName'

/**
 * Settings › Team members › one person (Business Rules BA-1, OW-1, OW-4, RL-1, RL-2, RL-3, LG-3).
 * No Figma frame: built to the house standard (handbook 3.3) from Team members (header, cards) and
 * the role permission groups, with the Settings idiom's section cards and buttons only.
 *
 * - **Role:** the person's one role (RL-1), changed by the Administrator (`admin.roles.manage`).
 * - **Branches:** where the person works (BA-1). The Owner and Administrators see every branch
 *   (BA-2), so they have nothing to choose.
 * - **Permissions:** the role's permissions plus what is given to this person and minus what is
 *   taken away (RL-3): one tick per permission, ticked when they have it. Approval and view only
 *   are set here as the person's own permissions (RL-2). Codes only the Administrator holds are
 *   never offered (RL-5); a branch administrator can give only what they hold themselves (LG-3).
 * - **Owner:** read-only. Only the Owner sees "Hand over ownership" (OW-4).
 *
 * The role, the permissions and the handover are not branch access: the server serves them with
 * the switch off too (`UserPermissionsController`, `CompanyOwnerController`), so the page is
 * always reachable. Only what names branches waits for it (`useBranchAccessOn`): the Branches card,
 * the branches asked for when someone leaves Administrator, and the branch administrator grant.
 *
 * Every refusal is the server's decision, shown in our own words.
 */
export function PersonPage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="people" back={{ to: '/settings/team', label: t('team.title') }}>
      <Gate />
    </SettingsShell>
  )
}

function Gate() {
  const { t } = useTranslation()
  const mayManage = useManagesPeople()
  const subtitle = useSubtitle()
  if (!mayManage) {
    return (
      <>
        <SettingsHeader title={t('branchAccess.person.title')} subtitle={subtitle} />
        <PermissionDeniedNotice />
      </>
    )
  }
  return <Person />
}

/** "Their role, branches and permissions", without branches while branch access is off. */
function useSubtitle(): string {
  const { t } = useTranslation()
  return useBranchAccessOn()
    ? t('branchAccess.person.subtitle')
    : t('branchAccess.person.subtitleNoBranches')
}

function Person() {
  const { t } = useTranslation()
  const subtitle = useSubtitle()
  const branchAccessOn = useBranchAccessOn()
  const { userId = '' } = useParams()
  const person = useApiRead<CompanyUser>(personPath(userId), () => loadPerson(userId))
  const [saved, setSaved] = useState<string | null>(null)

  if (person.read.status === 'loading') {
    return (
      <>
        <SettingsHeader title={t('branchAccess.person.title')} subtitle={subtitle} />
        <LoadingNotice />
      </>
    )
  }
  if (person.read.status === 'failed') {
    return (
      <>
        <SettingsHeader title={t('branchAccess.person.title')} subtitle={subtitle} />
        <ApiReadFailure error={person.read.error} retry={person.retry} notFoundOn400 />
      </>
    )
  }
  const who = person.read.data
  const done = (message: string) => {
    setSaved(message)
    person.retry()
  }
  return (
    <>
      <SettingsHeader title={displayName(who)} subtitle={who.email} />
      {saved ? (
        <Notice body={saved} action={{ label: t('common.close'), onClick: () => setSaved(null) }} />
      ) : null}
      <RoleCard person={who} onSaved={() => done(t('branchAccess.person.roleSaved'))} />
      {branchAccessOn ? (
        <BranchesCard person={who} onSaved={() => done(t('branchAccess.person.branchesSaved'))} />
      ) : null}
      <PermissionsCard key={`${who.id}:${who.roles.join(',')}`} person={who} />
    </>
  )
}

/** A refusal in our words, else the general sentence for the failure. */
function useFailureText(): (error: unknown) => string {
  const { t } = useTranslation()
  return (error) => {
    const refusal = branchAccessRefusalKey(error)
    if (refusal) return t(refusal)
    const message = describeApiFailure(error)
    return t(message.key, message.values)
  }
}

function InlineFailure({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="text-sm font-medium text-danger-700">
      {text}
    </p>
  ) : null
}

/** The codes that are not a job role (RL-2): approval and view only, and the technical roles. */
const NOT_JOB_ROLES = new Set([
  'APPROVER',
  'VIEWER',
  'MOBILE_USER',
  'INTEGRATION',
  'PLATFORM_OPERATOR',
])

function RoleCard({ person, onSaved }: { person: CompanyUser; onSaved: () => void }) {
  const { t } = useTranslation()
  const session = useSession()
  const roleNames = useRoleNames()
  const mayListRoles = useCan(ROLES_PERMISSION)
  // Only the Administrator changes roles (RL-5); the Owner always stays an Administrator (OW-1).
  const mayChange = useCan('admin.roles.manage') && !person.owner
  const roles = useApiRead<RoleDto[]>(mayListRoles ? ROLES_PATH : null, loadRoles).read
  // Branches are asked for only once branch access is on: before that the server needs none
  // (`BranchAssignmentService.roleChanged`) and no branch is read.
  const branchAccessOn = useBranchAccessOn()
  const branchNames = useBranchNames(mayChange && branchAccessOn)
  const failureText = useFailureText()
  const roleList = roles.status === 'ready' ? roles.data : []
  const roleOf = (code: string) => roleList.find((entry) => entry.code === code)
  // A person from before one role per person (RL-1) may hold several: their job roles only, not
  // approval, view only or a technical role, which stay as they are when the role is replaced.
  const heldJobRoles = person.roles.filter((code) => {
    const known = roleOf(code)
    return known ? isJobRole(known) : !NOT_JOB_ROLES.has(code)
  })
  const current = heldJobRoles.includes(ADMIN_ROLE) ? ADMIN_ROLE : (heldJobRoles[0] ?? '')
  const [choice, setChoice] = useState(current)
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [handingOver, setHandingOver] = useState(false)
  const [confirmingSelf, setConfirmingSelf] = useState(false)
  const isMe = session?.userId === person.id
  const mayHandOver = person.owner === true && session?.isOwner === true && isMe

  const options = roleList
    .filter((role) => role.enabled && isJobRole(role))
    .map((role) => ({ value: role.code, label: roleLabel(role, t) }))

  // Approval and view only read as what the person may do, never as roles (RL-2).
  const heldName = (code: string) => {
    const known = roleOf(code)
    const kind = known ? roleKind(known) : NOT_JOB_ROLES.has(code) ? 'PERMISSION_SET' : 'ROLE'
    if (kind === 'PERMISSION_SET' && code === 'APPROVER') return t('branchAccess.invite.canApprove')
    if (kind === 'PERMISSION_SET' && code === 'VIEWER') return t('branchAccess.invite.viewOnly')
    return roleNames(code)
  }

  // Off Administrator, the person works only in branches (BA-1): name them in the same step, since
  // the server refuses a person with none (409 branch-required). One branch is ticked for them.
  const leavingAdministrator = current === ADMIN_ROLE && choice !== '' && choice !== ADMIN_ROLE
  const asksBranches = leavingAdministrator && branchAccessOn
  const branchChoices = branchNames.branches.filter((branch) => branch.active)
  const onlyBranch = branchChoices.length === 1 ? branchChoices[0].id : null
  const pickedBranchIds = onlyBranch ? [onlyBranch] : branchIds

  const save = async () => {
    if (!choice || choice === current) return
    if (asksBranches && pickedBranchIds.length === 0) {
      setFailure(t('branchAccess.refusal.branchRequired'))
      return
    }
    setSaving(true)
    setFailure(null)
    try {
      await replaceRole(person.id, choice, asksBranches ? pickedBranchIds : undefined)
      setConfirmingSelf(false)
      onSaved()
    } catch (error) {
      setConfirmingSelf(false)
      setFailure(failureText(error))
    } finally {
      setSaving(false)
    }
  }

  // An Administrator taking it away from themselves is asked first: they cannot undo it.
  const askOrSave = () => {
    if (isMe && leavingAdministrator) setConfirmingSelf(true)
    else void save()
  }

  return (
    <SectionCard
      title={t('branchAccess.person.roleTitle')}
      note={t('branchAccess.person.roleNote')}
      actions={
        mayHandOver ? (
          <button type="button" className={SMALL_BUTTON} onClick={() => setHandingOver(true)}>
            {t('branchAccess.handover.open')}
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5 p-5 pt-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
          {person.roles.length ? person.roles.map(heldName).join(', ') : t('people.noRole')}
          {person.owner ? <OwnerPill /> : null}
        </p>
        {person.owner ? (
          <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium text-text-tertiary">
            {t('branchAccess.person.ownerNote')}
          </p>
        ) : null}
        {mayChange && heldJobRoles.length > 1 ? (
          <p
            role="note"
            className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium text-text-secondary"
          >
            {t('branchAccess.person.severalRoles', {
              roles: heldJobRoles.map(roleNames).join(', '),
            })}
          </p>
        ) : null}
        {mayChange && mayListRoles && roles.status === 'loading' ? <LoadingNotice /> : null}
        {mayChange && options.length ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 md:max-w-[360px]">
              <Select
                value={choice}
                onChange={(value) => {
                  setChoice(value)
                  setFailure(null)
                }}
                options={options}
                placeholder={t('branchAccess.person.pickRole')}
                ariaLabel={t('branchAccess.person.roleTitle')}
              />
            </div>
            <button
              type="button"
              className={SMALL_BUTTON}
              disabled={saving || !choice || choice === current}
              onClick={askOrSave}
            >
              {saving ? t('branchAccess.saving') : t('branchAccess.person.changeRole')}
            </button>
          </div>
        ) : null}
        {asksBranches ? (
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-1 text-sm font-semibold text-text-primary">
              {t('branchAccess.person.roleBranches')}
            </legend>
            <p className="text-xs font-medium text-text-tertiary">
              {t('branchAccess.person.roleBranchesNote')}
            </p>
            {!branchNames.ready ? (
              <LoadingNotice />
            ) : branchChoices.length === 0 ? (
              <p className="text-sm font-medium text-text-tertiary">
                {t('branchAccess.invite.noBranches')}
              </p>
            ) : (
              branchChoices.map((branch) => (
                <label
                  key={branch.id}
                  className="flex cursor-pointer items-center gap-3 rounded-sm border border-border-subtle bg-white px-4 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-primary-25"
                >
                  <input
                    type="checkbox"
                    checked={pickedBranchIds.includes(branch.id)}
                    disabled={onlyBranch !== null}
                    onChange={(event) => {
                      setFailure(null)
                      setBranchIds((before) =>
                        event.target.checked
                          ? [...before, branch.id]
                          : before.filter((id) => id !== branch.id),
                      )
                    }}
                    className="size-[18px] shrink-0 accent-[#2c4eb7]"
                  />
                  <span className="min-w-0 flex-1">{branch.name}</span>
                </label>
              ))
            )}
          </fieldset>
        ) : null}
        <InlineFailure text={failure} />
      </div>
      {mayHandOver ? (
        <HandoverDialog
          open={handingOver}
          onClose={() => setHandingOver(false)}
          ownerId={person.id}
        />
      ) : null}
      <Modal
        open={confirmingSelf}
        onClose={() => setConfirmingSelf(false)}
        title={t('branchAccess.person.demoteSelf.title')}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" size="md" onClick={() => setConfirmingSelf(false)}>
              {t('branchAccess.handover.cancel')}
            </Button>
            <Button size="md" disabled={saving} onClick={() => void save()}>
              {saving ? t('branchAccess.saving') : t('branchAccess.person.demoteSelf.confirm')}
            </Button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {t('branchAccess.person.demoteSelf.body', {
            role: options.find((option) => option.value === choice)?.label ?? '',
          })}
        </p>
      </Modal>
    </SectionCard>
  )
}

function BranchesCard({ person, onSaved }: { person: CompanyUser; onSaved: () => void }) {
  const { t } = useTranslation()
  const session = useSession()
  const branchNames = useBranchNames()
  const failureText = useFailureText()
  const assigned = useMemo(() => person.branchIds ?? [], [person.branchIds])
  const [chosen, setChosen] = useState<string[]>(assigned)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => setChosen(assigned), [assigned])

  if (seesEveryBranch(person)) {
    return (
      <SectionCard
        title={t('branchAccess.person.branchesTitle')}
        note={t('branchAccess.person.branchesNote')}
      >
        <p className="mx-5 mb-5 rounded-sm bg-surface-background px-4 py-3 text-sm font-medium text-text-tertiary">
          {person.owner
            ? t('branchAccess.person.ownerSeesAll')
            : t('branchAccess.person.administratorSeesAll')}
        </p>
      </SectionCard>
    )
  }

  // A branch administrator gives only their own branches (LG-3); everyone else sees them all.
  const manageable = session?.branchAdministrator
    ? new Set(session.manageableBranchIds ?? [])
    : null
  const choices = branchNames.branches.filter(
    (branch) =>
      (manageable === null || manageable.has(branch.id)) &&
      (branch.active || assigned.includes(branch.id)),
  )
  const changed = chosen.length !== assigned.length || chosen.some((id) => !assigned.includes(id))

  const save = async () => {
    if (chosen.length === 0) {
      setFailure(t('branchAccess.refusal.branchRequired'))
      return
    }
    setSaving(true)
    setFailure(null)
    try {
      await savePersonBranches(person.id, chosen)
      onSaved()
    } catch (error) {
      setFailure(failureText(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      title={t('branchAccess.person.branchesTitle')}
      note={t('branchAccess.person.branchesNote')}
      actions={
        <button type="button" className={SMALL_BUTTON} disabled={saving || !changed} onClick={save}>
          {saving ? t('branchAccess.saving') : t('branchAccess.person.saveBranches')}
        </button>
      }
    >
      <div className="flex flex-col gap-2.5 p-5 pt-0">
        {!branchNames.ready ? (
          <LoadingNotice />
        ) : choices.length === 0 ? (
          <p className="text-sm font-medium text-text-tertiary">
            {t('branchAccess.invite.noBranches')}
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2.5">
            <legend className="sr-only">{t('branchAccess.person.branchesTitle')}</legend>
            {choices.map((branch) => (
              <label
                key={branch.id}
                className="flex cursor-pointer items-center gap-3 rounded-sm border border-border-subtle bg-white px-4 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-primary-25"
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(branch.id)}
                  onChange={(event) => {
                    setFailure(null)
                    setChosen((current) =>
                      event.target.checked
                        ? [...current, branch.id]
                        : current.filter((id) => id !== branch.id),
                    )
                  }}
                  className="size-[18px] shrink-0 accent-[#2c4eb7]"
                />
                <span className="min-w-0 flex-1">{branch.name}</span>
                {!branch.active ? (
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('branchAccess.closed')}
                  </span>
                ) : null}
              </label>
            ))}
          </fieldset>
        )}
        <InlineFailure text={failure} />
      </div>
    </SectionCard>
  )
}

/** One permission row: the person has it from their role, given to them, or taken away. */
type PermissionRow = { code: string; group: string; action: string; fromRole: boolean }

function PermissionsCard({ person }: { person: CompanyUser }) {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const failureText = useFailureText()
  const isAdministrator = useCan(USERS_PERMISSION)
  // A branch administrator manages people in their branches: nothing to give while it is off.
  const branchAccessOn = useBranchAccessOn()
  const mayReadCatalogue = useCan('role.read')
  const mayListRoles = useCan(ROLES_PERMISSION)
  const fixed = person.owner === true || person.roles.includes(ADMIN_ROLE)
  const permissions = useApiRead<PersonPermissionsDto>(
    fixed ? null : personPermissionsPath(person.id),
    () => loadPersonPermissions(person.id),
  )
  const catalogue = useApiRead<PermissionEntryDto[]>(
    fixed || !mayReadCatalogue ? null : PERMISSION_CATALOGUE_PATH,
    loadPermissionCatalogue,
  ).read
  const roles = useApiRead<RoleDto[]>(fixed || !mayListRoles ? null : ROLES_PATH, loadRoles).read
  const [wanted, setWanted] = useState<Set<string> | null>(null)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (fixed) {
    return (
      <SectionCard
        title={t('branchAccess.person.permissionsTitle')}
        note={t('branchAccess.person.permissionsNote')}
      >
        <p className="mx-5 mb-5 rounded-sm bg-surface-background px-4 py-3 text-sm font-medium text-text-tertiary">
          {person.owner
            ? t('branchAccess.person.ownerFullAccess')
            : t('branchAccess.person.administratorFullAccess')}
        </p>
      </SectionCard>
    )
  }
  // The rows and what a save sends both depend on the catalogue and the role list as well as the
  // person's permissions: drawn before those settle, a row could move between "From their role"
  // and "Given to them" under the reader's hand, and a tick saved meanwhile would be sent against
  // a guessed role. So the card waits for every read it asked for (a failed one falls back).
  const settling =
    permissions.read.status === 'loading' ||
    (mayReadCatalogue && catalogue.status === 'loading') ||
    (mayListRoles && roles.status === 'loading')
  if (settling || permissions.read.status !== 'ready') {
    return (
      <SectionCard
        title={t('branchAccess.person.permissionsTitle')}
        note={t('branchAccess.person.permissionsNote')}
      >
        <div className="p-5 pt-0">
          {permissions.read.status === 'failed' ? (
            <ApiReadFailure error={permissions.read.error} retry={permissions.retry} />
          ) : (
            <LoadingNotice />
          )}
        </div>
      </SectionCard>
    )
  }

  const view = permissions.read.data
  const grantCodes = new Set(view.grants.map((grant) => grant.code))
  const roleCodes = (() => {
    // Every role the person holds, not only the job role: someone from before one role per person
    // (RL-1) may also hold Approver or Viewer, whose codes are theirs from that role, never their
    // own grants (re-sending them as grants is refused for the reserved ones, RL-5).
    const held = view.roleCodes.length ? view.roleCodes : view.role ? [view.role] : []
    const found =
      roles.status === 'ready' ? roles.data.filter((entry) => held.includes(entry.code)) : []
    if (held.length && found.length === held.length) {
      return new Set(found.flatMap((entry) => entry.permissionCodes))
    }
    // Without the role list: what the person has that was not given to them, and what was taken.
    return new Set([...view.effective.filter((code) => !grantCodes.has(code)), ...view.denials])
  })()
  const effective = new Set(view.effective)
  const current = wanted ?? effective
  // A branch administrator gives only what they hold themselves (LG-3).
  const callerHolds = (code: string) =>
    isAdministrator || (session?.permissions ?? []).includes(code)
  const universe = new Set<string>([
    ...roleCodes,
    ...view.effective,
    ...view.denials,
    ...(catalogue.status === 'ready'
      ? catalogue.data.filter((entry) => entry.assignable).map((entry) => entry.code)
      : []),
  ])
  const rows: PermissionRow[] = [...universe]
    .filter((code) => code !== BRANCH_ADMINISTRATOR_GRANT)
    // Codes only the Administrator holds are never a person's own (RL-5); shown only to take away.
    .filter((code) => roleCodes.has(code) || (!isReservedPermission(code) && callerHolds(code)))
    .map((code) => {
      const words = permissionWords(code, t, i18n)
      return { code, group: words.group, action: words.action, fromRole: roleCodes.has(code) }
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.action.localeCompare(b.action))
  const groups = new Map<string, PermissionRow[]>()
  for (const row of rows) groups.set(row.group, [...(groups.get(row.group) ?? []), row])

  const isBranchAdministrator = current.has(BRANCH_ADMINISTRATOR_GRANT)
  // The tick is part of this card's permissions: it waits for "Save permissions" like every other
  // tick, and says so while it differs from what is saved (E15).
  const branchAdministratorPending =
    isBranchAdministrator !== effective.has(BRANCH_ADMINISTRATOR_GRANT)
  const changed =
    current.size !== effective.size || [...current].some((code) => !effective.has(code))

  const toggle = (code: string, on: boolean) => {
    setSaved(false)
    setFailure(null)
    setWanted((before) => {
      const next = new Set(before ?? effective)
      if (on) next.add(code)
      else next.delete(code)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setFailure(null)
    const previous = new Map(view.grants.map((grant) => [grant.code, grant]))
    const grants: PersonGrant[] = [...current]
      .filter((code) => !roleCodes.has(code) || previous.has(code))
      // A reserved code is never given to a person (RL-5); one they already hold stays as it was.
      .filter((code) => !isReservedPermission(code) || previous.has(code))
      .map((code) => previous.get(code) ?? { code, qualifier: null, value: null })
    const denials = [...roleCodes].filter((code) => !current.has(code))
    try {
      await savePersonPermissions(person.id, grants, denials)
      setWanted(null)
      setSaved(true)
      permissions.retry()
    } catch (error) {
      setFailure(failureText(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {isAdministrator && branchAccessOn ? (
        <SectionCard
          title={t('branchAccess.person.branchAdminTitle')}
          note={t('branchAccess.person.branchAdminNote')}
        >
          <label className="mx-5 mb-5 flex cursor-pointer items-start gap-3 rounded-sm border border-border-subtle bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={isBranchAdministrator}
              onChange={(event) => toggle(BRANCH_ADMINISTRATOR_GRANT, event.target.checked)}
              className="mt-0.5 size-[18px] shrink-0 accent-[#2c4eb7]"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text-primary">
                {t('branchAccess.person.branchAdminLabel')}
              </span>
              <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-tertiary">
                {t('branchAccess.person.branchAdminHint')}
                {branchAdministratorPending
                  ? ` ${t('branchAccess.person.branchAdminPending')}`
                  : null}
              </span>
            </span>
          </label>
        </SectionCard>
      ) : null}
      <SectionCard
        title={t('branchAccess.person.permissionsTitle')}
        note={t('branchAccess.person.permissionsNote')}
        actions={
          <button
            type="button"
            className={SMALL_BUTTON}
            disabled={saving || !changed}
            onClick={save}
          >
            {saving ? t('branchAccess.saving') : t('branchAccess.person.savePermissions')}
          </button>
        }
      >
        <div className="flex flex-col gap-5 p-5 pt-0">
          {saved ? (
            <p role="status" className="text-sm font-medium text-text-secondary">
              {t('branchAccess.person.permissionsSaved')}
            </p>
          ) : null}
          <InlineFailure text={failure} />
          {[...groups.entries()].map(([group, entries]) => (
            <fieldset key={group} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-text-primary">{group}</legend>
              <div className="grid gap-2 md:grid-cols-2">
                {entries.map((row) => {
                  const has = current.has(row.code)
                  const note = row.fromRole
                    ? has
                      ? t('branchAccess.person.fromRole')
                      : t('branchAccess.person.takenAway')
                    : has
                      ? t('branchAccess.person.given')
                      : null
                  return (
                    <label
                      key={row.code}
                      className="flex cursor-pointer items-start gap-3 rounded-sm border border-border-subtle bg-white px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={has}
                        onChange={(event) => toggle(row.code, event.target.checked)}
                        className="mt-0.5 size-[18px] shrink-0 accent-[#2c4eb7]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text-primary">
                          {row.action}
                        </span>
                        {note ? (
                          <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                            {note}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </SectionCard>
    </>
  )
}

/**
 * The Owner hands ownership to another Administrator (OW-4): pick one, type the company name,
 * enter your password. The former Owner stays an Administrator.
 */
function HandoverDialog({
  open,
  onClose,
  ownerId,
}: {
  open: boolean
  onClose: () => void
  ownerId: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useSession()
  const failureText = useFailureText()
  const people = useApiRead<UserPage>(open ? PEOPLE_PATH : null, loadPeople).read
  const [target, setTarget] = useState('')
  const [typed, setTyped] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const company = session?.tenantName ?? ''

  const candidates =
    people.status === 'ready'
      ? people.data.content.filter(
          (person) => person.id !== ownerId && person.enabled && person.roles.includes(ADMIN_ROLE),
        )
      : []
  const targetName = candidates.find((person) => person.id === target)
  // The name typed must be the company's, as the server checks it (spaces and case aside).
  const nameMatches = typedOneOfCompanyNames(typed, [company])
  const ready = target !== '' && nameMatches && password !== '' && !busy

  const close = () => {
    setTarget('')
    setTyped('')
    setPassword('')
    setFailure(null)
    onClose()
  }

  const confirm = async () => {
    setBusy(true)
    setFailure(null)
    try {
      await handOverOwnership(target, password, typed.trim())
      // The session said this person was the Owner; ask again on the next screen.
      forgetEntitlements()
      close()
      navigate('/settings/team')
    } catch (error) {
      setPassword('')
      setFailure(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('branchAccess.handover.title')}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" size="md" onClick={close}>
            {t('branchAccess.handover.cancel')}
          </Button>
          <Button size="md" disabled={!ready} onClick={confirm}>
            {busy ? t('branchAccess.saving') : t('branchAccess.handover.confirm')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {targetName
            ? t('branchAccess.handover.explainNamed', { name: displayName(targetName) })
            : t('branchAccess.handover.explain')}
        </p>
        {people.status === 'loading' ? (
          <LoadingNotice />
        ) : people.status === 'failed' ? (
          <InlineFailure text={failureText(people.error)} />
        ) : candidates.length === 0 ? (
          <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium text-text-tertiary">
            {t('branchAccess.handover.noAdministrator')}
          </p>
        ) : (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-primary">
              {t('branchAccess.handover.to')}
            </span>
            <Select
              value={target}
              onChange={setTarget}
              placeholder={t('branchAccess.handover.pick')}
              ariaLabel={t('branchAccess.handover.to')}
              options={candidates.map((person) => ({
                value: person.id,
                label: displayName(person),
                hint: person.email,
              }))}
            />
          </label>
        )}
        <Input
          bordered
          label={t('branchAccess.handover.typeName', { company })}
          value={typed}
          maxLength={255}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
        <Input
          bordered
          type="password"
          label={t('branchAccess.handover.password')}
          value={password}
          maxLength={128}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <InlineFailure text={failure} />
      </div>
    </Modal>
  )
}
