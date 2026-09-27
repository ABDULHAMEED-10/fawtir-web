import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { ActionMenu, Rial } from '../../components/ui'
import { useApiRead } from '../../hooks'
import {
  BRANCHES_OVERVIEW_PATH,
  loadBranchOverview,
  type BranchOverviewDto,
  type BranchOverviewRow,
} from '../../api/settings/branches'
import { BRANCH_PLAN } from '../../lib/settingsCompany'
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
  const overview = useApiRead<BranchOverviewDto>(BRANCHES_OVERVIEW_PATH, () =>
    loadBranchOverview(),
  ).read

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

      {overview.status === 'ready' ? <Content overview={overview.data} /> : null}

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

function Content({ overview }: { overview: BranchOverviewDto }) {
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
        <Kpi
          label={t('branches.kpi.included')}
          value={BRANCH_PLAN.included === Infinity ? '—' : String(BRANCH_PLAN.included)}
          unit={t('branches.kpi.includedUnit')}
          note={t('branches.kpi.includedNote')}
        />
      </div>

      {overview.branches.map((branch) => (
        <BranchCard key={branch.id} branch={branch} />
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

function BranchCard({ branch }: { branch: BranchOverviewRow }) {
  const { t } = useTranslation()
  const closed = !branch.active

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
              {branch.name}
            </span>
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
              {
                id: 'close',
                labelKey: 'branches.menu.closeBranch',
                icon: closeIcon,
                danger: true,
              },
            ]}
          />
        </div>
      </div>

      {closed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background bg-surface-background/50 px-5 py-4">
          <p className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary">
            <img src={lockIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-60" />
            <span
              dangerouslySetInnerHTML={{
                __html: t('branches.closedNote', {
                  count: branch.invoicesThisMonth.toLocaleString('en-US'),
                  prefix: `${branch.invoicePrefix ?? ''}-INV`,
                }),
              }}
            />
          </p>
          <button
            type="button"
            className="inline-flex h-[38px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('branches.reopenIt')}
          </button>
        </div>
      ) : (
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
              <Rial /> {branch.invoicedThisMonth.toFixed(3)}
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
      )}
    </section>
  )
}

function StatePill({ branch }: { branch: BranchOverviewRow }) {
  const { t } = useTranslation()
  if (!branch.active) {
    return (
      <span className="inline-flex h-[22px] items-center gap-1.5 rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
        <span className="size-1.5 rounded-full bg-[#a8abb2]" />
        {branch.closedOn ? t('branches.closedOn', { date: branch.closedOn }) : t('branches.open')}
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
