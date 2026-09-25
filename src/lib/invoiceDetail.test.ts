import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { counterpartyKeys, isSelfBilled } from './invoiceDetail'

const key = (bundle: Record<string, unknown>, path: string) =>
  path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle)

describe('isSelfBilled', () => {
  it('covers both self-billed document types and nothing else', () => {
    expect(isSelfBilled('SELF_BILLED_INVOICE')).toBe(true)
    expect(isSelfBilled('SELF_BILLED_CREDIT_NOTE')).toBe(true)
    for (const type of ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE']) {
      expect(isSelfBilled(type)).toBe(false)
    }
  })
})

describe('counterpartyKeys', () => {
  it('names the counterparty as the seller on a self-billed document', () => {
    // The tenant is the BUYER here and customerId names the SELLER. "Bill to Gulf Supplies" on a
    // document Gulf Supplies is billing YOU for states the wrong direction of a debt.
    const self = counterpartyKeys('SELF_BILLED_INVOICE')
    expect(key(en, self.section)).toBe('Billed by')
    expect(key(en, self.preposition)).toBe('From')
    expect(key(en, self.view)).toBe('View supplier')
  })

  it('leaves an ordinary invoice buyer-facing', () => {
    const ordinary = counterpartyKeys('INVOICE')
    expect(key(en, ordinary.section)).toBe('Bill to')
    expect(key(en, ordinary.preposition)).toBe('To')
    expect(key(en, ordinary.view)).toBe('View customer')
  })

  it('resolves every key it returns, in both languages', () => {
    // The helper hands back key PATHS, so a rename that leaves one dangling would render the raw
    // key on screen rather than failing anywhere.
    for (const type of ['INVOICE', 'CREDIT_NOTE', 'SELF_BILLED_INVOICE', 'SELF_BILLED_CREDIT_NOTE']) {
      for (const path of Object.values(counterpartyKeys(type))) {
        expect(key(en, path), `en ${path}`).toBeTypeOf('string')
        expect(key(ar, path), `ar ${path}`).toBeTypeOf('string')
      }
    }
  })
})
