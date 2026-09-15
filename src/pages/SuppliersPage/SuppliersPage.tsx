import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, Pager, Popover, RowsView, type ActionMenuItem } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { pageCountOf, type Page } from '../../api'
import {
  loadSupplierPage,
  loadSupplierSummary,
  supplierListPath,
  switchSupplier,
  SUPPLIER_SUMMARY_PATH,
  type SupplierListRowDto,
  type SupplierSummaryDto,
} from '../../api/expenditure/suppliers'
import {
  isSupplierSort,
  isSupplierTab,
  RECORD_LABEL,
  ROW_ACTION,
  SUPPLIER_PAGE_SIZE,
  SUPPLIER_SORTS,
  SUPPLIER_TABS,
  tabCount,
  toSupplierListItem,
  type Note,
  type SupplierChannel,
  type SupplierListItem,
  type SupplierSortKey,
  type SupplierTabId,
} from '../../lib/supplierList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { SuppliersEmptyState } from './SuppliersEmptyState'
import kpiSuppliersIcon from '../../assets/suppliers/kpi-suppliers.svg'
import kpiPeppolIcon from '../../assets/suppliers/kpi-peppol.svg'
import kpiOweIcon from '../../assets/suppliers/kpi-owe.svg'
import kpiFixIcon from '../../assets/suppliers/kpi-fix.svg'
import chipPeppolIcon from '../../assets/suppliers/chip-peppol.svg'
import chipPaperIcon from '../../assets/suppliers/chip-paper.svg'
import chipEmailIcon from '../../assets/suppliers/chip-email.svg'
import menuOrderIcon from '../../assets/suppliers/menu-order.svg'
import menuBillIcon from '../../assets/suppliers/menu-bill.svg'
import menuPayIcon from '../../assets/suppliers/menu-pay.svg'
import menuAttachIcon from '../../assets/suppliers/menu-attach.svg'
import menuStatementIcon from '../../assets/suppliers/menu-statement.svg'
import menuCopyIcon from '../../assets/suppliers/menu-copy.svg'
import menuOffIcon from '../../assets/suppliers/menu-off.svg'
import importIcon from '../../assets/bills/upload.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/bills/sort.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

/**
 * A supplier whose channel was never recorded gets the neutral chip. The API calls it MANUAL, which
 * says nothing about how their bills arrive, so it must not borrow the paper or email look.
 */
const CHANNEL_CHIP: Record<SupplierChannel, { icon: string | null; tone: string }> = {
  peppol: { icon: chipPeppolIcon, tone: 'bg-success-100 text-[#3d5648]' },
  emailPdf: { icon: chipEmailIcon, tone: 'bg-primary-50 text-primary-800' },
  paper: { icon: chipPaperIcon, tone: 'bg-pending-100 text-pending-700' },
  manual: { icon: null, tone: 'bg-surface-background text-text-tertiary' },
}

/** The dots in "their record" run dark for a complete record and amber for one with a hole. */
const SCORE_TONE: Record<number, string> = {
  4: 'bg-[#3d5648]',
  3: 'bg-pending-500',
  2: 'bg-pending-500',
  1: 'bg-warning-700',
  0: 'bg-border-default',
}

const ROW_ACTION_CLASS =
  'inline-flex h-[34px] items-center whitespace-nowrap rounded-sm border border-border-subtle bg-white px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-primary-25'

/** How long typing pauses before the search is sent, so each keystroke is not a request. */
const SEARCH_DELAY_MS = 300

export function SuppliersPage() {
  return (
    <AppShell>
      <SuppliersScreen />
    </AppShell>
  )
}

/**
 * Inside the shell, so its reads start only once the shell has confirmed a session. The tab,
 * search, sort and page live in the URL, so a filtered list survives a reload and the back button.
 */
