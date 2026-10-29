import { useMemo } from 'react'
import { useApiRead, type ApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import { ApiError } from '../../api'
import { BRANCHES_PATH, loadBranches, type BranchDto } from '../../api/invoices/drafts'
import type { Entitlements } from '../../lib/identity/entitlements'
import { useWorkingBranchId, workingBranch } from '../../lib/workingBranch'
import { loadOrRecall } from '../../lib/posOffline'
import { useBranchName } from './useBranchName'

/**
 * The branches a person may work in when `GET /v1/branches` refuses them (`branch.read` is not in
 * every role: View only holds `stock.read` and `pos.read` without it, E2E 29 Oct 2026, F-3). Their
 * own branches are on the entitlements (`branchIds`, BA-1), by id only, so the screen reads its own
 * rows for that branch and simply does not name it. Null when there is nothing to fall back on.
 *
 * TODO(backend): a caller who sees every branch (`allBranches`) without `branch.read` has no branch
 * id to fall back on; the entitlements list ids only when branch access is enforced.
 */
export function ownBranches(
  read: ApiRead<BranchDto[]>,
  entitlements: Entitlements | null,
): BranchDto[] | null {
  if (read.status !== 'failed') return null
  if (!(read.error instanceof ApiError) || read.error.status !== 403) return null
  const ids = entitlements?.branchIds ?? []
  if (!ids.length) return null
  return ids.map((id) => ({ id, code: '', name: '', type: '', city: null }))
}

/**
 * The branch chosen in the sidebar's company card, as a screen that keeps something per branch
 * reads it (the till names it on its receipt and cash-up). There is no picker on those screens:
 * the sidebar's choice applies to the whole platform (owner, 21 Oct 2026).
 *
 * The list is kept on this device for the till's offline screens (`lib/posOffline`): a read that
 * cannot reach the server answers the last list instead of leaving the screen without a branch.
 */
export function useWorkingBranch() {
  const branches = useApiRead<BranchDto[]>(BRANCHES_PATH, () =>
    loadOrRecall('branches', loadBranches),
  )
  const { entitlements, ready } = useEntitlements()
  const chosen = useWorkingBranchId()
  const { label } = useBranchName()
  const fallback = useMemo(
    () => ownBranches(branches.read, entitlements),
    [branches.read, entitlements],
  )
  const refusedAwaitingEntitlements =
    !fallback &&
    !ready &&
    branches.read.status === 'failed' &&
    branches.read.error instanceof ApiError &&
    branches.read.error.status === 403
  const read: ApiRead<BranchDto[]> = fallback
    ? { status: 'ready', data: fallback }
    : refusedAwaitingEntitlements
      ? { status: 'loading' }
      : branches.read
  const list = read.status === 'ready' ? read.data : []
  const branch = workingBranch(list, chosen)
  /** The working branch's name as the reader sees it (Arabic in Arabic, when it has one). */
  const name = branch?.name ? label(branch) : null
  return { read, branches: list, branch, name }
}
