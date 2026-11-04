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
// changes this list, not the approved one. Round 28 adds the potential coincidences on the bill
// page (O-A Option 1, L-7), their refusal, the note upload's hold sentences (L-4) and the reworded
// DUPLICATE_OVERRIDDEN activity label, all pending too.
const PENDING: [string, string][] = [
  [
    'billIntake.scan.savedStatusUnknown',
    'The bill was saved. Open it to see whether it is waiting for a decision.',
  ],
  [
    'billIntake.duplicate.bodyFiguresOnly',
    'A bill {{number}} with the same details is already recorded, but nothing shows it is from this supplier: dated {{date}}, {{total}}, {{source}}. It may be a coincidence.',
  ],
  ['billDetail.duplicate.coincidences.title', 'Potential coincidences'],
  [
    'billDetail.duplicate.coincidences.intro',
    "Other suppliers' Peppol documents with the same number, date and total. Nothing shows they are from this supplier, so they are not confirmed duplicates. Review them before you decide.",
  ],
  ['billDetail.duplicate.coincidences.notOnFile', 'No longer on file'],
  ['billDetail.duplicate.coincidences.status.ATTACHED_STILL_MATCHES', 'Still matches'],
  ['billDetail.duplicate.coincidences.status.ATTACHED_NO_LONGER_MATCHES', 'No longer matches'],
  ['billDetail.duplicate.coincidences.status.FOUND_SINCE_HOLD', 'Found since the bill was held'],
  [
    'billDetail.duplicate.refused.evidenceChanged',
    'These potential coincidences changed since you opened the bill. Review them again before you decide.',
  ],
  ['billDetail.activity.kind.DUPLICATE_OVERRIDDEN', 'Recorded as different from these documents'],
  [
    'supplierCreditNotes.upload.savedHeldAsDuplicate',
    'Saved. This note is held as a possible duplicate until an approver decides; its credit cannot be used before then.',
  ],
  [
    'supplierCreditNotes.upload.savedStatusUnknown',
    "Saved. Check this note's status to see whether it is waiting for a decision.",
  ],
]

describe('batch 43 duplicate strings (rounds 20 to 28)', () => {
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
