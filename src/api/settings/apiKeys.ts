import { apiRequest } from '../client'

/**
 * The tenant's API keys (`ApiKeyController`, backend Phase 7 / DEC-H). Every route needs
 * `admin.settings.manage`.
 *
 * The raw key travels in exactly two responses, creation and rotation, and is never stored by
 * this client: the caller shows it once and lets it go. Nothing here writes to browser storage.
 */
export const API_KEYS_PATH = '/v1/apikeys'

/** `GENERAL` keys predate ERP; `ERP_INGESTION` keys are the ones API push uses. */
export type ApiKeyProfile = 'GENERAL' | 'ERP_INGESTION'

/**
 * The server's lifecycle state, derived on every read. Only `ACTIVE` and `ROTATION_GRACE`
 * authenticate; the other three are final.
 */
export type ApiKeyStatus = 'ACTIVE' | 'ROTATION_GRACE' | 'ROTATED' | 'REVOKED' | 'EXPIRED'

/**
 * One key as the list returns it: metadata only. There is no field that could carry the key or
 * its hash; `maskedKey` is the lookup prefix and the last four characters.
 *
 * `lastUsedAt` is eventually consistent: the server records use in memory and writes it about
 * once a minute, so a key used a moment ago may still show its previous value, and `null` means
 * no use has been recorded yet.
 */
export type ApiKeySummaryDto = {
  id: string
  maskedKey: string
  label: string
  scopes: string[]
  expiresAt: string | null
  active: boolean
  clientId: string | null
  clientName: string | null
  profile: ApiKeyProfile | null
  status: ApiKeyStatus | null
  createdAt: string | null
  lastUsedAt: string | null
  supersededByKeyId: string | null
  rotationGraceEndsAt: string | null
  rotationCompletedAt: string | null
  revokedAt: string | null
}

/**
 * The answer to a creation or a rotation: the only response that carries `key`.
 *
 * On a rotation, `replacesKeyId` names the old key and `previousKeyGraceEndsAt` says until when
 * it still works.
 */
export type ApiKeyCreatedDto = {
  id: string
  key: string
  prefix: string
  label: string
  scopes: string[]
  expiresAt: string | null
  warning: string | null
  profile: ApiKeyProfile | null
  replacesKeyId: string | null
  previousKeyGraceEndsAt: string | null
}

/** The request, field by field. Built only by {@link buildErpKeyRequest}. */
export type CreateApiKeyRequest = {
  label: string
  scopes: string[]
  profile: ApiKeyProfile
  /** Absent: the server applies its own default (365 days for an ERP ingestion key). */
  expiresAt?: string
}

/**
 * What an ERP ingestion key may be granted (`MachineCredentialProfile.ERP_INGESTION`): submitting
 * the four document kinds and nothing else.
 */
export const ERP_INGESTION_SCOPES = [
  'invoice.submit',
  'creditnote.submit',
  'debitnote.submit',
  'selfbilling.submit',
] as const
export type ErpIngestionScope = (typeof ERP_INGESTION_SCOPES)[number]

/** The client-name column is `VARCHAR(100)`; rotation appends " (rotation)" within it. */
export const API_KEY_LABEL_MAX = 100

export function listApiKeys(): Promise<ApiKeySummaryDto[]> {
  return apiRequest<ApiKeySummaryDto[]>(API_KEYS_PATH)
}

/** One key per creation the user means to make; a retry of the same attempt reuses it. */
export function newApiKeyRequestKey(action: 'create' | 'rotate'): string {
  return `api-key-${action}-${crypto.randomUUID()}`
}

export function createApiKey(
  request: CreateApiKeyRequest,
  idempotencyKey: string,
): Promise<ApiKeyCreatedDto> {
  return apiRequest<ApiKeyCreatedDto>(API_KEYS_PATH, {
    method: 'POST',
    body: request,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

export function rotateApiKey(id: string, idempotencyKey: string): Promise<ApiKeyCreatedDto> {
  return apiRequest<ApiKeyCreatedDto>(`${API_KEYS_PATH}/${encodeURIComponent(id)}/rotate`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** Ends a rotated key's grace now. `id` is the OLD key. Idempotent on the server. */
export function completeApiKeyRotation(id: string): Promise<void> {
  return apiRequest<void>(`${API_KEYS_PATH}/${encodeURIComponent(id)}/rotation/complete`, {
    method: 'POST',
  })
}

export function revokeApiKey(id: string): Promise<void> {
  return apiRequest<void>(`${API_KEYS_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * The one place a creation request is assembled. `expiryDate` is a calendar day (`YYYY-MM-DD`)
 * or empty; it is sent as the start of that day in UTC, which keeps the furthest day the picker
 * offers inside the server's 730-day ceiling whatever the time of day.
 */
export function buildErpKeyRequest(input: {
  label: string
  scopes: readonly ErpIngestionScope[]
  expiryDate: string
}): CreateApiKeyRequest {
  return {
    label: input.label.trim(),
    scopes: [...input.scopes],
    profile: 'ERP_INGESTION',
    ...(input.expiryDate === '' ? {} : { expiresAt: `${input.expiryDate}T00:00:00Z` }),
  }
}
