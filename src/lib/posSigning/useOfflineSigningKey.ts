import { useEffect, useState } from 'react'
import type { PosTillDto } from '../../api/pos/pos'
import { peekEntitlements } from '../identity/entitlements'
import { ensureSigningKey, offlineSigningEnabled, type SigningKeyState } from './signingKey'

/**
 * Registers the cashier's offline signing key on each till load, for their own open shift only
 * (WEB-2). Every other state of the till leaves the key alone: a manager looking at someone else's
 * till must not register a key for a shift that is not theirs, and the server would refuse it.
 */
export function useOfflineSigningKey(
  till: Pick<PosTillDto, 'id' | 'openShift'>,
  userId: string | null,
  mine: boolean,
): SigningKeyState {
  const [state, setState] = useState<SigningKeyState>('off')
  const shiftId = mine ? (till.openShift?.shiftId ?? null) : null
  useEffect(() => {
    const tenantId = peekEntitlements()?.tenantId ?? null
    if (!offlineSigningEnabled() || !shiftId || !userId || !tenantId) return
    let active = true
    void ensureSigningKey({ shiftId, userId, tenantId }).then((next) => {
      if (active) setState(next)
    })
    return () => {
      active = false
    }
  }, [shiftId, userId])
  return state
}
