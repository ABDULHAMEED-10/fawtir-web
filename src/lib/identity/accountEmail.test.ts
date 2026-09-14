import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { describeConfirmFailure } from './accountEmail'

describe('describeConfirmFailure', () => {
  it('tells a refused code from a session that has ended, by problem type', () => {
    expect(describeConfirmFailure(new ApiError({ status: 401, problemType: 'authentication-failed' }))).toEqual({ kind: 'code' })
    expect(describeConfirmFailure(new ApiError({ status: 401, problemType: 'unauthenticated' }))).toEqual({ kind: 'signedOut' })
    expect(describeConfirmFailure(new ApiError({ status: 401, problemType: null }))).toEqual({ kind: 'signedOut' })
  })

  it('reads a malformed code as a refused one, and a 403 as not a team account', () => {
    expect(describeConfirmFailure(new ApiError({ status: 400, problemType: 'validation-failed' }))).toEqual({ kind: 'code' })
    expect(describeConfirmFailure(new ApiError({ status: 403, problemType: 'insufficient-permission' }))).toEqual({
      kind: 'form',
      message: { key: 'accountEmail.error.notOperator' },
    })
  })

  it('leaves everything else to the shared messages', () => {
    expect(describeConfirmFailure(new ApiError({ status: 503, problemType: null }))).toEqual({
      kind: 'form',
      message: { key: 'identityErrors.service' },
    })
    expect(describeConfirmFailure(new NetworkError('timeout'))).toEqual({ kind: 'form', message: { key: 'identityErrors.timeout' } })
  })
})
