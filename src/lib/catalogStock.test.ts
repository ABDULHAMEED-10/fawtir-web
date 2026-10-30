import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import type { StockMovementDto } from '../api/stock/stock'
import { movementNote, stockItemName, stockItemPlace } from './catalogStock'

/** The stock screens on backend #808 (P.19) and #815 (supplier reference), fields absent before. */

const row = {
  name: 'Coffee beans',
  nameAr: 'بن',
  variantName: '1 kg',
  groupName: 'Beans and ground',
  groupNameAr: 'البن الحب والمطحون',
  kindName: 'Roasted beans',
  kindNameAr: 'بن محمص',
}

describe('group, kind and the Arabic size on a stock row (P.19)', () => {
  it('reads "group › kind" in the reader’s language, and nothing from an older server', () => {
    expect(stockItemPlace(row, 'en')).toBe('Beans and ground › Roasted beans')
    expect(stockItemPlace(row, 'ar')).toBe('البن الحب والمطحون › بن محمص')
    expect(stockItemPlace({ ...row, groupNameAr: null }, 'ar')).toBe('Beans and ground › بن محمص')
    expect(stockItemPlace({}, 'en')).toBeNull()
  })

  it('names the size in Arabic when the row carries it, in English otherwise', () => {
    expect(stockItemName({ ...row, variantNameAr: '1 كغ' }, 'ar')).toBe('بن · 1 كغ')
    expect(stockItemName(row, 'ar')).toBe('بن · 1 kg')
    expect(stockItemName({ ...row, variantNameAr: '1 كغ' }, 'en')).toBe('Coffee beans · 1 kg')
  })
})

describe('the supplier’s reference on a delivery (backend #815)', () => {
  const delivery = {
    id: 'm-1',
    type: 'RECEIPT',
    quantityChange: 12,
    onHandAfter: 20,
    countedQuantity: null,
    unitCost: null,
    averageCostAfter: null,
    source: { type: 'DELIVERY', id: 'd-1', number: 'DLV-1', link: null },
    supplier: { supplierId: 's-1', name: 'Muscat Roastery Co' },
    reasonCode: null,
    note: null,
    occurredAt: '2026-10-24T06:30:00Z',
    recordedAt: '2026-10-24T06:30:00Z',
    by: { userId: null, name: null },
    customerKind: null,
  } as StockMovementDto

  it('shows it after the supplier, and nothing when the server does not send it', () => {
    const t = i18n.getFixedT('en')
    expect(movementNote(t, { ...delivery, supplierReference: 'RS-INV-7781' }, 'en')).toBe(
      'From Muscat Roastery Co · Supplier’s ref. ⁦RS-INV-7781⁩'.replace('’', "'"),
    )
    expect(movementNote(t, delivery, 'en')).toBe('From Muscat Roastery Co')
    expect(
      movementNote(i18n.getFixedT('ar'), { ...delivery, supplierReference: 'RS-INV-7781' }, 'ar'),
    ).toContain('مرجع المورد ⁦RS-INV-7781⁩')
  })
})
