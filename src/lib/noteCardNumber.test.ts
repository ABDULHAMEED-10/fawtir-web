import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError } from '../api'
import { posRefusalKey, queueRefusalKey, refusalValues } from './posRefusals'
import { stockRefusalKey } from './catalogStock'

/** Batch 39 SEC W-6: a card number typed into a note is refused 400 naming only `field`. */
const refused = (code: string, field: string) =>
  new ApiError({ status: 400, problemType: 'validation-failed', code, problem: { code, field } })

const SENTENCE = 'Remove the card number from this note. Card numbers must never be typed into notes.'

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('a card number typed into a note (SEC W-6)', () => {
  it('words the till refusal for every note field it names', async () => {
    await i18n.changeLanguage('en')
    for (const field of ['note', 'cardDifferenceNote', 'reasonNote']) {
      const error = refused('POS_NOTE_CARD_NUMBER', field)
      expect(posRefusalKey(error)).toBe('pos.refusal.POS_NOTE_CARD_NUMBER')
      expect(i18n.t(posRefusalKey(error), refusalValues(error))).toBe(SENTENCE)
    }
  })

  it('words a stored queue refusal the same way, never as the general failure', () => {
    expect(queueRefusalKey('POS_NOTE_CARD_NUMBER', 'validation-failed')).toBe(
      'pos.refusal.POS_NOTE_CARD_NUMBER',
    )
  })

  it('words the stock refusal', async () => {
    await i18n.changeLanguage('en')
    const key = stockRefusalKey(refused('STOCK_NOTE_CARD_NUMBER', 'note'))
    expect(key).toBe('stock.refused.noteCardNumber')
    expect(i18n.t(key!)).toBe(SENTENCE)
  })

  it('has the sentence in Arabic, and never repeats anything typed', async () => {
    await i18n.changeLanguage('ar')
    const pos = i18n.t('pos.refusal.POS_NOTE_CARD_NUMBER')
    const stock = i18n.t('stock.refused.noteCardNumber')
    expect(pos).toContain('رقم البطاقة')
    expect(stock).toBe(pos)
    expect(pos).not.toMatch(/\d{4}/)
  })
})
