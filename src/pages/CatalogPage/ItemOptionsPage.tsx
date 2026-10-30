import { useMemo, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { CatalogShell } from './CatalogShell'
import { Rial, TableCheckbox, withRial } from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice'
import { omr } from '../../lib/catalogItem'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  canSetVariantArabicNames,
  getProduct,
  productPath,
  saveProductVariants,
  type ProductDto,
} from '../../api/catalog/products'
import {
  NONE,
  addValue,
  cellKey,
  combinations,
  generateCodes,
  productVariantsState,
  rebuildFromBase,
  removeValue,
  roundAll,
  setDelta,
  setPrice,
  setVariantNameAr,
  summarise,
  tickEverything,
  toggleCell,
  valuesOf,
  variantsRequest,
  type ChoiceWords,
  type OptionSet,
  type OptionsState,
} from '../../lib/catalogOptions'
import { PRODUCT_VERSION_CONFLICT, productRefusal } from '../../lib/productForm'
import { describeApiFailure } from '../../lib/apiFailure'
import { useCanManageProducts } from './ItemFormPage'
import infoIcon from '../../assets/catalog/info.svg'
import tickWhiteIcon from '../../assets/catalog/check-white.svg'

type Side = 'side' | 'top'

const signed = (delta: number) => `${delta < 0 ? '-' : '+'}${omr(Math.abs(delta))}`

/**
 * Sizes and options for one item (Figma "Catalog -> Detail Edit Variants", 154:125539).
 *
 * The customer's two choices make a grid; every ticked cell is a separate thing the till sells,
 * with its own price and code. The item is read with `GET /v1/products/{id}` (INCOME.md P.13):
 * its sizes down the side, its options across the top, and each combination's code, on/off and
 * the price the server works out. Saved with `PUT /v1/products/{id}/variants` and the version
 * that was read (P.5); the item's add-ons are sent back unchanged.
 */
export function ItemOptionsPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const read = useApiRead<ProductDto>(productPath(id), () => getProduct(id))
  if (read.read.status === 'ready') {
    return (
      <ItemOptions
        key={`${read.read.data.id}@${read.read.data.version}`}
        product={read.read.data}
        reload={read.retry}
      />
    )
  }
  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { labelKey: 'itemOptions.crumb' }]}
      title={t('itemOptions.crumb')}
    >
      {read.read.status === 'loading' ? (
        <LoadingNotice />
      ) : (
        <ApiReadFailure error={read.read.error} retry={read.retry} />
      )}
    </CatalogShell>
  )
}

/** What the two choices are called, in both languages (the Arabic shows when the screen is). */
function useChoiceWords(): ChoiceWords {
  const { t } = useTranslation()
  const both = (key: string) => ({
    en: t(key, { lng: 'en' }),
    ar: t(key, { lng: 'ar' }),
  })
  const words = (which: 'size' | 'option') => {
    const name = both(`itemOptions.choice.${which}`)
    const noun = both(`itemOptions.choice.${which}Noun`)
    return { name: name.en, nameAr: name.ar, noun: noun.en, nounAr: noun.ar }
  }
  return { sizes: words('size'), options: words('option') }
}

