import { describe, expect, it } from 'vitest'
import { saleLineOfRefundWarning } from './posRefund'

// Sale lines 3 and 5 refunded: the credit note numbers them 1 and 2 (contract matrix §3).
const refund = {
  lines: [
    { lineNumber: 1, originalLineNumber: 3 },
    { lineNumber: 2, originalLineNumber: 5 },
  ],
}

describe('saleLineOfRefundWarning (B37 WEB-3)', () => {
  it('names the sale line for a stock warning, which the server numbers on the credit note', () => {
    expect(saleLineOfRefundWarning({ code: 'STOCK_UNIT_MISMATCH', line: 2 }, refund)).toBe(5)
    expect(saleLineOfRefundWarning({ code: 'STOCK_RETURN_EXCEEDS_SALE', line: 1 }, refund)).toBe(3)
  })

  it('keeps a warning that already names the sale line', () => {
    expect(saleLineOfRefundWarning({ code: 'POS_GOODS_FLAG_CLEARED', line: 5 }, refund)).toBe(5)
    expect(saleLineOfRefundWarning({ code: 'POS_REFUND_PIECE_CARRIED', line: 3 }, refund)).toBe(3)
  })

  it("keeps the server's number when the answer carries no lines, and a warning with no line", () => {
    expect(saleLineOfRefundWarning({ code: 'STOCK_UNIT_MISMATCH', line: 2 }, {})).toBe(2)
    expect(saleLineOfRefundWarning({ code: 'STOCK_VARIANT_UNKNOWN', line: null }, refund)).toBeNull()
  })
})
