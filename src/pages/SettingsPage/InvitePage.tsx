import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { Input, Switch, TableCheckbox, withRial } from '../../components/ui'
import {
  INVITE_DEFAULTS,
  INVITE_LINK_DAYS,
  ROLE_CHIPS,
  MEMBERS,
  SEATS,
  withoutTwoStep,
  withLogin,
  type RoleId,
} from '../../lib/settingsPeople'
import { OPEN_BRANCHES } from '../../lib/settingsCompany'
import { COMPANY } from '../../lib/settings'
import tickIcon from '../../assets/settings/check-green.svg'
import circleIcon from '../../assets/settings/minus-amber.svg'
import chipYesIcon from '../../assets/settings/check-green.svg'
import chipNoIcon from '../../assets/settings/cross-muted.svg'
import sendIcon from '../../assets/settings/check-white.svg'

/** Roles that can be handed out from this screen, in the order the design lists them. */
const OFFERED: RoleId[] = ['till', 'manager', 'accountant', 'owner']

/**
 * Settings › Invite someone (Figma 135:38912).
 *
 * The invitation email on the right is rendered from the same fields the form holds, so what is
 * previewed is what would be sent. The design's copy addressed the invitee as "she"; a template
 * is shown for whoever is being invited, so it is written neutrally here.
 */
