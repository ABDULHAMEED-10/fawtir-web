import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError, NetworkError } from '../api'
import { describeApiFailure } from './apiFailure'
import { MAPPED_REFUSAL_CODES, REFUSAL_FALLBACK_KEY, refusalMessageKey } from './expenditureRefusals'
import { refusalOf } from './paymentRuns'

const refusal = (code: string | null, problem?: Record<string, unknown>) =>
  new ApiError({
    status: 400,
    problemType: 'expenditure-refused',
    code,
    correlationId: 'trace-1',
    problem,
  })

describe('an Expenditure refusal is a decision, not a fault', () => {
  it('gives the named rule its own sentence', () => {
    expect(refusalMessageKey(refusal('CREDIT_NOTE_SUPPLIER_MISMATCH'))).toBe(
      'apiErrors.refused.creditNoteSupplierMismatch',
    )
  })

  it('never tells the reader to try again, because no refusal succeeds on a retry', async () => {
    await i18n.changeLanguage('en')
    for (const code of [...MAPPED_REFUSAL_CODES, 'SOME_CODE_THIS_BUILD_HAS_NEVER_SEEN']) {
      const message = describeApiFailure(refusal(code))
      const text = i18n.t(message.key)
      expect(text, code).not.toMatch(/try again/i)
      expect(text, code).not.toBe(message.key) // the key itself would mean a missing translation
    }
  })

  it('falls back rather than rendering a raw code for a rule this build has not mapped', () => {
    expect(refusalMessageKey(refusal('GOODS_RECEIPT_NUMBER_SEQUENCE_INVALID'))).toBe(REFUSAL_FALLBACK_KEY)
    expect(refusalMessageKey(refusal(null))).toBe(REFUSAL_FALLBACK_KEY)
  })

  it('carries the reference, which is the only thing support can act on', () => {
    expect(describeApiFailure(refusal('CREDIT_NOTE_SUPPLIER_MISMATCH')).reference).toBe('trace-1')
  })

  it('leaves every other failure to the existing branches', () => {
    expect(refusalMessageKey(new ApiError({ status: 400, problemType: 'validation-failed' }))).toBeNull()
    expect(refusalMessageKey(new ApiError({ status: 403, problemType: 'access-denied' }))).toBeNull()
    expect(refusalMessageKey(new NetworkError('offline'))).toBeNull()
    expect(refusalMessageKey(new Error('boom'))).toBeNull()

    // A refusal must not be swallowed by the status branches that come after it.
    expect(describeApiFailure(new ApiError({ status: 404, problemType: 'not-found' })).key).toBe('apiErrors.notFound')
  })

  it('gives each reminder rule refusal the sentence written for it, in both languages', async () => {
    const sentences: Record<string, [string, string]> = {
      REMINDER_RULE_EMPTY: [
        'Choose when to remind, or switch this off.',
        'اختر موعد التذكير، أو أوقف هذا التذكير.',
      ],
      REMINDER_RULE_REPEAT_NOT_ALLOWED: ['That reminder does not repeat.', 'هذا التذكير لا يتكرر.'],
      REMINDER_RULE_RECIPIENT_REQUIRED: [
        'This reminder has to name at least one person to tell.',
        'هذا التذكير يجب أن يسمّي شخصًا واحدًا على الأقل لإبلاغه.',
      ],
      REMINDER_RULE_RECIPIENT_UNKNOWN: [
        'One of the people chosen is no longer on the team. Choose again.',
        'أحد الأشخاص المختارين لم يعد ضمن الفريق. اختر من جديد.',
      ],
      // The owner's sentence of 2 Oct: it does not tell the reader about "the server".
      REMINDER_RULE_OFFSET_OUT_OF_RANGE: [
        "That number of days isn't allowed here.",
        'هذا العدد من الأيام غير مسموح هنا.',
      ],
      REMINDER_RULE_ESCALATION_OUT_OF_RANGE: [
        "That number of days isn't allowed here.",
        'هذا العدد من الأيام غير مسموح هنا.',
      ],
    }
    for (const [code, [english, arabic]] of Object.entries(sentences)) {
      const message = describeApiFailure(refusal(code))
      expect(MAPPED_REFUSAL_CODES, code).toContain(code)
      expect(i18n.t(message.key, { lng: 'en' }), code).toBe(english)
      expect(i18n.t(message.key, { lng: 'ar' }), code).toBe(arabic)
      expect(message.reference).toBe('trace-1')
    }
    // The six that were already mapped keep their own.
    expect(refusalMessageKey(refusal('REMINDER_RULE_NEEDS_RECIPIENT'))).toBe(
      'apiErrors.refused.reminderNeedsRecipient',
    )
    expect(refusalMessageKey(refusal('REMINDER_RULE_REPEAT_OUT_OF_RANGE'))).toBe(
      'apiErrors.refused.reminderRepeatOutOfRange',
    )
  })

  it('keeps the plain validation sentence for a server that sends a reminder refusal with no code', () => {
    // Before the controller kept its code it answered `validation-failed` with no `error`.
    const legacy = new ApiError({ status: 400, problemType: 'validation-failed' })
    expect(refusalMessageKey(legacy)).toBeNull()
    expect(i18n.t(describeApiFailure(legacy).key, { lng: 'en' })).toBe(
      'Some details were not accepted. Check the form and try again.',
    )
    // A reminder refusal whose code this build does not know still reads as a refusal.
    expect(refusalMessageKey(refusal('REMINDER_RULE_OFFSETS_TOO_MANY'))).toBe(REFUSAL_FALLBACK_KEY)
  })

  it('says the same thing in Arabic, so a refusal is not an English-only screen', async () => {
    await i18n.changeLanguage('ar')
    for (const code of MAPPED_REFUSAL_CODES) {
      const message = describeApiFailure(refusal(code))
      expect(i18n.t(message.key), code).not.toBe(message.key)
    }
    await i18n.changeLanguage('en')
  })

  // Owner's answer 2 (2 Oct): a single payment is refused on an unresolved mismatch as a payment
  // run refuses it, and says so in the run's own sentence.
  it('says a bill that does not match its order cannot be paid, in the payment run\'s words', async () => {
    const mismatched = refusal('BILL_PAYMENT_MISMATCHED')
    expect(MAPPED_REFUSAL_CODES).toContain('BILL_PAYMENT_MISMATCHED')
    expect(i18n.t(describeApiFailure(mismatched).key)).toBe("That bill doesn't match its order.")
    expect(i18n.t(describeApiFailure(mismatched).key)).toBe(
      refusalOf(refusal('PAYMENT_RUN_BILL_MISMATCHED'), i18n.t),
    )
    await i18n.changeLanguage('ar')
    expect(i18n.t(describeApiFailure(mismatched).key)).toBe('هذه الفاتورة لا تطابق أمر الشراء.')
    await i18n.changeLanguage('en')
  })

  // Draft wording, pending the owner (Wording-For-Abdul.md row 17).
  it('says a run holds a held bill, on any screen that does not name the code itself', async () => {
    const held = refusal('PAYMENT_RUN_BILL_ON_HOLD')
    expect(MAPPED_REFUSAL_CODES).toContain('PAYMENT_RUN_BILL_ON_HOLD')
    expect(i18n.t(describeApiFailure(held).key)).toBe(
      'A bill in this run is on hold. Release it or take it out of the run first.',
    )
    await i18n.changeLanguage('ar')
    expect(i18n.t(describeApiFailure(held).key)).toBe(
      'في هذه الدفعة فاتورة قيد الانتظار. أفرج عنها أو أخرجها من الدفعة أولًا.',
    )
    await i18n.changeLanguage('en')
    // The payment run screens are outside this round and keep the sentence they already had.
    expect(refusalOf(held, i18n.t)).toBe('That bill is on hold. Release it before paying.')
  })

  // The owner's sentences of 6 Oct for the bill a credit is set against, and the refund's date.
  it('gives each credit note refusal the sentence the owner approved, in both languages', () => {
    const sentences: Record<string, [string, string]> = {
      CREDIT_NOTE_TARGET_ON_HOLD: [
        'This bill is on hold. Release it before setting a credit against it.',
        'هذه الفاتورة قيد الانتظار. أفرج عنها قبل خصم الرصيد منها.',
      ],
      CREDIT_NOTE_TARGET_REJECTED: [
        'This bill was rejected, so a credit cannot be set against it.',
        'هذه الفاتورة مرفوضة، لذا لا يمكن خصم الرصيد منها.',
      ],
      CREDIT_NOTE_TARGET_DEBIT_NOTE_REFUSED: [
        'This debit note was refused, so a credit cannot be set against it.',
        'هذا الإشعار المدين مرفوض، لذا لا يمكن خصم الرصيد منه.',
      ],
      CREDIT_NOTE_REFUND_DATE_IN_FUTURE: [
        'The refund date cannot be in the future.',
        'لا يمكن أن يكون تاريخ الاسترداد في المستقبل.',
      ],
      CREDIT_NOTE_REFUND_DATE_BEFORE_NOTE: [
        "The refund date cannot be before the credit note's date.",
        'لا يمكن أن يكون تاريخ الاسترداد قبل تاريخ الإشعار الدائن.',
      ],
      CREDIT_NOTE_TARGET_CANCELLED: [
        'This bill was cancelled, so a credit cannot be set against it.',
        'أُلغيت هذه الفاتورة، لذا لا يمكن خصم الرصيد منها.',
      ],
      CREDIT_NOTE_TARGET_FULLY_CREDITED: [
        'This bill is already fully credited.',
        'خُصم من هذه الفاتورة رصيد بكامل قيمتها بالفعل.',
      ],
    }
    for (const [code, [english, arabic]] of Object.entries(sentences)) {
      const message = describeApiFailure(refusal(code))
      expect(MAPPED_REFUSAL_CODES, code).toContain(code)
      expect(i18n.t(message.key, { ...message.values, lng: 'en' }), code).toBe(english)
      expect(i18n.t(message.key, { ...message.values, lng: 'ar' }), code).toBe(arabic)
      expect(message.reference).toBe('trace-1')
    }
  })

  it('names the payment run the bill is in, from the problem beside the code', () => {
    const message = describeApiFailure(
      refusal('CREDIT_NOTE_TARGET_IN_PAYMENT_RUN', { paymentRunReference: 'PR-0007' }),
    )
    expect(message.values).toEqual({ run: 'PR-0007' })
    expect(i18n.t(message.key, { ...message.values, lng: 'en' })).toBe(
      'This bill is in payment run PR-0007, whose bank file is already made. Keep the credit for another bill.',
    )
    expect(i18n.t(message.key, { ...message.values, lng: 'ar' })).toBe(
      'هذه الفاتورة ضمن دفعة السداد PR-0007 وقد أُنشئ ملفها البنكي. احتفظ بالرصيد لفاتورة أخرى.',
    )
    // As the bill pages read it: a server that sends no run leaves the place empty, never a
    // placeholder or a raw key.
    const bare = describeApiFailure(refusal('CREDIT_NOTE_TARGET_IN_PAYMENT_RUN'))
    expect(bare.values).toEqual({ run: '' })
    expect(i18n.t(bare.key, { ...bare.values, lng: 'en' })).not.toContain('{{run}}')
  })

  it('leaves the two sentences held back unmapped, so they read as the generic refusal', () => {
    // PAYMENT_RUN_AMOUNT_CHANGED waits for a payment run decision; CREDIT_NOTE_ON_HOLD was dropped.
    expect(MAPPED_REFUSAL_CODES).not.toContain('PAYMENT_RUN_AMOUNT_CHANGED')
    expect(MAPPED_REFUSAL_CODES).not.toContain('CREDIT_NOTE_ON_HOLD')
    expect(refusalMessageKey(refusal('PAYMENT_RUN_AMOUNT_CHANGED'))).toBe(REFUSAL_FALLBACK_KEY)
    // A refusal with no value to name carries none.
    expect(describeApiFailure(refusal('CREDIT_NOTE_TARGET_ON_HOLD')).values).toBeUndefined()
  })

  // The owner's sentences of 8 Oct for supplier debit notes.
  it('gives the two debit note refusals the sentences the owner approved, in both languages', () => {
    const sentences: Record<string, [string, string]> = {
      BILL_PAYMENT_DEBIT_NOTE_REFUSED: [
        'This debit note was refused, so it cannot be paid. Accept it first if it is owed after all.',
        'هذا الإشعار المدين مرفوض، لذا لا يمكن سداده. اقبله أولًا إن كان مستحقًا فعلًا.',
      ],
      DEBIT_NOTE_ALREADY_PAID: [
        'This debit note is already paid. Record a refund from the supplier instead.',
        'هذا الإشعار المدين مدفوع بالفعل. سجّل استردادًا من المورّد بدلًا من ذلك.',
      ],
    }
    for (const [code, [english, arabic]] of Object.entries(sentences)) {
      const message = describeApiFailure(refusal(code))
      expect(MAPPED_REFUSAL_CODES, code).toContain(code)
      expect(i18n.t(message.key, { lng: 'en' }), code).toBe(english)
      expect(i18n.t(message.key, { lng: 'ar' }), code).toBe(arabic)
      expect(message.reference).toBe('trace-1')
    }
  })

  it('says a refused debit note one way when adding it to a run and another when marking it paid', async () => {
    const refused = refusal('PAYMENT_RUN_DEBIT_NOTE_REFUSED', {
      billId: 'b-dn-7',
      supplierBillNumber: 'DN-7',
    })
    await i18n.changeLanguage('en')
    expect(refusalOf(refused, i18n.t, 'add')).toBe(
      'DN-7 was refused, so it cannot go into a payment run.',
    )
    expect(refusalOf(refused, i18n.t, 'markPaid')).toBe(
      'DN-7 was refused after it joined this run. Mark the others paid and take DN-7 out of the run.',
    )
    await i18n.changeLanguage('ar')
    expect(refusalOf(refused, i18n.t, 'add')).toBe('DN-7 مرفوض، لذا لا يمكن إضافته إلى دفعة سداد.')
    expect(refusalOf(refused, i18n.t, 'markPaid')).toBe(
      'رُفض DN-7 بعد إضافته إلى هذه الدفعة. سجّل الباقي كمدفوع وأخرج DN-7 من الدفعة.',
    )
    await i18n.changeLanguage('en')
    // A note with no number leaves the place empty, never a placeholder or a raw key.
    const bare = refusalOf(refusal('PAYMENT_RUN_DEBIT_NOTE_REFUSED'), i18n.t, 'add')
    expect(bare).not.toContain('{{note}}')
    expect(bare).toContain('was refused, so it cannot go into a payment run.')
  })

  it('keeps the generic refusal for a refused debit note when no action is named', async () => {
    // Each sentence belongs with an action; outside the payment run screens none is named.
    await i18n.changeLanguage('en')
    const refused = refusal('PAYMENT_RUN_DEBIT_NOTE_REFUSED', { supplierBillNumber: 'DN-7' })
    expect(refusalOf(refused, i18n.t)).toBe(i18n.t(REFUSAL_FALLBACK_KEY))
    expect(MAPPED_REFUSAL_CODES).not.toContain('PAYMENT_RUN_DEBIT_NOTE_REFUSED')
  })
  // The owner's sentences of 8 Oct for the two ways out of a sent payment run.
  const named = (code: string, problem: Record<string, unknown>) => refusal(code, problem)

  // No bank file is made any more (owner, 9 Oct 2026): the sentences say "after it joined this run".
  it('names the bill or note when marking a run paid is refused, in both languages', async () => {
    const changed = named('PAYMENT_RUN_AMOUNT_CHANGED', {
      billId: 'b-1',
      supplierBillNumber: 'MR-1',
    })
    const note = named('PAYMENT_RUN_DEBIT_NOTE_REFUSED', {
      billId: 'b-dn-7',
      supplierBillNumber: 'DN-7',
    })
    await i18n.changeLanguage('en')
    expect(refusalOf(changed, i18n.t, 'markPaid')).toBe(
      'The amount owed on MR-1 changed after it joined this run. Mark the others paid and take MR-1 out of the run.',
    )
    expect(refusalOf(note, i18n.t, 'markPaid')).toBe(
      'DN-7 was refused after it joined this run. Mark the others paid and take DN-7 out of the run.',
    )
    await i18n.changeLanguage('ar')
    expect(refusalOf(changed, i18n.t, 'markPaid')).toBe(
      'تغيّر المبلغ المستحق على MR-1 بعد إضافة المستند إلى هذه الدفعة. سجّل الباقي كمدفوع وأخرج MR-1 من الدفعة.',
    )
    expect(refusalOf(note, i18n.t, 'markPaid')).toBe(
      'رُفض DN-7 بعد إضافته إلى هذه الدفعة. سجّل الباقي كمدفوع وأخرج DN-7 من الدفعة.',
    )
    await i18n.changeLanguage('en')
  })

  it('keeps the generic refusal for a changed amount outside marking a run paid', async () => {
    const changed = named('PAYMENT_RUN_AMOUNT_CHANGED', {
      billId: 'b-1',
      supplierBillNumber: 'MR-1',
    })
    await i18n.changeLanguage('en')
    expect(refusalOf(changed, i18n.t, 'add')).toBe(i18n.t(REFUSAL_FALLBACK_KEY))
    expect(refusalOf(changed, i18n.t)).toBe(i18n.t(REFUSAL_FALLBACK_KEY))
  })

  it('says a settled bill is paid in full, agreeing in Arabic with a bill or a debit note', async () => {
    const bill = named('PAYMENT_RUN_BILL_SETTLED', {
      billId: 'b-1',
      supplierBillNumber: 'MR-1',
      documentTypeCode: '380',
    })
    const debitNote = named('PAYMENT_RUN_BILL_SETTLED', {
      billId: 'b-dn-7',
      supplierBillNumber: 'DN-7',
      documentTypeCode: '383',
    })
    const untyped = named('PAYMENT_RUN_BILL_SETTLED', { billId: 'b-1', supplierBillNumber: 'MR-1' })
    await i18n.changeLanguage('en')
    for (const action of ['add', 'markPaid', undefined] as const) {
      expect(refusalOf(bill, i18n.t, action)).toBe(
        'MR-1 is already paid in full. Take it out of the run.',
      )
      expect(refusalOf(debitNote, i18n.t, action)).toBe(
        'DN-7 is already paid in full. Take it out of the run.',
      )
    }
    await i18n.changeLanguage('ar')
    expect(refusalOf(bill, i18n.t, 'markPaid')).toBe(
      'MR-1 مدفوعة بالكامل بالفعل. أخرجها من الدفعة.',
    )
    expect(refusalOf(debitNote, i18n.t, 'markPaid')).toBe(
      'DN-7 مدفوع بالكامل بالفعل. أخرجه من الدفعة.',
    )
    // A server that does not say the type yet reads as a bill.
    expect(refusalOf(untyped, i18n.t, 'add')).toBe('MR-1 مدفوعة بالكامل بالفعل. أخرجها من الدفعة.')
    await i18n.changeLanguage('en')
  })

  it('leaves the ways-out refusals the dialogs prevent on the generic refusal', async () => {
    await i18n.changeLanguage('en')
    for (const code of [
      'PAYMENT_RUN_TAKE_OUT_BILL_REQUIRED',
      'PAYMENT_RUN_TAKE_OUT_DUPLICATE',
      'PAYMENT_RUN_REASON_REQUIRED',
      'PAYMENT_RUN_REASON_TOO_LONG',
      'PAYMENT_RUN_TAKE_OUT_NOT_IN_RUN',
      'PAYMENT_RUN_TAKE_OUT_EVERYTHING',
    ]) {
      expect(refusalOf(refusal(code), i18n.t, 'markPaid'), code).toBe(i18n.t(REFUSAL_FALLBACK_KEY))
    }
  })

  it('gives a reversal in a sent run and a partly paid debit note their sentences, in both languages', () => {
    const reversal = describeApiFailure(
      refusal('BILL_PAYMENT_REVERSAL_IN_SENT_RUN', { paymentRunReference: 'PR-0012' }),
    )
    expect(MAPPED_REFUSAL_CODES).toContain('BILL_PAYMENT_REVERSAL_IN_SENT_RUN')
    expect(reversal.values).toEqual({ run: 'PR-0012' })
    expect(i18n.t(reversal.key, { ...reversal.values, lng: 'en' })).toBe(
      "This bill is in payment run PR-0012, whose bank file is already made. Use the run's Mark paid or Cancel instead.",
    )
    expect(i18n.t(reversal.key, { ...reversal.values, lng: 'ar' })).toBe(
      'هذه الفاتورة ضمن دفعة السداد PR-0012 وقد أُنشئ ملفها البنكي. استخدم تسجيل الدفعة كمدفوعة أو إلغاءها بدلًا من ذلك.',
    )
    const partly = describeApiFailure(refusal('DEBIT_NOTE_PARTLY_PAID'))
    expect(MAPPED_REFUSAL_CODES).toContain('DEBIT_NOTE_PARTLY_PAID')
    expect(i18n.t(partly.key, { lng: 'en' })).toBe(
      'This debit note is partly paid. Record a refund from the supplier for the paid part first.',
    )
    expect(i18n.t(partly.key, { lng: 'ar' })).toBe(
      'هذا الإشعار المدين مدفوع جزئيًا. سجّل أولًا استردادًا من المورّد للجزء المدفوع.',
    )
  })
})

