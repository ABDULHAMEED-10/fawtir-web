import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { Input, Select, Switch } from '../../components/ui'
import { useApiRead } from '../../hooks'
import { GOVERNORATES, BRANCH_BEHAVIOUR, firstInvoiceFor } from '../../lib/settingsCompany'
import { governorateIdFor, GOVERNORATE_NAMES, type GovernorateId } from '../../lib/governorates'
import {
  COMPANY_PROFILE_PATH,
  loadCompanyProfile,
  type CompanyProfileDto,
} from '../../api/company/companyProfile'
import {
  PARTICIPANT_STANDING_PATH,
  type ParticipantIdStanding,
} from '../../api/peppol/participantStanding'
import { PLAN_OVERVIEW_PATH, loadPlanOverview, type PlanOverviewDto } from '../../api/settings/plan'
import {
  assignInvoicePrefix,
  codeFromName,
  createBranch,
  designateHeadOffice,
  loadBranch,
  loadBranchOverview,
  updateBranch,
  branchPath,
  BRANCHES_OVERVIEW_PATH,
  type BranchDetailDto,
  type BranchOverviewDto,
} from '../../api/settings/branches'
import tickIcon from '../../assets/settings/check-green.svg'
import circleIcon from '../../assets/settings/minus-amber.svg'
import tickWhiteIcon from '../../assets/settings/check-white.svg'

/**
 * Settings › Add a branch (Figma 135:37971), and one branch reopened in the same form.
 *
 * The prefix drives the first invoice number and the footer restates it, from one piece of state,
 * so the screen cannot promise one number while the field says another.
 *
 * `BranchAttributes` (`BranchManagementController`) has no field for the Arabic name or the
 * "behaviour" switches below; they are not sent. See docs/backend-guides/INCOME.md, "Update
 * 2026-09-27 (branches)". A new branch starts empty: the form used to open pre-filled with the
 * design's worked example (Sur, 411, Ash Sharqiyah South, prefix SR), which a hurried save would
 * have created for real. The opening-date picker and the "who works there" roster went for the
 * same reason: neither was sent, and the roster listed sample people.
 */
