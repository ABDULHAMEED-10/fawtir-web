import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Pill, Kpi, TabStrip } from './CatalogShell'
import { ItemTabs } from './ItemTabs'
import { FilterMenu, Rial, RowsView, SortMenu } from '../../components/ui'
import { omr } from '../../lib/catalog'
import {
  ITEM,
  SOLD_90,
  USED_DOCUMENTS,
  USED_TABS,
  USED_TOTAL,
  USED_SUMMARY,
  countUsedTab,
  matchesUsedTab,
  type UsedDocument,
  type UsedTab,
} from '../../lib/catalogItem'
import downloadIcon from '../../assets/catalog/download-ink.svg'
import searchIcon from '../../assets/invoices/search.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import kpiTillIcon from '../../assets/catalog/kpi-items.svg'
import kpiInvoiceIcon from '../../assets/catalog/kpi-percent.svg'
import kpiQuoteIcon from '../../assets/catalog/kpi-items.svg'
import kpiBundleIcon from '../../assets/catalog/kind-bundle.svg'

const KIND_TONE: Record<string, string> = {
  quotation: 'bg-pending-100 text-pending-700',
  bundle: 'bg-success-100 text-[#3d5648]',
  invoice: 'bg-primary-50 text-primary-800',
  till: 'bg-surface-background text-text-tertiary',
}

const SORTS = [
  { value: 'newest', labelKey: 'activityLog.sort.newest' },
  { value: 'oldest', labelKey: 'activityLog.sort.oldest' },
]

/**
 * Catalog › one item › Where it's been used (Figma 135:47097).
 *
 * Every document the item appears on. Till sales are rolled into one line because they are not
 * documents with numbers, which is why the tab beside them is not part of the total.
 */
export function ItemUsedPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [tab, setTab] = useState<UsedTab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = USED_DOCUMENTS.filter(
      (row) =>
        matchesUsedTab(row, tab) &&
        (needle === '' ||
          row.reference.toLowerCase().includes(needle) ||
          row.customer.toLowerCase().includes(needle)),
    )
    return sort === 'oldest' ? [...filtered].reverse() : filtered
  }, [tab, query, sort])

  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { label: ITEM.name }]}
      title={ITEM.name}
      subtitle={t('itemUsed.meta', { group: ITEM.group, kind: ITEM.itemKind, code: ITEM.code })}
      pills={
        <>
          <Pill tone="success">{t('item.onSale')}</Pill>
          <Pill tone="brand">
            {t('item.soldTimes', { count: SOLD_90.toLocaleString('en-US') })}
          </Pill>
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={downloadIcon} alt="" className="size-[18px]" />
            {t('itemSells.export')}
          </button>
          <Link
            to={`/catalog/${id ?? ITEM.id}`}
            className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t('item.editTheItem')}
          </Link>
        </>
      }
      tabs={<ItemTabs id={id ?? ITEM.id} active="used" />}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiTillIcon}
          label={t('itemUsed.kpi.tillReceipts')}
          value={USED_SUMMARY.tillReceipts.toLocaleString('en-US')}
          note={t('itemUsed.kpi.tillReceiptsNote')}
        />
        <Kpi
          icon={kpiInvoiceIcon}
          label={t('itemUsed.kpi.onInvoices')}
          value={String(USED_SUMMARY.onInvoices)}
          note={t('itemUsed.kpi.onInvoicesNote', { units: USED_SUMMARY.invoiceUnits })}
        />
        <Kpi
          icon={kpiQuoteIcon}
          tint="bg-pending-100"
          label={t('itemUsed.kpi.onQuotations')}
          value={String(USED_SUMMARY.openQuotations)}
          note={t('itemUsed.kpi.onQuotationsNote', { count: USED_SUMMARY.quotationsAtOldPrice })}
        />
        <Kpi
          icon={kpiBundleIcon}
          tint="bg-success-100"
          label={t('itemUsed.kpi.insideBundles')}
          value={String(USED_SUMMARY.insideBundles)}
          note={t('itemUsed.kpi.insideBundlesNote', {
            name: USED_SUMMARY.bundleName,
            count: USED_SUMMARY.bundleSold,
          })}
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip tabs={USED_TABS} value={tab} onChange={setTab} count={countUsedTab} />

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] min-w-[280px] flex-1 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('itemUsed.search')}
              aria-label={t('itemUsed.search')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <FilterMenu
              label={t('catalog.filters')}
              value={tab}
              defaultValue="all"
              options={USED_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: countUsedTab(entry.id),
              }))}
              onChange={setTab}
            />
            <SortMenu value={sort} onChange={setSort} options={SORTS} />
          </div>
        </div>

        <RowsView>
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                {(['document', 'what', 'who', 'when'] as const).map((key) => (
                  <th key={key} className="h-[46px] px-4 text-start font-semibold">
                    {t(`itemUsed.col.${key}`)}
                  </th>
                ))}
                <th className="h-[46px] px-4 text-end font-semibold">
                  {t('itemUsed.col.howMany')}
                </th>
                <th className="h-[46px] px-4 text-end font-semibold">{t('itemUsed.col.value')}</th>
                <th className="h-[46px] px-4" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm font-medium text-text-quaternary"
                  >
                    {t('itemUsed.empty')}
                  </td>
                </tr>
              ) : (
                rows.map((row) => <UsedRow key={row.id} row={row} />)
              )}
            </tbody>
          </table>
        </RowsView>

        <p className="px-5 py-4 text-sm font-medium text-text-quaternary">
          {t('itemUsed.showing', { shown: rows.length, total: USED_TOTAL })}
        </p>
      </section>
    </CatalogShell>
  )
}

