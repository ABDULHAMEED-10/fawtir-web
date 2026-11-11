import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError } from '../api'
import { toApiError } from '../api/errors'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import {
  isTooLarge,
  NEEDS,
  quoteUnavailable,
  posRefusalKey,
  queueRefusalKey,
  refusalMessage,
  refusalValues,
} from './posRefusals'

const coded = (status: number, code: string, problem: Record<string, unknown> = {}) =>
  new ApiError({ status, problemType: null, code, problem: { code, ...problem } })

afterEach(async () => {
  await i18n.changeLanguage('en')
})

// Backend 073d5261c (QR-E2): an online sale refused 422 before a number is taken.
describe('TENANT_TIMEZONE_NOT_SUPPORTED_FOR_E_INVOICE on an online sale', () => {
  it('is worded by its code, names Asia/Muscat, and shows no code', async () => {
    const error = new ApiError({
      status: 422,
      problemType: 'tenant-timezone-not-supported-for-e-invoice',
      code: 'TENANT_TIMEZONE_NOT_SUPPORTED_FOR_E_INVOICE',
    })
    expect(posRefusalKey(error)).toBe('pos.refusal.TENANT_TIMEZONE_NOT_SUPPORTED_FOR_E_INVOICE')
    await i18n.changeLanguage('en')
    const sentence = i18n.t(posRefusalKey(error))
    expect(sentence).toMatch(/Asia\/Muscat/)
    expect(sentence).not.toMatch(/TENANT_TIMEZONE/)
    expect(
      i18n.exists('pos.refusal.TENANT_TIMEZONE_NOT_SUPPORTED_FOR_E_INVOICE', { lng: 'ar', fallbackLng: false }),
    ).toBe(true)
    // QEW-2: no company administrator can set the zone on the web.
    expect(sentence).toMatch(/Fawtir support/)
    expect(sentence).not.toMatch(/administrator/)
  })

  // QEW-3: a waiting entry's receipt is printed, so it never reads "nothing was recorded".
  it('words a waiting entry with its own queue sentence, in English and Arabic', async () => {
    const key = queueRefusalKey('TENANT_TIMEZONE_NOT_SUPPORTED_FOR_E_INVOICE', null)
    expect(key).toBe('pos.queue.reason.TENANT_TIMEZONE_NOT_SUPPORTED_FOR_E_INVOICE')
    await i18n.changeLanguage('en')
    expect(i18n.t(key)).not.toMatch(/nothing was recorded/i)
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
  })
})

describe('POS_REFUND_NOTHING_TO_PAY_BACK (backend fix/refund-edge-cases, probe zeroPieces)', () => {
  it('is worded by its code at 422', () => {
    const error = coded(422, 'POS_REFUND_NOTHING_TO_PAY_BACK', { lines: [1], expected: 0 })
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_REFUND_NOTHING_TO_PAY_BACK')
  })
})

describe('the new till sentences in Arabic', () => {
  it.each(['pos.refusal.POS_REFUND_NOTHING_TO_PAY_BACK', 'pos.warning.POS_REFUND_PIECE_CARRIED'])(
    '%s',
    async (key) => {
      await i18n.changeLanguage('ar')
      expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
      expect(i18n.t(key, { line: 1 })).not.toMatch(/[A-Za-z]{4,}/)
    },
  )
})

describe('the sale document ceiling on a till refund (PRV43-CMP F3-1, owner round 12)', () => {
  it.each(['CREDIT_NOTE_NOTHING_CORRECTABLE', 'CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT'])(
    '%s is worded by its code, never as "Try again"',
    (code) => {
      const key = posRefusalKey(coded(409, code))
      expect(key).toBe(`pos.refusal.${code}`)
      expect(i18n.exists(key, { lng: 'en', fallbackLng: false })).toBe(true)
      expect(i18n.t(key)).not.toBe(i18n.t('pos.refusal.failed'))
      expect(i18n.t(key)).not.toMatch(/try again/i)
    },
  )

  it('nothing left says so and points at the existing credit notes', () => {
    expect(i18n.t('pos.refusal.CREDIT_NOTE_NOTHING_CORRECTABLE')).toMatch(
      /^There is no remaining amount available to credit on this sale\. Review its existing credit notes\./,
    )
  })

  it('more than is left never says the sale is used up: a smaller refund may still fit', () => {
    const sentence = i18n.t('pos.refusal.CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT')
    expect(sentence).toMatch(/more than the amount still available to credit on this sale/)
    expect(sentence).not.toMatch(/no remaining|nothing (is )?left|fully|already credited|used up/i)
  })

  it('a code the till does not word still reads as the general failure', () => {
    expect(posRefusalKey(coded(409, 'CREDIT_NOTE_SOMETHING_NEW'))).toBe('pos.refusal.failed')
  })

  it.each([
    'pos.refusal.CREDIT_NOTE_NOTHING_CORRECTABLE',
    'pos.refusal.CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT',
  ])('%s exists in Arabic (native sign-off pending)', async (key) => {
    await i18n.changeLanguage('ar')
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t(key)).not.toMatch(/[A-Za-z]{4,}/)
  })
})

