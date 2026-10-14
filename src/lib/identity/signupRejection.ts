import type { TFunction, i18n as I18n } from 'i18next'

/**
 * A rejection code from `/signup/status` as words. The reviewer's own labels name each reason;
 * a code this app has no label for points to the email, which always names the reason.
 */
export function rejectionReasonLabel(code: string, t: TFunction, i18n: I18n): string {
  const key = `console.verification.detail.reason.${code}`
  return i18n.exists(key) ? t(key) : t('signupPending.reasonOther')
}

/** A held payment Finance has confirmed: the money a closed application refunds. */
export function isConfirmedPayment(status: string | undefined): boolean {
  return status === 'FUNDS_VERIFIED' || status === 'CONFIRMED'
}

/** A reason that stands as its own sentence: it gets a full stop unless it already ends with one. */
export function asSentence(text: string): string {
  const trimmed = text.trim()
  return /[.!?؟]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

/** A reason placed before a sentence's own full stop: one full stop it already ends with is dropped. */
export function withoutFinalStop(text: string): string {
  return text.replace(/\.\s*$/, '')
}
