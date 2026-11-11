import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useReferenceData } from '../../lib/reference/referenceData'
import { CatalogShell } from './CatalogShell'
import { Modal, OmAmount, OptionPicker, Select, TableCheckbox } from '../../components/ui'
import { selectAllOnFocus, unitOptions } from '../../components/invoice'
import { DESIGN_REFERENCE, omanTaxCategories } from '../../lib/invoiceDraft'
import { defaultPicks, readyToAdd, type SuggestedGroup } from '../../lib/catalogBuild'
import { suggestedFrom, templateName } from '../../lib/catalogTemplates'
import {
  addedWithoutPrice,
  buildSummary,
  planBuild,
  runBuild,
  type BuildApi,
  type BuildOutcome,
} from '../../lib/catalogTemplates/build'
import {
  buildSelectionKey,
  forgetBuildSelection,
  readBuildSelection,
  saveBuildSelection,
} from '../../lib/catalogTemplates/selection'
import { ApiError } from '../../api'
import { createCatalogGroup, createCatalogKind, getCatalogGroups } from '../../api/catalog/groups'
import {
  createProduct,
  productListPath,
  searchProducts,
  type ProductDto,
} from '../../api/catalog/products'
import { describeApiFailure } from '../../lib/apiFailure'
import { productRefusal } from '../../lib/productForm'
import { useSession } from '../../lib/session/session'
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
 * once added. "Start my own catalogue" uses no template.
 *
 * "Add N to the catalog" copies what is ticked through the group, kind and product APIs, in that
 * order (`lib/catalogTemplates/build.ts`), reusing what is already in the catalogue and skipping
 * items already there, then says what was added, skipped and failed; the failed ones can be tried
 * again on their own. "Save and finish later" keeps the ticks and prices in this browser, per
 * company, and puts them back when the screen opens on the same template.
 */

/** Every active product filed under a kind, a page of 200 at a time. */
async function kindProducts(kindId: string): Promise<ProductDto[]> {
  const rows: ProductDto[] = []
  for (let page = 0; page < 50; page += 1) {
    const found = await searchProducts(
      productListPath({ kindId, status: 'ACTIVE', size: 200, page }),
    )
    rows.push(...found.items)
    if (!found.hasMore) break
  }
  return rows
}

const BUILD_API: BuildApi = {
  getGroups: getCatalogGroups,
  createGroup: createCatalogGroup,
  createKind: createCatalogKind,
  kindProducts,
  createProduct,
}