// NOT RUN (static only). Backend 8f04050ab (HS Slice B, IBR-078-OM).
describe('a line that states neither goods nor services', () => {
  it('online, is worded by its code with the line it names', () => {
    const error = coded(400, 'GOODS_OR_SERVICE_REQUIRED', {
      line: 2,
      field: 'classification.goodsOrServiceCode',
    })
    expect(posRefusalKey(error)).toBe('pos.refusal.GOODS_OR_SERVICE_REQUIRED')
    expect(i18n.t(posRefusalKey(error), { line: '2' })).toContain('2')
  })

  it('queued, has its own sentence, never the HS code one', () => {
    expect(queueRefusalKey('POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED', null)).toBe(
      'pos.queue.reason.POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED',
    )
  })

  it.each([
    'pos.refusal.GOODS_OR_SERVICE_REQUIRED',
    'pos.queue.reason.POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED',
    'pos.queue.goodsOrServiceLines',
    'pos.queue.goodsOrServiceHint',
  ])('%s is in Arabic', async (key) => {
    await i18n.changeLanguage('ar')
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t(key, { line: 1, lines: '1' })).not.toMatch(/[A-Za-z]{4,}/)
  })
})

// Backend a2c9fcf0c (FIN-M3-CURRENCY-MIX Phase 2a). Problem bodies as PosShiftCurrencies builds them.
describe('a shift whose cash is in more than one currency, or in unrecorded ones', () => {
  const MIXED = () => coded(409, 'POS_SHIFT_CURRENCY_MIXED', { currencies: ['OMR', 'USD'] })
  const UNRECORDED = () =>
    coded(409, 'POS_SHIFT_CURRENCY_UNRECORDED', { unrecordedMovements: 3, currencies: [] })

  // Review WB2-1: no screen lets a cashier count the float or open a new shift (and the backend hands
  // the cashier their own withheld shift back), so the sentence offers neither: a manager sorts it out.
  it('MIXED names the currencies, says nothing was recorded, and leaves it to a manager', () => {
    const error = MIXED()
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_SHIFT_CURRENCY_MIXED')
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toContain('OMR, USD')
    expect(text).toMatch(/nothing was recorded/i)
    expect(text).toMatch(/can't be totalled/i)
    expect(text).toMatch(/a manager needs to sort this out/i)
    expect(text).not.toMatch(/count the float|new shift/i)
    expect(text).not.toContain('{{')
  })

  it('UNRECORDED names how many movements, and says what to do', () => {
    const error = UNRECORDED()
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_SHIFT_CURRENCY_UNRECORDED')
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toContain('(3)')
    expect(text).toMatch(/no currency recorded/i)
    expect(text).toMatch(/a manager needs to sort this out/i)
    expect(text).not.toMatch(/count the float|new shift/i)
    expect(text).not.toContain('{{')
  })

  it('takes a currency list only when every entry is a three-letter code, and a count only as a whole number', () => {
    expect(refusalValues(coded(409, 'POS_SHIFT_CURRENCY_MIXED', { currencies: ['OMR', 'USD'] }))).toEqual({
      currencies: 'OMR, USD',
    })
    expect(
      refusalValues(coded(409, 'POS_SHIFT_CURRENCY_MIXED', { currencies: ['OMR', '<b>x</b>'] })),
    ).toEqual({})
    expect(
      refusalValues(coded(409, 'POS_SHIFT_CURRENCY_UNRECORDED', { unrecordedMovements: 'many' })),
    ).toEqual({})
    expect(
      refusalValues(coded(409, 'POS_SHIFT_CURRENCY_UNRECORDED', { unrecordedMovements: 2 })),
    ).toEqual({ unrecordedMovements: '2' })
  })
})

describe('cash in a currency the drawer does not hold', () => {
  it('a paid-out names both currencies', () => {
    const error = coded(422, 'POS_PAID_OUT_CURRENCY_MISMATCH', {
      shiftCurrency: 'OMR',
      sentCurrency: 'USD',
    })
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_PAID_OUT_CURRENCY_MISMATCH')
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toContain('OMR')
    expect(text).toContain('USD')
    expect(text).toMatch(/nothing was recorded/i)
  })

  it('a paid-in names both currencies', () => {
    const error = coded(422, 'POS_CASH_MOVEMENT_CURRENCY_MISMATCH', {
      shiftCurrency: 'OMR',
      sentCurrency: 'AED',
    })
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_CASH_MOVEMENT_CURRENCY_MISMATCH')
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toContain('OMR')
    expect(text).toContain('AED')
  })

  // Review WB2-3: the backend sends card money back only for what the card itself paid (checkRoutes),
  // and no other drawer in the sale's currency is known to exist, so neither is offered.
  it('a cash refund names only what is certain: not this drawer, ask a manager', () => {
    const error = coded(422, 'POS_REFUND_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', saleCurrency: 'USD' })
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toMatch(/can't come from this drawer/i)
    expect(text).toMatch(/ask a manager/i)
    expect(text).not.toMatch(/card|from a drawer in/i)
  })

  it('a cash refund names the sale currency and the drawer currency, and says nothing was refunded', () => {
    const error = coded(422, 'POS_REFUND_CURRENCY_MISMATCH', {
      shiftCurrency: 'OMR',
      saleCurrency: 'USD',
    })
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_REFUND_CURRENCY_MISMATCH')
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toContain('USD')
    expect(text).toContain('OMR')
    expect(text).toMatch(/nothing was refunded/i)
  })

  it('takes a currency value only as a three-letter code', () => {
    expect(
      refusalValues(
        coded(422, 'POS_PAID_OUT_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', sentCurrency: 'usd dollars' }),
      ),
    ).toEqual({ shiftCurrency: 'OMR' })
  })

  it.each(['POS_CASH_MOVEMENT_CURRENCY_INVALID', 'POS_CASH_MOVEMENT_CURRENCY_REQUIRED'])(
    '%s at 400 is worded by its code, never the general failure',
    (code) => {
      const key = posRefusalKey(coded(400, code))
      expect(key).toBe(`pos.refusal.${code}`)
      expect(i18n.t(key)).not.toBe(i18n.t('pos.refusal.failed'))
      expect(i18n.t(key)).toMatch(/nothing was recorded/i)
    },
  )

  it.each([
    'POS_SHIFT_CURRENCY_MIXED',
    'POS_SHIFT_CURRENCY_UNRECORDED',
    'POS_PAID_OUT_CURRENCY_MISMATCH',
    'POS_CASH_MOVEMENT_CURRENCY_MISMATCH',
    'POS_REFUND_CURRENCY_MISMATCH',
    'POS_CASH_MOVEMENT_CURRENCY_INVALID',
    'POS_CASH_MOVEMENT_CURRENCY_REQUIRED',
  ])('pos.refusal.%s is in Arabic', async (code) => {
    await i18n.changeLanguage('ar')
    const key = `pos.refusal.${code}`
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    const text = i18n.t(key, {
      currencies: 'OMR, USD',
      unrecordedMovements: '3',
      shiftCurrency: 'OMR',
      sentCurrency: 'USD',
      saleCurrency: 'USD',
    })
    expect(text.replace(/OMR|USD/g, '')).not.toMatch(/[A-Za-z]{4,}/)
    expect(text).not.toContain('{{')
  })
})

