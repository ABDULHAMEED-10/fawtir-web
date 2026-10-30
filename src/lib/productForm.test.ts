import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import type { ProductDto } from '../api/catalog/products'
import { SEEDED_TAX_CATEGORIES } from '../testing/referenceData'
import {
  productFieldsFrom,
  productFormProblems,
  productRefusal,
  productRequestFrom,
} from './productForm'

const STORED: ProductDto = {
  id: 'p-1',
  code: 'DATES-KH',
  name: 'Khalas dates 1kg',
  description: 'Loose, 1 kg box',
  defaultUnitCode: 'KGM',
  defaultUnitPrice: 3.2,
  defaultTaxCategory: 'Z',
  defaultTaxRate: 0,
  classificationGoodsOrService: 'G',
  classificationIsicCode: '107900',
  classificationHsCode: '080410000000',
  classificationServiceTypeCode: '00000000',
  active: true,
  archivedAt: null,
  version: 3,
}

const refusal = (code: string, status = 400) =>
  new ApiError({ status, problemType: 'validation-failed', code })

describe('the catalogue item form against /v1/products', () => {
  it("fills from a stored product and sends it back in the backend's own field names", () => {
    const fields = productFieldsFrom(SEEDED_TAX_CATEGORIES, STORED)
    expect(fields).toMatchObject({
      itemType: 'goods',
      code: 'DATES-KH',
      unit: 'KGM',
      basePrice: '3.200',
      taxCode: 'Z0',
      hsCode: '080410000000',
      serviceType: '',
      isicCode: '107900',
    })
    expect(productRequestFrom(SEEDED_TAX_CATEGORIES, fields)).toEqual({
      code: 'DATES-KH',
      name: 'Khalas dates 1kg',
      description: 'Loose, 1 kg box',
      defaultUnitCode: 'KGM',
      defaultUnitPrice: 3.2,
      defaultTaxCategory: 'Z',
      defaultTaxRate: 0,
      classification: {
        goodsOrService: 'G',
        industrialClassificationCode: '107900',
        hsCode: '080410000000',
        serviceTypeCode: null,
      },
      // The fields added for P.3 to P.5, under the backend's names.
      defaultTaxReasonCode: null,
      defaultTaxReasonText: null,
      nameAr: null,
      barcode: null,
      kindId: null,
      itemKind: 'HAND_OVER',
      priceEntryIncludesVat: false,
      staffCanChangePrice: false,
      keepCount: false,
      defaultDiscount: null,
      sizes: [],
      variants: [],
      addOns: [],
    })
  })

  it('sends a service without an HS code, and an exempt product without a rate', () => {
    const fields = {
      ...productFieldsFrom(SEEDED_TAX_CATEGORIES, STORED),
      itemType: 'service' as const,
      serviceType: '',
      taxCode: 'E0',
    }
    expect(productRequestFrom(SEEDED_TAX_CATEGORIES, fields)).toMatchObject({
      defaultTaxCategory: 'E',
      defaultTaxRate: null,
      classification: { goodsOrService: 'S', hsCode: null, serviceTypeCode: null },
    })
  })

  it('keeps a size’s hand-set Arabic line name when the item is saved (backend #808)', () => {
    const variant = (id: string, name: string, nameAr: string | null, nameArSet: boolean) => ({
      id: `v-${id}`,
      sizeId: id,
      size: name,
      optionId: null,
      option: null,
      name: `Dates · ${name}`,
      code: `D-${id}`,
      priceOverride: null,
      price: 3.2,
      onSale: true,
      nameAr,
      nameArSet,
    })
    const fields = productFieldsFrom(SEEDED_TAX_CATEGORIES, {
      ...STORED,
      sizes: [
        { id: 's-1', name: '1 kg', nameAr: null, priceDelta: 0, sortOrder: 0 },
        { id: 's-2', name: '5 kg', nameAr: null, priceDelta: 12, sortOrder: 1 },
      ],
      options: [],
      variants: [
        variant('s-1', '1 kg', 'تمر خلاص كيلو', true),
        variant('s-2', '5 kg', 'محسوب', false),
      ],
      addOns: [],
    })
    const [kilo, five] = productRequestFrom(SEEDED_TAX_CATEGORIES, fields).variants ?? []
    expect(kilo).toMatchObject({ size: '1 kg', nameAr: 'تمر خلاص كيلو' })
    expect(five).not.toHaveProperty('nameAr')
  })

  it('reads a product with no classification as goods or service by its unit', () => {
    const fields = productFieldsFrom(SEEDED_TAX_CATEGORIES, {
      ...STORED,
      defaultUnitCode: 'HUR',
      classificationGoodsOrService: null,
      classificationHsCode: null,
    })
    expect(fields.itemType).toBe('service')
  })

  it('refuses a goods item without a 12-digit HS code before sending (IBR-080-OM)', () => {
    const fields = { ...productFieldsFrom(SEEDED_TAX_CATEGORIES, STORED), hsCode: '0804' }
    expect(productFormProblems(fields)).toEqual([
      { field: 'hsCode', key: 'itemForm.problem.hsCode' },
    ])
    expect(productFormProblems({ ...fields, itemType: 'service' })).toEqual([])
  })

  it('words the server refusals on their field, and leaves unknown ones to the general message', () => {
    expect(productRefusal(refusal('PRODUCT_CODE_DUPLICATE', 409))).toMatchObject({
      field: 'code',
      key: 'itemForm.refused.codeTaken',
    })
    expect(productRefusal(refusal('PRODUCT_VERSION_CONFLICT', 409))).toMatchObject({
      field: null,
      code: 'PRODUCT_VERSION_CONFLICT',
    })
    expect(productRefusal(refusal('SOMETHING_ELSE'))).toBeNull()
    expect(productRefusal(new Error('x'))).toBeNull()
  })
})

describe('a refusal code named like an Object.prototype member', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('is no product refusal: %j', (code) => {
    expect(productRefusal(refusal(code, 409))).toBeNull()
  })
})
