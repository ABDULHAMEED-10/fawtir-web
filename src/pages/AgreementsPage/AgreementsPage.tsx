import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import {
  ActionMenu,
  Combobox,
  DateField,
  FilterMenu,
  Modal,
  OmAmount,
  RowsView,
  SortMenu,
  TableCheckbox,
  type ActionMenuItem,
} from '../../components/ui'
import { useApiRead } from '../../hooks'
import {
  AGREEMENTS_PATH,
  AGREEMENT_REFERENCE_MAX,
  WITHDRAWAL_REASON_MAX,
  activateAgreement,
  exportAgreements,
  loadAgreements,
  openAgreement,
  renewAgreement,
  suspendAgreement,
  withdrawAgreement,
  type AgreementDto,
  type AgreementStatusDto,
} from '../../api/selfBilling/agreements'
import {
  CUSTOMERS_PATH,
  customerListPath,
  loadCustomerPage,
  loadCustomerRecord,
  patchCustomer,
  type CustomerDto,
  type CustomerRecordDto,
} from '../../api/customers/customers'
import { ApiError, type Page } from '../../api'
import { isicOptions } from '../../lib/codeLists/isic'
import {
  AGREEMENT_TABS,
  EXPIRING_WITHIN_DAYS,
  STATUS_CHIP,
  agreementProblem,
  allowedActions,
  blockerOf,
  canIssueUnder,
  daysBetween,
  expiringSoon,
  lapsed,
  matchesTab,
  notYetStarted,
  rangeProblem,
  sortedForDisplay,
  waitingOn,
  type AgreementTabId,
} from '../../lib/selfBillingAgreements'
import { LIST_PAGE_SIZES, ListPager } from '../SelfBillingPage/ListPager'
import { describeApiFailure } from '../../lib/apiFailure'
import { muscatToday } from '../../lib/invoiceIssue'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
import { can, useSession } from '../../lib/session/session'
import { usePlanIncludes } from '../../lib/planAccess'
import activeIcon from '../../assets/agreements/kpi-active.svg'
import expiringIcon from '../../assets/agreements/kpi-expiring-soon.svg'
import awaitingIcon from '../../assets/agreements/kpi-awaiting.svg'
import expiredIcon from '../../assets/agreements/kpi-expired.svg'
import alertIcon from '../../assets/agreements/alert.svg'
import signedIcon from '../../assets/agreements/signed.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/credit-notes/filter.svg'
import backIcon from '../../assets/invoice-details/back.svg'
import playIcon from '../../assets/actions/send.svg'
import pauseIcon from '../../assets/actions/pause.svg'
import deleteIcon from '../../assets/actions/delete.svg'
import editIcon from '../../assets/actions/edit.svg'

const DEFAULT_PAGE_SIZE = 6

const OUTLINE_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'

const FIELD =
  'h-[50px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/** Status pill fills from the Figma labels; a lapsed ACTIVE row gets the design's red "Expired". */
const CHIP: Record<'ok' | 'waiting' | 'stopped' | 'expiring' | 'expired', string> = {
  ok: 'bg-success-100 text-success-700',
  waiting: 'bg-primary-25 text-primary-700',
  stopped: 'bg-neutral-25 text-neutral-700',
  expiring: 'bg-pending-100 text-pending-700',
  expired: 'bg-danger-100 text-danger-700',
}

type SortKey = 'newest' | 'oldest' | 'seller'
const SORTS: { value: SortKey; labelKey: string }[] = [
  { value: 'newest', labelKey: 'agreements.sort.newest' },
  { value: 'oldest', labelKey: 'agreements.sort.oldest' },
  { value: 'seller', labelKey: 'agreements.sort.seller' },
]
const STATUSES: AgreementStatusDto[] = ['ACTIVE', 'PENDING_ACTIVATION', 'SUSPENDED', 'WITHDRAWN']

/**
 * Income › Self-billing › Agreements (I-12), drawn as Figma 13:37010 over the agreements API.
 *
 * The prior authorisation SRS Ch6 Scenario 7 requires before this tenant may write an invoice on
 * a seller's behalf. **The tenant is the buyer here**, so every supplier below is the counterparty:
 * the party who would normally have invoiced us.
 *
 * **The agreement gates issuing, not drafting.** A draft against a seller with no agreement is
 * created happily and then refused at issue. This screen is the only place that authority is
 * visible, which is why it says plainly, per row, whether issuing would work and who has to act if
 * it would not.
 *
 * **Two different waits.** `PENDING_ACTIVATION` is the tenant's to clear; `UNVERIFIED` only Fawtir
 * can, because `platform.selfbilling.counterparty.verify` is platform-reserved and no tenant can
 * ever hold it (Zain, 2026-08-27). Verification is therefore shown as a state, never as a button.
 *
 * **What the frame draws and the API cannot feed** is drawn and marked rather than dropped: an
 * agreement "kind" (there is only the agreed one) and its coverage. There is no `EXPIRED`
 * status; a lapsed `effectiveTo` is derived here and labelled, since the server will never say it.
 */
export function AgreementsPage() {
  return (
    <AppShell>
      <Agreements />
    </AppShell>
  )
}

