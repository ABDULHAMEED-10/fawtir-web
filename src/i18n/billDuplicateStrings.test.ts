import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import ar from './locales/ar.json'

function lookup(locale: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], locale)
}

// Owner round 23 approved the first four EN texts as written, and round 24 the next two (the L-3
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
  // Owner Round 33 approved the M-1 timeline label ("Listed by the person who recorded it",
  // named in the M-1 approval) and the four reviewer-corrected texts (PRV43-EXP6 L-4, L-5, L-7,
  // L-8b); Round 34 the other seven Round 25 and Round 28 texts as written. English only: the
  // Arabic of every one of them waits for native sign-off, so its presence below proves only
  // that an Arabic reader never sees a key, not that the Arabic is approved.
  ['billDetail.activity.kind.DUPLICATE_OVERRIDDEN', 'Listed by the person who recorded it'],
  [
    'billDetail.duplicate.coincidences.intro',
    "Peppol documents filed under other suppliers that have, or had when this bill was held, the same number, type, date, total and currency. Nothing shows they are from this supplier, so they are not confirmed duplicates. Check each one's status and review them before you decide.",
  ],
  ['billDetail.duplicate.coincidences.status.FOUND_SINCE_HOLD', 'Not attached when the bill was held'],
  [
    'billDetail.duplicate.refused.evidenceChanged',
    'The potential coincidences beside this hold changed since you opened the bill. Review them as they stand now before you decide.',
  ],
  [
    'supplierCreditNotes.upload.savedHeldAsDuplicate',
    'Saved. This note is held as a possible duplicate. Its credit cannot be used unless an approver decides it is not a duplicate.',
  ],
  [
    'billIntake.scan.savedStatusUnknown',
    'The bill was saved. Open it to see whether it is waiting for a decision.',
  ],
  [
    'billIntake.duplicate.bodyFiguresOnly',
    'A bill {{number}} with the same details is already recorded, but nothing shows it is from this supplier: dated {{date}}, {{total}}, {{source}}. It may be a coincidence.',
  ],
  ['billDetail.duplicate.coincidences.title', 'Potential coincidences'],
  ['billDetail.duplicate.coincidences.notOnFile', 'No longer on file'],
  ['billDetail.duplicate.coincidences.status.ATTACHED_STILL_MATCHES', 'Still matches'],
  ['billDetail.duplicate.coincidences.status.ATTACHED_NO_LONGER_MATCHES', 'No longer matches'],
  [
    'supplierCreditNotes.upload.savedStatusUnknown',
    "Saved. Check this note's status to see whether it is waiting for a decision.",
  ],
]

/** The {{placeholders}} of a text, sorted, so a translation that drops or renames one is caught. */
function placeholders(text: unknown): string[] {
  return [...String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((found) => found[1]).sort()
}

describe('batch 43 duplicate strings (rounds 20 to 34)', () => {
  it.each(APPROVED)('%s reads exactly as approved in English', (key, text) => {
    expect(lookup(en, key)).toBe(text)
  })

  it.each(APPROVED)('%s has an Arabic text of its own, pending native sign-off', (key) => {
    const arabic = lookup(ar, key)
    expect(typeof arabic).toBe('string')
    expect(arabic).not.toBe(lookup(en, key))
    expect(arabic as string).toMatch(/[\u0600-\u06FF]/)
  })

  it.each(APPROVED)('%s keeps the same placeholders in Arabic', (key) => {
    expect(placeholders(lookup(ar, key))).toEqual(placeholders(lookup(en, key)))
  })

  it('the corrected Round 28 texts are gone, so none can come back by a stale merge', () => {
    for (const stale of [
      'Recorded as different from these documents',
      'Recorded over possible duplicates',
      'Found since the bill was held',
      'These potential coincidences changed since you opened the bill. Review them again before you decide.',
    ]) {
      expect(JSON.stringify(en)).not.toContain(stale)
    }
  })
})
