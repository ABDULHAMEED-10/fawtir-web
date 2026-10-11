import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import closeIcon from '../../assets/create-invoice/remove-x.svg'
import { tabbablesIn } from './focusScope'
import { isTopOverlay, openOverlay, popoverPanelsOwnedBy } from './overlayStack'

/** Open dialogs, oldest first. Only the newest keeps Tab inside itself. */
const openModals: object[] = []

/**
 * The dialog shell the app's modals share.
 *
 * The existing modals each rebuilt the same overlay, header and scroll behaviour; this is that
 * shell in one place, so a new dialog only supplies its own body and buttons. Escape and a click
 * on the backdrop both close it, and the page behind it stops scrolling while it is open.
 *
 * Focus: a dialog whose content already took focus on mount (an `autoFocus`) keeps it; otherwise
 * the dialog itself is focused, so the next Tab reaches its first control. Tab and Shift+Tab stay
 * inside the dialog and the dropdowns or calendars opened from it, which are portalled to the end
 * of the body. On close, focus goes back to whatever had it when the dialog opened.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 560,
  icon,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  children: ReactNode
  /** Pinned below the scrolling body, as the design's action bars are. */
  footer?: ReactNode
  width?: number
  /** A tile beside the title, where the frame draws one. */
  icon?: string
}) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)
  const overlay = useRef({})

  // Read while rendering the open dialog, before React commits it: by the first effect an
  // `autoFocus` inside it has already moved focus away from the opener.
  const [opener, setOpener] = useState<Element | null>(null)
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpener(document.activeElement)
  }

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    const self = {}
    openModals.push(self)
    const closeOverlay = openOverlay(overlay.current)
    if (!dialog.contains(document.activeElement)) dialog.focus()

    // Every Tab is placed here, in the dialog's own order followed by its open popovers', so it
    // can neither fall onto the page behind (this shell is not portalled) nor skip a popover. A
    // key a control has already handled (a code editor's indent) is left alone.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return
      if (openModals[openModals.length - 1] !== self) return
      event.preventDefault()
      const items = tabbablesIn([dialog, ...popoverPanelsOwnedBy(dialog)])
      if (!items.length) {
        dialog.focus()
        return
      }
      const index = items.indexOf(document.activeElement as HTMLElement)
      const next =
        index === -1
          ? event.shiftKey
            ? items.length - 1
            : 0
          : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length
      items[next].focus()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openModals.splice(openModals.indexOf(self), 1)
      closeOverlay()
      // StrictMode rehearses an unmount with the dialog still on the page; focus stays put then.
      if (dialog.isConnected) return
      // Something already placed focus on purpose (a page focusing its notice); leave it.
      const active = document.activeElement
      if (active && active !== document.body && active.isConnected) return
      // An opener inside a popover or dialog that has itself gone is not restored to.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [open, opener])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      // A popover opened from inside the dialog spends the Escape on itself first; the next one is
      // the dialog's. A popover left open underneath the dialog (stale header search suggestions)
      // is not the newest overlay, so it cannot take the dialog's Escape. A dialog opened from this
      // one is newer still, so one Escape closes it alone rather than both.
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (isTopOverlay(overlay.current)) onClose()
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
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 outline-none"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        style={{ maxWidth: width }}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-md bg-white shadow-card"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-5">
          {icon ? (
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-sm bg-primary-50">
              <img src={icon} alt="" className="size-5" />
            </span>
          ) : null}
          <div className={['min-w-0', icon ? 'flex-1 self-center' : ''].join(' ')}>
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