function Agreements() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  // Needed to READ as well as write: the list route carries it too.
  const canManage = can(session, 'selfbilling.agreement.manage')
  // Opening, renewing and activating an agreement need a plan with self-billing (PL-8);
  // reading, suspending and withdrawing the ones made before stay.
  const selfBillingIncluded = usePlanIncludes('selfBilling')
  const [params, setParams] = useSearchParams()

  const tab = (AGREEMENT_TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as AgreementTabId)
    : 'all'
  const status = (STATUSES as string[]).includes(params.get('status') ?? '')
    ? (params.get('status') as AgreementStatusDto)
    : null
  const sortKey: SortKey = SORTS.some((option) => option.value === params.get('sort'))
    ? (params.get('sort') as SortKey)
    : 'newest'
  const query = params.get('q') ?? ''
  const sizeParam = Number(params.get('size'))
  const size = (LIST_PAGE_SIZES as readonly number[]).includes(sizeParam)
    ? sizeParam
    : DEFAULT_PAGE_SIZE
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )

  const read = useApiRead<AgreementDto[]>(canManage ? AGREEMENTS_PATH : null, loadAgreements)
  const agreements = read.read.status === 'ready' ? read.read.data : null

  // The agreement carries a seller id and no name, so the names are joined here. One page of
  // customers covers the realistic case; an id with no match still renders, as its id.
  const customersPath = customerListPath({
    type: null,
    search: '',
    sort: 'NAME_ASC',
    page: 0,
    size: 100,
  })
  const customers = useApiRead<Page<CustomerDto>>(canManage ? customersPath : null, () =>
    loadCustomerPage(customersPath),
  )
  const customerOf = useMemo(() => {
    const byId = new Map<string, CustomerDto>()
    if (customers.read.status === 'ready') {
      for (const customer of customers.read.data.items) byId.set(customer.id, customer)
    }
    return (id: string) => byId.get(id) ?? null
  }, [customers.read])
  const nameOf = (id: string) => customerOf(id)?.displayName ?? null

  // The Oman calendar day: the backend judges "in force" against the tenant's business day.
  const today = muscatToday()
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  // The agreement the design's "Renew agreement" renews; the dialog opens on its supplier.
  const [renewing, setRenewing] = useState<AgreementDto | null>(null)
  const [exporting, setExporting] = useState(false)
  const [withdrawing, setWithdrawing] = useState<AgreementDto | null>(null)
  // The agreement whose supplier's business activity (BTOM-033) is being set.
  const [settingIsic, setSettingIsic] = useState<AgreementDto | null>(null)
  const [selected, setSelected] = useState<string[]>([])

  const onFailure = (error: unknown) => {
    setNotice(null)
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setFailure(
      message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
    )
  }

  const run = async (id: string, call: () => Promise<unknown>, doneKey: string) => {
    setBusy(id)
    setFailure(null)
    try {
      await call()
      setNotice(t(doneKey))
      read.retry()
    } catch (error) {
      onFailure(error)
    } finally {
      setBusy(null)
    }
  }

  const onExport = async () => {
    setExporting(true)
    setNotice(null)
    setFailure(null)
    try {
      saveDownload(await exportAgreements(), 'fawtir-self-billing-agreements.csv')
    } catch (error) {
      onFailure(error)
    } finally {
      setExporting(false)
    }
  }

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-[1144px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  const all = agreements ?? []
  const needle = query.trim().toLowerCase()
  const rows = sortedForDisplay(all)
    .filter((row) => matchesTab(row, tab, today))
    .filter((row) => status === null || row.status === status)
    .filter(
      (row) =>
        needle === '' ||
        row.agreementReference.toLowerCase().includes(needle) ||
        (nameOf(row.customerId) ?? '').toLowerCase().includes(needle),
    )
    .sort((a, b) =>
      sortKey === 'oldest'
        ? a.effectiveFrom.localeCompare(b.effectiveFrom)
        : sortKey === 'seller'
          ? (nameOf(a.customerId) ?? a.customerId).localeCompare(
              nameOf(b.customerId) ?? b.customerId,
            )
          : 0,
    )
  // The frame pages the list; the API answers it whole, so the page is cut here.
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const shown = rows.slice((pageNumber - 1) * size, pageNumber * size)
  const tabCount = (id: AgreementTabId) => all.filter((row) => matchesTab(row, id, today)).length
  const issuable = all.filter((row) => canIssueUnder(row, today)).length
  const expiringRows = all
    .filter((row) => expiringSoon(row, today))
    .sort((a, b) => a.effectiveTo!.localeCompare(b.effectiveTo!))
  const expiring = expiringRows.length
  const waiting = all.filter((row) => matchesTab(row, 'waiting', today)).length
  const waitingOnFawtir = all.filter((row) => waitingOn(row, today) === 'fawtir').length
  const lapsedRows = all
    .filter((row) => lapsed(row, today) && row.status !== 'WITHDRAWN')
    .sort((a, b) => b.effectiveTo!.localeCompare(a.effectiveTo!))
  const lapsedCount = lapsedRows.length
  // The drafts the lapsed agreements block today (the frame's "1 draft self-billed invoice").
  const blockedDrafts = lapsedRows.reduce((sum, row) => sum + (row.blockedDrafts?.count ?? 0), 0)
  const count = (value: number) => formatCount(value, language)
  const allSelected = shown.length > 0 && shown.every((row) => selected.includes(row.id))

  const menuFor = (row: AgreementDto): ActionMenuItem[] => {
    const actions = allowedActions(row.status)
    const items: ActionMenuItem[] = []
    if (actions.activate && selfBillingIncluded) {
      items.push({
        id: 'activate',
        labelKey: 'agreements.action.activate',
        icon: playIcon,
        onSelect: () =>
          void run(row.id, () => activateAgreement(row.id), 'agreements.done.activated'),
      })
    }
    if (actions.suspend) {
      items.push({
        id: 'suspend',
        labelKey: 'agreements.action.suspend',
        icon: pauseIcon,
        onSelect: () =>
          void run(row.id, () => suspendAgreement(row.id), 'agreements.done.suspended'),
      })
    }
    // Every live agreement: suppliers agreed before the code was asked must still get one to issue.
    if (row.status !== 'WITHDRAWN') {
      items.push({
        id: 'setIsic',
        labelKey: 'agreements.action.setIsic',
        icon: editIcon,
        onSelect: () => setSettingIsic(row),
      })
    }
    if (actions.withdraw) {
      items.push({
        id: 'withdraw',
        labelKey: 'agreements.action.withdraw',
        icon: deleteIcon,
        danger: true,
        onSelect: () => setWithdrawing(row),
      })
    }
    return items
  }

  const kpis = [
    {
      id: 'active',
      icon: activeIcon,
      titleKey: 'agreements.kpi.issuable',
      figure: issuable,
      note: t('agreements.kpi.issuableNote'),
      tone: 'normal',
    },
    {
      id: 'expiringSoon',
      icon: expiringIcon,
      titleKey: 'agreements.kpi.expiringSoon',
      figure: expiring,
      // The frame names the soonest: "Al Noor Dates in 9 days".
      note: expiringRows[0]
        ? t('agreements.kpi.expiringSoonNamed', {
            supplier: nameOf(expiringRows[0].customerId) ?? t('agreements.unknownSeller'),
            count: daysBetween(today, expiringRows[0].effectiveTo!),
          })
        : t('agreements.kpi.expiringSoonNote', { count: EXPIRING_WITHIN_DAYS }),
      tone: expiring > 0 ? 'warning' : 'normal',
    },
    {
      id: 'awaiting',
      icon: awaitingIcon,
      titleKey: 'agreements.kpi.awaiting',
      figure: waiting,
      note: t('agreements.kpi.awaitingNote', {
        count: waitingOnFawtir,
        fawtir: count(waitingOnFawtir),
      }),
      tone: 'normal',
    },
    {
      id: 'expired',
      icon: expiredIcon,
      titleKey: 'agreements.kpi.lapsed',
      figure: lapsedCount,
      note: t('agreements.kpi.lapsedNote'),
      tone: lapsedCount > 0 ? 'danger' : 'normal',
    },
  ] as const

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/expenditure/bills"
              className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('selfBillDetail.breadcrumbExpenditure')}
              <img
                src={backIcon}
                alt=""
                aria-hidden="true"
                className="size-6 rotate-180 rtl:rotate-0"
              />
            </Link>
            <Link
              to="/expenditure/self-billing"
              className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('agreements.breadcrumbSelfBilled')}
              <img
                src={backIcon}
                alt=""
                aria-hidden="true"
                className="size-6 rotate-180 rtl:rotate-0"
              />
            </Link>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('agreements.title')}
            </h1>
          </div>
          <p className="mt-1 max-w-[471px] text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('agreements.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void onExport()}
            disabled={exporting}
            className={OUTLINE_BUTTON}
          >
            <img src={exportIcon} alt="" className="size-6 rotate-180" />
            {exporting ? t('invoicesPage.exporting') : t('agreements.export')}
          </button>
          {selfBillingIncluded ? (
            <button
              type="button"
              onClick={() => setOpening(true)}
              className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-6" />
              {t('agreements.newAgreement')}
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}
      {failure ? (
        <Notice
          badge={t('agreements.notDone')}
          body={failure}
          action={{ label: t('common.close'), onClick: () => setFailure(null) }}
        />
      ) : null}

      {read.read.status === 'loading' ? <LoadingNotice /> : null}
      {read.read.status === 'failed' ? (
        <ApiReadFailure error={read.read.error} retry={read.retry} />
      ) : null}

      {agreements ? (
        <>
          {/*
            Full-width danger banner, as the design draws it, only when something has lapsed. It
            names the supplier and the day and, when there are any, the drafts the lapse blocks;
            "Renew agreement" renews that supplier's agreement (withdraws it, opens its successor).
          */}
          {lapsedCount > 0 ? (
            <div className="flex flex-wrap items-start gap-4 rounded-sm border border-[#ead0ce] bg-danger-100 p-4">
              <span className="flex size-[45px] shrink-0 items-center justify-center rounded-full bg-white">
                <img src={alertIcon} alt="" className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-[1.2] text-danger-700">
                  {t('agreements.alert.title', {
                    count: lapsedCount,
                    supplier: nameOf(lapsedRows[0].customerId) ?? t('agreements.unknownSeller'),
                    date: formatDate(lapsedRows[0].effectiveTo!, language),
                  })}
                </p>
                <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-tertiary">
                  {blockedDrafts > 0
                    ? t('agreements.alert.blockedDrafts', { count: blockedDrafts })
                    : t('agreements.alert.body', { count: lapsedCount })}
                </p>
              </div>
              {selfBillingIncluded ? (
                <button
                  type="button"
                  onClick={() => {
                    setRenewing(lapsedRows[0])
                    setOpening(true)
                  }}
                  className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-sm border border-danger-700 bg-white px-4 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100 max-md:w-full"
                >
                  {t('agreements.alert.action')}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <article
                key={kpi.id}
                className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5"
              >
                <div className="flex items-center gap-3.5">
                  <img src={kpi.icon} alt="" className="size-11 shrink-0" />
                  <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                    {t(kpi.titleKey)}
                  </h3>
                </div>
                <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
                  {count(kpi.figure)}
                </p>
                <p
                  className={[
                    'text-sm font-medium leading-[1.2]',
                    kpi.tone === 'danger'
                      ? 'text-danger-700'
                      : kpi.tone === 'warning'
                        ? 'text-pending-700'
                        : 'text-text-tertiary',
                  ].join(' ')}
                >
                  {kpi.note}
                </p>
              </article>
            ))}
          </div>

          <section className="overflow-hidden rounded-md bg-surface-card">
            <div
              role="tablist"
              aria-label={t('agreements.tabsLabel')}
              className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4 max-md:gap-x-6"
            >
              {AGREEMENT_TABS.map((id) => {
                const active = id === tab
                const tally = tabCount(id)
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => update({ tab: id === 'all' ? null : id, page: null })}
                    className={[
                      'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                      active
                        ? 'font-semibold text-primary-800'
                        : 'font-medium text-text-quaternary hover:text-text-secondary',
                    ].join(' ')}
                  >
                    {t(`agreements.tab.${id}`)}
                    <span
                      className={[
                        'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                        id === 'ended' && tally > 0
                          ? 'bg-danger-100 text-danger-700'
                          : active
                            ? 'bg-primary-25 text-primary-800'
                            : 'bg-primary-25 text-text-quaternary',
                      ].join(' ')}
                    >
                      {count(tally)}
                    </span>
                    {active ? (
                      <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" />
                    ) : null}
                  </button>
                )
              })}
            </div>

            {/* Search on the left; Filters and Sort together on the right, as the frame draws them. */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
              <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
                <img src={searchIcon} alt="" className="size-5 shrink-0" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => update({ q: event.target.value, page: null })}
                  placeholder={t('agreements.searchPlaceholder')}
                  aria-label={t('agreements.searchPlaceholder')}
                  maxLength={200}
                  className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <FilterMenu
                  label={t('agreements.filters.label')}
                  icon={filterIcon}
                  value={status ?? 'all'}
                  defaultValue="all"
                  onChange={(value) =>
                    update({ status: value === 'all' ? null : value, page: null })
                  }
                  options={[
                    { value: 'all', label: t('agreements.filters.allStatuses') },
                    ...STATUSES.map((value) => ({ value, label: t(`agreements.status.${value}`) })),
                  ]}
                />
                <SortMenu
                  value={sortKey}
                  options={SORTS}
                  onChange={(value) => update({ sort: value === 'newest' ? null : value })}
                  label={t('agreements.sort.label')}
                />
              </div>
            </div>

            <RowsView>
              <table className="w-full min-w-[1080px] border-collapse text-start">
                <thead>
                  <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                    <th className="w-10 px-5 py-2.5">
                      <TableCheckbox
                        checked={allSelected}
                        indeterminate={
                          !allSelected && rows.some((row) => selected.includes(row.id))
                        }
                        disabled={shown.length === 0}
                        onChange={() =>
                          setSelected((current) =>
                            allSelected
                              ? current.filter((id) => !shown.some((row) => row.id === id))
                              : [...new Set([...current, ...shown.map((row) => row.id)])],
                          )
                        }
                        ariaLabel={t('agreements.selectAll')}
                      />
                    </th>
                    {(
                      ['supplier', 'reference', 'coverage', 'valid', 'documents', 'status'] as const
                    ).map((key) => (
                      <th key={key} scope="col" className="px-2 py-2.5 text-start font-semibold">
                        {t(`agreements.col.${key}`)}
                      </th>
                    ))}
                    <th className="w-12 px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-12 text-center text-sm font-medium text-text-quaternary"
                      >
                        {t('agreements.empty')}
                      </td>
                    </tr>
                  ) : (
                    shown.map((row) => {
                      const customer = customerOf(row.customerId)
                      const name = customer?.displayName ?? t('agreements.unknownSeller')
                      const blocker = blockerOf(row, today)
                      const isLapsed = lapsed(row, today) && row.status !== 'WITHDRAWN'
                      const isExpiring = expiringSoon(row, today)
                      const notStarted = notYetStarted(row, today)
                      // The pill reads the derived state the frame names, not the raw status.
                      const chip = isLapsed
                        ? 'expired'
                        : row.status === 'WITHDRAWN' || row.status === 'SUSPENDED'
                          ? 'stopped'
                          : isExpiring
                            ? 'expiring'
                            : blocker === 'unverified' || notStarted
                              ? 'waiting'
                              : STATUS_CHIP[row.status]
                      const pillLabel = isLapsed
                        ? t('agreements.derived.expired')
                        : row.status === 'WITHDRAWN'
                          ? t('agreements.derived.terminated')
                          : isExpiring
                            ? t('agreements.derived.expiringSoon')
                            : row.status === 'PENDING_ACTIVATION' ||
                                blocker === 'unverified' ||
                                notStarted
                              ? t('agreements.derived.awaitingAcceptance')
                              : t(`agreements.status.${row.status}`)
                      const onPeppol =
                        row.verifiedParticipant !== null || customer?.peppolDelivery === 'ACTIVE'
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                        >
                          <td className="px-5 py-3 align-top">
                            <TableCheckbox
                              checked={selected.includes(row.id)}
                              onChange={() =>
                                setSelected((current) =>
                                  current.includes(row.id)
                                    ? current.filter((id) => id !== row.id)
                                    : [...current, row.id],
                                )
                              }
                              ariaLabel={t('agreements.selectRow', { supplier: name })}
                            />
                          </td>
                          <td className="px-2 py-3 align-top">
                            <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                              {name}
                            </p>
                            {customer?.profile?.details?.vatRegistrationNumber ? (
                              <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-tertiary">
                                {t('agreements.vat', {
                                  number: customer.profile.details.vatRegistrationNumber,
                                })}
                              </p>
                            ) : null}
                            {/* The frame's "On Peppol" chip; the verified participant id is its title. */}
                            {onPeppol ? (
                              <span
                                title={
                                  row.verifiedParticipant
                                    ? t('agreements.verifiedAs', {
                                        participant: row.verifiedParticipant,
                                      })
                                    : undefined
                                }
                                className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-success-100 px-2 py-0.5 text-[10px] font-semibold text-success-700"
                              >
                                <span className="size-[3px] rounded-full bg-success-700" />
                                {t('agreements.onPeppol')}
                              </span>
                            ) : (
                              <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-quaternary">
                                {t('agreements.notOnPeppol')}
                              </p>
                            )}
                          </td>
                          {/* Kind. TODO(backend): only the agreed kind exists (§7.10). */}
                          <td className="px-2 py-3 align-top">
                            <span className="inline-flex h-[31px] items-center rounded-sm border border-primary-75 bg-primary-25 px-3 text-sm font-medium text-primary-700">
                              {t('agreements.kind.agreed')}
                            </span>
                            <p className="mt-1.5 text-xs font-medium leading-[1.2] whitespace-nowrap text-text-quaternary">
                              {row.agreementReference}
                            </p>
                          </td>
                          {/* Coverage. TODO(backend): no scope is recorded; the frame's category chips wait for one. */}
                          <td
                            className="px-2 py-3 align-top"
                            title={t('agreements.coverageUnknown')}
                          >
                            <p className="text-xs font-medium leading-[1.2] whitespace-nowrap text-text-quaternary">
                              {t('agreements.coverage', { currency: 'OMR' })}
                            </p>
                          </td>
                          <td className="px-2 py-3 align-top">
                            <p className="text-sm font-semibold leading-[1.2] text-text-secondary">
                              {isLapsed
                                ? t('agreements.valid.ended', {
                                    to: formatDate(row.effectiveTo!, language),
                                  })
                                : notStarted
                                  ? t('agreements.valid.notStarted')
                                  : row.effectiveTo === null
                                    ? t('agreements.valid.noExpiry')
                                    : t('agreements.valid.until', {
                                        to: formatDate(row.effectiveTo, language),
                                      })}
                            </p>
                            <p
                              className={[
                                'mt-1.5 text-xs font-medium leading-[1.3]',
                                isLapsed
                                  ? 'text-danger-700'
                                  : isExpiring
                                    ? 'text-pending-700'
                                    : 'text-text-quaternary',
                              ].join(' ')}
                            >
                              {isLapsed
                                ? t('agreements.valid.expiredAgo', {
                                    count: daysBetween(row.effectiveTo!, today),
                                  })
                                : notStarted
                                  ? t('agreements.valid.startsOn', {
                                      from: formatDate(row.effectiveFrom, language),
                                    })
                                  : isExpiring && row.effectiveTo
                                    ? t('agreements.expiresIn', {
                                        count: daysBetween(today, row.effectiveTo),
                                      })
                                    : t('agreements.valid.from', {
                                        from: formatDate(row.effectiveFrom, language),
                                      })}
                            </p>
                            {row.withdrawalReason ? (
                              <p className="mt-1.5 text-xs font-medium leading-[1.3] text-text-quaternary">
                                {t('agreements.withdrawnBecause', { reason: row.withdrawalReason })}
                              </p>
                            ) : null}
                          </td>
                          {/* Documents issued under this agreement: the count, and their value. */}
                          <td className="px-2 py-3 align-top">
                            {row.documents ? (
                              <>
                                <p className="text-xl font-semibold leading-[1.2] text-text-primary">
                                  {count(row.documents.count)}
                                </p>
                                {row.documents.count > 0 && row.documents.total !== null ? (
                                  <div className="mt-1.5">
                                    {row.documents.currency === 'OMR' ? (
                                      <OmAmount
                                        size="xs"
                                        amount={formatAmount(row.documents.total, 'OMR', language)}
                                        amountClassName="text-sm font-medium text-text-secondary"
                                      />
                                    ) : (
                                      <p className="text-sm font-medium text-text-secondary">
                                        {`${row.documents.currency ?? ''} ${formatAmount(
                                          row.documents.total,
                                          row.documents.currency ?? 'OMR',
                                          language,
                                        )}`.trim()}
                                      </p>
                                    )}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <p className="text-xl font-semibold leading-[1.2] text-text-muted">
                                —
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-3 align-top">
                            <span
                              className={[
                                'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-medium',
                                CHIP[chip],
                              ].join(' ')}
                            >
                              <span className="size-1.5 shrink-0 rounded-full bg-current" />
                              {pillLabel}
                            </span>
                            {/* The whole point of the row: can we issue, and if not whose move is it. */}
                            <p
                              className={[
                                'mt-1.5 flex max-w-[260px] items-start gap-1 text-xs font-semibold leading-[1.3]',
                                blocker === null ? 'text-primary-700' : 'text-text-tertiary',
                              ].join(' ')}
                            >
                              {blocker === null ? (
                                <img src={signedIcon} alt="" className="mt-0.5 size-3 shrink-0" />
                              ) : null}
                              {blocker === null
                                ? t('agreements.canIssue')
                                : t(`agreements.blocked.${blocker}`, {
                                    from: formatDate(row.effectiveFrom, language),
                                    to: row.effectiveTo
                                      ? formatDate(row.effectiveTo, language)
                                      : '',
                                  })}
                            </p>
                          </td>
                          <td className="px-2 py-3 align-top">
                            {menuFor(row).length > 0 ? (
                              <ActionMenu
                                items={menuFor(row)}
                                label={t('agreements.rowMenu', { supplier: name })}
                                floating
                              />
                            ) : busy === row.id ? (
                              <span className="text-xs font-medium text-text-quaternary">
                                {t('appAccess.loading')}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </RowsView>

            {shown.length > 0 ? (
              <ListPager
                size={size}
                onSize={(next) =>
                  update({ size: next === DEFAULT_PAGE_SIZE ? null : String(next), page: null })
                }
                page={pageNumber}
                pageCount={pageCount}
                onPage={(next) => update({ page: next === 1 ? null : String(next) })}
                labels={{
                  showResult: t('agreements.showResult'),
                  previous: t('agreements.prevPage'),
                  next: t('agreements.nextPage'),
                  nav: t('invoicesPage.pages'),
                }}
              />
            ) : null}
          </section>
        </>
      ) : null}

      {opening ? (
        <OpenAgreementDialog
          customers={customers.read.status === 'ready' ? customers.read.data.items : []}
          renewing={renewing}
          onCancel={() => {
            setOpening(false)
            setRenewing(null)
          }}
          onDone={(renewed) => {
            setOpening(false)
            setRenewing(null)
            setNotice(t(renewed ? 'agreements.done.renewed' : 'agreements.done.opened'))
            read.retry()
          }}
          onFailure={onFailure}
        />
      ) : null}

      {settingIsic ? (
        <SupplierIsicDialog
          agreement={settingIsic}
          sellerName={nameOf(settingIsic.customerId)}
          onCancel={() => setSettingIsic(null)}
          onDone={() => {
            setSettingIsic(null)
            setNotice(t('agreements.done.isicSaved'))
          }}
          onFailure={onFailure}
        />
      ) : null}

      {withdrawing ? (
        <WithdrawDialog
          agreement={withdrawing}
          sellerName={nameOf(withdrawing.customerId)}
          onCancel={() => setWithdrawing(null)}
          onDone={() => {
            setWithdrawing(null)
            setNotice(t('agreements.done.withdrawn'))
            read.retry()
          }}
          onFailure={onFailure}
        />
      ) : null}
    </div>
  )
}

function DialogActions({
  confirmLabel,
  confirmDisabled,
  danger = false,
  onConfirm,
  onCancel,
}: {
  confirmLabel: string
  confirmDisabled: boolean
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
      >
        {t('common.cancel')}
      </button>
      <button
        type="button"
        disabled={confirmDisabled}
        onClick={onConfirm}
        className={[
          'inline-flex h-11 items-center rounded-sm px-5 text-sm font-semibold text-white transition-colors disabled:bg-[#d0d2d5]',
          danger ? 'bg-danger-700 hover:bg-danger-800' : 'bg-primary-700 hover:bg-primary-800',
        ].join(' ')}
      >
        {confirmLabel}
      </button>
    </div>
  )
}

/**
 * Opening one, or renewing one.
 *
 * The reference and the dates cannot be edited afterwards (there is no PUT or PATCH), so the
 * dialog says so before it writes rather than leaving it to be discovered. Opened from "Renew
 * agreement" it renews that agreement (`POST …/{id}/renewal`): the lapsed one is withdrawn and its
 * successor opened in one step, where opening a second live agreement would be refused.
 *
 * **The supplier's business activity (BTOM-033) is asked here.** On a self-billed document the
 * seller is the supplier, and IBR-081-OM puts the seller's ISIC code on every line, so it is the
 * supplier's code, not the tenant's (Zain, 2026-09-30: one code, on the supplier's record, captured
 * when the agreement is opened). The chosen supplier's record is read for it and for the version
 * a change is written against. Required only while the supplier has none: a supplier that already
 * has one is prefilled, and an agreement opened without one would only be refused at issue
 * (`INDUSTRIAL_CLASSIFICATION_REQUIRED`). A changed code is PATCHed onto the supplier first, so the
 * agreement is never opened on a code that failed to save.
 */
function OpenAgreementDialog({
  customers,
  renewing,
  onCancel,
  onDone,
  onFailure,
}: {
  customers: CustomerDto[]
  /** The agreement "Renew agreement" renews; its supplier is pre-chosen. */
  renewing: AgreementDto | null
  onCancel: () => void
  /** `renewed` when an agreement was renewed rather than a new one opened. */
  onDone: (renewed: boolean) => void
  onFailure: (error: unknown) => void
}) {
  const { t } = useTranslation()
  const [customerId, setCustomerId] = useState(renewing?.customerId ?? '')
  const [reference, setReference] = useState('')
  const [from, setFrom] = useState(() => muscatToday())
  const [to, setTo] = useState('')
  const [saving, setSaving] = useState(false)

  const activity = useSupplierIsic(customerId)

  const referenceProblem = agreementProblem(reference)
  const datesProblem = rangeProblem(from, to)
  const ready =
    customerId !== '' &&
    activity.supplier !== null &&
    activity.isic !== '' &&
    referenceProblem === null &&
    datesProblem === null

  const submit = async () => {
    if (!ready) return
    setSaving(true)
    try {
      // First, so the agreement is never opened on a code that failed to save.
      if ((await activity.save()) === 'refused') return
      const terms = {
        agreementReference: reference.trim(),
        effectiveFrom: from,
        effectiveTo: to.trim() === '' ? null : to,
      }
      // A renewal only for the supplier it was opened on; another supplier is a new agreement.
      const renew = renewing !== null && renewing.customerId === customerId
      if (renew) await renewAgreement(renewing.id, terms)
      else await openAgreement({ customerId, ...terms })
      onDone(renew)
    } catch (error) {
      onFailure(error)
      onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onCancel}
      // "Renew" only while it renews: another supplier chosen here opens a new agreement instead.
      title={t(
        renewing !== null && renewing.customerId === customerId
          ? 'agreements.openDialog.renewTitle'
          : 'agreements.openDialog.title',
      )}
      subtitle={t('agreements.openDialog.note')}
      width={560}
      footer={
        <DialogActions
          confirmLabel={
            saving ? t('agreements.openDialog.opening') : t('agreements.openDialog.confirm')
          }
          confirmDisabled={!ready || saving}
          onConfirm={submit}
          onCancel={onCancel}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-text-primary">
            {t('agreements.openDialog.seller')}
          </span>
          <Combobox
            value={customerId}
            onChange={setCustomerId}
            options={customers
              .filter((customer) => customer.type !== 'CONSUMER')
              .map((customer) => ({ value: customer.id, label: customer.displayName }))}
            placeholder={t('agreements.openDialog.chooseSeller')}
            searchPlaceholder={t('agreements.openDialog.searchSeller')}
            ariaLabel={t('agreements.openDialog.seller')}
            emptyText={t('agreements.openDialog.noSellers')}
          />
        </div>

        {customerId !== '' ? <SupplierIsicField activity={activity} /> : null}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-text-primary">
            {t('agreements.openDialog.reference')}
          </span>
          <input
            type="text"
            maxLength={AGREEMENT_REFERENCE_MAX}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            aria-label={t('agreements.openDialog.reference')}
            className={FIELD}
          />
          {referenceProblem && reference !== '' ? (
            <span className="mt-1 block text-sm font-medium text-danger-700">
              {t(`agreements.problem.${referenceProblem}`)}
            </span>
          ) : null}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-sm font-medium text-text-primary">
              {t('agreements.openDialog.from')}
            </span>
            <DateField
              value={from}
              onChange={setFrom}
              ariaLabel={t('agreements.openDialog.from')}
            />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-text-primary">
              {t('agreements.openDialog.to')}
            </span>
            <DateField
              value={to}
              onChange={setTo}
              ariaLabel={t('agreements.openDialog.to')}
              placeholder={t('agreements.openDialog.openEndedShort')}
            />
          </div>
        </div>
        <p className="text-xs font-medium text-text-quaternary">
          {t('agreements.openDialog.openEnded')}
        </p>
        {datesProblem ? (
          <p className="text-sm font-medium text-danger-700">
            {t(`agreements.problem.${datesProblem}`)}
          </p>
        ) : null}

        {/* Said before the write, because nothing afterwards can change it. */}
        <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
          {t('agreements.openDialog.fixed')}
        </p>
      </div>
    </Modal>
  )
}

/**
 * A self-billing supplier's business activity (BTOM-033): its record read for the stored code and
 * the version a change is written against, the reader's pick, and the save.
 *
 * The code is the **seller's** (IBR-081-OM puts it on every line) and on a self-billed document the
 * seller is the supplier, so it lives on the supplier's customer record (Zain, 2026-09-30), read at
 * `profile.details.industrialClassificationCode`.
 */
function useSupplierIsic(customerId: string) {
  const { i18n } = useTranslation()
  const recordPath =
    customerId === '' ? null : `${CUSTOMERS_PATH}/${encodeURIComponent(customerId)}`
  const record = useApiRead<CustomerRecordDto>(recordPath, () => loadCustomerRecord(customerId))
  const supplier =
    record.read.status === 'ready' && record.read.data.id === customerId ? record.read.data : null
  const storedIsic = supplier?.profile.details.industrialClassificationCode ?? ''
  // The reader's pick, kept with the supplier it was made for, so switching supplier re-prefills.
  const [pick, setPick] = useState<{ customerId: string; code: string } | null>(null)
  const isic = pick?.customerId === customerId ? pick.code : storedIsic
  const [refused, setRefused] = useState(false)
  const choices = useMemo(() => isicOptions(i18n.language), [i18n.language])

  const choose = (code: string) => {
    setPick({ customerId, code })
    setRefused(false)
  }

  /**
   * PATCHes the code onto the supplier when it changed. A code the server refuses (the same bare
   * 400 the company's own activity gets) is said on the field and answers `refused`; any other
   * failure is thrown for the caller's notice.
   */
  const save = async (): Promise<'unchanged' | 'saved' | 'refused'> => {
    setRefused(false)
    if (supplier === null || isic === storedIsic) return 'unchanged'
    try {
      await patchCustomer(customerId, {
        details: { industrialClassificationCode: isic },
        expectedVersion: supplier.version,
      })
      return 'saved'
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 400 &&
        (error.problemType === 'validation-failed' ||
          error.fieldErrors.some((entry) => entry.field.endsWith('industrialClassificationCode')))
      ) {
        setRefused(true)
        return 'refused'
      }
      throw error
    }
  }

  return { record, supplier, storedIsic, isic, refused, choices, choose, save }
}

type SupplierIsic = ReturnType<typeof useSupplierIsic>

/** The supplier's ISIC picker: the Company profile's list, prefilled from the supplier's record. */
function SupplierIsicField({ activity }: { activity: SupplierIsic }) {
  const { t } = useTranslation()
  const { record, supplier, storedIsic, isic, refused } = activity
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-text-primary">
        {t('agreements.openDialog.isic')}
      </span>
      <Combobox
        value={isic}
        onChange={activity.choose}
        options={activity.choices}
        placeholder={t('agreements.openDialog.isicPlaceholder')}
        searchPlaceholder={t('companyProfile.industrialClassificationSearch')}
        emptyText={t('companyProfile.industrialClassificationNone')}
        ariaLabel={t('agreements.openDialog.isic')}
        disabled={supplier === null}
      />
      <span className="mt-1 block text-xs font-medium text-text-quaternary">
        {t('agreements.openDialog.isicHint')}
      </span>
      {record.read.status === 'failed' ? (
        <span role="alert" className="mt-1 block text-sm font-medium text-danger-700">
          {t('agreements.openDialog.isicUnreadable')}
        </span>
      ) : refused ? (
        <span role="alert" className="mt-1 block text-sm font-medium text-danger-700">
          {t('agreements.openDialog.isicRefused')}
        </span>
      ) : supplier !== null && storedIsic === '' && isic === '' ? (
        <span role="status" className="mt-1 block text-sm font-medium text-pending-700">
          {t('agreements.openDialog.isicRequired')}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Setting the business activity of a supplier whose agreement is already live: without it, the
 * suppliers agreed before the code was asked could never issue. Writes the supplier only; the
 * agreement is not touched.
 */
function SupplierIsicDialog({
  agreement,
  sellerName,
  onCancel,
  onDone,
  onFailure,
}: {
  agreement: AgreementDto
  sellerName: string | null
  onCancel: () => void
  onDone: () => void
  onFailure: (error: unknown) => void
}) {
  const { t } = useTranslation()
  const activity = useSupplierIsic(agreement.customerId)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      if ((await activity.save()) === 'refused') return
      onDone()
    } catch (error) {
      onFailure(error)
      onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={t('agreements.isicDialog.title')}
      subtitle={sellerName ?? t('agreements.unknownSeller')}
      width={520}
      footer={
        <DialogActions
          confirmLabel={
            saving ? t('agreements.isicDialog.saving') : t('agreements.isicDialog.save')
          }
          confirmDisabled={activity.supplier === null || activity.isic === '' || saving}
          onConfirm={submit}
          onCancel={onCancel}
        />
      }
    >
      <SupplierIsicField activity={activity} />
    </Modal>
  )
}

/** Withdrawing is terminal, and the dialog is where that is said. */
function WithdrawDialog({
  agreement,
  sellerName,
  onCancel,
  onDone,
  onFailure,
}: {
  agreement: AgreementDto
  sellerName: string | null
  onCancel: () => void
  onDone: () => void
  onFailure: (error: unknown) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      await withdrawAgreement(agreement.id, reason)
      onDone()
    } catch (error) {
      onFailure(error)
      onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={t('agreements.withdrawDialog.title')}
      width={520}
      footer={
        <DialogActions
          confirmLabel={
            saving
              ? t('agreements.withdrawDialog.withdrawing')
              : t('agreements.withdrawDialog.confirm')
          }
          confirmDisabled={saving}
          danger
          onConfirm={submit}
          onCancel={onCancel}
        />
      }
    >
      <p className="text-sm font-medium leading-[1.5] text-text-secondary">
        {t('agreements.withdrawDialog.body', {
          seller: sellerName ?? t('agreements.unknownSeller'),
          reference: agreement.agreementReference,
        })}
      </p>
      <p className="mt-2 rounded-md bg-danger-100 p-3 text-sm font-medium text-danger-700">
        {t('agreements.withdrawDialog.terminal')}
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-medium text-text-primary">
          {t('agreements.withdrawDialog.reason')}
        </span>
        <input
          type="text"
          maxLength={WITHDRAWAL_REASON_MAX}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-label={t('agreements.withdrawDialog.reason')}
          className={FIELD}
        />
      </label>
    </Modal>
  )
}
