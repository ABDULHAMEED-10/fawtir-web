import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import i18n from '../../i18n'
import type { ReferenceDataDto } from '../../api/reference/referenceData'
import { SEEDED_REFERENCE } from '../../testing/referenceData'
import {
  GOODS_UNITS,
  REC21_PACKAGE_UNITS,
  isBarePackageUnit,
  offeredUnitCode,
} from '../../lib/invoiceDraft'
import { unitOptions as referenceUnitOptions } from '../../lib/reference/referenceData'
import { suggestedFrom } from '../../lib/catalogTemplates'
import { lineFromProduct } from '../../lib/productLine'
import type { ProductDto } from '../../api/catalog/products'
import type { TemplateItemDto } from '../../api/catalog/templates'
import { unitOptions } from './unitOptions'

const en = i18n.getFixedT('en') as unknown as TFunction
const ar = i18n.getFixedT('ar') as unknown as TFunction

const BARE = Object.keys(REC21_PACKAGE_UNITS)

/** The seeded code list with these unit codes, all active. */
const withUnits = (...codes: string[]): ReferenceDataDto => ({
  ...SEEDED_REFERENCE,
  units: codes.map((code) => ({ code, active: true })),
})

describe('Rec 21 package units (PINT-OM ibr-cl-23)', () => {
  it('offers only the X-prefixed form on the goods list', () => {
    for (const code of BARE) expect(GOODS_UNITS as readonly string[]).not.toContain(code)
    expect(GOODS_UNITS).toEqual(
      expect.arrayContaining(['XBX', 'XCT', 'XPK', 'XBG', 'XBO', 'XCA', 'XRO']),
    )
  })

  it('maps each bare code to its X form and leaves other codes alone', () => {
    expect(BARE.map(offeredUnitCode)).toEqual([
      'XBX',
      'XCT',
      'XPK',
      'XBG',
      'XBO',
      'XCA',
      'XRO',
      'XSA',
    ])
    expect(offeredUnitCode('KGM')).toBe('KGM')
    expect(offeredUnitCode('XBX')).toBe('XBX')
    expect(isBarePackageUnit('BX')).toBe(true)
    expect(isBarePackageUnit('XBX')).toBe(false)
  })

  it('names every X code in English and Arabic, with the same word as the bare code', () => {
    for (const bare of BARE) {
      const x = offeredUnitCode(bare)
      for (const t of [en, ar]) {
        for (const group of ['createInvoice.units', 'reference.unit']) {
          expect(i18n.exists(`${group}.${x}`, { lng: t === en ? 'en' : 'ar' })).toBe(true)
          expect(t(`${group}.${x}`)).toBe(t(`createInvoice.units.${bare}`))
        }
      }
    }
  })
})

describe('the line unit picker', () => {
  it('lists Box once while the platform carries both BX and XBX', () => {
    const options = unitOptions('goods', en, undefined, withUnits('EA', 'BX', 'XBX', 'KGM'))
    expect(options.map((option) => option.value)).toEqual(['EA', 'KGM', 'XBX', 'ZZ'])
    expect(options.filter((option) => option.label === 'Box')).toHaveLength(1)
  })

  it('offers XBX when the platform still lists only the bare BX', () => {
    const options = unitOptions('goods', en, undefined, withUnits('EA', 'BX'))
    expect(options.map((option) => option.value)).toEqual(['EA', 'XBX', 'ZZ'])
  })

  it('offers X codes when the code list has not answered', () => {
    const values = unitOptions('goods', en).map((option) => option.value)
    expect(values).toContain('XBX')
    for (const code of BARE) expect(values).not.toContain(code)
  })

  it('keeps a stored bare code on show with its word, greyed beside its X twin', () => {
    const options = unitOptions('goods', ar, 'BX', withUnits('EA', 'XBX'))
    const stored = options.find((option) => option.value === 'BX')
    expect(stored).toMatchObject({ label: 'صندوق', disabled: true })
    expect(options.find((option) => option.value === 'XBX')).toMatchObject({ label: 'صندوق' })
    expect(options.find((option) => option.value === 'XBX')?.disabled).toBeUndefined()
  })
})

describe('the platform unit list', () => {
  it('shows each package unit once, in its X form', () => {
    const options = referenceUnitOptions(withUnits('EA', 'BG', 'XBG', 'PK'), en)
    expect(options.map((option) => option.value)).toEqual(['EA', 'XBG', 'XPK'])
    expect(options.map((option) => option.label)).toEqual(['EA', 'Bag', 'Pack'])
  })

  it('keeps the unit a line already holds, even a bare one the list no longer offers', () => {
    const options = referenceUnitOptions(withUnits('EA', 'XBX'), en, 'BX')
    expect(options.find((option) => option.value === 'BX')).toMatchObject({
      label: 'BX',
      hint: 'Box',
      disabled: true,
    })
  })
})

describe('a catalogue template', () => {
  it('starts a bare package unit in its X form', () => {
    const wipes: TemplateItemDto = {
      name: 'Wipes',
      nameAr: null,
      classification: { goodsOrService: 'G', hsCode: null, serviceTypeCode: null },
      defaultUnitCode: 'PK',
      defaultTaxCategory: 'S',
      defaultTaxReasonCode: null,
      defaultTaxReasonText: null,
      barcode: null,
      variants: null,
      addOns: [],
    }
    const [group] = suggestedFrom([
      { name: 'Cleaning', nameAr: null, kinds: [{ name: 'Wipes', nameAr: null, items: [wipes] }] },
    ])
    expect(group.kinds[0].sizes[0].soldAs).toBe('XPK')
  })
})

describe('a line filled from a saved product', () => {
  const cups: ProductDto = {
    id: 'p-cups',
    code: 'CUP-500',
    name: 'Takeaway cups',
    description: null,
    defaultUnitCode: 'PK',
    defaultUnitPrice: 22.8,
    defaultTaxCategory: 'S',
    defaultTaxRate: 5,
    active: true,
    version: 0,
  }

  it('takes the X form of a bare package unit and leaves the product as it was', () => {
    const line = lineFromProduct(SEEDED_REFERENCE.taxCategories, cups, true)
    expect(line.unit).toBe('XPK')
    expect(cups.defaultUnitCode).toBe('PK')
  })

  it('keeps any other unit as the product holds it', () => {
    const line = lineFromProduct(
      SEEDED_REFERENCE.taxCategories,
      { ...cups, defaultUnitCode: 'KGM' },
      true,
    )
    expect(line.unit).toBe('KGM')
  })
})
