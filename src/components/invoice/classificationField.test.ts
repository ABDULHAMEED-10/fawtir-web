import { describe, expect, it } from 'vitest'
import { HS_OTHER, hsOptionLabel, hsPickerEntries } from './ClassificationField'

describe('an HS option', () => {
  it('shows the last two levels of the heading path', () => {
    expect(
      hsOptionLabel(
        'Live horses, asses, mules and hinnies > Horses > Pure-bred breeding animals > Of Arab breed',
      ),
    ).toBe('Pure-bred breeding animals > Of Arab breed')
    expect(hsOptionLabel('Live horses > Other')).toBe('Live horses > Other')
    expect(hsOptionLabel('Other')).toBe('Other')
  })
})

describe('the HS picker list', () => {
  const coffee = { code: '090121000000', name: 'Coffee > Roasted' }

  it('always offers "Other" (000000000000), whatever was found, even nothing', () => {
    expect(hsPickerEntries([coffee]).map((entry) => entry.code)).toEqual([
      '090121000000',
      '000000000000',
    ])
    expect(hsPickerEntries([])).toEqual([HS_OTHER])
  })

  it('does not list "Other" twice, and keeps a chosen entry in view', () => {
    expect(hsPickerEntries([HS_OTHER, coffee]).filter((e) => e.code === HS_OTHER.code)).toHaveLength(1)
    const chosen = { code: '010121000000', name: 'Horses' }
    expect(hsPickerEntries([coffee], chosen)[0]).toEqual(chosen)
  })
})
