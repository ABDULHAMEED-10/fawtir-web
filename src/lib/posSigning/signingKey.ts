import { ApiError } from '../../api'
import {
  OFFLINE_SIGNING_ALGORITHM,
  registerOfflineSigningKey,
} from '../../api/pos/offlineBinding'
import type { PosSaleRequest } from '../../api/pos/pos'
import { peekEntitlements } from '../identity/entitlements'
import { posVault, type PosVault } from '../posVault'
import { bodyForSigning, canonicalSale, offlineSaleMessage } from './canonical'

/**
 * The till's offline signing key (BINDING-DESIGN §3; owner approvals b39, M-6). A sale queued while
 * offline is signed by the cashier's own key, registered for their open shift in their live session,
 * so the server can tell who sold it once it arrives.
 *
 * The private key is made here by Web Crypto as ECDSA P-256 with `extractable: false` and only its
 * public half is sent, through the authenticated registration route. Non-extractable is not
 * encryption at rest: the key lives in this browser profile's IndexedDB, and anyone with the profile
 * on this device can use it while it is valid. Nor does it stop JavaScript running on this origin
 * from asking the browser to sign with it; that is why signing is off unless the build says the
 * origin enforces the content policy (`VITE_POS_OFFLINE_SIGNING`, WEB-12 gate, WEB.md Addendum 7).
 *
 * What it buys: the key cannot be copied off the device, it dies with the session (`validUntil` is
 * the session's hard expiry, and the server refuses a proof from a revoked or ended session), and a
 * lost device's key can be revoked by a manager. A key that is lost (profile cleared, another browser)
 * only means later queued sales go unsigned: they are filed and held for a manager's review, never
 * refused at the till.
 */

/** Off by default; set to `on` only in builds for an origin confirmed to send the enforcing CSP. */
export function offlineSigningEnabled(): boolean {
  return import.meta.env.VITE_POS_OFFLINE_SIGNING === 'on'
}

export type StoredSigningKey = {
  privateKey: CryptoKey
  keyId: string
  shiftId: string
  tillId: string
  sessionMarker: string
  validUntil: string
  cashierUserId: string
  tenantId: string
  deviceId: string
}

const DEVICE_ID = 'device'
const SIGN_PREFIX = 'sign:'
const signId = (shiftId: string, marker: string) => `${SIGN_PREFIX}${shiftId}:${marker}`

function subtle(): SubtleCrypto | null {
  return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null
}

/** One per browser profile, never derived from the session. */
export async function deviceId(store?: PosVault): Promise<string> {
  const vault = store ?? (await posVault())
  const kept = await vault.get<string>('keys', DEVICE_ID)
  if (typeof kept === 'string' && kept) return kept
  const made = crypto.randomUUID().toLowerCase()
  await vault.put('keys', DEVICE_ID, made)
  return made
}

async function storedKeys(vault: PosVault): Promise<{ id: string; key: StoredSigningKey }[]> {
  const out: { id: string; key: StoredSigningKey }[] = []
  for (const id of await vault.ids('keys')) {
    if (!id.startsWith(SIGN_PREFIX)) continue
    const key = await vault.get<StoredSigningKey>('keys', id)
    if (key) out.push({ id, key })
  }
  return out
}

function usable(key: StoredSigningKey, now: number): boolean {
  const until = Date.parse(key.validUntil)
  return Number.isFinite(until) && until > now
}

/**
 * Deletes every signing key, on sign-out, sign-in and a session found ended (WEB-5). The device id
 * stays: it names the browser, not the person. The queue is never touched here: a sale already
 * printed is filed whatever happens to the key.
 */
export async function forgetSigningKeys(): Promise<void> {
  // What the last session was told belongs to that session: a support session's 403 must not
  // keep the next cashier signed in on this page from signing (WSR-12). A 404 is asked again too;
  // it costs one request on an old server.
  resetSigningKeyState()
  try {
    const vault = await posVault()
    for (const { id } of await storedKeys(vault)) await vault.delete('keys', id)
  } catch {
    // No vault, no key.
  }
}

/** Keys past their session, or of another person or tenant than the one signed in now. */
async function forgetStale(vault: PosVault, userId: string, tenantId: string) {
  const now = Date.now()
  for (const { id, key } of await storedKeys(vault)) {
    if (!usable(key, now) || key.cashierUserId !== userId || key.tenantId !== tenantId) {
      await vault.delete('keys', id)
    }
  }
}

async function keyFor(
  vault: PosVault,
  shiftId: string,
  userId: string,
  tenantId: string,
): Promise<StoredSigningKey | null> {
  const now = Date.now()
  const mine = (await storedKeys(vault))
    .map(({ key }) => key)
    .filter(
      (key) =>
        key.shiftId === shiftId &&
        key.cashierUserId === userId &&
        key.tenantId === tenantId &&
        usable(key, now),
    )
  return mine[0] ?? null
}

/**
 * What registering left the till with. `oldServer` (404) and `refused` (400, 403) hold for the rest
 * of this page: the route will not appear, and a key the server called invalid or a credential it
 * will not bind will not change by asking again. The two 409s are tried again on the next till load
 * and never switch signing off (WEB-MANIFEST §2.1).
 */
export type SigningKeyState =
  | 'off'
  | 'ready'
  | 'oldServer'
  | 'refused'
  | 'clockSkew'
  | 'notYourShift'
  | 'retry'

let oldServer = false
let refused = false
const registrations = new Map<string, Promise<SigningKeyState>>()

/** For tests. */
export function resetSigningKeyState() {
  oldServer = false
  refused = false
  registrations.clear()
}

