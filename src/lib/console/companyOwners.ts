import { ApiError, apiRequest } from '../../api'

/**
 * A company's Owner from the console (Business Rules OW-4, OW-5), in the shapes
 * `PlatformCompanyOwnerController` and `PlatformOwnerHandoverController` answer. Every route is
 * `platform.tenants.manage`; the server also asks for a person, MFA and the production platform.
 */
export const OWNERS_MANAGE_PERMISSION = 'platform.tenants.manage'

const COMPANIES = '/v1/platform/companies'

export type OwnerClassification =
  | 'NO_ORIGIN_USER'
  | 'ORIGIN_SWITCHED_OFF'
  | 'ORIGIN_NOT_ADMINISTRATOR'
  | 'CONFLICTING_ORIGIN'
  | 'CLEAR'

export type CompanyWithoutOwnerDto = {
  tenantId: string
  tenantCode: string
  companyName: string
  createdAt: string
  origin: 'SELF_SERVICE' | 'CONSOLE'
  classification: OwnerClassification
  activeAdministrators: number
  enabledUsers: number
}

export type CompaniesWithoutOwnerPage = {
  items: CompanyWithoutOwnerDto[]
  nextCursor: string | null
}

/** An active Administrator of the company: the only person who may be made its Owner. */
export type OwnerCandidateDto = {
  userId: string
  name: string | null
  username: string
  isOrigin: boolean
  /** Absent from older servers. */
  isOwner?: boolean
  lastLoginAt: string | null
}

export type HandoverStatus = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED'

export type OwnerHandoverDto = {
  id: string
  tenantId: string
  fromUserId: string
  toUserId: string
  reason: string
  evidenceRef: string
  evidenceObjectKey: string | null
  status: HandoverStatus
  requestedBy: string
  requestedAt: string
  expiresAt: string
  decidedBy: string | null
  decidedAt: string | null
}

/** The server's own limit for a reason and an evidence reference. */
export const OWNER_TEXT_MAX = 500

export function withoutOwnerPath(cursor: string | null): string {
  return cursor
    ? `${COMPANIES}/without-owner?cursor=${encodeURIComponent(cursor)}`
    : `${COMPANIES}/without-owner`
}

export const ownerCandidatesPath = (tenantId: string) =>
  `${COMPANIES}/${encodeURIComponent(tenantId)}/owner-candidates`

export const ownerHandoverPath = (tenantId: string) =>
  `${COMPANIES}/${encodeURIComponent(tenantId)}/owner-handover`

export function fetchCompaniesWithoutOwner(
  cursor: string | null,
): Promise<CompaniesWithoutOwnerPage> {
  return apiRequest<CompaniesWithoutOwnerPage>(withoutOwnerPath(cursor))
}

export function fetchOwnerCandidates(tenantId: string): Promise<OwnerCandidateDto[]> {
  return apiRequest<OwnerCandidateDto[]>(ownerCandidatesPath(tenantId))
}

/** OW-5: a Fawtir member picks an active Administrator as the Owner, with a reason. */
export function pickOwner(
  tenantId: string,
  body: { userId: string; reason: string },
): Promise<{ ownerUserId: string }> {
  return apiRequest(`${COMPANIES}/${encodeURIComponent(tenantId)}/owner`, {
    method: 'POST',
    body,
  })
}

/** OW-4, first operator: asks, with a reason and the proof; nothing changes until confirmed. */
export function requestOwnerHandover(
  tenantId: string,
  body: { toUserId: string; reason: string; evidenceRef: string },
): Promise<OwnerHandoverDto> {
  return apiRequest<OwnerHandoverDto>(ownerHandoverPath(tenantId), { method: 'POST', body })
}

/** OW-4, second operator: a different person than the one who asked. */
export function confirmOwnerHandover(tenantId: string, id: string): Promise<OwnerHandoverDto> {
  return apiRequest<OwnerHandoverDto>(
    `${ownerHandoverPath(tenantId)}/${encodeURIComponent(id)}/confirm`,
    { method: 'POST' },
  )
}

export function cancelOwnerHandover(tenantId: string, id: string): Promise<OwnerHandoverDto> {
  return apiRequest<OwnerHandoverDto>(
    `${ownerHandoverPath(tenantId)}/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' },
  )
}

/** A person as the console names them: their name, else their username. */
export function candidateLabel(candidate: OwnerCandidateDto): string {
  return candidate.name?.trim() ? `${candidate.name} (${candidate.username})` : candidate.username
}

const REFUSALS = [
  'owner-already-set',
  'owner-pick-not-administrator',
  'owner-not-set',
  'handover-target-self',
  'handover-target-not-administrator',
  'handover-already-open',
  'handover-not-open',
  'handover-expired',
  'same-operator',
  'production-platform-realm-required',
  'impersonation-not-allowed',
]

/**
 * A refusal in our words, as a key under `console.owners.refusal`. The server's English detail is
 * never shown.
 */
export function ownerRefusalKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.problemType && REFUSALS.includes(error.problemType)) {
      return `console.owners.refusal.${error.problemType}`
    }
    if (error.status === 400) return 'console.owners.refusal.invalid'
    if (error.status === 403) return 'console.owners.refusal.forbidden'
    if (error.status === 404) return 'console.owners.refusal.notFound'
  }
  return 'console.owners.refusal.other'
}
