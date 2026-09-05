import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell } from './CatalogShell'
import { Select, TableCheckbox } from '../../components/ui'
import { UNIT_OPTIONS } from '../../lib/catalogues'
import { omr } from '../../lib/catalog'
import { SUGGESTED, DEFAULT_PICKS, readyToAdd, BUSINESS_KIND } from '../../lib/catalogBuild'
import searchIcon from '../../assets/invoices/search.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import bagIcon from '../../assets/catalog/kind-bag.svg'
import plusIcon from '../../assets/catalog/plus-muted.svg'
import tickWhiteIcon from '../../assets/catalog/check-white.svg'

/**
 * Catalog › Build your catalog (Figma 135:43755).
 *
 * Three panes that narrow left to right — group, kind, then the exact things that carry a price.
 * The counter is the number of leaves ticked, so it can never promise to create a branch.
 */
export function BuildCatalogPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [picks, setPicks] = useState<Set<string>>(new Set(DEFAULT_PICKS))
  const [group, setGroup] = useState('greenBeans')
  const [kind, setKind] = useState('houseBlend')
  const [kindQuery, setKindQuery] = useState('')
  const [sizeQuery, setSizeQuery] = useState('')
  const [prices, setPrices] = useState<Record<string, number>>({})

  const toggle = (id: string) =>
    setPicks((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const activeGroup = SUGGESTED.find((entry) => entry.id === group)
  const activeKind = activeGroup?.kinds.find((entry) => entry.id === kind)

  const ready = useMemo(() => readyToAdd(picks), [picks])

  const pickedKinds = (groupId: string) =>
    SUGGESTED.find((entry) => entry.id === groupId)?.kinds.filter((k) => picks.has(k.id)).length ??
    0

  const pickedSizes = (kindId: string) =>
    activeGroup?.kinds.find((k) => k.id === kindId)?.sizes.filter((s) => picks.has(s.id)).length ??
    0

  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'buildCatalog.breadcrumb' },
      ]}
      title={t('buildCatalog.title')}
      subtitle={t('buildCatalog.subtitle')}
      actions={
        <Link
          to="/catalog/upload"
          className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('buildCatalog.uploadInstead')}
        </Link>
      }
    >
      {/* What Fawtir is going on */}
      <section className="flex flex-wrap items-center gap-4 rounded-md border border-primary-100 bg-primary-25 p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-white">
          <img src={bagIcon} alt="" className="size-5" />
        </span>
        <div className="min-w-[280px] flex-1">
          <p className="text-base font-semibold text-text-primary">
            {t('buildCatalog.coffeeRoastery')}
          </p>
          <p className="mt-1 text-sm font-medium leading-[1.5] text-text-tertiary">
            {t('buildCatalog.suggestionsNote')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="text-end">
            <span className="block text-[28px] font-semibold leading-[1.1] text-primary-800 tabular-nums">
              {ready.count}
            </span>
            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('buildCatalog.readyToAdd')}
            </span>
          </span>
          <button
            type="button"
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
          >
            {t('buildCatalog.seeTheList')}
          </button>
        </div>
      </section>

      {/* Panes one and two */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane
          n={1}
          title={t('buildCatalog.groups')}
          note={t('buildCatalog.groupsNote')}
          count={`${SUGGESTED.filter((entry) => picks.has(entry.id)).length} of ${SUGGESTED.length}`}
          footer={t('buildCatalog.addAGroup')}
        >
          <ul>
            {SUGGESTED.map((entry) => {
              const on = picks.has(entry.id)
              const open = entry.id === group
              const kinds = pickedKinds(entry.id)
              return (
                <li key={entry.id}>
                  <div
                    className={[
                      'flex items-center gap-3 px-4 py-3 transition-colors',
                      open
                        ? 'border-s-[3px] border-s-primary-700 bg-primary-25'
                        : 'hover:bg-primary-25',
                    ].join(' ')}
                  >
                    <TableCheckbox
                      checked={on}
                      indeterminate={!on && kinds > 0}
                      onChange={() => toggle(entry.id)}
                      ariaLabel={entry.name}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setGroup(entry.id)
                        const first = entry.kinds.find((k) => picks.has(k.id)) ?? entry.kinds[0]
                        if (first) setKind(first.id)
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-start"
                    >
                      <span
                        className={[
                          'text-sm',
                          open ? 'font-semibold text-primary-800' : 'font-medium text-text-primary',
                        ].join(' ')}
                      >
                        {entry.name}
                      </span>
                      {kinds > 0 ? (
                        <span className="text-xs font-medium text-text-quaternary">
                          {t('buildCatalog.kindsPicked', { count: kinds })}
                        </span>
                      ) : null}
                    </button>
                    {entry.kinds.length > 0 ? (
                      <img
                        src={chevronIcon}
                        alt=""
                        aria-hidden="true"
                        className="size-4 shrink-0 opacity-40 rtl:rotate-180"
                      />
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </Pane>

        <Pane
          n={2}
          title={t('buildCatalog.insideGroup', { group: activeGroup?.name ?? '' })}
          note={t('buildCatalog.insideGroupNote')}
          count={`${pickedKinds(group)} of ${activeGroup?.kinds.length ?? 0}`}
          search={{
            value: kindQuery,
            onChange: setKindQuery,
            placeholder: t('buildCatalog.searchKinds'),
          }}
          footer={t('buildCatalog.addAKind')}
        >
          {!activeGroup || activeGroup.kinds.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm font-medium text-text-quaternary">
              {t('buildCatalog.pickAGroupFirst')}
            </p>
          ) : (
            <ul>
              {activeGroup.kinds
                .filter((entry) =>
                  entry.name.toLowerCase().includes(kindQuery.trim().toLowerCase()),
                )
                .map((entry) => {
                  const on = picks.has(entry.id)
                  const open = entry.id === kind
                  const sizes = entry.sizes.filter((size) => picks.has(size.id)).length
                  return (
                    <li key={entry.id}>
                      <div
                        className={[
                          'flex items-center gap-3 px-4 py-3 transition-colors',
                          open
                            ? 'border-s-[3px] border-s-primary-700 bg-primary-25'
                            : 'hover:bg-primary-25',
                        ].join(' ')}
                      >
                        <TableCheckbox
                          checked={on}
                          indeterminate={!on && sizes > 0}
                          onChange={() => toggle(entry.id)}
                          ariaLabel={entry.name}
                        />
                        <button
                          type="button"
                          onClick={() => setKind(entry.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-start"
                        >
                          <span
                            className={[
                              'text-sm',
                              open
                                ? 'font-semibold text-primary-800'
                                : 'font-medium text-text-primary',
                            ].join(' ')}
                          >
                            {entry.name}
                          </span>
                          {sizes > 0 ? (
                            <span className="text-xs font-medium text-text-quaternary">
                              {t('buildCatalog.sizesPicked', { count: sizes })}
                            </span>
                          ) : null}
                        </button>
                        {entry.yours ? (
                          <span className="inline-flex h-[20px] shrink-0 items-center rounded-[3px] bg-surface-background px-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
                            {t('buildCatalog.yours')}
                          </span>
                        ) : null}
                        {entry.sizes.length > 0 ? (
                          <img
                            src={chevronIcon}
                            alt=""
                            aria-hidden="true"
                            className="size-4 shrink-0 opacity-40 rtl:rotate-180"
                          />
                        ) : null}
                      </div>
                    </li>
                  )
                })}
            </ul>
          )}
        </Pane>
      </div>

      {/* Pane three */}
      <Pane
        n={3}
        title={t('buildCatalog.whatYouSell', { kind: activeKind?.name ?? '' })}
        note={t('buildCatalog.whatYouSellNote')}
        count={`${pickedSizes(kind)} of ${activeKind?.sizes.length ?? 0}`}
        search={{
          value: sizeQuery,
          onChange: setSizeQuery,
          placeholder: t('buildCatalog.searchSizes'),
        }}
        footer={t('buildCatalog.addASize')}
        wide
      >
        {!activeKind || activeKind.sizes.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm font-medium text-text-quaternary">
            {t('buildCatalog.pickAKindFirst')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-surface-background text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                  <th className="h-[38px] w-[46px] px-4" />
                  <th className="h-[38px] px-3 text-start font-semibold">
                    {t('buildCatalog.col.whatYoudSell')}
                  </th>
                  <th className="h-[38px] px-3 text-end font-semibold">
                    {t('buildCatalog.col.price')}
                  </th>
                  <th className="h-[38px] px-3 text-start font-semibold">
                    {t('buildCatalog.col.soldAs')}
                  </th>
                  <th className="h-[38px] px-3 text-start font-semibold">
                    {t('buildCatalog.col.tax')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeKind.sizes
                  .filter((size) =>
                    size.name.toLowerCase().includes(sizeQuery.trim().toLowerCase()),
                  )
                  .map((size) => {
                    const on = picks.has(size.id)
                    const price = prices[size.id] ?? size.price
                    return (
                      <tr
                        key={size.id}
                        className={[
                          'border-b border-surface-background last:border-0',
                          on ? '' : 'opacity-60',
                        ].join(' ')}
                      >
                        <td className="px-4 py-3">
                          <TableCheckbox
                            checked={on}
                            onChange={() => toggle(size.id)}
                            ariaLabel={size.name}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-sm font-medium text-text-primary">{size.name}</p>
                          <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                            {size.noteKey
                              ? t(size.noteKey)
                              : size.nearbyFrom
                                ? t('buildCatalog.nearbyCharge', {
                                    from: omr(size.nearbyFrom),
                                    to: omr(size.nearbyTo ?? size.nearbyFrom),
                                  })
                                : ''}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            value={omr(price)}
                            onChange={(event) =>
                              setPrices((current) => ({
                                ...current,
                                [size.id]: Number(event.target.value.replace(/[^\d.]/g, '')) || 0,
                              }))
                            }
                            disabled={!on}
                            aria-label={t('buildCatalog.col.price')}
                            className="h-[42px] w-[120px] rounded-sm border border-border-default bg-white px-3 text-end text-sm font-semibold text-text-primary outline-none focus:border-border-brand disabled:bg-surface-background disabled:text-text-quaternary"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <span className="block w-[110px]">
                            <Select
                              compact
                              disabled={!on}
                              ariaLabel={t('buildCatalog.col.soldAs')}
                              value={size.soldAs}
                              onChange={() => undefined}
                              options={UNIT_OPTIONS}
                            />
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="block w-[90px]">
                            <Select
                              compact
                              disabled={!on}
                              ariaLabel={t('buildCatalog.col.tax')}
                              value="5"
                              onChange={() => undefined}
                              options={[
                                { value: '5', label: '5%' },
                                { value: '0', label: '0%' },
                              ]}
                            />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Pane>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {ready.count === 0
            ? t('buildCatalog.footerEmpty')
            : t('buildCatalog.footer', {
                count: ready.count,
                groups: ready.groups,
                kinds: ready.kinds,
                rate: BUSINESS_KIND.vatPercent,
              })}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to="/catalog"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('buildCatalog.cancel')}
          </Link>
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('buildCatalog.saveForLater')}
          </button>
          <button
            type="button"
            disabled={ready.count === 0}
            onClick={() => navigate('/catalog')}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {t('buildCatalog.addToCatalog', { count: ready.count })}
          </button>
        </div>
      </div>
    </CatalogShell>
  )
}

function Pane({
  n,
  title,
  note,
  count,
  search,
  footer,
  wide,
  children,
}: {
  n: number
  title: string
  note: string
  count: string
  search?: { value: string; onChange: (value: string) => void; placeholder: string }
  footer: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={['overflow-hidden rounded-md bg-surface-card', wide ? '' : ''].join(' ')}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <p className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-[4px] bg-primary-50 text-[11px] font-semibold text-primary-800">
            {n}
          </span>
          <span>
            <span className="block text-lg font-semibold leading-[1.2] text-text-primary">
              {title}
            </span>
            <span className="mt-0.5 block text-xs font-medium text-text-quaternary">{note}</span>
          </span>
        </p>
        <span className="shrink-0 text-xs font-medium text-text-quaternary">{count}</span>
      </div>

      {search ? (
        <div className="px-5 pb-4">
          <label className="flex h-[42px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3">
            <img src={searchIcon} alt="" className="size-4 opacity-60" />
            <input
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
        </div>
      ) : null}

      <div className="border-t border-surface-background">{children}</div>

      <button
        type="button"
        className="flex w-full items-center gap-2 border-t border-surface-background px-4 py-3 text-start text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
      >
        <img src={plusIcon} alt="" className="size-4" />
        {footer}
      </button>
    </section>
  )
}
