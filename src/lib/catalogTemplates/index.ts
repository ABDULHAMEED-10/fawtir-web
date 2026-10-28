import type { TemplateGroupDto, TemplateName } from '../../api/catalog/templates'
import type { SuggestedGroup } from '../catalogBuild'

/**
 * System catalogue templates: what a business of one sub business type usually sells, as a
 * starting copy the person ticks, prices and edits (owner, 21 Oct 2026). Kept in the console per
 * sub business type and read from `GET /v1/catalog/templates`; a person can also start a
 * catalogue of their own with no template. Templates carry no prices, so every item starts
 * without one.
 */

/** A template name in the reader's language: the English one until there is an Arabic one. */
export function templateName(named: TemplateName, language: string): string {
  return language.startsWith('ar') ? named.nameAr || named.name : named.name
}

/** The build screen's VAT choices are the reference data's codes, one per Oman category. */
const TAX_CODE: Record<string, string> = { S: 'S5', Z: 'Z0', E: 'E0', O: 'O0' }

/**
 * The template as the build screen's three panes read it: group, kind, then the things that carry
 * a price. The first group and its first kind start ticked, so the screen opens on something.
 */
export function suggestedFrom(groups: TemplateGroupDto[], language = 'en'): SuggestedGroup[] {
  return groups.map((group, g) => ({
    id: `g${g}`,
    name: templateName(group, language),
    picked: g === 0,
    kinds: group.kinds.map((kind, k) => ({
      id: `g${g}k${k}`,
      name: templateName(kind, language),
      picked: g === 0 && k === 0,
      sizes: kind.items.map((item, i) => ({
        id: `g${g}k${k}i${i}`,
        name: templateName(item, language),
        price: 0,
        soldAs: item.defaultUnitCode,
        barcode: item.barcode ?? undefined,
        taxCode: TAX_CODE[item.defaultTaxCategory] ?? 'S5',
        reasonCode: item.defaultTaxReasonCode ?? undefined,
        picked: g === 0 && k === 0,
      })),
    })),
  }))
}
