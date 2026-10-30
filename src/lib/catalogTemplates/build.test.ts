import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import type { CatalogGroupDto, CatalogKindDto } from '../../api/catalog/groups'
import type { NewProduct, ProductDto } from '../../api/catalog/products'
import type { TemplateGroupDto, TemplateItemDto } from '../../api/catalog/templates'
import { defaultPicks } from '../catalogBuild'
import { suggestedFrom } from './index'
import { planBuild, runBuild, templateItemCode, type BuildApi } from './build'
import { buildSelectionKey, readBuildSelection, saveBuildSelection } from './selection'

const CATEGORIES = [
  { code: 'S5', en16931Category: 'S', rate: 5 },
  { code: 'Z0', en16931Category: 'Z', rate: 0 },
  { code: 'E0', en16931Category: 'E', rate: 0 },
  { code: 'O0', en16931Category: 'O', rate: 0 },
]

const item = (name: string, extra: Partial<TemplateItemDto> = {}): TemplateItemDto => ({
  name,
  nameAr: null,
  classification: { goodsOrService: 'G', hsCode: '000000000000', serviceTypeCode: null },
  defaultUnitCode: 'C62',
  defaultTaxCategory: 'S',
  defaultTaxReasonCode: null,
  defaultTaxReasonText: null,
  barcode: null,
  variants: null,
  addOns: [],
  defaultSelected: true,
  ...extra,
})

const LATTE = item('Café Latte', {
  nameAr: 'لاتيه',
  variants: {
    sizes: [
      { name: 'Small', nameAr: 'صغير' },
      { name: 'Large', nameAr: null },
    ],
    options: [
      { name: 'Hot', nameAr: 'ساخن' },
      { name: 'Iced', nameAr: 'بارد' },
    ],
  },
  addOns: [{ name: 'Extra shot', nameAr: 'جرعة إضافية' }],
})

const GROUPS: TemplateGroupDto[] = [
  {
    name: 'Hot drinks',
    nameAr: 'مشروبات ساخنة',
    kinds: [
      {
        name: 'Coffee',
        nameAr: 'قهوة',
        items: [
          LATTE,
          item('Americano'),
          item('Gift Box of Mugs', { defaultSelected: false, defaultUnitCode: 'BX' }),
        ],
      },
    ],
  },
  {
    name: 'Coffee Beans',
    nameAr: 'بن',
    kinds: [
      {
        name: 'Packaged',
        nameAr: 'معبأ',
        items: [
          item('House Beans 250 g', {
            nameAr: 'بن البيت',
            defaultUnitCode: 'XBG',
            classification: { goodsOrService: 'G', hsCode: '090121000000', serviceTypeCode: null },
            barcode: '6290000000017',
          }),
          item('Fresh Milk', {
            defaultUnitCode: 'XBO',
            defaultTaxCategory: 'Z',
            defaultTaxReasonCode: 'VATZR-OM-01',
            classification: { goodsOrService: 'G', hsCode: '040110930000', serviceTypeCode: null },
          }),
        ],
      },
      {
        name: 'Services',
        nameAr: null,
        items: [
          item('Barista class', {
            defaultUnitCode: 'HUR',
            classification: { goodsOrService: 'S', hsCode: null, serviceTypeCode: '91000000' },
          }),
        ],
      },
    ],
  },
]

const ALL = new Set([
  'g0',
  'g0k0',
  'g0k0i0',
  'g0k0i1',
  'g1',
  'g1k0',
  'g1k0i0',
  'g1k0i1',
  'g1k1',
  'g1k1i0',
])
const NO_EDITS = { prices: {}, units: {}, taxes: {} }

const refusal = (status: number, code: string) =>
  new ApiError({
    status,
    problemType: status === 409 ? 'resource-conflict' : 'validation-failed',
    code,
  })

