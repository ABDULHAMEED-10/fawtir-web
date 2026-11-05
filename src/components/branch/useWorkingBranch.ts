import { useMemo } from 'react'
import { useApiRead, type ApiRead } from '../../hooks'
import { BRANCHES_PATH, loadBranches, type BranchDto } from '../../api/invoices/drafts'
import { useWorkingBranchId, workingBranch } from '../../lib/workingBranch'
import { loadOrRecall } from '../../lib/posOffline'
import { useBranchName } from './useBranchName'

/**
 * `GET /v1/branches` as every reader gets it (B5-C3, owner B-5 decision 4): readable with any of
 * `branch.read`, `stock.read`, `pos.read` or `product.read`, narrowed to the caller's branches, and
 * for a caller without `branch.read` only `{id, code, name, nameAr}` (backend C3 65fc3ad41). Only
 * `id` and `name` are required; the rest are kept when present and never invented, so a missing
 * `type` is not mistaken for a known one: without it the working branch falls back to the first
 * row, not the head office. A row without a usable id or name is dropped rather than made into a
 * branch nobody can name.
 *
 * This replaces the fallback onto the entitlements' `branchIds` (E2E 29 Oct 2026, F-3), which
 * guessed nameless branches for a refused reader and had none for a company-wide one.
 */
export function branchRows(data: unknown): BranchDto[] {
  if (!Array.isArray(data)) return []
  const rows: BranchDto[] = []
  for (const row of data as unknown[]) {
    if (!row || typeof row !== 'object') continue
    const { id, name, code, type, city, nameAr } = row as Record<string, unknown>
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim()) continue
    rows.push({
      id,
      name,
      code: typeof code === 'string' ? code : '',
      ...(typeof type === 'string' ? { type } : {}),
      ...(typeof city === 'string' ? { city } : {}),
      ...(typeof nameAr === 'string' ? { nameAr } : {}),
    })
  }
  return rows
}

/**
 * The branch chosen in the sidebar's company card, as a screen that keeps something per branch
 * reads it (the till names it on its receipt and cash-up). There is no picker on those screens:
 * the sidebar's choice applies to the whole platform (owner, 21 Oct 2026).
 *
 * The list is kept on this device for the till's offline screens (`lib/posOffline`): a read that
 * cannot reach the server answers the last list instead of leaving the screen without a branch.
 * A refusal is never answered that way (`loadOrRecall` recalls only on a network failure): a reader
 * the server refuses has no working branch, never a guessed or remembered one (fail closed).
 */
export function useWorkingBranch() {
  const branches = useApiRead<BranchDto[]>(BRANCHES_PATH, () =>
    loadOrRecall('branches', loadBranches),
  )
  const chosen = useWorkingBranchId()
  const { label } = useBranchName()
  const read: ApiRead<BranchDto[]> = branches.read
  // Normalised where it is read, not where it is loaded: the same path's read is shared with
  // screens that load it as it comes, and a remembered offline copy predates the projection.
  const list = useMemo(() => (read.status === 'ready' ? branchRows(read.data) : []), [read])
  const branch = workingBranch(list, chosen)
  /** The working branch's name as the reader sees it (Arabic in Arabic, when it has one). */
  const name = branch?.name ? label(branch) : null
  return { read, branches: list, branch, name }
}
