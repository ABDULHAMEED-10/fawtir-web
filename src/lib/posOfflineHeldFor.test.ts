import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { heldForMessage, heldForText } from './posOfflineHolds'

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
      'notOnSaleNow',
    ]) {
      expect(
        i18n.exists(`pos.offline.detail.heldFor.${key}`, { lng: 'ar', fallbackLng: false }),
      ).toBe(true)
    }
    expect(i18n.exists('invoiceIssue.stockWarning.line', { lng: 'ar', fallbackLng: false })).toBe(true)
  })

  // PRV43-OFF3 L-2: a line cause this build does not know keeps the line it names.
  it('keeps the line number of a line cause it does not know', async () => {
    await i18n.changeLanguage('en')
    const { lines } = heldForText({
      causes: ['LEGACY_PRICE_BELOW_CATALOGUE'],
      lines: [line({ line: 3, cause: 'LEGACY_SOMETHING_NEW' })],
    })
    expect(lines.map((entry) => heldForMessage(i18n.t, entry))).toEqual([
      'Line 3: Held for: LEGACY_SOMETHING_NEW',
    ])
  })

  // PRV43-OFF3 L-3: a line in another unit whose product is off sale says so too, in the owner's
  // Round 27 wording, which claims nothing about when it went off sale.
  it('says an off-sale line in another unit is not on sale now', async () => {
    await i18n.changeLanguage('en')
    const { lines } = heldForText({
      causes: ['LEGACY_PRICE_UNIT_NOT_COMPARABLE'],
      lines: [
        line({
          line: 2,
          cause: 'LEGACY_PRICE_UNIT_NOT_COMPARABLE',
          unitPrice: 10,
          unitCode: 'XCT',
          productUnitCode: 'EA',
          notOnSale: true,
        }),
        line({
          line: 3,
          cause: 'LEGACY_PRICE_UNIT_NOT_COMPARABLE',
          unitPrice: 10,
          unitCode: 'XCT',
          productUnitCode: 'EA',
        }),
      ],
    })
    expect(lines.map((entry) => heldForMessage(i18n.t, entry))).toEqual([
      'Line 2: sold at 10.000 per XCT; the catalogue price is 2.000 per EA, not converted',
      'Line 2 was sold offline and is not on sale now.',
      'Line 3: sold at 10.000 per XCT; the catalogue price is 2.000 per EA, not converted',
    ])
  })
})
