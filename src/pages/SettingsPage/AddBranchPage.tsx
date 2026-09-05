import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { Input, Select, Switch, TableCheckbox } from '../../components/ui'
import {
  BRANCHES,
  NEW_BRANCH,
  GOVERNORATES,
  BRANCH_INHERITS,
  BRANCH_BEHAVIOUR,
  BRANCH_PLAN,
  OPEN_BRANCHES,
  firstInvoiceFor,
} from '../../lib/settingsCompany'
import { MEMBERS } from '../../lib/settingsPeople'
import tickIcon from '../../assets/settings/check-green.svg'
import circleIcon from '../../assets/settings/minus-amber.svg'
import tickWhiteIcon from '../../assets/settings/check-white.svg'

/**
 * Settings › Add a branch (Figma 135:37971), and one branch reopened in the same form.
 *
 * The prefix drives the first invoice number, the roster drives the readiness checklist, and the
 * footer restates the whole thing — all from one piece of state, so the screen cannot promise
 * SR-INV-0001 while the field says something else.
 */
export function AddBranchPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()

  /** Opening an existing branch fills the same form from what it already holds. */
  const existing = BRANCHES.find((branch) => branch.id === id)

  const [name, setName] = useState(existing?.name ?? NEW_BRANCH.name)
  const [arabicName, setArabicName] = useState(NEW_BRANCH.arabicName)
  const [street, setStreet] = useState(existing?.address ?? '')
  const [town, setTown] = useState(existing?.name ?? NEW_BRANCH.town)
  const [postalCode, setPostalCode] = useState(NEW_BRANCH.postalCode)
  const [governorate, setGovernorate] = useState(NEW_BRANCH.governorate)
  const [phone, setPhone] = useState('')
  const [opens, setOpens] = useState(NEW_BRANCH.opens)
  const [numbering, setNumbering] = useState(
    existing ? (existing.prefix ? 'own' : 'shared') : NEW_BRANCH.numbering,
  )
  const [prefix, setPrefix] = useState(existing?.prefix ?? NEW_BRANCH.prefix)
  const [staff, setStaff] = useState<string[]>(() =>
    existing
      ? MEMBERS.filter((member) => existing.staff.includes(member.initials)).map((m) => m.id)
      : ['salim'],
  )
  const [behaviour, setBehaviour] = useState(
    () => new Set(BRANCH_BEHAVIOUR.filter((row) => row.on).map((row) => row.id)),
  )

  const firstInvoice = useMemo(
    () => (numbering === 'own' ? firstInvoiceFor(prefix) : 'INV-2048'),
    [numbering, prefix],
  )

  const toggleStaff = (id: string) =>
    setStaff((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )

  const toggleBehaviour = (id: string) =>
    setBehaviour((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const named = name.trim().length > 0 && town.trim().length > 0
  const prefixOk = numbering === 'shared' || prefix.trim().length > 0
  const hasManager = staff.length > 0
  const hasPhone = phone.trim().length > 0
  const canAdd = named && prefixOk

  const branchesUsed = OPEN_BRANCHES.length + 1

  return (
    <SettingsShell group="company">
      <SettingsHeader
        title={existing ? t('addBranch.editTitle', { name: existing.name }) : t('addBranch.title')}
        subtitle={existing ? t('addBranch.editSubtitle') : t('addBranch.subtitle')}
        actions={
          <Link
            to="/settings/branches"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('addBranch.cancel')}
          </Link>
        }
      />

      {/* Steps */}
      <ol className="flex flex-wrap items-center gap-y-3 rounded-md bg-surface-card px-5 py-4">
        {(['whereItIs', 'numbering', 'who'] as const).map((step, index) => {
          const done = index === 0 ? named : index === 1 ? prefixOk : hasManager
          return (
            <li key={step} className="flex min-w-[200px] flex-1 items-center gap-2.5">
              <span
                className={[
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  done
                    ? 'bg-primary-700 text-white'
                    : 'border border-border-default text-text-quaternary',
                ].join(' ')}
              >
                {done ? <img src={tickWhiteIcon} alt="" className="size-3.5" /> : index + 1}
              </span>
              <span
                className={[
                  'text-sm font-medium',
                  done ? 'text-text-primary' : 'text-text-quaternary',
                ].join(' ')}
              >
                {t(`addBranch.step.${step}`)}
              </span>
              {index < 2 ? (
                <span className="ms-2 hidden h-px flex-1 bg-border-subtle sm:block" />
              ) : null}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Panel title={t('addBranch.whereItIs')} note={t('addBranch.whereItIsNote')}>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  bordered
                  label={t('addBranch.branchName')}
                  requiredMark
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <Input
                  bordered
                  dir="rtl"
                  label={t('addBranch.arabicName')}
                  value={arabicName}
                  onChange={(event) => setArabicName(event.target.value)}
                />
              </div>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                  {t('addBranch.streetAddress')}
                  <span className="text-danger-700">*</span>
                </span>
                <textarea
                  value={street}
                  onChange={(event) => setStreet(event.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-sm border border-border-default bg-white px-3 py-2.5 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-brand"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  bordered
                  label={t('addBranch.townOrCity')}
                  requiredMark
                  value={town}
                  onChange={(event) => setTown(event.target.value)}
                />
                <Input
                  bordered
                  label={t('addBranch.postalCode')}
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                    {t('addBranch.governorate')}
                  </span>
                  <Select
                    ariaLabel={t('addBranch.governorate')}
                    value={governorate}
                    onChange={setGovernorate}
                    options={GOVERNORATES.map((id) => ({
                      value: id,
                      label: t(`governorate.${id}`),
                    }))}
                  />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  bordered
                  label={t('addBranch.phone')}
                  placeholder="+968 …"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                    {t('addBranch.opens')}
                  </span>
                  <Select
                    ariaLabel={t('addBranch.opens')}
                    value={opens}
                    onChange={setOpens}
                    options={[
                      { value: '1 October 2026', label: '1 October 2026' },
                      { value: '1 November 2026', label: '1 November 2026' },
                      { value: '1 December 2026', label: '1 December 2026' },
                    ]}
                  />
                </label>
              </div>
            </div>
          </Panel>

          <Panel title={t('addBranch.numbering')} note={t('addBranch.numberingNote')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  {t('addBranch.numberingLabel')}
                </span>
                <Select
                  ariaLabel={t('addBranch.numberingLabel')}
                  value={numbering}
                  onChange={setNumbering}
                  options={[
                    { value: 'own', label: t('addBranch.numberingOption.own') },
                    { value: 'shared', label: t('addBranch.numberingOption.shared') },
                  ]}
                />
              </label>
              {numbering === 'own' ? (
                <Input
                  bordered
                  label={t('addBranch.prefix')}
                  requiredMark
                  value={prefix}
                  onChange={(event) => setPrefix(event.target.value.toUpperCase().slice(0, 4))}
                />
              ) : null}
            </div>

            <p className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm bg-surface-background px-4 py-3">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                  {t('addBranch.firstInvoiceWillBe')}
                </span>
                <span dir="ltr" className="font-mono text-base font-semibold text-text-primary">
                  {firstInvoice}
                </span>
              </span>
              <span className="text-xs font-medium text-text-quaternary">
                {t('addBranch.thenOnwards')}
              </span>
            </p>
          </Panel>

          <Panel
            title={t('addBranch.whoWorksThere')}
            note={t('addBranch.whoWorksThereNote')}
            action={
              <Link
                to="/settings/team/invite"
                className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
              >
                {t('addBranch.inviteSomeoneNew')}
              </Link>
            }
          >
            <ul className="flex flex-col gap-2">
              {MEMBERS.filter((member) => !member.invited).map((member) => {
                const picked = staff.includes(member.id)
                return (
                  <li key={member.id}>
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
                        {member.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-text-primary">
                          {member.name}
                        </span>{' '}
                        <span className="text-xs font-medium text-text-quaternary">
                          {member.role === 'owner'
                            ? t('addBranch.canReachAnyway')
                            : member.role === 'till'
                              ? t('addBranch.worksAt', { branches: member.branches.join(', ') })
                              : member.branches.length > 0
                                ? t('addBranch.alreadyManages', { branch: member.branches[0] })
                                : ''}
                        </span>
                      </span>
                      <span className="inline-flex h-[24px] shrink-0 items-center rounded-[3px] bg-surface-background px-2 text-[11px] font-medium text-text-tertiary">
                        {t(`team.role.${member.role}`)}
                      </span>
                      <TableCheckbox
                        checked={picked}
                        onChange={() => toggleStaff(member.id)}
                        ariaLabel={member.name}
                      />
                    </label>
                  </li>
                )
              })}
            </ul>
          </Panel>

          <Panel title={t('addBranch.behaviour')} note={t('addBranch.behaviourNote')} flush>
            <ul>
              {BRANCH_BEHAVIOUR.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                      {t(`addBranch.behave.${row.id}`)}
                    </p>
                    <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                      {t(`addBranch.behave.${row.id}Note`, { name: name || NEW_BRANCH.name })}
                    </p>
                  </div>
                  <Switch
                    checked={behaviour.has(row.id)}
                    onChange={() => toggleBehaviour(row.id)}
                    label={t(`addBranch.behave.${row.id}`)}
                  />
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[300px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('addBranch.inherits')}
            </h3>
            <dl className="mt-2">
              {BRANCH_INHERITS.map((row, index) => (
                <div
                  key={row.id}
                  className={[
                    'flex items-center justify-between gap-3 py-2.5',
                    index < BRANCH_INHERITS.length - 1 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t(`addBranch.inherit.${row.id}`)}
                  </dt>
                  <dd
                    dir={row.mono ? 'ltr' : undefined}
                    className={[
                      'shrink-0 text-sm font-semibold text-text-primary',
                      row.mono ? 'font-mono text-[11px]' : '',
                    ].join(' ')}
                  >
                    {row.valueKey ? t(row.valueKey) : row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('addBranch.ready')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              <Check
                done={named}
                label={named ? t('addBranch.check.named') : t('addBranch.check.named')}
              />
              <Check
                done={prefixOk}
                label={
                  prefixOk
                    ? t('addBranch.check.prefixFree', {
                        prefix: numbering === 'own' ? prefix : 'INV',
                      })
                    : t('addBranch.check.prefixMissing')
                }
              />
              <Check
                done={hasManager}
                label={
                  hasManager
                    ? t('addBranch.check.someoneToManage')
                    : t('addBranch.check.nobodyAssigned')
                }
              />
              <Check
                done={hasPhone}
                label={hasPhone ? t('addBranch.check.phone') : t('addBranch.check.noPhone')}
              />
            </ul>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('addBranch.cost')}
            </h3>
            <dl className="mt-2">
              <Row
                label={t('addBranch.branchesUsed')}
                value={t('addBranch.usedOf', {
                  used: branchesUsed,
                  total: BRANCH_PLAN.included,
                })}
              />
              <Row
                label={t('addBranch.thisOne')}
                value={
                  branchesUsed <= BRANCH_PLAN.included
                    ? t('addBranch.noExtraCharge')
                    : `OMR ${BRANCH_PLAN.extraMonthly}`
                }
              />
              <Row
                label={t('addBranch.sixthWouldBe')}
                value={`OMR ${BRANCH_PLAN.extraMonthly}${t('addBranch.perMonth')}`}
                last
              />
            </dl>
          </section>
        </aside>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {canAdd
            ? t('addBranch.footer', { name, date: opens, invoice: firstInvoice })
            : t('addBranch.footerUnnamed')}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to="/settings/branches"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('addBranch.cancel')}
          </Link>
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {existing ? t('addBranch.closeThisBranch') : t('addBranch.saveDraft')}
          </button>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => navigate('/settings/branches')}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {existing ? t('addBranch.saveChanges') : t('addBranch.addTheBranch')}
          </button>
        </div>
      </div>
    </SettingsShell>
  )
}

function Panel({
  title,
  note,
  action,
  flush,
  children,
}: {
  title: string
  note: string
  action?: React.ReactNode
  /** The panel's own rows carry the padding, so the body sits flush to the card edge. */
  flush?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">{note}</p>
        </div>
        {action}
      </div>
      <div className={flush ? '' : 'border-t border-surface-background p-5'}>{children}</div>
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
