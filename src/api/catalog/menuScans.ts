import { apiDownload, apiRequest } from '../client'

/**
 * Scan a menu or price list (backend PR #787): upload a photo, screenshot or PDF of a menu, read it
 * into a draft grouped by the menu's headings, and add only the rows the company kept. Every
 * route needs `product.manage`. Nothing is added to the catalogue before the confirm.
 */
export const MENU_SCANS_PATH = '/v1/catalog/menu-scans'

const scanPath = (fileId: string) => `${MENU_SCANS_PATH}/${encodeURIComponent(fileId)}`

/** The types and size the server takes (`MENU_SCAN_INVALID` otherwise). */
export const MENU_SCAN_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const MENU_SCAN_MAX_BYTES = 10 * 1024 * 1024

/**
 * A read is synchronous and the server waits at least 90 s for the reader, so the page waits
 * longer than that before it calls the read lost.
 */
export const MENU_READ_TIMEOUT_MS = 150_000

export type MenuScanFileDto = {
  fileId: string
  contentType: string
  byteSize: number
  sha256: string
  uploadedAt: string
}

export type MenuScanConcernCode =
  | 'PRICE_MISSING'
  | 'PRICE_UNREADABLE'
  | 'SIZE_PRICE_UNREADABLE'
  | 'CURRENCY_NOT_OMR'
  | 'LOW_CONFIDENCE'
  | 'READER_NOTE'

export type MenuScanSizeDto = { name: string; price: number | null; priceAsPrinted: string | null }

export type MenuScanRowDto = {
  id: string
  name: string
  nameAr: string | null
  description: string | null
  price: number | null
  priceAsPrinted: string | null
  currency: string | null
  sizes: MenuScanSizeDto[]
  confidence: number
  state: 'clear' | 'check'
  ticked: boolean
  /** `message` is the server's English: never shown, the code is worded on the screen. */
  concerns: { code: MenuScanConcernCode | string; message: string }[]
  soldAs: string
  taxCategory: string
  taxPercent: number
  goodsOrService: 'G' | 'S'
  itemKind: 'HAND_OVER' | 'DO' | 'BY_TIME' | 'BUNDLE'
  hsCode: string | null
}

export type MenuScanGroupDto = {
  id: string
  heading: string | null
  headingAr: string | null
  becomes: string
  existingGroupId: string | null
  rows: MenuScanRowDto[]
}

export type MenuScanReadingDto = {
  fileId: string
  /** Null when something was read; otherwise there are no groups. */
  reason: 'READING_UNAVAILABLE' | 'READ_FAILED' | null
  summary: { clear: number; needChecking: number; headings: number }
  groups: MenuScanGroupDto[]
}

export type MenuScanConfirmItem = {
  code?: string | null
  name: string
  nameAr?: string | null
  description?: string | null
  price: number | null
  unitCode?: string | null
  itemKind?: string | null
  taxCategory?: string | null
  taxRate?: number | null
  taxReasonCode?: string | null
  taxReasonText?: string | null
  hsCode?: string | null
  serviceTypeCode?: string | null
  sizes?: { name: string; nameAr?: string | null; price: number }[]
}

export type MenuScanConfirmGroup = {
  /** An existing kind; wins over `name`. */
  kindId?: string | null
  /** The group; the company's group of this name is reused. */
  name?: string | null
  nameAr?: string | null
  kindName?: string | null
  items: MenuScanConfirmItem[]
}

export type MenuScanConfirmRequest = { groups: MenuScanConfirmGroup[] }

export type MenuScanConfirmedDto = {
  confirmationId: string
  fileId: string
  replayed: boolean
  productCount: number
  products: {
    groupIndex: number
    itemIndex: number
    productId: string
    code: string
    name: string
    groupId: string
    kindId: string
  }[]
}

/** A refused row of `MENU_SCAN_ROWS_REFUSED`, by its place in the confirm request. */
export type MenuScanRowRefusal = {
  group: number
  /** Null when the group itself was refused. */
  item: number | null
  field: string | null
  code: string
  message: string
}

/** `POST /v1/catalog/menu-scans` (multipart `file`). Virus-scanned; never limited. */
export function uploadMenuScan(file: Blob, name: string): Promise<MenuScanFileDto> {
  const body = new FormData()
  body.append('file', file, name)
  return apiRequest<MenuScanFileDto>(MENU_SCANS_PATH, { method: 'POST', body, timeoutMs: 120_000 })
}

/** `POST /v1/catalog/menu-scans/{fileId}/read`. 429 `MENU_SCAN_DAILY_LIMIT` past the day's reads. */
export function readMenuScan(fileId: string): Promise<MenuScanReadingDto> {
  return apiRequest<MenuScanReadingDto>(`${scanPath(fileId)}/read`, {
    method: 'POST',
    timeoutMs: MENU_READ_TIMEOUT_MS,
  })
}

/** `GET /v1/catalog/menu-scans/{fileId}/file`: the menu as uploaded, shown beside the reading. */
export function getMenuScanFile(fileId: string) {
  return apiDownload(`${scanPath(fileId)}/file`, { timeoutMs: 60_000 })
}

/**
 * `POST /v1/catalog/menu-scans/{fileId}/confirm`: all or nothing. The same key and list replays
 * (200); the key with another list is 409 `MENU_SCAN_KEY_REUSED`.
 */
export function confirmMenuScan(
  fileId: string,
  body: MenuScanConfirmRequest,
  idempotencyKey: string,
): Promise<MenuScanConfirmedDto> {
  return apiRequest<MenuScanConfirmedDto>(`${scanPath(fileId)}/confirm`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** 1 to 100 of letters, digits, `.`, `_`, `:` or `-`. */
export function newMenuScanKey(): string {
  return `menu-${crypto.randomUUID()}`
}
