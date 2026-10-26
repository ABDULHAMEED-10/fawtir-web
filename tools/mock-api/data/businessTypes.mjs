/**
 * Business types, sub business types and catalogue templates for the mock API, in the shapes of
 * `src/api/catalog/businessTypes.ts`, `src/api/catalog/templates.ts` and (console)
 * `src/api/platform/businessTypes.ts`. One in-memory store, so a change made on the console's
 * Settings › Business types shows on sign-up and in Settings › Company in the same run.
 *
 * The lists follow the backend's seed: 8 types, 61 sub types, Food & Beverage the only type open
 * for sign-up, a suggested activity for the F&B sub types. The templates are the Lulu sample
 * (`luluSample.json`, cut from the owner's reference sheet of 21 Oct 2026, no prices), kept here
 * for the mock only.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const NOW = '2026-10-26T08:00:00Z'

const TYPES = [
  ['FOOD_AND_BEVERAGE', 'Food & Beverage', 'utensils', true],
  ['RETAIL', 'Retail', 'store', false],
  ['BEAUTY_AND_WELLNESS', 'Beauty & Wellness', 'sparkles', false],
  ['PROFESSIONAL_AND_HOME_SERVICES', 'Professional & Home Services', 'briefcase', false],
  ['HEALTHCARE', 'Healthcare', 'stethoscope', false],
  ['HOSPITALITY_AND_TOURISM', 'Hospitality & Tourism', 'hotel', false],
  ['EDUCATION_AND_TRAINING', 'Education & Training', 'graduation-cap', false],
  ['AUTOMOTIVE', 'Automotive', 'car', false],
]

const ISIC = {
  563001: 'Cafés (cafes that offer mainly drinks)',
  561001: 'Restaurants',
  107101: 'Manufacture of bread and bread products',
  561002: 'Fast-food restaurants',
  563002: 'Fruit juice bars or shops',
  561003: 'Ice cream shops',
  562901: 'Catering activities',
}

const SUB_TYPES = {
  FOOD_AND_BEVERAGE: [
    ['COFFEE_SHOP', 'Coffee shop', '563001'],
    ['RESTAURANT', 'Restaurant', '561001'],
    ['BAKERY', 'Bakery', '107101'],
    ['FAST_FOOD', 'Fast food', '561002'],
    ['JUICE_BAR', 'Juice bar', '563002'],
    ['DESSERT_SHOP', 'Dessert shop', '561003'],
    ['CATERING', 'Catering', '562901'],
  ],
  RETAIL: [
    'GROCERY:Grocery',
    'ELECTRONICS:Electronics',
    'FASHION:Fashion',
    'FLOWER_SHOP:Flower shop',
    'GIFT_SHOP:Gift shop',
    'BOOKSTORE:Bookstore',
    'PET_SHOP:Pet shop',
    'HOME_STORE:Home store',
    'PERFUME_SHOP:Perfume shop',
  ],
  BEAUTY_AND_WELLNESS: [
    'BEAUTY_SALON:Beauty salon',
    'BARBER_SHOP:Barber shop',
    'SPA:Spa',
    'NAIL_SALON:Nail salon',
    'MASSAGE_CENTER:Massage center',
    'FITNESS_STUDIO:Fitness studio',
  ],
  PROFESSIONAL_AND_HOME_SERVICES: [
    'CONSULTANCY:Consultancy',
    'CLEANING:Cleaning',
    'LAUNDRY:Laundry',
    'TAILORING:Tailoring',
    'PRINTING:Printing',
    'REPAIR:Repair',
    'MAINTENANCE:Maintenance',
    'FREELANCE_SERVICES:Freelance services',
    'PHOTO_STUDIO:Photo studio',
    'GYPSUM_WORKS:Gypsum works',
    'LABOUR_SERVICE:Labour service',
  ],
  HEALTHCARE: [
    'MEDICAL_CLINIC:Medical clinic',
    'DENTAL_CLINIC:Dental clinic',
    'PHYSIOTHERAPY:Physiotherapy',
    'LABORATORY:Laboratory',
    'PHARMACY:Pharmacy',
    'MEDICAL_SUPPLIES:Medical supplies',
  ],
  HOSPITALITY_AND_TOURISM: [
    'HOTEL:Hotel',
    'RESORT:Resort',
    'GUEST_HOUSE:Guest house',
    'TRAVEL_AGENCY:Travel agency',
    'TOUR_OPERATOR:Tour operator',
    'CAR_RENTAL:Car rental',
    'EVENT_VENUE:Event venue',
  ],
  EDUCATION_AND_TRAINING: [
    'TRAINING_CENTER:Training center',
    'TUITION_CENTER:Tuition center',
    'NURSERY:Nursery',
    'SCHOOL:School',
    'DRIVING_SCHOOL:Driving school',
    'ONLINE_ACADEMY:Online academy',
    'COLLEGE:College',
    'UNIVERSITY:University',
  ],
  AUTOMOTIVE: [
    'GARAGE:Garage',
    'CAR_WASH:Car wash',
    'DETAILING:Detailing',
    'TIRE_SHOP:Tire shop',
    'SPARE_PARTS:Spare parts',
    'BATTERY_SHOP:Battery shop',
    'VEHICLE_INSPECTION:Vehicle inspection',
    'AUTO_CLASS:Auto class',
  ],
}

const isic = (code) => (code ? { code, nameEn: ISIC[code] ?? code, nameAr: null } : null)

/** The console's view: everything, retired included, `nameAr` as stored (null = none yet). */
export const store = {
  types: TYPES.map(([code, nameEn, icon, open], index) => ({
    code,
    nameEn,
    nameAr: code === 'FOOD_AND_BEVERAGE' ? 'الأغذية والمشروبات' : null,
    icon,
    displayOrder: index + 1,
    openForSignup: open,
    retiredAt: null,
    updatedAt: NOW,
    subTypes: SUB_TYPES[code].map((entry, i) => {
      const [subCode, subName, isicCode] =
        typeof entry === 'string' ? [...entry.split(':'), null] : entry
      return {
        code: subCode,
        businessTypeCode: code,
        nameEn: subName,
        nameAr: subCode === 'COFFEE_SHOP' ? 'مقهى' : null,
        icon: null,
        displayOrder: i + 1,
        retiredAt: subCode === 'DETAILING' ? '2026-10-20T09:00:00Z' : null,
        updatedAt: NOW,
        suggestedIsic: isic(isicCode),
        companies: subCode === 'COFFEE_SHOP' ? 4 : subCode === 'BAKERY' ? 2 : 0,
      }
    }),
  })),
  /** Per sub type: `{ draft, versions: [{ version, publishedAt, groups }] }`, newest last. */
  templates: new Map(),
  /** The signed-in company's own sub type (Settings › Company). */
  companySubType: 'COFFEE_SHOP',
}

