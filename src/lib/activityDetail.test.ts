import { describe, expect, it } from 'vitest'
import type {
  ActivityDetailDto,
  TddObligationDto,
  TransmissionDto,
} from '../api/compliance/activity'
import { recordFromDetail, type Journey } from './activityDetail'

/*
 * Phase 13 finding N1: the record drew "Signed", "Sent over Peppol" and "Sent to Fawtara" as done
 * for invoices that never left the outbox, and put Fawtir's own SLA dead-letter under "What the
 * Tax Authority objected to". These payloads are the shape the ledger returned for INV/2026/1001
 * and INV/2026/4001 on the local acceptance stack, with synthetic identifiers.
 */

const UUID = 'd4eb8808-1968-5aa1-91fc-2e0f1aa37eed'

function deadLettered(over: Partial<TddObligationDto> = {}): TddObligationDto {
  return {
    id: '45133fd4-6ad8-4053-a8bc-813109d2acaf',
    variant: 'SUBMIT',
    status: 'DEAD_LETTERED',
    validated_at: '2026-10-10T08:15:11.881075Z',
    sla_deadline: '2026-10-10T08:30:11.881075Z',
    submitted_at: null,
    sla_met: null,
    failure_reason:
      'SLA breached: deadline 2026-10-10T08:30:11.881075Z passed without C5 acknowledgement (FR-203/204)',
    transmission_id: null,
    tdd_uuid: null,
    ...over,
  }
}

function queuedInvoice(over: Partial<TransmissionDto> = {}): TransmissionDto {
  return {
    id: '8ccf3393-432c-4954-9a2b-ff331da864a7',
    channel: 'INVOICE',
    direction: 'OUTBOUND',
    state: 'PENDING',
    attempts: 0,
    last_attempt_at: null,
    last_failure_reason: null,
    sbdh_instance_identifier: '6bd5f8ae-fa2b-459e-bd68-eb4ed39d556c',
    last_mls_code: null,
    created_at: '2026-10-10T08:15:11.926287Z',
    ...over,
  }
}

/** The Phase 13 payload: SENDING, ack NONE, nothing submitted, zero attempts, SLA dead-letter. */
function phase13(invoiceNumber: string): ActivityDetailDto {
  return {
    invoice_uuid: UUID,
    summary: {
      invoice_uuid: UUID,
      direction: 'ISSUED',
      document_kind: 'STANDARD_INVOICE',
      document_type_code: null,
      invoice_number: invoiceNumber,
      counterparty: '0248:OM1100000000',
      occurred_at: '2026-10-10T08:15:11.845679Z',
      validated_at: '2026-10-10T08:15:11.881075Z',
      b2c: false,
      transport_state: 'SENDING',
      invoice_leg: { ack: 'NONE', ack_at: null, reason: null },
      tdd_leg: {
        variant: 'SUBMIT',
        status: 'DEAD_LETTERED',
        validated_at: '2026-10-10T08:15:11.881075Z',
        sla_deadline: '2026-10-10T08:30:11.881075Z',
        submitted_at: null,
        sla_met: null,
        ack: 'NONE',
        ack_at: null,
        reason: null,
      },
      attention: true,
      links: {
        document: '/api/v1/invoices/invc_1',
        tdd_xml: '/api/v1/invoices/invc_1/tdd',
        resubmit: null,
      },
    },
    tdd_lineage: [deadLettered()],
    mls: [],
    transmissions: [queuedInvoice()],
  }
}

const journey = (dto: ActivityDetailDto, id: Journey['id']) =>
  recordFromDetail(dto).journeys.find((j) => j.id === id)!
const step = (dto: ActivityDetailDto, id: Journey['id'], stepId: string) =>
  journey(dto, id).steps.find((s) => s.id === stepId)!

