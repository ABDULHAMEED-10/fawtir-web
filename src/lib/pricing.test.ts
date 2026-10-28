import { describe, expect, it } from 'vitest'
import { formatBaisa } from './pricing'

describe('baisa as rial', () => {
  it('formats baisa as rial without float drift', () => {
    expect(formatBaisa(840_000)).toBe('840.000')
    expect(formatBaisa(66_667)).toBe('66.667')
    expect(formatBaisa(5)).toBe('0.005')
    expect(formatBaisa(-1_250)).toBe('-1.250')
  })
})
