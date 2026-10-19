import { describe, expect, it } from 'vitest'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { ApiError } from '../api'
import type {
  InvoiceDispatchDto,
  InvoiceDispatchStateDto,
  InvoiceTransportLegDto,
  InvoiceTransportLegStateDto,
} from '../api/invoices/detail'
import {
  DISPATCH_REASONS,
  RELEASE_REFUSALS,
  SEND_REFUSALS,
  buyerDeliveryNote,
  dispatchIsPending,
  dispatchNotes,
  dispatchSucceeded,
  sendRefusalKey,
  sendResultNote,
  transportNotes,
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

  it('watches every state the server will still move on its own, and no outcome', () => {
    expect(STATES.filter((state) => dispatchIsPending(dispatch(state)))).toEqual([
      'PROCESSING',
      'DISPATCHED',
      'QUEUED',
      'SENDING',
      'SENT',
    ])
    expect(dispatchIsPending(null)).toBe(false)
  })

  it('does not wait on an access point for a buyer not reached over Peppol', () => {
    const route = (state: InvoiceDispatchStateDto, buyerDelivery: InvoiceDispatchDto['buyerDelivery']) =>
      dispatchIsPending({ ...dispatch(state), buyerDelivery })
    for (const state of ['QUEUED', 'SENDING', 'SENT'] as const) {
      expect(route(state, 'PEPPOL'), state).toBe(true)
      expect(route(state, null), state).toBe(true)
      expect(route(state, 'EMAIL_SENT'), state).toBe(false)
      expect(route(state, 'PRINTED_RECEIPT'), state).toBe(false)
    }
    // The hand-off is watched whatever the route, and so is a Tax Authority leg on its way.
    expect(route('PROCESSING', 'EMAIL_SENT')).toBe(true)
    expect(
      dispatchIsPending({
        ...dispatch('SENDING'),
        buyerDelivery: 'EMAIL_SENT',
        transport: {
          buyer: null,
          taxAuthority: { messageId: 'm-2', state: 'TRANSMITTING', attempts: 1, lastAttemptAt: null, nextAttemptAt: null },
        },
      }),
    ).toBe(true)
  })

  // SENT is the AS4 receipt only; an RE can still follow it, so it earns no tick.
  it('ticks the delivery bar only once the access point has answered', () => {
    expect(STATES.filter((state) => dispatchSucceeded(dispatch(state)))).toEqual([
      'DELIVERED',
      'DELIVERED_UNCONFIRMED',
    ])
  })

  it('words AB with the one key the ledger and the record use', () => {
    expect(dispatchNotes(dispatch('DELIVERED_UNCONFIRMED')).state?.key).toBe(
      'activity.ack.deliveredUnconfirmed',
    )
  })

  // SubmissionState.SENT: a positive transport MDN, awaiting the invoice-channel MLS. Not a
  // delivery, and not the buyer's business response (an Invoice Response is another document).
  it('says SENT is the access point receiving it, awaiting its delivery status', () => {
    expect(en.invoiceDispatch.state.sent).toBe(
      "Received by the receiver's access point, awaiting its delivery status",
    )
    expect(en.invoiceDispatch.state.sent).not.toMatch(/deliver(ed)? to|accepted|business response/i)
    expect(ar.invoiceDispatch.state.sent).toBe(
      'استلمتها نقطة الوصول لدى المستلم، بانتظار حالة التسليم',
    )
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

  it('words a controlled-window refusal by its code, whatever the detail says', () => {
    const refused = new ApiError({
      status: 409,
      problemType: 'outbound-window-send-refused',
      code: 'OUTBOUND_WINDOW_SEND_REFUSED',
      problem: { detail: 'This invoice is reserved by a controlled transmission window (WINDOW_EXPIRED)' },
    })
    expect(sendRefusalKey(refused)).toBe('invoiceDispatch.refused.windowReserved')
    expect(lookup(en, 'invoiceDispatch.refused.windowReserved')).toMatch(/Nothing was sent/)
    expect(lookup(ar, 'invoiceDispatch.refused.windowReserved')).not.toMatch(/[A-Za-z]/)
  })

  // Backend 69c878d73, AuthoredInvoiceSendService: the tenant's standing refuses Send before the
  // claim with a 409 and one of exactly these two codes (SmpSenderParticipantAuthorityAdapter).
  it('words a sender-standing refusal of Send by its code, never as "reload"', () => {
    const refusal = (code: string) =>
      new ApiError({
        status: 409,
        problemType: 'resource-conflict',
        code,
        problem: { detail: 'Your company has no verified Peppol participant yet' },
      })
    expect(sendRefusalKey(refusal('SENDER_PARTICIPANT_NOT_REGISTERED'))).toBe(
      'invoiceDispatch.refused.senderNotRegistered',
    )
    expect(sendRefusalKey(refusal('SENDER_PARTICIPANT_CLAIM_CONFLICT'))).toBe(
      'invoiceDispatch.refused.senderClaimConflict',
    )
    for (const key of ['senderNotRegistered', 'senderClaimConflict']) {
      const sentence = lookup(en, `invoiceDispatch.refused.${key}`) as string
      expect(sentence).toMatch(/Nothing was sent/)
      expect(sentence).toMatch(/support/)
      expect(sentence).not.toMatch(/reload|try again/i)
      const arabic = lookup(ar, `invoiceDispatch.refused.${key}`) as string
      expect(arabic.replace(/Peppol/g, '')).not.toMatch(/[A-Za-z]/)
    }
  })

  it('maps no standing code Send cannot answer', () => {
    for (const code of ['SENDER_PARTICIPANT_NOT_AUTHORIZED', 'SENDER_STANDING_UNKNOWN']) {
      expect(sendRefusalKey(new ApiError({ status: 409, problemType: 'x', code })), code).toBeNull()
    }
  })
})

describe('sender standing on the dispatch', () => {
  const retry = (reasonCode: string) => dispatchNotes(dispatch('RETRY_SCHEDULED', reasonCode))

  // AuthoredInvoiceDispatchAdapter defers these without charging an attempt; the worker skips the
  // tenant until the standing is resolved, so the obligation resumes by itself.
  it('says a deferred standing hold is on hold and resumes, not that sending failed or stopped', () => {
    for (const [code, key] of [
      ['SENDER_PARTICIPANT_NOT_REGISTERED', 'senderNotRegistered'],
      ['SENDER_PARTICIPANT_CLAIM_CONFLICT', 'senderClaimConflict'],
    ]) {
      const notes = retry(code)
      expect(notes.state, code).toEqual({ key: 'invoiceDispatch.state.heldSenderStanding' })
      expect(notes.reason, code).toEqual({ key: `invoiceDispatch.reason.${key}` })
      const said = `${lookup(en, notes.state!.key)} ${lookup(en, notes.reason!.key)}`
      expect(said).toMatch(/resumes by itself/)
      expect(said).not.toMatch(/stopped|failed/i)
      expect(said).not.toContain(code)
    }
  })

  it('keeps "will be retried" for a retry that really was an attempt', () => {
    expect(retry('AUTHORED_INVOICE_DISPATCH_ERROR').state).toEqual({
      key: 'invoiceDispatch.state.retryScheduled',
    })
  })

  it('words the permanent and infrastructure reasons without the raw code', () => {
    expect(dispatchNotes(dispatch('DEAD_LETTERED', 'SENDER_PARTICIPANT_NOT_AUTHORIZED'))).toEqual({
      state: { key: 'invoiceDispatch.state.deadLettered' },
      reason: { key: 'invoiceDispatch.reason.senderNotAuthorized' },
    })
    expect(retry('OUTBOUND_TRANSPORT_UNAVAILABLE')).toEqual({
      state: { key: 'invoiceDispatch.state.retryScheduled' },
      reason: { key: 'invoiceDispatch.reason.transportUnavailable' },
    })
    // The same reason rides a dead-lettered row, which waits on an operator, not on time.
    expect(dispatchNotes(dispatch('DEAD_LETTERED', 'OUTBOUND_TRANSPORT_UNAVAILABLE')).reason).toEqual({
      key: 'invoiceDispatch.reason.transportUnavailable',
    })
    expect(en.invoiceDispatch.reason.transportUnavailable).not.toMatch(/at the moment|right now|retried/)
    expect(
      ar.invoiceDispatch.reason.transportUnavailable.replace(/Peppol/g, ''),
    ).not.toMatch(/[A-Za-z]|حاليًا/)
    expect(
      dispatchNotes(dispatch('DEAD_LETTERED', 'AUTHORED_INVOICE_DISPATCH_NO_OUTCOME')).reason,
    ).toEqual({ key: 'invoiceDispatch.reason.noOutcome' })
  })

  it('has the hold headline in English and Arabic', () => {
    expect(typeof lookup(en, 'invoiceDispatch.state.heldSenderStanding')).toBe('string')
    expect(lookup(ar, 'invoiceDispatch.state.heldSenderStanding')).not.toMatch(/[A-Za-z]/)
  })
})

describe('transport progress', () => {
  const LEG_STATES: InvoiceTransportLegStateDto[] = [
    'QUEUED_NOT_ATTEMPTED',
    'TRANSMITTING',
    'RETRY_SCHEDULED',
    'TRANSMITTED',
    'FAILED',
  ]
  const leg = (state: InvoiceTransportLegStateDto, nextAttemptAt: string | null = null): InvoiceTransportLegDto => ({
    messageId: 'm-1',
    state,
    attempts: state === 'QUEUED_NOT_ATTEMPTED' ? 0 : 1,
    lastAttemptAt: state === 'QUEUED_NOT_ATTEMPTED' ? null : '2026-10-07T10:00:00Z',
    nextAttemptAt,
  })
  const withLegs = (
    state: InvoiceDispatchStateDto,
    buyer: InvoiceTransportLegDto | null,
    taxAuthority: InvoiceTransportLegDto | null = null,
  ): InvoiceDispatchDto => ({ ...dispatch(state), transport: { buyer, taxAuthority } })
  const when = (instant: string) => `at ${instant}`

  it('has every transport sentence in English and Arabic', () => {
    const keys = new Set<string>(['invoiceDispatch.transport.leg.buyer', 'invoiceDispatch.transport.leg.taxAuthority'])
    for (const state of LEG_STATES) {
      keys.add(dispatchNotes(withLegs('SENDING', leg(state)))!.state!.key)
      keys.add(transportNotes(withLegs('SENDING', leg(state)), when)[0].state.key)
      keys.add(transportNotes(withLegs('SENDING', leg(state, '2026-10-07T11:00:00Z')), when)[0].state.key)
    }
    for (const key of keys) {
      expect(typeof lookup(en, key), `en ${key}`).toBe('string')
      expect(typeof lookup(ar, key), `ar ${key}`).toBe('string')
    }
  })

  it('never says sending for a leg that has not been attempted', () => {
    for (const state of ['DISPATCHED', 'QUEUED', 'SENDING'] as const) {
      expect(dispatchNotes(withLegs(state, leg('QUEUED_NOT_ATTEMPTED'))).state?.key).toBe(
        'invoiceDispatch.transport.headline.queuedNotAttempted',
      )
    }
    expect(en.invoiceDispatch.transport.headline.queuedNotAttempted).toMatch(/not yet sent/)
    expect(en.invoiceDispatch.transport.headline.queuedNotAttempted).not.toMatch(/sending/i)
  })

  it('tells transmitting, retry, receipt and failure apart', () => {
    const headline = (state: InvoiceTransportLegStateDto) =>
      dispatchNotes(withLegs('SENDING', leg(state))).state?.key
    expect(headline('TRANSMITTING')).toBe('invoiceDispatch.state.sending')
    expect(headline('RETRY_SCHEDULED')).toBe('invoiceDispatch.transport.headline.retryScheduled')
    expect(headline('TRANSMITTED')).toBe('invoiceDispatch.transport.headline.transmitted')
    expect(headline('FAILED')).toBe('invoiceDispatch.transport.headline.failed')
    // A receipt from the receiving access point is not the buyer accepting the document.
    expect(en.invoiceDispatch.transport.state.transmitted).not.toMatch(/deliver|accept/i)
  })

  it('leaves a ledger verdict past transport alone', () => {
    expect(dispatchNotes(withLegs('SENT', leg('TRANSMITTED'))).state?.key).toBe('invoiceDispatch.state.sent')
    expect(dispatchNotes(withLegs('UNDELIVERABLE', leg('FAILED'))).state?.key).toBe(
      'invoiceDispatch.state.undeliverable',
    )
  })

  it('reads as before when the server sends no transport', () => {
    expect(dispatchNotes(dispatch('SENDING')).state?.key).toBe('invoiceDispatch.state.sending')
    expect(transportNotes(dispatch('SENDING'), when)).toEqual([])
    expect(transportNotes({ ...dispatch('SENDING'), transport: null }, when)).toEqual([])
  })

  it('lists the buyer leg first, then the Tax Authority, with the next attempt time', () => {
    const notes = transportNotes(
      withLegs('SENDING', leg('RETRY_SCHEDULED', '2026-10-07T11:00:00Z'), leg('QUEUED_NOT_ATTEMPTED')),
      when,
    )
    expect(notes).toEqual([
      {
        legKey: 'invoiceDispatch.transport.leg.buyer',
        state: { key: 'invoiceDispatch.transport.state.retryScheduled', values: { when: 'at 2026-10-07T11:00:00Z' } },
      },
      {
        legKey: 'invoiceDispatch.transport.leg.taxAuthority',
        state: { key: 'invoiceDispatch.transport.state.queuedNotAttempted' },
      },
    ])
  })

  it('leads with the Tax Authority leg when the buyer is not reached over Peppol', () => {
    expect(dispatchNotes(withLegs('SENDING', null, leg('QUEUED_NOT_ATTEMPTED'))).state?.key).toBe(
      'invoiceDispatch.transport.headline.queuedNotAttempted',
    )
  })

  it('keeps watching SENDING whatever its legs say, and SENT while the MLS is awaited', () => {
    for (const state of LEG_STATES) {
      expect(dispatchIsPending(withLegs('SENDING', leg(state))), state).toBe(true)
    }
    expect(dispatchIsPending(withLegs('SENT', leg('TRANSMITTED')))).toBe(true)
  })

  it('watches an outcome only while a leg it reports is still on its way', () => {
    const delivered = (tax: InvoiceTransportLegStateDto) =>
      dispatchIsPending(withLegs('DELIVERED', leg('TRANSMITTED'), leg(tax)))
    expect(delivered('QUEUED_NOT_ATTEMPTED')).toBe(true)
    expect(delivered('TRANSMITTING')).toBe(true)
    expect(delivered('TRANSMITTED')).toBe(false)
    expect(delivered('RETRY_SCHEDULED')).toBe(false)
    expect(dispatchIsPending(withLegs('UNDELIVERABLE', leg('FAILED')))).toBe(false)
  })
})

describe('retry, dead letter and the unknown, worded as they are', () => {
  // AuthoredInvoiceDispatchProcessor dead-letters a retryable failure once the attempt budget is
  // spent; the reason it stores still names the temporary cause.
  it.each(['AUTHORED_INVOICE_DISPATCH_ERROR', 'PRECEDING_INVOICE_UNAVAILABLE'])(
    'never promises another attempt on a dead-lettered %s',
    (code) => {
      const notes = dispatchNotes(dispatch('DEAD_LETTERED', code))
      expect(notes.reason).toEqual({ key: 'invoiceDispatch.reason.retriesSpent' })
      expect(en.invoiceDispatch.reason.retriesSpent).not.toMatch(/will be retried/)
      expect(en.invoiceDispatch.reason.retriesSpent).toMatch(/will not be retried/)
      expect(ar.invoiceDispatch.reason.retriesSpent).not.toMatch(/[A-Za-z]/)
      // While attempts remain, the same reason still says it will be retried.
      expect(dispatchNotes(dispatch('RETRY_SCHEDULED', code)).reason?.key).toBe(DISPATCH_REASONS[code])
    },
  )

  it('says the same of a Send answered with a dead letter', () => {
    const base = { invoiceId: 'i', invoiceNumber: 'INV-1', dispatch: dispatch('DEAD_LETTERED') }
    expect(
      sendResultNote({ ...base, outcome: 'DEAD_LETTERED', reasonCode: 'AUTHORED_INVOICE_DISPATCH_ERROR' }),
    ).toEqual({ key: 'invoiceDispatch.reason.retriesSpent' })
    expect(
      sendResultNote({ ...base, outcome: 'RETRY_SCHEDULED', reasonCode: 'AUTHORED_INVOICE_DISPATCH_ERROR' }),
    ).toEqual({ key: 'invoiceDispatch.reason.temporary' })
  })

  it('reads ALREADY_DISPATCHED as handed over, not as sent', () => {
    expect(en.invoiceDispatch.sent.already).not.toMatch(/already been sent/)
    expect(en.invoiceDispatch.sent.already).toMatch(/handed over for sending/)
  })

  it('says a state it does not know is unknown, never "not sent" or nothing', () => {
    const notes = dispatchNotes(dispatch('ON_THE_MOON' as InvoiceDispatchStateDto))
    expect(notes.state).toEqual({ key: 'invoiceDispatch.state.unknown' })
    expect(dispatchSucceeded(dispatch('ON_THE_MOON' as InvoiceDispatchStateDto))).toBe(false)
    // NOT_OWED keeps its deliberate silence.
    expect(dispatchNotes(dispatch('NOT_OWED')).state).toBeNull()
  })

  it('says a leg state or buyer route it does not know is unknown', () => {
    const unknownLeg = {
      ...dispatch('SENDING'),
      transport: {
        buyer: null,
        taxAuthority: {
          messageId: 'm-2',
          state: 'ON_THE_MOON' as InvoiceTransportLegStateDto,
          attempts: 0,
          lastAttemptAt: null,
          nextAttemptAt: null,
        },
      },
    }
    expect(transportNotes(unknownLeg, (when) => when)).toEqual([
      {
        legKey: 'invoiceDispatch.transport.leg.taxAuthority',
        state: { key: 'invoiceDispatch.transport.state.unknown' },
      },
    ])
    expect(dispatchNotes(unknownLeg).state).toEqual({ key: 'invoiceDispatch.state.unknown' })
    expect(
      buyerDeliveryNote({ ...dispatch('SENT'), buyerDelivery: 'CARRIER_PIGEON' as InvoiceDispatchDto['buyerDelivery'] }),
    ).toEqual({ key: 'invoiceDispatch.buyer.unknown' })
    for (const key of [
      'invoiceDispatch.state.unknown',
      'invoiceDispatch.transport.state.unknown',
      'invoiceDispatch.buyer.unknown',
    ]) {
      expect(typeof lookup(en, key), key).toBe('string')
      expect(lookup(ar, key), key).not.toMatch(/[A-Za-z]/)
    }
  })
})