describe('the Phase 13 payloads (N1)', () => {
  for (const invoice of ['INV/2026/1001', 'INV/2026/4001']) {
    it(`claims nothing for ${invoice}, which never left the outbox`, () => {
      const dto = phase13(invoice)
      const record = recordFromDetail(dto)
      const peppol = journey(dto, 'peppol')
      const ota = journey(dto, 'ota')

      expect(step(dto, 'peppol', 'signed')).toMatchObject({
        labelKey: 'activityDetail.step.notSigned',
        state: 'waiting',
        at: null,
      })
      expect(step(dto, 'peppol', 'sentPeppol')).toMatchObject({
        labelKey: 'activityDetail.step.notSentOverPeppol',
        state: 'waiting',
        at: null,
      })
      // Nothing travelled, so there is nobody to wait on for a reply.
      expect(peppol.steps.map((s) => s.id)).not.toContain('noReply')
      expect(peppol.verdictKey).toBe('activityDetail.verdict.notSentYet')

      expect(step(dto, 'ota', 'sent')).toMatchObject({
        labelKey: 'activityDetail.step.notSentToFawtara',
        state: 'waiting',
        at: null,
      })
      expect(ota.steps.map((s) => s.id)).not.toContain('waiting')
      expect(ota.steps.find((s) => s.state === 'failed')?.labelKey).toBe(
        'activityDetail.step.stoppedAtFawtir',
      )
      expect(ota.steps.some((s) => s.labelKey === 'activityDetail.step.turnedDown')).toBe(false)
      expect(ota.verdictKey).toBe('activityDetail.verdict.stoppedAtFawtir')

      expect(record.rejection).toBeNull()
      expect(record.versions[0]).toMatchObject({
        state: 'held',
        headlineKey: 'activityDetail.versions.notSent',
      })
      // "Still waiting on the OTA" would be false: it was never sent there.
      expect(record.resend).toBe('none')
    })
  }
})

