import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { permissionWords } from './permissionLabels'

describe('permission words', () => {
  afterEach(() => i18n.changeLanguage('en'))

  it('names webhooks in Arabic, not in English', async () => {
    await i18n.changeLanguage('ar')
    for (const code of ['webhooks.manage', 'webhook.read']) {
      const { group } = permissionWords(code, i18n.t, i18n)
      expect(group).toBe('خطافات الويب')
      expect(group).not.toMatch(/Webhook/i)
    }
  })
})
