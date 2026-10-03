import type { RefObject } from 'react'

/**
 * Every open popover and dialog, in the order they opened. Escape belongs to the newest only.
 *
 * Popovers and dialogs share one order because a popover can outlive the moment it was useful: the
 * header search keeps its suggestions open after focus tabs away, and a dialog opened after that
 * sits above them. With an order per kind, the stale suggestions behind the dialog took an Escape
 * meant for the dialog, and nothing visible happened.
 */
const overlays: object[] = []

/** Open popovers with their trigger and panel, so a dialog can tell which ones are its own. */
export type OpenPopover = {
  panel: RefObject<HTMLElement | null>
  anchor: RefObject<HTMLElement | null>
}
const popovers: OpenPopover[] = []

/** Registers an open overlay; the returned function removes it. */
export function openOverlay(entry: object): () => void {
  overlays.push(entry)
  return () => {
    const index = overlays.lastIndexOf(entry)
    if (index !== -1) overlays.splice(index, 1)
  }
}

/** Registers an open popover, as an overlay and by its panel; the returned function removes it. */
export function openPopover(entry: OpenPopover): () => void {
  popovers.push(entry)
  const closeOverlay = openOverlay(entry)
  return () => {
    closeOverlay()
    const index = popovers.lastIndexOf(entry)
    if (index !== -1) popovers.splice(index, 1)
  }
}

export function isTopOverlay(entry: object): boolean {
  return overlays[overlays.length - 1] === entry
}

/**
 * The panels of open popovers whose trigger sits inside `container`. A dialog keeps Tab inside
 * itself, and these panels belong to it even though they are portalled to the end of the body.
 */
export function popoverPanelsOwnedBy(container: Element): HTMLElement[] {
  return popovers
    .filter((entry) => entry.anchor.current && container.contains(entry.anchor.current))
    .map((entry) => entry.panel.current)
    .filter((panel): panel is HTMLElement => panel !== null)
}
