import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu } from '../../components/ui'
import { selfBillRowActions } from '../../lib/rowActions'
import {
  SELF_BILL_AGREEMENT_COUNT,
  SELF_BILL_KPI,
  SELF_BILL_PAGE_NUMBERS,
  SELF_BILL_ROWS,
  SELF_BILL_TABS,
  type AgreementTone,
  type SelfBillRow,
  type SelfBillStatus,
  type SelfBillTabId,
  type SelfBillTransmission,
} from '../../lib/selfBilling'
import raisedIcon from '../../assets/self-billing/kpi-raised.svg'
import inputVatIcon from '../../assets/self-billing/kpi-input-vat.svg'
import awaitingIcon from '../../assets/self-billing/kpi-awaiting.svg'
import expiringIcon from '../../assets/self-billing/kpi-expiring.svg'
import agreementsIcon from '../../assets/self-billing/agreements.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/invoices/sort.svg'
import filterIcon from '../../assets/credit-notes/filter.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const KPI_ICONS = {
  raised: raisedIcon,
  inputVat: inputVatIcon,
  awaiting: awaitingIcon,
  expiring: expiringIcon,
} as const

/** Status pill fills read straight off the Figma labels. */
const STATUS_STYLES: Record<SelfBillStatus, { bg: string; fg: string; labelKey: string }> = {
  draft: { bg: 'bg-neutral-25', fg: 'text-neutral-700', labelKey: 'selfBilling.status.draft' },
  toBeSent: { bg: 'bg-primary-25', fg: 'text-primary-900', labelKey: 'selfBilling.status.toBeSent' },
  awaitingConfirmation: {
    bg: 'bg-pending-100',
    fg: 'text-pending-700',
    labelKey: 'selfBilling.status.awaitingConfirmation',
  },
  disputed: { bg: 'bg-danger-100', fg: 'text-danger-700', labelKey: 'selfBilling.status.disputed' },
  confirmed: { bg: 'bg-success-100', fg: 'text-success-700', labelKey: 'selfBilling.status.confirmed' },
  paid: { bg: 'bg-success-100', fg: 'text-success-700', labelKey: 'selfBilling.status.paid' },
}

/** Same convention as the invoices list: AP/AB/RE spelled out, AB blue to mark "unconfirmed". */
const TRANSMISSION_STYLES: Record<
  SelfBillTransmission,
  { bg: string; fg: string; labelKey: string; titleKey: string }
> = {
  accepted: {
    bg: 'bg-success-100',
    fg: 'text-success-700',
    labelKey: 'invoicesPage.transmission.accepted',
    titleKey: 'invoicesPage.transmission.acceptedHint',
  },
  acknowledged: {
    bg: 'bg-primary-25',
    fg: 'text-primary-700',
    labelKey: 'invoicesPage.transmission.acknowledged',
    titleKey: 'invoicesPage.transmission.acknowledgedHint',
  },
  rejected: {
    bg: 'bg-danger-100',
    fg: 'text-danger-700',
    labelKey: 'invoicesPage.transmission.rejected',
    titleKey: 'invoicesPage.transmission.rejectedHint',
  },
}

const AGREEMENT_TONE: Record<AgreementTone, string> = {
  ok: 'text-text-tertiary',
  expiring: 'text-pending-700',
  missing: 'text-danger-700',
}

function SelfBillingHeader() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('selfBilling.title')}
        </h1>
        <p className="mt-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('selfBilling.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/income/self-billing/agreements"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={agreementsIcon} alt="" className="size-6" />
          {t('selfBilling.agreements')}
          <span className="inline-flex size-[19px] items-center justify-center rounded-full bg-neutral-50 text-xs font-semibold text-text-tertiary">
            {SELF_BILL_AGREEMENT_COUNT}
          </span>
        </Link>
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={exportIcon} alt="" className="size-6 rotate-180" />
          {t('selfBilling.export')}
        </button>
        <Link
          to="/income/self-billing/new"
          className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-6" />
          {t('selfBilling.create')}
          <img src={chevronIcon} alt="" className="size-[18px] brightness-0 invert rtl:rotate-180" />
        </Link>
      </div>
    </div>
  )
}

function SelfBillingKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {SELF_BILL_KPI.map((kpi) => (
        <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-3.5">
            <img src={KPI_ICONS[kpi.icon]} alt="" className="size-11 shrink-0" />
            <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t(kpi.titleKey)}
            </h3>
          </div>
          <div className="flex items-baseline gap-1">
            {kpi.withCurrency ? (
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0 self-center" />
            ) : null}
            <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
              {kpi.amount}
            </p>
          </div>
          <p
            className={[
              'text-sm font-medium leading-[1.2]',
              'metaDanger' in kpi && kpi.metaDanger ? 'text-danger-700' : 'text-text-tertiary',
            ].join(' ')}
          >
            {t(kpi.metaKey)}
          </p>
        </article>
      ))}
    </div>
  )
}

