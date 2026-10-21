import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks'
import { BRANCHES_PATH, loadBranches, type BranchDto } from '../../api/invoices/drafts'
import { storeBranchId, storedBranchId, workingBranch } from '../../lib/workingBranch'
import { OptionPicker } from '../ui'

/** The company's branches and the one being worked in; choosing one remembers it. */
export function useWorkingBranch() {
  const branches = useApiRead<BranchDto[]>(BRANCHES_PATH, loadBranches)
  const [stored, setStored] = useState(storedBranchId)
  const list = branches.read.status === 'ready' ? branches.read.data : []
  const branch = workingBranch(list, stored)
  const choose = (id: string) => {
    storeBranchId(id)
    setStored(id)
  }
  return { read: branches.read, branches: list, branch, choose }
}

/**
 * Which branch the screen is working in: Catalogue, Stock and POS each keep their own per
 * branch. The branches are the company's own (`GET /v1/branches`), the same list the invoice
 * offers.
 */
export function BranchPicker({ tall, narrow }: { tall?: boolean; narrow?: boolean }) {
  const { t } = useTranslation()
  const { read, branches, branch, choose } = useWorkingBranch()
  return (
    <OptionPicker
      tall={tall}
      narrow={narrow}
      ariaLabel={t('workingBranch.label')}
      value={branch?.id ?? ''}
      onChange={choose}
      options={branches.map((entry) => ({ value: entry.id, label: entry.name }))}
      placeholder={
        read.status === 'failed'
          ? t('invoiceDraft.branchesFailed')
          : read.status === 'ready'
            ? t('workingBranch.none')
            : t('appAccess.loading')
      }
    />
  )
}
