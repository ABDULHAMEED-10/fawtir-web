import { useSyncExternalStore } from 'react'
import {
  EXTRACTION_AVAILABILITY_DEFAULT,
  TRIAL,
  type AnyPlanId,
  type ExtractionAvailability,
  type PlanId,
} from './plans'

/**
 * Everything the platform lets an operator configure without a release — Super Admin › Console
 * settings (`Fawtir_Subscription_Defaults`, `Fawtir_Pricing_Model` §9, and the payment rules of
 * 15 Sep 2026). These are the launch values; the screen edits them in memory until the backend
 * gives them a home.
 *
 * Four things are not here on purpose: document retention, access to the compliance record while
 * suspended, whether compliance features can be gated, and a change to a live plan applying to new
 * subscriptions only. Those are legal obligations, listed read-only in `FIXED_BY_DESIGN`; a
 * setting would let an operator sell a plan that cannot meet the mandate.
 */

export type Section =
  | 'billing'
  | 'counting'
  | 'overage'
  | 'lifecycle'
  | 'notices'
  | 'addons'
  | 'payments'
  | 'promotional'
  | 'operations'

export type CountingRule =
  | 'issued'
  | 'selfBilling'
  | 'received'
  | 'tradeOverPeppol'
  | 'tradeHeld'
  | 'posSimplified'
  | 'receiptNoTax'
  | 'draft'
  | 'voided'
  | 'failedValidation'
  | 'rejectedByOta'
  | 'resubmission'

export const COUNTING_RULES: CountingRule[] = [
  'issued',
  'selfBilling',
  'received',
  'tradeOverPeppol',
  'tradeHeld',
  'posSimplified',
  'receiptNoTax',
  'draft',
  'voided',
  'failedValidation',
  'rejectedByOta',
  'resubmission',
]

export type PlatformSettings = {
  billing: {
    /** Locked: the platform bills in rial only. */
    currency: 'OMR'
    vatRate: number
    pricesShownExclusive: boolean
    minimumTermMonths: number
    billingAnchor: 'signup' | 'firstOfMonth'
    invoiceSeriesPrefix: string
  }
  counting: {
    rules: Record<CountingRule, boolean>
    consumedAt: 'transmission' | 'creation'
    poolsAcrossPeriod: boolean
  }
  overage: {
    permitted: boolean
    enabledByDefault: boolean
    /** Null: no ceiling. */
    hardCeiling: number | null
  }
  lifecycle: {
    defaultForNewTenant: 'trial' | PlanId
    trialDays: number
    trialDocuments: number
    /** 'chosen': the trial carries the plan the tenant picked; a plan id pins every trial to it. */
    trialPlan: 'chosen' | PlanId
    /** Enterprise starts from a contract, never a trial. */
    trialOfferedOn: PlanId[]
    trialAutoConverts: boolean
    trialNeedsPaymentDetails: boolean
    autoRenewal: boolean
    graceDays: number
    graceNoticeDays: number[]
    cancellationNoticeDays: number
    refundMidPeriod: boolean
    upgrade: 'immediateProRata' | 'periodEnd'
    downgrade: 'periodEnd' | 'immediate'
    whileSuspended: 'readOnly' | 'locked'
  }
  notices: {
    thresholds: number[]
    recipients: 'ownerAndAdmins' | 'ownerOnly' | 'everyone'
    language: 'customer' | 'en' | 'ar'
    channels: { email: boolean; inApp: boolean }
  }
  addons: {
    /** Mapping follows the plan's feature switch (Business Plus and Enterprise at launch). */
    erpMapping: 'perPlan'
    erpExtraction: {
      monthly: number
      documents: number
      overage: number
      /** Per plan: not offered · offered at the price · included free. */
      availability: Record<AnyPlanId, ExtractionAvailability>
    }
    /** Settled 15 Sep 2026: no separate POS plan and no terminal charge. */
    pos: 'noSeparatePlan'
  }
  payments: {
    provider: 'paymob'
    mode: 'test' | 'live'
    /** Masked; the real key lives in the backend. */
    publishableKeyTail: string
    methods: Record<'cardLink' | 'bankTransfer' | 'cash' | 'cheque', boolean>
    bank: { accountName: string; bank: string; iban: string; referenceFormat: string }
    /**
     * Whether `bank` holds Fawtir's confirmed beneficiary. While false, no screen shows the
     * account, IBAN or a copy button, and sign-up does not offer bank transfer: a customer must
     * never be told to pay into an account nobody has confirmed. Turn on only together with
     * verified details from Fawtir's finance team.
     */
    bankBeneficiaryVerified: boolean
    linkExpiryDays: number
    autoActivateOnlinePayment: boolean
    proofRequiredForCash: boolean
    reminderDays: number[]
    whatsappTemplate: { en: string; ar: string }
  }
  promotional: {
    discountCodes: boolean
    referralCommission: boolean
    introductoryPricing: boolean
  }
  operations: {
    temporaryQuotaGrant: boolean
    overageWaiver: boolean
    grandfathering: boolean
  }
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  billing: {
    currency: 'OMR',
    vatRate: 0.05,
    pricesShownExclusive: true,
    minimumTermMonths: 0,
    billingAnchor: 'signup',
    invoiceSeriesPrefix: 'FWT',
  },
  counting: {
    rules: {
      issued: true,
      selfBilling: true,
      received: true,
      tradeOverPeppol: true,
      tradeHeld: false,
      posSimplified: true,
      receiptNoTax: false,
      draft: false,
      voided: false,
      failedValidation: false,
      rejectedByOta: true,
      resubmission: true,
    },
    consumedAt: 'transmission',
    poolsAcrossPeriod: true,
  },
  overage: { permitted: true, enabledByDefault: true, hardCeiling: null },
  lifecycle: {
    defaultForNewTenant: 'trial',
    trialDays: TRIAL.days,
    trialDocuments: TRIAL.documents,
    trialPlan: 'chosen',
    trialOfferedOn: [...TRIAL.offeredOn],
    trialAutoConverts: TRIAL.autoConverts,
    trialNeedsPaymentDetails: TRIAL.paymentDetailsRequired,
    autoRenewal: true,
    graceDays: 14,
    graceNoticeDays: [1, 7, 13],
    cancellationNoticeDays: 0,
    refundMidPeriod: false,
    upgrade: 'immediateProRata',
    downgrade: 'periodEnd',
    whileSuspended: 'readOnly',
  },
  notices: {
    thresholds: [50, 80, 100],
    recipients: 'ownerAndAdmins',
    language: 'customer',
    channels: { email: true, inApp: true },
  },
  addons: {
    erpMapping: 'perPlan',
    erpExtraction: {
      monthly: 20,
      documents: 1_000,
      overage: 0.02,
      availability: { ...EXTRACTION_AVAILABILITY_DEFAULT },
    },
    pos: 'noSeparatePlan',
  },
  payments: {
    provider: 'paymob',
    mode: 'live',
    publishableKeyTail: '…7f3a',
    methods: { cardLink: true, bankTransfer: true, cash: true, cheque: true },
    bank: {
      accountName: 'Insight Technology LLC',
      bank: 'Bank Muscat',
      // Empty on purpose. The launch default was unconfirmed and not even a valid Omani IBAN
      // (20 characters; Oman's are 23), so it is gone rather than merely hidden; the console's
      // Payments section asks for the verified one before bank transfer can be saved.
      iban: '',
      /** The subscription invoice number is the reference; it already carries the FWT- series. */
      referenceFormat: '{invoice}',
    },
    bankBeneficiaryVerified: false,
    linkExpiryDays: 7,
    autoActivateOnlinePayment: false,
    proofRequiredForCash: false,
    reminderDays: [3, 7],
    whatsappTemplate: {
      en: 'Hello {{contact}}, your Fawtir {{plan}} subscription for {{period}} is {{amount}}. Pay securely here: {{link}} (valid {{days}} days). Reply to this message if you would rather pay by bank transfer or cash.',
      ar: 'مرحبًا {{contact}}، اشتراككم في فوتر (خطة {{plan}}) لفترة {{period}} هو {{amount}}. ادفعوا بأمان عبر الرابط: {{link}} (صالح {{days}} أيام). ردّوا على هذه الرسالة إن فضّلتم التحويل البنكي أو الدفع نقدًا.',
    },
  },
  promotional: { discountCodes: false, referralCommission: false, introductoryPricing: false },
  operations: { temporaryQuotaGrant: true, overageWaiver: true, grandfathering: true },
}

