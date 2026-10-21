import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import i18n from '../../../i18n'
import {
  REFUND_REASONS,
  refundReasonKey,
  type SignupPaymentReview,
} from '../../../lib/console/companyVerification'
import { SignupPaymentPanel } from './SignupPaymentPanel'

const review = (reason: string): SignupPaymentReview => ({
  payment: {
    id: 'p-1',
    method: 'BANK_TRANSFER',
    status: 'VERIFIED',
    amount: '84.000',
    reference: 'TRX-1',
    customerNote: null,
    submittedAt: '2026-10-12T05:00:00Z',
    proofContentType: null,
  },
  refundCase: { reason, amount: '84.000', status: 'OPEN' },
})

const show = (reason: string) =>
  render(<SignupPaymentPanel read={{ status: 'ready', data: review(reason) }} retry={() => {}} />)

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('Refund reason labels (RF-2)', () => {
  it('has a label in English and Arabic for every reason the backend sends', async () => {
    for (const reason of REFUND_REASONS) {
      const key = refundReasonKey(reason)
      expect(key).toBe(`console.verification.payment.refundReason.${reason}`)
      expect(i18n.exists(key, { lng: 'en' })).toBe(true)
      expect(i18n.exists(key, { lng: 'ar' })).toBe(true)
    }
  })

  it('names a refund for a period paid in advance that the customer cancelled', () => {
    show('CANCELLED_BY_CUSTOMER')
    expect(
      screen.getByText('Open: cancelled by the customer (period paid in advance)'),
    ).toBeTruthy()
  })

  it('names one Fawtir cancelled too', () => {
    show('CANCELLED_BY_FAWTIR')
    expect(screen.getByText('Open: cancelled by Fawtir (period paid in advance)')).toBeTruthy()
  })

  it('shows a reason this build does not know as an open case, never as a raw key', () => {
    const { container } = show('SOMETHING_NEW')
    expect(refundReasonKey('SOMETHING_NEW')).toBe('console.verification.payment.refundReason.other')
    expect(screen.getByText('Open')).toBeTruthy()
    expect(container.textContent).not.toContain('SOMETHING_NEW')
    expect(container.textContent).not.toContain('refundReason')
  })

  it('speaks Arabic', async () => {
    await i18n.changeLanguage('ar')
    show('CANCELLED_BY_CUSTOMER')
    expect(screen.getByText('مفتوحة: ألغاه العميل (فترة مدفوعة مسبقًا)')).toBeTruthy()
    expect(i18n.t(refundReasonKey('CANCELLED_BY_FAWTIR'))).toBe(
      'مفتوحة: ألغاه فوتر (فترة مدفوعة مسبقًا)',
    )
  })
})
