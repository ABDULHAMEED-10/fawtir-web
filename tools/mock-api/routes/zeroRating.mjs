/**
 * Zero-rating by HS code (`/v1/zero-rating`, INCOME.md Z.1, Z.15): the lists' dates and the item
 * form's suggestion, from the cut of the lists in `../lib/zeroRating.mjs`. Read-only.
 */

import { LISTS, matchesFor, today } from '../lib/zeroRating.mjs'

export default [
  {
    match: '/api/v1/zero-rating/lists',
    reply: () => ({
      lists: LISTS.map(({ codes, ...list }) => ({ ...list, codeCount: codes.length })),
    }),
  },
  {
    match: '/api/v1/zero-rating/hs-suggestion',
    reply: ({ query }) => {
      const hsCode = query.get('hsCode') ?? ''
      if (!/^\d{12}$/.test(hsCode)) {
        return {
          status: 400,
          body: {
            type: 'https://api.fawtir.om/problems/validation-failed',
            status: 400,
            code: 'ZERO_RATING_HS_CODE_INVALID',
          },
        }
      }
      const date = query.get('date') ?? today()
      const matches = matchesFor(hsCode, date)
      const reasons = [...new Set(matches.map((m) => m.reasonCode))]
      return {
        hsCode,
        judgedOn: date,
        suggestedTaxCategory: matches.length ? 'Z' : null,
        suggestedReasonCode: reasons.length === 1 ? reasons[0] : null,
        suggestedReasonCodes: reasons,
        matches,
      }
    },
  },
]
