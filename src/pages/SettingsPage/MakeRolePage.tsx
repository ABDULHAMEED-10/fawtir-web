import { useMemo, useState, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { Input, Switch, Select } from '../../components/ui'
import { useApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import {
  PEOPLE_PATH,
  ROLES_PATH,
  ROLES_PERMISSION,
  USERS_PERMISSION,
  loadPeople,
  loadRoles,
  type RoleDto,
  type UserPage,
} from '../../api/settings/people'
import { PLAN_OVERVIEW_PATH, loadPlanOverview, type PlanOverviewDto } from '../../api/settings/plan'
import {
  ROLES_MANAGE_PERMISSION,
  ROLE_MATRIX_PATH,
  createRole,
  loadRoleMatrix,
  roleCodeFor,
  updateRole,
  type MatrixPermission,
  type MatrixRole,
  type RoleMatrixDto,
} from '../../api/settings/roles'
import {
  EDITOR_GROUPS,
  PERCENT_CHOICES,
  editorGroupOf,
  grantOfLimitValue,
  grantsOf,
  hiddenHeld,
  limitValueOf,
  offeredPermissions,
  templateRoles,
  toRoleGrants,
  type Grants,
} from '../../lib/roleEditor'
import { roleSaveRefusal } from '../../lib/roleRefusals'
import { permissionWords } from '../../lib/permissionLabels'
import tickIcon from '../../assets/settings/check-green.svg'
import circleIcon from '../../assets/settings/minus-amber.svg'
import lockIcon from '../../assets/settings/menu-key.svg'
import tickWhiteIcon from '../../assets/settings/check-white.svg'
import managerIcon from '../../assets/settings/menu-people.svg'
import accountantIcon from '../../assets/settings/menu-invoice.svg'
import tillIcon from '../../assets/settings/menu-device.svg'
import nothingIcon from '../../assets/settings/cross-muted.svg'

/** The design's tiles, matched to the built-in roles by what they are for. */
const TEMPLATE_ICON: Record<string, string> = {
  SALES_MANAGER: tillIcon,
  FINANCE_MANAGER: managerIcon,
  ACCOUNTANT: accountantIcon,
}

const NOTHING = 'nothing'

/**
 * Settings › Make a role (Figma 135:40069), and the same screen changing a role the company made
 * (`/settings/roles/:roleId/edit`).
 *
 * The switches are the server's grantable catalogue (`GET /v1/roles/matrix`) under the design's
 * four headings, less what only the Administrator does (Business Rules RL-5), which is not shown
 * at all. "Start from" copies a built-in job role's column. Saving is `POST /v1/roles` or
 * `PATCH /v1/roles/{id}`, both `admin.roles.manage`; the people a role reaches are counted from
 * `GET /v1/users` and the places left from the plan, each only when the reader may see them.
 */
export function MakeRolePage() {
  const { roleId } = useParams()
  return (
    <SettingsShell group="people">
      <Gate roleId={roleId} />
    </SettingsShell>
  )
}

/** Inside the shell, which is what provides the session the permissions are read from. */
function Gate({ roleId }: { roleId?: string }) {
  const { t } = useTranslation()
  const mayManage = useCan(ROLES_MANAGE_PERMISSION)
  const mayList = useCan(ROLES_PERMISSION)
  if (mayManage && mayList) return <Loader key={roleId ?? 'new'} roleId={roleId} />
  return (
    <>
      <SettingsHeader
        title={t(roleId ? 'makeRole.editTitle' : 'makeRole.title')}
        subtitle={t(roleId ? 'makeRole.editSubtitle' : 'makeRole.subtitle')}
        actions={<CancelLink />}
      />
      <PermissionDeniedNotice />
    </>
  )
}

function CancelLink() {
  const { t } = useTranslation()
  return (
    <Link
      to="/settings/roles"
      className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
    >
      {t('makeRole.cancel')}
    </Link>
  )
}

function Loader({ roleId }: { roleId?: string }) {
  const { t } = useTranslation()
  const matrix = useApiRead<RoleMatrixDto>(ROLE_MATRIX_PATH, loadRoleMatrix)
  const roles = useApiRead<RoleDto[]>(ROLES_PATH, loadRoles)
  const title = t(roleId ? 'makeRole.editTitle' : 'makeRole.title')
  const header = (
    <SettingsHeader
      title={title}
      subtitle={t(roleId ? 'makeRole.editSubtitle' : 'makeRole.subtitle')}
      actions={<CancelLink />}
    />
  )

  if (matrix.read.status === 'loading' || roles.read.status === 'loading') {
    return (
      <>
        {header}
        <LoadingNotice />
      </>
    )
  }
  if (matrix.read.status === 'failed' || roles.read.status === 'failed') {
    const failed = matrix.read.status === 'failed' ? matrix : roles
    return (
      <>
        {header}
        <ApiReadFailure
          error={failed.read.status === 'failed' ? failed.read.error : null}
          retry={failed.retry}
        />
      </>
    )
  }

  const editing = roleId
    ? {
        column: matrix.read.data.roles.find((role) => role.id === roleId),
        role: roles.read.data.find((role) => role.id === roleId),
      }
    : null
  if (editing && (!editing.column || !editing.role)) {
    return (
      <>
        {header}
        <Notice badge={t('appAccess.notFound')} body={t('roles.refusal.gone')} />
      </>
    )
  }
  if (editing?.role?.systemRole) {
    return (
      <>
        {header}
        <Notice body={t('makeRole.builtInCantChange')} />
      </>
    )
  }

  return (
    <Editor
      header={header}
      matrix={matrix.read.data}
      roles={roles.read.data}
      editing={editing ? { column: editing.column!, role: editing.role! } : null}
    />
  )
}

function Editor({
  header,
  matrix,
  roles,
  editing,
}: {
  header: ReactNode
  matrix: RoleMatrixDto
  roles: RoleDto[]
  editing: { column: MatrixRole; role: RoleDto } | null
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const offered = useMemo(() => offeredPermissions(matrix.permissions), [matrix.permissions])
  const templates = useMemo(() => templateRoles(matrix.roles, roles), [matrix.roles, roles])
  const total = offered.length
  const words = (code: string) => permissionWords(code, t, i18n)

  const savedGrants = useMemo(
    () => (editing ? grantsOf(editing.column, offered) : null),
    [editing, offered],
  )
  const dropped = useMemo(
    () => (editing ? hiddenHeld(editing.column, offered) : []),
    [editing, offered],
  )

  const [template, setTemplate] = useState<string>(editing ? NOTHING : (templates[0]?.id ?? NOTHING))
  const [name, setName] = useState(editing?.role.name ?? '')
  const [purpose, setPurpose] = useState(editing?.role.description ?? '')
  const [grants, setGrants] = useState<Grants>(
    () => savedGrants ?? grantsOf(templates[0], offered),
  )
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const mayListPeople = useCan(USERS_PERMISSION)
  const people = useApiRead<UserPage>(
    editing && mayListPeople ? PEOPLE_PATH : null,
    loadPeople,
  ).read
  const mayReadPlan = useCan('tenant.plan.read')
  const plan = useApiRead<PlanOverviewDto>(mayReadPlan ? PLAN_OVERVIEW_PATH : null, loadPlanOverview).read

  /** How many people hold the role, or null when that cannot be told. */
  const holders: number | null = !editing
    ? 0
    : people.status === 'ready' && people.data.totalElements === people.data.content.length
      ? people.data.content.filter((person) => person.roles.includes(editing.role.code)).length
      : null

  const placesFree =
    plan.status === 'ready'
      ? Math.max(0, plan.data.plan.peopleIncluded - plan.data.activePeople - plan.data.openInvitations)
      : null

  const templateName = (id: string) =>
    id === NOTHING
      ? t('makeRole.template.nothing')
      : (templates.find((role) => role.id === id)?.name ?? t('makeRole.template.nothing'))

  const pickTemplate = (id: string) => {
    setTemplate(id)
    setGrants(grantsOf(templates.find((role) => role.id === id), offered))
  }

  const reset = () => {
    if (savedGrants) setGrants(savedGrants)
    else pickTemplate(template)
  }

  const toggle = (code: string) =>
    setGrants((current) => {
      const next = { ...current }
      if (next[code]) delete next[code]
      else next[code] = { qualifier: null }
      return next
    })

  const on = Object.keys(grants).length
  const named = name.trim().length > 0
  const explained = named && purpose.trim().length > 0

  const groups = EDITOR_GROUPS.map((group) => ({
    group,
    permissions: offered
      .filter((permission) => editorGroupOf(permission.code) === group)
      .map((permission) => ({ permission, label: words(permission.code).label }))
      .sort((a, b) => a.label.localeCompare(b.label, i18n.language)),
  })).filter((entry) => entry.permissions.length > 0)

  const save = async () => {
    if (!named || saving) return
    setSaving(true)
    setFailure(null)
    try {
      const body = toRoleGrants(grants)
      if (editing) {
        await updateRole(editing.role.id, { name: name.trim(), description: purpose.trim(), ...body })
      } else {
        const description = purpose.trim()
        await createRole({
          code: roleCodeFor(name),
          name: name.trim(),
          ...(description ? { description } : {}),
          ...body,
        })
      }
      navigate('/settings/roles')
    } catch (error) {
      const message = roleSaveRefusal(error, Boolean(editing))
      setFailure(t(message.key, message.values))
    } finally {
      setSaving(false)
    }
  }

  const footerText = !named
    ? t('makeRole.footerUnnamed')
    : editing
      ? t('makeRole.footerEdit', { name: name.trim(), on, total })
      : t('makeRole.footer', { name: name.trim(), on, total })

  return (
    <>
      {header}

      {/* Start from, and the name */}
      <section className="rounded-md bg-surface-card p-5">
        {editing ? null : (
          <>
            <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
              {t('makeRole.startFrom')}
            </h3>
            <p className="mt-0.5 text-xs font-medium text-text-quaternary">
              {t('makeRole.startFromNote')}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[...templates.map((role) => role.id), NOTHING].map((id) => {
                const picked = id === template
                const role = templates.find((entry) => entry.id === id)
                const count = Object.keys(grantsOf(role, offered)).length
                const note = role
                  ? roles.find((entry) => entry.id === id)?.description
                  : t('makeRole.template.nothingNote')
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => pickTemplate(id)}
                    aria-pressed={picked}
                    className={[
                      'flex flex-col rounded-sm border p-4 text-start transition-colors',
                      picked
                        ? 'border-primary-700 bg-primary-25'
                        : 'border-border-subtle bg-white hover:bg-primary-25',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex size-8 items-center justify-center rounded-md',
                        picked ? 'bg-primary-700' : 'bg-surface-background',
                      ].join(' ')}
                    >
                      <img
                        src={role ? (Object.hasOwn(TEMPLATE_ICON, role.code) ? TEMPLATE_ICON[role.code] : managerIcon) : nothingIcon}
                        alt=""
                        className={picked ? 'size-4 brightness-0 invert' : 'size-4'}
                      />
                    </span>
                    <span className="mt-2.5 text-sm font-semibold text-text-primary">
                      {templateName(id)}
                    </span>
                    {note ? (
                      <span className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                        {note}
                      </span>
                    ) : null}
                    <span className="mt-2 text-xs font-medium text-text-quaternary">
                      {t('makeRole.onOf', { on: count, total })}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        <div className={['grid gap-4 sm:grid-cols-2', editing ? '' : 'mt-4'].join(' ')}>
          <Input
            bordered
            label={t('makeRole.nameThisRole')}
            requiredMark
            labelNote={t('makeRole.nameHint')}
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            bordered
            label={t('makeRole.whatItsFor')}
            labelNote={t('makeRole.whatItsForHint')}
            value={purpose}
            maxLength={2000}
            onChange={(event) => setPurpose(event.target.value)}
          />
        </div>
      </section>

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* Switches */}
        <section className="min-w-0 flex-1 overflow-hidden rounded-md bg-surface-card">
          <div className="flex flex-wrap items-start justify-between gap-3 p-5">
            <div>
              <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('makeRole.whatTheyCanDo')}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                {editing
                  ? t('makeRole.turnedOn', { on, total })
                  : template === NOTHING
                    ? t('makeRole.fromScratch', { on, total })
                    : t('makeRole.changedFrom', { on, total, template: templateName(template) })}
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
            >
              {editing
                ? t('makeRole.resetToSaved')
                : t('makeRole.resetTo', { template: templateName(template) })}
            </button>
          </div>

          {groups.map(({ group, permissions }) => {
            const groupOn = permissions.filter(({ permission }) => grants[permission.code]).length
            return (
              <div key={group}>
                <p className="flex flex-wrap items-center justify-between gap-3 border-y border-surface-background bg-primary-25 px-5 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.6px] text-primary-800">
                    {t(`roles.group.${group}`)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs font-medium text-text-quaternary">
                      {t('makeRole.groupCount', { on: groupOn, total: permissions.length })}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setGrants((current) => {
                          const next = { ...current }
                          const turnOn = groupOn < permissions.length
                          for (const { permission } of permissions) {
                            if (!turnOn) delete next[permission.code]
                            else if (!next[permission.code]) next[permission.code] = { qualifier: null }
                          }
                          return next
                        })
                      }
                      className="text-xs font-semibold text-primary-700 transition-colors hover:text-primary-800"
                    >
                      {groupOn < permissions.length ? t('makeRole.turnAllOn') : t('makeRole.turnAllOff')}
                    </button>
                  </span>
                </p>

                <ul>
                  {permissions.map(({ permission, label }) => (
                    <PermissionRow
                      key={permission.code}
                      permission={permission}
                      label={label}
                      grant={grants[permission.code]}
                      onToggle={() => toggle(permission.code)}
                      onLimit={(value) =>
                        setGrants((current) => ({
                          ...current,
                          [permission.code]: grantOfLimitValue(value),
                        }))
                      }
                    />
                  ))}
                </ul>
              </div>
            )
          })}

          <p className="flex items-start gap-2 border-t border-surface-background bg-surface-background/50 px-5 py-4 text-xs font-medium leading-[1.6] text-text-tertiary">
            <img src={lockIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-60" />
            <span>
              <Trans
                i18nKey="makeRole.adminOnlyNote"
                components={{ b: <b className="font-semibold text-text-primary" /> }}
              />
            </span>
          </p>
        </section>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[300px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('makeRole.howItReads')}
            </h3>
            {on === 0 ? (
              <p className="mt-3 text-sm font-medium text-text-quaternary">
                {t('makeRole.nothingOnYet')}
              </p>
            ) : (
              <span className="mt-3 flex flex-wrap gap-2">
                {groups
                  .flatMap((entry) => entry.permissions)
                  .filter(({ permission }) => grants[permission.code])
                  .map(({ permission, label }) => (
                    <span
                      key={permission.code}
                      className="inline-flex min-h-[24px] items-center rounded-[3px] bg-success-100 px-2 py-0.5 text-[11px] font-medium text-[#3d5648]"
                    >
                      {label}
                    </span>
                  ))}
              </span>
            )}
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('makeRole.worthThinking')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              <Check
                done={explained}
                label={explained ? t('makeRole.think.named') : t('makeRole.think.unnamed')}
              />
              <Check done label={t('makeRole.think.noAdminOnly')} />
              {dropped.length > 0 ? (
                <Check
                  done={false}
                  label={t('makeRole.think.dropsAdminOnly', { count: dropped.length })}
                />
              ) : null}
              {holders === 0 ? (
                <Check done={false} label={t('makeRole.think.nobodyHasIt')} muted />
              ) : holders !== null ? (
                <Check done={false} label={t('makeRole.think.heldBy', { count: holders })} />
              ) : null}
            </ul>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('makeRole.giveItToSomeone')}
            </h3>
            <dl className="mt-2">
              {holders !== null ? (
                <Row
                  label={t('makeRole.rightNow')}
                  value={holders === 0 ? t('makeRole.nobody') : t('roles.people', { count: holders })}
                  last={placesFree === null}
                />
              ) : null}
              {placesFree !== null ? (
                <Row
                  label={t('makeRole.placesLeft')}
                  value={
                    placesFree === 0
                      ? t('makeRole.noneFree')
                      : t('makeRole.placesFree', { count: placesFree })
                  }
                  last
                />
              ) : null}
            </dl>
            <Link
              to="/settings/team"
              className="mt-3 inline-flex h-[42px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('makeRole.changeSomeone')}
            </Link>
          </section>
        </aside>
      </div>

      {failure ? <Notice body={failure} /> : null}

      {/* Footer */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="min-w-0 text-sm font-medium text-text-tertiary [overflow-wrap:anywhere]">
          {footerText}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <CancelLink />
          <button
            type="button"
            disabled={!named || saving}
            onClick={save}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {saving
              ? t('makeRole.saving')
              : editing
                ? t('makeRole.saveChanges')
                : t('makeRole.make')}
          </button>
        </div>
      </div>
    </>
  )
}

function PermissionRow({
  permission,
  label,
  grant,
  onToggle,
  onLimit,
}: {
  permission: MatrixPermission
  label: string
  grant: Grants[string] | undefined
  onToggle: () => void
  onLimit: (value: string) => void
}) {
  const { t, i18n } = useTranslation()
  const noteKey = `roles.permNote.${permission.code.replace(/\./g, '_')}`
  const choices = grant ? limitChoices(permission, grant, t) : []
  return (
    <li className="flex items-center gap-4 border-b border-surface-background px-5 py-3.5 last:border-0 max-sm:flex-wrap">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-[1.3] text-text-primary">{label}</p>
        {i18n.exists(noteKey) ? (
          <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
            {t(noteKey)}
          </p>
        ) : null}
      </div>

      {grant && choices.length > 0 ? (
        <span className="w-[170px] shrink-0">
          <Select
            compact
            ariaLabel={t('makeRole.limitFor', { permission: label })}
            value={limitValueOf(grant)}
            onChange={onLimit}
            options={choices}
          />
        </span>
      ) : null}

      <Switch checked={Boolean(grant)} onChange={onToggle} label={label} />
    </li>
  )
}

/** The limits a permission offers, in words, with "no limit" first. */
function limitChoices(
  permission: MatrixPermission,
  grant: Grants[string],
  t: TFunction,
): { value: string; label: string }[] {
  const choices: { value: string; label: string }[] = []
  if (permission.qualifiers.includes('OWN')) {
    choices.push({ value: 'FULL', label: t('roles.limit.anyInvoice') })
    choices.push({ value: 'OWN', label: t('roles.limit.ownOnly') })
  }
  if (permission.qualifiers.includes('MAX_PERCENT')) {
    if (!choices.length) choices.push({ value: 'FULL', label: t('roles.limit.anyDiscount') })
    const percents: number[] = [...PERCENT_CHOICES]
    if (grant.qualifier === 'MAX_PERCENT' && grant.value !== undefined && !percents.includes(grant.value)) {
      percents.push(grant.value)
      percents.sort((a, b) => a - b)
    }
    for (const value of percents) {
      choices.push({ value: `MAX_PERCENT:${value}`, label: t('roles.limit.discountUpTo', { value }) })
    }
  }
  return choices
}

function Check({ done, label, muted }: { done: boolean; label: string; muted?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <img src={done ? tickIcon : circleIcon} alt="" className="mt-0.5 size-4 shrink-0" />
      <span
        className={[
          'text-sm font-medium leading-[1.4]',
          done && !muted ? 'text-text-secondary' : 'text-text-quaternary',
        ].join(' ')}
      >
        {label}
      </span>
    </li>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd className="shrink-0 text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  )
}
