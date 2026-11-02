import { describe, expect, it } from 'vitest'
import arLocale from '../i18n/locales/ar.json'
import enLocale from '../i18n/locales/en.json'

// The holds page falls back to `pos.offline.reason.other` for a reason it has no label for, so a
// missing label degrades silently instead of failing. Backend fix/b40-off (owner O-1) adds the
// second and widens the first; without this check a dropped key would only show as "Other".
const SHIFT_END_REASONS = ['OUTSIDE_KEY_WINDOW', 'SHIFT_END_UNPROVEN'] as const

type Reasons = Record<string, string>
const reasonsOf = (locale: unknown): Reasons =>
  (locale as { pos: { offline: { reason: Reasons } } }).pos.offline.reason

describe('shift-end hold reasons have their own label', () => {
  for (const [name, locale] of [['en', enLocale], ['ar', arLocale]] as const) {
    for (const reason of SHIFT_END_REASONS) {
      it(`${name}: ${reason}`, () => {
        const label = reasonsOf(locale)[reason]
        expect(typeof label).toBe('string')
        expect(label.trim()).not.toBe('')
        expect(label).not.toBe(reasonsOf(locale).other)
      })
    }
  }
})
