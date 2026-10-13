import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { activityEventWords, readableCode } from './activityLogWords'

/**
 * Every event type the server writes to the organisation's log (`identity.security_audit_events`)
 * as of backend origin/main 441f2bc1, read from its `audit.record(...)` calls and audit adapters.
 * QA found these all reading "Recorded event" (E2E qualification, 12 Oct 2026).
 */
const EMITTED = [
  'AllOtherSessionsRevokedByUser', 'ApiKeyCreated', 'ApiKeyRevoked', 'ApiKeyRotationCompleted',
  'ApiKeyRotationStarted', 'BankBeneficiaryConfirmed', 'BankBeneficiaryProposed',
  'BankBeneficiaryRetired', 'BillingSettingsChanged', 'CertificationSelfBillingAgreementActivated',
  'CertificationSelfBillingAgreementOpened', 'CertificationSelfBillingSellerVerified',
  'CustomerArchived', 'CustomerCreated', 'CustomerExportCompleted', 'CustomerImportCompleted',
  'CustomerImportFailed', 'CustomerImportRejected', 'CustomerImportStarted',
  'CustomerLogoAttachRejected', 'CustomerLogoUploadRejected', 'CustomerLogoUploaded',
  'CustomerRestored', 'CustomerUpdated', 'DeviceEnrolled', 'DeviceRevoked', 'DeviceRevokedByAdmin',
  'DeviceTransferChallengeRequested', 'EmailVerificationResent', 'ErpEntitlementGranted',
  'ErpEntitlementRevoked', 'ErpExtractionClaimReleased', 'ErpExtractionRecoveryFailed',
  'ErpExtractionRecoveryRequested', 'ErpExtractionRecoverySucceeded', 'ErpExtractionRunRecovered',
  'ErpSourceDocumentAccepted', 'ErpSourceDocumentConflict', 'ErpSourceDocumentDeferred',
  'ErpSourceDocumentDuplicate', 'ErpSourceDocumentRejected', 'IdentityEmailVerified',
  'IdentityInvitationAccepted', 'IdentityInvitationIssued', 'IdentityInvitationResent',
  'IdentityInvitationRevoked', 'IdentityPasswordReset', 'IdentityUserCreated',
  'IdentityUserDeactivated', 'IdentityUserLocked', 'IdentityUserUnlocked', 'IdentityUserUpdated',
  'ImpersonationRefused', 'ImpersonationRequested', 'ImpersonationStarted', 'LoginFailed',
  'LoginSucceeded', 'MfaChallengeSucceeded', 'MfaDisabled', 'MfaReplacementStepUp',
  'MtlsPrincipalDisabled', 'MtlsPrincipalRegistered', 'OAuthClientDisabled',
  'OAuthClientSecretRotated', 'OAuthRefreshTokenRotated', 'OAuthTokenIssued', 'OAuthTokenRevoked',
  'PlatformBootstrapGrantConsumed', 'PlatformTenantPlanChanged', 'PrivacyDataExported',
  'PrivacyErasureRequested', 'RefreshTokenRotated', 'SessionRevokedByAdmin',
  'SessionRevokedByUser', 'SubscriptionBillSuperseded', 'SubscriptionBillVoided',
  'SubscriptionCardPaymentHeld', 'SubscriptionCardPaymentRecovered',
  'SubscriptionCardPaymentReversed', 'SubscriptionPaidPeriodExtended',
  'SubscriptionPaymentConfirmed', 'SubscriptionPaymentProofRead', 'SubscriptionPaymentSubmitted',
  'SubscriptionPaymentWithdrawn', 'SubscriptionPlanAssigned', 'SubscriptionPlanChanged',
  'SubscriptionTrialException', 'SubscriptionTrialStarted', 'TenantIdentityPolicyEnforced',
  'TenantIdentityPolicyUpdated', 'WebhookEndpointCreated', 'WebhookEndpointDeleted',
  'WebhookSecretRotated', 'WebhookTestRequested', 'SmpParticipantReRegistrationQueued',
  'SmpParticipantReRegistrationSkipped', 'SmpTenantVerifiedSubmissionReleased',
]

const RESOURCES = [
  'USER', 'SESSION', 'DEVICE', 'TENANT', 'CUSTOMER', 'CUSTOMER_IMPORT', 'CUSTOMER_LOGO', 'API_KEY',
  'OAUTH_CLIENT', 'USER_INVITATION', 'ROLE', 'BANK_BENEFICIARY', 'SUBSCRIPTION_PAYMENT',
  'SUBSCRIPTION_BILL', 'WEBHOOK_ENDPOINT', 'INVOICE_BATCH', 'SELF_BILLING_AGREEMENT',
]

type Locale = { activityLog: { event: Record<string, string>; resource: Record<string, string> } }
const events = (locale: Locale) => locale.activityLog.event
const resources = (locale: Locale) => locale.activityLog.resource

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('activity log words', () => {
  it('has English and Arabic words for every event type the server writes', () => {
    expect(EMITTED.filter((type) => !events(en)[type])).toEqual([])
    expect(EMITTED.filter((type) => !events(ar)[type])).toEqual([])
  })

  it('has English and Arabic words for every resource kind the server writes', () => {
    expect(RESOURCES.filter((type) => !resources(en)[type])).toEqual([])
    expect(RESOURCES.filter((type) => !resources(ar)[type])).toEqual([])
  })

  it('names a known event in the reader language', async () => {
    expect(activityEventWords(i18n, 'CustomerCreated')).toBe('Customer added')
    expect(activityEventWords(i18n, 'LoginSucceeded')).toBe('Signed in')
    await i18n.changeLanguage('ar')
    expect(activityEventWords(i18n, 'CustomerCreated')).toBe('أُضيف عميل')
  })

  it('reads an unknown event from its type, and says "Recorded event" only when none is given', () => {
    expect(activityEventWords(i18n, 'InvoiceArchiveSealed')).toBe('Invoice archive sealed')
    expect(activityEventWords(i18n, '')).toBe('Recorded event')
    expect(activityEventWords(i18n, null)).toBe('Recorded event')
  })

  it('splits PascalCase without breaking an acronym the server capitalised', () => {
    expect(readableCode('ErpSourceDocumentAccepted')).toBe('Erp source document accepted')
    expect(readableCode('SMPRecordPublished')).toBe('SMP record published')
    expect(readableCode('As4MessageSent')).toBe('As4 message sent')
  })
})
