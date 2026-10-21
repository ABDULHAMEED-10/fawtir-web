import { apiRequest } from '../client'
import { branchPath, loadBranch, updateBranch, type BranchDetailDto } from './branches'
import { PEOPLE_PAGE_SIZE, type CompanyUser, type UserPage } from './people'

/**
 * Switching a person or a branch off (Business Rules US-2, US-3, BR-2, BR-4, LG-2).
 *
 * - **At the next renewal** (`ScheduledRemovalController`): the person keeps signing in and the
 *   branch stays open, both on the plan, until the renewal; nothing is refunded. It can be taken
 *   back before then. With no paid period running the server applies it at once and answers
 *   `APPLIED`.
 * - **Now** (`DELETE /v1/users/{id}`, a branch saved closed): for a leaver whose access must end
 *   today. The person cannot sign in, their name stays on everything they made, and they are never
 *   deleted; the paid place stays paid to the end of the period.
 * - **Back on**: `POST /v1/users/{id}/reactivate` (the person comes back with no role), or the
 *   branch saved open. Either takes a place on the plan like a new one.
 */
export type ScheduledRemovalStatus =
  'SCHEDULED' | 'WITHDRAWN' | 'APPLIED' | 'SUPERSEDED' | 'SKIPPED'

export type ScheduledRemovalDto = {
  id: string
  kind: 'USER' | 'BRANCH'
  subjectId: string
  /** The day the person is switched off or the branch closed. */
  effectiveOn: string
  status: ScheduledRemovalStatus
  scheduledBy: string
  scheduledAt: string
}

export type ScheduledRemovalsDto = {
  /** False while the server has not opened removal at the renewal: only "now" is offered. */
  open: boolean
  /** When a removal asked for now would happen; null when it would happen at once. */
  renewsOn: string | null
  /** Those still waiting. */
  removals: ScheduledRemovalDto[]
}

export const SCHEDULED_REMOVALS_PATH = '/v1/settings/scheduled-removals'

/**
 * Read as the server answers it, and as closed with nothing waiting when an answer lacks the
 * fields, so a missing list never reads as an open feature.
 */
export async function loadScheduledRemovals(): Promise<ScheduledRemovalsDto> {
  const body = await apiRequest<Partial<ScheduledRemovalsDto> | undefined>(SCHEDULED_REMOVALS_PATH)
  return {
    open: body?.open === true,
    renewsOn: body?.renewsOn ?? null,
    removals: Array.isArray(body?.removals) ? body.removals : [],
  }
}

/** The waiting removal of one person or branch, if any. */
export function waitingFor(
  removals: ScheduledRemovalsDto | null,
  subjectId: string,
): ScheduledRemovalDto | null {
  return (
    removals?.removals.find((r) => r.subjectId === subjectId && r.status === 'SCHEDULED') ?? null
  )
}

const userPath = (id: string) => `/v1/users/${encodeURIComponent(id)}`

export function scheduleUserRemoval(userId: string): Promise<ScheduledRemovalDto> {
  return apiRequest<ScheduledRemovalDto>(`${userPath(userId)}/scheduled-removal`, {
    method: 'POST',
  })
}

export function withdrawUserRemoval(userId: string): Promise<void> {
  return apiRequest<void>(`${userPath(userId)}/scheduled-removal`, { method: 'DELETE' })
}

export function switchOffUserNow(userId: string): Promise<void> {
  return apiRequest<void>(userPath(userId), { method: 'DELETE' })
}

export function switchUserBackOn(userId: string): Promise<CompanyUser> {
  return apiRequest<CompanyUser>(`${userPath(userId)}/reactivate`, { method: 'POST' })
}

/** The people switched off, listed only when asked for (`status=DEACTIVATED`, the Administrator's). */
export const SWITCHED_OFF_PEOPLE_PATH = `/v1/users?status=DEACTIVATED&page=0&size=${PEOPLE_PAGE_SIZE}`

export function loadSwitchedOffPeople(): Promise<UserPage> {
  return apiRequest<UserPage>(SWITCHED_OFF_PEOPLE_PATH)
}

export function scheduleBranchClosure(branchId: string): Promise<ScheduledRemovalDto> {
  return apiRequest<ScheduledRemovalDto>(`${branchPath(branchId)}/scheduled-closure`, {
    method: 'POST',
  })
}

export function withdrawBranchClosure(branchId: string): Promise<void> {
  return apiRequest<void>(`${branchPath(branchId)}/scheduled-closure`, { method: 'DELETE' })
}

/**
 * Saves the branch closed or open as it stands. The update is a whole-branch save guarded by its
 * version, so the branch is read first and only `active` changes.
 */
export async function setBranchOpen(branchId: string, open: boolean): Promise<BranchDetailDto> {
  const branch = await loadBranch(branchId)
  return updateBranch(
    branchId,
    {
      code: branch.code,
      name: branch.name,
      type: branch.type,
      address: branch.address,
      city: branch.city,
      state: branch.state,
      country: branch.country,
      postalCode: branch.postalCode,
      phone: branch.phone,
      email: branch.email,
    },
    open,
    branch.version,
  )
}
