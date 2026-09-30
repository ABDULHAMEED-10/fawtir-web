import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { LinkedDoc, LinkedDocKind } from '../../lib/linkedDocuments'
import linkIcon from '../../assets/create-invoice/link.svg'
import docDeliveryIcon from '../../assets/create-invoice/doc-delivery.svg'
import docOrderIcon from '../../assets/create-invoice/doc-order.svg'
import removeIcon from '../../assets/create-invoice/remove-x.svg'

/**
 * "Link related documents" (Figma 69:45681, section 4).
 *
 * An invoice rarely stands alone — it settles a delivery note, an order form or both. Linking
 * them here is what lets the delivery note stop reading "not invoiced" and the order form move
 * its fulfilment bar along. Shown on every customer type, not just Government.
 */

/** Each kind gets its own tinted tile so the two read apart at a glance. */
const KIND_STYLES: Record<LinkedDocKind, { icon: string; tile: string }> = {
  delivery: { icon: docDeliveryIcon, tile: 'bg-[#e6efea]' },
  order: { icon: docOrderIcon, tile: 'bg-[#eaedf8]' },
}

const CHIP_STYLES = {
  pending: 'bg-[#f7f1e6] text-[#6d5a39]',
  progress: 'bg-[#eaedf8] text-[#2c4eb7]',
  closed: 'bg-[#e6efea] text-[#3d5648]',
} as const

export function LinkedDocuments({
  docs,
  titleSlot,
  onRemove,
  onLink,
  linkableCount = 0,
}: {
  docs: LinkedDoc[]
  /** The numbered section heading — sits opposite the link button, as in Figma. */
  titleSlot?: ReactNode
  onRemove?: (id: string) => void
  onLink?: () => void
  /**
   * How many of this customer's documents are still unlinked.
   *
   * Only used to decide whether there is anything to link at all — with nothing left the
   * button goes away rather than opening an empty picker. It is deliberately not printed on
   * the button: a number there reads as "link this many", which is why the design ended up
   * with "Link 1 documents". The picker shows the counts, where they mean something.
   */
  linkableCount?: number
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {titleSlot}
        {linkableCount > 0 ? (
          <button
            type="button"
            onClick={onLink}
            className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-[#e8e8ea] px-2.5 text-base font-semibold leading-[1.2] text-[#444957] transition-colors hover:bg-surface-tab-bar"
          >
            <img src={linkIcon} alt="" className="size-5" />
            {t('createInvoice.linked.linkDocuments')}
          </button>
        ) : (
          <p className="text-sm font-medium leading-[1.2] text-text-tertiary">
            {t('createInvoice.linked.allLinked')}
          </p>
        )}
      </div>
      <div className="h-px w-full bg-border-subtle" />
      {docs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-sm font-medium text-text-tertiary">
            {t('createInvoice.linked.empty')}
          </p>
          {linkableCount > 0 ? (
            <button
              type="button"
              onClick={onLink}
              className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-primary-300 bg-primary-25 px-3 text-sm font-semibold leading-[1.2] text-primary-800 transition-colors hover:border-primary-500"
            >
              <img src={linkIcon} alt="" className="size-5" />
              {t('createInvoice.linked.browse')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map((doc) => {
            const style = KIND_STYLES[doc.kind]
            return (
              <div
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#2c4eb7] bg-[#f4f6fb]/50 p-3"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span
                    className={[
                      'flex size-11 shrink-0 items-center justify-center rounded-[2px]',
                      style.tile,
                    ].join(' ')}
                  >
                    <img src={style.icon} alt="" className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-medium leading-[1.2] text-[#0c0d34]">
                      {t(doc.titleKey, doc.titleValues)}
                    </p>
                    <p className="mt-[3px] text-xs font-medium leading-[1.2] text-[#444957]">
                      {t(doc.metaKey, doc.metaValues)}
                    </p>
                  </div>
                  <span
                    className={[
                      'inline-flex shrink-0 items-center rounded-full px-3 py-[5px] text-sm font-semibold leading-[1.2]',
                      CHIP_STYLES[doc.chipTone],
                    ].join(' ')}
                  >
                    {t(doc.chipKey)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove?.(doc.id)}
                  aria-label={t('createInvoice.linked.unlink', { id: doc.id })}
                  className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-black/[0.04] transition-colors hover:bg-black/[0.08]"
                >
                  <img src={removeIcon} alt="" className="size-5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
