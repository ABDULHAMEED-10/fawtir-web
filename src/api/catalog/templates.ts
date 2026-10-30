import { apiRequest } from '../client'
import { withQuery } from '../query'

/**
 * Catalogue templates (Catalogue guide 1A and 2): what a business of one sub business type
 * usually sells, as a starting copy the company ticks, prices and edits. Group › Kind › Item, and
 * no prices anywhere. Item fields mirror the product API, so an item copies into a product field
 * by field. Sizes, options and add-ons are names only.
 */

/** A name with its optional Arabic one (`null` = none yet). */
export type TemplateName = { name: string; nameAr: string | null }

export type TemplateItemDto = TemplateName & {
  classification: {
    /** CL-07-OM: `G` goods, `S` services. */
    goodsOrService: 'G' | 'S'
    /** 12 digits on the Oman HS list (IBR-080-OM); goods only. */
    hsCode: string | null
    /** CL-12-OM; services only. */
    serviceTypeCode: string | null
  }
  /** UN/ECE Rec 20. */
  defaultUnitCode: string
  /** CL-04-OM: S, Z, E or O. */
  defaultTaxCategory: string
  /** VATZR-OM-xx for Z, VATEX-OM-xx for E; none for S and O. */
  defaultTaxReasonCode: string | null
  defaultTaxReasonText: string | null
  barcode: string | null
  /** Names only: sizes × options. May be `null`, or have empty lists. */
  variants: { sizes: TemplateName[]; options: TemplateName[] } | null
  addOns: TemplateName[]
  /**
   * Whether Start from a template offers the item ticked (default true; always present on reads,
   * absent on a server before it). False for an item only some companies may sell.
   */
  defaultSelected?: boolean
}

export type TemplateKindDto = TemplateName & { items: TemplateItemDto[] }
export type TemplateGroupDto = TemplateName & { kinds: TemplateKindDto[] }

/** The published template a company reads (never the draft). */
export type CatalogTemplateDto = {
  subBusinessTypeCode: string
  version: number
  publishedAt: string
  groups: TemplateGroupDto[]
}

export const CATALOG_TEMPLATES_PATH = '/v1/catalog/templates'

/**
 * The published template of a sub business type (`product.read`). Without one it is the
 * company's own sub type. 404 when that sub type has no published template, or the company has
 * none and none was asked for.
 */
export function catalogTemplatePath(subBusinessType?: string): string {
  return withQuery(CATALOG_TEMPLATES_PATH, { subBusinessType })
}

export function readCatalogTemplate(subBusinessType?: string): Promise<CatalogTemplateDto> {
  return apiRequest<CatalogTemplateDto>(catalogTemplatePath(subBusinessType))
}
