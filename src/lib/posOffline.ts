import { NetworkError } from '../api'
import { peekEntitlements } from './identity/entitlements'

/**
 * What the till needs to keep selling when the connection drops between two screens (E2E
 * 29 Oct 2026, F-4): the branch it works in, its till and the shelf. Every till screen reads them
 * again as it opens, and offline each of those reads fails; without a copy the till could queue
 * one sale (only if the payment screen was already open) and then showed "Pick a branch".
 *
 * So the last answer to each of those reads is kept on this device, per signed-in person and
 * company, and handed back only when the read cannot reach the server (`NetworkError`). A refusal
 * (`ApiError`) is never covered up: it is the server's answer and the screen shows it. This is a
 * per-viewer convenience in `localStorage`, the same as the offline queue itself; nothing is decided
 * from it that the server does not check again when the sale is sent.
 */

const PREFIX = 'fawtir.pos.offline'

/** The signed-in person's own shelf of copies: another person on this device never reads them. */
function scope(): string | null {
  const who = peekEntitlements()
  return who ? `${who.tenantId}.${who.userId}` : null
}

function storageKey(name: string): string | null {
  const owner = scope()
  return owner ? `${PREFIX}.${owner}.${name}` : null
}

export function rememberOffline(name: string, value: unknown): void {
  const key = storageKey(name)
  if (!key) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the till still works online.
  }
}

export function recallOffline<T>(name: string): T | null {
  const key = storageKey(name)
  if (!key) return null
  try {
    const text = window.localStorage.getItem(key)
    return text ? (JSON.parse(text) as T) : null
  } catch {
    return null
  }
}

/**
 * Loads `name` from the server and keeps a copy; when the server cannot be reached, answers the copy
 * instead (or fails as before when there is none).
 */
export async function loadOrRecall<T>(name: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load()
    rememberOffline(name, value)
    return value
  } catch (error) {
    if (error instanceof NetworkError) {
      const kept = recallOffline<T>(name)
      if (kept !== null) return kept
    }
    throw error
  }
}
