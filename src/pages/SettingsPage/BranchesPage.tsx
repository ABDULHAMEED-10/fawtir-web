import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { ActionMenu } from '../../components/ui'
import { INVOICES_THIS_MONTH } from '../../lib/settings'
import {
  BRANCHES,
  OPEN_BRANCHES,
  BRANCHES_EVER,
  PEOPLE_ACROSS_BRANCHES,
  PEOPLE_AT_MORE_THAN_ONE,
  BUSIEST_BRANCH,
  BRANCH_PLAN,
  type Branch,
} from '../../lib/settingsCompany'
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
 * Settings › Branches (Figma 135:37541).
 *
 * Each branch reports its own numbering, month, roster and tills. The four figures at the top
 * are read off those rows rather than stated, so a branch's month always adds into the company's.
 */
export function BranchesPage() {
  const { t } = useTranslation()

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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={t('branches.kpi.open')}
          value={String(OPEN_BRANCHES.length)}
          unit={t('branches.kpi.openOf', { count: BRANCHES_EVER })}
          note={t('branches.kpi.openNote', { name: 'Sohar', month: 'May' })}
        />
        <Kpi
          label={t('branches.kpi.people')}
          value={String(PEOPLE_ACROSS_BRANCHES)}
          note={t('branches.kpi.peopleNote', { count: PEOPLE_AT_MORE_THAN_ONE })}
        />
        <Kpi
          label={t('branches.kpi.invoices')}
          value={INVOICES_THIS_MONTH.toLocaleString('en-US')}
          note={t('branches.kpi.invoicesNote', {
            name: BUSIEST_BRANCH.name,
            share: BUSIEST_BRANCH.inEveryTen,
          })}
        />
        <Kpi
          label={t('branches.kpi.included')}
          value={String(BRANCH_PLAN.included)}
          unit={t('branches.kpi.includedUnit')}
          note={t('branches.kpi.includedNote')}
        />
      </div>

      {BRANCHES.map((branch) => (
        <BranchCard key={branch.id} branch={branch} />
      ))}

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

function BranchCard({ branch }: { branch: Branch }) {
  const { t } = useTranslation()
  const closed = branch.state === 'closed'

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
          {branch.initials}
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
            {branch.needsTill ? (
              <span className="inline-flex h-[22px] items-center gap-1.5 rounded-[3px] bg-pending-100 px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-pending-700">
                <span className="size-1.5 rounded-full bg-pending-500" />
                {t('branches.needsATill')}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-text-quaternary">
            {branch.address}
            {branch.addressNoteKey ? ` · ${t(branch.addressNoteKey)}` : ''}
          </p>
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
                hint: String(branch.staff.length),
                to: '/settings/team',
              },
              {
                id: 'numbering',
                labelKey: 'branches.menu.numbering',
                icon: numberingIcon,
                hint: branch.prefix ? `${branch.prefix}-INV` : 'INV',
              },
              {
                id: 'tills',
                labelKey: 'branches.menu.tillDevices',
                icon: deviceIcon,
                hint: String(branch.tills),
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
                hint: (branch.closedInvoices ?? branch.invoicesThisMonth).toLocaleString('en-US'),
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
                  count: (branch.closedInvoices ?? 0).toLocaleString('en-US'),
                  prefix: `${branch.prefix}-INV`,
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
              {branch.prefix ? `${branch.prefix}-INV-####` : 'INV-####'}
            </p>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {t(branch.numberingKey)} · {t('branches.atNumber', { number: branch.nextNumber })}
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
              OMR {branch.turnoverThisMonth}
              {branch.turnoverNoteKey ? ` · ${t(branch.turnoverNoteKey)}` : ''}
            </p>
          </Cell>

          <Cell label={t('branches.col.whoWorksHere')}>
            <span className="flex items-center gap-1">
              {branch.staff.map((initials) => (
                <span
                  key={initials}
                  className="flex size-6 items-center justify-center rounded-full bg-primary-50 text-[9px] font-semibold text-primary-800"
                >
                  {initials}
                </span>
              ))}
            </span>
            <p className="mt-1.5 text-xs font-medium text-text-quaternary">
              {t('branches.peopleManages', {
                count: branch.staff.length,
                who: branch.managedBy,
              })}
            </p>
          </Cell>

          <Cell label={t('branches.col.till')}>
            <p className="flex items-baseline gap-1.5">
              {branch.tills === 0 ? (
                <span className="text-lg font-semibold text-text-primary">
                  {t('branches.none')}
                </span>
              ) : (
                <>
                  <span className="text-lg font-semibold text-text-primary tabular-nums">
                    {branch.tills}
                  </span>
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('branches.devices', { count: branch.tills })
                      .replace(String(branch.tills), '')
                      .trim()}
                  </span>
                </>
              )}
            </p>
            <p className="mt-1 text-xs font-medium text-text-quaternary">{t(branch.tillNoteKey)}</p>
          </Cell>
        </dl>
      )}
    </section>
  )
}

function StatePill({ branch }: { branch: Branch }) {
  const { t } = useTranslation()
  if (branch.state === 'closed') {
    return (
      <span className="inline-flex h-[22px] items-center gap-1.5 rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
        <span className="size-1.5 rounded-full bg-[#a8abb2]" />
        {t('branches.closedOn', { date: branch.closedOn })}
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
