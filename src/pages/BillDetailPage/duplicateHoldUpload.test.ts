import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { suspectedBodyKey } from '../../lib/billDuplicate'

/** ACC-8 option A (batch 39, backend c1035fa11): a Peppol copy held against an uploaded bill. */
describe('the duplicate card names how the earlier document arrived', () => {
  it('words an uploaded or scanned original without saying the supplier sent it again', () => {
    expect(suspectedBodyKey('suspected', 'UPLOADED')).toBe('billDetail.duplicate.body.suspectedUploaded')
    expect(suspectedBodyKey('suspected', 'SCANNED')).toBe('billDetail.duplicate.body.suspectedScanned')
  })

  it('keeps the Peppol sentence for a Peppol original', () => {
    expect(suspectedBodyKey('suspected', 'PEPPOL')).toBe('billDetail.duplicate.body.suspected')
  })

  it('claims nothing about the original while it is loading, failed, or of another source', () => {
    for (const original of ['loading', 'failed', 'RECURRING'])
      expect(suspectedBodyKey('suspected', original)).toBe('billDetail.duplicate.body.suspectedPending')
  })

  it('leaves the decided sentences unchanged', () => {
    expect(suspectedBodyKey('confirmed', 'UPLOADED')).toBe('billDetail.duplicate.body.confirmed')
    expect(suspectedBodyKey('notDuplicate', 'SCANNED')).toBe('billDetail.duplicate.body.notDuplicate')
  })

  it('has every new sentence, bill and credit note, in English and Arabic', async () => {
    for (const language of ['en', 'ar']) {
      await i18n.changeLanguage(language)
      for (const key of ['suspectedUploaded', 'suspectedScanned', 'suspectedPending'])
        for (const kind of ['', 'CreditNote']) {
          const full = `billDetail.duplicate.body.${key}${kind}`
          expect(i18n.exists(full)).toBe(true)
          expect(i18n.t(full)).not.toContain('again over Peppol')
        }
    }
    await i18n.changeLanguage('en')
  })
})
