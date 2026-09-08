import { useEffect, type RefObject } from 'react'

/**
 * Escape closes an open drawer, and focus stays inside it while it is open.
 *
 * Shared by the two shells — the tenant app's sidebar and the Fawtir console's — so the keyboard
 * behaviour of a navigation drawer is described once rather than drifting apart.
 *
 * Only matters below `lg`, where a sidebar is a panel over the page. Above that it is part of the
 * layout, `open` is never set, and none of this runs.
 */
export function useDrawer(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const panel = ref.current
    if (!panel) return

    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'),
      ).filter((el) => el.offsetParent !== null)

    focusable()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, ref])
}
