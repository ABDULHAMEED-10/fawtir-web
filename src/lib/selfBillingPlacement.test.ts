import { describe, expect, it } from 'vitest'
import { DASHBOARD_NAV, EXPENDITURE_PATHS, INCOME_PATHS } from './dashboard'
import { featureForPath } from './planAccess'

// Owner decision, 6 Oct 2026: a self-billed invoice is a purchase written on the supplier's
// behalf, so self-billing sits under Expenditure (the Figma placement under Income was a slip).
const children = (id: string) =>
  DASHBOARD_NAV.flatMap((group) => group.items).find((item) => item.id === id)?.children ?? []

describe('self-billing placement', () => {
  it('is in the Expenditure menu, right after Bills, and not in Income', () => {
    const expenditure = children('expenditure').map((child) => child.id)
    expect(expenditure.indexOf('selfBilling')).toBe(expenditure.indexOf('bills') + 1)
    expect(children('expenditure').find((child) => child.id === 'selfBilling')?.to).toBe(
      '/expenditure/self-billing',
    )
    expect(children('income').map((child) => child.id)).not.toContain('selfBilling')
  })

  it('lights the Expenditure section and keeps its plan gate', () => {
    expect(EXPENDITURE_PATHS).toContain('/expenditure/self-billing')
    expect(INCOME_PATHS.some((path) => path.includes('self-billing'))).toBe(false)
    expect(featureForPath('/expenditure/self-billing/new')).toBe('selfBilling')
  })
})