// Review WB2-2: a sentence never prints "{{name}}" for a figure the problem body did not carry.
describe('a currency refusal whose figures are missing or unusable', () => {
  const CASES: [number, string, Record<string, unknown>][] = [
    [409, 'POS_SHIFT_CURRENCY_MIXED', { currencies: ['OMR', 'USD'] }],
    [409, 'POS_SHIFT_CURRENCY_UNRECORDED', { unrecordedMovements: 2 }],
    [422, 'POS_PAID_OUT_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', sentCurrency: 'USD' }],
    [422, 'POS_CASH_MOVEMENT_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', sentCurrency: 'USD' }],
    [422, 'POS_REFUND_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', saleCurrency: 'USD' }],
  ]
  const BROKEN: Record<string, Record<string, unknown>> = {
    POS_SHIFT_CURRENCY_MIXED: { currencies: ['OMR', 'dollars'] },
    POS_SHIFT_CURRENCY_UNRECORDED: { unrecordedMovements: 'some' },
    POS_PAID_OUT_CURRENCY_MISMATCH: { shiftCurrency: 'OMR', sentCurrency: 'us dollars' },
    POS_CASH_MOVEMENT_CURRENCY_MISMATCH: { shiftCurrency: 'omr', sentCurrency: 'USD' },
    POS_REFUND_CURRENCY_MISMATCH: { saleCurrency: 'USD' },
  }

  it.each(CASES)('%s %s with its figures uses the sentence that names them', (status, code, problem) => {
    const error = coded(status, code, problem)
    expect(posRefusalKey(error)).toBe(`pos.refusal.${code}`)
    expect(i18n.t(posRefusalKey(error), refusalValues(error))).not.toContain('{{')
  })

  it.each(CASES)('%s %s with no figures uses one that names none', (status, code) => {
    const error = coded(status, code)
    expect(posRefusalKey(error)).toBe(`pos.refusal.withoutFigures.${code}`)
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).not.toContain('{{')
    expect(text).toMatch(/nothing was (recorded|refunded)/i)
  })

  it.each(CASES)('%s %s with unusable figures uses one that names none', (status, code) => {
    const error = coded(status, code, BROKEN[code])
    expect(posRefusalKey(error)).toBe(`pos.refusal.withoutFigures.${code}`)
    expect(i18n.t(posRefusalKey(error), refusalValues(error))).not.toContain('{{')
  })

  it('the queue picks the same way from the values the entry kept', () => {
    expect(queueRefusalKey('POS_SHIFT_CURRENCY_MIXED', null, { currencies: 'OMR, USD' })).toBe(
      'pos.refusal.POS_SHIFT_CURRENCY_MIXED',
    )
    expect(queueRefusalKey('POS_SHIFT_CURRENCY_MIXED', null)).toBe(
      'pos.refusal.withoutFigures.POS_SHIFT_CURRENCY_MIXED',
    )
    expect(queueRefusalKey('POS_SHIFT_CURRENCY_UNRECORDED', null, {})).toBe(
      'pos.refusal.withoutFigures.POS_SHIFT_CURRENCY_UNRECORDED',
    )
  })

  it('the two value-free codes need no fallback', () => {
    for (const code of ['POS_CASH_MOVEMENT_CURRENCY_INVALID', 'POS_CASH_MOVEMENT_CURRENCY_REQUIRED']) {
      expect(posRefusalKey(coded(400, code))).toBe(`pos.refusal.${code}`)
      expect(i18n.t(`pos.refusal.${code}`)).not.toContain('{{')
    }
  })

  it.each(CASES)('pos.refusal.withoutFigures.%s is in Arabic', async (_status, code) => {
    await i18n.changeLanguage('ar')
    const key = `pos.refusal.withoutFigures.${code}`
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t(key)).not.toMatch(/[A-Za-z]{4,}/)
  })
})

