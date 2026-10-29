import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Rial } from '../../components/ui'
import { omr, type SaleAddOn } from '../../lib/pos'
import type { ItemChoices, PosItem, SizeChoice } from '../../lib/posShelf'

/**
 * Choosing the size and add-ons of an item that has them (guide section 9, "Making a sale"):
 * the product's own sizes and options on sale in the branch, and its add-ons. Built with the
 * app's Modal and the till's own toggle buttons; no frame draws it.
 */
export function PosChooser({
  item,
  choices,
  onClose,
  onAdd,
}: {
  item: PosItem
  choices: ItemChoices
  onClose: () => void
  onAdd: (size: SizeChoice | null, addOns: SaleAddOn[]) => void
}) {
  const { t } = useTranslation()
  const [size, setSize] = useState<SizeChoice | null>(choices.sizes[0] ?? null)
  const [picked, setPicked] = useState<string[]>([])
  const addOns = choices.addOns.filter((addOn) => picked.includes(addOn.id))
  const price = (size?.price ?? item.price) + addOns.reduce((sum, a) => sum + a.price, 0)

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
            onClick={() => onAdd(size, addOns)}
            disabled={choices.sizes.length > 0 && !size}
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
                  onClick={() => setSize(option)}
                  label={option.label}
                  note={omr(option.price)}
                />
              ))}
            </div>
          </div>
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
}: {
  chosen: boolean
  onClick: () => void
  label: string
  note: string
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
    </button>
  )
}
