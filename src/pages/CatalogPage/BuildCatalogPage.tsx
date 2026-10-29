import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useReferenceData } from '../../lib/reference/referenceData'
import { CatalogShell } from './CatalogShell'
import { OptionPicker, Select, TableCheckbox } from '../../components/ui'
import { selectAllOnFocus, unitOptions } from '../../components/invoice'
import { DESIGN_REFERENCE, omanTaxCategories } from '../../lib/invoiceDraft'
import { defaultPicks, readyToAdd, type SuggestedGroup } from '../../lib/catalogBuild'
import { suggestedFrom } from '../../lib/catalogTemplates'
import { ApiError } from '../../api'
import {
  catalogTemplatePath,
  readCatalogTemplate,
  type CatalogTemplateDto,
} from '../../api/catalog/templates'
import { useApiRead } from '../../hooks/useApiRead'
import { findSubBusinessType, localName, useSignupBusinessTypes } from '../../lib/businessTypes'
import searchIcon from '../../assets/invoices/search.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import bagIcon from '../../assets/catalog/kind-bag.svg'
import plusIcon from '../../assets/catalog/plus-muted.svg'
import tickWhiteIcon from '../../assets/catalog/check-white.svg'
import { useCanManageProducts } from './ItemFormPage'

/** The choice that starts a catalogue with no template. */
const OWN = 'own'
/** The choice that starts from the company's own template. */
const TEMPLATE = 'template'

/** First-strong isolate: an English name inside an Arabic sentence keeps its own order. */
const isolate = (text: string) => `\u2068${text}\u2069`

