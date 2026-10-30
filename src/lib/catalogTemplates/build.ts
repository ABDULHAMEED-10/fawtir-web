import { ApiError } from '../../api'
import type {
  CatalogGroupDto,
  CatalogGroupsDto,
  CatalogKindDto,
  CatalogNameRequest,
} from '../../api/catalog/groups'
import type { NewProduct, ProductDto } from '../../api/catalog/products'
import type { CatalogTemplateDto, TemplateItemDto, TemplateName } from '../../api/catalog/templates'
import { offeredUnitCode } from '../invoiceDraft'
import { TAX_CODE, itemId } from './index'

/**
 * "Add N to the catalog" on Build from a template (Catalogue guide 1A and 2; e2e 30 Oct, B-1).
 *
 * The server has no bulk copy, so the screen copies what is ticked one call at a time, in order:
 * the group (`POST /catalog/groups`), the kind inside it (`POST /catalog/groups/{id}/kinds`), then
 * the item (`POST /products`) with every field the template carries (W-2).
 *
 * A second run never duplicates (W-6): a group or kind already in the catalogue is reused by name,
 * case-insensitively, as the server keeps them unique; an item is skipped when its kind already
 * holds one with the same code or name. Each item's code is worked out from the template's names,
 * so the same item always gets the same code: a run that stopped halfway, or a retry of the items
 * that failed, is refused by code (`PRODUCT_CODE_DUPLICATE`) rather than added twice. The product
 * API takes no Idempotency-Key; the fixed code is what makes a repeat safe.
 */

/** One tax choice of the screen: the reference data's code (S5, Z0...) and its category. */
export type BuildTaxCategory = { code: string; en16931Category: string; rate: number | string }

/** What the person typed or changed on the screen, by suggestion id. */
export type BuildEdits = {
  prices: Record<string, string>
  units: Record<string, string>
  taxes: Record<string, string>
}

/** One item to copy: where it goes and the product request without its kind. */
export type BuildEntry = {
  id: string
  group: TemplateName
  kind: TemplateName
  item: TemplateItemDto
  product: Omit<NewProduct, 'kindId'>
}

export type BuildOutcomeState = 'added' | 'skipped' | 'failed'

export type BuildOutcome = {
  id: string
  /** Group › kind › item, in English, for the summary list (shown in the reader's language). */
  entry: BuildEntry
  state: BuildOutcomeState
  /** Why it was skipped: the same code, the same name, or the same barcode. */
  skippedBecause?: 'code' | 'name' | 'barcode'
  /** The refusal, for a failed one. */
  error?: unknown
}

/** UNCL5305 categories that carry no rate: the rate is absent, not zero (as the item form sends). */
const RATELESS = new Set(['E', 'O'])
const FALLBACK_RATE: Record<string, number> = { S: 5, Z: 0 }

const slug = (text: string, max: number) =>
  text
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')

/** FNV-1a, 32 bits, base 36: short, and the same for the same names on every run. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(7, '0')
}

const key = (text: string | null | undefined) => (text ?? '').trim().toLowerCase()

/**
 * The item's code: `TPL-`, its English name, and a hash of group, kind and item names, so two
 * items with one name in different kinds never share a code, and a re-run finds the same one.
 */
export function templateItemCode(group: string, kind: string, item: string): string {
  const name = slug(item, 60)
  const tag = hash(`${key(group)}|${key(kind)}|${key(item)}`)
  return name ? `TPL-${name}-${tag}` : `TPL-${tag}`
}