describe('each step follows the field that proves it', () => {
  it('noAttemptsDoesNotShowPeppolSent', () => {
    const dto = phase13('INV-1')
    expect(step(dto, 'peppol', 'sentPeppol').state).not.toBe('done')
  })

  it('does not take a failed attempt for a send', () => {
    // attempts also counts failures before anything reached the wire (a missing signed payload).
    const dto = {
      ...phase13('INV-1'),
      transmissions: [queuedInvoice({ state: 'RETRY_SCHEDULED', attempts: 2 })],
    }
    expect(step(dto, 'peppol', 'signed').state).toBe('waiting')
    expect(step(dto, 'peppol', 'sentPeppol').state).toBe('waiting')
  })

  it('realPeppolTransmissionShowsSent', () => {
    const base = phase13('INV-1')
    const dto: ActivityDetailDto = {
      ...base,
      transmissions: [
        queuedInvoice({
          state: 'SENT_AWAITING_MDN',
          attempts: 1,
          last_attempt_at: '2026-10-10T08:15:20Z',
        }),
      ],
    }
    expect(step(dto, 'peppol', 'signed')).toMatchObject({
      labelKey: 'activityDetail.step.signed',
      state: 'done',
    })
    expect(step(dto, 'peppol', 'sentPeppol')).toMatchObject({
      labelKey: 'activityDetail.step.sentOverPeppol',
      state: 'done',
    })
    expect(journey(dto, 'peppol').verdictKey).toBe('activityDetail.verdict.noReplyYet')
    // CASE B: on the wire over Peppol says nothing about the report to Fawtara.
    expect(step(dto, 'ota', 'sent').state).toBe('waiting')
  })

  it('takes a transport MDN on the invoice as proof it was sent', () => {
    const base = phase13('INV-1')
    const dto = {
      ...base,
      summary: { ...base.summary, transport_state: 'SENT' },
      transmissions: [],
    }
    expect(step(dto, 'peppol', 'sentPeppol').state).toBe('done')
    expect(journey(dto, 'peppol').steps.map((s) => s.id)).toContain('accessPoint')
  })

  it('shows a transport that gave up as a failure, not as sent', () => {
    const base = phase13('INV-1')
    const dto = {
      ...base,
      summary: { ...base.summary, transport_state: 'UNDELIVERABLE' },
      transmissions: [queuedInvoice({ state: 'DEAD_LETTERED', attempts: 1 })],
    }
    expect(step(dto, 'peppol', 'sentPeppol')).toMatchObject({
      labelKey: 'activityDetail.step.couldNotSendOverPeppol',
      state: 'failed',
    })
    expect(step(dto, 'peppol', 'signed').state).toBe('waiting')
    expect(journey(dto, 'peppol').verdictKey).toBe('activityDetail.verdict.couldNotSend')
  })

  it('noSubmittedAtDoesNotShowFawtaraSent', () => {
    const base = phase13('INV-1')
    const dto: ActivityDetailDto = {
      ...base,
      summary: {
        ...base.summary,
        tdd_leg: { ...base.summary.tdd_leg!, status: 'PENDING' },
      },
      tdd_lineage: [deadLettered({ status: 'PENDING', failure_reason: null })],
    }
    expect(step(dto, 'ota', 'sent')).toMatchObject({
      labelKey: 'activityDetail.step.notSentToFawtara',
      state: 'waiting',
    })
    expect(journey(dto, 'ota').verdictKey).toBe('activityDetail.verdict.waiting')
    expect(recordFromDetail(dto).versions[0]).toMatchObject({
      state: 'notSent',
      headlineKey: 'activityDetail.versions.notSent',
    })
  })

  it('realTddSubmissionShowsFawtaraSent', () => {
    const base = phase13('INV-1')
    const submitted = '2026-10-10T08:15:13Z'
    const dto: ActivityDetailDto = {
      ...base,
      summary: {
        ...base.summary,
        tdd_leg: {
          ...base.summary.tdd_leg!,
          status: 'SUBMITTED',
          submitted_at: submitted,
        },
      },
      tdd_lineage: [
        deadLettered({
          status: 'SUBMITTED',
          submitted_at: submitted,
          failure_reason: null,
        }),
      ],
    }
    expect(step(dto, 'ota', 'sent')).toMatchObject({
      labelKey: 'activityDetail.step.sentToFawtara',
      state: 'done',
    })
    expect(step(dto, 'ota', 'waiting').labelKey).toBe('activityDetail.step.waitingOnOta')
    expect(recordFromDetail(dto).versions[0]).toMatchObject({
      state: 'waiting',
      headlineKey: 'activityDetail.versions.sentOn',
    })
  })

  it('internalSlaFailureIsNotTaxAuthorityObjection', () => {
    // Dead-lettered after it was submitted: still our watchdog, not an answer from C5.
    const base = phase13('INV-1')
    const dto: ActivityDetailDto = {
      ...base,
      tdd_lineage: [deadLettered({ submitted_at: '2026-10-10T08:15:13Z' })],
    }
    const record = recordFromDetail(dto)
    expect(record.rejection).toBeNull()
    expect(record.versions[0].state).toBe('held')
    expect(
      journey(dto, 'ota').steps.some((s) => s.labelKey === 'activityDetail.step.turnedDown'),
    ).toBe(false)
  })

  it('treats a report that could not be built as stopped here, not refused', () => {
    const base = phase13('INV-1')
    const dto: ActivityDetailDto = {
      ...base,
      tdd_lineage: [
        deadLettered({
          status: 'GENERATION_FAILED',
          failure_reason: 'TDD_QUEUE',
        }),
      ],
    }
    expect(recordFromDetail(dto).rejection).toBeNull()
    expect(journey(dto, 'ota').verdictKey).toBe('activityDetail.verdict.stoppedAtFawtir')
  })

  it('actualAuthorityObjectionIsShownAsAuthorityObjection', () => {
    const base = phase13('INV-1')
    const reason = 'The tax category did not match the rate.'
    const dto: ActivityDetailDto = {
      ...base,
      summary: {
        ...base.summary,
        tdd_leg: {
          ...base.summary.tdd_leg!,
          status: 'REJECTED',
          submitted_at: '2026-10-10T08:15:13Z',
          ack: 'RE',
          ack_at: '2026-10-10T08:16:00Z',
          reason,
        },
      },
      tdd_lineage: [
        deadLettered({
          status: 'REJECTED',
          submitted_at: '2026-10-10T08:15:13Z',
          failure_reason: reason,
          error_code: 'OTA-E-1122',
        }),
      ],
    }
    const record = recordFromDetail(dto)
    expect(record.rejection).toMatchObject({
      reason,
      code: 'OTA-E-1122',
      later: 'open',
    })
    expect(step(dto, 'ota', 'refused').state).toBe('failed')
    expect(step(dto, 'ota', 'sent').state).toBe('done')
    expect(record.versions[0].state).toBe('rejected')
  })
})