/** A price as the catalogue keeps it: three decimals, or empty while there is none. */
const threeDecimals = (raw: string) => {
  const value = Number(raw.replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? value.toFixed(3) : ''
}

/**
 * Catalog › Build your catalog (Figma 135:43755).
 *
 * Three panes that narrow left to right — group, kind, then the exact things that carry a price.
 * The counter is the number of leaves ticked, so it can never promise to create a branch.
 *
 * The suggestions are the system template for a sub-business type (owner, 21 Oct 2026; the
 * Figma frame's coffee roastery was a sample). Every suggested item is editable here: price
 * (three decimals, none until typed), unit and VAT category; the rest is edited on the item
 * once added. "Start my own catalogue" uses no template. Adding still calls no API (P.5).
 */
export function BuildCatalogPage() {
  const { t, i18n } = useTranslation()
  const reference = useReferenceData()
  const navigate = useNavigate()
  const canManageProducts = useCanManageProducts() === true

  // The published template of the company's own sub business type (chosen at sign-up, changed in
  // Settings › Company). A 404 means it has none, or the company has not chosen a type.
  const { read: templateRead, retry: retryTemplate } = useApiRead<CatalogTemplateDto>(
    catalogTemplatePath(),
    () => readCatalogTemplate(),
  )
  const template = templateRead.status === 'ready' ? templateRead.data : null
  const noTemplate =
    templateRead.status === 'failed' &&
    templateRead.error instanceof ApiError &&
    templateRead.error.status === 404
  const templateFailed = templateRead.status === 'failed' && !noTemplate
  // The sub type's name, from the server's lists; a type not open for sign-up is not listed there.
  const businessTypes = useSignupBusinessTypes().read
  const ownSubType = template
    ? findSubBusinessType(
        businessTypes.status === 'ready' ? businessTypes.data : undefined,
        template.subBusinessTypeCode,
      )
    : undefined

  const [choice, setChoice] = useState(TEMPLATE)
  const subType = template && choice === TEMPLATE ? TEMPLATE : OWN
  const [suggested, setSuggested] = useState<SuggestedGroup[]>([])
  const [picks, setPicks] = useState<Set<string>>(new Set())
  const [group, setGroup] = useState('')
  const [kind, setKind] = useState('')
  const [kindQuery, setKindQuery] = useState('')
  const [sizeQuery, setSizeQuery] = useState('')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [units, setUnits] = useState<Record<string, string>>({})
  const [taxes, setTaxes] = useState<Record<string, string>>({})

  // A new template replaces everything picked and typed for the old one.
  useEffect(() => {
    const next =
      subType === TEMPLATE && template ? suggestedFrom(template.groups, i18n.language) : []
    setSuggested(next)
    setPicks(defaultPicks(next))
    setGroup(next[0]?.id ?? '')
    setKind(next[0]?.kinds[0]?.id ?? '')
    setPrices({})
    setUnits({})
    setTaxes({})
  }, [subType, template, i18n.language])

  const categories = omanTaxCategories(
    reference?.taxCategories?.length ? reference.taxCategories : DESIGN_REFERENCE.taxCategories,
  )
  const taxOptions = categories.map((row) => ({
    value: row.code,
    label: t(`createInvoice.taxCategories.${row.code}`, { defaultValue: row.code }),
    // Words, not the category letter: 5%, or what the 0% is (zero-rated, exempt, out of scope).
    shortLabel:
      row.en16931Category === 'S'
        ? `${Number(row.rate)}%`
        : t(`buildCatalog.taxShort.${row.en16931Category}`),
  }))
  const templateLabel = ownSubType
    ? localName(ownSubType, i18n.language)
    : t('buildCatalog.yourTemplate')
  const subTypeOptions = [
    ...(template ? [{ value: TEMPLATE, label: templateLabel }] : []),
    { value: OWN, label: t('buildCatalog.ownCatalogue') },
  ]
  const subTypeLabel =
    templateRead.status === 'loading'
      ? t('buildCatalog.loadingTemplate')
      : (subTypeOptions.find((option) => option.value === subType)?.label ?? '')
  const bannerNote =
    subType === TEMPLATE
      ? 'buildCatalog.suggestionsNote'
      : noTemplate
        ? 'buildCatalog.noTemplateNote'
        : templateFailed
          ? 'buildCatalog.templateFailedNote'
          : 'buildCatalog.ownCatalogueNote'

  const toggle = (id: string) =>
    setPicks((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const activeGroup = suggested.find((entry) => entry.id === group)
  const activeKind = activeGroup?.kinds.find((entry) => entry.id === kind)

  const ready = useMemo(() => readyToAdd(suggested, picks), [suggested, picks])
  // Ticked things still without a price: they are added, and priced on the item later.
  const unpriced = suggested
    .flatMap((entry) => entry.kinds.filter((k) => picks.has(entry.id) && picks.has(k.id)))
    .flatMap((entry) => entry.sizes)
    .filter((size) => picks.has(size.id) && !(Number(prices[size.id]) > 0)).length

  const pickedKinds = (groupId: string) =>
    suggested.find((entry) => entry.id === groupId)?.kinds.filter((k) => picks.has(k.id)).length ??
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
        <>
          {/* Which template: a header choice beside the other way in, so the banner keeps the
              frame's one line (owner's Figma review, 21 Oct 2026). */}
          <OptionPicker
            tall
            ariaLabel={t('buildCatalog.businessType')}
            value={subType}
            onChange={setChoice}
            options={subTypeOptions}
          />
          {/* Reading a menu needs product.manage (/v1/catalog/menu-scans). */}
          {canManageProducts ? (
            <Link
              to="/catalog/upload"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('buildCatalog.uploadInstead')}
            </Link>
          ) : null}
        </>
      }
    >
      {/* What Fawtir is going on */}
      <section className="flex flex-wrap items-center gap-4 rounded-md border border-primary-100 bg-primary-25 p-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-white">
          <img src={bagIcon} alt="" className="size-5" />
        </span>
        <div className="min-w-[280px] flex-1">
          <p className="text-base font-semibold text-text-primary">{subTypeLabel}</p>
          <p className="mt-1 text-sm font-medium leading-[1.5] text-text-tertiary">
            {templateRead.status === 'loading' ? null : t(bannerNote)}
          </p>
          {noTemplate ? (
            <Link
              to="/settings/company"
              className="mt-1 inline-block text-sm font-semibold text-primary-700 hover:text-primary-800"
            >
              {t('buildCatalog.chooseBusinessType')}
            </Link>
          ) : null}
          {templateFailed ? (
            <button
              type="button"
              onClick={retryTemplate}
              className="mt-1 text-sm font-semibold text-primary-700 hover:text-primary-800"
            >
              {t('buildCatalog.tryAgain')}
            </button>
          ) : null}
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
          count={t('buildCatalog.ofTotal', {
            picked: suggested.filter((entry) => picks.has(entry.id)).length,
            total: suggested.length,
          })}
          footer={t('buildCatalog.addAGroup')}
        >
          {suggested.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-text-quaternary">
                {t('buildCatalog.ownEmpty')}
              </p>
              <Link
                to="/catalog/new"
                className="mt-3 inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('buildCatalog.addFirstItem')}
              </Link>
            </div>
          ) : (
            <ul>
              {suggested.map((entry) => {
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
                            open
                              ? 'font-semibold text-primary-800'
                              : 'font-medium text-text-primary',
                          ].join(' ')}
                        >
                          <bdi>{entry.name}</bdi>
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
          )}
        </Pane>

        <Pane
          n={2}
          title={t('buildCatalog.insideGroup', { group: isolate(activeGroup?.name ?? '') })}
          note={t('buildCatalog.insideGroupNote')}
          count={t('buildCatalog.ofTotal', {
            picked: pickedKinds(group),
            total: activeGroup?.kinds.length ?? 0,
          })}
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
                            <bdi>{entry.name}</bdi>
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
        title={t('buildCatalog.whatYouSell', { kind: isolate(activeKind?.name ?? '') })}
        note={t('buildCatalog.whatYouSellNote')}
        count={t('buildCatalog.ofTotal', {
          picked: pickedSizes(kind),
          total: activeKind?.sizes.length ?? 0,
        })}
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
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-surface-background text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                  <th className="h-[38px] w-[46px] px-4" />
                  <th className="h-[38px] w-full px-3 text-start font-semibold">
                    {t('buildCatalog.col.whatYoudSell')}
                  </th>
                  {/* Price, sold as and tax hug the right edge, each heading over its field. */}
                  <th className="h-[38px] whitespace-nowrap px-1.5 text-end font-semibold">
                    {t('buildCatalog.col.price')}
                  </th>
                  <th className="h-[38px] whitespace-nowrap px-1.5 text-start font-semibold">
                    {t('buildCatalog.col.soldAs')}
                  </th>
                  <th className="h-[38px] whitespace-nowrap pe-4 ps-1.5 text-start font-semibold">
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
                    const price = prices[size.id] ?? ''
                    const unit = units[size.id] ?? size.soldAs
                    const tax = taxes[size.id] ?? size.taxCode ?? 'S5'
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
                          <p className="text-sm font-medium text-text-primary">
                            <bdi>{size.name}</bdi>
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                            {size.brand ? <bdi>{size.brand}</bdi> : null}
                            {size.brand && size.barcode ? ' · ' : ''}
                            {size.barcode ? <span dir="ltr">{size.barcode}</span> : null}
                          </p>
                          {tax === size.taxCode && size.reasonCode ? (
                            <p className="mt-0.5 text-xs font-medium text-text-tertiary">
                              {t(
                                size.taxCode === 'E0'
                                  ? 'buildCatalog.startsExempt'
                                  : 'buildCatalog.startsZeroRated',
                              )}{' '}
                              <span dir="ltr">{size.reasonCode}</span>
                            </p>
                          ) : null}
                        </td>
                        <td className="px-1.5 py-3">
                          <input
                            value={price}
                            placeholder={t('buildCatalog.setPrice')}
                            inputMode="decimal"
                            onFocus={selectAllOnFocus}
                            onChange={(event) =>
                              setPrices((current) => ({
                                ...current,
                                [size.id]: event.target.value.replace(/[^\d.]/g, ''),
                              }))
                            }
                            onBlur={() =>
                              setPrices((current) => ({
                                ...current,
                                [size.id]: threeDecimals(current[size.id] ?? ''),
                              }))
                            }
                            disabled={!on}
                            aria-label={t('buildCatalog.col.price')}
                            dir="ltr"
                            className="h-[42px] w-[120px] rounded-sm border border-transparent bg-surface-background px-3 text-end text-sm font-normal text-text-primary tabular-nums outline-none placeholder:text-text-placeholder focus:border-border-brand focus:bg-white disabled:bg-[#ececec] disabled:text-text-quaternary"
                          />
                        </td>
                        <td className="px-1.5 py-3">
                          <span className="block w-[132px]">
                            <Select
                              compact
                              quiet
                              tight
                              disabled={!on}
                              ariaLabel={t('buildCatalog.col.soldAs')}
                              value={unit}
                              onChange={(next) =>
                                setUnits((current) => ({ ...current, [size.id]: next }))
                              }
                              options={unitOptions('goods', t, unit, reference)}
                            />
                          </span>
                        </td>
                        <td className="py-3 pe-4 ps-1.5">
                          <span className="block w-[112px]">
                            <Select
                              compact
                              quiet
                              tight
                              disabled={!on}
                              ariaLabel={t('buildCatalog.col.tax')}
                              value={tax}
                              onChange={(next) =>
                                setTaxes((current) => ({ ...current, [size.id]: next }))
                              }
                              options={taxOptions}
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
                groups: t('buildCatalog.groupCount', { count: ready.groups }),
                kinds: t('buildCatalog.kindCount', { count: ready.kinds }),
              })}
          {ready.count > 0 && unpriced > 0
            ? ` · ${t('buildCatalog.stillNeedPrice', { count: unpriced })}`
            : ''}
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
        <p className="flex min-w-0 items-start gap-2.5">
          {/* The badge is the title's line height, so the number sits on the heading line. */}
          <span className="flex size-6 shrink-0 items-center justify-center rounded-[4px] bg-primary-50 text-[11px] font-semibold text-primary-800">
            {n}
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold leading-6 text-text-primary">{title}</span>
            <span className="mt-0.5 block text-xs font-medium text-text-quaternary">{note}</span>
          </span>
        </p>
        <span className="shrink-0 text-xs font-medium leading-6 text-text-quaternary">{count}</span>
      </div>

      {search ? (
        <div className="px-5 pb-4">
          <label className="flex h-[42px] items-center gap-2 rounded-sm bg-surface-background px-3 focus-within:ring-1 focus-within:ring-border-brand">
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
