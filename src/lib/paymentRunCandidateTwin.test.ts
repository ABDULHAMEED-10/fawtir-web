import { describe, expect, it } from 'vitest'
import { candidateTwinOf } from './paymentRuns'

describe('candidateTwinOf (batch 39 EXP §5)', () => {
  it('prefers the sure twin, then the possible one, else nothing', () => {
    expect(candidateTwinOf({ duplicateOf: 'a', possibleDuplicateOf: 'b' })).toEqual({ certainty: 'sure', otherId: 'a' })
    expect(candidateTwinOf({ possibleDuplicateOf: 'b' })).toEqual({ certainty: 'possible', otherId: 'b' })
    expect(candidateTwinOf({})).toBeNull()
    expect(candidateTwinOf({ duplicateOf: null, possibleDuplicateOf: null })).toBeNull()
  })
})