export function InvitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [name, setName] = useState(INVITE_DEFAULTS.name)
  const [email, setEmail] = useState(INVITE_DEFAULTS.email)
  const [note, setNote] = useState(INVITE_DEFAULTS.note)
  const [role, setRole] = useState<RoleId>(INVITE_DEFAULTS.role)
  const [branches, setBranches] = useState<string[]>(INVITE_DEFAULTS.branches)
  const [askTwoStep, setAskTwoStep] = useState(INVITE_DEFAULTS.askForTwoStep)

  const toggleBranch = (id: string) =>
    setBranches((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )

  /** A role that reaches every branch does not ask which; the list is hidden for it. */
  const branchesMatter = role === 'till' || role === 'manager'
  const chosenBranches = branchesMatter
    ? OPEN_BRANCHES.filter((branch) => branches.includes(branch.id))
    : OPEN_BRANCHES

  const filledIn = name.trim().length > 0 && email.trim().includes('@')
  const branchOk = !branchesMatter || branches.length > 0
  const canSend = filledIn && branchOk

  /** What the sixth person would cost, from the same seat rules the bill uses. */
  const cost = MEMBERS.length >= SEATS.included ? SEATS.extraMonthly : 0

  const branchNames = useMemo(
    () => chosenBranches.map((branch) => branch.name).join(', '),
    [chosenBranches],
  )

  return (
    <SettingsShell group="people">
      <SettingsHeader
        title={t('invite.title')}
        subtitle={t('invite.subtitle')}
        actions={
          <Link
            to="/settings/team"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('invite.cancel')}
          </Link>
        }
      />

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Who */}
          <Panel title={t('invite.whoTitle')} note={t('invite.whoNote')}>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  bordered
                  label={t('invite.name')}
                  requiredMark
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <Input
                  bordered
                  type="email"
                  label={t('invite.email')}
                  requiredMark
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <label className="block">
                <span className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-text-secondary">
                  {t('invite.note')}
                  <span className="font-normal text-text-quaternary">{t('invite.noteHint')}</span>
                </span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-sm border border-border-default bg-white px-3 py-2.5 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-brand"
                />
              </label>
            </div>
          </Panel>

          {/* Role */}
          <Panel
            title={t('invite.whatTitle')}
            note={t('invite.whatNote')}
            action={
              <Link
                to="/settings/roles"
                className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
              >
                {t('invite.compareRoles')}
              </Link>
            }
          >
            <ul className="flex flex-col gap-2.5">
              {OFFERED.map((entry) => {
                const picked = entry === role
                return (
                  <li key={entry}>
                    <label
                      className={[
                        'flex cursor-pointer gap-3 rounded-sm border p-4 transition-colors',
                        picked
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:bg-primary-25',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="role"
                        checked={picked}
                        onChange={() => setRole(entry)}
                        className="mt-0.5 size-[18px] shrink-0 accent-[#2c4eb7]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2.5">
                          <span
                            className={[
                              'text-sm font-semibold',
                              picked ? 'text-primary-800' : 'text-text-primary',
                            ].join(' ')}
                          >
                            {t(`team.role.${entry}`)}
                          </span>
                          {picked && entry === INVITE_DEFAULTS.role ? (
                            <span className="inline-flex h-[20px] items-center rounded-[3px] bg-success-100 px-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#3d5648]">
                              {t('invite.fitsWhatYouDescribed')}
                            </span>
                          ) : null}
                          {entry === 'owner' ? (
                            <span className="inline-flex h-[20px] items-center rounded-[3px] bg-pending-100 px-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-pending-700">
                              {t('invite.fullControl')}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1.5 block max-w-[620px] text-sm font-medium leading-[1.6] text-text-tertiary">
                          {t(`invite.roleBody.${entry}`)}
                        </span>
                        {ROLE_CHIPS[entry].length > 0 ? (
                          <span className="mt-2.5 flex flex-wrap gap-2">
                            {ROLE_CHIPS[entry].map((chip) => (
                              <span
                                key={chip.id}
                                className={[
                                  'inline-flex h-[24px] items-center gap-1.5 rounded-[3px] px-2 text-[11px] font-medium',
                                  chip.on
                                    ? 'bg-success-100 text-[#3d5648]'
                                    : 'bg-surface-background text-text-quaternary',
                                ].join(' ')}
                              >
                                <img
                                  src={chip.on ? chipYesIcon : chipNoIcon}
                                  alt=""
                                  className="size-3"
                                />
                                {t(`invite.chip.${chip.id}`)}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </Panel>

          {/* Branches */}
          <Panel title={t('invite.branchesTitle')} note={t('invite.branchesNote')}>
            {branchesMatter ? (
              <ul className="flex flex-col gap-2">
                {OPEN_BRANCHES.map((branch) => {
                  const picked = branches.includes(branch.id)
                  return (
                    <li key={branch.id}>
                      <label
                        className={[
                          'flex cursor-pointer items-center gap-3 rounded-sm border px-3 py-2.5 transition-colors',
                          picked
                            ? 'border-primary-700 bg-primary-25'
                            : 'border-border-subtle bg-white hover:bg-primary-25',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                            picked ? 'bg-primary-700 text-white' : 'bg-primary-50 text-primary-800',
                          ].join(' ')}
                        >
                          {branch.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-sm font-semibold text-text-primary">
                            {branch.name}
                          </span>{' '}
                          <span className="text-xs font-medium text-text-quaternary">
                            {branch.headOffice
                              ? t('invite.headOffice')
                              : branch.turnoverNoteKey
                                ? t('invite.wholesaleOnly')
                                : branch.address.split(',').slice(0, 2).join(',')}{' '}
                            ·{' '}
                            {branch.tills === 0
                              ? t('invite.branchNoTill', { people: branch.staff.length })
                              : t('invite.branchMeta', {
                                  people: branch.staff.length,
                                  tills: branch.tills,
                                  count: branch.staff.length,
                                })}
                          </span>
                        </span>
                        <TableCheckbox
                          checked={picked}
                          onChange={() => toggleBranch(branch.id)}
                          ariaLabel={branch.name}
                        />
                      </label>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium text-text-tertiary">
                {t('invite.check.allBranches')}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-4 rounded-sm border border-border-subtle px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                  {t('invite.askTwoStep')}
                </p>
                <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t('invite.askTwoStepNote', {
                    count: withoutTwoStep.length,
                    total: withLogin.length,
                  })}
                </p>
              </div>
              <Switch
                checked={askTwoStep}
                onChange={setAskTwoStep}
                label={t('invite.askTwoStep')}
              />
            </div>
          </Panel>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[320px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('invite.whatTheyGet')}
            </h3>
            <div className="mt-3 overflow-hidden rounded-sm border border-border-subtle">
              <p className="bg-[#151c2d] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                {t('invite.theInvitationEmail')}
              </p>
              <div className="bg-white p-4">
                <span className="flex size-9 items-center justify-center rounded-md bg-primary-700 text-[11px] font-semibold text-white">
                  {initialsOf(name)}
                </span>
                <p className="mt-3 text-sm font-semibold leading-[1.4] text-text-primary">
                  {t('invite.emailSubject', {
                    who: COMPANY.owner.name.split(' ')[0],
                    company: COMPANY.legalName,
                  })}
                </p>
                {note.trim() ? (
                  <p className="mt-2 text-xs font-medium leading-[1.6] text-text-tertiary">
                    {note}
                  </p>
                ) : null}
                <span className="mt-3 inline-flex h-[34px] items-center rounded-sm bg-primary-700 px-3 text-xs font-semibold text-white">
                  {t('invite.acceptTheInvitation')}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('invite.whatHappensNext')}
            </h3>
            <dl className="mt-2">
              <Row label={t('invite.emailSent')} value={t('invite.straightAway')} />
              <Row
                label={t('invite.linkWorksFor')}
                value={t('invite.days', { count: INVITE_LINK_DAYS })}
              />
              <Row label={t('invite.placeTaken')} value={t('invite.immediately')} />
              <Row label={t('invite.chargedFrom')} value={t('invite.theDayTheyAccept')} last />
            </dl>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('invite.ready')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              <Check
                done={filledIn}
                label={filledIn ? t('invite.check.filledIn') : t('invite.check.missing')}
              />
              <Check
                done
                label={t('invite.check.roleChosen', { role: t(`team.role.${role}`).toLowerCase() })}
              />
              <Check
                done={branchOk}
                label={
                  !branchesMatter
                    ? t('invite.check.allBranches')
                    : branches.length > 0
                      ? t('invite.check.branchChosen', {
                          count: branches.length,
                          names: branchNames,
                        })
                      : t('invite.check.noBranch')
                }
              />
              <Check
                done={cost === 0}
                label={
                  cost === 0
                    ? t('invite.check.free')
                    : t('invite.check.costs', { amount: cost.toFixed(3) })
                }
              />
            </ul>
          </section>
        </aside>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {!canSend
            ? t('invite.footerIncomplete')
            : cost === 0
              ? t('invite.footerFree', {
                  name,
                  role: t(`team.role.${role}`).toLowerCase(),
                  branches: branchNames,
                })
              : withRial(
                  t('invite.footer', {
                    name,
                    role: t(`team.role.${role}`).toLowerCase(),
                    branches: branchNames,
                    amount: cost.toFixed(3),
                  }),
                )}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to="/settings/team"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('invite.cancel')}
          </Link>
          <button
            type="button"
            disabled={!canSend}
            onClick={() => navigate('/settings/team')}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <img src={sendIcon} alt="" className="size-4" />
            {t('invite.send')}
          </button>
        </div>
      </div>
    </SettingsShell>
  )
}

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase() || '—'

function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string
  note: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">{note}</p>
        </div>
        {action}
      </div>
      <div className="border-t border-surface-background p-5">{children}</div>
    </section>
  )
}

function Check({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <img src={done ? tickIcon : circleIcon} alt="" className="mt-0.5 size-4 shrink-0" />
      <span
        className={[
          'text-sm font-medium leading-[1.4]',
          done ? 'text-text-secondary' : 'text-text-quaternary',
        ].join(' ')}
      >
        {withRial(label)}
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
