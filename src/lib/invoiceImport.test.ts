import { describe, expect, it } from 'vitest'
import { groupImportWarnings } from './invoiceImport'

describe('import warnings, as the server sends them (IMP-1)', () => {
  it('lists each code and column once with every row it was raised on, in order', () => {
    expect(
      groupImportWarnings([
        { rowNumber: 7, column: 'TAX_CATEGORY', code: 'TAX_CATEGORY_DEFAULTED', severity: 'WARNING', message: 'x' },
        { rowNumber: 6, column: 'TAX_CATEGORY', code: 'TAX_CATEGORY_DEFAULTED', severity: 'WARNING', message: 'x' },
        { rowNumber: 9, column: 'Unit', code: 'SOMETHING_NEW', severity: 'WARNING', message: 'y' },
      ]),
    ).toEqual([
      { code: 'TAX_CATEGORY_DEFAULTED', column: 'TAX_CATEGORY', message: 'x', rows: [6, 7] },
      { code: 'SOMETHING_NEW', column: 'Unit', message: 'y', rows: [9] },
    ])
  })

  it('never throws on an unexpected shape: skips what is not a warning, keeps what it can read', () => {
    expect(
      groupImportWarnings([
        null,
        'oops',
        { column: 'A', code: 'C', message: 'm', rowNumbers: [3, 'x', 2] },
        { column: 'A', code: 'C', message: 'm', rowNumber: '4' },
      ]),
    ).toEqual([{ code: 'C', column: 'A', message: 'm', rows: [2, 3] }])
    expect(groupImportWarnings(undefined)).toEqual([])
  })
})
