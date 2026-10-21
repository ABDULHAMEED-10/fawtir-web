/**
 * Getting a catalog started — Catalog › Empty state (135:42928), Upload a menu (135:43158) and
 * Build your catalog (135:43755).
 *
 * Both routes end in the same place: a list of things to sell with a price and a tax category.
 * Nothing is written until the person says so, so every count on both screens is a count of
 * what is currently ticked.
 */

/* --------------------------------------------------------- upload a menu */

export const UPLOAD_STEPS = ['uploaded', 'read', 'check', 'add']

/** How confidently a line came off the page. */
export type ReadState = 'clear' | 'check'

export type ReadRow = {
  id: string
  name: string
  /** Null where the menu gave no price at all. */
  price: number | null
  soldAs: string
  taxPercent: number
  state: ReadState
  /** Why it needs a second look. */
  concernKey?: string
  concernValues?: Record<string, string | number>
  /** Ticked rows are the ones that would be added. */
  ticked: boolean
}

export type ReadGroup = {
  id: string
  heading: string
  /** The catalog group the heading maps onto. */
  becomes: string
  rows: ReadRow[]
}

export const READ_GROUPS: ReadGroup[] = [
  {
    id: 'brewed',
    heading: 'Brewed Coffee',
    becomes: 'Brewed drinks',
    rows: [
      {
        id: 'espresso',
        name: 'Espresso',
        price: 0.8,
        soldAs: 'EA',
        taxPercent: 5,
        state: 'clear',
        ticked: true,
      },
      {
        id: 'double-espresso',
        name: 'Double Espresso',
        price: 1.1,
        soldAs: 'EA',
        taxPercent: 5,
        state: 'clear',
        ticked: true,
      },
      {
        id: 'flat-white',
        name: 'Flat White',
        price: 1.4,
        soldAs: 'EA',
        taxPercent: 5,
        state: 'clear',
        ticked: true,
      },
      {
        id: 'cappuccino',
        name: 'Cappuccino',
        price: 1.4,
        soldAs: 'EA',
        taxPercent: 5,
        state: 'clear',
        ticked: true,
      },
      {
        id: 'v60',
        name: 'V60 Pour Over',
        price: 1.8,
        soldAs: 'EA',
        taxPercent: 5,
        state: 'check',
        concernKey: 'uploadMenu.concern.lettersRead',
        concernValues: { printed: '1.8OO', read: '1.800' },
        ticked: true,
      },
      {
        id: 'cold-brew',
        name: 'Cold Brew',
        price: 1.6,
        soldAs: 'EA',
        taxPercent: 5,
        state: 'clear',
        ticked: true,
      },
    ],
  },
  {
    id: 'beans',
    heading: 'Retail Beans',
    becomes: 'Green beans',
    rows: [
      {
        id: 'hb-1kg',
        name: 'House Blend 1 kg bag',
        price: 9.5,
        soldAs: 'BG',
        taxPercent: 5,
        state: 'clear',
        ticked: true,
      },
      {
        id: 'hb-250g',
        name: 'House Blend 250 g bag',
        price: 2.7,
        soldAs: 'BG',
        taxPercent: 5,
        state: 'clear',
        ticked: true,
      },
      {
        id: 'yirg-1kg',
        name: 'Yirgacheffe 1 kg bag',
        price: 11.4,
        soldAs: 'BG',
        taxPercent: 5,
        state: 'clear',
        ticked: true,
      },
      {
        id: 'omani-500g',
        name: 'قهوة عمانية ٥٠٠ جرام',
        price: 4.2,
        soldAs: 'BG',
        taxPercent: 5,
        state: 'check',
        concernKey: 'uploadMenu.concern.arabicOnly',
        ticked: false,
      },
    ],
  },
  {
    id: 'services',
    heading: 'Services',
    becomes: 'Roasting services',
    rows: [
      {
        id: 'roasting',
        name: 'Roasting per batch',
        price: 4.2,
        soldAs: 'BX',
        taxPercent: 5,
        state: 'clear',
        ticked: true,
      },
      {
        id: 'barista-training',
        name: 'Barista training',
        price: null,
        soldAs: 'HUR',
        taxPercent: 5,
        state: 'check',
        concernKey: 'uploadMenu.concern.onRequest',
        ticked: false,
      },
    ],
  },
]

/** The whole read, of which the three groups above are the part the screen draws. */
export const READ_BOOK = {
  clear: 28,
  needChecking: 6,
  headings: 4,
  /** Rows the screen does not draw that came off unticked — one more needing a look. */
  undrawnUnticked: 1,
}

export const READ_TOTAL = READ_BOOK.clear + READ_BOOK.needChecking

/** Rows drawn on screen, flattened. */
export const READ_ROWS = READ_GROUPS.flatMap((group) => group.rows)

/**
 * How many would be added.
 *
 * The screen draws twelve of the thirty-four rows; the ones it does not draw all read clearly
 * and start ticked, so the count is the drawn ticks plus the rest.
 */
export function tickedTotal(ticked: Set<string>) {
  const drawnOff = READ_ROWS.filter((row) => !ticked.has(row.id)).length
  return READ_TOTAL - drawnOff - READ_BOOK.undrawnUnticked
}

export const DEFAULT_TICKS = new Set(READ_ROWS.filter((row) => row.ticked).map((row) => row.id))

export type MenuLine = { name: string; price: string; check?: boolean; rtl?: boolean }

export const MENU_PAGE: {
  business: string
  place: string
  sections: { heading: string; lines: MenuLine[] }[]
} = {
  business: 'AL BAHJA COFFEE',
  place: 'SOUQ STREET · NIZWA',
  sections: [
    {
      heading: 'BREWED COFFEE',
      lines: [
        { name: 'Espresso', price: '0.800' },
        { name: 'Double Espresso', price: '1.100' },
        { name: 'Flat White', price: '1.400' },
        { name: 'Cappuccino', price: '1.400' },
        { name: 'V60 Pour Over', price: '1.8OO', check: true },
        { name: 'Cold Brew', price: '1.600' },
      ],
    },
    {
      heading: 'RETAIL BEANS',
      lines: [
        { name: 'House Blend 1kg', price: '9.500' },
        { name: 'House Blend 250g', price: '2.700' },
        { name: 'Yirgacheffe 1kg', price: '11.400' },
        { name: 'قهوة عمانية ٥٠٠ جرام', price: '4.200', check: true, rtl: true },
      ],
    },
    {
      heading: 'SERVICES',
      lines: [
        { name: 'Roasting — per batch', price: '4.200' },
        { name: 'Barista training', price: 'on request', check: true },
      ],
    },
  ],
}

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
