/**
 * Point of sale.
 *
 * The category filters are the *pre-built item groups* of the tenant's sub business type —
 * the same list that used to be previewed on the signup sub-business-type screen — plus
 * anything the tenant has uploaded into their own catalogue. Labels come from
 * `subBusinessType.groups.<groupsKey>` so they stay in one place and translate with the rest
 * of the app; an item points at its group by index into that array.
 */

import type { BusinessTypeId } from './subBusinessTypes'

/** The signed-in tenant: picked Retail at signup, then Grocery as the sub business type. */
export const POS_PROFILE: {
  businessType: BusinessTypeId
  subTypeId: string
  subTypeLabelKey: string
  groupsKey: string
} = {
  businessType: 'retail',
  subTypeId: 'grocery',
  subTypeLabelKey: 'subBusinessType.options.grocery',
  groupsKey: 'grocery',
}

export type PosItem = {
  id: string
  name: string
  /** Index into the sub business type's group list — 0 Produce … 5 Household for grocery. */
  groupIndex: number
  /** Baisa. 1 OMR = 1000 baisa. */
  price: number
  /**
   * Oman zero-rates basic foodstuffs (the OTA's 94-item list: milk, bread, eggs, sugar, tea,
   * cooking oil, bottled water, meat, poultry, fruit and vegetables). Household goods and
   * soft drinks stay at the 5% standard rate, so a grocery till has to handle both.
   */
  vatRate: number
  /** Remote product shot; the tile falls back to initials if it fails to load. */
  image?: string
}

export type CartLine = { item: PosItem; qty: number }

export type PosSort = 'name' | 'priceAsc' | 'priceDesc'

export const POS_SORTS: PosSort[] = ['name', 'priceAsc', 'priceDesc']

/** Wikimedia Commons product shots, served remotely — no image assets are stored in the repo. */
const photo = (path: string) => `https://upload.wikimedia.org/wikipedia/commons/${path}`

