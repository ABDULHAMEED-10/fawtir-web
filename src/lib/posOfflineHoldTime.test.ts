import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { offlineHoldTime } from './posOfflineHolds'

// NOT RUN (batch 43, static only). Owner W41-2 Option 1 (round 9): Muscat time, zone shown.
describe('offline hold times name their zone (W41-2)', () => {
  it('prints Muscat wall time with GMT+4 beside it', () => {
    expect(offlineHoldTime('2026-11-02T06:15:30.123Z')).toBe('02/11/2026, 10:15:30 GMT+4')
  })

  it('shows Muscat time, not the instant in UTC or the machine zone', () => {
    // 22:30 UTC is already the next day in Muscat.
    expect(offlineHoldTime('2026-11-02T22:30:00Z')).toBe('03/11/2026, 02:30:00 GMT+4')
  })

  it('prints nothing for a time the server left out', () => {
    expect(offlineHoldTime(null)).toBe('')
    expect(offlineHoldTime(undefined)).toBe('')
  })

  // Safari before 15.4 and Chrome before 95 (PRV43-OFF L-3).
  describe('on a browser without shortOffset', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    function withoutShortOffset() {
      const real = Date.prototype.toLocaleString
      return vi.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (
        this: Date,
        locales?: Intl.LocalesArgument,
        options?: Intl.DateTimeFormatOptions,
      ) {
        if (options?.timeZoneName === 'shortOffset') {
          throw new RangeError('timeZoneName must be one of short, long')
        }
        return real.call(this, locales, options)
      })
    }

    it('prints the same text, with the zone written out, instead of failing', () => {
      const toLocaleString = withoutShortOffset()
      expect(offlineHoldTime('2026-11-02T06:15:30.123Z')).toBe('02/11/2026, 10:15:30 GMT+4')
      expect(offlineHoldTime('2026-11-02T22:30:00Z')).toBe('03/11/2026, 02:30:00 GMT+4')
      expect(toLocaleString).toHaveBeenCalledWith(
        'en-GB',
        expect.objectContaining({ timeZoneName: 'shortOffset' }),
      )
    })
  })

  it('is the only way the holds page formats a time', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/PosPage/PosOfflineHoldsPage.tsx'), 'utf8')
    // One import from the module, on one line or several (8ddbe07f split it over lines).
    expect(page).toMatch(
      /import {[^}]*\bofflineHoldTime as when\b[^}]*} from '\.\.\/\.\.\/lib\/posOfflineHolds'/,
    )
    expect(page).not.toMatch(/toLocale(?:String|DateString|TimeString)\(|Intl\.DateTimeFormat/)
  })
})
