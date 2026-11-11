import type { PosConsumer } from '../api/pos/pos'

/**
 * What an offline till keeps on the device besides the queue itself: the buyer named on a full
 * invoice (their civil ID or passport number is personal data) and the bank slip photos waiting
 * for their sale to be filed. Both live in IndexedDB, never in localStorage, and both are removed
 * as soon as the server has them.
 *
 * The buyer is sealed with AES-GCM under a key made on this device as non-extractable
 * (`extractable: false`), kept in the same database and deleted once no sealed buyer is left. That
 * keeps the raw ID out of plain-text storage, browser storage exports and anything that dumps
 * localStorage; it does not hide it from a script running on this site, which could also read it
 * as it is typed. sessionStorage was not used: closing the tab would lose the ID of a sale that
 * has already been numbered and must still be filed.
 *
 * Without IndexedDB (or Web Crypto) nothing is sealed: the queue keeps the buyer in its own entry
 * as before, so a numbered sale is never lost, and a slip photo is kept for this tab only.
 */

export type VaultStore = 'keys' | 'pii' | 'slips'

export type PosVault = {
  /** True when what is put here survives a reload (IndexedDB). */
  durable: boolean
  get<T>(store: VaultStore, id: string): Promise<T | undefined>
  put(store: VaultStore, id: string, value: unknown): Promise<void>
  delete(store: VaultStore, id: string): Promise<void>
  ids(store: VaultStore): Promise<string[]>
}

const STORES: VaultStore[] = ['keys', 'pii', 'slips']

/** Kept in memory: for a browser without IndexedDB, and for tests (`durable` as they need). */
export function memoryVault(durable = false): PosVault {
  const maps = new Map<VaultStore, Map<string, unknown>>(STORES.map((s) => [s, new Map()]))
  const of = (store: VaultStore) => maps.get(store)!
  return {
    durable,
    get: async <T>(store: VaultStore, id: string) => of(store).get(id) as T | undefined,
    put: async (store, id, value) => void of(store).set(id, value),
    delete: async (store, id) => void of(store).delete(id),
    ids: async (store) => [...of(store).keys()],
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function indexedDbVault(): Promise<PosVault> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('fawtir.pos', 1)
    open.onupgradeneeded = () => {
      for (const store of STORES) {
        if (!open.result.objectStoreNames.contains(store)) open.result.createObjectStore(store)
      }
    }
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const run = <T>(
        store: VaultStore,
        mode: IDBTransactionMode,
        act: (s: IDBObjectStore) => IDBRequest<T>,
      ) => request(act(db.transaction(store, mode).objectStore(store)))
      resolve({
        durable: true,
        get: <T>(store: VaultStore, id: string) =>
          run(store, 'readonly', (s) => s.get(id)) as Promise<T | undefined>,
        put: async (store, id, value) =>
          void (await run(store, 'readwrite', (s) => s.put(value, id))),
        delete: async (store, id) => void (await run(store, 'readwrite', (s) => s.delete(id))),
        ids: async (store) =>
          (await run(store, 'readonly', (s) => s.getAllKeys())).map((key) => String(key)),
      })
    }
  })
}

let vault: Promise<PosVault> | null = null

export function posVault(): Promise<PosVault> {
  if (!vault) {
    vault =
      typeof indexedDB === 'undefined'
        ? Promise.resolve(memoryVault())
        : indexedDbVault().catch(() => memoryVault())
  }
  return vault
}

/** For tests: a fresh vault, durable or not. */
export function setPosVault(next: PosVault | null) {
  vault = next ? Promise.resolve(next) : null
}

/* ----------------------------------------------------------------- the buyer */

type Sealed = { iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer }

const KEY_ID = 'buyer'

function subtle(): SubtleCrypto | null {
  return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null
}

async function vaultKey(store: PosVault, keyId: string, create: boolean): Promise<CryptoKey | null> {
  const kept = await store.get<CryptoKey>('keys', keyId)
  if (kept || !create) return kept ?? null
  const made = await subtle()!.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  await store.put('keys', keyId, made)
  return made
}

const buyerKey = (store: PosVault, create: boolean) => vaultKey(store, KEY_ID, create)

/** Seals the buyer of a queued sale; false when this device cannot, and the queue keeps it. */
export async function sealBuyer(saleKey: string, consumer: PosConsumer): Promise<boolean> {
  try {
    const store = await posVault()
    const webCrypto = subtle()
    if (!store.durable || !webCrypto) return false
    const key = await buyerKey(store, true)
    if (!key) return false
    const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
    const data = await webCrypto.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(consumer)),
    )
    await store.put('pii', saleKey, { iv, data } satisfies Sealed)
    return true
  } catch {
    return false
  }
}

/** The sealed buyer, for the moment the sale is sent; null when it is gone. */
export async function openBuyer(saleKey: string): Promise<PosConsumer | null> {
  try {
    const store = await posVault()
    const sealed = await store.get<Sealed>('pii', saleKey)
    const key = sealed ? await buyerKey(store, false) : null
    if (!sealed || !key) return null
    const plain = await subtle()!.decrypt({ name: 'AES-GCM', iv: sealed.iv }, key, sealed.data)
    return JSON.parse(new TextDecoder().decode(plain)) as PosConsumer
  } catch {
    return null
  }
}

/* ------------------------------------------------------------ a held sale */

/** A sealed value as text, for sessionStorage. */
export type SealedText = { iv: string; data: string }

/*
 * A sale held with an unknown outcome (E-01) keeps its request in sessionStorage so a reload still
 * sends exactly it again; its buyer, contact, card and slip details and the people's names are
 * personal data, so they are sealed as the queue's buyer is (review RBW2-2). A key of its own, so
 * forgetting the last queued buyer never takes it. Only a durable vault can seal: a key lost on
 * reload could open nothing, and the caller then keeps the lock alone.
 */
const HELD_KEY_ID = 'heldSale'

// A loop, not a spread: a long request would overflow the argument list.
const toBase64 = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0)) as Uint8Array<ArrayBuffer>

/** Seals a held sale's details; null when this device cannot. */
export async function sealHeld(value: unknown): Promise<SealedText | null> {
  try {
    const store = await posVault()
    const webCrypto = subtle()
    if (!store.durable || !webCrypto) return null
    const key = await vaultKey(store, HELD_KEY_ID, true)
    if (!key) return null
    const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
    const data = await webCrypto.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    )
    return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
  } catch {
    return null
  }
}

/** The held sale's details as sealed; null when they cannot be opened on this device. */
export async function openHeld<T>(sealed: SealedText): Promise<T | null> {
  try {
    const store = await posVault()
    const key = await vaultKey(store, HELD_KEY_ID, false)
    if (!key) return null
    const plain = await subtle()!.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
      key,
      fromBase64(sealed.data),
    )
    return JSON.parse(new TextDecoder().decode(plain)) as T
  } catch {
    return null
  }
}

/** Removes the buyer once the sale is sent or finally refused; the key goes with the last one. */
export async function forgetBuyer(saleKey: string): Promise<void> {
  try {
    const store = await posVault()
    await store.delete('pii', saleKey)
    if ((await store.ids('pii')).length === 0) await store.delete('keys', KEY_ID)
  } catch {
    // Nothing kept, nothing to remove.
  }
}
