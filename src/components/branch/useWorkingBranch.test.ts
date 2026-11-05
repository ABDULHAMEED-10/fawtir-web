import { describe, expect, it } from 'vitest'
import { branchDisplayName } from '../../api/settings/branches'
import { workingBranch } from '../../lib/workingBranch'
import { branchRows } from './useWorkingBranch'

/*
 * B5-C3: `GET /v1/branches` answers a caller without `branch.read` with a minimal projection, sure
 * of id and name only. The working branch is built from those two and nothing else is relied on.
 */
describe('the branch rows the working branch is chosen from (B5-C3)', () => {
  it('takes a minimal projection of id and name, with no type or city made up', () => {
    expect(branchRows([{ id: 'b-seeb', name: 'Seeb' }])).toEqual([
      { id: 'b-seeb', name: 'Seeb', code: '' },
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
      { id: 'b-2', name: 'Sohar', code: 'SOH' },
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
    ).toEqual([{ id: 'b-6', name: 'Kept', code: '' }])
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

/*
 * Backend C3 (65fc3ad41): without `branch.read` each row is only {id, code, name, nameAr}. No
 * `type` and no `city` may be invented or relied on, and the Arabic name is shown in Arabic.
 */
describe('the lookup projection a stock, till or catalogue reader gets (C3)', () => {
  const LOOKUP = [
    { id: 'b-seeb', code: 'SEB', name: 'Seeb', nameAr: 'السيب' },
    { id: 'b-hq', code: 'HQ', name: 'Head office', nameAr: null },
  ]

  it('keeps exactly what was sent: no type, no city', () => {
    const rows = branchRows(LOOKUP)
    expect(rows).toEqual([
      { id: 'b-seeb', code: 'SEB', name: 'Seeb', nameAr: 'السيب' },
      { id: 'b-hq', code: 'HQ', name: 'Head office' },
    ])
    for (const row of rows) {
      expect('type' in row).toBe(false)
      expect('city' in row).toBe(false)
    }
  })

  it('without a type no row passes for the head office: the sidebar choice, else the first row', () => {
    const rows = branchRows(LOOKUP)
    expect(workingBranch(rows, null)?.id).toBe('b-seeb')
    expect(workingBranch(rows, 'b-hq')?.id).toBe('b-hq')
  })

  it("names the branch by its own nameAr in Arabic, and by its name in English or when it has none", () => {
    const [seeb, hq] = branchRows(LOOKUP)
    expect(branchDisplayName(seeb, 'ar')).toBe('السيب')
    expect(branchDisplayName(seeb, 'en')).toBe('Seeb')
    expect(branchDisplayName(hq, 'ar')).toBe('Head office')
  })
})