export const POS_ITEMS: PosItem[] = [
  // Produce
  {
    id: 'tomatoes-1kg',
    name: 'Tomatoes 1 kg',
    groupIndex: 0,
    price: 450,
    vatRate: 0,
    image: photo('thumb/8/89/Tomato_je.jpg/500px-Tomato_je.jpg'),
  },
  {
    id: 'cucumber-1kg',
    name: 'Cucumber 1 kg',
    groupIndex: 0,
    price: 380,
    vatRate: 0,
    image: photo('thumb/9/96/ARS_cucumber.jpg/500px-ARS_cucumber.jpg'),
  },
  {
    id: 'bananas-1kg',
    name: 'Bananas 1 kg',
    groupIndex: 0,
    price: 520,
    vatRate: 0,
    image: photo('d/de/Bananavarieties.jpg'),
  },
  {
    id: 'onions-2kg',
    name: 'Onions 2 kg',
    groupIndex: 0,
    price: 700,
    vatRate: 0,
    image: photo('thumb/a/a2/Mixed_onions.jpg/500px-Mixed_onions.jpg'),
  },
  // Dairy
  {
    id: 'milk-1l',
    name: 'Milk 1 L',
    groupIndex: 1,
    price: 650,
    vatRate: 0,
    image: photo(
      'thumb/a/a5/Glass_of_Milk_%2833657535532%29.jpg/500px-Glass_of_Milk_%2833657535532%29.jpg',
    ),
  },
  {
    id: 'cheese-200g',
    name: 'Cheese 200 g',
    groupIndex: 1,
    price: 1250,
    vatRate: 0,
    image: photo('thumb/a/a8/Cheese_platter.jpg/500px-Cheese_platter.jpg'),
  },
  {
    id: 'yoghurt-500g',
    name: 'Yoghurt 500 g',
    groupIndex: 1,
    price: 1100,
    vatRate: 0,
    image: photo('thumb/b/b8/Joghurt.jpg/500px-Joghurt.jpg'),
  },
  {
    id: 'eggs-30',
    name: 'Eggs 30',
    groupIndex: 1,
    price: 1900,
    vatRate: 0,
    image: photo(
      'thumb/2/26/Six_eggs_views_from_the_top_on_a_white_background.jpg/500px-Six_eggs_views_from_the_top_on_a_white_background.jpg',
    ),
  },
  {
    id: 'butter-200g',
    name: 'Butter 200 g',
    groupIndex: 1,
    price: 1350,
    vatRate: 0,
    image: photo('thumb/f/fd/Western-pack-butter.jpg/500px-Western-pack-butter.jpg'),
  },
  // Pantry
  {
    id: 'bread',
    name: 'Bread',
    groupIndex: 2,
    price: 400,
    vatRate: 0,
    image: photo('thumb/c/c7/Korb_mit_Br%C3%B6tchen.JPG/500px-Korb_mit_Br%C3%B6tchen.JPG'),
  },
  {
    id: 'sugar-2kg',
    name: 'Sugar 2 kg',
    groupIndex: 2,
    price: 1150,
    vatRate: 0,
    image: photo(
      'thumb/3/3c/Sucre_blanc_cassonade_complet_rapadura.jpg/500px-Sucre_blanc_cassonade_complet_rapadura.jpg',
    ),
  },
  {
    id: 'tea-250g',
    name: 'Tea 250 g',
    groupIndex: 2,
    price: 1750,
    vatRate: 0,
    image: photo(
      'thumb/d/d3/Longjing_tea_steeping_in_gaiwan.jpg/500px-Longjing_tea_steeping_in_gaiwan.jpg',
    ),
  },
  {
    id: 'oil-1500ml',
    name: 'Cooking Oil 1.5 L',
    groupIndex: 2,
    price: 2900,
    vatRate: 0,
    image: photo('thumb/4/49/Olive_oil_from_Oneglia.jpg/500px-Olive_oil_from_Oneglia.jpg'),
  },
  {
    id: 'rice-5kg',
    name: 'Rice 5 kg',
    groupIndex: 2,
    price: 3250,
    vatRate: 0,
    image: photo(
      'thumb/0/0a/20201102.Hengnan.Hybrid_rice_Sanyou-1.6.jpg/500px-20201102.Hengnan.Hybrid_rice_Sanyou-1.6.jpg',
    ),
  },
  // Beverages
  {
    id: 'water-1200ml',
    name: 'Water 1.2 L',
    groupIndex: 3,
    price: 950,
    vatRate: 0,
    image: photo('0/02/Stilles_Mineralwasser.jpg'),
  },
  {
    id: 'juice-1l',
    name: 'Orange Juice 1 L',
    groupIndex: 3,
    price: 1450,
    vatRate: 5,
    image: photo('thumb/0/05/Orangejuice.jpg/500px-Orangejuice.jpg'),
  },
  {
    id: 'cola-330ml',
    name: 'Cola 330 ml',
    groupIndex: 3,
    price: 250,
    vatRate: 5,
    image: photo('thumb/2/23/Glass_of_Cola.jpg/500px-Glass_of_Cola.jpg'),
  },
  // Frozen
  {
    id: 'peas-frozen',
    name: 'Frozen Peas',
    groupIndex: 4,
    price: 850,
    vatRate: 0,
    image: photo('thumb/1/11/Peas_in_pods_-_Studio.jpg/500px-Peas_in_pods_-_Studio.jpg'),
  },
  {
    id: 'chicken-1kg',
    name: 'Chicken 1 kg',
    groupIndex: 4,
    price: 2100,
    vatRate: 0,
    image: photo('thumb/5/57/Chickens_in_market.jpg/500px-Chickens_in_market.jpg'),
  },
  {
    id: 'ribs-5kg',
    name: 'Ribs 5 kg',
    groupIndex: 4,
    price: 2450,
    vatRate: 0,
    image: photo('thumb/d/d9/Cote_de_boeuf_p1040932.jpg/500px-Cote_de_boeuf_p1040932.jpg'),
  },
  {
    id: 'fries-frozen',
    name: 'Frozen Fries 1 kg',
    groupIndex: 4,
    price: 1150,
    vatRate: 5,
    image: photo('thumb/8/83/French_Fries.JPG/500px-French_Fries.JPG'),
  },
  // Household
  {
    id: 'dish-soap',
    name: 'Dish Soap 750 ml',
    groupIndex: 5,
    price: 780,
    vatRate: 5,
    image: photo('thumb/7/71/Afwasmiddel.jpg/500px-Afwasmiddel.jpg'),
  },
  {
    id: 'detergent-3kg',
    name: 'Laundry Detergent 3 kg',
    groupIndex: 5,
    price: 3400,
    vatRate: 5,
    image: photo('thumb/2/2a/Pralni_pra%C5%A1ek.JPG/500px-Pralni_pra%C5%A1ek.JPG'),
  },
  {
    id: 'paper-towels',
    name: 'Paper Towels 6 rolls',
    groupIndex: 5,
    price: 1250,
    vatRate: 5,
    image: photo('thumb/5/54/Paper_towel.jpg/500px-Paper_towel.jpg'),
  },
]

/** Baisa → the 3-decimal form Oman uses, with thousands separators. */
export function formatOmr(baisa: number): string {
  const sign = baisa < 0 ? '-' : ''
  const abs = Math.abs(baisa)
  const whole = Math.floor(abs / 1000)
  const frac = String(abs % 1000).padStart(3, '0')
  return `${sign}${whole.toLocaleString('en-US')}.${frac}`
}

/** VAT is rounded per line, then summed — the mix of 0% and 5% lines stays correct. */
export function cartTotals(lines: CartLine[]): { net: number; vat: number; total: number } {
  let net = 0
  let vat = 0
  for (const line of lines) {
    const lineNet = line.item.price * line.qty
    net += lineNet
    vat += Math.round((lineNet * line.item.vatRate) / 100)
  }
  return { net, vat, total: net + vat }
}

/** Two letters for the tile placeholder when a product shot is missing or fails to load. */
export function itemInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
