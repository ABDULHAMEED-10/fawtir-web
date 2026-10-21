import { describe, expect, it } from 'vitest'
import ar from './locales/ar.json'

/**
 * In Arabic «فوتر» is masculine everywhere («فوتر يجمع», «يفعّل فوتر»), decided 18 Oct 2026. A verb
 * with a feminine ending or prefix right before or after it («ألغت فوتر», «ألغته فوتر», «تتحقق فوتر»,
 * «فوتر تجمع») treats it as feminine. «فوترة» is a different word and is not checked.
 */
const FEMININE_BEFORE =
  /(?:^|[\s"«(])(?:ألغت|ألغته|أصبحت|رفضت|غيّرت|غيرت|صدّرته|صدرته|رفعت|سحبت|حدّدت|حددت|أرسلته|أرسلت|قبلت|أنشأته|أنشأت|أعادته|منحته|أضافته|ستتواصل|تتواصل|تتحقق|تكمل|ترسل|تقبل|تجمع|تنشئ|تحتفظ|تدير|لم تكمل|لم تقبل)\s+فوتر(?![ةا])/
const FEMININE_AFTER =
  /فوتر(?![ةا])\s+(?:تجمع|ترسل|تقبل|تتحقق|تنشئ|تحتفظ|تدير|لا ت\S+|لن ت\S+|لم ت\S+)/

function strings(node: unknown, path: string, out: Array<[string, string]>) {
  if (typeof node === 'string') out.push([path, node])
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node))
      strings(value, path ? `${path}.${key}` : key, out)
  }
}

describe('Arabic «فوتر» is masculine', () => {
  it('has no feminine verb next to it in any string', () => {
    const all: Array<[string, string]> = []
    strings(ar, '', all)
    const feminine = all.filter(
      ([, text]) => FEMININE_BEFORE.test(text) || FEMININE_AFTER.test(text),
    )
    expect(feminine.map(([path]) => path)).toEqual([])
  })

  it('still finds the forms it guards, so the check is not vacuous', () => {
    expect(FEMININE_BEFORE.test('ألغت فوتر اشتراكك')).toBe(true)
    expect(FEMININE_BEFORE.test('ألغته فوتر')).toBe(true)
    expect(FEMININE_AFTER.test('فوتر تجمع الفواتير')).toBe(true)
    expect(FEMININE_BEFORE.test('ألغى فوتر اشتراكك')).toBe(false)
    expect(FEMININE_BEFORE.test('تمت فوترة الطلب')).toBe(false)
  })
})
