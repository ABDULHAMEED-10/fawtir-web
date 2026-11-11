import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateField, Modal, Rial } from '../../components/ui'
import { omr } from '../../lib/catalogRules'
import { tomorrowInMuscat } from './priceRuleAccess'
import { getProduct } from '../../api/catalog/products'
import type { PriceRuleBelowCostItem } from '../../api/catalog/priceRules'
import type { BranchDto } from '../../api/invoices/drafts'

/**
 * The items a rule sells below what they cost (`belowCost[]` on a save, or the items of
 * `422 PRICE_RULE_BELOW_COST`), named from the catalogue, at the branch where each loses most.
 */
export function BelowCostList({
  items,
  branches,
}: {
  items: PriceRuleBelowCostItem[]
  branches: BranchDto[]
}) {
  const { t, i18n } = useTranslation()
  const ar = i18n.language.startsWith('ar')
  const [names, setNames] = useState<Record<string, string>>({})
  const ids = [...new Set(items.map((item) => item.productId))].slice(0, 20).join(',')
  useEffect(() => {
    let live = true
    if (!ids) return
    Promise.all(
      ids.split(',').map((id) =>
        getProduct(id).then(
          (product) => {
            const variant = (product.variants ?? []).find((v) =>
              items.some((item) => item.productId === id && item.variantId === v.id),
            )
            const name = ar && product.nameAr ? product.nameAr : product.name
            return [id, variant ? `${name} · ${variant.name}` : name] as const
          },
          () => [id, ''] as const,
        ),
      ),
    ).then((found) => {
      if (live) setNames(Object.fromEntries(found))
    })
    return () => {
      live = false
    }
    // The items' ids are the key; the list itself is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, ar])
  const branchName = (id: string) => {
    const found = branches.find((branch) => branch.id === id)
    return found ? (ar && found.nameAr ? found.nameAr : found.name) : ''
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li
          key={`${item.productId}-${item.variantId ?? ''}-${index}`}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-sm bg-danger-100 px-3 py-2"
        >
          <span className="min-w-0 text-sm font-medium text-danger-700">
            {names[item.productId] || t('priceRules.belowCost.anItem')}
            {branchName(item.branchId) ? (
              <span className="ms-1 text-xs font-medium text-text-tertiary">
                · <bdi>{branchName(item.branchId)}</bdi>
              </span>
            ) : null}
          </span>
          <span className="text-xs font-semibold text-danger-700 tabular-nums">
            {t('priceRules.belowCost.line', {
              price: omr(item.price),
              cost: omr(item.averageCost),
              loss: omr(item.lossEach),
            })}{' '}
            <Rial />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** "Go live anyway": the same request again with `acknowledgeBelowCost: true`. */
export function BelowCostDialog({
  items,
  branches,
  busy,
  onCancel,
  onGoLive,
}: {
  items: PriceRuleBelowCostItem[] | null
  branches: BranchDto[]
  busy: boolean
  onCancel: () => void
  onGoLive: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal
      open={items !== null}
      onClose={onCancel}
      title={t('priceRules.belowCost.title')}
      subtitle={t('priceRules.belowCost.subtitle')}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" onClick={onCancel} className={SECONDARY}>
            {t('priceRules.belowCost.keepOff')}
          </button>
          <button type="button" disabled={busy} onClick={onGoLive} className={DANGER}>
            {t('priceRules.belowCost.goLiveAnyway')}
          </button>
        </div>
      }
    >
      {items ? <BelowCostList items={items} branches={branches} /> : null}
    </Modal>
  )
}

/** "Pause it": off now, back on by itself at 00:00 Muscat time on the chosen day. */
export function PauseDialog({
  open,
  name,
  busy,
  problem,
  onCancel,
  onPause,
}: {
  open: boolean
  name: string
  busy: boolean
  problem: string | null
  onCancel: () => void
  onPause: (until: string) => void
}) {
  const { t } = useTranslation()
  const earliest = tomorrowInMuscat()
  const [until, setUntil] = useState(earliest)
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t('priceRules.pause.title', { name })}
      subtitle={t('priceRules.pause.subtitle')}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" onClick={onCancel} className={SECONDARY}>
            {t('priceRules.cancel')}
          </button>
          <button
            type="button"
            disabled={busy || !until || until < earliest}
            onClick={() => onPause(until)}
            className={PRIMARY}
          >
            {t('priceRules.pause.confirm')}
          </button>
        </div>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-text-secondary">
          {t('priceRules.pause.until')}
        </span>
        <DateField
          value={until}
          onChange={setUntil}
          min={earliest}
          ariaLabel={t('priceRules.pause.until')}
        />
      </label>
      {problem ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger-700">
          {problem}
        </p>
      ) : null}
    </Modal>
  )
}

export const SECONDARY =
  'inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-40'
export const PRIMARY =
  'inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40'
export const DANGER =
  'inline-flex h-[46px] items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-40'