function SuppliersScreen() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const [params, setParams] = useSearchParams()

  const tab: SupplierTabId = isSupplierTab(params.get('tab')) ? (params.get('tab') as SupplierTabId) : 'all'
  const sortKey: SupplierSortKey = isSupplierSort(params.get('sort'))
    ? (params.get('sort') as SupplierSortKey)
    : 'nameAsc'
  const query = params.get('q') ?? ''
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  // From the params as they are when it runs, not as they were when a delayed search was armed,
  // so a tab chosen during the pause is not put back.
  const update = (changes: Record<string, string | null>) => {
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
  }

  const [typed, setTyped] = useState(query)
  useEffect(() => setTyped(query), [query])
  useEffect(() => {
    if (typed === query) return
    const timer = window.setTimeout(() => update({ q: typed.trim() || null, page: null }), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
    // Armed by typing only: `update` is a new function each render, and depending on it would
    // restart the pause on every render. It reads the params when it runs, so nothing goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed])

  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLButtonElement>(null)
  const [actionError, setActionError] = useState<unknown>(null)

  const summary = useApiRead<SupplierSummaryDto>(SUPPLIER_SUMMARY_PATH, loadSupplierSummary)
  const listPath = supplierListPath({
    filter: SUPPLIER_TABS.find((entry) => entry.id === tab)?.filter ?? 'ALL',
    q: query,
    sort: SUPPLIER_SORTS.find((option) => option.value === sortKey)?.sort ?? 'NAME',
    page: pageNumber - 1,
    pageSize: SUPPLIER_PAGE_SIZE,
  })
  const list = useApiRead<Page<SupplierListRowDto>>(listPath, () => loadSupplierPage(listPath))

  const refresh = () => {
    summary.retry()
    list.retry()
  }

  const onSwitch = async (supplier: SupplierListItem) => {
    setActionError(null)
    try {
      await switchSupplier(supplier.id, supplier.active ? 'off' : 'on')
      refresh()
    } catch (error) {
      setActionError(error)
    }
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-[720px]">
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('suppliersPage.title')}</h1>
        <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('suppliersPage.subtitle')}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
        {can(session, 'customer.import') ? (
          <Link
            to="/suppliers/import"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={importIcon} alt="" className="size-5" />
            {t('suppliersPage.importFromExcel')}
          </Link>
        ) : null}
        {can(session, 'supplier.manage') ? (
          <Link
            to="/suppliers/new"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
            {t('suppliersPage.newSupplier')}
          </Link>
        ) : null}
      </div>
    </div>
  )

  if (summary.read.status === 'loading') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {header}
        <LoadingNotice />
      </div>
    )
  }
  if (summary.read.status === 'failed') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {header}
        <ApiReadFailure error={summary.read.error} retry={summary.retry} />
      </div>
    )
  }

  const totals = summary.read.data
  if (totals.total === 0) return <SuppliersEmptyState />

  const scope =
    tab === 'active'
      ? t('suppliersPage.scope.active')
      : tab === 'switchedOff'
        ? t('suppliersPage.scope.switchedOff')
        : t('suppliersPage.scope.all')
  const language = i18n.language
  const count = (value: number) => formatCount(value, language)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {header}

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50">
              <img src={kpiSuppliersIcon} alt="" className="size-[18px]" />
            </span>
            <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{t('suppliersPage.kpi.suppliers')}</h3>
          </div>
          <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
            {count(totals.total)}
          </p>
          <p className="mt-2 text-xs font-medium leading-[1.3] text-text-quaternary">
            {t('suppliersPage.kpi.suppliersNote', { active: count(totals.active), off: count(totals.switchedOff) })}
          </p>
        </article>

        <article className="rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-100">
              <img src={kpiPeppolIcon} alt="" className="size-[18px]" />
            </span>
            <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{t('suppliersPage.kpi.peppol')}</h3>
          </div>
          <p className="mt-3 flex items-baseline gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
            {count(totals.onPeppol)}
            <span className="text-sm font-medium text-text-quaternary">
              {t('suppliersPage.kpi.peppolOf', { total: count(totals.total) })}
            </span>
          </p>
          <p className="mt-2 text-xs font-medium leading-[1.3] text-text-quaternary">
            {t('suppliersPage.kpi.peppolNote', { count: totals.notOnPeppol })}
          </p>
        </article>

        <article className="rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50">
              <img src={kpiOweIcon} alt="" className="size-[18px]" />
            </span>
            <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{t('suppliersPage.kpi.owe')}</h3>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
            <img src={omrRowIcon} alt="" className="h-auto w-[22px] shrink-0" />
            {formatAmount(totals.owedTotal, totals.currencyCode, language)}
          </p>
          <p className="mt-2 text-xs font-medium leading-[1.3] text-text-quaternary">
            {t('suppliersPage.kpi.oweNote', { count: totals.openBills })}
          </p>
        </article>

        <article className="rounded-md border border-pending-200 bg-pending-100 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pending-500">
              <img src={kpiFixIcon} alt="" className="size-[18px]" />
            </span>
            <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{t('suppliersPage.kpi.needsFix')}</h3>
          </div>
          <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-pending-700 tabular-nums">
            {count(totals.needsFixSuppliers)}
          </p>
          <p className="mt-2 text-xs font-medium leading-[1.3] text-text-tertiary">
            {t('suppliersPage.kpi.needsFixNote', {
              bank: count(totals.needsFix.noBankDetails),
              vat: count(totals.needsFix.noVat),
              account: count(totals.needsFix.bankChanged),
            })}
          </p>
        </article>
      </div>

      {/* Table */}
      <section className="rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
          {SUPPLIER_TABS.map((entry) => {
            const isActive = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => update({ tab: entry.id === 'all' ? null : entry.id, page: null })}
                className={[
                  'inline-flex h-[54px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary-700 text-primary-700'
                    : 'border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(entry.labelKey)}
                <span className={['text-xs font-semibold', isActive ? 'text-primary-700' : 'text-text-quaternary'].join(' ')}>
                  {count(tabCount(totals, entry.id))}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="relative flex h-[46px] w-full max-w-[344px] items-center max-md:max-w-none max-md:basis-full">
            <img src={searchIcon} alt="" className="pointer-events-none absolute start-3.5 size-5 opacity-60" />
            <input
              type="search"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t('suppliersPage.searchPlaceholder')}
              aria-label={t('suppliersPage.searchPlaceholder')}
              maxLength={200}
              className="h-full w-full rounded-sm border border-border-subtle bg-white ps-11 pe-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary focus:border-primary-300"
            />
          </label>

          <div className="flex items-center gap-2.5">
            <button
              ref={sortRef}
              type="button"
              onClick={() => setSortOpen((open) => !open)}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={sortIcon} alt="" className="size-5" />
              {t('suppliersPage.sort')}
            </button>
            <Popover anchorRef={sortRef} open={sortOpen} onClose={() => setSortOpen(false)}>
              <ul className="w-[220px] py-1.5">
                {SUPPLIER_SORTS.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      onClick={() => {
                        update({ sort: option.value === 'nameAsc' ? null : option.value, page: null })
                        setSortOpen(false)
                      }}
                      className={[
                        'flex w-full px-4 py-2.5 text-start text-sm font-medium transition-colors hover:bg-primary-25',
                        option.value === sortKey ? 'text-primary-700' : 'text-text-secondary',
                      ].join(' ')}
                    >
                      {t(option.labelKey)}
                    </button>
                  </li>
                ))}
              </ul>
            </Popover>
          </div>
        </div>

        {actionError ? (
          <div className="px-5 pb-4">
            <Notice
              body={failureText(t, actionError)}
              action={{ label: t('common.close'), onClick: () => setActionError(null) }}
            />
          </div>
        ) : null}

        {list.read.status === 'failed' ? (
          <div className="px-5 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : (
          <SupplierTable
            page={list.read.status === 'ready' ? list.read.data : null}
            language={language}
            onSwitch={onSwitch}
          />
        )}

        {list.read.status === 'ready' && list.read.data.items.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-sm font-medium text-text-quaternary">
              {t('suppliersPage.showing', {
                shown: count(list.read.data.items.length),
                total: count(list.read.data.total ?? list.read.data.items.length),
                scope,
              })}
            </p>
            {pageCountOf(list.read.data) > 1 ? (
              <Pager
                page={pageNumber}
                pageCount={pageCountOf(list.read.data)}
                onChange={(next) => update({ page: next === 1 ? null : String(next) })}
                labels={{
                  nav: t('appList.pager.label'),
                  previous: t('appList.pager.previous'),
                  next: t('appList.pager.next'),
                }}
              />
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}

function failureText(t: (key: string, values?: Record<string, unknown>) => string, error: unknown): string {
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

function SupplierTable({
  page,
  language,
  onSwitch,
}: {
  page: Page<SupplierListRowDto> | null
  language: string
  onSwitch: (supplier: SupplierListItem) => void
}) {
  const { t } = useTranslation()
  return (
    <RowsView className="px-5">
      <table className="w-full min-w-[1140px] border-collapse">
        <thead>
          <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
            {(['supplier', 'howTheyBill', 'terms', 'youOwe', 'theirRecord'] as const).map((key, index) => (
              <th
                key={key}
                className={['h-[46px] px-4 font-semibold first:rounded-s-sm', index === 3 ? 'text-end' : 'text-start'].join(' ')}
              >
                {t(`suppliersPage.col.${key}`)}
              </th>
            ))}
            <th className="h-[46px] px-4" />
            <th className="h-[46px] rounded-e-sm px-4" />
          </tr>
        </thead>
        <tbody>
          {page === null ? (
            <tr>
              <td colSpan={7} role="status" className="py-12 text-center text-sm font-medium text-text-quaternary">
                {t('appAccess.loading')}
              </td>
            </tr>
          ) : page.items.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-12 text-center text-sm font-medium text-text-quaternary">
                {t('suppliersPage.empty')}
              </td>
            </tr>
          ) : (
            page.items.map((row) => {
              const supplier = toSupplierListItem(row)
              return (
                <SupplierTableRow
                  key={supplier.id}
                  supplier={supplier}
                  language={language}
                  onSwitch={() => onSwitch(supplier)}
                />
              )
            })
          )}
        </tbody>
      </table>
    </RowsView>
  )
}

function NoteText({ note }: { note: Note | { text: string } }) {
  const { t } = useTranslation()
  return <>{'text' in note ? note.text : t(note.key, note.values)}</>
}

function SupplierTableRow({
  supplier,
  language,
  onSwitch,
}: {
  supplier: SupplierListItem
  language: string
  onSwitch: () => void
}) {
  const { t } = useTranslation()
  const session = useSession()
  const chip = CHANNEL_CHIP[supplier.channel]
  const detail = `/suppliers/${supplier.id}`

  const menu: (ActionMenuItem & { requires: string })[] = [
    {
      id: 'newPurchaseOrder',
      sectionKey: 'suppliersPage.menu.workWithThem',
      labelKey: 'suppliersPage.menu.newPurchaseOrder',
      descriptionKey: 'suppliersPage.menu.newPurchaseOrderNote',
      icon: menuOrderIcon,
      to: `${detail}/purchase-order`,
      requires: 'purchase-order.manage',
    },
    {
      id: 'recordBill',
      labelKey: 'suppliersPage.menu.recordBill',
      descriptionKey: 'suppliersPage.menu.recordBillNote',
      icon: menuBillIcon,
      to: `${detail}/record-bill`,
      requires: 'invoice.payment.manage',
    },
    {
      id: 'payNow',
      labelKey: 'suppliersPage.menu.payNow',
      descriptionKey: 'suppliersPage.menu.payNowNote',
      icon: menuPayIcon,
      to: '/expenditure/payments',
      requires: 'invoice.payment.manage',
    },
    {
      id: 'attachDocument',
      sectionKey: 'suppliersPage.menu.theirRecord',
      labelKey: 'suppliersPage.menu.attachDocument',
      descriptionKey: 'suppliersPage.menu.attachDocumentNote',
      icon: menuAttachIcon,
      to: detail,
      requires: 'supplier.manage',
    },
    {
      id: 'exportStatement',
      labelKey: 'suppliersPage.menu.exportStatement',
      descriptionKey: 'suppliersPage.menu.exportStatementNote',
      icon: menuStatementIcon,
      to: `${detail}/statement`,
      requires: 'supplier.read',
    },
    {
      id: 'copyToNew',
      labelKey: 'suppliersPage.menu.copyToNew',
      descriptionKey: 'suppliersPage.menu.copyToNewNote',
      icon: menuCopyIcon,
      to: '/suppliers/new',
      requires: 'supplier.manage',
    },
    supplier.active
      ? {
          id: 'switchOff',
          labelKey: 'suppliersPage.menu.switchOff',
          descriptionKey: 'suppliersPage.menu.switchOffNoteSearchable',
          icon: menuOffIcon,
          danger: true,
          onSelect: onSwitch,
          requires: 'supplier.manage',
        }
      : {
          id: 'switchOn',
          labelKey: 'suppliersPage.menu.switchOn',
          descriptionKey: 'suppliersPage.menu.switchOnNote',
          icon: menuOffIcon,
          onSelect: onSwitch,
          requires: 'supplier.manage',
        },
  ]
  const items: ActionMenuItem[] = menu.flatMap(({ requires, ...item }) => (can(session, requires) ? [item] : []))

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-4 py-4 align-top">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-xs font-semibold text-primary-800">
            {supplier.initials}
          </span>
          <div className="min-w-0">
            <Link to={detail} className="whitespace-nowrap text-sm font-semibold text-text-primary hover:text-primary-700">
              {supplier.name}
            </Link>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {!supplier.active
                ? t('suppliersPage.record.switchedOff')
                : supplier.vat
                  ? t('suppliersPage.vatNumber', { vat: supplier.vat })
                  : t('suppliersPage.noVatOnFile')}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex h-[24px] items-center gap-1.5 rounded-sm px-2 text-[11px] font-semibold uppercase tracking-[0.4px]',
            chip.tone,
          ].join(' ')}
        >
          {chip.icon ? <img src={chip.icon} alt="" className="size-3" /> : null}
          {t(`suppliersPage.channel.${supplier.channel}`)}
        </span>
        {supplier.channelNote ? (
          <p className="mt-1.5 max-w-[170px] text-xs font-medium leading-[1.4] text-text-quaternary" dir="auto">
            <NoteText note={supplier.channelNote} />
          </p>
        ) : null}
      </td>

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium text-text-secondary" dir="auto">
          <NoteText note={supplier.terms} />
        </p>
        {supplier.termsNote ? (
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            <NoteText note={supplier.termsNote} />
          </p>
        ) : null}
      </td>

      <td className="px-4 py-4 align-top text-end">
        <p
          className={[
            'flex items-center justify-end gap-1 text-sm font-semibold tabular-nums',
            supplier.owed === 0 ? 'text-text-quaternary' : 'text-text-primary',
          ].join(' ')}
        >
          <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
          {formatAmount(supplier.owed, supplier.currency, language)}
        </p>
        <p
          className={[
            'mt-1 whitespace-nowrap text-xs font-medium',
            supplier.owedAlert ? 'text-warning-700' : 'text-text-quaternary',
          ].join(' ')}
        >
          <NoteText note={supplier.owedNote} />
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-[3px]" aria-hidden="true">
            {[0, 1, 2, 3].map((dot) => (
              <span
                key={dot}
                className={['size-[7px] rounded-[2px]', dot < supplier.score ? SCORE_TONE[supplier.score] : 'bg-border-subtle'].join(' ')}
              />
            ))}
          </span>
          <span className="whitespace-nowrap text-sm font-medium text-text-secondary">{t(RECORD_LABEL[supplier.issue])}</span>
        </div>
        {supplier.recordNote ? (
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            <NoteText note={supplier.recordNote} />
          </p>
        ) : null}
      </td>

      <td className="px-4 py-4 align-top">
        {supplier.issue === 'switchedOff' ? (
          // "Turn back on" does what it says rather than opening the record, and only for someone
          // allowed to do it.
          can(session, 'supplier.manage') ? (
            <button type="button" onClick={onSwitch} className={ROW_ACTION_CLASS}>
              {t(ROW_ACTION.switchedOff)}
            </button>
          ) : null
        ) : (
          <Link to={detail} className={ROW_ACTION_CLASS}>
            {t(ROW_ACTION[supplier.issue])}
          </Link>
        )}
      </td>

      <td className="px-4 py-4 align-top text-end">
        {items.length > 0 ? <ActionMenu wide label={t('suppliersPage.rowActions')} items={items} /> : null}
      </td>
    </tr>
  )
}
