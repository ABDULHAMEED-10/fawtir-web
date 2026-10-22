import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { ActionMenu, Button, Modal, Rial } from '../../components/ui'
import { Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { formatAmount, formatDate } from '../../lib/format'
import {
  branchDisplayName,
  BRANCHES_OVERVIEW_PATH,
  loadBranchOverview,
  type BranchOverviewDto,
  type BranchOverviewRow,
} from '../../api/settings/branches'
import { PLAN_OVERVIEW_PATH, loadPlanOverview, type PlanOverviewDto } from '../../api/settings/plan'
import { setBranchOpen } from '../../api/settings/removals'
import {
  SUBSCRIPTION_PATH,
  loadSubscription,
  type SubscriptionStatusDto,
} from '../../api/settings/subscription'
import { placeSentence, useRemovalFailureText } from '../../lib/removalRefusals'
import plusIcon from '../../assets/settings/plus-white.svg'
import plusBrandIcon from '../../assets/settings/plus-brand.svg'
import lockIcon from '../../assets/settings/menu-key.svg'
import editIcon from '../../assets/settings/menu-edit.svg'
import peopleIcon from '../../assets/settings/menu-people.svg'
import numberingIcon from '../../assets/settings/menu-numbering.svg'
import deviceIcon from '../../assets/settings/menu-device.svg'
import chartIcon from '../../assets/settings/menu-chart.svg'
import invoiceIcon from '../../assets/settings/menu-invoice.svg'
import copySettingsIcon from '../../assets/settings/menu-copy.svg'
import closeIcon from '../../assets/settings/menu-close.svg'

/**
 * Settings › Branches (Figma 135:37541), from `GET /v1/branches/overview`.
 *
 * The design draws a few facts the backend does not model per branch — who manages it, the
 * roster's own initials, and how recently a till was used (`BranchOverview`'s own javadoc names
 * the gaps: no branch-manager concept, a person has one home branch, no per-till usage log). Those
 * cells fall back to a plain count instead; nothing here is invented. See
 * docs/backend-guides/INCOME.md, "Update 2026-09-27 (branches)".
 */
export function BranchesPage() {
  const { t } = useTranslation()
  const overviewRead = useApiRead<BranchOverviewDto>(BRANCHES_OVERVIEW_PATH, () =>
    loadBranchOverview(),
  )
  const overview = overviewRead.read
  // When a closed branch's paid place ends (the next renewal, BR-4); undated if unreadable.
  const subscription = useApiRead<SubscriptionStatusDto>(SUBSCRIPTION_PATH, loadSubscription).read
  const renewsOn = subscription.status === 'ready' ? (subscription.data.renewsOn ?? null) : null
  const [done, setDone] = useState<string | null>(null)
  const afterChange = (message: string) => {
    setDone(message)
    overviewRead.retry()
  }

  return (
    <SettingsShell group="company">
      <SettingsHeader
        title={t('branches.title')}
        subtitle={t('branches.subtitle')}
        actions={
          <Link
            to="/settings/branches/new"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-4" />
            {t('branches.addBranch')}
          </Link>
        }
      />

      {done ? (
        <Notice body={done} action={{ label: t('common.close'), onClick: () => setDone(null) }} />
      ) : null}

      {overview.status === 'ready' ? (
        <Content overview={overview.data} renewsOn={renewsOn} onDone={afterChange} />
      ) : null}

      <Link
        to="/settings/branches/new"
        className="inline-flex h-[62px] w-full items-center justify-center gap-2 rounded-md border border-dashed border-border-default bg-white/50 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-25"
      >
        <img src={plusBrandIcon} alt="" className="size-4" />
        {t('branches.addBranch')}
      </Link>
    </SettingsShell>
  )
}

/**
 * The plan's branch allowance from `GET /v1/settings/plan`. It used to be a sample plan's figure
 * with "no extra charge until the sixth", a price no plan carries.
 */
function IncludedKpi() {
  const { t } = useTranslation()
  const plan = useApiRead<PlanOverviewDto>(PLAN_OVERVIEW_PATH, loadPlanOverview).read
  const ready = plan.status === 'ready' && plan.data.plan ? plan.data : null
  const included = ready ? ready.plan.branchesIncluded : undefined
  return (
    <Kpi
      label={t('branches.kpi.included')}
      value={included === undefined || included === null ? '—' : String(included)}
      unit={t('branches.kpi.includedUnit')}
      note={
        ready === null
          ? t('branches.kpi.includedUnavailable')
          : included === null
            ? t('branches.kpi.includedUnlimited')
            : t('branches.kpi.includedFromPlan', { plan: ready.plan.name })
      }
    />
  )
}

function Content({
  overview,
  renewsOn,
  onDone,
}: {
  overview: BranchOverviewDto
  renewsOn: string | null
  onDone: (message: string) => void
}) {
  const { t } = useTranslation()

  if (overview.branches.length === 0) {
    return (
      <div className="rounded-md bg-surface-card p-8 text-center">
        <h3 className="text-lg font-semibold text-text-primary">{t('branches.empty.title')}</h3>
        <p className="mx-auto mt-1.5 max-w-md text-sm font-medium text-text-quaternary">
          {t('branches.empty.body')}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={t('branches.kpi.open')}
          value={String(overview.openCount)}
          unit={t('branches.kpi.openOf', { count: overview.everCount })}
          note={t('branches.kpi.openNoteGeneric')}
        />
        <Kpi
          label={t('branches.kpi.people')}
          value={String(overview.peopleAcross)}
          note={t('branches.kpi.peopleNoteGeneric')}
        />
        <Kpi
          label={t('branches.kpi.invoices')}
          value={overview.invoicesThisMonth.toLocaleString('en-US')}
          note={t('branches.kpi.invoicesNoteGeneric')}
        />
        <IncludedKpi />
      </div>

      {overview.branches.map((branch) => (
        <BranchCard key={branch.id} branch={branch} renewsOn={renewsOn} onDone={onDone} />
      ))}
    </>
  )
}

function Kpi({
  label,
  value,
  unit,
  note,
}: {
  label: string
  value: string
  unit?: string
  note: string
}) {
  return (
    <article className="rounded-md bg-surface-card p-5">
      <h3 className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
        {label}
      </h3>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
          {value}
        </span>
        {unit ? <span className="text-sm font-medium text-text-quaternary">{unit}</span> : null}
      </p>
      <p className="mt-2 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

function BranchCard({
  branch,
  renewsOn,
  onDone,
}: {
  branch: BranchOverviewRow
  renewsOn: string | null
  onDone: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const closed = !branch.active
  const failureText = useRemovalFailureText()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const name = branchDisplayName(branch, i18n.language)

  const run = async (work: () => Promise<string>) => {
    setBusy(true)
    setFailure(null)
    try {
      const message = await work()
      setConfirming(false)
      onDone(message)
    } catch (error) {
      setFailure(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  // Option (a), 21 Oct 2026: the branch closes now; its paid place stays until the renewal.
  const close = () =>
    run(async () => {
      await setBranchOpen(branch.id, false)
      return placeSentence(t, 'removal.branch', 'done', renewsOn, i18n.language, name)
    })

  return (
    <section
      className={['overflow-hidden rounded-md bg-surface-card', closed ? 'opacity-70' : ''].join(
        ' ',
      )}
    >
      <div className="flex flex-wrap items-center gap-4 p-5">
        <span
          className={[
            'flex size-11 shrink-0 items-center justify-center rounded-md text-sm font-semibold',
            branch.headOffice
              ? 'bg-primary-700 text-white'
              : closed
                ? 'bg-surface-background text-text-quaternary'
                : 'bg-primary-50 text-primary-800',
          ].join(' ')}
        >
          {branch.code}
        </span>

        <div className="min-w-[220px] flex-1">
          <p className="flex flex-wrap items-center gap-2.5">
            <span
              className={[
                'text-xl font-medium leading-[1.2]',
                closed ? 'text-text-quaternary' : 'text-text-primary',
              ].join(' ')}
            >
              {branchDisplayName(branch, i18n.language)}
            </span>
            {branch.headBranch ? (
              <span className="inline-flex h-[22px] items-center rounded-[3px] bg-primary-50 px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-primary-800">
                {t('branches.headBranch')}
              </span>
            ) : null}
            {branch.headOffice ? (
              <span className="inline-flex h-[22px] items-center rounded-[3px] bg-primary-50 px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-primary-800">
                {t('branches.headOffice')}
              </span>
            ) : null}
            <StatePill branch={branch} />
          </p>
          {branch.headOffice ? (
            <p className="mt-1 text-sm font-medium leading-[1.4] text-text-quaternary">
              {t('branches.theRegisteredAddress')}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={`/settings/branches/${branch.id}`}
            className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('branches.openIt')}
          </Link>
          <ActionMenu
            size="md"
            label={t('branches.menu.thisBranch')}
            items={[
              {
                id: 'section-branch',
                sectionKey: 'branches.menu.thisBranch',
                labelKey: 'branches.menu.changeDetails',
                icon: editIcon,
                to: `/settings/branches/${branch.id}`,
              },
              {
                id: 'who',
                labelKey: 'branches.menu.whoWorksHere',
                icon: peopleIcon,
                hint: String(branch.people),
                to: '/settings/team',
              },
              {
                id: 'numbering',
                labelKey: 'branches.menu.numbering',
                icon: numberingIcon,
                hint: branch.invoicePrefix ? `${branch.invoicePrefix}-INV` : 'INV',
              },
              {
                id: 'tills',
                labelKey: 'branches.menu.tillDevices',
                icon: deviceIcon,
                hint: String(branch.devices),
              },
              {
                id: 'trading',
                sectionKey: 'branches.menu.haveALook',
                labelKey: 'branches.menu.howItsTrading',
                icon: chartIcon,
                to: '/reports/income',
              },
              {
                id: 'invoices',
                labelKey: 'branches.menu.itsInvoices',
                icon: invoiceIcon,
                hint: branch.invoicesThisMonth.toLocaleString('en-US'),
                to: '/invoices',
              },
              {
                id: 'copy',
                labelKey: 'branches.menu.copySettings',
                icon: copySettingsIcon,
                to: '/settings/branches/new',
              },
              // The Head Branch is never closed (BR-2, BR-5), so it is not offered.
              ...(branch.active && !branch.headOffice && !branch.headBranch
                ? [
                    {
                      id: 'close',
                      labelKey: 'branches.menu.closeBranch',
                      icon: closeIcon,
                      danger: true,
                      onSelect: () => {
                        setFailure(null)
                        setConfirming(true)
                      },
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>

      {closed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background bg-surface-background/50 px-5 py-4">
          <p className="flex min-w-0 flex-1 basis-[320px] items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary">
            <img src={lockIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-60" />
            {/* TODO(backend): SETTINGS.md row 3.1. The frame counts the branch's invoices ("Its 612
                invoices"); the overview has this month's count only, which is 0 once closed. */}
            <span>
              {t('branches.closedNoteNoCount', {
                prefix: branch.invoicePrefix ? `${branch.invoicePrefix}-INV` : 'INV',
              })}
            </span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await setBranchOpen(branch.id, true)
                return t('removal.branch.reopened', { name })
              })
            }
            className="inline-flex h-[38px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {busy ? t('removal.saving') : t('branches.reopenIt')}
          </button>
          {failure && !confirming ? (
            <p role="alert" className="basis-full text-sm font-medium text-danger-700">
              {failure}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          {failure && !confirming ? (
            <p
              role="alert"
              className="border-t border-surface-background px-5 py-3 text-sm font-medium text-danger-700"
            >
              {failure}
            </p>
          ) : null}
          <dl className="grid border-t border-surface-background sm:grid-cols-2 xl:grid-cols-4">
            <Cell label={t('branches.col.numbering')}>
              <p dir="ltr" className="text-left font-mono text-sm font-semibold text-text-primary">
                {branch.invoicePrefix ? `${branch.invoicePrefix}-INV-####` : 'INV-####'}
              </p>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t(branch.invoicePrefix ? 'branches.ownSeries' : 'branches.noPrefix')}
                {branch.nextNumber != null
                  ? ` · ${t('branches.atNumber', { number: branch.nextNumber })}`
                  : ''}
              </p>
            </Cell>

            <Cell label={t('branches.col.thisMonth')}>
              <p className="flex items-baseline gap-1.5">
                <span className="text-lg font-semibold text-text-primary tabular-nums">
                  {branch.invoicesThisMonth}
                </span>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('branches.invoicesUnit')}
                </span>
              </p>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                <Rial /> {formatAmount(branch.invoicedThisMonth, 'OMR', i18n.language)}
              </p>
            </Cell>

            <Cell label={t('branches.col.whoWorksHere')}>
              <p className="flex items-baseline gap-1.5">
                {branch.people === 0 ? (
                  <span className="text-lg font-semibold text-text-primary">
                    {t('branches.none')}
                  </span>
                ) : (
                  <span className="text-lg font-semibold text-text-primary tabular-nums">
                    {t('branches.peopleCount', { count: branch.people })}
                  </span>
                )}
              </p>
            </Cell>

            <Cell label={t('branches.col.till')}>
              <p className="flex items-baseline gap-1.5">
                {branch.devices === 0 ? (
                  <span className="text-lg font-semibold text-text-primary">
                    {t('branches.none')}
                  </span>
                ) : (
                  <>
                    <span className="text-lg font-semibold text-text-primary tabular-nums">
                      {branch.devices}
                    </span>
                    <span className="text-xs font-medium text-text-quaternary">
                      {t('branches.devices', { count: branch.devices })
                        .replace(String(branch.devices), '')
                        .trim()}
                    </span>
                  </>
                )}
              </p>
            </Cell>
          </dl>
        </>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('removal.branch.title', { name })}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" size="md" onClick={() => setConfirming(false)}>
              {t('removal.cancel')}
            </Button>
            <Button size="md" disabled={busy} onClick={() => void close()}>
              {busy ? t('removal.saving') : t('removal.branch.confirm')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {t('removal.branch.body', { name })}
          </p>
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {placeSentence(t, 'removal.branch', 'place', renewsOn, i18n.language, name)}
          </p>
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {t('removal.branch.records')}
          </p>
          {failure ? (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {failure}
            </p>
          ) : null}
        </div>
      </Modal>
    </section>
  )
}

function StatePill({ branch }: { branch: BranchOverviewRow }) {
  const { t, i18n } = useTranslation()
  if (!branch.active) {
    return (
      <span className="inline-flex h-[22px] items-center gap-1.5 rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
        <span className="size-1.5 rounded-full bg-[#a8abb2]" />
        {branch.closedOn
          ? t('branches.closedOn', { date: formatDate(branch.closedOn, i18n.language) })
          : t('branches.open')}
      </span>
    )
  }
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-[3px] bg-success-100 px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#3d5648]">
      <span className="size-1.5 rounded-full bg-[#4c6c5a]" />
      {t('branches.open')}
    </span>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-e border-surface-background px-5 py-4 last:border-e-0">
      <dt className="text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.5px] text-text-quaternary">
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  )
}
