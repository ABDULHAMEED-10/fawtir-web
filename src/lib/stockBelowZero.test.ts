import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { isStockLineWarning, stockLineWarningTexts } from './stockLineWarnings'

describe('STOCK_BELOW_ZERO on a screen invoice (batch 39 STK-Q4B)', () => {
  it('is a stock line warning the issue answer and the read are worded with', async () => {
    await i18n.changeLanguage('en')
    expect(isStockLineWarning('STOCK_BELOW_ZERO')).toBe(true)
    expect(
      stockLineWarningTexts(i18n.t.bind(i18n), [
        { line: 2, code: 'STOCK_BELOW_ZERO', message: 'on hand is now -1' },
      ]),
    ).toEqual(['Line 2: it took the stock below zero. Count it when you can.'])
  })

  it('has its sentence in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    const [text] = stockLineWarningTexts(i18n.t.bind(i18n), [{ line: 2, code: 'STOCK_BELOW_ZERO' }])
    expect(text).toContain('السطر 2')
    expect(text).toContain('تحت الصفر')
    await i18n.changeLanguage('en')
  })
})