/** An in-memory catalogue with the server's uniqueness rules, recording every call in order. */
function fakeApi(
  start: CatalogGroupDto[] = [],
  products: (ProductDto & { kindId: string })[] = [],
  fail: (product: NewProduct) => ApiError | null = () => null,
) {
  const calls: string[] = []
  const created: NewProduct[] = []
  const tree = structuredClone(start)
  let n = 0
  const api: BuildApi = {
    getGroups: async () => {
      calls.push('GET groups')
      return { groups: structuredClone(tree) }
    },
    createGroup: async (body) => {
      calls.push(`POST group ${body.name}`)
      if (tree.some((g) => g.name.toLowerCase() === body.name.toLowerCase()))
        throw refusal(409, 'CATALOGUE_GROUP_NAME_DUPLICATE')
      const group: CatalogGroupDto = {
        id: `g-${++n}`,
        name: body.name,
        nameAr: body.nameAr ?? null,
        sortOrder: 0,
        version: 0,
        kinds: [],
      }
      tree.push(group)
      return group
    },
    createKind: async (groupId, body) => {
      calls.push(`POST kind ${body.name}`)
      const group = tree.find((g) => g.id === groupId)!
      if (group.kinds.some((k) => k.name.toLowerCase() === body.name.toLowerCase()))
        throw refusal(409, 'CATALOGUE_KIND_NAME_DUPLICATE')
      const kind: CatalogKindDto = {
        id: `k-${++n}`,
        groupId,
        name: body.name,
        nameAr: body.nameAr ?? null,
        sortOrder: 0,
        version: 0,
      }
      group.kinds.push(kind)
      return kind
    },
    kindProducts: async (kindId) => {
      calls.push(`GET products ${kindId}`)
      return products.filter((p) => p.kindId === kindId)
    },
    createProduct: async (product) => {
      calls.push(`POST product ${product.name}`)
      const refused = fail(product)
      if (refused) throw refused
      if (products.some((p) => p.code.toUpperCase() === product.code.toUpperCase()))
        throw refusal(409, 'PRODUCT_CODE_DUPLICATE')
      created.push(product)
      const stored = {
        id: `p-${++n}`,
        ...product,
        kindId: product.kindId!,
        description: null,
        active: true,
        version: 0,
      } as unknown as ProductDto & { kindId: string }
      products.push(stored)
      return stored
    },
  }
  return { api, calls, created, tree, products }
}