/* ------------------------------------------------------------- templates */

const UNITS = new Set([
  'C62',
  'EA',
  'KGM',
  'GRM',
  'LTR',
  'MLT',
  'MTR',
  'MTK',
  'SET',
  'PR',
  'BX',
  'PK',
  'BG',
  'SA',
  'ZZ',
])

function itemFrom(sample) {
  return {
    name: sample.name,
    nameAr: null,
    classification: { goodsOrService: 'G', hsCode: '000000000000', serviceTypeCode: null },
    defaultUnitCode: UNITS.has(sample.unit) ? sample.unit : 'ZZ',
    defaultTaxCategory: sample.zeroRated ? 'Z' : 'S',
    defaultTaxReasonCode: sample.zeroRated ?? null,
    defaultTaxReasonText: null,
    barcode: sample.barcode ?? null,
    variants: null,
    addOns: [],
  }
}

// Beside this file; a checkout that still keeps it in the app (before it moved here) reads it there.
const SAMPLE_PATHS = [
  join(HERE, 'luluSample.json'),
  join(HERE, '..', '..', '..', 'src', 'lib', 'catalogTemplates', 'luluSample.json'),
]
const sample = JSON.parse(
  readFileSync(
    SAMPLE_PATHS.find((path) => existsSync(path)),
    'utf8',
  ),
)
for (const [webId, groups] of Object.entries(sample)) {
  const code = webId.toUpperCase().replace(/-/g, '_')
  const tree = groups.map((group) => ({
    name: group.name,
    nameAr: null,
    kinds: group.kinds.map((kind) => ({
      name: kind.name,
      nameAr: null,
      items: kind.items.map(itemFrom),
    })),
  }))
  store.templates.set(code, {
    draft: { revision: 1, updatedAt: NOW, groups: tree },
    versions: [{ version: 1, publishedAt: '2026-10-20T08:00:00Z', groups: tree }],
  })
}

