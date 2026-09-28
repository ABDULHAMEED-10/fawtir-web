import { describe, expect, it } from 'vitest'
import { NOTE_REASONS, noteProblems, type NoteForm, type NoteLine } from './salesNote'

const added = (taxCategory: Partial<NoteLine['taxCategory']>): NoteLine =>
  ({
    lineNumber: 1000,
    include: true,
    fromInvoice: false,
    productId: null,
    productCode: null,
    description: 'Delivery charge',
    kind: 'service',
    unitCode: 'C62',
    classification: null,
    invoiceQuantity: null,
    invoiceUnitPrice: null,
    quantity: '1',
    unitPrice: '5.000',
    discountType: 'PERCENTAGE',
    discountValue: '0',
    taxCategory: {
      code: 'S5',
      en16931Category: 'S',
      rate: 5,
      exemptionReason: null,
      exemptionReasonCode: null,
      ...taxCategory,
    },
  }) as NoteLine

const form = (line: NoteLine) =>
  ({
    mode: 'additionalItems',
    reason: NOTE_REASONS.DEBIT_NOTE[0].id,
    reference: '',
    note: '',
    issueDate: '2026-09-28',
    dueDate: '2026-10-28',
    lines: [line],
  }) as unknown as NoteForm

describe('a line added on a debit note picks its own tax category', () => {
  it('needs a reason when the added line is zero-rated, and none at standard rate', () => {
    const problems = (line: NoteLine) => noteProblems(form(line), 'DEBIT_NOTE', '2026-09-28').lines
    expect(problems(added({}))).toBeUndefined()
    expect(problems(added({ code: 'Z0', en16931Category: 'Z', rate: 0 }))).toBe(
      'salesNote.error.vatReason',
    )
    expect(
      problems(
        added({ code: 'Z0', en16931Category: 'Z', rate: 0, exemptionReasonCode: 'VATZR-OM-09' }),
      ),
    ).toBeUndefined()
  })
})