describe('building the catalogue from a template', () => {
  it('creates groups, then kinds, then products, in template order', async () => {
    const { api, calls } = fakeApi()
    const outcomes = await runBuild(planBuild({ groups: GROUPS }, ALL, NO_EDITS, CATEGORIES), api)
    expect(outcomes.map((o) => o.state)).toEqual(Array(5).fill('added'))
    expect(calls).toEqual([
      'GET groups',
      'POST group Hot drinks',
      'POST kind Coffee',
      'POST product Café Latte',
      'POST product Americano',
      'POST group Coffee Beans',
      'POST kind Packaged',
      'POST product House Beans 250 g',
      'POST product Fresh Milk',
      'POST kind Services',
      'POST product Barista class',
    ])
  })

  it('carries every field the template has, with both names whatever the language (W-2)', async () => {
    const { api, created, tree } = fakeApi()
    await runBuild(
      planBuild(
        { groups: GROUPS },
        ALL,
        { prices: { g0k0i0: '1.5', g1k0i0: '2.700' }, units: {}, taxes: {} },
        CATEGORIES,
      ),
      api,
    )
    expect(tree[0]).toMatchObject({ name: 'Hot drinks', nameAr: 'مشروبات ساخنة' })
    expect(tree[0].kinds[0]).toMatchObject({ name: 'Coffee', nameAr: 'قهوة' })
    const [latte, , beans, milk, barista] = created
    expect(latte).toMatchObject({
      code: templateItemCode('Hot drinks', 'Coffee', 'Café Latte'),
      name: 'Café Latte',
      nameAr: 'لاتيه',
      defaultUnitCode: 'C62',
      defaultUnitPrice: 1.5,
      defaultTaxCategory: 'S',
      defaultTaxRate: 5,
      defaultTaxReasonCode: null,
      classification: { goodsOrService: 'G', hsCode: '000000000000' },
      itemKind: 'HAND_OVER',
      keepCount: false,
      kindId: tree[0].kinds[0].id,
      sizes: [
        { name: 'Small', nameAr: 'صغير', priceDelta: 0 },
        { name: 'Large', nameAr: null, priceDelta: 0 },
      ],
      options: [
        { name: 'Hot', nameAr: 'ساخن', priceDelta: 0 },
        { name: 'Iced', nameAr: 'بارد', priceDelta: 0 },
      ],
      addOns: [{ name: 'Extra shot', nameAr: 'جرعة إضافية', price: 0, free: false }],
    })
    expect(beans).toMatchObject({
      nameAr: 'بن البيت',
      defaultUnitCode: 'XBG',
      defaultUnitPrice: 2.7,
      barcode: '6290000000017',
      classification: { goodsOrService: 'G', hsCode: '090121000000' },
    })
    expect(beans.sizes).toBeUndefined()
    expect(milk).toMatchObject({
      defaultUnitCode: 'XBO',
      defaultTaxCategory: 'Z',
      defaultTaxRate: 0,
      defaultTaxReasonCode: 'VATZR-OM-01',
      classification: { goodsOrService: 'G', hsCode: '040110930000' },
    })
    expect(barista).toMatchObject({
      defaultUnitCode: 'HUR',
      classification: { goodsOrService: 'S', serviceTypeCode: '91000000' },
      itemKind: 'DO',
    })
  })

  it('takes the unit and VAT changed on the screen, dropping a reason the new category has not', () => {
    const [milk] = planBuild(
      { groups: GROUPS },
      new Set(['g1', 'g1k0', 'g1k0i1']),
      { prices: {}, units: { g1k0i1: 'LTR' }, taxes: { g1k0i1: 'S5' } },
      CATEGORIES,
    )
    expect(milk.product).toMatchObject({
      defaultUnitCode: 'LTR',
      defaultTaxCategory: 'S',
      defaultTaxRate: 5,
      defaultTaxReasonCode: null,
      defaultTaxReasonText: null,
    })
  })

  it('reuses groups and kinds already there by name, and skips items already in the kind (W-6)', async () => {
    const existing: CatalogGroupDto[] = [
      {
        id: 'g-old',
        name: 'HOT DRINKS',
        nameAr: null,
        sortOrder: 0,
        version: 3,
        kinds: [
          { id: 'k-old', groupId: 'g-old', name: 'coffee', nameAr: null, sortOrder: 0, version: 1 },
        ],
      },
    ]
    const stored = [
      // The same name with another code (the server would accept a duplicate).
      { id: 'p-1', code: 'MY-AMERICANO', name: 'americano', kindId: 'k-old' },
    ] as unknown as (ProductDto & { kindId: string })[]
    const { api, calls } = fakeApi(existing, stored)
    const outcomes = await runBuild(
      planBuild(
        { groups: GROUPS },
        new Set(['g0', 'g0k0', 'g0k0i0', 'g0k0i1']),
        NO_EDITS,
        CATEGORIES,
      ),
      api,
    )
    expect(outcomes.map((o) => [o.entry.item.name, o.state, o.skippedBecause])).toEqual([
      ['Café Latte', 'added', undefined],
      ['Americano', 'skipped', 'name'],
    ])
    expect(calls.some((c) => c.startsWith('POST group') || c.startsWith('POST kind'))).toBe(false)
  })

  it('a second run adds nothing and refuses nothing', async () => {
    const fake = fakeApi()
    const plan = planBuild({ groups: GROUPS }, ALL, NO_EDITS, CATEGORIES)
    await runBuild(plan, fake.api)
    const again = fakeApi(fake.tree, fake.products)
    const outcomes = await runBuild(plan, again.api)
    expect(outcomes.every((o) => o.state === 'skipped')).toBe(true)
    expect(again.created).toHaveLength(0)
    expect(again.calls.filter((c) => c.startsWith('POST'))).toEqual([])
  })

  it('counts a code or barcode the server already holds elsewhere as already there', async () => {
    const { api } = fakeApi([], [], (product) =>
      product.name === 'Americano'
        ? refusal(409, 'PRODUCT_CODE_DUPLICATE')
        : product.barcode
          ? refusal(409, 'PRODUCT_BARCODE_DUPLICATE')
          : null,
    )
    const outcomes = await runBuild(planBuild({ groups: GROUPS }, ALL, NO_EDITS, CATEGORIES), api)
    expect(outcomes.filter((o) => o.state === 'skipped').map((o) => o.skippedBecause)).toEqual([
      'code',
      'barcode',
    ])
  })

  it('reports each failure with its refusal, carries on, and retries only the failed ones', async () => {
    let refuseMilk = true
    const fake = fakeApi([], [], (product) =>
      refuseMilk && product.name === 'Fresh Milk'
        ? refusal(400, 'PRODUCT_ZERO_RATING_HS_MISMATCH')
        : null,
    )
    const outcomes = await runBuild(
      planBuild({ groups: GROUPS }, ALL, NO_EDITS, CATEGORIES),
      fake.api,
    )
    const failed = outcomes.filter((o) => o.state === 'failed')
    expect(failed.map((o) => o.id)).toEqual(['g1k0i1'])
    expect((failed[0].error as ApiError).code).toBe('PRODUCT_ZERO_RATING_HS_MISMATCH')
    expect(outcomes.filter((o) => o.state === 'added')).toHaveLength(4)

    refuseMilk = false
    fake.calls.length = 0
    const retry = await runBuild(
      planBuild({ groups: GROUPS }, ALL, NO_EDITS, CATEGORIES, new Set(['g1k0i1'])),
      fake.api,
    )
    expect(retry.map((o) => [o.id, o.state])).toEqual([['g1k0i1', 'added']])
    expect(fake.calls.filter((c) => c.startsWith('POST'))).toEqual(['POST product Fresh Milk'])
  })

  it('fails every item of a group the server will not make, and still builds the others', async () => {
    const fake = fakeApi()
    const createGroup = fake.api.createGroup
    let refused = 0
    fake.api.createGroup = async (body) => {
      if (body.name === 'Hot drinks') {
        refused += 1
        throw refusal(403, 'ACCESS_DENIED')
      }
      return createGroup(body)
    }
    const outcomes = await runBuild(
      planBuild({ groups: GROUPS }, ALL, NO_EDITS, CATEGORIES),
      fake.api,
    )
    expect(outcomes.map((o) => o.state)).toEqual([
      'failed',
      'failed',
      'added',
      'added',
      'added',
    ])
    // Asked once: its second item takes the same refusal without a second call.
    expect(refused).toBe(1)
  })
})

