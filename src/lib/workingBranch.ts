import { useSyncExternalStore } from 'react'
import type { BranchDto } from '../api/invoices/drafts'

/**
 * The branch the platform is working in, chosen once in the sidebar's company card
 * (`AccountSwitcher`) and followed by every screen that keeps something per branch: the
 * catalogue, stock and the till (owner, 21 Oct 2026: one branch toggle for the whole platform,
 * not one per screen). Remembered per viewer in this browser as a convenience: it decides which
 * branch the screens open on, never what a document is filed under.
 */
const KEY = 'fawtir.workingBranch'

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

let current: string | null = read()
const listeners = new Set<() => void>()

export function chooseWorkingBranch(id: string): void {
  current = id
  try {
    window.localStorage.setItem(KEY, id)
  } catch {
    // A private window or blocked storage: the choice lasts for this tab only.
  }
  listeners.forEach((listener) => listener())
}

/** The id chosen in the sidebar, or null while none has been. */
export function useWorkingBranchId(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}

/** For tests: forget the choice. */
export function forgetWorkingBranch(): void {
  current = null
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
  listeners.forEach((listener) => listener())
}

/** The chosen branch while it still exists, else the head office, else the first. */
export function workingBranch<
  T extends Pick<BranchDto, 'id'> & { type?: string; headOffice?: boolean },
>(branches: T[], chosen: string | null): T | null {
  return (
    branches.find((branch) => branch.id === chosen) ??
    branches.find((branch) => branch.type === 'HEAD_OFFICE' || branch.headOffice === true) ??
    branches[0] ??
    null
  )
}
