import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { describeApiFailure } from './apiFailure'
import { classifyApiKeyFailure } from './erp/apiPush'
import { erpRefusalOf, needsReload } from './erp/connectionPolicy'
import { noticeOfFailure } from './erp/recovery'
import { issueRefusalOf } from './invoiceIssue'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import {
  subscriptionRestrictedAction,
  subscriptionRestrictedMessageKey,
} from './subscriptionRestricted'

/** The body the backend's subscription access policy answers with (409, plan v4 §8). */
const restricted = (code: string | null, action = 'ADD_PEOPLE') =>
  new ApiError({
    status: 409,
    problemType: 'subscription-restricted',
    code,
    correlationId: 'corr-1',
    problem: { code, action },
  })

const lookup = (bundle: unknown, key: string) =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle)

describe('a refusal because the subscription is read-only', () => {
  it.each([
    ['SUBSCRIPTION_NOT_STARTED', 'apiErrors.subscriptionRestricted.notStarted'],
    ['SUBSCRIPTION_SUSPENDED', 'apiErrors.subscriptionRestricted.suspended'],
    ['SUBSCRIPTION_CANCELLED', 'apiErrors.subscriptionRestricted.cancelled'],
  ])('words %s, not the generic "someone changed this" conflict', (code, key) => {
    const error = restricted(code)
    expect(subscriptionRestrictedMessageKey(error)).toBe(key)
    const described = describeApiFailure(error)
    expect(described.key).toBe(key)
    expect(described.key).not.toBe('apiErrors.conflict')
    expect(described.reference).toBe('corr-1')
  })

  it('still says the subscription is the reason when the code is one this build does not know', () => {
    expect(describeApiFailure(restricted('SUBSCRIPTION_SOMETHING_NEW')).key).toBe(
      'apiErrors.subscriptionRestricted.generic',
    )
    expect(describeApiFailure(restricted(null)).key).toBe('apiErrors.subscriptionRestricted.generic')
  })

  it('leaves every other 409 to the conflict sentence', () => {
    const stale = new ApiError({ status: 409, problemType: 'resource-conflict' })
    expect(subscriptionRestrictedMessageKey(stale)).toBeNull()
    expect(describeApiFailure(stale).key).toBe('apiErrors.conflict')
  })

  it('has every sentence in English and Arabic', () => {
    for (const leaf of ['notStarted', 'suspended', 'cancelled', 'generic']) {
      const key = `apiErrors.subscriptionRestricted.${leaf}`
      expect(typeof lookup(en, key)).toBe('string')
      expect(typeof lookup(ar, key)).toBe('string')
      expect(lookup(ar, key)).not.toBe(lookup(en, key))
    }
    for (const leaf of ['bills', 'plan']) {
      const key = `apiErrors.subscriptionRestricted.action.${leaf}`
      expect(typeof lookup(en, key)).toBe('string')
      expect(typeof lookup(ar, key)).toBe('string')
    }
  })

  it('points a not-started or suspended company at its bills, and a cancelled one at the plans', () => {
    expect(subscriptionRestrictedAction(restricted('SUBSCRIPTION_NOT_STARTED'))).toEqual({
      to: '/settings/bills',
      labelKey: 'apiErrors.subscriptionRestricted.action.bills',
    })
    expect(subscriptionRestrictedAction(restricted('SUBSCRIPTION_SUSPENDED'))).toEqual({
      to: '/settings/bills',
      labelKey: 'apiErrors.subscriptionRestricted.action.bills',
    })
    expect(subscriptionRestrictedAction(restricted('SUBSCRIPTION_CANCELLED'))).toEqual({
      to: '/settings/plan',
      labelKey: 'apiErrors.subscriptionRestricted.action.plan',
    })
    expect(subscriptionRestrictedAction(new ApiError({ status: 409, problemType: 'resource-conflict' }))).toBeNull()
  })
})

describe('the screens whose own 409 handling used to swallow it', () => {
  it('ERP API push: a refused key creation is not "already rotated or revoked"', () => {
    const error = restricted('SUBSCRIPTION_SUSPENDED', 'CREATE_API_KEY')
    expect(classifyApiKeyFailure(error)).toBe('other')
    expect(describeApiFailure(error).key).toBe('apiErrors.subscriptionRestricted.suspended')
    // A plain 409 there still means the key moved meanwhile.
    expect(classifyApiKeyFailure(new ApiError({ status: 409, problemType: 'resource-conflict' }))).toBe(
      'conflict',
    )
  })

  it('ERP connections: not a version conflict, and no reload offered', () => {
    const error = restricted('SUBSCRIPTION_CANCELLED', 'ERP')
    expect(erpRefusalOf(error)).toBeNull()
    expect(needsReload(error)).toBe(false)
    expect(erpRefusalOf(new ApiError({ status: 409, problemType: 'resource-conflict' }))).toBe(
      'VERSION_CONFLICT',
    )
  })

  it('ERP document recovery: says the subscription stopped it, with no invitation to retry', () => {
    expect(noticeOfFailure(restricted('SUBSCRIPTION_NOT_STARTED', 'ERP'))).toEqual({
      kind: 'subscriptionNotStarted',
      tone: 'warning',
      retry: false,
    })
    expect(noticeOfFailure(restricted('SUBSCRIPTION_SUSPENDED', 'ERP')).kind).toBe('subscriptionSuspended')
    expect(noticeOfFailure(restricted('SUBSCRIPTION_CANCELLED', 'ERP')).kind).toBe('subscriptionCancelled')
    for (const kind of ['subscriptionNotStarted', 'subscriptionSuspended', 'subscriptionCancelled']) {
      for (const part of ['title', 'body']) {
        const key = `erp.reporting.recover.result.${kind}.${part}`
        expect(typeof lookup(en, key)).toBe('string')
        expect(typeof lookup(ar, key)).toBe('string')
      }
    }
  })

  it('issuing: the issue dialog leaves it to the shared sentence', () => {
    const error = restricted('SUBSCRIPTION_SUSPENDED', 'ISSUE_DOCUMENTS')
    expect(issueRefusalOf(error)).toBeNull()
    expect(describeApiFailure(error).key).toBe('apiErrors.subscriptionRestricted.suspended')
  })
})
