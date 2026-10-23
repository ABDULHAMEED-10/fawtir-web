import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks'
import { useCan, useSession } from '../../lib/session/session'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { Input, Switch } from '../../components/ui'
import {
  ADMIN_ROLE,
  ROLES_PATH,
  ROLES_PERMISSION,
  WAITING_INVITATIONS_ROUTE,
  invitationAlreadyOpen,
  inviteUser,
  isJobRole,
  loadRoles,
  roleKind,
  type RoleDto,
} from '../../api/settings/people'
import { branchAccessRefusalKey } from '../../lib/branchAccessRefusals'
import { describeApiFailure } from '../../lib/apiFailure'
import { subscriptionRestrictedAction } from '../../lib/subscriptionRestricted'
import { PAID_EXTRAS_ROUTE, extraPlaceRequired } from '../../api/settings/paidExtras'
import { permissionWords } from '../../lib/permissionLabels'
import { roleLabel } from '../../lib/roleLabels'
import { Check, Panel, Row } from './invitePieces'
import { invitationLinkDays } from '../../lib/invitationLinkDays'
import { BranchChecklist } from './BranchChecklist'
import { useBranchNames } from './peopleView'
import chipYesIcon from '../../assets/settings/check-green.svg'
import sendIcon from '../../assets/settings/check-white.svg'

/**
 * Settings › Invite someone once branch access is on (`useBranchAccessOn`); while it is off,
 * `InvitePage` keeps the form as it was. Same frame (Figma 135:38912) and request
 * (`POST /v1/users/invitations`, `InviteUserRequest`: email, role codes and `branchIds`).
 *
 * One role per person (Business Rules RL-1): the role is a single choice, or none for the
 * company's default role. Approval and view only are the person's own permissions, never roles
 * (RL-2), so they are ticks under the role, sent as the server's APPROVER and VIEWER sets, which it
 * gives the person as their own grants. "View only" means no job role at all, so it clears the
 * role. The branches (BA-1, LG-1) are required unless the role is Administrator, who sees every
 * branch (BA-2); with a single branch to give, it is ticked and fixed. A branch administrator
 * (LG-3) is offered only their own branches and never the Administrator role.
 */
type Sent = { email: string }

