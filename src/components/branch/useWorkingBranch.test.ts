import { describe, expect, it } from 'vitest'
import { workingBranch } from '../../lib/workingBranch'
import { branchRows } from './useWorkingBranch'

/*
 * B5-C3: `GET /v1/branches` answers a caller without `branch.read` with a minimal projection, sure
 * of id and name only. The working branch is built from those two and nothing else is relied on.
 */
describe('the branch rows the working branch is chosen from (B5-C3)', () => {
  it('takes a minimal projection of id and name, with the other fields empty', () => {
    expect(branchRows([{ id: 'b-seeb', name: 'Seeb' }])).toEqual([
      { id: 'b-seeb', name: 'Seeb', code: '', type: '', city: null },
    ])
  })

  it('keeps the optional fields when the full row is sent', () => {
    expect(
      branchRows([
        { id: 'b-1', name: 'Head', code: 'HQ', type: 'HEAD_OFFICE', city: 'Muscat', nameAr: 'الرئيسي' },
      ]),
    ).toEqual([
      { id: 'b-1', name: 'Head', code: 'HQ', type: 'HEAD_OFFICE', city: 'Muscat', nameAr: 'الرئيسي' },
    ])
  })

  it('keeps a code when the projection carries one, and ignores fields of the wrong type', () => {
    expect(branchRows([{ id: 'b-2', name: 'Sohar', code: 'SOH', type: 7, city: {} }])).toEqual([
      { id: 'b-2', name: 'Sohar', code: 'SOH', type: '', city: null },
    ])
  })

  it('drops rows without a usable id or name, and anything that is not a list', () => {
    expect(
      branchRows([
        { id: '', name: 'No id' },
        { id: 'b-3' },
        { id: 'b-4', name: '   ' },
        { name: 'No id at all' },
        null,
        'b-5',
        { id: 'b-6', name: 'Kept' },
      ]),
    ).toEqual([{ id: 'b-6', name: 'Kept', code: '', type: '', city: null }])
    expect(branchRows({ content: [] })).toEqual([])
    expect(branchRows(null)).toEqual([])
  })

  it('chooses from the projection: the sidebar choice, else the first', () => {
    const rows = branchRows([
      { id: 'b-a', name: 'A' },
      { id: 'b-b', name: 'B' },
    ])
    expect(workingBranch(rows, 'b-b')?.id).toBe('b-b')
    expect(workingBranch(rows, 'b-gone')?.id).toBe('b-a')
  })

  it('has no working branch when there are no rows: a refused read is never guessed', () => {
    expect(workingBranch(branchRows([]), 'b-seeb')).toBeNull()
  })
})
