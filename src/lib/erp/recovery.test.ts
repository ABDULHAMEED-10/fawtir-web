import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { noticeOfFailure, refreshAfter } from './recovery'

const refused = (status: number, code: string | null, problemType: string | null = null) =>
  new ApiError({ status, problemType, code })

describe('a refused recovery', () => {
  it('is read by the module code before the status', () => {
    expect(noticeOfFailure(refused(422, 'ERP_RECOVERY_CONTEXT_UNAVAILABLE'))).toMatchObject({
      kind: 'contextUnavailable',
      retry: false,
    })
    expect(noticeOfFailure(refused(409, 'ERP_RECOVERY_IN_PROGRESS')).kind).toBe('inProgress')
    expect(noticeOfFailure(refused(503, 'ERP_RECOVERY_SOURCE_UNAVAILABLE'))).toMatchObject({
      kind: 'sourceUnavailable',
      retry: true,
    })
  })

  it('never offers another try at a document that cannot be recovered', () => {
    for (const code of [
      'ERP_RECOVERY_CONTEXT_UNAVAILABLE',
      'ERP_RECOVERY_SOURCE_REPLAY_UNAVAILABLE',
      'ERP_RECOVERY_SOURCE_DOCUMENT_MISSING',
      'ERP_RECOVERY_SOURCE_DOCUMENT_CHANGED',
      'ERP_RECOVERY_NOT_ELIGIBLE',
      'ERP_RECOVERY_CHANNEL_UNSUPPORTED',
    ]) {
      expect(noticeOfFailure(refused(422, code)).retry).toBe(false)
    }
  })

  it('reads a CSRF refusal as a stale page, not a missing permission', () => {
    expect(noticeOfFailure(refused(403, null, 'csrf-rejected')).kind).toBe('other')
    expect(noticeOfFailure(refused(403, null, 'erp-entitlement-required')).kind).toBe(
      'erpNotEnabled',
    )
    expect(noticeOfFailure(refused(403, null, 'access-denied')).kind).toBe('forbidden')
  })

  it('reads the gateway limit, an unknown code and a lost connection without guessing', () => {
    expect(noticeOfFailure(refused(429, null, 'rate-limited')).kind).toBe('rateLimited')
    expect(noticeOfFailure(refused(422, 'ERP_RECOVERY_SOMETHING_NEW')).kind).toBe('other')
    expect(noticeOfFailure(new NetworkError('offline')).kind).toBe('unreachable')
  })

  it('reads the document again only when the server answered', () => {
    expect(refreshAfter(noticeOfFailure(new NetworkError('timeout')))).toBe(false)
    expect(refreshAfter(noticeOfFailure(refused(429, null)))).toBe(false)
    expect(refreshAfter(noticeOfFailure(refused(409, 'ERP_RECOVERY_NOT_ELIGIBLE')))).toBe(true)
  })
})

describe('a refusal code named like an Object.prototype member', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('reads %j as it reads an unknown code', (code) => {
    expect(noticeOfFailure(refused(422, code))).toEqual(noticeOfFailure(refused(422, 'NO_SUCH_CODE')))
    expect(noticeOfFailure(refused(409, code, 'subscription-restricted'))).toEqual(
      noticeOfFailure(refused(409, 'NO_SUCH_CODE', 'subscription-restricted')),
    )
  })
})
