import { useApiRead } from '../../hooks'
import { BRANCHES_PATH, loadBranches, type BranchDto } from '../../api/invoices/drafts'
import { useWorkingBranchId, workingBranch } from '../../lib/workingBranch'
import { useBranchName } from './useBranchName'

/**
 * The branch chosen in the sidebar's company card, as a screen that keeps something per branch
 * reads it (the till names it on its receipt and cash-up). There is no picker on those screens:
 * the sidebar's choice applies to the whole platform (owner, 21 Oct 2026).
 */
export function useWorkingBranch() {
  const branches = useApiRead<BranchDto[]>(BRANCHES_PATH, loadBranches)
  const chosen = useWorkingBranchId()
  const { label } = useBranchName()
  const list = branches.read.status === 'ready' ? branches.read.data : []
  const branch = workingBranch(list, chosen)
  /** The working branch's name as the reader sees it (Arabic in Arabic, when it has one). */
  const name = branch ? label(branch) : null
  return { read: branches.read, branches: list, branch, name }
}
