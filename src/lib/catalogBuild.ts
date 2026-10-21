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

// TODO(backend): system catalogue templates. This coffee-roastery list is a placeholder. The real
// templates come from the backend, one per business type and sub-business type picked at signup
// (src/lib/subBusinessTypes.ts), seeded from the Lulu reference sheet the owner shared on
// 21 Oct 2026 (item group, sub group, item name, brand, unit, pack size, barcode, price; food and
// beverage adds sizes and modifiers). A template is a starting copy: every item stays editable
// (price, unit, photo, quantity) and the user can also build a catalogue of their own. See
// docs/backend-guides/INCOME.md, row P.6.
export const SUGGESTED: SuggestedGroup[] = [
  {
    id: 'greenBeans',
    name: 'Green beans',
    picked: true,
    kinds: [
      {
        id: 'houseBlend',
        name: 'House Blend',
        picked: true,
        sizes: [
          {
            id: 'hb-1kg',
            name: 'House Blend - 1 kg bag',
            price: 9.5,
            soldAs: 'BG',
            nearbyFrom: 8.9,
            nearbyTo: 10.4,
            picked: true,
          },
          {
            id: 'hb-500g',
            name: 'House Blend - 500 g bag',
            price: 5.1,
            soldAs: 'BG',
            nearbyFrom: 4.7,
            nearbyTo: 5.6,
            picked: true,
          },
          {
            id: 'hb-250g',
            name: 'House Blend - 250 g bag',
            price: 2.7,
            soldAs: 'BG',
            nearbyFrom: 2.4,
            nearbyTo: 3.1,
            picked: true,
          },
          {
            id: 'hb-100g',
            name: 'House Blend - 100 g sample',
            price: 1.3,
            soldAs: 'BG',
            nearbyFrom: 1.1,
            nearbyTo: 1.5,
            picked: false,
          },
          {
            id: 'hb-loose',
            name: 'House Blend - sold loose, per kg',
            price: 9.2,
            soldAs: 'KGM',
            noteKey: 'buildCatalog.pricedByWeight',
            picked: false,
          },
          {
            id: 'hb-sack',
            name: 'House Blend - 5 kg wholesale sack',
            price: 44,
            soldAs: 'SA',
            nearbyFrom: 41,
            nearbyTo: 47,
            picked: false,
          },
        ],
      },
      {
        id: 'yirgacheffe',
        name: 'Yirgacheffe',
        picked: true,
        sizes: [
          {
            id: 'yg-1kg',
            name: 'Yirgacheffe - 1 kg bag',
            price: 11.4,
            soldAs: 'BG',
            nearbyFrom: 10.8,
            nearbyTo: 12.6,
            picked: true,
          },
          {
            id: 'yg-250g',
            name: 'Yirgacheffe - 250 g bag',
            price: 3.2,
            soldAs: 'BG',
            nearbyFrom: 2.9,
            nearbyTo: 3.6,
            picked: true,
          },
          {
            id: 'yg-500g',
            name: 'Yirgacheffe - 500 g bag',
            price: 6.1,
            soldAs: 'BG',
            nearbyFrom: 5.6,
            nearbyTo: 6.7,
            picked: true,
          },
        ],
      },
      { id: 'sidamo', name: 'Sidamo', picked: false, sizes: [] },
      { id: 'colombian', name: 'Colombian Supremo', picked: false, sizes: [] },
      { id: 'brazilian', name: 'Brazilian Santos', picked: false, sizes: [] },
      { id: 'decaf', name: 'Decaf', picked: false, sizes: [] },
      {
        id: 'omaniHojari',
        name: 'Omani Hojari roast',
        picked: true,
        yours: true,
        sizes: [
          {
            id: 'oh-500g',
            name: 'Omani Hojari - 500 g bag',
            price: 4.2,
            soldAs: 'BG',
            picked: true,
          },
        ],
      },
    ],
  },
  {
    id: 'brewedDrinks',
    name: 'Brewed drinks',
    picked: true,
    kinds: [
      {
        id: 'milkCoffee',
        name: 'Milk coffee',
        picked: true,
        sizes: [
          {
            id: 'fw',
            name: 'Flat White',
            price: 1.4,
            soldAs: 'EA',
            nearbyFrom: 1.2,
            nearbyTo: 1.6,
            picked: true,
          },
          {
            id: 'cap',
            name: 'Cappuccino',
            price: 1.4,
            soldAs: 'EA',
            nearbyFrom: 1.2,
            nearbyTo: 1.6,
            picked: true,
          },
          {
            id: 'latte',
            name: 'Latte',
            price: 1.5,
            soldAs: 'EA',
            nearbyFrom: 1.3,
            nearbyTo: 1.7,
            picked: true,
          },
        ],
      },
      {
        id: 'blackCoffee',
        name: 'Black coffee',
        picked: true,
        sizes: [
          {
            id: 'esp',
            name: 'Espresso',
            price: 0.8,
            soldAs: 'EA',
            nearbyFrom: 0.7,
            nearbyTo: 0.9,
            picked: true,
          },
          {
            id: 'dbl',
            name: 'Double Espresso',
            price: 1.1,
            soldAs: 'EA',
            nearbyFrom: 1,
            nearbyTo: 1.3,
            picked: true,
          },
        ],
      },
      {
        id: 'coldDrinks',
        name: 'Cold drinks',
        picked: true,
        sizes: [
          {
            id: 'cb',
            name: 'Cold Brew',
            price: 1.6,
            soldAs: 'EA',
            nearbyFrom: 1.4,
            nearbyTo: 1.9,
            picked: true,
          },
          {
            id: 'iced-latte',
            name: 'Iced Latte',
            price: 1.7,
            soldAs: 'EA',
            nearbyFrom: 1.5,
            nearbyTo: 2,
            picked: true,
          },
        ],
      },
      {
        id: 'tea',
        name: 'Tea',
        picked: false,
        sizes: [
          {
            id: 'karak',
            name: 'Karak tea',
            price: 0.6,
            soldAs: 'EA',
            nearbyFrom: 0.4,
            nearbyTo: 0.8,
            picked: false,
          },
        ],
      },
      { id: 'seasonal', name: 'Seasonal', picked: false, sizes: [] },
    ],
  },
  {
    id: 'roastingServices',
    name: 'Roasting services',
    picked: true,
    kinds: [
      {
        id: 'contractRoasting',
        name: 'Contract roasting',
        picked: true,
        sizes: [
          {
            id: 'batch',
            name: 'Roasting - per batch',
            price: 4.2,
            soldAs: 'BX',
            nearbyFrom: 3.8,
            nearbyTo: 4.8,
            picked: true,
          },
          {
            id: 'batch-half',
            name: 'Roasting - half batch',
            price: 2.4,
            soldAs: 'BX',
            nearbyFrom: 2.1,
            nearbyTo: 2.8,
            picked: true,
          },
          {
            id: 'batch-bulk',
            name: 'Roasting - 10 batch block',
            price: 38,
            soldAs: 'BX',
            nearbyFrom: 34,
            nearbyTo: 42,
            picked: true,
          },
        ],
      },
      { id: 'training', name: 'Training', picked: false, sizes: [] },
      { id: 'consulting', name: 'Consulting', picked: false, sizes: [] },
    ],
  },
  { id: 'pastries', name: 'Pastries and food', picked: false, kinds: [] },
  { id: 'packaging', name: 'Packaging', picked: false, kinds: [] },
  { id: 'brewingEquipment', name: 'Brewing equipment', picked: false, kinds: [] },
  { id: 'subscriptions', name: 'Subscriptions', picked: false, kinds: [] },
  { id: 'merchandise', name: 'Merchandise', picked: false, kinds: [] },
  { id: 'trainingEvents', name: 'Training and events', picked: false, kinds: [] },
]

/** Everything that would actually be created — the leaves, not the branches. */
export function readyToAdd(picks: Set<string>) {
  let count = 0
  let kinds = 0
  let groups = 0
  for (const group of SUGGESTED) {
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
export const DEFAULT_PICKS = new Set<string>([
  ...SUGGESTED.filter((group) => group.picked).map((group) => group.id),
  ...SUGGESTED.flatMap((group) => group.kinds.filter((kind) => kind.picked).map((kind) => kind.id)),
  ...SUGGESTED.flatMap((group) =>
    group.kinds.flatMap((kind) => kind.sizes.filter((size) => size.picked).map((size) => size.id)),
  ),
])

export const BUSINESS_KIND = { titleKey: 'buildCatalog.coffeeRoastery', vatPercent: 5 }
