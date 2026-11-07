import { describe, expect, it } from 'vitest'
import { candidateTwinOf } from './paymentRuns'

describe('candidateTwinOf (batch 39 EXP §5)', () => {
  it('prefers the sure twin, then the possible one, else nothing', () => {
    expect(candidateTwinOf({ duplicateOf: 'a', possibleDuplicateOf: 'b' })).toEqual({ certainty: 'sure', otherId: 'a' })
    expect(candidateTwinOf({ possibleDuplicateOf: 'b' })).toEqual({ certainty: 'possible', otherId: 'b' })
    expect(candidateTwinOf({})).toBeNull()
    expect(candidateTwinOf({ duplicateOf: null, possibleDuplicateOf: null })).toBeNull()
  })

  // PRV-b39 E-1: the upload whose Peppol copy is held is the bill to pay.
  it('names the held Peppol copy first, never "the same as another", and ignores it when null', () => {
    expect(candidateTwinOf({ heldCopyId: 'h', duplicateOf: null })).toEqual({ certainty: 'heldCopy', otherId: 'h' })
    expect(candidateTwinOf({ heldCopyId: 'h', duplicateOf: 'a' })).toEqual({ certainty: 'heldCopy', otherId: 'h' })
    expect(candidateTwinOf({ heldCopyId: null, duplicateOf: 'a' })).toEqual({ certainty: 'sure', otherId: 'a' })
  })
})
