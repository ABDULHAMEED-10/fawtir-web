import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { describeApiFailure } from './apiFailure'
import { DEBIT_NOTE_REFUSALS } from './debitNoteRefusals'
import { issueRefusalOf } from './invoiceIssue'
import { noteCancelRefusalKey } from './invoiceDetail'
import { NOTE_REFUSALS } from './salesNote'

// The server's own shape for both (0c2d034d4): 409 resource-conflict, by code.
const conflict = (code: string) => new ApiError({ status: 409, problemType: 'resource-conflict', code })

function lookup(locale: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], locale)
}

describe('D-26 refusals from the server', () => {
  it('has English and Arabic wording for both codes', () => {
    for (const key of new Set(Object.values(DEBIT_NOTE_REFUSALS))) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string')
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string')
      expect(lookup(ar, key)).not.toBe(lookup(en, key))
    }
  })

  it('words an issued debit note refused on any route as the D-26 lock, never "reload and try again"', () => {
    const error = conflict('ISSUED_DEBIT_NOTE_IMMUTABLE')
    expect(describeApiFailure(error).key).toBe('salesNote.detail.debitLocked')
    expect(issueRefusalOf(error)?.key).toBe('salesNote.detail.debitLocked')
    expect(NOTE_REFUSALS.ISSUED_DEBIT_NOTE_IMMUTABLE).toBe('salesNote.detail.debitLocked')
    expect(noteCancelRefusalKey(error, 'DEBIT_NOTE')).toBe('salesNote.detail.debitLocked')
    expect(en.salesNote.detail.debitLocked).toMatch(/correction workflow/)
    // D26W-1: no 'here', which implied the debit note could be changed somewhere else.
    expect(en.salesNote.detail.debitLocked).not.toMatch(/\bhere\b/)
  })

  it('words a credit note against a debit note as such, not as a readiness refusal printing the code', () => {
    const error = conflict('CREDIT_NOTE_ON_DEBIT_NOTE_NOT_ALLOWED')
    expect(describeApiFailure(error).key).toBe('salesNote.detail.creditOnDebitRefused')
    expect(issueRefusalOf(error)).toEqual({ field: null, key: 'salesNote.detail.creditOnDebitRefused' })
    expect(NOTE_REFUSALS.CREDIT_NOTE_ON_DEBIT_NOTE_NOT_ALLOWED).toBe('salesNote.detail.creditOnDebitRefused')
    expect(en.salesNote.detail.creditOnDebitRefused).toBe(
      'A credit note cannot be issued against a debit note. A correction workflow for issued debit notes is not available in this release.',
    )
    // D26W-2: no alternative is promised while the correction workflow is an open requirement.
    expect(ar.salesNote.detail.creditOnDebitRefused).not.toMatch(/الفاتورة الأصلية/)
  })

  it('still words the older server\'s debit-note cancel refusal (#834)', () => {
    expect(noteCancelRefusalKey(conflict('DEBIT_NOTE_CANCEL_CREDITED'), 'DEBIT_NOTE')).toBe(
      'salesNote.detail.cancelBlocked.debitCredited',
    )
  })

  it('leaves any other conflict to the general sentence', () => {
    expect(describeApiFailure(conflict('SOMETHING_ELSE')).key).toBe('apiErrors.conflict')
    expect(noteCancelRefusalKey(conflict('SOMETHING_ELSE'), 'DEBIT_NOTE')).toBeNull()
  })
})
