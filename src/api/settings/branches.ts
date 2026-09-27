import { apiRequest } from '../client'

/**
 * Branch creation and maintenance (`BranchManagementController`, `BranchDirectoryController`).
 *
 * The design (Figma 135:37541, 135:37971) shows several facts the backend does not model per
 * branch: who manages it, the roster's own initials, per-till usage recency, and which branch most
 * recently opened. `BranchOverview`'s own javadoc names these gaps; the screens draw the same
 * layout and fall back to a plain count or omit the note rather than invent the missing figure.
 * See docs/backend-guides/INCOME.md, "Update 2026-09-27 (branches)".
 */
export const BRANCHES_OVERVIEW_PATH = '/v1/branches/overview'
export const branchPath = (id: string) => `/v1/branches/${encodeURIComponent(id)}`

export type BranchType = 'HEAD_OFFICE' | 'STORE' | 'WAREHOUSE' | 'RESTAURANT' | 'SERVICE_CENTER'

export type BranchOverviewRow = {
  id: string
  code: string
  name: string
  headOffice: boolean
  active: boolean
  closedOn: string | null
  invoicePrefix: string | null
  nextNumber: number | null
  invoicesThisMonth: number
  invoicedThisMonth: number
  people: number
  devices: number
}

export type BranchOverviewDto = {
  openCount: number
  everCount: number
  peopleAcross: number
  invoicesThisMonth: number
  branches: BranchOverviewRow[]
}

export type BranchDetailDto = {
  id: string
  code: string
  name: string
  type: BranchType
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  postalCode: string | null
  phone: string | null
  email: string | null
  active: boolean
  closedOn: string | null
  closureReason: string | null
  headOffice: boolean
  version: number
}

export type BranchAttributesPayload = {
  code: string
  name: string
  type: BranchType
  address?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postalCode?: string | null
  phone?: string | null
  email?: string | null
}

export function loadBranchOverview(month?: string): Promise<BranchOverviewDto> {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  return apiRequest<BranchOverviewDto>(`${BRANCHES_OVERVIEW_PATH}${query}`)
}

export function loadBranch(id: string): Promise<BranchDetailDto> {
  return apiRequest<BranchDetailDto>(branchPath(id))
}

export function createBranch(payload: BranchAttributesPayload): Promise<BranchDetailDto> {
  return apiRequest<BranchDetailDto>('/v1/branches', { method: 'POST', body: payload })
}

export function updateBranch(
  id: string,
  payload: BranchAttributesPayload,
  active: boolean,
  expectedVersion: number,
): Promise<BranchDetailDto> {
  return apiRequest<BranchDetailDto>(branchPath(id), {
    method: 'PUT',
    body: { ...payload, active, expectedVersion },
  })
}

export function designateHeadOffice(id: string): Promise<BranchDetailDto> {
  return apiRequest<BranchDetailDto>(`${branchPath(id)}/head-office`, { method: 'POST' })
}

export function assignInvoicePrefix(id: string, prefix: string): Promise<BranchDetailDto> {
  return apiRequest<BranchDetailDto>(`${branchPath(id)}/invoice-prefix`, {
    method: 'PUT',
    body: { prefix },
  })
}

/** A short, unique-enough starting point for `code`: letters from the name, folded upper-case. */
export function codeFromName(name: string, taken: readonly string[] = []): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '')
  const base = (letters.slice(0, 2) || 'BR').padEnd(2, 'X')
  if (!taken.includes(base)) return base
  for (let n = 1; n <= 99; n += 1) {
    const candidate = `${base}${n}`
    if (!taken.includes(candidate)) return candidate
  }
  return `${base}${Date.now() % 1000}`
}
