import { describe, expect, it } from 'vitest'
import i18n from '.'

const ar = (key: string, values: Record<string, unknown> = {}) =>
  i18n.t(key, { ...values, lng: 'ar' })
const en = (key: string, values: Record<string, unknown> = {}) =>
  i18n.t(key, { ...values, lng: 'en' })

/**
 * Fawtir's own subscription bill is not a tax invoice, so in Arabic it is «مطالبة», never
 * «فاتورة». These are the customer screens that name it: the dashboard card, the activity log
 * and the subscription notices.
 */
describe('Arabic names the subscription bill «مطالبة»', () => {
  const keys: [string, Record<string, unknown>?][] = [
    ['billDue.title'],
    ['billDue.body', { number: 'FWT-SUB-2026-000001' }],
    ['billDue.cta'],
    ['activityLog.resource.SUBSCRIPTION_BILL'],
    ['activityLog.event.SubscriptionBillIssued'],
    ['activityLog.event.SubscriptionBillSuperseded'],
    ['activityLog.event.SubscriptionBillVoided'],
    ['notes.subscription.grace.title', { ended: '1 Nov 2026' }],
    ['notes.subscription.grace.bodyNoDate'],
    ['notes.subscription.payBill'],
    ...[1, 2, 7, 14, 120].map(
      (count) => ['fawtaraStatus.plan.trial', { count }] as [string, Record<string, unknown>],
    ),
  ]
  for (const [key, values] of keys) {
    it(`${key}${values?.count ? ` (${values.count})` : ''}`, () => {
      const text = ar(key, values)
      expect(text).not.toMatch(/فاتور|فواتير/)
      expect(text).toMatch(/مطالب/)
    })
  }
})

describe('The cancellation dialog says payments are not refunded', () => {
  it('in English, in the rule’s words', () => {
    const text = en('subscription.cancelConfirm.body', { date: '13 Nov 2026' })
    expect(text).toContain('Your subscription stays active until 13 Nov 2026.')
    expect(text).toContain('Payments already made are not refunded.')
  })

  it('in Arabic', () => {
    const text = ar('subscription.cancelConfirm.body', { date: '13 Nov 2026' })
    expect(text).toContain('يبقى اشتراكك فعّالًا حتى 13 Nov 2026.')
    expect(text).toContain('لا تُستردّ المبالغ المدفوعة مسبقًا.')
  })
})

describe('The plan-gate price says "before VAT" only when VAT is charged', () => {
  it('has a wording with no VAT', () => {
    expect(en('planGate.perMonthNoVat')).toBe('a month')
    expect(ar('planGate.perMonthNoVat')).toBe('شهريًا')
    expect(en('planGate.perMonthNoVat')).not.toMatch(/VAT/)
    expect(ar('planGate.perMonthNoVat')).not.toMatch(/الضريبة/)
  })
})

describe('«فوتر» is masculine in Arabic', () => {
  const keys: [string, Record<string, unknown>?][] = [
    ['console.companySubscription.history.kind.OPERATOR_PLAN_CHANGED'],
    ['notes.subscription.cancelledByFawtir.title', { date: '17 Nov 2026' }],
    ['subscription.cancelledByFawtirRefusal'],
    ['fawtaraStatus.declined.title'],
  ]
  for (const [key, values] of keys) {
    it(key, () => {
      expect(ar(key, values)).not.toMatch(/(غيّرت|ألغت|رفضت) فوتر/)
      expect(ar(key, values)).toMatch(/(غيّر|ألغى|رفض) فوتر/)
    })
  }
})

describe('The billing settings subtitle names the months charged a year', () => {
  it('in English and Arabic', () => {
    expect(en('console.billingSettings.subtitle')).toContain('months charged a year')
    expect(ar('console.billingSettings.subtitle')).toContain('الأشهر المحتسبة في السنة')
    expect(ar('console.billingSettings.subtitle')).not.toMatch(/فاتور|فواتير/)
  })
})
