import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LinkedDoc } from '../../lib/linkedDocuments'
import { LINK_FILTERS, LINK_PICKER_DOCS, type LinkFilterId } from '../../lib/linkedDocuments'
import linkIcon from '../../assets/create-invoice/link.svg'
import docDeliveryIcon from '../../assets/create-invoice/doc-delivery.svg'
import docOrderIcon from '../../assets/create-invoice/doc-order.svg'
import removeIcon from '../../assets/create-invoice/remove-x.svg'
import searchIcon from '../../assets/order-forms-v2/search.svg'
import metaUserIcon from '../../assets/delivery-detail/meta-user.svg'

/**
 * "Link related documents" picker (Figma 69:45570).
 *
 * Opened from section 4 of the invoice form. Only documents belonging to the invoice's customer
 * are listed — the banner at the top says whose. Selections carry onto the invoice, and the
 * references travel with it over Peppol.
 */

const KIND_STYLES = {
  delivery: { icon: docDeliveryIcon, tile: 'bg-[#e6efea]' },
  order: { icon: docOrderIcon, tile: 'bg-[#eaedf8]' },
} as const

const CHIP_STYLES = {
  pending: 'bg-[#f7f1e6] text-[#6d5a39]',
  progress: 'bg-[#eaedf8] text-[#2c4eb7]',
  closed: 'bg-[#e6efea] text-[#3d5648]',
} as const

export function LinkDocumentsModal({
  open,
  customer,
  initialSelected,
  onClose,
  onConfirm,
}: {
  open: boolean
  customer: string
  initialSelected: string[]
  onClose: () => void
  onConfirm: (docs: LinkedDoc[]) => void
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<LinkFilterId>('notInvoiced')
  const [selected, setSelected] = useState<string[]>(initialSelected)

  useEffect(() => {
    if (open) setSelected(initialSelected)
  }, [open, initialSelected])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const visible = LINK_PICKER_DOCS.filter((doc) => {
    if (filter === 'all') return true
    if (filter === 'notInvoiced') return doc.chipTone === 'pending'
    if (filter === 'deliveryNotes') return doc.kind === 'delivery'
    return doc.kind === 'order'
  })

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('linkModal.title')}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-[873px] flex-col overflow-hidden rounded-md bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-medium leading-[1.2] text-[#151c2d]">
                {t('linkModal.title')}
              </h2>
              <p className="mt-1.5 text-sm font-medium leading-[1.2] text-[#5b606c]">
                {t('linkModal.subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('linkModal.close')}
              className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-black/[0.04]"
            >
              <img src={removeIcon} alt="" className="size-5" />
            </button>
          </div>

          {/* Only this customer's documents can settle this invoice. */}
          <div className="mt-4 inline-flex h-11 items-center gap-2 rounded-sm border border-[#d0d2d5] bg-[#f3f4f5] px-3">
            <img src={metaUserIcon} alt="" className="size-6" />
            <span className="text-xs font-medium leading-[1.2] text-[#444957]">
              {t('linkModal.showingFor')}
            </span>
            <span className="text-base font-medium leading-[1.2] text-[#0c0d34]">{customer}</span>
          </div>

          <label className="mt-6 flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-[#fafafa] px-4">
            <img src={searchIcon} alt="" className="size-5 shrink-0" />
            <input
              type="search"
              placeholder={t('linkModal.searchPlaceholder')}
              className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-[#8a8e96]"
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {LINK_FILTERS.map((option) => {
              const active = option.id === filter
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  aria-pressed={active}
                  className={[
                    'inline-flex h-[38px] items-center gap-2 rounded-full border px-4 text-sm font-medium leading-[1.2]',
                    active
                      ? 'border-[#2c4eb7] bg-[#f4f6fb] text-[#2c4eb7]'
                      : 'border-[#a1a4ab] text-[#2c3342]',
                  ].join(' ')}
                >
                  {t(option.labelKey)}
                  <span className="font-semibold">{option.count}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {visible.map((doc) => {
              const style = KIND_STYLES[doc.kind]
              const checked = selected.includes(doc.id)
              return (
                <div key={doc.id} className="flex flex-col gap-2">
                  {doc.groupLabelKey ? (
                    <p className="text-xs font-semibold uppercase leading-[1.2] tracking-[0.04em] text-[#5b606c]">
                      {t(doc.groupLabelKey)}
                    </p>
                  ) : null}
                  <label
                    className={[
                      'flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-sm border p-3',
                      checked ? 'border-[#2c4eb7] bg-[#f4f6fb]/50' : 'border-[#e8e8ea]',
                    ].join(' ')}
                  >
                    <span className="flex min-w-0 items-center gap-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(doc.id)}
                        className="size-5 shrink-0 rounded-[4px] accent-[#2c4eb7]"
                      />
                      <span
                        className={[
                          'flex size-11 shrink-0 items-center justify-center rounded-[2px]',
                          style.tile,
                        ].join(' ')}
                      >
                        <img src={style.icon} alt="" className="size-6" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base font-medium leading-[1.2] text-[#0c0d34]">
                          {t(doc.titleKey)}
                        </span>
                        <span className="mt-[3px] block text-xs font-medium leading-[1.2] text-[#444957]">
                          {t(doc.metaKey)}
                        </span>
                      </span>
                    </span>
                    <span
                      className={[
                        'inline-flex shrink-0 items-center rounded-full px-3 py-[5px] text-sm font-semibold leading-[1.2]',
                        CHIP_STYLES[doc.chipTone],
                      ].join(' ')}
                    >
                      {t(doc.chipKey)}
                    </span>
                  </label>
                </div>
              )
            })}
          </div>

          <div className="mt-6 border-t border-[#f3f3f3] pt-4">
            <label className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium leading-[1.2] text-[#151c2d]">
                {t('linkModal.poNumber')}
              </span>
              <span className="text-xs font-medium leading-[1.2] text-[#5b606c]">
                {t('linkModal.poNumberHint')}
              </span>
            </label>
            <input
              type="text"
              placeholder={t('linkModal.poPlaceholder')}
              className="mt-2 h-[50px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#f3f3f3] bg-[#fafafa] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[46px] items-center rounded-sm border border-[#e8e8ea] bg-white px-6 text-base font-medium text-[#3a3a3a]"
          >
            {t('linkModal.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(LINK_PICKER_DOCS.filter((doc) => selected.includes(doc.id)))}
            disabled={selected.length === 0 && initialSelected.length === 0}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-[#2c4eb7] px-6 text-base font-semibold text-white disabled:opacity-50"
          >
            <img src={linkIcon} alt="" className="size-5 brightness-0 invert" />
            {t('linkModal.confirm', { count: selected.length })}
          </button>
        </div>
      </div>
    </div>
  )
}
