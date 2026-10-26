import { apiDownload, apiRequest } from '../client'
import { withQuery } from '../query'
import type { TemplateGroupDto } from '../catalog/templates'

/**
 * Console › Settings › Business types (Catalogue guide 1A): the business types and sub business
 * types companies choose at sign-up, and one catalogue template per sub type. Every endpoint
 * needs `platform.catalogue.manage` in a non-impersonating platform session, and every change is
 * audited. Codes are permanent; there is no delete, only retire and restore.
 *
 * `nameAr` comes back as stored here (`null` = no Arabic name yet), unlike the company reads,
 * which fill it with the English name.
 */
export const CATALOGUE_MANAGE_PERMISSION = 'platform.catalogue.manage'

const BASE = '/v1/platform/business-types'
const SUB_BASE = '/v1/platform/sub-business-types'

export type ConsoleSuggestedIsicDto = { code: string; nameEn: string; nameAr: string | null }

export type ConsoleTemplateSummaryDto = {
  hasDraft: boolean
  /** 0 when there is no draft yet. */
  draftRevision: number
  draftUpdatedAt: string | null
  draftItemCount: number
  publishedVersion: number | null
  publishedAt: string | null
  publishedItemCount: number
}

export type ConsoleSubBusinessTypeDto = {
  code: string
  businessTypeCode: string
  nameEn: string
  nameAr: string | null
  icon: string | null
  displayOrder: number
  retiredAt: string | null
  updatedAt: string
  suggestedIsic: ConsoleSuggestedIsicDto | null
  /** How many companies store this code. */
  companies: number
  template: ConsoleTemplateSummaryDto | null
}

export type ConsoleBusinessTypeDto = {
  code: string
  nameEn: string
  nameAr: string | null
  icon: string | null
  displayOrder: number
  openForSignup: boolean
  retiredAt: string | null
  updatedAt: string
  subTypes: ConsoleSubBusinessTypeDto[]
}

export const CONSOLE_BUSINESS_TYPES_PATH = BASE

export function readConsoleBusinessTypes(): Promise<ConsoleBusinessTypeDto[]> {
  return apiRequest<ConsoleBusinessTypeDto[]>(BASE)
}

const at = (code: string) => `${BASE}/${encodeURIComponent(code)}`
const subAt = (code: string) => `${SUB_BASE}/${encodeURIComponent(code)}`

export type NewBusinessTypeRequest = {
  code: string
  nameEn: string
  nameAr?: string
  icon?: string
  displayOrder?: number
}

/** Absent = unchanged; `""` clears `nameAr` or `icon`. */
export type BusinessTypePatch = {
  nameEn?: string
  nameAr?: string
  icon?: string
  displayOrder?: number
}

export function createBusinessType(body: NewBusinessTypeRequest) {
  return apiRequest<ConsoleBusinessTypeDto>(BASE, { method: 'POST', body })
}

export function updateBusinessType(code: string, body: BusinessTypePatch) {
  return apiRequest<ConsoleBusinessTypeDto>(at(code), { method: 'PATCH', body })
}

/** Listed codes get display order 1..n; the answer is the whole list. */
export function reorderBusinessTypes(codes: string[]) {
  return apiRequest<ConsoleBusinessTypeDto[]>(`${BASE}/order`, { method: 'PUT', body: { codes } })
}

export function setBusinessTypeSignup(code: string, open: boolean) {
  return apiRequest<ConsoleBusinessTypeDto>(`${at(code)}/signup`, {
    method: 'PUT',
    body: { open },
  })
}

/** Retiring also closes it for sign-up; restoring leaves it closed. */
export function retireBusinessType(code: string) {
  return apiRequest<ConsoleBusinessTypeDto>(`${at(code)}/retire`, { method: 'POST' })
}

export function restoreBusinessType(code: string) {
  return apiRequest<ConsoleBusinessTypeDto>(`${at(code)}/restore`, { method: 'POST' })
}

export type NewSubBusinessTypeRequest = NewBusinessTypeRequest & { suggestedIsicCode?: string }

export type SubBusinessTypePatch = BusinessTypePatch & {
  /** Moves the sub type under another business type. */
  businessTypeCode?: string
}

export function createSubBusinessType(typeCode: string, body: NewSubBusinessTypeRequest) {
  return apiRequest<ConsoleSubBusinessTypeDto>(`${at(typeCode)}/sub-types`, {
    method: 'POST',
    body,
  })
}

