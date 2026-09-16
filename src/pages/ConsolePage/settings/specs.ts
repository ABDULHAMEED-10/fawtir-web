import type { Section } from '../../../lib/platformSettings'
import {
  compact,
  fromForm,
  numberError,
  requiredError,
  spec,
  toForm,
  type FieldErrors,
  type Forms,
  type SectionSpec,
} from './draft'

/**
 * What Save checks in each section, and how the two sections whose figures are not edited as
 * stored (VAT as a percentage, rial to three places) move between the store and the form. Kept
 * apart from the section components so each of those files exports components only.
 */

export function validateBilling(form: Forms['billing']): FieldErrors {
  return compact({
    vatRate: numberError(form.vatRate, { min: 0, max: 100 }),
    minimumTermMonths: numberError(form.minimumTermMonths, { min: 0, integer: true }),
    invoiceSeriesPrefix: requiredError(form.invoiceSeriesPrefix),
  })
}

/** The VAT rate is held as a fraction (0.05) and edited as a percentage (5). */
export const billingSpec = spec('billing', validateBilling, {
  toForm: (values) => ({
    ...toForm('billing', values),
    vatRate: String(Math.round(values.vatRate * 10_000) / 100),
  }),
  fromForm: (form) => ({ ...fromForm('billing', form), vatRate: Number(form.vatRate) / 100 }),
})

export const countingSpec = spec('counting', () => ({}))

export function validateOverage(form: Forms['overage']): FieldErrors {
  return compact({
    hardCeiling: numberError(form.hardCeiling, { min: 1, integer: true, optional: true }),
  })
}

export const overageSpec = spec('overage', validateOverage)

export function validateLifecycle(form: Forms['lifecycle']): FieldErrors {
  const graceDays = Number(form.graceDays)
  const noticeBeyondGrace =
    Number.isFinite(graceDays) && form.graceNoticeDays.some((day) => day > graceDays)
  return compact({
    trialDays: numberError(form.trialDays, { min: 1, integer: true }),
    trialDocuments: numberError(form.trialDocuments, { min: 0, integer: true }),
    graceDays: numberError(form.graceDays, { min: 1, integer: true }),
    graceNoticeDays: noticeBeyondGrace ? 'console.settings.error.noticeBeyondGrace' : undefined,
    cancellationNoticeDays: numberError(form.cancellationNoticeDays, { min: 0, integer: true }),
  })
}

export const lifecycleSpec = spec('lifecycle', validateLifecycle)

export function validateNotices(form: Forms['notices']): FieldErrors {
  return compact({
    thresholds: form.thresholds.length === 0 ? 'console.settings.error.noThreshold' : undefined,
    channels:
      !form.channels.email && !form.channels.inApp ? 'console.settings.error.noChannel' : undefined,
  })
}

export const noticesSpec = spec('notices', validateNotices)

export function validateAddons(form: Forms['addons']): FieldErrors {
  const { erpExtraction } = form
  return compact({
    'erpExtraction.monthly': numberError(erpExtraction.monthly, { min: 0 }),
    'erpExtraction.documents': numberError(erpExtraction.documents, { min: 0, integer: true }),
    'erpExtraction.overage': numberError(erpExtraction.overage, { min: 0 }),
  })
}

/** Money is edited to three places, the way every rial figure is written. */
export const addonsSpec = spec('addons', validateAddons, {
  toForm: (values) => {
    const form = toForm('addons', values)
    return {
      ...form,
      erpExtraction: {
        ...form.erpExtraction,
        monthly: values.erpExtraction.monthly.toFixed(3),
        overage: values.erpExtraction.overage.toFixed(3),
      },
    }
  },
})

export function validatePayments(form: Forms['payments']): FieldErrors {
  const bankRequired = form.methods.bankTransfer
  return compact({
    linkExpiryDays: numberError(form.linkExpiryDays, { min: 1, integer: true }),
    'bank.accountName': bankRequired ? requiredError(form.bank.accountName) : undefined,
    'bank.bank': bankRequired ? requiredError(form.bank.bank) : undefined,
    'bank.iban': bankRequired ? requiredError(form.bank.iban) : undefined,
    'whatsappTemplate.en': requiredError(form.whatsappTemplate.en),
    'whatsappTemplate.ar': requiredError(form.whatsappTemplate.ar),
  })
}

export const paymentsSpec = spec('payments', validatePayments)

export const promotionalSpec = spec('promotional', () => ({}))

export const operationsSpec = spec('operations', () => ({}))

export const SPECS: { [S in Section]: SectionSpec<S> } = {
  billing: billingSpec,
  counting: countingSpec,
  overage: overageSpec,
  lifecycle: lifecycleSpec,
  notices: noticesSpec,
  addons: addonsSpec,
  payments: paymentsSpec,
  promotional: promotionalSpec,
  operations: operationsSpec,
}
