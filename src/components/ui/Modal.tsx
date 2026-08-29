import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import closeIcon from '../../assets/create-invoice/remove-x.svg'

/**
 * The dialog shell the app's modals share.
 *
 * The existing modals each rebuilt the same overlay, header and scroll behaviour; this is that
 * shell in one place, so a new dialog only supplies its own body and buttons. Escape and a click
 * on the backdrop both close it, and the page behind it stops scrolling while it is open.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 560,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** Pinned below the scrolling body, as the design's action bars are. */
  footer?: ReactNode
  width?: number
}) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    // The page behind a dialog should not scroll with it.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        style={{ maxWidth: width }}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-md bg-white shadow-card"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-xl font-medium leading-[1.2] text-text-primary">{title}</h2>
            {subtitle ? (
              <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 rounded-sm p-1 transition-colors hover:bg-surface-background"
          >
            <img src={closeIcon} alt="" className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer ? <div className="border-t border-border-subtle px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  )
}