export function updateSubBusinessType(code: string, body: SubBusinessTypePatch) {
  return apiRequest<ConsoleSubBusinessTypeDto>(subAt(code), { method: 'PATCH', body })
}

export function reorderSubBusinessTypes(typeCode: string, codes: string[]) {
  return apiRequest<ConsoleBusinessTypeDto[]>(`${at(typeCode)}/sub-types/order`, {
    method: 'PUT',
    body: { codes },
  })
}

/** A code on CL-08-OM-ISIC, or `null` to clear. A hint only: no company is changed. */
export function setSuggestedIsic(code: string, isicCode: string | null) {
  return apiRequest<ConsoleSubBusinessTypeDto>(`${subAt(code)}/suggested-isic`, {
    method: 'PUT',
    body: { code: isicCode },
  })
}

export function retireSubBusinessType(code: string) {
  return apiRequest<ConsoleSubBusinessTypeDto>(`${subAt(code)}/retire`, { method: 'POST' })
}

export function restoreSubBusinessType(code: string) {
  return apiRequest<ConsoleSubBusinessTypeDto>(`${subAt(code)}/restore`, { method: 'POST' })
}

/* ---------------------------------------------------------------- templates */

export type ConsoleTemplateDraftDto = {
  revision: number
  updatedAt: string
  itemCount: number
  groups: TemplateGroupDto[]
}

export type ConsoleTemplateVersionSummaryDto = {
  version: number
  publishedAt: string
  itemCount: number
}

export type ConsoleTemplateVersionDto = ConsoleTemplateVersionSummaryDto & {
  groups: TemplateGroupDto[]
}

export type ConsoleTemplateDto = {
  subBusinessTypeCode: string
  draft: ConsoleTemplateDraftDto | null
  published: (ConsoleTemplateVersionDto & { publishedAt: string }) | null
  /** Newest first. */
  versions: ConsoleTemplateVersionSummaryDto[]
}

export const templatePath = (code: string) => `${subAt(code)}/template`

export function readConsoleTemplate(code: string) {
  return apiRequest<ConsoleTemplateDto>(templatePath(code))
}

export function readTemplateVersion(code: string, version: number) {
  return apiRequest<ConsoleTemplateVersionDto>(`${templatePath(code)}/versions/${version}`)
}

/**
 * Replaces the whole draft. `expectedRevision` (0 = no draft yet) is refused with 409
 * `catalogue-template-draft-conflict` when someone saved in between.
 */
export function saveTemplateDraft(
  code: string,
  groups: TemplateGroupDto[],
  expectedRevision?: number,
) {
  return apiRequest<ConsoleTemplateDto>(`${templatePath(code)}/draft`, {
    method: 'PUT',
    body: { expectedRevision, groups },
  })
}

/**
 * A CSV (UTF-8, at most 5 MB) replaces the draft. Refused with 400 `catalogue-template-invalid`
 * and its row errors, in which case nothing is saved.
 */
export function importTemplateCsv(code: string, file: File, expectedRevision?: number) {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<ConsoleTemplateDto>(
    withQuery(`${templatePath(code)}/import`, { expectedRevision }),
    { method: 'POST', body, timeoutMs: 120_000 },
  )
}

/** Copies the draft to a new published version; the draft stays for further edits. */
export function publishTemplate(code: string) {
  return apiRequest<ConsoleTemplateDto>(`${templatePath(code)}/publish`, { method: 'POST' })
}

/** The CSV header row plus one example row. */
export function downloadImportFormat() {
  return apiDownload('/v1/platform/catalogue-templates/import-format')
}

/* ----------------------------------------------------------------- refusals */

export const CATALOGUE_CODE_TAKEN = 'catalogue-code-taken'
export const NO_ACTIVE_SUB_TYPE = 'business-type-has-no-active-sub-type'
export const BUSINESS_TYPE_RETIRED = 'business-type-retired'
export const TEMPLATE_INVALID = 'catalogue-template-invalid'
export const TEMPLATE_DRAFT_CONFLICT = 'catalogue-template-draft-conflict'
export const TEMPLATE_NO_DRAFT = 'catalogue-template-no-draft'

/** One row of `errors` on a `catalogue-template-invalid` refusal. */
export type TemplateRowError = {
  /** The CSV line number for an import, `null` for a draft save. */
  row: number | null
  /** The JSON path for a draft save (`groups[0].kinds[1].items[3].hsCode`). */
  path: string | null
  field: string | null
  message: string
}
