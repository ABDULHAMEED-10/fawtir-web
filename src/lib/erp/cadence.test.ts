import { describe, expect, it } from 'vitest'
import { cadenceParts } from './cadence'

describe('cadenceParts', () => {
  it('reads the cadences the scheduler uses', () => {
    expect(cadenceParts('PT5M')).toEqual([{ unit: 'minutes', count: 5 }])
    expect(cadenceParts('PT1H')).toEqual([{ unit: 'hours', count: 1 }])
    expect(cadenceParts('P1D')).toEqual([{ unit: 'days', count: 1 }])
    expect(cadenceParts('PT30S')).toEqual([{ unit: 'seconds', count: 30 }])
  })

  it('keeps every non-zero part, largest first', () => {
    expect(cadenceParts('PT1H30M')).toEqual([
      { unit: 'hours', count: 1 },
      { unit: 'minutes', count: 30 },
    ])
  })

  it('refuses what it cannot name, so the caller shows the code as it is', () => {
    expect(cadenceParts('')).toBeNull()
    expect(cadenceParts('P')).toBeNull()
    expect(cadenceParts('PT')).toBeNull()
    expect(cadenceParts('PT0M')).toBeNull()
    expect(cadenceParts('PT1.5M')).toBeNull()
    expect(cadenceParts('P1W')).toBeNull()
    expect(cadenceParts('five minutes')).toBeNull()
  })
})
