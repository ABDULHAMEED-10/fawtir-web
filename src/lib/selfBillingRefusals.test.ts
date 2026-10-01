import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { describeApiFailure } from './apiFailure'
import { issueRefusalOf } from './invoiceIssue'
import {
  isSelfBilledSupplierSwitchedOff,
  selfBilledIssueMessageKey,
  selfBillingMessageKey,
} from './selfBillingRefusals'

const refused = (status: number, code: string) =>
  new ApiError({ status, problemType: 'request-rejected', code })

describe('the counterparty refusals a self-billed issue can meet', () => {
  it.each([
    ['COUNTERPARTY_NOT_SELECTABLE', 'apiErrors.selfBilling.counterpartyInactive'],
    ['COUNTERPARTY_LEGAL_NAME_MISSING', 'apiErrors.selfBilling.counterpartyLegalName'],
    ['COUNTERPARTY_VATIN_MISSING', 'apiErrors.selfBilling.counterpartyVat'],
    ['COUNTERPARTY_ADDRESS_MISSING', 'apiErrors.selfBilling.counterpartyAddress'],
  ])('names %s, as the issue dialog words it', (code, key) => {
    // The invoice handler answers them 400; the dialog's own list does not know them, so the
    // shared failure sentence is what the reader sees.
    const error = refused(400, code)
    expect(issueRefusalOf(error)).toBeNull()
    expect(selfBillingMessageKey(error)).toBe(key)
    expect(describeApiFailure(error).key).toBe(key)
  })

  it('leaves other codes to their own handling', () => {
    expect(selfBillingMessageKey(refused(400, 'COUNTERPARTY_SOMETHING_ELSE'))).toBeNull()
    expect(selfBillingMessageKey(refused(409, 'CUSTOMER_NOT_SELECTABLE'))).toBeNull()
  })
})

describe("the supplier's business activity on a self-billed issue (BTOM-033)", () => {
  it("reads INDUSTRIAL_CLASSIFICATION_REQUIRED as the supplier's missing code on a self-billed issue", () => {
    const error = refused(409, 'INDUSTRIAL_CLASSIFICATION_REQUIRED')
    expect(selfBilledIssueMessageKey(error)).toBe('apiErrors.selfBilling.supplierIsicMissing')
  })

  it("leaves the sales invoice's reading of the same code alone: there it is the tenant's", () => {
    const error = refused(409, 'INDUSTRIAL_CLASSIFICATION_REQUIRED')
    expect(selfBillingMessageKey(error)).toBeNull()
    expect(issueRefusalOf(error)?.key).toBe('invoiceIssue.refused.activityRequired')
    expect(describeApiFailure(error).key).not.toBe('apiErrors.selfBilling.supplierIsicMissing')
  })

  it('still names the other self-billing refusals', () => {
    expect(selfBilledIssueMessageKey(refused(400, 'COUNTERPARTY_VATIN_MISSING'))).toBe(
      'apiErrors.selfBilling.counterpartyVat',
    )
    expect(selfBilledIssueMessageKey(refused(400, 'SOMETHING_ELSE'))).toBeNull()
  })
})

describe('a self-billed issue for a switched-off supplier', () => {
  // The invoice handler's shape on the issue route: its own problem type, the code in `code`.
  const switchedOff = new ApiError({
    status: 400,
    problemType: 'supplier-switched-off',
    code: 'SUPPLIER_SWITCHED_OFF',
  })

  it('is recognised by its code', () => {
    expect(isSelfBilledSupplierSwitchedOff(switchedOff)).toBe(true)
    expect(isSelfBilledSupplierSwitchedOff(refused(400, 'COUNTERPARTY_NOT_SELECTABLE'))).toBe(false)
  })

  it('is named only where the self-bill composer asks: no other screen gains a sentence for it', () => {
    expect(selfBillingMessageKey(switchedOff)).toBeNull()
    expect(issueRefusalOf(switchedOff)).toBeNull()
    expect(describeApiFailure(switchedOff).key).not.toBe('apiErrors.selfBilling.supplierSwitchedOff')
  })
})
