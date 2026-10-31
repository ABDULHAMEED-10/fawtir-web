import { describe, expect, it } from 'vitest'
import i18n from '.'
import arLocale from './locales/ar.json'
import enLocale from './locales/en.json'

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

describe('Arabic plural forms', () => {
  const flat = (node: object, prefix = '', out: Record<string, string> = {}) => {
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object') flat(value, `${prefix}${key}.`, out)
      else out[`${prefix}${key}`] = String(value)
    }
    return out
  }
  const FORMS = ['zero', 'one', 'two', 'few', 'many', 'other']

  // Arabic asks i18next for six forms; a missing one falls through to the English sentence.
  it('has every form, or a plain fallback, for each English plural', () => {
    const arabic = flat(arLocale)
    const bases = Object.keys(flat(enLocale))
      .filter((key) => key.endsWith('_other'))
      .map((key) => key.slice(0, -'_other'.length))
      .filter((base) => !base.endsWith('_ordinal'))
    const missing = bases.filter(
      (base) =>
        arabic[base] === undefined && FORMS.some((form) => arabic[`${base}_${form}`] === undefined),
    )
    expect(missing).toEqual([])
  })

  it.each([
    ['pos.close.notYetFiled', { count: 9 }, '9 عمليات لم تُقبل بعد'],
    ['pos.close.cashTakenNote', { count: 7, sales: 7 }, '7 عمليات دُفعت نقدًا كليًا أو جزئيًا'],
    ['pos.close.terminalTotalNote', { count: 4, payments: 4, amount: 'X' }, '4 دفعات'],
    ['pos.today.soldNote', { count: 7, sales: 7, average: '1' }, '7 عمليات'],
    ['changePrices.apply', { count: 3 }, 'غيّر 3 أسعار'],
  ])('reads %s in Arabic with the right noun', (key, values, expected) => {
    expect(ar(key, values)).toContain(expected)
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