// The handler answers its CONFLICT_CODES 409 `resource-conflict`, which the refusal map above
// never sees: a held credit note is named by its code alone.
describe('a 409 the Expenditure module answers by name', () => {
  const conflict = (code: string | null, problem?: Record<string, unknown>) =>
    new ApiError({ status: 409, problemType: 'resource-conflict', code, problem })

  it('gives a held credit note its own sentence, in both languages', async () => {
    const message = describeApiFailure(conflict('CREDIT_NOTE_HELD_AS_DUPLICATE'))
    expect(message.key).toBe('supplierCreditNotes.held.refused')
    await i18n.changeLanguage('en')
    expect(i18n.t(message.key)).toBe(
      "This credit note is held as a possible duplicate, so it can't be used yet. Check its bill first.",
    )
    await i18n.changeLanguage('ar')
    expect(i18n.t(message.key)).toBe(
      'هذا الإشعار الدائن محجوز لاحتمال كونه نسخة مكررة، لذا لا يمكن استخدامه حاليًا. يُرجى مراجعة فاتورته أولًا.',
    )
    await i18n.changeLanguage('en')
  })

  it('reads the code, never the English detail', () => {
    const worded = conflict(null, { detail: 'Credit note is held as a possible duplicate' })
    expect(refusalMessageKey(worded)).toBeNull()
    expect(describeApiFailure(worded).key).toBe('apiErrors.conflict')
  })

  it('leaves any other 409 to the conflict sentence', () => {
    expect(refusalMessageKey(conflict('SOME_OTHER_CONFLICT'))).toBeNull()
    expect(describeApiFailure(conflict('SOME_OTHER_CONFLICT')).key).toBe('apiErrors.conflict')
    // A code naming a prototype member is not a mapped code.
    expect(refusalMessageKey(conflict('constructor'))).toBeNull()
    expect(refusalMessageKey(conflict('toString'))).toBeNull()
    // The same code on another status is not this refusal.
    const notConflict = new ApiError({
      status: 400,
      problemType: 'validation-failed',
      code: 'CREDIT_NOTE_HELD_AS_DUPLICATE',
    })
    expect(refusalMessageKey(notConflict)).toBeNull()
  })
})