describe('the suggestions', () => {
  it('start each item ticked as the template says (W-3)', () => {
    const picks = defaultPicks(suggestedFrom(GROUPS))
    expect(picks.has('g0k0i0')).toBe(true)
    expect(picks.has('g0k0i1')).toBe(true)
    expect(picks.has('g0k0i2')).toBe(false)
  })

  it('keep their ids in every language, so ticks and prices survive a switch (W-4)', () => {
    const ids = (language: string) =>
      suggestedFrom(GROUPS, language).flatMap((g) =>
        g.kinds.flatMap((k) => [g.id, k.id, ...k.sizes.map((s) => s.id)]),
      )
    expect(ids('ar')).toEqual(ids('en'))
    expect(suggestedFrom(GROUPS, 'ar')[0].kinds[0].sizes[0].choices).toEqual([
      'صغير',
      'Large',
      'ساخن',
      'بارد',
    ])
  })

  it('keeps a saved selection for the same template version only', () => {
    window.localStorage.clear()
    const key = buildSelectionKey('t-1')
    const tpl = { subBusinessTypeCode: 'COFFEE_SHOP', version: 2 }
    saveBuildSelection(key, tpl, {
      picks: ['g0', 'g0k0', 'g0k0i0'],
      prices: { g0k0i0: '1.500' },
      units: {},
      taxes: {},
    })
    expect(readBuildSelection(key, tpl)?.prices).toEqual({ g0k0i0: '1.500' })
    expect(readBuildSelection(key, { ...tpl, version: 3 })).toBeNull()
    expect(readBuildSelection(buildSelectionKey('t-2'), tpl)).toBeNull()
  })
})
