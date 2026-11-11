import { useCallback, useEffect, useRef } from 'react'
import { useApiRead } from '../hooks'
import { NetworkError, sharedRequest } from '../api'
import { loadOrRecall, recallOffline } from './posOffline'
import { useEntitlements } from '../hooks/useEntitlements'
import { useWorkingBranch } from '../components/branch/useWorkingBranch'
import { hasPermission } from './identity/entitlements'
import {
  loadPosTill,
  loadPosTills,
  POS_TILLS_PATH,
  posTillsPath,
  type PosQrProfile,
  type PosTillDto,
} from '../api/pos/pos'

/**
 * The till this device is, in the branch chosen in the sidebar (P.11; the branch is never picked
 * on a till screen). A device remembers its till per branch; until it has one it takes the
 * branch's first till in use. Who is on it is the signed-in person: the server opens their shift
 * on their first sale and ends another cashier's open shift uncounted (a handover), so there is
 * no cashier picker (round 2, answer 11). Switching user is signing out and in.
 */

const tillKey = (branchId: string) => `fawtir.pos.till.${branchId}`
/** The branch's tills as last read, for the till's offline screens (`lib/posOffline`). */
const tillsName = (branchId: string) => `tills.${branchId}`

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
      /** Their sign-in name, for a queued sale they make; absent where a test builds the state. */
      userName?: string | null
      /** Optional for older fixtures; a held sale is keyed by it (RBW2-1). */
      tenantId?: string | null
      /** Their shift is the till's open one. */
      mine: boolean
      can: {
        sell: boolean
        close: boolean
        refund: boolean
        manage: boolean
        /** Paying cash out of the drawer (backend cb9898ac3, FIN-M3); paying in stays with `close`. */
        payOut: boolean
        /** Linking a supplier paid-out to the bill it pays: the server asks it on top of `payOut`. */
        billSettle: boolean
      }
      retry: () => void
    }

export function usePosTill(): TillState {
  const { branch, name, read: branchesRead } = useWorkingBranch()
  const { entitlements } = useEntitlements()
  const branchId = branch?.id ?? null
  const tills = useApiRead<PosTillDto[]>(branchId ? posTillsPath(branchId) : null, () =>
    loadOrRecall(tillsName(branchId as string), () => loadPosTills(branchId as string)),
  )
  const retry = useCallback(() => tills.retry(), [tills])
  // The till as last read, kept while it is read again (after a sale, a close): the screen keeps
  // what it was showing instead of a loading notice in between, and so keeps its own state.
  const last = useRef<{ branchId: string; tills: PosTillDto[] } | null>(null)
  useEffect(() => {
    if (branchId && tills.read.status === 'ready')
      last.current = { branchId, tills: tills.read.data }
  }, [branchId, tills.read])

  if (!branchId) {
    return branchesRead.status === 'loading' ? { status: 'loading' } : { status: 'noBranch' }
  }
  const held =
    last.current?.branchId === branchId
      ? last.current.tills
      : recallOffline<PosTillDto[]>(tillsName(branchId))
  let list: PosTillDto[]
  if (tills.read.status === 'ready') list = tills.read.data
  else if (tills.read.status === 'loading') {
    if (!held || last.current?.branchId !== branchId) return { status: 'loading' }
    list = held
  } else if (tills.read.error instanceof NetworkError && held) list = held
  else return { status: 'failed', error: tills.read.error, retry }
  const till = chooseTill(list, rememberedTill(branchId))
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
    userName: entitlements?.username ?? null,
    // Keys a held sale with its till (posSale, RBW2-1): one tab may sign in to another company.
    tenantId: entitlements?.tenantId ?? null,
    mine: !!userId && till.openShift?.cashier.userId === userId,
    can: {
      sell: can('pos.sell'),
      close: can('pos.close'),
      refund: can('pos.refund'),
      manage: can('pos.till.manage'),
      payOut: can('pos.cash.pay_out'),
      billSettle: can('bill.settle'),
    },
    retry,
  }
}

/**
 * QR E-1: the till's `qrProfile`, which only `GET /pos/tills/{id}` carries. Kept with the till's
 * other offline copies (`lib/posOffline`), read again whenever the screen opens online, as they
 * are; a stale `profileVersion` is the server's to audit. The read starts when the screen opens.
 *
 * A promise, awaited when the sale is finished, not a value read at render: a cashier who finishes
 * before the read has settled would otherwise sell with no profile, and a consumer sale queued
 * offline would be refused for want of a QR the till could make (review QW4R-9: the cause of the
 * intermittent posTillFixes failure). Null when there is none to use.
 */
export function useTillQrProfile(tillId: string): () => Promise<PosQrProfile | null> {
  const read = useRef<{ tillId: string; profile: Promise<PosQrProfile | null> } | null>(null)
  const profileNow = useCallback(() => {
    if (read.current?.tillId !== tillId) {
      const profile = sharedRequest(`${POS_TILLS_PATH}/${encodeURIComponent(tillId)}#qrProfile`, () =>
        loadOrRecall(`till.${tillId}`, () => loadPosTill(tillId)),
      ).then(
        (detail) => {
          const stated = (detail as Partial<PosTillDto> | null)?.qrProfile
          return stated && typeof stated === 'object' ? stated : null
        },
        () => null,
      )
      read.current = { tillId, profile }
    }
    return read.current.profile
  }, [tillId])
  useEffect(() => {
    void profileNow()
  }, [profileNow])
  return profileNow
}

/** Two letters for the round badge: "Nasser Al Habsi" is NA. */
export function initialsOf(name: string): string {
  const parts = name.replace(/[._]/g, ' ').trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}
