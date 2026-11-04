import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import ar from './locales/ar.json'

function lookup(locale: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], locale)
}

// Owner round 23 approved the first four EN texts as written, and round 24 the last two (the L-3
// split). A screen shows the key itself when a locale lacks it, so a missing AR entry would put
// "billIntake.duplicate..." in front of an Arabic reader.
const APPROVED: [string, string][] = [
  [
    'billIntake.duplicate.unknown',
    'One of the bills it was compared with is no longer on file, or no longer matches this bill. Save again to check it afresh.',
  ],
  [
    'billIntake.scan.savedHeld',
    'Saved as a bill and held as a possible duplicate. It is waiting for an authorized invoice approver, other than the person who recorded it, to decide. It has not been approved or paid.',
  ],
  [
    'billIntake.refused.paymentOnHold',
    "This bill will be held as a possible duplicate, so its payment can't be recorded now. Save it without the payment, and record the payment once an authorized invoice approver has resolved the hold.",
  ],
  [
    'billDetail.duplicate.refused.recorderUnknown',
    "This duplicate can't be decided here: one of these bills was recorded by a person, but who recorded it isn't on file. Contact support.",
  ],
  [
    'billIntake.duplicate.unknownNotFound',
    'One of the bills it was compared with is no longer on file. Save again to check it afresh.',
  ],
  [
    'billIntake.duplicate.unknownNoLongerMatches',
    'One of the bills it was compared with is still on file but no longer matches this bill. Save again to check it afresh.',
  ],
]

// Round 25 (W-1) needs this one for a server that does not say whether it holds the bill. Its EN
// text is PENDING owner approval, so it is pinned apart from APPROVED: an approval that rewords it
// changes this list, not the approved one.
const PENDING: [string, string][] = [
  [
    'billIntake.scan.savedStatusUnknown',
    'The bill was saved. Open it to see whether it is waiting for a decision.',
  ],
]

describe('batch 43 duplicate strings (rounds 20 to 25)', () => {
  it.each(APPROVED)('%s reads exactly as approved in English', (key, text) => {
    expect(lookup(en, key)).toBe(text)
  })

  it.each(PENDING)('%s reads as proposed in English, pending approval', (key, text) => {
    expect(lookup(en, key)).toBe(text)
  })

  it.each([...APPROVED, ...PENDING])('%s has an Arabic text of its own', (key) => {
    const arabic = lookup(ar, key)
    expect(typeof arabic).toBe('string')
    expect(arabic).not.toBe(lookup(en, key))
    expect(arabic as string).toMatch(/[\u0600-\u06FF]/)
  })
})
