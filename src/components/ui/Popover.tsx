import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * Open popovers, oldest first. Escape belongs to the newest only: two can be open at once (the
 * header search keeps its suggestions open after focus tabs away), and the capture listeners run
 * in registration order, so without this the older one took the key and the one in use stayed open.
 */
const openPopovers: object[] = []

/**
 * Anchored popup rendered into `document.body`.
 *
 * An absolutely positioned panel is clipped by any ancestor with `overflow: hidden|auto` — which
 * is every scrollable table and every card in this app. Portalling to the body escapes that, and
 * `position: fixed` coordinates taken from the trigger keep it attached. It flips above the
 * trigger when there is no room below, and closes on outside click, Escape, scroll or resize.
 */
export function Popover({
  open,
  anchorRef,
  onClose,
  children,
  /** Matches the trigger's width by default; pass a number to override. */
  width,
  align = 'start',
}: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  width?: number
  align?: 'start' | 'end'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{
    top: number
    left: number
    width: number
    maxHeight: number
  }>()

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const panelHeight = panelRef.current?.offsetHeight ?? 280
      const gap = 4
      const below = window.innerHeight - rect.bottom - gap
      const above = rect.top - gap
      // Flip up only when below genuinely cannot hold it and above is roomier.
      const flip = below < Math.min(panelHeight, 220) && above > below
      const panelWidth = width ?? rect.width
      const left = align === 'end' ? rect.right - panelWidth : rect.left
      setStyle({
        top: flip ? Math.max(gap, rect.top - gap - panelHeight) : rect.bottom + gap,
        left: Math.min(Math.max(gap, left), window.innerWidth - panelWidth - gap),
        width: panelWidth,
        maxHeight: Math.max(160, (flip ? above : below) - gap),
      })
    }
    place()
    // `true` catches scrolls inside any ancestor, not just the window.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchorRef, width, align])

  // Keyed on `open` alone: the listener effect below re-runs whenever a caller passes a new
  // `onClose`, which would otherwise move an older popover back to the top.
  const self = useRef({})
  useEffect(() => {
    if (!open) return
    const entry = self.current
    openPopovers.push(entry)
    return () => {
      const index = openPopovers.lastIndexOf(entry)
      if (index !== -1) openPopovers.splice(index, 1)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    // Escape closes the deepest overlay only. A Modal around this popover also listens on the
    // document, and was registered first, so in the bubble phase it closed the dialog (and lost
    // what was typed in it) on the same key press. The capture phase runs before every bubble
    // listener on the document whatever the registration order; `preventDefault` marks the key as
    // spent, which `Modal` honours. Focus inside the panel goes back to the trigger, since the
    // panel is about to unmount and would otherwise drop it on the body.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (openPopovers[openPopovers.length - 1] !== self.current) return
      event.preventDefault()
      const focusWasInPanel = panelRef.current?.contains(document.activeElement) ?? false
      onClose()
      if (focusWasInPanel) anchorRef.current?.focus()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchorRef, onClose])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: style?.top ?? -9999,
        left: style?.left ?? -9999,
        width: style?.width,
        maxHeight: style?.maxHeight,
        // Hidden until measured, so it never flashes at the wrong place.
        visibility: style ? 'visible' : 'hidden',
      }}
      className="z-[60] overflow-hidden rounded-sm border border-border-subtle bg-white shadow-card"
    >
      {children}
    </div>,
    document.body,
  )
}
