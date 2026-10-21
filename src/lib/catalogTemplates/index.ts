import { SUB_TYPES_BY_BUSINESS } from '../subBusinessTypes'
import type { SuggestedGroup } from '../catalogBuild'

/**
 * System catalogue templates: what a business of one sub-business type usually sells, as a
 * starting copy the person ticks, prices and edits (owner, 21 Oct 2026). A person can also start
 * a catalogue of their own with no template.
 *
 * TODO(backend): the templates come from the backend (`GET /v1/catalog/templates?subBusinessType=`,
 * docs/backend-guides/INCOME.md row P.6). Until then this reads a sample cut from the owner's
 * Lulu reference sheet of 21 Oct 2026: for each sub-business type the four biggest item groups,
 * their four biggest sub groups and four items of each, with the sheet's unit and barcode. The
 * sheet's prices are left out (many are 0 or far off, e.g. a 150 ml face wash at 36.000), so
 * every item starts without a price. Infant formula the sheet marks zero-rated under MD 65/2021
 * starts as Zero-rated with VATZR-OM-01; every other zero-rating is the backend's to set by HS
 * code (rows Z.15 and P.3).
 */
export type TemplateItem = {
  name: string
  /** UN/ECE Rec 20 goods unit. */
  unit: string
  barcode?: string
  brand?: string
  /** The VATZR-OM reason when the item starts zero-rated. */
  zeroRated?: string
}
export type TemplateKind = { name: string; items: TemplateItem[] }
export type TemplateGroup = { name: string; kinds: TemplateKind[] }

/** The sample's own keys, so the list below needs no load. */
const SAMPLE_IDS: ReadonlySet<string> = new Set([
  'coffee-shop',
  'restaurant',
  'bakery',
  'fast-food',
  'juice-bar',
  'dessert-shop',
  'grocery',
  'electronics',
  'fashion',
  'flower-shop',
  'gift-shop',
  'bookstore',
  'pet-shop',
  'home-store',
  'pharmacy',
  'medical-supplies',
  'spare-parts',
  'beauty-salon',
  'barber-shop',
  'spa',
  'nail-salon',
  'fitness-studio',
])

/** The sub-business types that have a template, in the order the signup screens list them. */
export const TEMPLATE_SUB_TYPES = Object.values(SUB_TYPES_BY_BUSINESS)
  .flat()
  .filter((option) => SAMPLE_IDS.has(option.id))

/** One sub-business type's template; the sample is loaded only when the screen asks. */
export async function loadTemplate(subBusinessType: string): Promise<TemplateGroup[]> {
  const sample = (await import('./luluSample.json')).default as Record<string, TemplateGroup[]>
  return sample[subBusinessType] ?? []
}

/**
 * The template as the build screen's three panes read it: group, kind, then the things that carry
 * a price. The first group and its first kind start ticked, so the screen opens on something.
 */
export function suggestedFrom(groups: TemplateGroup[]): SuggestedGroup[] {
  return groups.map((group, g) => ({
    id: `g${g}`,
    name: group.name,
    picked: g === 0,
    kinds: group.kinds.map((kind, k) => ({
      id: `g${g}k${k}`,
      name: kind.name,
      picked: g === 0 && k === 0,
      sizes: kind.items.map((item, i) => ({
        id: `g${g}k${k}i${i}`,
        name: item.name,
        price: 0,
        soldAs: item.unit,
        barcode: item.barcode,
        brand: item.brand,
        taxCode: item.zeroRated ? 'Z0' : 'S5',
        reasonCode: item.zeroRated,
        picked: g === 0 && k === 0,
      })),
    })),
  }))
}
