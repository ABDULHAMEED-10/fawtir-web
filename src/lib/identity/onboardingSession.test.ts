import { beforeEach, describe, expect, it } from 'vitest'
import {
  endOnboardingSession,
  hasEndedOnboardingSession,
  markOnboardingSubmitted,
  readOnboardingSession,
  saveOnboardingSession,
} from './onboardingSession'

const future = () => new Date(Date.now() + 60 * 60_000).toISOString()

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('onboarding session', () => {
  it('keeps the token for the tab and nothing in localStorage', () => {
    saveOnboardingSession({ onboardingToken: 'so.token', onboardingTokenExpiresAt: future() })

    expect(readOnboardingSession()?.onboardingToken).toBe('so.token')
    expect(localStorage.length).toBe(0)
  })

  it('stores only the token, its expiry and the submitted flag, whatever the caller hands it', () => {
    saveOnboardingSession({
      onboardingToken: 'so.token',
      onboardingTokenExpiresAt: future(),
      tenantCode: 'TNT-SECRET',
      email: 'someone@example.test',
    } as never)

    const stored = JSON.parse(sessionStorage.getItem('fawtir.signup.onboarding.v1') ?? '{}')
    expect(Object.keys(stored).sort()).toEqual(['onboardingToken', 'onboardingTokenExpiresAt', 'submitted'])
  })

  it('reports an expired session as ended rather than absent', () => {
    saveOnboardingSession({ onboardingToken: 'so.token', onboardingTokenExpiresAt: new Date(Date.now() - 1).toISOString() })

    expect(readOnboardingSession()).toBeNull()
    expect(hasEndedOnboardingSession()).toBe(true)
  })

  it('treats a malformed or missing record as no session at all', () => {
    expect(hasEndedOnboardingSession()).toBe(false)
    sessionStorage.setItem('fawtir.signup.onboarding.v1', '{not json')
    expect(readOnboardingSession()).toBeNull()
    expect(hasEndedOnboardingSession()).toBe(false)
  })

  it('ends a refused token in place so the tab still knows a registration exists', () => {
    saveOnboardingSession({ onboardingToken: 'so.token', onboardingTokenExpiresAt: future() })
    endOnboardingSession()

    expect(readOnboardingSession()).toBeNull()
    expect(hasEndedOnboardingSession()).toBe(true)
  })

  it('records and clears the submitted flag', () => {
    saveOnboardingSession({ onboardingToken: 'so.token', onboardingTokenExpiresAt: future() })
    expect(readOnboardingSession()?.submitted).toBe(false)

    markOnboardingSubmitted(true)
    expect(readOnboardingSession()?.submitted).toBe(true)

    markOnboardingSubmitted(false)
    expect(readOnboardingSession()?.submitted).toBe(false)
  })
})
