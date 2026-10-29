import { useCallback } from 'react'
import { useApiRead } from '../hooks'
import { useEntitlements } from '../hooks/useEntitlements'
import { useWorkingBranch } from '../components/branch/useWorkingBranch'
import { hasPermission } from './identity/entitlements'
import { loadPosTills, posTillsPath, type PosTillDto } from '../api/pos/pos'

/**
 * The till this device is, in the branch chosen in the sidebar (P.11; the branch is never picked
 * on a till screen). A device remembers its till per branch; until it has one it takes the
 * branch's first till in use. Who is on it is the signed-in person: the server opens their shift
 * on their first sale and ends another cashier's open shift uncounted (a handover), so there is
 * no cashier picker (round 2, answer 11). Switching user is signing out and in.
 */

const tillKey = (branchId: string) => `fawtir.pos.till.${branchId}`

export function rememberedTill(branchId: string): string | null {
  try {
    return window.localStorage.getItem(tillKey(branchId))
  } catch {
    return null
  }
}

export function rememberTill(branchId: string, tillId: string) {
  try {
    window.localStorage.setItem(tillKey(branchId), tillId)
  } catch {
    // Without storage the device takes the branch's first till each time.
  }
}

export function chooseTill(tills: PosTillDto[], remembered: string | null): PosTillDto | null {
  const active = tills.filter((till) => till.status === 'ACTIVE')
  return (
    active.find((till) => till.id === remembered) ??
    [...active].sort((a, b) => a.number - b.number)[0] ??
    null
  )
}

export type TillState =
  | { status: 'loading' }
  | { status: 'noBranch' }
  | { status: 'failed'; error: unknown; retry: () => void }
  | { status: 'noTill'; canRegister: boolean; branchId: string; retry: () => void }
  | {
      status: 'ready'
      till: PosTillDto
      branchId: string
      branchName: string | null
      /** The signed-in person. */
      userId: string | null
      /** Their shift is the till's open one. */
      mine: boolean
      can: { sell: boolean; close: boolean; refund: boolean }
      retry: () => void
    }

export function usePosTill(): TillState {
  const { branch, name, read: branchesRead } = useWorkingBranch()
  const { entitlements } = useEntitlements()
  const branchId = branch?.id ?? null
  const tills = useApiRead<PosTillDto[]>(branchId ? posTillsPath(branchId) : null, () =>
    loadPosTills(branchId as string),
  )
  const retry = useCallback(() => tills.retry(), [tills])

  if (!branchId) {
    return branchesRead.status === 'loading' ? { status: 'loading' } : { status: 'noBranch' }
  }
  if (tills.read.status === 'loading') return { status: 'loading' }
  if (tills.read.status === 'failed') return { status: 'failed', error: tills.read.error, retry }
  const till = chooseTill(tills.read.data, rememberedTill(branchId))
  const can = (code: string) => (entitlements ? hasPermission(entitlements, code) : false)
  if (!till) {
    return { status: 'noTill', canRegister: can('pos.till.manage'), branchId, retry }
  }
  const userId = entitlements?.userId ?? null
  return {
    status: 'ready',
    till,
    branchId,
    branchName: name,
    userId,
    mine: !!userId && till.openShift?.cashier.userId === userId,
    can: { sell: can('pos.sell'), close: can('pos.close'), refund: can('pos.refund') },
    retry,
  }
}

/** Two letters for the round badge: "Nasser Al Habsi" is NA. */
export function initialsOf(name: string): string {
  const parts = name.replace(/[._]/g, ' ').trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}
