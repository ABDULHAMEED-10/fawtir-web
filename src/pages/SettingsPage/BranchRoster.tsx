import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { SMALL_BUTTON } from '../ErpPage/overview/idiom'
import {
  branchPeoplePath,
  loadBranchPeople,
  saveBranchPeople,
  type RosterEntryDto,
} from '../../api/settings/branchAccess'
import { describeApiFailure } from '../../lib/apiFailure'
import { branchAccessRefusalKey } from '../../lib/branchAccessRefusals'
import { OwnerPill } from './people'

/**
 * "Who works there" on a branch (Business Rules BA-1, BA-2): one tick per person. The Owner and
 * Administrators see every branch without being assigned, so they are listed as such and cannot
 * be unticked. Saving sends the whole list; the server refuses, naming nobody's branches changed,
 * a save that would leave someone with no branch (`branch-required`).
 */
export function BranchRoster({ branchId }: { branchId: string }) {
  const { t } = useTranslation()
  const mayManage = useCan('branch.manage')
  const roster = useApiRead<RosterEntryDto[]>(mayManage ? branchPeoplePath(branchId) : null, () =>
    loadBranchPeople(branchId),
  )
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => setChosen(null), [roster.read])

  if (!mayManage) {
    return (
      <p className="text-sm font-medium text-text-quaternary">
        {t('branchAccess.roster.adminOnly')}
      </p>
    )
  }
  if (roster.read.status === 'loading') return <LoadingNotice />
  if (roster.read.status === 'failed') {
    return <ApiReadFailure error={roster.read.error} retry={roster.retry} />
  }

  // A list, or nothing to show: never a crash of the branch form around it.
  const people = Array.isArray(roster.read.data) ? roster.read.data : []
  const assigned = people
    .filter((entry) => !entry.allBranches && entry.assigned)
    .map((entry) => entry.userId)
  const current = chosen ?? assigned
  const changed = current.length !== assigned.length || current.some((id) => !assigned.includes(id))

  const save = async () => {
    setSaving(true)
    setFailure(null)
    try {
      await saveBranchPeople(branchId, current)
      setSaved(true)
      roster.retry()
    } catch (error) {
      const refusal = branchAccessRefusalKey(error)
      if (refusal === 'branchAccess.refusal.branchRequired') {
        setFailure(t('branchAccess.roster.lastBranch'))
      } else if (refusal) {
        setFailure(t(refusal))
      } else {
        const message = describeApiFailure(error)
        setFailure(t(message.key, message.values))
      }
    } finally {
      setSaving(false)
    }
  }

  if (people.length === 0) {
    return (
      <p className="text-sm font-medium text-text-quaternary">{t('branchAccess.roster.empty')}</p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {people.map((entry) => (
        <label
          key={entry.userId}
          className={[
            'flex items-center gap-3 rounded-sm border border-border-subtle bg-white px-4 py-3',
            entry.allBranches ? 'cursor-default' : 'cursor-pointer hover:bg-primary-25',
          ].join(' ')}
        >
          <input
            type="checkbox"
            checked={entry.allBranches || current.includes(entry.userId)}
            disabled={entry.allBranches || saving}
            onChange={(event) => {
              setSaved(false)
              setFailure(null)
              setChosen(
                event.target.checked
                  ? [...current, entry.userId]
                  : current.filter((id) => id !== entry.userId),
              )
            }}
            className="size-[18px] shrink-0 accent-[#2c4eb7]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
              {entry.name}
              {entry.owner ? <OwnerPill /> : null}
            </span>
            <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
              {entry.allBranches
                ? t('branchAccess.roster.seesEveryBranch')
                : entry.otherBranchCount > 0
                  ? t('branchAccess.roster.alsoIn', { count: entry.otherBranchCount })
                  : t('branchAccess.roster.onlyHere')}
            </span>
          </span>
        </label>
      ))}
      {failure ? (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {failure}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm font-medium text-text-secondary">
          {t('branchAccess.roster.saved')}
        </p>
      ) : null}
      <div>
        <button type="button" className={SMALL_BUTTON} disabled={saving || !changed} onClick={save}>
          {saving ? t('branchAccess.saving') : t('branchAccess.roster.save')}
        </button>
      </div>
    </div>
  )
}