/** Legal obligations, never settings. `console.settings.fixed.*` */
export const FIXED_BY_DESIGN = [
  'retention',
  'complianceRecord',
  'complianceFeatures',
  'livePlanChange',
] as const

/* -------------------------------------------------------------------- store */

/** The operator signed in to the mock console; the real name comes from the session. */
const OPERATOR_NAME = 'Nasser Al Habsi'

type SavedMark = { section: Section; by: string; at: Date }

type State = { settings: PlatformSettings; saved: SavedMark[] }

let state: State = { settings: DEFAULT_SETTINGS, saved: [] }
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The live values for anything outside React that needs them — the subscriptions ledger, for one. */
export const PLATFORM_SETTINGS = new Proxy({} as PlatformSettings, {
  get: (_, key: keyof PlatformSettings) => state.settings[key],
})

export const settingsStore = {
  save<S extends Section>(section: S, values: PlatformSettings[S]) {
    state = {
      settings: { ...state.settings, [section]: values },
      saved: [
        { section, by: OPERATOR_NAME, at: new Date() },
        ...state.saved.filter((mark) => mark.section !== section),
      ],
    }
    listeners.forEach((listener) => listener())
  },
  reset(section: Section) {
    state = {
      settings: { ...state.settings, [section]: DEFAULT_SETTINGS[section] },
      saved: state.saved.filter((mark) => mark.section !== section),
    }
    listeners.forEach((listener) => listener())
  },
}

export function usePlatformSettings() {
  const current = useSyncExternalStore(subscribe, () => state)
  return {
    settings: current.settings,
    /** Every section saved this session, newest first — the audit log reads it. */
    saved: current.saved,
    savedMark: (section: Section) => current.saved.find((mark) => mark.section === section),
    isDefault: (section: Section) =>
      JSON.stringify(current.settings[section]) === JSON.stringify(DEFAULT_SETTINGS[section]),
  }
}

export const SECTIONS: Section[] = [
  'billing',
  'counting',
  'overage',
  'lifecycle',
  'notices',
  'addons',
  'payments',
  'promotional',
  'operations',
]
