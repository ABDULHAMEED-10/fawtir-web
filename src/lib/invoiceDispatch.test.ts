import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { ApiError } from '../api'
import type { InvoiceDispatchDto, InvoiceDispatchStateDto } from '../api/invoices/detail'
import {
  DISPATCH_REASONS,
  RELEASE_REFUSALS,
  SEND_REFUSALS,
  buyerDeliveryNote,
  dispatchIsMoving,
  dispatchNotes,
  dispatchSucceeded,
  sendRefusalKey,
  sendResultNote,
} from './invoiceDispatch'

const STATES: InvoiceDispatchStateDto[] = [
  'NOT_OWED',
  'NOT_SENT',
  'PROCESSING',
  'RETRY_SCHEDULED',
  'DEAD_LETTERED',
  'CANCELLED',
  'DISPATCHED',
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'DELIVERED_UNCONFIRMED',
  'UNDELIVERABLE',
]

const dispatch = (state: InvoiceDispatchStateDto, reasonCode: string | null = null): InvoiceDispatchDto => ({
  state,
  reasonCode,
  attempts: 0,
  nextAttemptAt: null,
  dispatchedAt: null,
  sendable: false,
  buyerDelivery: null,
  buyerEmailReleasable: false,
})

function lookup(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    locale,
  )
}

describe('invoice dispatch sentences', () => {
  it('has every sentence the screen can choose in English and Arabic', () => {
    const keys = new Set<string>([
      ...STATES.map((state) => dispatchNotes(dispatch(state))?.state?.key).filter(
        (key): key is string => !!key,
      ),
      ...Object.values(DISPATCH_REASONS),
      ...Object.values(SEND_REFUSALS),
      ...Object.values(RELEASE_REFUSALS),
      ...(['PEPPOL', 'NOT_PERMITTED', 'EMAIL_PENDING', 'EMAIL_HELD', 'EMAIL_SENT', 'EMAIL_FAILED', 'SENT_MANUALLY', 'PRINTED_RECEIPT', 'MANUAL_REQUIRED', 'SELF_BILLING'] as const).map(
        (buyerDelivery) => buyerDeliveryNote({ ...dispatch('QUEUED'), buyerDelivery })!.key,
      ),
      'invoiceDispatch.release.action',
      'invoiceDispatch.release.done',
      'invoiceDispatch.reason.unknown',
      'invoiceDispatch.sent.dispatched',
      'invoiceDispatch.sent.already',
      'invoiceDispatch.sent.superseded',
      'invoiceDispatch.sent.notSent',
      'invoiceDispatch.modal.title',
      'invoiceDispatch.modal.subtitle',
      'invoiceDispatch.modal.body',
      'invoiceDispatch.modal.final',
      'invoiceDispatch.modal.submit',
      'invoiceDispatch.modal.sending',
    ])
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string')
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string')
    }
  })

  it('says nothing for a document that owes no dispatch', () => {
    expect(dispatchNotes(dispatch('NOT_OWED')).state).toBeNull()
  })

  it('gives a reason only for a failure, and names an unknown code rather than dropping it', () => {
    expect(dispatchNotes(dispatch('QUEUED', 'SELLER_ADDRESS_INCOMPLETE')).reason).toBeNull()
    expect(dispatchNotes(dispatch('DEAD_LETTERED', 'SELLER_ADDRESS_INCOMPLETE')).reason).toEqual({
      key: 'invoiceDispatch.reason.sellerAddress',
    })
    expect(dispatchNotes(dispatch('RETRY_SCHEDULED', 'SOMETHING_NEW')).reason).toEqual({
      key: 'invoiceDispatch.reason.unknown',
      values: { code: 'SOMETHING_NEW' },
    })
  })

  it('watches only a step in progress', () => {
    expect(STATES.filter((state) => dispatchIsMoving(dispatch(state)))).toEqual(['PROCESSING', 'SENDING'])
    expect(dispatchIsMoving(null)).toBe(false)
  })

  it('ticks the delivery bar only once the document has left', () => {
    expect(STATES.filter((state) => dispatchSucceeded(dispatch(state)))).toEqual([
      'SENT',
      'DELIVERED',
      'DELIVERED_UNCONFIRMED',
    ])
  })

  it('answers a Send by its outcome', () => {
    const base = {
      invoiceId: 'i',
      invoiceNumber: 'INV-1',
      reasonCode: null,
      dispatch: dispatch('QUEUED'),
    }
    expect(sendResultNote({ ...base, outcome: 'DISPATCHED' })).toEqual({ key: 'invoiceDispatch.sent.dispatched' })
    expect(sendResultNote({ ...base, outcome: 'ALREADY_DISPATCHED' })).toEqual({ key: 'invoiceDispatch.sent.already' })
    expect(sendResultNote({ ...base, outcome: 'REFUSED', reasonCode: 'PINT_OM_VALIDATION_FAILED' })).toEqual({
      key: 'invoiceDispatch.reason.validationFailed',
    })
  })

  it('maps only the Send refusals it knows, by code', () => {
    expect(sendRefusalKey(new ApiError({ status: 409, problemType: 'x', code: 'DISPATCH_IN_PROGRESS' }))).toBe(
      'invoiceDispatch.refused.inProgress',
    )
    expect(sendRefusalKey(new ApiError({ status: 409, problemType: 'x', code: 'OTHER' }))).toBeNull()
    expect(sendRefusalKey(new Error('offline'))).toBeNull()
  })
})
