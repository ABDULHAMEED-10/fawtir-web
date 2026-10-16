import { ApiError, NetworkError } from '../../api'
import type { ApiKeySummaryDto } from '../../api/settings/apiKeys'
import { isSubscriptionRestricted } from '../subscriptionRestricted'

/**
 * How a refused key action reads on the API push screen.
 *
 * Decided on the status and the problem `type` slug the server sends, never on the message, which
 * is English prose for developers. Anything not recognised is `other` and is rendered with the
 * shared failure text.
 */
export type ApiKeyRefusal =
  /** 403 `erp-entitlement-required`: ERP is not enabled for the organisation. */
  | 'erpNotEnabled'
  /** 409 `plan-limit-reached`: the plan does not include API access. */
  | 'noApiAccess'
  /** 403 for any other reason: the user lacks the permission. */
  | 'forbidden'
  /** 409 otherwise: the key was already rotated or revoked meanwhile. */
  | 'conflict'
  | 'notFound'
  /** 400: a value the server refused, the expiry above all. */
  | 'invalid'
  | 'unreachable'
  | 'other'

export function classifyApiKeyFailure(error: unknown): ApiKeyRefusal {
  if (error instanceof NetworkError) return 'unreachable'
  if (!(error instanceof ApiError)) return 'other'
  if (error.status === 403) {
    if (error.problemType === 'erp-entitlement-required') return 'erpNotEnabled'
    return error.problemType === 'csrf-rejected' ? 'other' : 'forbidden'
  }
  // A read-only subscription is a 409 too, but not a key that moved: the shared sentence says why.
  if (isSubscriptionRestricted(error)) return 'other'
  if (error.status === 409) {
    return error.problemType === 'plan-limit-reached' ? 'noApiAccess' : 'conflict'
  }
  if (error.status === 404) return 'notFound'
  if (error.status === 400) return 'invalid'
  return 'other'
}

/**
 * The keys this screen manages. A GENERAL key is a different product (the organisation's general
 * API access) and is administered elsewhere; it is not shown here, so nothing on this screen can
 * rotate or revoke one by mistake.
 */
export function erpIngestionKeys(keys: readonly ApiKeySummaryDto[]): ApiKeySummaryDto[] {
  return keys.filter((key) => key.profile === 'ERP_INGESTION')
}

/** Under this, "recently" is all the server's once-a-minute record can honestly say. */
const RECENT_MS = 5 * 60_000

/**
 * Last use, worded for a value the server records about once a minute. Never "just now" and never
 * a time to the second: the value can trail real use, so the screen says no more than it knows.
 */
export function lastUsedPhrase(
  lastUsedAt: string | null,
  now: number,
  language: string,
): {
  key: 'erp.apiPush.lastUsed.never' | 'erp.apiPush.lastUsed.recently' | 'erp.apiPush.lastUsed.about'
  when?: string
} {
  if (lastUsedAt === null) return { key: 'erp.apiPush.lastUsed.never' }
  const at = Date.parse(lastUsedAt)
  if (!Number.isFinite(at)) return { key: 'erp.apiPush.lastUsed.never' }
  const age = Math.max(0, now - at)
  if (age < RECENT_MS) return { key: 'erp.apiPush.lastUsed.recently' }
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  const minutes = Math.round(age / 60_000)
  if (minutes < 60)
    return { key: 'erp.apiPush.lastUsed.about', when: format.format(-minutes, 'minute') }
  const hours = Math.round(minutes / 60)
  if (hours < 48) return { key: 'erp.apiPush.lastUsed.about', when: format.format(-hours, 'hour') }
  return { key: 'erp.apiPush.lastUsed.about', when: format.format(-Math.round(hours / 24), 'day') }
}

/** The server's ceiling for an ERP ingestion key (`erp-ingestion-maximum-expiry`). */
export const ERP_KEY_MAX_DAYS = 730
/** What the server applies when no expiry is sent (`erp-ingestion-default-expiry`). */
export const ERP_KEY_DEFAULT_DAYS = 365

const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10)

/**
 * The days the expiry picker offers, in UTC because the day is sent as its UTC start: from
 * tomorrow, so the key is born valid, to the 730th day, which the server still accepts at any
 * time of day. The server checks both again; this only keeps the picker from offering a day it
 * would refuse.
 */
export function expiryBounds(now: number): { min: string; max: string } {
  const day = 24 * 60 * 60_000
  return { min: dayOf(now + day), max: dayOf(now + ERP_KEY_MAX_DAYS * day) }
}
