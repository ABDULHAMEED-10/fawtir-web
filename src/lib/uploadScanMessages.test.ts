import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError } from '../api'
import { commonFailureMessage } from './identity/errors'
import { describeApiFailure } from './apiFailure'

/**
 * UP-1: every upload is virus-scanned before it is stored. A file the scan refuses (422) and a scan
 * that could not answer (503) each get their own sentence, in English and Arabic, instead of
 * "invalid input" or "the service is unavailable".
 */
describe('upload scan refusals', () => {
  const infected = new ApiError({ status: 422, problemType: 'upload-infected' })
  const unavailable = new ApiError({ status: 503, problemType: 'upload-scan-unavailable' })

  it('names each refusal on its own', () => {
    expect(commonFailureMessage(infected)).toEqual({ key: 'identityErrors.uploadInfected' })
    expect(commonFailureMessage(unavailable)).toEqual({ key: 'identityErrors.uploadScanUnavailable' })
    expect(describeApiFailure(infected).key).toBe('identityErrors.uploadInfected')
    expect(describeApiFailure(unavailable).key).toBe('identityErrors.uploadScanUnavailable')
  })

  it.each(['en', 'ar'])('has %s wording for both, on every screen that uploads', (lng) => {
    for (const key of [
      'identityErrors.uploadInfected',
      'identityErrors.uploadScanUnavailable',
      'billing.refusal.upload-infected',
      'billing.refusal.upload-scan-unavailable',
    ]) {
      expect(i18n.exists(key, { lng }), key).toBe(true)
    }
  })
})
