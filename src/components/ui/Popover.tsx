import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

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

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
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
