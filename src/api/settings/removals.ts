import { apiRequest } from '../client'
import { loadBranch, updateBranch, type BranchDetailDto } from './branches'
import { PEOPLE_PAGE_SIZE, type CompanyUser, type UserPage } from './people'

/**
 * Switching a person or a branch off, and back on (Business Rules US-2, US-3, BR-2, BR-4, LG-2;
 * decided 21 Oct 2026, option (a)).
 *
 * - **Off takes effect now.** The person cannot sign in (`DELETE /v1/users/{id}`); their name stays
 *   on everything they made and they are never deleted. The branch closes (saved closed): nobody
 *   works in it and nothing new is issued from it; its records stay in reports.
 * - **The paid place stays** until the next renewal, with no refund, and until then the server lets
 *   a new person or branch take it at no extra charge. The renewal bills only what is in use.
 * - **Back on**: `POST /v1/users/{id}/reactivate` (the person comes back with no role), or the
 *   branch saved open. Either takes a place on the plan like a new one.
 */
const userPath = (id: string) => `/v1/users/${encodeURIComponent(id)}`

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
