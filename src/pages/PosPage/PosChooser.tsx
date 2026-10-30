import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Rial } from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { omr, type SaleAddOn } from '../../lib/pos'
import {
  typedPriceBaisa,
  type ItemChoices,
  type PosItem,
  type SizeChoice,
  type StockFlag,
} from '../../lib/posShelf'
import { StockBadge } from './PosStockBadge'

/**
 * Choosing the size and add-ons of an item that has them (guide section 9, "Making a sale"):
 * the product's own sizes and options on sale in the branch, and its add-ons. Built with the
 * app's Modal and the till's own toggle buttons; no frame draws it.
 *
 * An item or size at 0.000 has no price: whoever may type one (`canTypePrice`) is asked for it here
 * before it can be added, and for anyone else it cannot be added. It also opens for an item with
 * nothing to choose, just to ask the price.
 */
export function PosChooser({
  item,
  choices,
  canTypePrice,
  startSize = null,
  onClose,
  onAdd,
}: {
  item: PosItem
  choices: ItemChoices
  canTypePrice: boolean
  /** The size to open on, when one was already asked for. */
  startSize?: SizeChoice | null
  onClose: () => void
  onAdd: (size: SizeChoice | null, addOns: SaleAddOn[], typedPrice?: number) => void
}) {
  const { t } = useTranslation()
  const [size, setSize] = useState<SizeChoice | null>(startSize ?? choices.sizes[0] ?? null)
  const [typed, setTyped] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const addOns = choices.addOns.filter((addOn) => picked.includes(addOn.id))
  const own = size?.price ?? item.price
  const noPrice = !(own > 0)
  const typedPrice = typedPriceBaisa(typed)
  const price = (noPrice ? typedPrice : own) + addOns.reduce((sum, a) => sum + a.price, 0)
  const addable = (choices.sizes.length === 0 || !!size) && (!noPrice || typedPrice > 0)
  const add = () => {
    if (addable) onAdd(size, addOns, noPrice ? typedPrice : undefined)
  }

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )

  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      width={520}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-baseline gap-1.5 text-lg font-semibold text-text-primary">
            <Rial />
            {omr(price)}
          </span>
          <button
            type="button"
            onClick={add}
            disabled={!addable}
            className="inline-flex h-11 items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
          >
            {t('pos.choose.add')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {choices.sizes.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold text-text-tertiary">{t('pos.choose.size')}</p>
            <div className="flex flex-wrap gap-2">
              {choices.sizes.map((option) => (
                <Choice
                  key={option.id}
                  chosen={size?.id === option.id}
                  onClick={() => {
                    setSize(option)
                    setTyped('')
                  }}
                  label={option.label}
                  note={option.price > 0 ? omr(option.price) : t('pos.noPrice.label')}
                  stock={option.stock ?? null}
                />
              ))}
            </div>
          </div>
        ) : null}
        {noPrice && canTypePrice ? (
          <div>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-text-tertiary">
                {t('pos.noPrice.enter')}
              </span>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                autoFocus
                value={typed}
                placeholder="0.000"
                onFocus={selectAllOnFocus}
                onChange={(event) => setTyped(event.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    add()
                  }
                }}
                className="h-11 w-full rounded-sm border border-border-subtle bg-white px-3 text-end text-base font-semibold text-text-primary outline-none focus:border-primary-700"
              />
            </label>
            <p className="mt-1.5 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('pos.noPrice.enterNote')}
            </p>
          </div>
        ) : null}
        {noPrice && !canTypePrice ? (
          <p
            role="alert"
            className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
          >
            {t('pos.noPrice.label')}
          </p>
        ) : null}
        {choices.addOns.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold text-text-tertiary">
              {t('pos.choose.addOns')}
            </p>
            <div className="flex flex-wrap gap-2">
              {choices.addOns.map((addOn) => (
                <Choice
                  key={addOn.id}
                  chosen={picked.includes(addOn.id)}
                  onClick={() => toggle(addOn.id)}
                  label={addOn.label}
                  note={addOn.price ? `+ ${omr(addOn.price)}` : t('pos.choose.free')}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

function Choice({
  chosen,
  onClick,
  label,
  note,
  stock = null,
}: {
  chosen: boolean
  onClick: () => void
  label: string
  note: string
  /** The size's stock in the branch (backend #815): said, never blocking. */
  stock?: StockFlag | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={chosen}
      className={[
        'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-3 text-sm transition-colors',
        chosen
          ? 'border-primary-700 bg-primary-25 font-semibold text-primary-800'
          : 'border-border-subtle bg-white font-medium text-text-secondary hover:border-primary-300',
      ].join(' ')}
    >
      {label}
      <span dir="ltr" className="text-xs font-medium text-text-quaternary">
        {note}
      </span>
      {stock ? <StockBadge flag={stock} /> : null}
    </button>
  )
}