type BuildRun = { running: boolean; total: number; outcomes: BuildOutcome[] }
export function BuildCatalogPage() {
  const { t, i18n } = useTranslation()
  const reference = useReferenceData()
  const navigate = useNavigate()
  const canManageProducts = useCanManageProducts() === true
  const session = useSession()
  const storageKey = buildSelectionKey(session?.tenantId)

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
  // Names follow the language; ids are places in the template, so a switch keeps every tick,
  // price, unit and tax (W-4).
  const suggested = useMemo<SuggestedGroup[]>(
    () => (subType === TEMPLATE && template ? suggestedFrom(template.groups, i18n.language) : []),
    [subType, template, i18n.language],
  )
  const [picks, setPicks] = useState<Set<string>>(new Set())
  const [group, setGroup] = useState('')
  const [kind, setKind] = useState('')
  const [kindQuery, setKindQuery] = useState('')
  const [sizeQuery, setSizeQuery] = useState('')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [units, setUnits] = useState<Record<string, string>>({})
  const [taxes, setTaxes] = useState<Record<string, string>>({})

  const [run, setRun] = useState<BuildRun | null>(null)
  const [restored, setRestored] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const running = useRef(false)

  // A new template replaces everything picked and typed for the old one, unless this company saved
  // its work on this very template to finish later.
  useEffect(() => {
    const next = subType === TEMPLATE && template ? suggestedFrom(template.groups) : []
    const saved = subType === TEMPLATE && template ? readBuildSelection(storageKey, template) : null
    setPicks(saved ? new Set(saved.picks) : defaultPicks(next))
    setGroup(next[0]?.id ?? '')
    setKind(next[0]?.kinds[0]?.id ?? '')
    setPrices(saved?.prices ?? {})
    setUnits(saved?.units ?? {})
    setTaxes(saved?.taxes ?? {})
    setRestored(Boolean(saved))
    setRun(null)
  }, [subType, template, storageKey])

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

  /** Keeps the ticks and prices in this browser, for this company and this template. */
  const saveForLater = () => {
    if (template && subType === TEMPLATE) {
      saveBuildSelection(storageKey, template, { picks: [...picks], prices, units, taxes })
    }
  }

  const build = async (only?: Set<string>) => {
    if (!template || running.current) return
    const entries = planBuild(template, picks, { prices, units, taxes }, categories, only)
    if (entries.length === 0) return
    running.current = true
    const kept = only && run ? run.outcomes.filter((outcome) => !only.has(outcome.id)) : []
    setRun({ running: true, total: entries.length + kept.length, outcomes: kept })
    try {
      const outcomes = await runBuild(entries, BUILD_API, (sofar) =>
        setRun((current) => current && { ...current, outcomes: [...kept, ...sofar] }),
      )
      const all = [...kept, ...outcomes]
      setRun({ running: false, total: all.length, outcomes: all })
      // Finished with nothing left to retry: the saved work is done with.
      if (all.every((outcome) => outcome.state !== 'failed')) forgetBuildSelection(storageKey)
    } finally {
      running.current = false
    }
  }

  const failed = run?.outcomes.filter((outcome) => outcome.state === 'failed') ?? []
  const summary = run ? buildSummary(run.outcomes) : null
  const stillUnpriced = run ? addedWithoutPrice(run.outcomes) : 0

  /** Leaves for a page where something of one's own is added, keeping the work to come back to. */
  const leaveFor = (to: string) => {
    saveForLater()
    navigate(to)
  }

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
            {restored && subType === TEMPLATE ? ` ${t('buildCatalog.restored')}` : null}
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
            onClick={() => setListOpen(true)}
            disabled={ready.count === 0}
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70 disabled:opacity-40"
          >
            {t('buildCatalog.seeTheList')}
          </button>
        </div>
      </section>

      {run ? (
        <section
          aria-live="polite"
          className="rounded-md border border-border-subtle bg-surface-card p-5"
        >
          {run.running ? (
            <>
              <p className="text-sm font-semibold text-text-primary">
                {t('buildCatalog.progress', { done: run.outcomes.length, total: run.total })}
              </p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={run.total}
                aria-valuenow={run.outcomes.length}
                className="mt-3 h-2 overflow-hidden rounded-full bg-surface-background"
              >
                <div
                  className="h-full rounded-full bg-primary-700 transition-[width]"
                  style={{ width: `${run.total ? (run.outcomes.length / run.total) * 100 : 0}%` }}
                />
              </div>
            </>
          ) : summary ? (
            <>
              <p className="text-sm font-semibold text-text-primary">
                {t('buildCatalog.summary', {
                  added: t('buildCatalog.summaryAdded', { count: summary.added }),
                  skipped: t('buildCatalog.summarySkipped', { count: summary.skipped }),
                  failed: t('buildCatalog.summaryFailed', { count: summary.failed }),
                })}
              </p>
              {stillUnpriced > 0 ? (
                <p className="mt-2 text-sm font-medium text-text-secondary">
                  {t('buildCatalog.noPriceLeft', { count: stillUnpriced })}{' '}
                  {/* The tab filters on the client, a page at a time, so lowest price first brings
                      the unpriced to the first page however big the catalogue is. */}
                  <Link
                    to="/catalog?tab=attention&sort=priceLow"
                    className="font-semibold text-primary-700 hover:text-primary-800"
                  >
                    {t('buildCatalog.noPriceLink')}
                  </Link>
                </p>
              ) : null}
              {failed.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                    {t('buildCatalog.failedTitle')}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {failed.map((outcome) => {
                      // The item form's own sentence for a refused product, else the general one.
                      const known = productRefusal(outcome.error)
                      const message = known ? { key: known.key } : describeApiFailure(outcome.error)
                      return (
                        <li key={outcome.id} className="text-sm font-medium text-text-secondary">
                          <bdi className="font-semibold text-text-primary">
                            {templateName(outcome.entry.item, i18n.language)}
                          </bdi>
                          {': '}
                          {t(message.key, 'values' in message ? message.values : undefined)}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2.5">
                {failed.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void build(new Set(failed.map((outcome) => outcome.id)))}
                    className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    {t('buildCatalog.retryFailed')}
                  </button>
                ) : null}
                <Link
                  to="/catalog"
                  className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('buildCatalog.openCatalog')}
                </Link>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

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
          onFooter={() => leaveFor('/catalog/groups')}
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
                        {/* Unticked, nothing of it is added: its remembered ticks are not "picked". */}
                        {on && kinds > 0 ? (
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
          title={
            activeGroup
              ? t('buildCatalog.insideGroup', { group: isolate(activeGroup.name) })
              : t('buildCatalog.insideGroupEmpty')
          }
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
          onFooter={() => leaveFor('/catalog/groups')}
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
                          {on && sizes > 0 ? (
                            <span className="text-xs font-medium text-text-quaternary">
                              {/* What is ticked here are the things sold, sized or not. */}
                              {t('buildCatalog.itemsPicked', { count: sizes })}
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
        title={
          activeKind
            ? t('buildCatalog.whatYouSell', { kind: isolate(activeKind.name) })
            : t('buildCatalog.whatYouSellEmpty')
        }
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
        onFooter={() => leaveFor('/catalog/new')}
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
                          {size.choices?.length ? (
                            <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                              {t('buildCatalog.choicesLine', { list: size.choices.join(', ') })}
                            </p>
                          ) : null}
                          {size.addOns?.length ? (
                            <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                              {t('buildCatalog.addOnsLine', { list: size.addOns.join(', ') })}
                            </p>
                          ) : null}
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
                              options={unitOptions(
                                size.service ? 'service' : 'goods',
                                t,
                                unit,
                                reference,
                              )}
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
          {subType === TEMPLATE ? (
            <button
              type="button"
              disabled={run?.running}
              onClick={() => leaveFor('/catalog')}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-40"
            >
              {t('buildCatalog.saveForLater')}
            </button>
          ) : null}
          <button
            type="button"
            disabled={ready.count === 0 || run?.running}
            onClick={() => void build()}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {t('buildCatalog.addToCatalog', { count: ready.count })}
          </button>
        </div>
      </div>

      <Modal
        open={listOpen}
        onClose={() => setListOpen(false)}
        title={t('buildCatalog.listTitle')}
        subtitle={t('buildCatalog.listSubtitle')}
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setListOpen(false)}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('buildCatalog.listClose')}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {suggested
            .filter((entry) => picks.has(entry.id))
            .flatMap((entry) =>
              entry.kinds
                .filter((k) => picks.has(k.id) && k.sizes.some((size) => picks.has(size.id)))
                .map((k) => (
                  <div key={k.id}>
                    <p className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                      <bdi>{entry.name}</bdi> › <bdi>{k.name}</bdi>
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {k.sizes
                        .filter((size) => picks.has(size.id))
                        .map((size) => (
                          <li
                            key={size.id}
                            className="flex items-baseline justify-between gap-3 text-sm font-medium text-text-primary"
                          >
                            <bdi className="min-w-0">{size.name}</bdi>
                            <span className="shrink-0 text-text-tertiary">
                              {Number(prices[size.id]) > 0 ? (
                                <OmAmount size="sm" amount={Number(prices[size.id]).toFixed(3)} />
                              ) : (
                                t('buildCatalog.noPriceYet')
                              )}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )),
            )}
        </div>
      </Modal>
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
  onFooter,
  wide,
  children,
}: {
  n: number
  title: string
  note: string
  count: string
  search?: { value: string; onChange: (value: string) => void; placeholder: string }
  footer: string
  /** "Add ... of your own": leaves for the page where it is added, keeping the work. */
  onFooter: () => void
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
        onClick={onFooter}
        className="flex w-full items-center gap-2 border-t border-surface-background px-4 py-3 text-start text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
      >
        <img src={plusIcon} alt="" className="size-4" />
        {footer}
      </button>
    </section>
  )
}
