import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, RowsView, withRial } from '../../components/ui'
import { agreementRowActions } from '../../lib/rowActions'
import {
  AGREEMENT_KPI,
  AGREEMENT_PAGE_NUMBERS,
  AGREEMENT_ROWS,
  AGREEMENT_TABS,
  countAgreementTab,
  matchesAgreementQuery,
  matchesAgreementTab,
  type AgreementKind,
  type AgreementRow,
  type AgreementStatus,
  type AgreementTabId,
  type SignatureTone,
  type ValidityTone,
} from '../../lib/agreements'
import activeIcon from '../../assets/agreements/kpi-active.svg'
import expiringIcon from '../../assets/agreements/kpi-expiring-soon.svg'
import awaitingIcon from '../../assets/agreements/kpi-awaiting.svg'
import expiredIcon from '../../assets/agreements/kpi-expired.svg'
import alertIcon from '../../assets/agreements/alert.svg'
import signedIcon from '../../assets/agreements/signed.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/invoices/sort.svg'
import filterIcon from '../../assets/credit-notes/filter.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import backIcon from '../../assets/invoice-details/back.svg'

const KPI_ICONS = {
  active: activeIcon,
  expiringSoon: expiringIcon,
  awaiting: awaitingIcon,
  expired: expiredIcon,
} as const

const KPI_META_TONE = {
  normal: 'text-text-tertiary',
  warning: 'text-pending-700',
  danger: 'text-danger-700',
} as const

/** Status pill fills taken from the Figma labels (all r=120). */
const STATUS_STYLES: Record<AgreementStatus, { bg: string; fg: string; labelKey: string }> = {
  active: { bg: 'bg-success-100', fg: 'text-success-700', labelKey: 'agreements.status.active' },
  expiringSoon: {
    bg: 'bg-pending-100',
    fg: 'text-pending-700',
    labelKey: 'agreements.status.expiringSoon',
  },
  awaitingAcceptance: {
    bg: 'bg-primary-25',
    fg: 'text-primary-700',
    labelKey: 'agreements.status.awaitingAcceptance',
  },
  expired: { bg: 'bg-danger-100', fg: 'text-danger-700', labelKey: 'agreements.status.expired' },
  terminated: {
    bg: 'bg-neutral-25',
    fg: 'text-neutral-700',
    labelKey: 'agreements.status.terminated',
  },
}

/** `agreed` is tinted blue (#f4f6fb/#d5dcf1); `statutory` is neutral (#fafafa/#e3e4ea). */
const KIND_CHIP: Record<AgreementKind, string> = {
  agreed: 'border-primary-75 bg-primary-25 text-primary-700',
  statutory: 'border-[#e3e4ea] bg-surface-tab-bar text-text-tertiary',
}

const KIND_LABEL: Record<AgreementKind, string> = {
  agreed: 'agreements.kind.agreed',
  statutory: 'agreements.kind.statutory',
}

const VALIDITY_TONE: Record<ValidityTone, string> = {
  normal: 'text-text-quaternary',
  warning: 'text-pending-500',
  danger: 'text-danger-700',
}

const SIGNATURE_TONE: Record<SignatureTone, string> = {
  signed: 'text-primary-700',
  neutral: 'text-text-tertiary',
}

function AgreementsHeader() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
          >
            {t('agreements.breadcrumbIncome')}
            <img src={backIcon} alt="" className="size-6 rotate-180 rtl:rotate-0" />
          </Link>
          <Link
            to="/income/self-billing"
            className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
          >
            {t('agreements.breadcrumbSelfBilled')}
            <img src={backIcon} alt="" className="size-6 rotate-180 rtl:rotate-0" />
          </Link>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('agreements.title')}
          </h1>
        </div>
        <p className="mt-1 max-w-[471px] text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('agreements.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={exportIcon} alt="" className="size-6 rotate-180" />
          {t('agreements.export')}
        </button>
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-6" />
          {t('agreements.newAgreement')}
          <img
            src={chevronIcon}
            alt=""
            className="size-[18px] brightness-0 invert rtl:rotate-180"
          />
        </button>
      </div>
    </div>
  )
}

/** Full-width danger banner: #fff0f0 on #ead0ce, 45px white badge, action link on the right. */
function ExpiredAlert() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-start gap-4 rounded-sm border border-[#ead0ce] bg-danger-100 p-4">
      <span className="flex size-[45px] shrink-0 items-center justify-center rounded-full bg-white">
        <img src={alertIcon} alt="" className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold leading-[1.2] text-danger-700">
          {t('agreements.alert.title')}
        </p>
        <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-tertiary">
          {withRial(t('agreements.alert.body'))}
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 text-sm font-semibold text-danger-700 hover:underline"
      >
        {t('agreements.alert.action')}
      </button>
    </div>
  )
}

function AgreementKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {AGREEMENT_KPI.map((kpi) => (
        <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-3.5">
            <img src={KPI_ICONS[kpi.icon]} alt="" className="size-11 shrink-0" />
            <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t(kpi.titleKey)}
            </h3>
          </div>
          <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
            {kpi.amount}
          </p>
          <p
            className={['text-sm font-medium leading-[1.2]', KPI_META_TONE[kpi.metaTone]].join(' ')}
          >
            {t(kpi.metaKey)}
          </p>
        </article>
      ))}
    </div>
  )
}

