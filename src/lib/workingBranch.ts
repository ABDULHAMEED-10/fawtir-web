import type { BranchDto } from '../api/invoices/drafts'

/**
 * The branch Catalogue, Stock and POS are working in (owner, 21 Oct 2026: every branch has its
 * own catalogues, stock and till). Remembered per viewer in this browser only, as a convenience:
 * it decides which branch the screens open on, never what a document is filed under.
 */
const KEY = 'fawtir.workingBranch'

export function storedBranchId(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function storeBranchId(id: string): void {
  try {
    window.localStorage.setItem(KEY, id)
  } catch {
    // A private window or blocked storage: the choice lasts for this screen only.
  }
}

/** The remembered branch while it still exists, else the head office, else the first. */
export function workingBranch(branches: BranchDto[], stored: string | null): BranchDto | null {
  return (
    branches.find((branch) => branch.id === stored) ??
    branches.find((branch) => branch.type === 'HEAD_OFFICE') ??
    branches[0] ??
    null
  )
}
