import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import {
  BRANCHES_OVERVIEW_PATH,
  branchDisplayName,
  loadBranchOverview,
  type BranchOverviewDto,
} from '../../api/settings/branches'

/** A branch as any screen holds it: its id and English name, and its Arabic name when the read carries one. */
export type NameableBranch = { id?: string | null; name: string; nameAr?: string | null }

/**
 * How every screen names a branch (Business Rules BR-1): the Arabic name in Arabic when the branch
 * has one, else its name (`branchDisplayName`).
 *
 * The branches overview, a branch's own read and the picker list (`/v1/branches`, in both its full
 * and its lookup projection since backend C3 65fc3ad41) carry `nameAr`, and a row's own is used
 * first; document rows and usage rows name a branch in English only. So in Arabic, for a
 * reader who may read the overview (`branch.manage`), the Arabic names are taken from it by id: the
 * same read the settings shell and the sidebar's company card already make. In English nothing more
 * is read.
 */
export function useBranchName(): {
  /** The name to show for this branch. */
  label: (branch: NameableBranch) => string
  /** The name to show for a branch known only by id and English name; null without a name. */
  byId: (id: string | null | undefined, name: string | null | undefined) => string | null
} {
  const { i18n } = useTranslation()
  const language = i18n.language ?? 'en'
  const arabic = language.startsWith('ar')
  const mayReadOverview = useCan('branch.manage')
  const overview = useApiRead<BranchOverviewDto>(
    arabic && mayReadOverview ? BRANCHES_OVERVIEW_PATH : null,
    () => loadBranchOverview(),
  ).read
  const arabicNames = useMemo(() => {
    const names = new Map<string, string>()
    if (overview.status === 'ready' && Array.isArray(overview.data.branches)) {
      for (const row of overview.data.branches) {
        if (row.nameAr?.trim()) names.set(row.id, row.nameAr)
      }
    }
    return names
  }, [overview])

  const label = useCallback(
    (branch: NameableBranch) =>
      branchDisplayName(
        {
          name: branch.name,
          nameAr: branch.nameAr?.trim() ? branch.nameAr : branch.id ? arabicNames.get(branch.id) : null,
        },
        language,
      ),
    [arabicNames, language],
  )
  const byId = useCallback(
    (id: string | null | undefined, name: string | null | undefined) =>
      name ? label({ id, name }) : null,
    [label],
  )
  return useMemo(() => ({ label, byId }), [label, byId])
}