export function BranchInviteForm() {
  const { t } = useTranslation()
  const session = useSession()
  const mayListRoles = useCan(ROLES_PERMISSION)
  const mayBuyPlaces = useCan('tenant.plan.manage')
  const roles = useApiRead<RoleDto[]>(mayListRoles ? ROLES_PATH : null, loadRoles)
  const [email, setEmail] = useState('')
  /** The one job role (RL-1); empty means the server's default. */
  const [role, setRole] = useState('')
  /** The approval and view-only sets and any technical role, ticked on top of the role (RL-2). */
  const [extras, setExtras] = useState<string[]>([])
  const [branchIds, setBranchIds] = useState<string[]>([])
  const [branchMissing, setBranchMissing] = useState(false)
  const branchAdministrator = session?.branchAdministrator === true
  const branchNames = useBranchNames()
  // A branch administrator gives only their own branches (LG-3); the Administrator, any open one.
  const branchChoices = branchAdministrator
    ? (session?.manageableBranchIds ?? []).map((id) => ({ id, name: branchNames.name(id) ?? id }))
    : branchNames.branches.filter((branch) => branch.active)
  const chosen = [role, ...extras].filter(Boolean)
  const administratorChosen = role === ADMIN_ROLE
  // With one branch to give there is nothing to choose: it is ticked and fixed.
  const onlyBranch = branchChoices.length === 1 ? branchChoices[0].id : null
  const pickedBranchIds = onlyBranch ? [onlyBranch] : branchIds
  const needsBranch = !administratorChosen && branchChoices.length > 0
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)
  // From the server's answer to the last invitation sent: the same for every invitation.
  const [linkDays, setLinkDays] = useState<number | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [failureLink, setFailureLink] = useState<{ to: string; labelKey: string } | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending || email.trim() === '') return
    if (needsBranch && pickedBranchIds.length === 0) {
      setBranchMissing(true)
      return
    }
    setSending(true)
    // A new attempt replaces the last answer: an earlier "sent" must not sit above a refusal.
    setSent(null)
    setFailure(null)
    setFailureLink(null)
    try {
      const invitation = await inviteUser(
        email.trim(),
        chosen,
        administratorChosen ? [] : pickedBranchIds,
      )
      setSent({ email: invitation.email })
      setLinkDays((before) => invitationLinkDays(invitation) ?? before)
      setEmail('')
      setRole('')
      setExtras([])
      setBranchIds([])
    } catch (error) {
      // The address already has an invitation waiting: it is resent or revoked on Team members.
      if (invitationAlreadyOpen(error)) {
        setFailure(t('people.invite.alreadyOpen'))
        setFailureLink({ to: WAITING_INVITATIONS_ROUTE, labelKey: 'people.invite.alreadyOpenLink' })
        return
      }
      // US-1: at the plan's capacity a paid place comes first; whoever manages the plan buys it.
      const place = extraPlaceRequired(error)
      const refusal = branchAccessRefusalKey(error)
      if (place !== null) {
        setFailure(
          mayBuyPlaces
            ? t(`paidExtras.refusal.extraPlace.${place}`)
            : `${t(`paidExtras.refusal.extraPlace.${place}`)} ${t('paidExtras.refusal.extraPlaceAsk')}`,
        )
        setFailureLink(
          mayBuyPlaces
            ? { to: PAID_EXTRAS_ROUTE, labelKey: 'paidExtras.refusal.extraPlaceLink' }
            : null,
        )
      } else if (refusal) {
        setFailure(t(refusal))
      } else {
        const message = describeApiFailure(error)
        setFailure(t(message.key, message.values))
        setFailureLink(subscriptionRestrictedAction(error))
      }
    } finally {
      setSending(false)
    }
  }

  const roleList = roles.read.status === 'ready' ? roles.read.data : []
  const chosenNames = roleList
    .filter((entry) => chosen.includes(entry.code))
    .map((entry) => entry.name)
  const filledIn = email.trim().includes('@')
  // Never the Administrator for a branch administrator: it would give more than they have.
  const jobRoles = roleList.filter(
    (entry) =>
      entry.enabled && isJobRole(entry) && !(branchAdministrator && entry.code === ADMIN_ROLE),
  )
  const extraRoles = roleList.filter((entry) => entry.enabled && !isJobRole(entry))
  const viewOnly = extras.includes('VIEWER')
  const chosenBranchNames = branchChoices
    .filter((branch) => pickedBranchIds.includes(branch.id))
    .map((branch) => branch.name)

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {sent ? (
        <Notice
          body={t('people.invite.sent', { email: sent.email })}
          action={{ label: t('common.close'), onClick: () => setSent(null) }}
        />
      ) : null}
      {failure ? (
        <Notice
          body={failure}
          action={failureLink ? { label: t(failureLink.labelKey), to: failureLink.to } : undefined}
        />
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Panel title={t('invite.whoTitle')} note={t('invite.whoNote')}>
            <div className="grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                {/* TODO(backend): SETTINGS.md row 7.1. The request carries no name. */}
                <Input
                  bordered
                  label={t('invite.name')}
                  value=""
                  disabled
                  readOnly
                  hint={t('invite.notAvailableYet')}
                />
                <Input
                  bordered
                  type="email"
                  label={t('invite.email')}
                  requiredMark
                  required
                  maxLength={255}
                  autoComplete="off"
                  dir="ltr"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {/* TODO(backend): SETTINGS.md row 7.3. The request carries no note. */}
              <label className="block">
                <span className="mb-1 flex flex-wrap items-center gap-x-1.5 text-sm font-medium text-text-primary">
                  {t('invite.note')}
                  <span className="text-xs font-normal text-text-quaternary">
                    {t('invite.notAvailableYet')}
                  </span>
                </span>
                <textarea
                  disabled
                  value=""
                  readOnly
                  rows={3}
                  className="w-full resize-none rounded-sm border border-border-default bg-white px-3 py-2.5 text-sm font-medium text-text-primary outline-none disabled:opacity-50"
                />
              </label>
            </div>
          </Panel>

          <Panel
            title={t('invite.whatTitle')}
            note={t('invite.whatNote')}
            action={
              mayListRoles ? (
                <Link
                  to="/settings/roles"
                  className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                >
                  {t('invite.compareRoles')}
                </Link>
              ) : undefined
            }
          >
            {!mayListRoles ? (
              <p className="text-sm font-medium text-text-tertiary">
                {t('people.invite.defaultRoleOnly')}
              </p>
            ) : roles.read.status === 'loading' ? (
              <LoadingNotice />
            ) : roles.read.status === 'failed' ? (
              <ApiReadFailure error={roles.read.error} retry={roles.retry} />
            ) : (
              <div className="flex flex-col gap-5">
                <fieldset className="flex flex-col gap-2.5">
                  <legend className="sr-only">{t('invite.whatTitle')}</legend>
                  <DefaultRoleChoice
                    picked={role === ''}
                    disabled={viewOnly}
                    onChange={() => setRole('')}
                  />
                  {jobRoles.map((entry) => (
                    <RoleChoice
                      key={entry.id}
                      role={entry}
                      picked={role === entry.code}
                      disabled={viewOnly}
                      onChange={() => setRole(entry.code)}
                    />
                  ))}
                  <p className="text-xs font-medium text-text-tertiary">
                    {t('branchAccess.invite.oneRole')}
                  </p>
                </fieldset>
                {extraRoles.length ? (
                  <fieldset className="flex flex-col gap-2.5">
                    <legend className="mb-1 text-sm font-semibold text-text-primary">
                      {t('branchAccess.invite.extrasTitle')}
                    </legend>
                    {extraRoles.map((entry) => (
                      <ExtraChoice
                        key={entry.id}
                        role={entry}
                        picked={extras.includes(entry.code)}
                        onChange={(picked) => {
                          setExtras((current) =>
                            picked
                              ? [...current, entry.code]
                              : current.filter((code) => code !== entry.code),
                          )
                          // View only is no job role at all (RL-2).
                          if (picked && entry.code === 'VIEWER') setRole('')
                        }}
                      />
                    ))}
                  </fieldset>
                ) : null}
              </div>
            )}
          </Panel>

          {/* TODO(backend): SETTINGS.md row 7.4. No two-step request. */}
          <Panel title={t('invite.branchesTitle')} note={t('invite.branchesNote')}>
            {administratorChosen ? (
              <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium text-text-tertiary">
                {t('branchAccess.invite.administratorSeesAll')}
              </p>
            ) : !branchNames.ready && !branchAdministrator ? (
              <LoadingNotice />
            ) : branchChoices.length === 0 ? (
              <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium text-text-tertiary">
                {t('branchAccess.invite.noBranches')}
              </p>
            ) : (
              <BranchChecklist
                legend={t('invite.branchesTitle')}
                choices={branchChoices}
                picked={pickedBranchIds}
                onlyBranch={onlyBranch}
                missing={branchMissing}
                onChange={(branchId, checked) => {
                  setBranchMissing(false)
                  setBranchIds((current) =>
                    checked ? [...current, branchId] : current.filter((id) => id !== branchId),
                  )
                }}
              />
            )}
            <div className="mt-5 flex items-center justify-between gap-4 rounded-sm border border-border-subtle px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                  {t('invite.askTwoStep')}
                </p>
                <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t('invite.notAvailableYet')}
                </p>
              </div>
              <Switch checked={false} onChange={() => {}} disabled label={t('invite.askTwoStep')} />
            </div>
          </Panel>
        </div>

        <aside className="flex w-full flex-col gap-4 xl:w-[320px] xl:shrink-0">
          {/* TODO(backend): SETTINGS.md row 7.5. The server's own email cannot be previewed. */}
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('invite.whatTheyGet')}
            </h3>
            <div className="mt-3 overflow-hidden rounded-sm border border-border-subtle">
              <p className="bg-[#151c2d] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                {t('invite.theInvitationEmail')}
              </p>
              <div className="bg-white p-4">
                <p className="text-sm font-semibold leading-[1.4] text-text-primary">
                  {t('invite.emailSubject', {
                    who: session?.username ?? t('invite.someone'),
                    company: session?.tenantName ?? t('invite.yourCompany'),
                  })}
                </p>
                {filledIn ? (
                  <p dir="ltr" className="mt-2 text-xs font-medium text-text-tertiary">
                    {email.trim()}
                  </p>
                ) : null}
                {administratorChosen || chosenBranchNames.length ? (
                  <p className="mt-2 text-xs font-medium text-text-tertiary">
                    {administratorChosen
                      ? t('branchAccess.invite.previewEveryBranch')
                      : t('branchAccess.invite.previewBranches', {
                          branches: chosenBranchNames.join(', '),
                        })}
                  </p>
                ) : null}
                <span className="mt-3 inline-flex h-[34px] items-center rounded-sm bg-primary-700 px-3 text-xs font-semibold text-white">
                  {t('invite.acceptTheInvitation')}
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('invite.previewNote')}
            </p>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('invite.whatHappensNext')}
            </h3>
            <dl className="mt-2">
              <Row label={t('invite.emailSent')} value={t('invite.straightAway')} />
              <Row
                label={t('invite.linkWorksFor')}
                value={
                  linkDays === null
                    ? t('invite.notAvailableYet')
                    : t('invite.days', { count: linkDays })
                }
                muted={linkDays === null}
              />
              {/* An open invitation counts against the plan's people from the moment it is sent
                  (SubscriptionEnforcementService.assertCanAddPerson). */}
              <Row label={t('invite.placeTaken')} value={t('invite.immediately')} />
              {/* US-1: an extra person is charged from the day their payment is confirmed. */}
              <Row label={t('invite.chargedFrom')} value={t('invite.chargedFromValue')} last />
            </dl>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('invite.ready')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              <Check
                done={filledIn}
                label={filledIn ? t('invite.check.emailFilled') : t('invite.check.emailMissing')}
              />
              <Check
                done
                label={
                  chosenNames.length
                    ? t('invite.check.roleChosen', { role: chosenNames.join(', ') })
                    : t('invite.check.defaultRole')
                }
              />
              {needsBranch ? (
                <Check
                  done={pickedBranchIds.length > 0}
                  label={
                    pickedBranchIds.length > 0
                      ? t('branchAccess.invite.checkBranches', { count: pickedBranchIds.length })
                      : t('branchAccess.invite.checkNoBranch')
                  }
                />
              ) : null}
            </ul>
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {filledIn ? <span dir="ltr">{email.trim()}</span> : t('invite.footerEmailNeeded')}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to="/settings/team"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('invite.cancel')}
          </Link>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
          >
            <img src={sendIcon} alt="" className="size-4" />
            {sending ? t('people.invite.sending') : t('people.invite.send')}
          </button>
        </div>
      </div>
    </form>
  )
}