function ItemOptions({ product: loaded, reload }: { product: ProductDto; reload: () => void }) {
  const { t, i18n } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  const words = useChoiceWords()
  // Saving needs product.manage; an archived item cannot be changed (PRODUCT_ARCHIVED).
  const canManage = useCanManageProducts() === true
  const [product, setProduct] = useState(loaded)
  const readOnly = !canManage || !product.active

  const item = { id: encodeURIComponent(product.id), name: product.name, code: product.code }
  // The item's own sizes and options, at the prices the server worked out.
  const [state, setState] = useState<OptionsState>(() => productVariantsState(loaded, words))
  const [thirdAsked, setThirdAsked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<{ line: string; reload: boolean } | null>(null)

  /** `PUT .../variants` with the version read; the answer is the item as now stored. */
  const save = async () => {
    if (readOnly || saving) return
    setProblem(null)
    setSaving(true)
    try {
      const result = await saveProductVariants(
        product.id,
        product.version,
        variantsRequest(state, product.addOns),
      )
      setProduct(result)
      setState(productVariantsState(result, words))
      setSaved(true)
    } catch (error) {
      const refusal = productRefusal(error)
      if (refusal) {
        setProblem({ line: t(refusal.key), reload: refusal.code === PRODUCT_VERSION_CONFLICT })
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setProblem({
          line: message.reference
            ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
            : body,
          reload: false,
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const update = (fn: (current: OptionsState) => OptionsState) => {
    setSaved(false)
    setState(fn)
  }

  const figures = useMemo(() => summarise(state), [state])
  const nameOf = (entry: { name: string; nameAr: string }) => (arabic ? entry.nameAr : entry.name)
  /** A value's name; the stand-in for an empty choice reads "No size" or "No option". */
  const valueName = (value: { name: string; nameAr: string }, which: Side) =>
    value === NONE
      ? t(which === 'side' ? 'itemOptions.grid.noSize' : 'itemOptions.grid.noOption')
      : nameOf(value)
  const sides = valuesOf(state.side)
  const tops = valuesOf(state.top)
  const nothing = combinations(state).length === 0
  const arabicNames = canSetVariantArabicNames(product)

  const deltaLabel = (delta: number, which: Side) =>
    delta === 0
      ? which === 'side'
        ? t('itemOptions.grid.base', { amount: omr(state.base) })
        : t('itemOptions.grid.noChange')
      : signed(delta)

  const toolbar: { key: string; run: () => void }[] = [
    { key: 'tickEverything', run: () => update(tickEverything) },
    { key: 'rebuild', run: () => update(rebuildFromBase) },
    { key: 'round', run: () => update(roundAll) },
    { key: 'codes', run: () => update((current) => generateCodes(current, item.code)) },
  ]

  const rangeNote =
    figures.lowest && figures.highest
      ? t('itemOptions.figures.rangeNote', {
          from: [nameOf(figures.lowest.side), nameOf(figures.lowest.top).toLocaleLowerCase()]
            .filter(Boolean)
            .join(' '),
          to: [nameOf(figures.highest.side), nameOf(figures.highest.top).toLocaleLowerCase()]
            .filter(Boolean)
            .join(' '),
        })
      : t('itemOptions.figures.nothingSold')

  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { label: item.name, to: `/catalog/${item.id}` },
        { labelKey: 'itemOptions.crumb' },
      ]}
      title={t('itemOptions.title', { name: item.name })}
      wideHeading
      actions={
        <Link
          to={`/catalog/${item.id}`}
          className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('itemOptions.backToItem')}
        </Link>
      }
    >
      <p className="-mt-3 text-sm font-medium leading-[1.5] text-[#8f8f8f]">
        <Trans
          i18nKey="itemOptions.subtitle"
          components={{ b: <b className="font-semibold text-text-primary" /> }}
        />
      </p>

      {problem ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-danger-100 px-5 py-3 text-sm font-medium text-danger-700"
        >
          <span>{problem.line}</span>
          {problem.reload ? (
            <button
              type="button"
              onClick={reload}
              className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary"
            >
              {t('itemForm.reload')}
            </button>
          ) : null}
        </div>
      ) : null}
      {product.active ? null : (
        <p className="rounded-md bg-surface-card px-5 py-3 text-sm font-medium text-text-tertiary">
          {t('itemForm.archivedNote')}
        </p>
      )}

      {/* Read-only for an archived item and for a reader without product.manage. */}
      <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        {/* What the customer chooses */}
        <Card title={t('itemOptions.chooses.title')}>
          <div className="grid gap-4 lg:grid-cols-2">
            <OptionPanel
              set={state.side}
              which="side"
              nameOf={nameOf}
              arabic={arabic}
              note={t('itemOptions.chooses.orderNote')}
              onAdd={(name) => update((current) => addValue(current, 'side', name))}
              onRemove={(valueId) => update((current) => removeValue(current, 'side', valueId))}
            />
            <OptionPanel
              set={state.top}
              which="top"
              nameOf={nameOf}
              arabic={arabic}
              note={topNote(state.top, nameOf, t)}
              onAdd={(name) => update((current) => addValue(current, 'top', name))}
              onRemove={(valueId) => update((current) => removeValue(current, 'top', valueId))}
            />
          </div>
          <button
            type="button"
            onClick={() => setThirdAsked((asked) => !asked)}
            aria-expanded={thirdAsked}
            className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-sm border border-dashed border-border-default bg-white px-4 py-2 text-start text-sm font-medium text-text-tertiary transition-colors hover:bg-primary-25"
          >
            <PlusIcon />
            {t('itemOptions.chooses.addThird')}
          </button>
          {thirdAsked ? (
            <p className="mt-3 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.5] text-text-tertiary">
              <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
              {t('itemOptions.chooses.thirdNote')}
            </p>
          ) : null}
        </Card>

        {/* Price for each combination */}
        <Card title={t('itemOptions.prices.title')}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {toolbar.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  onClick={tool.run}
                  className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-[13px] font-medium text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t(`itemOptions.prices.${tool.key}`)}
                </button>
              ))}
            </div>
            <p className="text-[13px] font-medium text-text-secondary">
              {t('itemOptions.prices.count', { sold: figures.onSale, total: figures.total })}
              {' · '}
              {t('itemOptions.prices.byHand', { count: figures.byHand })}
            </p>
          </div>
          {arabicNames && !nothing ? (
            <p className="mb-4 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.5] text-text-tertiary">
              <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
              {t('itemOptions.prices.arabicNameHint')}
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-md border border-border-subtle">
            {nothing ? (
              <p className="px-4 py-6 text-center text-sm font-medium text-text-quaternary">
                {t('itemOptions.prices.none')}
              </p>
            ) : (
              <table
                className="w-full table-fixed border-collapse"
                style={{ minWidth: 150 + tops.length * 200 }}
              >
                <colgroup>
                  <col className="w-[150px]" />
                  {tops.map((top) => (
                    <col key={top.id} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th
                      scope="col"
                      className="bg-surface-background px-4 py-4 text-start text-[10px] font-semibold uppercase tracking-[0.5px] text-text-tertiary"
                    >
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {nameOf(state.side)} <ArrowIcon dir="down" />
                        <span className="px-1 text-text-quaternary">/</span>
                        {nameOf(state.top)} <ArrowIcon dir="across" />
                      </span>
                    </th>
                    {tops.map((top) => (
                      <th
                        key={top.id}
                        scope="col"
                        className="border-s border-border-subtle px-4 py-4 text-start align-top"
                      >
                        <span className="block text-[13px] font-semibold uppercase tracking-[0.5px] text-text-primary">
                          {valueName(top, 'top')}
                        </span>
                        {top === NONE ? null : (
                          <DeltaEdit
                            value={top.delta}
                            label={deltaLabel(top.delta, 'top')}
                            ariaLabel={t('itemOptions.grid.priceChangeFor', { name: nameOf(top) })}
                            className="mt-1 text-[11px] uppercase tracking-[0.5px] text-text-quaternary"
                            onCommit={(delta) =>
                              update((current) => setDelta(current, 'top', top.id, delta))
                            }
                          />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sides.map((side) => (
                    <tr key={side.id} className="border-b border-border-subtle last:border-b-0">
                      <th
                        scope="row"
                        className="bg-surface-background px-4 py-5 text-start align-middle font-normal"
                      >
                        <span className="block text-sm font-medium text-text-primary">
                          {valueName(side, 'side')}
                        </span>
                        {side === NONE ? null : (
                          <DeltaEdit
                            value={side.delta}
                            label={deltaLabel(side.delta, 'side')}
                            ariaLabel={t('itemOptions.grid.priceChangeFor', { name: nameOf(side) })}
                            className="mt-1 text-[11px] text-primary-700"
                            onCommit={(delta) =>
                              update((current) => setDelta(current, 'side', side.id, delta))
                            }
                          />
                        )}
                      </th>
                      {tops.map((top) => {
                        const key = cellKey(side.id, top.id)
                        const cell = state.cells[key]
                        if (!cell) return <td key={key} />
                        const label = [nameOf(side), nameOf(top)].filter(Boolean).join(' ')
                        return (
                          <td
                            key={key}
                            className={[
                              'border-s border-border-subtle px-4 py-5 align-top',
                              cell.on ? 'bg-white' : 'bg-surface-background',
                            ].join(' ')}
                          >
                            <div className="flex items-center gap-3">
                              <TableCheckbox
                                checked={cell.on}
                                onChange={() => update((current) => toggleCell(current, key))}
                                ariaLabel={t('itemOptions.grid.sell', { name: label })}
                              />
                              <PriceInput
                                value={cell.price}
                                ariaLabel={t('itemOptions.grid.priceOf', { name: label })}
                                tone={!cell.on ? 'off' : cell.byHand ? 'byHand' : 'normal'}
                                onChange={(price) =>
                                  update((current) => setPrice(current, key, price))
                                }
                              />
                            </div>
                            <p className="mt-2 flex min-h-4 flex-wrap items-center gap-x-2 ps-[27px] text-[11px] font-medium">
                              {!cell.on ? (
                                <span className="text-pending-700">
                                  {t('itemOptions.grid.notSold')}
                                </span>
                              ) : (
                                <>
                                  {cell.code ? (
                                    <span
                                      dir="ltr"
                                      className="whitespace-nowrap font-mono text-[10px] tracking-[0.5px] text-text-quaternary"
                                    >
                                      {cell.code}
                                    </span>
                                  ) : (
                                    <span className="text-text-quaternary">
                                      {t('itemOptions.grid.noCode')}
                                    </span>
                                  )}
                                  {cell.byHand ? (
                                    <span className="text-pending-700">
                                      {t('itemOptions.grid.setByHand')}
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </p>
                            {arabicNames ? (
                              <label className="mt-2 block ps-[27px]">
                                <span className="mb-1 block text-[11px] font-medium text-text-tertiary">
                                  {t('itemOptions.grid.arabicName')}
                                </span>
                                <input
                                  value={cell.nameAr ?? ''}
                                  dir="rtl"
                                  maxLength={200}
                                  placeholder={
                                    cell.nameArAuto || t('itemOptions.grid.arabicNameAuto')
                                  }
                                  title={cell.nameAr || cell.nameArAuto || undefined}
                                  aria-label={t('itemOptions.grid.arabicNameOf', { name: label })}
                                  onChange={(event) => {
                                    const typed = event.target.value
                                    update((current) => setVariantNameAr(current, key, typed))
                                  }}
                                  className="h-[34px] w-full min-w-0 rounded-sm border border-border-subtle bg-white px-2 text-xs font-medium text-text-primary outline-none transition-colors placeholder:text-text-placeholder focus:border-border-brand"
                                />
                              </label>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </fieldset>

      {/* What this adds up to */}
      <Card title={t('itemOptions.figures.title')}>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Figure
            rule="border-primary-700"
            label={t('itemOptions.figures.canSell')}
            value={String(figures.onSale)}
            note={t('itemOptions.figures.canSellNote')}
          />
          <Figure
            rule="border-border-default"
            label={t('itemOptions.figures.range')}
            value={
              figures.onSale ? (
                <span className="whitespace-nowrap">
                  <Rial />
                  {' '}
                  <span dir="ltr">
                    {omr(figures.min)} – {omr(figures.max)}
                  </span>
                </span>
              ) : (
                t('itemOptions.figures.none')
              )
            }
            note={rangeNote}
          />
          <Figure
            rule="border-primary-900"
            label={t('itemOptions.figures.codesReady')}
            value={t('itemOptions.figures.codesOf', {
              ready: figures.codesReady,
              total: figures.onSale,
            })}
            note={t('itemOptions.figures.codesNote')}
          />
          <Figure
            rule="border-pending-700"
            label={t('itemOptions.figures.stock')}
            value={String(figures.needsStockCounts)}
            note={t('itemOptions.figures.stockNote')}
            sand
          />
        </div>
      </Card>

      {/* Footer */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-quaternary">
          <b className="font-semibold text-text-primary">
            {t('itemOptions.footer.toSell', { count: figures.onSale })}
          </b>
          {' · '}
          {t('itemOptions.footer.unticked', { count: figures.unticked })}
          {figures.onSale ? (
            <>
              {' · '}
              {withRial(
                t('itemOptions.footer.prices', { min: omr(figures.min), max: omr(figures.max) }),
              )}
            </>
          ) : null}
          {saved ? (
            <span className="ms-2 text-[#3d5648]">{t('itemOptions.footer.saved')}</span>
          ) : null}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to={`/catalog/${item.id}`}
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('itemOptions.footer.cancel')}
          </Link>
          {readOnly ? null : (
            <button
              type="button"
              onClick={() => void save()}
              // Nothing ticked is refused; an item with no sizes or options at all can be saved.
              disabled={saving || (figures.total > 0 && figures.onSale === 0)}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
            >
              <img src={tickWhiteIcon} alt="" className="size-4" />
              {saving
                ? t('common.saving')
                : t('itemOptions.footer.save', { count: figures.onSale })}
            </button>
          )}
        </div>
      </div>
    </CatalogShell>
  )
}

/** The note under the second choice: why a value costs more, when one does. */
function topNote(
  set: OptionSet,
  nameOf: (entry: { name: string; nameAr: string }) => string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const dearer = set.values.find((value) => value.delta !== 0)
  return dearer
    ? t('itemOptions.chooses.changeNote', { name: nameOf(dearer), amount: signed(dearer.delta) })
    : t('itemOptions.chooses.sameNote')
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-md bg-surface-card">
      <h2 className="p-5 text-lg font-medium leading-[1.2] text-text-primary">{title}</h2>
      <div className="p-5 pt-0">{children}</div>
    </section>
  )
}

function OptionPanel({
  set,
  which,
  nameOf,
  arabic,
  note,
  onAdd,
  onRemove,
}: {
  set: OptionSet
  which: Side
  nameOf: (entry: { name: string; nameAr: string }) => string
  arabic: boolean
  note: string
  onAdd: (name: string) => void
  onRemove: (id: string) => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const noun = arabic ? set.nounAr : set.noun

  const commit = () => {
    if (draft.trim()) onAdd(draft)
    setDraft('')
    setAdding(false)
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (draft.trim()) onAdd(draft)
      setDraft('')
    } else if (event.key === 'Escape') {
      setDraft('')
      setAdding(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border-subtle">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border-subtle bg-surface-background px-4 py-3">
        <span className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-[4px] bg-white text-primary-700">
            <ArrowIcon dir={which === 'side' ? 'down' : 'across'} />
          </span>
          <span className="text-sm font-medium text-text-primary">{nameOf(set)}</span>
        </span>
        <span className="text-[11px] font-medium text-text-quaternary">
          {which === 'side'
            ? t('itemOptions.chooses.downSide')
            : t('itemOptions.chooses.acrossTop')}
          {' · '}
          {t('itemOptions.chooses.optionCount', { count: set.values.length })}
        </span>
      </div>
      <ul className="flex min-h-[96px] flex-1 flex-wrap content-start gap-2 p-4">
        {set.values.map((value) => (
          <li
            key={value.id}
            className="inline-flex h-[36px] items-center gap-3 rounded-sm border border-primary-200 bg-primary-50 ps-4 pe-2 text-sm font-medium text-primary-800"
          >
            {nameOf(value)}
            <button
              type="button"
              onClick={() => onRemove(value.id)}
              aria-label={t('itemOptions.chooses.remove', { name: nameOf(value) })}
              className="flex size-6 items-center justify-center rounded-[3px] text-primary-700 transition-colors hover:bg-white disabled:opacity-30"
            >
              <svg viewBox="0 0 18 18" fill="none" className="size-3.5" aria-hidden="true">
                <path
                  d="m5.2 5.2 7.6 7.6M12.8 5.2l-7.6 7.6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </li>
        ))}
        <li>
          {adding ? (
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKey}
              onBlur={commit}
              placeholder={t('itemOptions.chooses.newPlaceholder')}
              aria-label={t('itemOptions.chooses.addA', { noun })}
              className="h-[36px] w-[160px] rounded-sm border border-border-brand bg-white px-3 text-sm font-medium text-text-primary outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-[36px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-quaternary transition-colors hover:bg-primary-25"
            >
              <PlusIcon />
              {t('itemOptions.chooses.addA', { noun })}
            </button>
          )}
        </li>
      </ul>
      <p className="flex items-start gap-2 border-t border-border-subtle bg-surface-background px-4 py-3 text-xs font-medium leading-[1.5] text-text-tertiary">
        <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
        {note}
      </p>
    </div>
  )
}

/** A price in the grid: three decimals, the whole figure selected on focus. */
function PriceInput({
  value,
  ariaLabel,
  tone,
  onChange,
}: {
  value: number
  ariaLabel: string
  tone: 'normal' | 'byHand' | 'off'
  onChange: (price: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      value={draft ?? value.toFixed(3)}
      inputMode="decimal"
      aria-label={ariaLabel}
      onFocus={(event: FocusEvent<HTMLInputElement>) => {
        setDraft(value.toFixed(3))
        selectAllOnFocus(event)
      }}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^\d.]/g, '')
        setDraft(raw)
        const price = Number(raw)
        if (raw !== '' && Number.isFinite(price)) onChange(price)
      }}
      onBlur={() => setDraft(null)}
      className={[
        'h-[38px] min-w-0 flex-1 rounded-sm border px-3 text-end text-sm font-medium tabular-nums outline-none transition-colors focus:border-border-brand',
        tone === 'byHand'
          ? 'border-pending-500/40 bg-pending-100 text-pending-700'
          : tone === 'off'
            ? 'border-border-subtle bg-white text-text-quaternary'
            : 'border-border-subtle bg-white text-text-primary',
      ].join(' ')}
    />
  )
}

/** A value's price change, shown as words until it is clicked. */
function DeltaEdit({
  value,
  label,
  ariaLabel,
  className,
  onCommit,
}: {
  value: number
  label: string
  ariaLabel: string
  className: string
  onCommit: (delta: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const finish = () => {
    if (draft !== null) {
      const delta = Number(draft)
      if (draft.trim() !== '' && Number.isFinite(delta)) onCommit(delta)
    }
    setDraft(null)
  }
  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(value.toFixed(3))}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={['block font-medium underline-offset-2 hover:underline', className].join(' ')}
      >
        <span dir="ltr">{label}</span>
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      inputMode="decimal"
      aria-label={ariaLabel}
      onFocus={selectAllOnFocus}
      onChange={(event) => setDraft(event.target.value.replace(/[^\d.-]/g, ''))}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish()
        if (event.key === 'Escape') setDraft(null)
      }}
      className="mt-1 h-[28px] w-[96px] rounded-sm border border-border-brand bg-white px-2 text-end text-xs font-medium tabular-nums text-text-primary outline-none"
    />
  )
}

function Figure({
  rule,
  label,
  value,
  note,
  sand,
}: {
  rule: string
  label: string
  value: ReactNode
  note: string
  sand?: boolean
}) {
  return (
    <div className={['min-w-0 border-s-[3px] ps-4', rule].join(' ')}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
        {label}
      </p>
      <p
        className={[
          'mt-2 text-xl font-medium tabular-nums text-text-primary',
          sand ? 'rounded-sm bg-pending-100 px-4 py-3 text-pending-700' : '',
        ].join(' ')}
      >
        {value}
      </p>
      <p className="mt-2 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" className="size-4 shrink-0" aria-hidden="true">
      <path
        d="M9 3.8v10.4M3.8 9h10.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Down the side, or across the top (which way "across" runs follows the reading direction). */
function ArrowIcon({ dir }: { dir: 'down' | 'across' }) {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className={['size-3 shrink-0', dir === 'across' ? '-rotate-90 rtl:rotate-90' : ''].join(' ')}
    >
      <path
        d="M9 3.6v10.5M13.4 9.7 9 14.1 4.6 9.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