export function AddBranchPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()

  /** Opening an existing branch fills the same form from what it already holds. */
  const existingRead = useApiRead<BranchDetailDto>(id ? branchPath(id) : null, () =>
    loadBranch(id as string),
  ).read
  const existing = existingRead.status === 'ready' ? existingRead.data : undefined
  const overview = useApiRead<BranchOverviewDto>(BRANCHES_OVERVIEW_PATH, () =>
    loadBranchOverview(),
  ).read
  const everCount = overview.status === 'ready' ? overview.data.everCount : 0
  const takenCodes = overview.status === 'ready' ? overview.data.branches.map((row) => row.code) : []
  // The prefix is the overview's own figure (BranchDetail carries no invoicePrefix field).
  const existingPrefix =
    overview.status === 'ready'
      ? (overview.data.branches.find((row) => row.id === id)?.invoicePrefix ?? null)
      : null

  const [name, setName] = useState(existing?.name ?? '')
  const [arabicName, setArabicName] = useState('')
  const [street, setStreet] = useState(existing?.address ?? '')
  const [town, setTown] = useState(existing?.city ?? '')
  const [postalCode, setPostalCode] = useState(existing?.postalCode ?? '')
  const [governorate, setGovernorate] = useState<GovernorateId | string>(
    governorateIdFor(existing?.state) ?? '',
  )
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [numbering, setNumbering] = useState<'own' | 'shared'>(
    existing ? (existingPrefix ? 'own' : 'shared') : 'own',
  )
  const [prefix, setPrefix] = useState(existing ? (existingPrefix ?? '') : '')
  const [behaviour, setBehaviour] = useState(
    () => new Set(BRANCH_BEHAVIOUR.filter((row) => row.on).map((row) => row.id)),
  )
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  // A reopened branch fills once its real data arrives, not on every keystroke after. The loading
  // gate below hides the form while the fetch is in flight; for one render after it resolves, a
  // field can still show the empty new-branch value from before this effect runs. Keying the form
  // by `existing?.id` would remove that frame at the cost of a bigger split; not done here.
  const [filledFrom, setFilledFrom] = useState(() => existing?.id)
  useEffect(() => {
    if (!existing || existing.id === filledFrom) return
    setName(existing.name)
    setStreet(existing.address ?? '')
    setTown(existing.city ?? '')
    setPostalCode(existing.postalCode ?? '')
    setGovernorate(governorateIdFor(existing.state) ?? '')
    setPhone(existing.phone ?? '')
    setNumbering(existingPrefix ? 'own' : 'shared')
    setPrefix(existingPrefix ?? '')
    setFilledFrom(existing.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, existingPrefix])

  // A shared series continues the company's own numbering, whose next number this screen cannot
  // read, so it promises none.
  const firstInvoice = useMemo(
    () => (numbering === 'own' ? firstInvoiceFor(prefix) : null),
    [numbering, prefix],
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
  const hasPhone = phone.trim().length > 0
  const canAdd = named && prefixOk && !saving

  const submit = async () => {
    setSaveFailed(false)
    setSaving(true)
    try {
      const attributes = {
        code: existing?.code ?? codeFromName(name, takenCodes),
        name,
        type: existing?.type ?? ('STORE' as const),
        address: street || null,
        city: town || null,
        state: GOVERNORATE_NAMES[governorate as GovernorateId] ?? null,
        country: 'OM',
        postalCode: postalCode || null,
        phone: phone || null,
        email: existing?.email ?? null,
      }
      const saved = existing
        ? await updateBranch(existing.id, attributes, true, existing.version)
        : await createBranch(attributes)
      if (numbering === 'own' && prefix.trim()) {
        await assignInvoicePrefix(saved.id, prefix.trim())
      }
      // Only on a read that says there were none: a failed overview reads as zero, and would have
      // moved the head office to whatever branch was added next.
      if (!existing && overview.status === 'ready' && everCount === 0) {
        await designateHeadOffice(saved.id)
      }
      navigate('/settings/branches')
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  if (id && existingRead.status === 'loading') {
    return (
      <SettingsShell group="company">
        <SettingsHeader title={t('addBranch.title')} subtitle={t('addBranch.subtitle')} />
      </SettingsShell>
    )
  }

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
        {(['whereItIs', 'numbering'] as const).map((step, index) => {
          const done = index === 0 ? named : prefixOk
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
              {index < 1 ? (
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
                <span className="mb-1 flex items-center gap-0.5 text-sm font-medium text-text-primary">
                  {t('addBranch.streetAddress')}
                  <span className="text-xl leading-4 text-primary-700">*</span>
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
                  <span className="mb-1 block text-sm font-medium text-text-primary">
                    {t('addBranch.governorate')}
                  </span>
                  <Select
                    ariaLabel={t('addBranch.governorate')}
                    placeholder={t('addBranch.chooseGovernorate')}
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
              </div>
            </div>
          </Panel>

          <Panel title={t('addBranch.numbering')} note={t('addBranch.numberingNote')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-primary">
                  {t('addBranch.numberingLabel')}
                </span>
                <Select
                  ariaLabel={t('addBranch.numberingLabel')}
                  value={numbering}
                  onChange={(value) => setNumbering(value as 'own' | 'shared')}
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
                {firstInvoice ? (
                  <span dir="ltr" className="font-mono text-base font-semibold text-text-primary">
                    {firstInvoice}
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-text-primary">
                    {t('addBranch.continuesCompanySeries')}
                  </span>
                )}
              </span>
              <span className="text-xs font-medium text-text-quaternary">
                {t('addBranch.thenOnwards')}
              </span>
            </p>
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
                      {t(`addBranch.behave.${row.id}Note`, { name: name || t('addBranch.thisBranch') })}
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
          <InheritsCard />

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('addBranch.ready')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              <Check
                done={named}
                label={t('addBranch.check.named')}
              />
              <Check
                done={prefixOk}
                label={
                  !prefixOk
                    ? t('addBranch.check.prefixMissing')
                    : numbering === 'own'
                      ? t('addBranch.check.prefixChosen', { prefix })
                      : t('addBranch.check.sharedSeries')
                }
              />
              <Check
                done={hasPhone}
                label={hasPhone ? t('addBranch.check.phone') : t('addBranch.check.noPhone')}
              />
            </ul>
          </section>

          <PlanCard adding={!existing} />
        </aside>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {saveFailed ? (
            <span role="alert" className="text-danger-700">
              {t('addBranch.saveFailed')}
            </span>
          ) : canAdd ? (
            firstInvoice ? (
              t('addBranch.footerOwn', { name, invoice: firstInvoice })
            ) : (
              t('addBranch.footerShared', { name })
            )
          ) : (
            t('addBranch.footerUnnamed')
          )}
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
            onClick={submit}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {saving
              ? t('addBranch.saving')
              : existing
                ? t('addBranch.saveChanges')
                : t('addBranch.addTheBranch')}
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

/**
 * What a branch takes from the company. Each row comes from the server or is left out: the card
 * used to print a sample company's name, VAT number and Participant ID.
 */
function InheritsCard() {
  const { t } = useTranslation()
  const profile = useApiRead<CompanyProfileDto>(COMPANY_PROFILE_PATH, loadCompanyProfile).read
  const standing = useApiRead<ParticipantIdStanding>(PARTICIPANT_STANDING_PATH).read
  const company = profile.status === 'ready' ? profile.data : null
  const verification =
    standing.status === 'ready' && standing.data.state === 'VERIFIED'
      ? standing.data.verification
      : null
  const rows = [
    company?.legalName ? { id: 'company', value: company.legalName, mono: false } : null,
    company?.taxNumber ? { id: 'vat', value: company.taxNumber, mono: true } : null,
    verification
      ? {
          id: 'peppol',
          value: `${verification.participantScheme}:${verification.participantValue}`,
          mono: true,
        }
      : null,
    { id: 'logo', value: t('addBranch.shared'), mono: false },
  ].filter((row) => row !== null)

  return (
    <section className="rounded-md bg-surface-card p-5">
      <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
        {t('addBranch.inherits')}
      </h3>
      <dl className="mt-2">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className={[
              'flex items-center justify-between gap-3 py-2.5',
              index < rows.length - 1 ? 'border-b border-surface-background' : '',
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
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * The plan's branch allowance, from `GET /v1/settings/plan`. Hidden when it cannot be read: the
 * card used to quote a sample plan's allowance and a per-branch price no plan carries.
 */
function PlanCard({ adding }: { adding: boolean }) {
  const { t } = useTranslation()
  const plan = useApiRead<PlanOverviewDto>(PLAN_OVERVIEW_PATH, loadPlanOverview).read
  // `plan` is always present on a real answer; an answer without it says nothing about branches.
  if (plan.status !== 'ready' || !plan.data.plan) return null
  const included = plan.data.plan.branchesIncluded
  const used = plan.data.activeBranches + (adding ? 1 : 0)
  const within = included === null || used <= included

  return (
    <section className="rounded-md bg-surface-card p-5">
      <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
        {t('addBranch.cost')}
      </h3>
      <dl className="mt-2">
        <Row
          label={t('addBranch.branchesUsed')}
          value={
            included === null
              ? t('addBranch.usedOfUnlimited', { used })
              : t('addBranch.usedOf', { used, total: included })
          }
        />
        <Row
          label={t('addBranch.thisOne')}
          value={within ? t('addBranch.withinPlan') : t('addBranch.beyondPlan')}
          last
        />
      </dl>
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
