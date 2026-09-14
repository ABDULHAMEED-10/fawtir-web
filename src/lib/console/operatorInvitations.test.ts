import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import {
  describeInvitationActionFailure,
  describeInviteFailure,
  openOperatorInvitations,
  withInvitation,
  type Invitation,
} from './operatorInvitations'
import { describeAcceptFailure, tokenFromFragment } from '../identity/operatorInvitation'

const invitation = (id: string, extra: Partial<Invitation> = {}): Invitation => ({
  id,
  email: `${id}@example.test`,
  status: 'PENDING',
  expiresAt: '2026-09-20T10:00:00Z',
  sentCount: 1,
  lastSentAt: '2026-09-13T10:00:00Z',
  createdAt: '2026-09-13T10:00:00Z',
  kind: 'PLATFORM_OPERATOR',
  ...extra,
})

describe('open operator invitations', () => {
  it('keeps operator invitations that are pending or expired, newest first', () => {
    const merged = openOperatorInvitations(
      [invitation('a', { createdAt: '2026-09-10T00:00:00Z' }), invitation('m', { kind: 'MEMBER' })],
      [invitation('e', { status: 'EXPIRED', createdAt: '2026-09-12T00:00:00Z' })],
    )
    expect(merged.map((item) => item.id)).toEqual(['e', 'a'])
  })

  it('puts a new or resent invitation on top and drops an accepted or revoked one', () => {
    const list = [invitation('a'), invitation('b')]
    expect(withInvitation(list, invitation('c')).map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(withInvitation(list, invitation('b', { sentCount: 2 })).map((item) => item.id)).toEqual(['b', 'a'])
    expect(withInvitation(list, invitation('a', { status: 'REVOKED' })).map((item) => item.id)).toEqual(['b'])
    expect(withInvitation(list, invitation('b', { status: 'ACCEPTED' })).map((item) => item.id)).toEqual(['a'])
  })
})

describe('refusals', () => {
  it.each([
    [409, 'console.operators.invite.error.conflict'],
    [503, 'console.operators.invite.error.unavailable'],
    [403, 'console.operators.error.refused'],
    [400, 'console.operators.invite.error.email'],
    [500, 'identityErrors.service'],
  ])('reads a %s on invite', (status, key) => {
    expect(describeInviteFailure(new ApiError({ status, problemType: null })).key).toBe(key)
  })

  it.each([
    [409, 'console.operators.pending.error.closed'],
    [404, 'console.operators.pending.error.closed'],
    [503, 'console.operators.invite.error.unavailable'],
  ])('reads a %s on resend or revoke', (status, key) => {
    expect(describeInvitationActionFailure(new ApiError({ status, problemType: null })).key).toBe(key)
  })

  it('reads a timeout as a timeout', () => {
    expect(describeInviteFailure(new NetworkError('timeout')).key).toBe('identityErrors.timeout')
  })
})

describe('acceptance', () => {
  it('reads the token from the fragment only', () => {
    expect(tokenFromFragment('#token=fawtir_inv_abc.def')).toBe('fawtir_inv_abc.def')
    expect(tokenFromFragment('#token=a%2Bb')).toBe('a+b')
    expect(tokenFromFragment('#other=1')).toBeNull()
    expect(tokenFromFragment('#token=')).toBeNull()
    expect(tokenFromFragment('')).toBeNull()
  })

  it('treats 401 and 403 as a spent link, 409 as a taken username', () => {
    expect(describeAcceptFailure(new ApiError({ status: 401, problemType: 'authentication-failed' }))).toEqual({ kind: 'link' })
    expect(describeAcceptFailure(new ApiError({ status: 403, problemType: 'insufficient-permission' }))).toEqual({ kind: 'link' })
    expect(describeAcceptFailure(new ApiError({ status: 409, problemType: 'resource-conflict' }))).toEqual({
      kind: 'form',
      fieldErrors: { username: 'operatorInvitation.error.usernameTaken' },
      formError: null,
    })
  })

  it('attributes a named field and reports an unnamed one on the form', () => {
    const named = describeAcceptFailure(
      new ApiError({ status: 400, problemType: 'validation-failed', fieldErrors: [{ field: 'username', message: 'x' }] }),
    )
    expect(named).toEqual({ kind: 'form', fieldErrors: { username: 'operatorInvitation.error.usernameRejected' }, formError: null })
    const unnamed = describeAcceptFailure(new ApiError({ status: 400, problemType: 'validation-failed' }))
    expect(unnamed).toEqual({ kind: 'form', fieldErrors: {}, formError: { key: 'operatorInvitation.error.rejected' } })
  })
})
