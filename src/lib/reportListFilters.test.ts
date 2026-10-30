import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { listFilterLabels } from './reportListFilters'

/** Every parameter the server's ListsCatalogue.standard() declares today (main and #817). */
const SERVER_PARAMETERS = [
  'state', 'type', 'customer_id', 'from', 'to', 'search', 'status', 'filter', 'q',
  'direction', 'document_kind', 'invoice_number', 'tax_year', 'tdd_status',
]

const lookup = (bundle: unknown, key: string) =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle)

describe('Reports › Lists filters, in words (NEW-2)', () => {
  it('names every parameter the server declares, in both languages, never by its query name', () => {
    for (const parameter of SERVER_PARAMETERS) {
      const [label] = listFilterLabels([parameter])
      expect(label, parameter).toHaveProperty('key')
      const key = (label as { key: string }).key
      expect(typeof lookup(en, key), `${key} in en`).toBe('string')
      expect(typeof lookup(ar, key), `${key} in ar`).toBe('string')
    }
    expect(Object.keys(en.reports.lists.parameter).sort()).toEqual(
      Object.keys(ar.reports.lists.parameter).sort(),
    )
  })

  it('reads from and to as one period, and lists a label once in the order it first appears', () => {
    expect(listFilterLabels(['state', 'type', 'customer_id', 'from', 'to'])).toEqual([
      { key: 'reports.lists.parameter.status' },
      { key: 'reports.lists.parameter.type' },
      { key: 'reports.lists.parameter.customer' },
      { key: 'reports.lists.parameter.period' },
    ])
    expect(listFilterLabels(['filter', 'q'])).toEqual([
      { key: 'reports.lists.parameter.workflowStage' },
      { key: 'reports.lists.parameter.search' },
    ])
  })

  it('keeps the server’s name for a parameter it does not know, an inherited name included', () => {
    expect(listFilterLabels(['branch', 'constructor', 'branch'])).toEqual([
      { text: 'branch' },
      { text: 'constructor' },
    ])
  })
})