// The coffee shop shows a template with history and a draft ahead of what is published: a
// hand-made menu group with sizes, options and add-ons on top of the sample.
{
  const coffee = store.templates.get('COFFEE_SHOP')
  const menu = {
    name: 'Hot drinks',
    nameAr: 'مشروبات ساخنة',
    kinds: [
      {
        name: 'Coffee',
        nameAr: 'قهوة',
        items: [
          {
            ...itemFrom({ name: 'Cappuccino', unit: 'C62' }),
            nameAr: 'كابتشينو',
            variants: {
              sizes: [
                { name: 'Small', nameAr: 'صغير' },
                { name: 'Large', nameAr: 'كبير' },
              ],
              options: [{ name: 'Oat milk', nameAr: null }],
            },
            addOns: [{ name: 'Extra shot', nameAr: null }],
          },
          {
            ...itemFrom({ name: 'Flat white', unit: 'C62' }),
            variants: { sizes: [{ name: 'Regular', nameAr: null }], options: [] },
          },
        ],
      },
    ],
  }
  const v2 = [menu, ...coffee.versions[0].groups]
  coffee.versions.push({ version: 2, publishedAt: '2026-10-25T12:00:00Z', groups: v2 })
  coffee.draft = { revision: 3, updatedAt: NOW, groups: v2 }
}

export const itemCount = (groups) =>
  groups.reduce((sum, group) => sum + group.kinds.reduce((n, kind) => n + kind.items.length, 0), 0)

/** `template` on a console sub type row. */
export function templateSummary(code) {
  const entry = store.templates.get(code)
  const latest = entry?.versions.at(-1)
  return {
    hasDraft: Boolean(entry?.draft),
    draftRevision: entry?.draft?.revision ?? 0,
    draftUpdatedAt: entry?.draft?.updatedAt ?? null,
    draftItemCount: entry?.draft ? itemCount(entry.draft.groups) : 0,
    publishedVersion: latest?.version ?? null,
    publishedAt: latest?.publishedAt ?? null,
    publishedItemCount: latest ? itemCount(latest.groups) : 0,
  }
}

/* ---------------------------------------------------------------- reads */

const filled = (named) => ({ ...named, nameAr: named.nameAr ?? named.nameEn })

/** `GET /auth/signup/business-types`: open, not retired, in order, Arabic filled from English. */
export function signupList() {
  return store.types
    .filter((type) => type.openForSignup && !type.retiredAt)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((type) => ({
      code: type.code,
      nameEn: type.nameEn,
      nameAr: type.nameAr ?? type.nameEn,
      icon: type.icon,
      displayOrder: type.displayOrder,
      subTypes: type.subTypes
        .filter((sub) => !sub.retiredAt)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((sub) => ({
          code: sub.code,
          nameEn: sub.nameEn,
          nameAr: sub.nameAr ?? sub.nameEn,
          icon: sub.icon,
          displayOrder: sub.displayOrder,
          suggestedIsic: sub.suggestedIsic ? filled(sub.suggestedIsic) : null,
          hasTemplate: Boolean(store.templates.get(sub.code)?.versions.length),
        })),
    }))
}

export function findSub(code) {
  for (const type of store.types) {
    const sub = type.subTypes.find((entry) => entry.code === code)
    if (sub) return { type, sub }
  }
  return undefined
}

/** `GET /company-profile/business-type`. */
export function companyBusinessType() {
  const found = store.companySubType ? findSub(store.companySubType) : undefined
  if (!found) return { businessType: null, subBusinessType: null }
  return {
    businessType: {
      code: found.type.code,
      nameEn: found.type.nameEn,
      nameAr: found.type.nameAr ?? found.type.nameEn,
      retired: Boolean(found.type.retiredAt),
    },
    subBusinessType: {
      code: found.sub.code,
      nameEn: found.sub.nameEn,
      nameAr: found.sub.nameAr ?? found.sub.nameEn,
      retired: Boolean(found.sub.retiredAt),
      suggestedIsic: found.sub.suggestedIsic ? filled(found.sub.suggestedIsic) : null,
    },
  }
}

export const problem = (status, slug, title, extra = {}) => ({
  status,
  headers: { 'Content-Type': 'application/problem+json' },
  body: { type: `https://api.fawtir.om/problems/${slug}`, title, status, ...extra },
})