function SelfBillRowCells({ row }: { row: SelfBillRow }) {
  const { t } = useTranslation()
  const status = STATUS_STYLES[row.status]
  const tx = row.transmission ? TRANSMISSION_STYLES[row.transmission] : null

  return (
    <>
      <td className="px-2 py-2.5 text-sm font-semibold text-text-quaternary">{row.id}</td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">{row.supplier}</p>
        <p
          className={[
            'mt-1 text-xs font-medium leading-[1.2]',
            AGREEMENT_TONE[row.agreementTone],
          ].join(' ')}
        >
          {row.agreementNote}
        </p>
      </td>
      <td className="px-2 py-2.5 text-sm font-medium text-text-tertiary">{row.issued}</td>
      <td className="px-2 py-2.5 text-sm font-medium text-text-tertiary">{row.due}</td>
      <td className="px-2 py-2.5">
        <span className="inline-flex items-center gap-1">
          <img src={omrRowIcon} alt="" className="h-auto w-6 shrink-0" />
          <span className="text-base font-semibold leading-[1.2] text-text-secondary">
            {row.amount}
          </span>
        </span>
        <p className="mt-1 text-xs font-semibold leading-[1.2] text-text-muted">{row.amountNote}</p>
      </td>
      <td className="px-2 py-2.5">
        <span
          className={[
            'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-medium',
            status.bg,
            status.fg,
          ].join(' ')}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-current" />
          {t(status.labelKey)}
        </span>
      </td>
      <td className="px-2 py-2.5">
        {tx ? (
          <span
            title={t(tx.titleKey)}
            className={[
              'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-medium',
              tx.bg,
              tx.fg,
            ].join(' ')}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-current" />
            {t(tx.labelKey)}
          </span>
        ) : (
          <span className="text-sm font-medium text-text-muted">—</span>
        )}
      </td>
    </>
  )
}

function SelfBillingTable() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<SelfBillTabId>('all')
  const [page, setPage] = useState(2)

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
        {SELF_BILL_TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                active
                  ? 'font-semibold text-primary-800'
                  : 'font-medium text-text-quaternary hover:text-text-secondary',
              ].join(' ')}
            >
              {t(tab.labelKey)}
              <span
                className={[
                  'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  tab.danger
                    ? 'bg-primary-25 text-danger-700'
                    : active
                      ? 'bg-primary-25 text-primary-800'
                      : 'bg-primary-25 text-text-quaternary',
                ].join(' ')}
              >
                {tab.count}
              </span>
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4">
          <img src={searchIcon} alt="" className="size-5 shrink-0" />
          <input
            type="search"
            placeholder={t('selfBilling.searchPlaceholder')}
            className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
          >
            <img src={filterIcon} alt="" className="size-6" />
            {t('selfBilling.filters')}
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
          >
            <img src={sortIcon} alt="" className="size-6" />
            {t('selfBilling.sort')}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-start">
          <thead>
            <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
              <th className="w-10 px-5 py-2.5">
                <span className="block size-[15px] rounded-sm border border-border-default bg-transparent" />
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('selfBilling.col.document')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('selfBilling.col.supplier')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('selfBilling.col.issued')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('selfBilling.col.due')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('selfBilling.col.amount')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('selfBilling.col.status')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('selfBilling.col.transmission')}</th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {SELF_BILL_ROWS.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                onClick={() => navigate(`/income/self-billing/${row.id}`)}
              >
                {/* The checkbox and the row menu must not trigger the row navigation. */}
                <td className="px-5 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <span className="block size-[15px] rounded-sm border border-border-default" />
                </td>
                <SelfBillRowCells row={row} />
                <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={selfBillRowActions(row.id)} label={t('selfBilling.rowMenu')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-muted">{t('selfBilling.showResult')}</span>
          <button
            type="button"
            className="inline-flex h-9 w-[55px] items-center justify-between rounded-sm border border-border-subtle px-3 text-sm font-semibold text-text-secondary"
          >
            6
            <img src={chevronIcon} alt="" className="size-4 rotate-90 opacity-70" />
          </button>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-text-muted"
            aria-label={t('selfBilling.prevPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
          {SELF_BILL_PAGE_NUMBERS.map((n) => {
            if (n === '...') {
              return (
                <span
                  key="ellipsis"
                  className="inline-flex size-10 items-center justify-center text-sm font-medium text-text-muted"
                >
                  …
                </span>
              )
            }
            const active = n === page
            return (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={[
                  'inline-flex size-10 items-center justify-center rounded-xl text-center transition-colors',
                  active
                    ? 'bg-primary-25 text-base font-extrabold text-primary-700'
                    : 'text-sm font-medium text-text-muted hover:bg-neutral-25',
                ].join(' ')}
              >
                {n}
              </button>
            )
          })}
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-text-muted"
            aria-label={t('selfBilling.nextPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </section>
  )
}

export function SelfBillingPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <SelfBillingHeader />
        <SelfBillingKpiCards />
        <SelfBillingTable />
      </div>
    </AppShell>
  )
}