function base64(bytes: ArrayBuffer): string {
  let text = ''
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte)
  return btoa(text)
}

function base64url(bytes: ArrayBuffer): string {
  return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Makes sure the signed-in cashier has a valid key for their open shift, registering one when not.
 * Called on each till load for the shift's own cashier only; a registered key is kept until its
 * session ends, so a reload while offline still signs.
 */
export function ensureSigningKey(facts: {
  shiftId: string
  userId: string
  tenantId: string
}): Promise<SigningKeyState> {
  if (!offlineSigningEnabled() || !subtle()) return Promise.resolve('off')
  if (oldServer) return Promise.resolve('oldServer')
  if (refused) return Promise.resolve('refused')
  const lower = {
    shiftId: facts.shiftId.toLowerCase(),
    userId: facts.userId.toLowerCase(),
    tenantId: facts.tenantId.toLowerCase(),
  }
  const id = `${lower.tenantId}:${lower.userId}:${lower.shiftId}`
  const running = registrations.get(id)
  if (running) return running
  const attempt = register(lower)
    .catch((): SigningKeyState => 'retry')
    .finally(() => registrations.delete(id))
  registrations.set(id, attempt)
  return attempt
}

async function register(facts: {
  shiftId: string
  userId: string
  tenantId: string
}): Promise<SigningKeyState> {
  const vault = await posVault()
  await forgetStale(vault, facts.userId, facts.tenantId)
  if (await keyFor(vault, facts.shiftId, facts.userId, facts.tenantId)) return 'ready'
  const pair = await subtle()!.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const device = await deviceId(vault)
  let registered
  try {
    registered = await registerOfflineSigningKey(facts.shiftId, {
      deviceId: device,
      publicKey: base64(await subtle()!.exportKey('spki', pair.publicKey)),
      algorithm: OFFLINE_SIGNING_ALGORITHM,
      deviceTime: new Date().toISOString(),
    })
  } catch (error) {
    if (!(error instanceof ApiError)) return 'retry'
    if (error.status === 404) {
      oldServer = true
      return 'oldServer'
    }
    if (error.code === 'POS_OFFLINE_KEY_CLOCK_SKEW') return 'clockSkew'
    if (error.code === 'POS_OFFLINE_KEY_NOT_YOUR_OPEN_SHIFT') return 'notYourShift'
    if (error.status === 400 || error.status === 403) {
      refused = true
      return 'refused'
    }
    return 'retry'
  }
  // The server's answer, not what was asked for: the key is bound to what the server registered.
  if (registered.shiftId.toLowerCase() !== facts.shiftId.toLowerCase()) return 'retry'
  // One key per shift and session on the server (M-3a): a key here under another marker belongs to
  // a session that registered before this one, and the server has replaced it.
  for (const { id, key } of await storedKeys(vault)) {
    if (key.shiftId === facts.shiftId && key.sessionMarker !== registered.sessionMarker) {
      await vault.delete('keys', id)
    }
  }
  await vault.put('keys', signId(facts.shiftId, registered.sessionMarker), {
    privateKey: pair.privateKey,
    keyId: registered.keyId.toLowerCase(),
    shiftId: facts.shiftId,
    tillId: registered.tillId.toLowerCase(),
    sessionMarker: registered.sessionMarker,
    validUntil: registered.validUntil,
    cashierUserId: facts.userId,
    tenantId: facts.tenantId,
    deviceId: device,
  } satisfies StoredSigningKey)
  return 'ready'
}

export type OfflineProof = { keyId: string; signature: string }

/**
 * Signs a sale about to be queued, or gives null and the sale is queued unsigned: no key, an expired
 * one, signing switched off, a body that cannot be put in canonical form, or Web Crypto failing. An
 * unsigned sale is still printed and filed; the server holds it for review (owner M-6: capable tills
 * sign, older tills stay compatible). `body` is returned in the normalised form that was signed, and
 * that is the body to send.
 */
export async function signQueuedSale(
  body: PosSaleRequest,
  idempotencyKey: string,
  shift: { shiftId: string; cashierUserId: string } | null,
): Promise<{ body: PosSaleRequest; offlineProof: OfflineProof } | null> {
  if (!offlineSigningEnabled() || oldServer || !shift) return null
  const webCrypto = subtle()
  const session = peekEntitlements()
  if (!webCrypto || !session) return null
  const userId = session.userId.toLowerCase()
  const tenantId = session.tenantId.toLowerCase()
  // Only the shift's own cashier signs; the server would reject anyone else's proof anyway.
  if (shift.cashierUserId.toLowerCase() !== userId) return null
  try {
    const vault = await posVault()
    const key = await keyFor(vault, shift.shiftId.toLowerCase(), userId, tenantId)
    if (!key || key.tillId !== body.tillId.toLowerCase()) return null
    const normal = bodyForSigning(body)
    const message = offlineSaleMessage(
      {
        tenantId: key.tenantId,
        deviceId: key.deviceId,
        keyId: key.keyId,
        cashierUserId: key.cashierUserId,
        shiftId: key.shiftId,
        idempotencyKey,
      },
      canonicalSale(normal),
    )
    const signature = await webCrypto.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key.privateKey,
      message as Uint8Array<ArrayBuffer>,
    )
    return { body: normal, offlineProof: { keyId: key.keyId, signature: base64url(signature) } }
  } catch {
    // Unsignable (a lone surrogate, sub-millisecond soldAt) or Web Crypto failing: the sale is
    // queued unsigned rather than refused. Nothing is logged: the body and key are the evidence.
    return null
  }
}
