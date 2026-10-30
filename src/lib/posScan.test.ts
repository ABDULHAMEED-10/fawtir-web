import { describe, expect, it, vi } from 'vitest'
import { ScanBurst, captureScans, findOnShelf, isTypingTarget } from './posScan'
import { shelfItem } from './posShelf'
import type { ProductDto } from '../api/catalog/products'

const product = (id: string, patch: Partial<ProductDto> = {}): ProductDto =>
  ({
    id,
    code: id.toUpperCase(),
    name: id,
    description: null,
    defaultUnitCode: 'EA',
    defaultUnitPrice: 1,
    defaultTaxCategory: 'S',
    defaultTaxRate: 5,
    active: true,
    version: 0,
    effectivePrice: 1,
    availableHere: true,
    ...patch,
  }) as ProductDto

const variant = (id: string, barcode: string | null, onSale = true) => ({
  id,
  sizeId: `s-${id}`,
  size: id,
  optionId: null,
  option: null,
  name: id,
  code: id,
  priceOverride: null,
  price: 1,
  onSale,
  barcode,
})

const shelf = [
  shelfItem(product('cups', { barcode: '111111' }), false),
  shelfItem(
    product('beans', { variants: [variant('v-250', '222222'), variant('v-1k', '333333', false)] }),
    false,
  ),
  shelfItem(product('off', { barcode: '444444', availableHere: false }), false),
]

describe('findOnShelf', () => {
  it("matches a product's own barcode, then a size's", () => {
    expect(findOnShelf(shelf, ' 111111 ')).toMatchObject({ item: { id: 'cups' }, variantId: null })
    expect(findOnShelf(shelf, '222222')).toMatchObject({
      item: { id: 'beans' },
      variantId: 'v-250',
    })
  })

  it('skips a size off sale and an item the branch does not sell', () => {
    expect(findOnShelf(shelf, '333333')).toBeNull()
    expect(findOnShelf(shelf, '444444')).toBeNull()
    expect(findOnShelf(shelf, '')).toBeNull()
  })
})

describe('ScanBurst', () => {
  const type = (burst: ScanBurst, text: string, start: number, gap: number) => {
    let now = start
    let result: string | null = null
    for (const key of [...text, 'Enter']) {
      result = burst.key(key, now)
      now += gap
    }
    return result
  }

  it('takes fast keys ended by Enter as a scan', () => {
    expect(type(new ScanBurst(), '6291100500017', 0, 8)).toBe('6291100500017')
  })

  it('leaves a person typing, and a burst shorter than the minimum, alone', () => {
    expect(type(new ScanBurst(), '6291100500017', 0, 150)).toBeNull()
    expect(type(new ScanBurst(), '12', 0, 5)).toBeNull()
    expect(type(new ScanBurst({ minLength: 2 }), '12', 0, 5)).toBe('12')
  })

  it('a slow first key does not spoil the scan that follows; a pause inside one does', () => {
    const burst = new ScanBurst()
    burst.key('x', 0)
    expect(type(burst, '123456', 1000, 5)).toBe('123456')
    const paused = new ScanBurst({ maxGapMs: 30 })
    paused.key('1', 0)
    paused.key('2', 5)
    paused.key('3', 200)
    expect(paused.key('Enter', 205)).toBeNull()
  })
})

describe('isTypingTarget', () => {
  it('a text field, a text area and editable content are typing; a button is not', () => {
    const input = document.createElement('input')
    const number = Object.assign(document.createElement('input'), { type: 'number' })
    const checkbox = Object.assign(document.createElement('input'), { type: 'checkbox' })
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    expect(isTypingTarget(input)).toBe(true)
    expect(isTypingTarget(number)).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    expect(isTypingTarget(checkbox)).toBe(false)
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
  })
})

describe('captureScans', () => {
  const press = (target: EventTarget, key: string, timeStamp: number) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    target.dispatchEvent(event)
    return event
  }

  it('catches a scan with focus on a button and stops its Enter; leaves a text field alone', () => {
    const onScan = vi.fn()
    const stop = captureScans(onScan)
    const button = document.body.appendChild(document.createElement('button'))
    const field = document.body.appendChild(document.createElement('input'))
    try {
      ;[...'987654'].forEach((key, i) => press(button, key, 10 + i * 5))
      const enter = press(button, 'Enter', 45)
      expect(onScan).toHaveBeenCalledWith('987654')
      expect(enter.defaultPrevented).toBe(true)

      ;[...'987654'].forEach((key, i) => press(field, key, 100 + i * 5))
      expect(press(field, 'Enter', 135).defaultPrevented).toBe(false)
      expect(onScan).toHaveBeenCalledTimes(1)
    } finally {
      stop()
      button.remove()
      field.remove()
    }
  })
})
