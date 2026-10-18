import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import {
  describeParticipantFailure,
  evidenceReferenceError,
  justificationError,
  verificationRequestBody,
  type ParticipantDecision,
} from './pidSubmission'

describe('verificationRequestBody', () => {
  it('sends an approval as exactly the five contract fields', () => {
    const decision = {
      approved: true,
      expectedOptimisticLockVersion: 4,
      reasonCode: ' PID_OK ',
      evidenceReference: ' evidence://tickets/SUP-1200 ',
      justification: 'Commercial register extract SUP-1200 matches the VAT number',
      // A field the form might hold but the contract does not define must never reach the wire.
      candidate: '0248:OM1100000001',
    } as ParticipantDecision

    expect(verificationRequestBody(decision)).toStrictEqual({
      expectedOptimisticLockVersion: 4,
      approved: true,
      reasonCode: 'PID_OK',
      evidenceReference: 'evidence://tickets/SUP-1200',
      justification: 'Commercial register extract SUP-1200 matches the VAT number',
    })
  })

  it('sends a rejection with neither evidence nor justification, even if the caller holds them', () => {
    const decision = {
      approved: false,
      expectedOptimisticLockVersion: 4,
      reasonCode: 'NOT_OURS',
      evidenceReference: 'evidence://tickets/SUP-1200',
      justification: 'Left over from an approval that was never sent',
    } as ParticipantDecision

    expect(verificationRequestBody(decision)).toStrictEqual({
      expectedOptimisticLockVersion: 4,
      approved: false,
      reasonCode: 'NOT_OURS',
    })
  })
})

describe('evidenceReferenceError', () => {
  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['ticket SUP 1200', 'invalid'],
    ['evidence://tickets/<SUP-1200>', 'invalid'],
    ['evidence://tickets/SUP-1200\u0007', 'invalid'],
    [`https://tickets.example.test/${'a'.repeat(480)}`, 'invalid'],
    ['https://reviewer:secret@tickets.example.test/SUP-1200', 'credentials'],
    ['//reviewer@tickets.example.test/SUP-1200', 'credentials'],
  ])('refuses %j as %s', (value, problem) => {
    expect(evidenceReferenceError(value)).toBe(problem)
  })

  it.each([
    'evidence://tickets/SUP-1200',
    'https://tickets.example.test/browse/SUP-1200?view=full#evidence',
    'SUP-1200',
    // Opaque: java.net.URI reports no user info for a mailto, so the backend accepts it.
    'mailto:compliance@example.test',
  ])('accepts %j, leaving anything subtler to the server', (value) => {
    expect(evidenceReferenceError(value)).toBeNull()
  })
})

describe('justificationError', () => {
  it.each([
    ['', 'required'],
    ['    ', 'required'],
    ['Commercial register extract\nmatches the VAT number', 'invalid'],
    ['OKOK', 'length'],
    ['Approved after a check', null],
    ['Approved   after  a  check', null],
    ['Approvedafteracheckof SUP-1200', 'words'],
    ['abab abab abab abab abab', 'repetitive'],
    [`Register extract matches ${'x'.repeat(480)}`, 'length'],
  ])('reads %j as %s', (value, problem) => {
    expect(justificationError(value)).toBe(problem)
  })

  it('counts length after collapsing spaces, as TransferReason does', () => {
    // 17 characters once the double spaces collapse, though 20 as typed.
    expect(justificationError('Abc  def  ghi  jklmn')).toBe('length')
  })
})

describe('describeParticipantFailure', () => {
  const refused = (status: number, code?: string, problemType = 'resource-conflict') =>
    new ApiError({ status, problemType, code, correlationId: 'corr-1' })

  it.each([
    [refused(400, 'REVIEWER_EVIDENCE_REQUIRED', 'validation-failed'), 'console.verification.participant.evidenceRefused'],
    [
      refused(400, 'REVIEWER_JUSTIFICATION_REQUIRED', 'validation-failed'),
      'console.verification.participant.justificationRefused',
    ],
    [refused(409, 'PID_HELD_BY_TEST_BINDING'), 'console.verification.participant.heldByTestBinding'],
    [refused(409, 'PID_HELD_BY_MANAGED_REGISTRATION'), 'console.verification.participant.heldByManagedRegistration'],
    [refused(409, 'PID_HELD_BY_QUARANTINED_CLAIM'), 'console.verification.participant.heldByQuarantinedClaim'],
    [refused(409, 'PID_CLAIM_CONFLICT'), 'console.verification.participant.claimConflict'],
    [refused(409, 'PID_CLAIM_CONTESTED'), 'console.verification.participant.claimContested'],
    [refused(409, 'PID_ALREADY_VERIFIED'), 'console.verification.participant.alreadyVerified'],
    // An inherited property name is not a code this screen knows.
    [refused(409, 'constructor'), 'console.verification.participant.conflict'],
    // A claim code under the wrong status is not trusted to mean the claim refusal.
    [refused(400, 'PID_HELD_BY_TEST_BINDING', 'validation-failed'), 'identityErrors.validation'],
    [refused(403, undefined, 'insufficient-permission'), 'console.verification.participant.forbidden'],
    [refused(429, undefined, 'rate-limited'), 'identityErrors.rateLimited'],
    [refused(503, undefined, 'internal-error'), 'identityErrors.service'],
    [new NetworkError('offline'), 'identityErrors.network'],
    [new NetworkError('timeout'), 'identityErrors.timeout'],
  ])('maps %o to %s', (error, key) => {
    expect(describeParticipantFailure(error).key).toBe(key)
  })
})