/** One role as a card, as the design draws it; what it reaches is named from its permissions. */
function RoleChoice({
  role,
  picked,
  disabled,
  onChange,
}: {
  role: RoleDto
  picked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  const { t, i18n } = useTranslation()
  const groups = [
    ...new Set(role.permissionCodes.map((code) => permissionWords(code, t, i18n).group)),
  ].sort((a, b) => a.localeCompare(b))
  const shown = groups.slice(0, 4)

  return (
    <label
      className={[
        'flex cursor-pointer gap-3 rounded-sm border p-4 transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : '',
        picked
          ? 'border-primary-700 bg-primary-25'
          : 'border-border-subtle bg-white hover:bg-primary-25',
      ].join(' ')}
    >
      <input
        type="radio"
        name="invite-role"
        checked={picked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 size-[18px] shrink-0 accent-[#2c4eb7]"
      />
      <span className="min-w-0 flex-1">
        <span
          className={[
            'block text-sm font-semibold',
            picked ? 'text-primary-800' : 'text-text-primary',
          ].join(' ')}
        >
          {roleLabel(role, t)}
        </span>
        {role.description ? (
          <span className="mt-1.5 block max-w-[620px] text-sm font-medium leading-[1.6] text-text-tertiary">
            {role.description}
          </span>
        ) : null}
        {shown.length ? (
          <span className="mt-2.5 flex flex-wrap gap-2">
            {shown.map((group) => (
              <span
                key={group}
                className="inline-flex h-[24px] items-center gap-1.5 rounded-[3px] bg-success-100 px-2 text-[11px] font-medium text-[#3d5648]"
              >
                <img src={chipYesIcon} alt="" className="size-3" />
                {group}
              </span>
            ))}
            {groups.length > shown.length ? (
              <span className="inline-flex h-[24px] items-center rounded-[3px] bg-surface-background px-2 text-[11px] font-medium text-text-quaternary">
                {t('invite.moreAreas', { count: groups.length - shown.length })}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </label>
  )
}

/** No job role: the invitation gives the company's default role, as an empty role list does. */
function DefaultRoleChoice({
  picked,
  disabled,
  onChange,
}: {
  picked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  const { t } = useTranslation()
  return (
    <label
      className={[
        'flex cursor-pointer gap-3 rounded-sm border p-4 transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : '',
        picked
          ? 'border-primary-700 bg-primary-25'
          : 'border-border-subtle bg-white hover:bg-primary-25',
      ].join(' ')}
    >
      <input
        type="radio"
        name="invite-role"
        checked={picked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 size-[18px] shrink-0 accent-[#2c4eb7]"
      />
      <span className="min-w-0 flex-1">
        <span
          className={[
            'block text-sm font-semibold',
            picked ? 'text-primary-800' : 'text-text-primary',
          ].join(' ')}
        >
          {t('branchAccess.invite.defaultRole')}
        </span>
        <span className="mt-1.5 block max-w-[620px] text-sm font-medium leading-[1.6] text-text-tertiary">
          {t('branchAccess.invite.defaultRoleNote')}
        </span>
      </span>
    </label>
  )
}

/**
 * Approval, view only, or a technical role, ticked on top of the one role. Approval and view only
 * read as what the person may do, not as roles (RL-2).
 */
function ExtraChoice({
  role,
  picked,
  onChange,
}: {
  role: RoleDto
  picked: boolean
  onChange: (picked: boolean) => void
}) {
  const { t } = useTranslation()
  const kind = roleKind(role)
  const label =
    kind === 'PERMISSION_SET' && role.code === 'APPROVER'
      ? t('branchAccess.invite.canApprove')
      : kind === 'PERMISSION_SET' && role.code === 'VIEWER'
        ? t('branchAccess.invite.viewOnly')
        : roleLabel(role, t)
  const note =
    kind === 'PERMISSION_SET' && role.code === 'APPROVER'
      ? t('branchAccess.invite.canApproveNote')
      : kind === 'PERMISSION_SET' && role.code === 'VIEWER'
        ? t('branchAccess.invite.viewOnlyNote')
        : role.description
  return (
    <label className="flex cursor-pointer gap-3 rounded-sm border border-border-subtle bg-white px-4 py-3 transition-colors hover:bg-primary-25">
      <input
        type="checkbox"
        checked={picked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 accent-[#2c4eb7]"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        {note ? (
          <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-tertiary">
            {note}
          </span>
        ) : null}
      </span>
    </label>
  )
}
