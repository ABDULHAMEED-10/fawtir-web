import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { CatalogShell, Pill, TabStrip } from './CatalogShell'
import { ItemTabs } from './ItemTabs'
import { FilterMenu, SortMenu } from '../../components/ui'
import {
  ITEM,
  SOLD_90,
  CHANGES,
  CHANGE_TABS,
  CHANGE_BOOK,
  countChangeTab,
  matchesChangeTab,
  type Change,
  type ChangeTab,
} from '../../lib/catalogItem'
import downloadIcon from '../../assets/catalog/download-ink.svg'
import searchIcon from '../../assets/invoices/search.svg'
import upIcon from '../../assets/catalog/arrow-up.svg'
import plusIcon from '../../assets/catalog/plus-brand.svg'
import percentIcon from '../../assets/catalog/menu-percent.svg'
import tickIcon from '../../assets/catalog/check-green.svg'
import infoIcon from '../../assets/catalog/info.svg'

const KIND_ICON: Record<string, string> = {
  priceUp: upIcon,
  bulk: upIcon,
  added: plusIcon,
  tax: percentIcon,
  created: tickIcon,
}

const KIND_TINT: Record<string, string> = {
  priceUp: 'bg-pending-100',
  bulk: 'bg-pending-100',
  added: 'bg-primary-50',
  tax: 'bg-danger-100',
  created: 'bg-success-100',
}

const CHIP_TONE = {
  was: 'bg-danger-100 text-danger-700 line-through',
  now: 'bg-success-100 text-[#3d5648]',
  plain: 'bg-surface-background text-text-tertiary',
}

const BADGE_TONE: Record<string, string> = {
  'itemChanges.byHand': 'bg-surface-background text-text-tertiary',
  'itemChanges.bulkChange': 'bg-pending-100 text-pending-700',
  'itemChanges.catalogBuilder': 'bg-primary-50 text-primary-800',
}

const SORTS = [
  { value: 'newest', labelKey: 'activityLog.sort.newest' },
  { value: 'oldest', labelKey: 'activityLog.sort.oldest' },
]

/**
 * Catalog › one item › Changes (Figma 135:47565).
 *
 * Not a list of edits but a list of consequences: each entry says what moved and what happened
 * to sales afterwards, which is the only reason to keep the history at all.
 */
export function ItemChangesPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [tab, setTab] = useState<ChangeTab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = CHANGES.filter(
      (change) =>
        matchesChangeTab(change, tab) &&
        (needle === '' ||
          t(change.titleKey, change.titleValues).toLowerCase().includes(needle) ||
          change.who.toLowerCase().includes(needle)),
    )
    return sort === 'oldest' ? [...filtered].reverse() : filtered
  }, [tab, query, sort, t])

  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { label: ITEM.name }]}
      title={ITEM.name}
      subtitle={t('itemChanges.meta', { code: ITEM.code })}
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
      tabs={<ItemTabs id={id ?? ITEM.id} active="changes" />}
    >
      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip tabs={CHANGE_TABS} value={tab} onChange={setTab} count={countChangeTab} />

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] min-w-[280px] flex-1 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('itemChanges.search')}
              aria-label={t('itemChanges.search')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5">
            <FilterMenu
              label={t('catalog.filters')}
              value={tab}
              defaultValue="all"
              options={CHANGE_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: countChangeTab(entry.id),
              }))}
              onChange={setTab}
            />
            <SortMenu value={sort} onChange={setSort} options={SORTS} />
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm font-medium text-text-quaternary">
            {t('itemChanges.empty')}
          </p>
        ) : (
          <ul>
            {rows.map((change) => (
              <ChangeRow key={change.id} change={change} />
            ))}
          </ul>
        )}

        <p className="border-t border-surface-background px-5 py-4 text-sm font-medium text-text-quaternary">
          {t('itemChanges.showing', { shown: rows.length, total: CHANGE_BOOK.total })}
        </p>
      </section>
    </CatalogShell>
  )
}

function ChangeRow({ change }: { change: Change }) {
  const { t } = useTranslation()

  return (
    <li className="flex flex-wrap items-start gap-4 border-t border-surface-background px-5 py-5">
      <div className="w-[110px] shrink-0">
        <p className="text-sm font-medium text-text-primary">{change.date}</p>
        <p className="mt-0.5 text-xs font-medium text-text-quaternary tabular-nums">{change.at}</p>
      </div>

      <span
        className={[
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          KIND_TINT[change.kind],
        ].join(' ')}
      >
        <img src={KIND_ICON[change.kind]} alt="" className="size-4" />
      </span>

      <div className="min-w-[280px] flex-1">
        <p className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-base font-semibold leading-[1.3] text-text-primary">
            {t(change.titleKey, change.titleValues)}
          </span>
          <span
            className={[
              'inline-flex h-[22px] shrink-0 items-center rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
              BADGE_TONE[change.badgeKey],
            ].join(' ')}
          >
            {t(change.badgeKey)}
          </span>
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {change.who} · {t(change.fromKey, { count: 34, group: 'Brewed drinks' })}
        </p>

        <span className="mt-3 flex flex-wrap items-center gap-2">
          {change.chips.map((chip, index) => (
            <span key={chip.label} className="flex items-center gap-2">
              {index === 1 && change.chips[0].tone === 'was' ? (
                <span className="text-text-quaternary">›</span>
              ) : null}
              <span
                className={[
                  'inline-flex h-[26px] items-center rounded-[3px] px-2.5 text-xs font-medium',
                  CHIP_TONE[chip.tone],
                ].join(' ')}
              >
                {chip.label}
              </span>
            </span>
          ))}
        </span>

        {change.noteKey ? (
          <p className="mt-3 text-sm font-medium leading-[1.6] text-text-tertiary">
            <Trans
              i18nKey={change.noteKey}
              values={change.noteValues}
              components={{ b: <b className="font-semibold text-text-primary" /> }}
            />
          </p>
        ) : null}

        {change.outcomeKey ? (
          <p
            className={[
              'mt-3 flex items-start gap-2 rounded-sm px-3 py-2.5 text-sm font-medium leading-[1.5]',
              change.outcomeTone === 'good'
                ? 'bg-success-100/60 text-[#3d5648]'
                : 'bg-surface-background text-text-tertiary',
            ].join(' ')}
          >
            <img
              src={change.outcomeTone === 'good' ? tickIcon : infoIcon}
              alt=""
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              <Trans
                i18nKey={change.outcomeKey}
                values={change.outcomeValues}
                components={{ b: <b className="font-semibold" /> }}
              />
            </span>
          </p>
        ) : null}
      </div>
    </li>
  )
}