/** The product request for one template item, with what was typed on the screen. */
export function productFromTemplate(
  id: string,
  path: { group: TemplateName; kind: TemplateName },
  item: TemplateItemDto,
  edits: BuildEdits,
  categories: readonly BuildTaxCategory[],
): Omit<NewProduct, 'kindId'> {
  const goods = item.classification.goodsOrService !== 'S'
  const templateCategory = item.defaultTaxCategory
  const taxCode =
    edits.taxes[id] ??
    (Object.hasOwn(TAX_CODE, templateCategory) ? TAX_CODE[templateCategory] : 'S5')
  const tax = categories.find((row) => row.code === taxCode)
  const category = tax?.en16931Category ?? templateCategory
  const rate = RATELESS.has(category)
    ? null
    : tax
      ? Number(tax.rate)
      : (FALLBACK_RATE[category] ?? null)
  // The template's reason belongs to its category; another category starts without one.
  const sameCategory = category === templateCategory
  const price = Number((edits.prices[id] ?? '').replace(/,/g, ''))
  const hsCode = goods ? item.classification.hsCode || null : null
  const sizes = item.variants?.sizes ?? []
  const options = item.variants?.options ?? []
  const product: Omit<NewProduct, 'kindId'> = {
    code: templateItemCode(path.group.name, path.kind.name, item.name),
    // Both names always, whatever language the screen is in.
    name: item.name,
    nameAr: item.nameAr || null,
    defaultUnitCode: edits.units[id] ?? offeredUnitCode(item.defaultUnitCode),
    defaultUnitPrice: Number.isFinite(price) && price > 0 ? Number(price.toFixed(3)) : 0,
    defaultTaxCategory: category,
    defaultTaxRate: rate,
    defaultTaxReasonCode: sameCategory ? item.defaultTaxReasonCode || null : null,
    defaultTaxReasonText:
      sameCategory && category !== 'S' ? item.defaultTaxReasonText || null : null,
    classification: goods
      ? { goodsOrService: 'G', hsCode }
      : { goodsOrService: 'S', serviceTypeCode: item.classification.serviceTypeCode || null },
    barcode: item.barcode || null,
    // The item form's card: goods handed over need an HS code once a card is named.
    itemKind: goods ? (hsCode ? 'HAND_OVER' : undefined) : 'DO',
    // The template does not say whether stock is counted; the item's own page switches it on.
    keepCount: false,
  }
  if (product.itemKind === undefined) delete product.itemKind
  // Sizes, options and add-ons start without price changes; they are priced on the item.
  if (sizes.length) {
    product.sizes = sizes.map((s) => ({ name: s.name, nameAr: s.nameAr || null, priceDelta: 0 }))
  }
  if (options.length) {
    product.options = options.map((o) => ({
      name: o.name,
      nameAr: o.nameAr || null,
      priceDelta: 0,
    }))
  }
  if (item.addOns.length) {
    product.addOns = item.addOns.map((a) => ({
      name: a.name,
      nameAr: a.nameAr || null,
      price: 0,
      free: false,
    }))
  }
  return product
}

/** Everything ticked, in template order: a group, a kind inside it and the item all ticked. */
export function planBuild(
  template: Pick<CatalogTemplateDto, 'groups'>,
  picks: ReadonlySet<string>,
  edits: BuildEdits,
  categories: readonly BuildTaxCategory[],
  only?: ReadonlySet<string>,
): BuildEntry[] {
  const entries: BuildEntry[] = []
  template.groups.forEach((group, g) => {
    if (!picks.has(itemId(g))) return
    group.kinds.forEach((kind, k) => {
      if (!picks.has(itemId(g, k))) return
      kind.items.forEach((item, i) => {
        const id = itemId(g, k, i)
        if (!picks.has(id) || (only && !only.has(id))) return
        entries.push({
          id,
          group,
          kind,
          item,
          product: productFromTemplate(id, { group, kind }, item, edits, categories),
        })
      })
    })
  })
  return entries
}

/** The calls a build makes; the screen passes the real API, a test its own. */
export type BuildApi = {
  getGroups: () => Promise<CatalogGroupsDto>
  createGroup: (body: CatalogNameRequest) => Promise<CatalogGroupDto>
  createKind: (groupId: string, body: CatalogNameRequest) => Promise<CatalogKindDto>
  /** Every active product filed under the kind. */
  kindProducts: (kindId: string) => Promise<ProductDto[]>
  createProduct: (product: NewProduct) => Promise<ProductDto>
}

const refusedAs = (error: unknown, ...codes: string[]) =>
  error instanceof ApiError && error.code !== null && codes.includes(error.code)

type Known = { code: string; name: string; nameAr: string | null }

/**
 * Copies the entries in order and reports each one as it lands. A group or kind that cannot be
 * made fails every item under it with the same refusal; nothing else stops the run.
 */
