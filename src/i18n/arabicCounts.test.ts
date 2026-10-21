import { describe, expect, it } from 'vitest'
import i18n from '.'

/**
 * Arabic words a counted noun by the number: «7 أيام», «14 يومًا», «120 يوم». A string that fixes
 * one form after a figure is right for some figures only, so these strings name the count without
 * a counted noun after it («عدد أيامها 7»). Each is checked with a figure from every band.
 */
const ar = (key: string, values: Record<string, unknown>) => i18n.t(key, { ...values, lng: 'ar' })

// A figure followed directly by a counted noun, the shape that is only right for one band.
const FIXED_FORM = /\d+\s*(?:<\/b>\s*)?(?:يومًا|أيام|مستندًا|مستندات)/

describe('Arabic counts read for any figure', () => {
  for (const n of [1, 2, 7, 14, 120]) {
    it(`words ${n} without a fixed plural form`, () => {
      const strings = [
        ar('plans.faq.a1', { days: n, documents: n }),
        ar('plan.leftAbout', { count: n, days: n }),
        ar('plan.runOutBodyPeriod', { perDay: 3, days: n, short: 4 }),
        ar('plan.comfortableBodyPeriod', { perDay: 3, days: n, spare: 4 }),
        ar('console.tenantDetail.period.trialAllowance', { documents: n }),
        ar('console.subscriptions.event.trialStarted', { days: n }),
        ar('console.subscriptions.event.quotaGranted', { documents: n, expires: 'D', reason: 'R' }),
        ar('console.subscriptions.queue.kpi.graceNote', { days: n }),
      ]
      for (const text of strings) {
        expect(text).toContain(String(n))
        expect(text).not.toMatch(FIXED_FORM)
      }
    })
  }

  it('keeps the trial answer whole: days and documents, nothing charged', () => {
    const text = ar('plans.faq.a1', { days: 7, documents: 25 })
    expect(text).toContain('عدد أيامها 7')
    expect(text).toContain('وعدد مستنداتها 25')
  })
})

describe('Allowance wording', () => {
  it('names the dashboard tile by documents, as the usage tile does', () => {
    expect(i18n.t('dashboard.quota.title', { lng: 'en' })).toBe('Documents this period')
    expect(i18n.t('dashboard.quota.title', { lng: 'ar' })).toBe('مستندات هذه الفترة')
  })

  it('never says documents past the allowance are charged after the fact', () => {
    for (const lng of ['en', 'ar']) {
      for (const key of ['bills.line.overageOn', 'console.tenantDetail.period.overageOn']) {
        const text = i18n.t(key, { rate: '0.150', lng })
        expect(text).not.toMatch(/Charged at|are billed at|تُحتسب بـ|تُفوتر بسعر/)
        expect(text).toMatch(/ahead|مسبقًا/)
      }
    }
  })
})
