/**
 * Getting a catalog started — Catalog › Empty state (135:42928), Upload a menu (135:43158) and
 * Build your catalog (135:43755).
 *
 * Both routes end in the same place: a list of things to sell with a price and a tax category.
 * Nothing is written until the person says so, so every count on both screens is a count of
 * what is currently ticked.
 */

/* Upload a menu lives on the menu-scan API now: src/lib/menuScan.ts and src/api/catalog/menuScans.ts. */

/* ------------------------------------------------------ build your catalog */

export type SuggestedSize = {
  id: string
  name: string
  price: number
  soldAs: string
  /** What comparable businesses charge, so a price is a choice rather than a guess. */
  nearbyFrom?: number
  nearbyTo?: number
  noteKey?: string
  /** From a template: what the till can scan, and the maker. */
  barcode?: string
  brand?: string
  /** The Oman VAT category it starts on, and the VATZR-OM / VATEX-OM reason when Z or E. */
  taxCode?: string
  reasonCode?: string
  picked: boolean
}

export type SuggestedKind = {
  id: string
  name: string
  sizes: SuggestedSize[]
  /** A kind the business added itself rather than one Fawtir proposed. */
  yours?: boolean
  picked: boolean
}

export type SuggestedGroup = {
  id: string
  name: string
  kinds: SuggestedKind[]
  picked: boolean
}

// The suggestions are a system template per sub-business type: src/lib/catalogTemplates.

/** Everything that would actually be created — the leaves, not the branches. */
export function readyToAdd(suggested: SuggestedGroup[], picks: Set<string>) {
  let count = 0
  let kinds = 0
  let groups = 0
  for (const group of suggested) {
    if (!picks.has(group.id)) continue
    let groupHasAny = false
    for (const kind of group.kinds) {
      if (!picks.has(kind.id)) continue
      const sizes = kind.sizes.filter((size) => picks.has(size.id)).length
      if (sizes > 0) {
        count += sizes
        kinds += 1
        groupHasAny = true
      }
    }
    if (groupHasAny) groups += 1
  }
  return { count, kinds, groups }
}

/** What is ticked when the screen opens. */
export const defaultPicks = (suggested: SuggestedGroup[]) =>
  new Set<string>([
    ...suggested.filter((group) => group.picked).map((group) => group.id),
    ...suggested.flatMap((group) =>
      group.kinds.filter((kind) => kind.picked).map((kind) => kind.id),
    ),
    ...suggested.flatMap((group) =>
      group.kinds.flatMap((kind) =>
        kind.sizes.filter((size) => size.picked).map((size) => size.id),
      ),
    ),
  ])
