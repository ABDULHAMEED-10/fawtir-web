import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en.json'
import ar from '../../i18n/locales/ar.json'
import { PAYMENT_EVENT_KINDS } from './billingPayments'

describe('Console › payment history labels', () => {
  it.each(PAYMENT_EVENT_KINDS)('labels %s in English and Arabic', (kind) => {
    const english = (en.console.billing.event as Record<string, string>)[kind]
    const arabic = (ar.console.billing.event as Record<string, string>)[kind]
    expect(english, `en console.billing.event.${kind}`).toBeTruthy()
    expect(arabic, `ar console.billing.event.${kind}`).toBeTruthy()
  })
})