function AgreementRowCells({ row }: { row: AgreementRow }) {
  const { t } = useTranslation()
  const status = STATUS_STYLES[row.status]

  return (
    <>
      <td className="px-2 py-3 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">{row.supplier}</p>
        <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-tertiary">{row.vat}</p>
        {row.onPeppol ? (
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-success-100 px-2 py-0.5 text-[8px] font-semibold text-success-700">
            <span className="size-[3px] rounded-full bg-success-700" />
            {t('agreements.onPeppol')}
          </span>
        ) : (
          <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-quaternary">
            {row.peppolNote}
          </p>
        )}
      </td>
      <td className="px-2 py-3 align-top">
        <span
          className={[
            'inline-flex h-[31px] items-center rounded-sm border px-3 text-sm font-medium',
            KIND_CHIP[row.kind],
          ].join(' ')}
        >
          {t(KIND_LABEL[row.kind])}
        </span>
        <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-quaternary">
          {row.reference}
        </p>
      </td>
      <td className="px-2 py-3 align-top">
        <div className="flex flex-col items-start gap-1.5">
          {row.coverage.map((chip) => (
            <span
              key={chip}
              className="inline-flex h-[31px] items-center rounded-sm border border-primary-75 bg-primary-25 px-3 text-sm font-medium text-text-secondary"
            >
              {chip}
            </span>
          ))}
          {row.coverageMore ? (
            <span className="inline-flex h-[31px] items-center rounded-sm border border-primary-75 bg-primary-25 px-3 text-sm font-medium text-text-secondary">
              {row.coverageMore}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-quaternary">
          {withRial(row.scope)}
        </p>
      </td>
      <td className="px-2 py-3 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-text-secondary">{row.validity}</p>
        <p
          className={[
            'mt-1.5 text-xs font-medium leading-[1.3]',
            VALIDITY_TONE[row.validityTone],
          ].join(' ')}
        >
          {row.validityNote}
        </p>
      </td>
      <td className="px-2 py-3 align-top">
        <p className="text-xl font-semibold leading-[1.2] text-text-secondary">
          {row.documentCount}
        </p>
        {row.documentValue ? (
          <span className="mt-1 inline-flex items-center gap-1">
            <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
            <span className="text-sm font-semibold leading-[1.2] text-text-quaternary">
              {row.documentValue}
            </span>
          </span>
        ) : null}
        {row.documentNote ? (
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
            {row.documentNote}
          </p>
        ) : null}
      </td>
      <td className="px-2 py-3 align-top">
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
        <p
          className={[
            'mt-1.5 inline-flex items-center gap-1 text-xs font-semibold leading-[1.2]',
            SIGNATURE_TONE[row.signatureTone],
          ].join(' ')}
        >
          {row.signatureTone === 'signed' ? (
            <img src={signedIcon} alt="" className="size-3" />
          ) : null}
          {t(row.signatureNote)}
        </p>
      </td>
    </>
  )
}

function AgreementsTable() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<AgreementTabId>('all')
  const [query, setQuery] = useState('')

  const rows = useMemo(
    () =>
      AGREEMENT_ROWS.filter(
        (row) => matchesAgreementTab(row, activeTab) && matchesAgreementQuery(row, query),
      ),
    [activeTab, query],
  )
  const [page, setPage] = useState(2)

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
        {AGREEMENT_TABS.map((tab) => {
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
                {countAgreementTab(tab.id)}
              </span>
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <label className="flex h-11 w-full max-w-[346px] items-center max-md:max-w-none max-md:basis-full gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4">
          <img src={searchIcon} alt="" className="size-5 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('agreements.searchPlaceholder')}
            className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
          >
            <img src={filterIcon} alt="" className="size-6" />
            {t('agreements.filters')}
          </button>
          <button
            type="button"
            className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
          >
            <img src={sortIcon} alt="" className="size-6" />
            {t('agreements.sort')}
          </button>
        </div>
      </div>

      <RowsView>
        <table className="w-full min-w-[1080px] border-collapse text-start">
          <thead>
            <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
              <th className="w-10 px-5 py-2.5">
                <span className="block size-[15px] rounded-sm border border-border-default bg-transparent" />
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('agreements.col.supplier')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('agreements.col.kind')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('agreements.col.coverage')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('agreements.col.valid')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('agreements.col.documents')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('agreements.col.status')}</th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
              >
                <td className="px-5 py-3 align-top">
                  <span className="mt-1 block size-[15px] rounded-sm border border-border-default" />
                </td>
                <AgreementRowCells row={row} />
                <td className="px-2 py-3 align-top">
                  <ActionMenu items={agreementRowActions(row.id)} label={t('agreements.rowMenu')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RowsView>

      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-muted">{t('agreements.showResult')}</span>
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
            aria-label={t('agreements.prevPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
          {AGREEMENT_PAGE_NUMBERS.map((n) => {
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
            aria-label={t('agreements.nextPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </section>
  )
}

export function AgreementsPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <AgreementsHeader />
        <ExpiredAlert />
        <AgreementKpiCards />
        <AgreementsTable />
      </div>
    </AppShell>
  )
}
