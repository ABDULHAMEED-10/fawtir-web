import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { BranchRoster } from './BranchRoster'
import { CloseBranchDialog } from './CloseBranchDialog'
import { DateField, Input, Select, Switch } from '../../components/ui'
import { useCan } from '../../lib/session/session'
import { useBranchAccessOn } from '../../lib/identity/branchAccessSwitch'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'
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
  PAID_EXTRAS_PATH,
  PAID_EXTRAS_ROUTE,
  extraPlaceRequired,
  loadPaidExtras,
  type PaidExtrasOverviewDto,
} from '../../api/settings/paidExtras'
import { setBranchOpen } from '../../api/settings/removals'
import {
  SUBSCRIPTION_PATH,
  loadSubscription,
  type SubscriptionStatusDto,
} from '../../api/settings/subscription'
import { placeSentence, useRemovalFailureText } from '../../lib/removalRefusals'
import {
  assignInvoicePrefix,
  codeFromName,
  createBranch,
  designateHeadOffice,
  loadBranch,
  loadBranchOverview,
  updateBranch,
  branchPath,
  branchDisplayName,
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
 * The Arabic name is the branch's `nameAr` (V303), sent with the create and the update in the same
 * call (backend #682); an emptied one is sent as "" to remove it. If the answer shows it was not
 * kept, the screen says so and the next save sends it again on the branch already created; it
 * never creates a second one. `BranchAttributes`
 * has no field for the "behaviour" switches below; they are not sent. See docs/backend-guides/INCOME.md, "Update
 * 2026-09-27 (branches)". A new branch starts empty: the form used to open pre-filled with the
 * design's worked example (Sur, 411, Ash Sharqiyah South, prefix SR), which a hurried save would
 * have created for real. The opening-date picker and the "who works there" roster went for the
 * same reason: neither was sent, and the roster listed sample people.
 */
export function AddBranchPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  // Inviting is a user-management action; the link is offered only to those who may.
  // Nobody new is added while the subscription is read-only (ST-2).
  const mayAddPeople = useSubscriptionAllows('ADD_PEOPLE')
  const canInvite = useCan('admin.users.manage') && mayAddPeople
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
  const takenCodes =
    overview.status === 'ready' ? overview.data.branches.map((row) => row.code) : []
  // The prefix is the overview's own figure (BranchDetail carries no invoicePrefix field).
  const overviewReady = overview.status === 'ready'
  const existingPrefix = overviewReady
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
  // The branch this form already created: a later save updates it rather than creating another.
  const [created, setCreated] = useState<BranchDetailDto | null>(null)
  // 'save': created, but the Arabic name was not saved. 'clear': saved, but the Arabic name stayed.
  const [arabicProblem, setArabicProblem] = useState<'save' | 'clear' | null>(null)
  // BR-3: at the plan's branch capacity the server asks for a paid place first.
  const [needsPlace, setNeedsPlace] = useState(false)
  const mayBuyPlaces = useCan('tenant.plan.manage')

  // A reopened branch fills once its real data arrives, not on every keystroke after. The loading
  // gate below hides the form while the fetch is in flight; for one render after it resolves, a
  // field can still show the empty new-branch value from before this effect runs. Keying the form
  // by `existing?.id` would remove that frame at the cost of a bigger split; not done here.
  const [filledFrom, setFilledFrom] = useState(() => existing?.id)
  useEffect(() => {
    if (!existing || existing.id === filledFrom) return
    setName(existing.name)
    setArabicName(existing.nameAr ?? '')
    setStreet(existing.address ?? '')
    setTown(existing.city ?? '')
    setPostalCode(existing.postalCode ?? '')
    setGovernorate(governorateIdFor(existing.state) ?? '')
    setPhone(existing.phone ?? '')
    setFilledFrom(existing.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing])

  // The prefix comes from the overview, which can answer after the branch itself. Filling the
  // numbering with the branch read a branch with its own series as "carries on the company
  // series" whenever the overview was still in flight; it is filled once the overview has answered.
  const [numberingFrom, setNumberingFrom] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!existing || !overviewReady || existing.id === numberingFrom) return
    setNumbering(existingPrefix ? 'own' : 'shared')
    setPrefix(existingPrefix ?? '')
    setNumberingFrom(existing.id)
  }, [existing, overviewReady, existingPrefix, numberingFrom])

  // Closing the branch from its own page (BR-2, BR-4): the same dialog as the list's menu. The Head
  // Branch is never closed, and a closed one is reopened from the list, so neither is offered it.
  const subscription = useApiRead<SubscriptionStatusDto>(SUBSCRIPTION_PATH, loadSubscription).read
  const renewsOn = subscription.status === 'ready' ? (subscription.data.renewsOn ?? null) : null
  const failureText = useRemovalFailureText()
  const [closing, setClosing] = useState(false)
  const [closeBusy, setCloseBusy] = useState(false)
  const [closeFailure, setCloseFailure] = useState<string | null>(null)
  const mayClose = Boolean(
    existing && existing.active && !existing.headOffice && !existing.headBranch,
  )
  const closeNow = async () => {
    if (!existing) return
    setCloseBusy(true)
    setCloseFailure(null)
    try {
      await setBranchOpen(existing.id, false)
      const done = placeSentence(
        t,
        'removal.branch',
        'done',
        renewsOn,
        i18n.language,
        branchDisplayName(existing, i18n.language),
      )
      navigate('/settings/branches', { state: { done } })
    } catch (error) {
      setCloseFailure(failureText(error))
      setCloseBusy(false)
    }
  }

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
    setArabicProblem(null)
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
      const arabic = arabicName.trim()
      const base = existing ?? created
      let saved: BranchDetailDto
      let clearAsked = false
      if (base) {
        // Text sets the Arabic name; an emptied one asks for it to be removed; else it is left.
        clearAsked = !arabic && Boolean(base.nameAr?.trim())
        // A closed branch stays closed when its details are saved; reopening is its own action.
        saved = await updateBranch(
          base.id,
          attributes,
          base.active,
          base.version,
          arabic ? arabic : clearAsked ? '' : undefined,
        )
        if (!existing) setCreated(saved)
      } else {
        saved = await createBranch(attributes, arabic)
        setCreated(saved)
        if (arabic && !saved.nameAr?.trim()) {
          // The branch exists without its Arabic name. The next save sends it on this branch.
          setArabicProblem('save')
          return
        }
      }
      if (numbering === 'own' && prefix.trim()) {
        await assignInvoicePrefix(saved.id, prefix.trim())
      }
      // Only on a read that says there were none: a failed overview reads as zero, and would have
      // moved the head office to whatever branch was added next.
      if (!existing && overview.status === 'ready' && everCount === 0) {
        await designateHeadOffice(saved.id)
      }
      if (clearAsked && saved.nameAr?.trim()) {
        // Everything else is saved; say so rather than leave as if the Arabic name were gone.
        setArabicProblem('clear')
        return
      }
      navigate('/settings/branches')
    } catch (error) {
      setNeedsPlace(extraPlaceRequired(error) === 'BRANCH')
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
                {/* TODO(backend): docs/backend-guides/SETTINGS.md row 3.2. BranchAttributes has no
                    opening date, so the designed picker is drawn but cannot be set yet. */}
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text-primary">
                    {t('addBranch.opens')}
                  </span>
                  <DateField
                    ariaLabel={t('addBranch.opens')}
                    value=""
                    onChange={() => {}}
                    disabled
                    placeholder={t('addBranch.notAvailableYet')}
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

          {/* Who works there (BA-1): GET/PUT /v1/branches/{id}/people, once the branch exists and
              branch access is on. While it is off, TODO(backend): docs/backend-guides/SETTINGS.md
              row 3.3 as before (everyone works in every branch, BA-6). */}
          <Panel
            title={t('addBranch.whoWorksThere')}
            note={t('addBranch.whoWorksThereNote')}
            action={
              canInvite ? (
                <Link
                  to="/settings/team/invite"
                  className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                >
                  {t('addBranch.inviteSomeoneNew')}
                </Link>
              ) : undefined
            }
          >
            <WhoWorksThere branchId={existing?.id ?? null} />
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
                      {t(`addBranch.behave.${row.id}Note`, {
                        name: name || t('addBranch.thisBranch'),
                      })}
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
              <Check done={named} label={t('addBranch.check.named')} />
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
          {saveFailed && needsPlace ? (
            <span role="alert" className="text-danger-700">
              {t('paidExtras.refusal.extraPlace.BRANCH')}{' '}
              {mayBuyPlaces ? (
                <Link to={PAID_EXTRAS_ROUTE} className="font-semibold underline">
                  {t('paidExtras.refusal.extraPlaceLink')}
                </Link>
              ) : (
                t('paidExtras.refusal.extraPlaceAsk')
              )}
            </span>
          ) : saveFailed ? (
            <span role="alert" className="text-danger-700">
              {t('addBranch.saveFailed')}
            </span>
          ) : arabicProblem ? (
            <span role="alert" className="text-danger-700">
              {t(
                arabicProblem === 'save'
                  ? 'addBranch.arabicNameNotSaved'
                  : 'addBranch.arabicNameNotRemoved',
              )}
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
          {existing ? (
            mayClose ? (
              <button
                type="button"
                onClick={() => {
                  setCloseFailure(null)
                  setClosing(true)
                }}
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('addBranch.closeThisBranch')}
              </button>
            ) : null
          ) : (
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('addBranch.saveDraft')}
            </button>
          )}
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

      {existing ? (
        <CloseBranchDialog
          open={closing}
          name={branchDisplayName(existing, i18n.language)}
          renewsOn={renewsOn}
          busy={closeBusy}
          failure={closeFailure}
          onCancel={() => setClosing(false)}
          onConfirm={() => void closeNow()}
        />
      ) : null}
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
 *
 * BR-3: a paid branch place counts like an included one, so the allowance is the server's
 * `capacity` from `GET /v1/settings/plan/extras` (included plus the paid places covering today).
 * When that cannot be read the card falls back to what the plan includes.
 */
function PlanCard({ adding }: { adding: boolean }) {
  const { t } = useTranslation()
  const plan = useApiRead<PlanOverviewDto>(PLAN_OVERVIEW_PATH, loadPlanOverview).read
  const extras = useApiRead<PaidExtrasOverviewDto>(PAID_EXTRAS_PATH, loadPaidExtras).read
  // `plan` is always present on a real answer; an answer without it says nothing about branches.
  if (plan.status !== 'ready' || !plan.data.plan) return null
  // Wait for the paid places too, so the card never flips from "beyond" to "within" on load.
  if (extras.status === 'loading') return null
  const branchPlaces = extras.status === 'ready' ? extras.data.branches : undefined
  const included =
    plan.data.plan.branchesIncluded === null
      ? null
      : branchPlaces && branchPlaces.capacity != null
        ? branchPlaces.capacity
        : plan.data.plan.branchesIncluded
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

/**
 * Inside the shell, which is what provides the session that says whether branch access is on.
 * Off: the roster is not offered yet (SETTINGS.md row 3.3), as before.
 */
function WhoWorksThere({ branchId }: { branchId: string | null }) {
  const { t } = useTranslation()
  const branchAccessOn = useBranchAccessOn()
  if (!branchAccessOn) {
    return (
      <p className="text-sm font-medium text-text-quaternary">{t('addBranch.notAvailableYet')}</p>
    )
  }
  if (branchId) return <BranchRoster branchId={branchId} />
  return (
    <p className="text-sm font-medium text-text-quaternary">
      {t('branchAccess.roster.afterAdding')}
    </p>
  )
}