function UsedRow({ row }: { row: UsedDocument }) {
  const { t } = useTranslation()
  const label = row.reference.includes('.')
    ? t(row.reference, { count: row.quantity.toLocaleString('en-US') })
    : row.reference

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-4 py-4 align-top">
        {row.to ? (
          <Link
            to={row.to}
            className="text-sm font-semibold text-primary-700 transition-colors hover:underline"
          >
            {label}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-primary-700">{label}</span>
        )}
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {t(row.noteKey, row.noteValues)}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex h-[24px] items-center rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
            KIND_TONE[row.kind],
          ].join(' ')}
        >
          {t(`itemUsed.kind.${row.kind}`)}
        </span>
        <p className="mt-1.5 text-xs font-medium text-text-quaternary">
          {t(row.stateKey, { date: '12 Aug' })}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium text-text-primary">
          {row.customer.includes('.') ? t(row.customer) : row.customer}
        </p>
        <p className="mt-1 max-w-[230px] text-xs font-medium leading-[1.4] text-text-quaternary">
          {t(row.purposeKey, { date: row.when.split(' ').slice(0, 2).join(' ') })}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="whitespace-nowrap text-sm font-medium text-text-primary">
          {row.when.includes('.') ? t(row.when) : row.when}
        </p>
        <p className="mt-1 whitespace-nowrap text-xs font-medium text-text-quaternary">
          {t(row.agoKey, row.agoValues)}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums">
          {row.quantity.toLocaleString('en-US')}
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {row.sizeKey.includes('.') ? t(row.sizeKey) : row.sizeKey}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <p className="flex items-baseline justify-end gap-1">
          <span className="text-sm font-semibold text-text-primary">
            <Rial />
          </span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">
            {omr(row.lineValue)}
          </span>
        </p>
        <p
          className={[
            'mt-1 text-xs font-medium',
            row.atPriceOld ? 'text-pending-700' : 'text-text-quaternary',
          ].join(' ')}
        >
          {row.kind === 'bundle'
            ? t('itemUsed.ofABundle', { price: row.atPrice })
            : row.kind === 'till'
              ? t('itemUsed.average', { price: row.atPrice })
              : row.atPriceOld
                ? t('itemUsed.atOldPrice', { price: row.atPrice })
                : t('itemUsed.atPrice', { price: row.atPrice })}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <img
          src={chevronIcon}
          alt=""
          aria-hidden="true"
          className="ms-auto size-5 opacity-40 rtl:rotate-180"
        />
      </td>
    </tr>
  )
}
