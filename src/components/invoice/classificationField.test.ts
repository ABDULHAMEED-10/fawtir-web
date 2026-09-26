import { describe, expect, it } from 'vitest'
import { hsOptionLabel } from './ClassificationField'

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
