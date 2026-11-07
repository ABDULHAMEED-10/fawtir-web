import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import type { CreditNoteRowDto } from '../api/expenditure/notes'
import { toCreditNoteItem } from './supplierNoteList'

// PRV-b39 W-C2 (EXP fa8387d25): a credit note naming a held Peppol copy waits for that pair's
// decision. Written NOT RUN (static batch).

const HELD = '55555555-5555-4555-8555-555555555555'

const row = (overrides: Partial<CreditNoteRowDto> = {}): CreditNoteRowDto =>
  ({
    id: 'cn-1',
    inboundDeliveryId: 'd-1',
    source: 'PEPPOL',
    networkVerified: true,
    supplierId: 's-1',
    supplierName: 'Qalhat Marine Supplies',
    supplierParticipantId: '0248:om1100123456',
    documentTypeCode: '381',
    creditNoteNumber: 'CN-1',
    issueDate: '2026-10-01',
    currencyCode: 'OMR',
    taxCurrencyCode: null,
    creditedAmount: 10,
    vatAmount: 0.5,
    reasonCode: null,
    approval: 'NONE',
    status: 'WAITING_FOR_BILL',
    usage: 'NOT_USED',
    balance: { applied: 0, refunded: 0, remaining: 10 },
    credits: { billNumber: 'QMS-7781', issueDate: null, documentUuid: null, billId: null, applied: false },
    ...overrides,
  }) as CreditNoteRowDto

describe('a credit note waiting for the duplicate decision', () => {
  it('names the held copy while the server says it waits', () => {
    const item = toCreditNoteItem(row({ waitingFor: { reason: 'DUPLICATE_DECISION', billId: HELD } }))
    expect(item.waitingForDecisionOn).toBe(HELD)
    // The status keeps its own value: the reason is shown beside it, not instead of it.
    expect(item.status).toBe('WAITING_FOR_BILL')
  })

  it('is ordinary credit when null (after either decision) or absent (an older server)', () => {
    expect(toCreditNoteItem(row({ waitingFor: null })).waitingForDecisionOn).toBeNull()
    expect(toCreditNoteItem(row()).waitingForDecisionOn).toBeNull()
  })

  it('reads a reason this client does not know as nothing, so the note shows as before', () => {
    const later = { reason: 'SOMETHING_LATER', billId: HELD } as unknown as CreditNoteRowDto['waitingFor']
    expect(toCreditNoteItem(row({ waitingFor: later })).waitingForDecisionOn).toBeNull()
  })

  it('has the sentence in both languages', () => {
    expect(i18n.t('supplierCreditNotes.waitingDuplicate.onBill', { lng: 'en', number: 'QMS-7781' })).toBe(
      'Waiting for the duplicate decision on bill QMS-7781',
    )
    for (const key of ['onBill', 'onItsBill']) {
      expect(i18n.t(`supplierCreditNotes.waitingDuplicate.${key}`, { lng: 'ar' })).not.toBe(
        `supplierCreditNotes.waitingDuplicate.${key}`,
      )
    }
  })
})