export async function runBuild(
  entries: readonly BuildEntry[],
  api: BuildApi,
  onProgress?: (outcomes: BuildOutcome[]) => void,
): Promise<BuildOutcome[]> {
  const outcomes: BuildOutcome[] = []
  const report = (outcome: BuildOutcome) => {
    outcomes.push(outcome)
    onProgress?.([...outcomes])
  }

  let tree: CatalogGroupDto[]
  try {
    tree = (await api.getGroups()).groups
  } catch (error) {
    for (const entry of entries) report({ id: entry.id, entry, state: 'failed', error })
    return outcomes
  }

  const groups = new Map<string, Promise<CatalogGroupDto>>()
  const kinds = new Map<string, Promise<{ kind: CatalogKindDto; fresh: boolean }>>()
  const products = new Map<string, Promise<Known[]>>()

  const findGroup = (name: string) => tree.find((g) => key(g.name) === key(name))

  const ensureGroup = (named: TemplateName) => {
    const k = key(named.name)
    let found = groups.get(k)
    if (!found) {
      found = (async () => {
        const existing = findGroup(named.name)
        if (existing) return existing
        try {
          const made = await api.createGroup({
            name: named.name.trim(),
            nameAr: named.nameAr || null,
          })
          tree = [...tree, { ...made, kinds: made.kinds ?? [] }]
          return { ...made, kinds: made.kinds ?? [] }
        } catch (error) {
          // Made meanwhile (another tab, another person): read again and use it.
          if (refusedAs(error, 'CATALOGUE_GROUP_NAME_DUPLICATE')) {
            tree = (await api.getGroups()).groups
            const again = findGroup(named.name)
            if (again) return again
          }
          throw error
        }
      })()
      groups.set(k, found)
    }
    return found
  }

  const ensureKind = (group: CatalogGroupDto, named: TemplateName) => {
    const k = `${group.id}|${key(named.name)}`
    let found = kinds.get(k)
    if (!found) {
      found = (async () => {
        const existing = group.kinds.find((kind) => key(kind.name) === key(named.name))
        if (existing) return { kind: existing, fresh: false }
        try {
          const made = await api.createKind(group.id, {
            name: named.name.trim(),
            nameAr: named.nameAr || null,
          })
          return { kind: made, fresh: true }
        } catch (error) {
          if (refusedAs(error, 'CATALOGUE_KIND_NAME_DUPLICATE')) {
            tree = (await api.getGroups()).groups
            const again = tree
              .find((g) => g.id === group.id)
              ?.kinds.find((kind) => key(kind.name) === key(named.name))
            if (again) return { kind: again, fresh: false }
          }
          throw error
        }
      })()
      kinds.set(k, found)
    }
    return found
  }

  const knownIn = (kindId: string, fresh: boolean) => {
    let found = products.get(kindId)
    if (!found) {
      // A kind made in this run is empty; a listing that fails still leaves the code check.
      found = fresh
        ? Promise.resolve([])
        : api.kindProducts(kindId).then(
            (rows) => rows.map((p) => ({ code: p.code, name: p.name, nameAr: p.nameAr ?? null })),
            () => [],
          )
      products.set(kindId, found)
    }
    return found
  }

  for (const entry of entries) {
    try {
      const group = await ensureGroup(entry.group)
      const { kind, fresh } = await ensureKind(group, entry.kind)
      const known = await knownIn(kind.id, fresh)
      const sameCode = known.some((p) => key(p.code) === key(entry.product.code))
      const sameName = known.some(
        (p) =>
          key(p.name) === key(entry.product.name) ||
          (Boolean(entry.product.nameAr) && key(p.nameAr) === key(entry.product.nameAr)),
      )
      if (sameCode || sameName) {
        report({
          id: entry.id,
          entry,
          state: 'skipped',
          skippedBecause: sameCode ? 'code' : 'name',
        })
        continue
      }
      try {
        const made = await api.createProduct({ ...entry.product, kindId: kind.id })
        known.push({ code: made.code, name: made.name, nameAr: made.nameAr ?? null })
        report({ id: entry.id, entry, state: 'added' })
      } catch (error) {
        if (refusedAs(error, 'PRODUCT_CODE_DUPLICATE')) {
          report({ id: entry.id, entry, state: 'skipped', skippedBecause: 'code' })
        } else if (refusedAs(error, 'PRODUCT_BARCODE_DUPLICATE')) {
          report({ id: entry.id, entry, state: 'skipped', skippedBecause: 'barcode' })
        } else {
          report({ id: entry.id, entry, state: 'failed', error })
        }
      }
    } catch (error) {
      report({ id: entry.id, entry, state: 'failed', error })
    }
  }
  return outcomes
}

/** The counts the summary says. */
export function buildSummary(outcomes: readonly BuildOutcome[]) {
  return {
    added: outcomes.filter((o) => o.state === 'added').length,
    skipped: outcomes.filter((o) => o.state === 'skipped').length,
    failed: outcomes.filter((o) => o.state === 'failed').length,
  }
}
