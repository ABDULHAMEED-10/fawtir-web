import { apiRequest } from '../client'
import { withQuery } from '../query'
import { POS_PATH, POS_SHIFTS_PATH, POS_TILLS_PATH } from './pos'

/**
 * The offline sale binding routes of `fix/b39-off` cf145c092 (V530; BINDING-DESIGN §3, §8.4, §10.1).
 * Shapes are the backend records as written there; nothing here is inferred beyond them.
 */

/** The only algorithm the server accepts (`PosOfflineSigningKeyService.ALGORITHM`). */
export const OFFLINE_SIGNING_ALGORITHM = 'ES256-P1363'

export type OfflineKeyRegistration = {
  /** Lowercase UUID made once per browser profile. */
  deviceId: string
  /** Base64 (not base64url) SPKI DER of the P-256 public key: 91 bytes. */
  publicKey: string
  algorithm: typeof OFFLINE_SIGNING_ALGORITHM
  deviceTime: string
}

export type OfflineKeyRegistered = {
  keyId: string
  shiftId: string
  tillId: string
  registeredAt: string
  validUntil: string
  /** The first 32 hex characters of SHA-256 of the session id; the web cannot work it out itself. */
  sessionMarker: string
}

export function registerOfflineSigningKey(
  shiftId: string,
  body: OfflineKeyRegistration,
): Promise<OfflineKeyRegistered> {
  return apiRequest<OfflineKeyRegistered>(
    `${POS_SHIFTS_PATH}/${encodeURIComponent(shiftId)}/offline-signing-keys`,
    { method: 'POST', body },
  )
}

export type OfflineKeyRevoked = { keyId: string; revokedAt: string; filedSalesCount: number }

/**
 * No body: the route at cf145c092 takes none, although WEB-MANIFEST §2.2 names a `reason`. Sending one
 * the server does not read would look as if it were kept (WEB.md Addendum 7, backend asks).
 */
export function revokeOfflineSigningKey(keyId: string): Promise<OfflineKeyRevoked> {
  return apiRequest<OfflineKeyRevoked>(
    `${POS_PATH}/offline-signing-keys/${encodeURIComponent(keyId)}/revoke`,
    { method: 'POST' },
  )
}

export type HoldStatus = 'OPEN' | 'RESOLVED'

/**
 * A Cashier with `pos.close` OWN gets only `holdId`, `saleId`, `invoiceNumber`, `soldAt`, `receivedAt`
 * and `status`; every other member is null for them (L-5).
 */
export type OfflineHoldSummary = {
  holdId: string
  saleId: string
  invoiceNumber: string
  soldAt: string
  receivedAt: string
  status: HoldStatus
  tillId: string | null
  shiftId: string | null
  filedByUserId: string | null
  filedByName: string | null
  reason: string | null
  manualDiscount: boolean | null
  serverTotal: number | null
}

export type OfflineHoldDetail = {
  summary: OfflineHoldSummary
  outcome: 'ABSENT' | 'INVALID' | string
  revocationSource: 'KEY' | 'SESSION' | 'USER' | null
  presentedKeyId: string | null
  presentedDeviceId: string | null
  keyRegisteredAt: string | null
  keyValidUntil: string | null
  requestHash: string | null
  /** The signed envelope as JSON; null when none was presented or it was withheld. */
  payload: unknown
  payloadSha256: string | null
  payloadWithheld: 'CARD_NUMBER' | string | null
  signatureSha256: string | null
  discountPercentMax: number | null
  printedTotal: number | null
  serverTotal: number | null
}

export type OfflineHoldCandidate = {
  shiftId: string
  cashierUserId: string
  cashierName: string | null
  status: string
  openedAt: string
  endedAt: string | null
}

export type HoldDecision = 'ATTRIBUTE' | 'KEEP_UNATTRIBUTED'

export type HoldResolution = {
  holdId: string
  decision: HoldDecision
  shiftId: string | null
  cashierUserId: string | null
  discountAboveLimit: boolean
  limitQualifier: string | null
  resolvedBy: string
  resolvedAt: string
  replayed: boolean
}

export type LegacyOfflineSale = {
  saleId: string
  tillId: string
  invoiceNumber: string
  filedByUserId: string
  filedByName: string | null
  soldAt: string
  receivedAt: string
  total: number
}

/**
 * `GET /pos/tills/{tillId}/offline-signing-keys` (fix/b39-off cf49f0447): the till's active keys, at
 * most 100. A manager of the till gets every key, anyone else only their own. No public key, device
 * or cashier name: what a revoker needs to pick the key and nothing more.
 */
export type ActiveOfflineKey = {
  keyId: string
  tillId: string
  cashierUserId: string
  registeredAt: string
  validUntil: string
}

export function tillOfflineKeysPath(tillId: string): string {
  return `${POS_TILLS_PATH}/${encodeURIComponent(tillId)}/offline-signing-keys`
}

export const OFFLINE_HOLDS_PATH = `${POS_PATH}/offline-attribution-holds`
export const OFFLINE_LEGACY_SALES_PATH = `${POS_PATH}/offline-legacy-sales`

export function offlineHoldsPath(branchId: string, status: HoldStatus | null): string {
  return withQuery(OFFLINE_HOLDS_PATH, { branchId, status: status ?? undefined })
}

export function offlineHoldPath(holdId: string): string {
  return `${OFFLINE_HOLDS_PATH}/${encodeURIComponent(holdId)}`
}

export function offlineHoldCandidatesPath(holdId: string): string {
  return `${offlineHoldPath(holdId)}/candidates`
}

export function resolveOfflineHold(
  holdId: string,
  body: { decision: HoldDecision; shiftId?: string; reason: string },
): Promise<HoldResolution> {
  return apiRequest<HoldResolution>(`${offlineHoldPath(holdId)}/resolve`, { method: 'POST', body })
}

/** `from`/`to` are instants; the server refuses a range over 92 days (`POS_LEGACY_RANGE_INVALID`). */
export function legacySalesPath(branchId: string, from: string, to: string): string {
  return withQuery(OFFLINE_LEGACY_SALES_PATH, { branchId, from, to })
}
