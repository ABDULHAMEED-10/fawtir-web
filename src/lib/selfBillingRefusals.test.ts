import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { describeApiFailure } from './apiFailure'
import { issueRefusalOf } from './invoiceIssue'
import { selfBillingMessageKey } from './selfBillingRefusals'

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