// Review WB3-2: the map of what each sentence names is rebuilt here from the English sentences, so a
// worded code whose sentence gains a placeholder fails until it has a fallback that names none.
describe('every worded sentence that names a figure has one that names none', () => {
  const refusal = (en as { pos: { refusal: Record<string, unknown> } }).pos.refusal
  const arRefusal = (ar as { pos: { refusal: Record<string, unknown> } }).pos.refusal
  const placeholders = (text: string) =>
    [...new Set([...text.matchAll(/\{\{\s*([A-Za-z]+)/g)].map((match) => match[1]))].sort()
  const named = Object.entries(refusal).filter(
    (entry): entry is [string, string] =>
      /^[A-Z][A-Z0-9_]+$/.test(entry[0]) && typeof entry[1] === 'string' && placeholders(entry[1]).length > 0,
  )
  // Worded by posRefusalKey: anything else comes out as the general failure.
  const worded = named.filter(([code]) => posRefusalKey(coded(422, code, {})) !== 'pos.refusal.failed')

  it('only the codes worded elsewhere are left out', () => {
    // CUSTOMER_NOT_INVOICE_ELIGIBLE is said by the payment page with its own values.
    expect(named.filter((entry) => !worded.includes(entry)).map(([code]) => code)).toEqual([
      'CUSTOMER_NOT_INVOICE_ELIGIBLE',
    ])
  })

  it('the map in posRefusals is exactly the one the English sentences give', () => {
    const fromEnglish = Object.fromEntries(worded.map(([code, text]) => [code, placeholders(text)]))
    const inCode = Object.fromEntries(Object.entries(NEEDS).map(([code, needs]) => [code, [...needs].sort()]))
    expect(inCode).toEqual(fromEnglish)
  })

  it.each(worded.map(([code]) => code))('%s without its figures reads whole in English and Arabic', (code) => {
    const { key, values } = refusalMessage(coded(422, code, {}))
    expect(key).toBe(`pos.refusal.withoutFigures.${code}`)
    const fallbacks = refusalWithout(refusal)
    const arFallbacks = refusalWithout(arRefusal)
    expect(typeof fallbacks[code]).toBe('string')
    expect(typeof arFallbacks[code]).toBe('string')
    expect(fallbacks[code]).not.toContain('{{')
    expect(arFallbacks[code]).not.toContain('{{')
    expect(i18n.t(key, values)).not.toContain('{{')
  })

  function refusalWithout(tree: Record<string, unknown>) {
    return tree.withoutFigures as Record<string, string>
  }
})

describe('POS_SHIFT_CURRENCY_UNKNOWN (backend 0e9aa15ac, FIN-2a-1)', () => {
  it('is worded by its code, names nothing, and says nothing was recorded', () => {
    const { key, values } = refusalMessage(coded(409, 'POS_SHIFT_CURRENCY_UNKNOWN'))
    expect(key).toBe('pos.refusal.POS_SHIFT_CURRENCY_UNKNOWN')
    const text = i18n.t(key, values)
    expect(text).not.toContain('{{')
    expect(text).toMatch(/nothing was recorded/i)
    expect(text).toMatch(/not known yet/i)
    expect(text).toMatch(/manager/i)
    // A read-only tenant cannot sell, so the sentence never sends the cashier to make a sale.
    expect(text).not.toMatch(/sale/i)
  })
})

// Review WB3-3: a key said without its values is how "{{line}}" reached a cashier, so no page words
// a refusal from the bare key.
describe('no POS page words a refusal from its key alone', () => {
  const dir = join(__dirname, '../pages/PosPage')
  const pages = readdirSync(dir).filter((name) => name.endsWith('.tsx') && !name.includes('.test.'))

  it.each(pages)('%s', (name) => {
    const source = readFileSync(join(dir, name), 'utf8')
    expect(source).not.toMatch(/posRefusalKey\(/)
    expect(source).not.toMatch(/t\(queueRefusalKey\([^)]*\)\)/)
  })
})

describe('a sale too large to send (K30)', () => {
  it('is known by the stored HTTP_413 or by the gateway problem type, and nothing else', () => {
    expect(isTooLarge('HTTP_413', null)).toBe(true)
    expect(isTooLarge(null, 'payload-too-large')).toBe(true)
    expect(isTooLarge('HTTP_409', null)).toBe(false)
    expect(isTooLarge(null, null)).toBe(false)
  })

  it('words the queued entry and the online refusal in English and Arabic', () => {
    expect(queueRefusalKey('HTTP_413', 'payload-too-large')).toBe('pos.queue.reason.tooLarge')
    expect(queueRefusalKey('HTTP_413', null)).toBe('pos.queue.reason.tooLarge')
    const online = new ApiError({ status: 413, problemType: 'payload-too-large', code: null })
    expect(posRefusalKey(online)).toBe('pos.refusal.tooLarge')
    // WB5-5: a bare 413 from an edge or proxy, with no problem type, says the same.
    expect(posRefusalKey(new ApiError({ status: 413, problemType: null }))).toBe('pos.refusal.tooLarge')
    expect(posRefusalKey(new ApiError({ status: 413, problemType: null, code: 'SOME_CODE' }))).not.toBe(
      'pos.refusal.tooLarge',
    )
    for (const key of ['pos.queue.reason.tooLarge', 'pos.queue.tooLargeHint', 'pos.refusal.tooLarge']) {
      for (const lng of ['en', 'ar']) expect(i18n.exists(key, { lng, fallbackLng: false })).toBe(true)
    }
    // Nothing was recorded online; the queued sale keeps its number and is not cleared by itself.
    expect(i18n.t('pos.refusal.tooLarge', { lng: 'en' })).toMatch(/nothing was recorded/)
    expect(i18n.t('pos.queue.tooLargeHint', { lng: 'en' })).toMatch(/not sent again by itself/)
  })
})

// W5-SHARED audit: a server without the route answers with a Spring default body, whose reason
// phrase used to be read as a code and hid the missing route.
describe('a quote route that is not there', () => {
  it('is unavailable whether the 404 carries a reason phrase or nothing', () => {
    const phrase = toApiError(new Response(null, { status: 404 }), { status: 404, error: 'Not Found', path: '/x' })
    expect(quoteUnavailable(phrase)).toBe(true)
    expect(quoteUnavailable(toApiError(new Response(null, { status: 405 }), undefined))).toBe(true)
    const coded = toApiError(new Response(null, { status: 404 }), { code: 'POS_SALE_NOT_FOUND' })
    expect(quoteUnavailable(coded)).toBe(false)
  })
})
