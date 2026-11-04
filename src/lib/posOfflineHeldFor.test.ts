import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { heldForText } from './posOfflineHolds'

// NOT RUN (batch 43, static only). PRV43-OFF2 N-1: the reviewer sees the server's causes for holding
// a sale that would have been filed LEGACY, and the lines they name, as the server recorded them.

const line = (over: Partial<Parameters<typeof heldForText>[0]['lines'][number]>) => ({
  line: 1,
  cause: 'LEGACY_PRICE_BELOW_CATALOGUE',
  unitPrice: 1.5,
  cataloguePriceAtFiling: 2,
  unitCode: null,
  productUnitCode: null,
  notOnSale: false,
  ...over,
})

describe('the causes on a held sale (PRV43-OFF2 N-1)', () => {
  it('names every cause and every line, with the prices and units as recorded', async () => {
    await i18n.changeLanguage('en')
    const { causes, lines } = heldForText({
      causes: [
        'LEGACY_DISCOUNT_MAKER_UNPROVEN',
        'LEGACY_PRICE_BELOW_CATALOGUE',
        'LEGACY_PRICE_UNIT_NOT_COMPARABLE',
        'LEGACY_PRICE_NOT_ESTABLISHED',
      ],
      lines: [
        line({}),
        line({ line: 2, notOnSale: true, cataloguePriceAtFiling: 2.1 }),
        line({
          line: 3,
          cause: 'LEGACY_PRICE_UNIT_NOT_COMPARABLE',
          unitPrice: 10,
          unitCode: 'XCT',
          productUnitCode: 'EA',
        }),
        line({ line: 4, cause: 'LEGACY_PRICE_NOT_ESTABLISHED', unitPrice: null, cataloguePriceAtFiling: null }),
      ],
    })
    const text = (entry: { key: string; values: Record<string, string | number> }) =>
      i18n.t(`pos.offline.detail.heldFor.${entry.key}`, entry.values)

    expect(causes.map(text)).toEqual([
      'A manual discount, and nothing shows who gave it',
      'Priced below the catalogue',
      'Sold in another unit at another price',
      'No catalogue price to compare with',
    ])
    expect(lines.map(text)).toEqual([
      'Line 1: sold at 1.500; the catalogue price when it was filed is 2.000',
      'Line 2: sold at 1.500; the price stored for it is 2.100 (no longer on sale)',
      'Line 3: sold at 10.000 per XCT; the catalogue price is 2.000 per EA, not converted',
      'Line 4: no price could be found to compare with',
    ])
  })

  it('shows a cause this build does not know by its code rather than dropping it', async () => {
    await i18n.changeLanguage('en')
    const { causes } = heldForText({ causes: ['LEGACY_SOMETHING_NEW'], lines: [] })
    expect(i18n.t(`pos.offline.detail.heldFor.${causes[0].key}`, causes[0].values)).toBe(
      'Held for: LEGACY_SOMETHING_NEW',
    )
  })

  it('has every key in Arabic too', () => {
    for (const key of [
      'title',
      'cause.LEGACY_DISCOUNT_MAKER_UNPROVEN',
      'cause.LEGACY_PRICE_BELOW_CATALOGUE',
      'cause.LEGACY_PRICE_UNIT_NOT_COMPARABLE',
      'cause.LEGACY_PRICE_NOT_ESTABLISHED',
      'unknownCause',
      'below',
      'belowNotOnSale',
      'unit',
      'notEstablished',
    ]) {
      expect(i18n.exists(`pos.offline.detail.heldFor.${key}`, { lng: 'ar' })).toBe(true)
    }
  })
})
