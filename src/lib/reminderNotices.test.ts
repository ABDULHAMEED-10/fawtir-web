import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import type { ReminderInboxItemDto } from '../api/expenditure/billReminders'
import { noteValues } from './notifications'
import { isAcknowledged, reasonOf, reminderNote, whenOf } from './reminderNotices'

/**
 * The sentence the bell writes for each kind of bill reminder, in both languages, from the fields
 * the inbox sends. Every sentence here is a draft pending the owner's approval of the wording.
 */

const NOW = new Date('2026-10-01T09:00:00Z') // 13:00 in Muscat

function item(over: Partial<ReminderInboxItemDto> = {}): ReminderInboxItemDto {
  return {
    id: 'n-1',
    ruleType: 'LATE',
    subjectType: 'BILL',
    subjectId: 'b-1',
    billId: 'b-1',
    daysFromDue: 3,
    firedOn: '2026-10-01',
    headline: 'ME-991 is 3 day(s) overdue',
    outcome: 'SENT',
    createdAt: '2026-10-01T04:00:00Z',
    acknowledgedAt: null,
    reason: 'LATE',
    occasion: null,
    occasionDate: null,
    subjectDisplay: 'ME-991',
    amount: 411.5,
    currency: 'OMR',
    recurringBillId: null,
    intakeId: null,
    arrivedBillId: null,
    variancePercent: null,
    read: false,
    ...over,
  }
}

/** The line as the panel words it: its title, and its body with the bold run's tags left in. */
function say(over: Partial<ReminderInboxItemDto>) {
  const note = reminderNote(item(over), NOW)
  const values = noteValues(note, i18n.language)
  return {
    title: note.titleText ?? i18n.t(note.titleKey, values),
    body: note.bodyKey ? i18n.t(note.bodyKey, values) : null,
    to: note.actions[0]?.to ?? null,
    button: note.actions[0] ? i18n.t(note.actions[0].labelKey) : null,
    note,
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('a bill reminder as a line of the bell, in English', () => {
  it('says when a bill is due: today, tomorrow, in N days', () => {
    const due = { ruleType: 'BEFORE_DUE', reason: 'BEFORE_DUE' } as const
    // Sent zero or negative: the days still to go.
    expect(say({ ...due, daysFromDue: 0 }).title).toBe('Bill ME-991 is due today')
    expect(say({ ...due, daysFromDue: -1 }).title).toBe('Bill ME-991 is due tomorrow')
    expect(say({ ...due, daysFromDue: -7 }).title).toBe('Bill ME-991 is due in 7 days')
    const line = say({ ...due, daysFromDue: -2 })
    expect(line.body).toBe('<b>OMR 411.500</b> still to pay.')
    expect(line.to).toBe('/expenditure/bills/b-1')
    expect(line.button).toBe('Open the bill')
    expect(line.note.icon).toBe('due')
    expect(line.note.tone).toBe('brand')
  })

  it('says how late a bill is', () => {
    expect(say({ daysFromDue: 0 }).title).toBe('Bill ME-991 is late')
    expect(say({ daysFromDue: 1 }).title).toBe('Bill ME-991 is 1 day late')
    expect(say({ daysFromDue: 9 }).title).toBe('Bill ME-991 is 9 days late')
    expect(say({ daysFromDue: 9 }).body).toBe('<b>OMR 411.500</b> still to pay.')
    expect(say({}).note.tone).toBe('danger')
  })

  it('says when an early-payment discount runs out', () => {
    const discount = { ruleType: 'DISCOUNT_EXPIRY', reason: 'DISCOUNT_EXPIRY' } as const
    expect(say({ ...discount, daysFromDue: 0 }).title).toBe(
      'The discount on bill ME-991 runs out today',
    )
    expect(say({ ...discount, daysFromDue: -1 }).title).toBe(
      'The discount on bill ME-991 runs out tomorrow',
    )
    expect(say({ ...discount, daysFromDue: -3 }).title).toBe(
      'The discount on bill ME-991 runs out in 3 days',
    )
    expect(say(discount).note.tone).toBe('success')
  })

  it('says how long an approval has waited, and never "0 days"', () => {
    const approval = { ruleType: 'APPROVAL_STALE', reason: 'APPROVAL_STALE' } as const
    // A nudge on the day the bill arrived has waited no days yet.
    expect(say({ ...approval, daysFromDue: 0 }).title).toBe('Bill ME-991 is waiting for approval')
    expect(say({ ...approval, daysFromDue: 1 }).title).toBe(
      'Bill ME-991 has waited 1 day for approval',
    )
    expect(say({ ...approval, daysFromDue: 5 }).title).toBe(
      'Bill ME-991 has waited 5 days for approval',
    )
    expect(say({ ...approval, daysFromDue: 5 }).to).toBe('/expenditure/bills/b-1')
  })

  it('says how long a mismatch has waited', () => {
    const mismatch = { ruleType: 'MISMATCH_STALE', reason: 'MISMATCH_STALE' } as const
    expect(say({ ...mismatch, daysFromDue: 0 }).title).toBe(
      'Bill ME-991 has a mismatch nobody has resolved',
    )
    expect(say({ ...mismatch, daysFromDue: 1 }).title).toBe(
      'The mismatch on bill ME-991 has waited 1 day',
    )
    expect(say({ ...mismatch, daysFromDue: 3 }).title).toBe(
      'The mismatch on bill ME-991 has waited 3 days',
    )
    expect(say(mismatch).note.tone).toBe('neutral')
  })

  it('names a scanned receipt by its file, with no amount, and opens it to be checked', () => {
    const scan = {
      ruleType: 'SCAN_UNCONFIRMED',
      reason: 'SCAN_UNCONFIRMED',
      subjectType: 'INTAKE',
      subjectId: 'in-7',
      intakeId: 'in-7',
      billId: null,
      subjectDisplay: 'receipt-12.jpg',
      amount: null,
      currency: null,
    } as const
    expect(say({ ...scan, daysFromDue: 0 }).title).toBe('receipt-12.jpg is waiting to be confirmed')
    expect(say({ ...scan, daysFromDue: 1 }).title).toBe(
      'receipt-12.jpg has waited 1 day to be confirmed',
    )
    const line = say({ ...scan, daysFromDue: 2 })
    expect(line.title).toBe('receipt-12.jpg has waited 2 days to be confirmed')
    // No amount to give: the line says which reminder it is, in words the page already has.
    expect(line.body).toBe('A scanned receipt still unconfirmed')
    expect(line.to).toBe('/expenditure/bills/upload/in-7')
    expect(line.button).toBe('Check and save')
  })

  const recurring = {
    ruleType: 'RECURRING_LATE',
    subjectType: 'RECURRING_BILL',
    subjectId: 'rb-1',
    recurringBillId: 'rb-1',
    billId: null,
    subjectDisplay: 'Office rent',
    amount: 650,
    currency: 'OMR',
  } as const

  it('tells the three recurring notices apart, though all three are one rule type', () => {
    const late = { ...recurring, reason: 'RECURRING_LATE', occasion: 'LATE' } as const
    expect(say({ ...late, daysFromDue: 0 }).title).toBe('Office rent has not arrived')
    expect(say({ ...late, daysFromDue: 1 }).title).toBe('Office rent is 1 day late arriving')
    const line = say({ ...late, daysFromDue: 4 })
    expect(line.title).toBe('Office rent is 4 days late arriving')
    expect(line.body).toBe('Usually <b>OMR 650.000</b>.')
    expect(line.to).toBe('/expenditure/recurring-bills/rb-1')
    expect(line.button).toBe('Open it')
    expect(line.note.tone).toBe('warning')

    const chase = say({
      ...recurring,
      reason: 'RECURRING_CHASE',
      occasion: 'CHASE',
      daysFromDue: 4,
    })
    expect(chase.title).toBe('Please chase the supplier for Office rent')
    expect(chase.body).toBe('Usually <b>OMR 650.000</b>.')
    expect(chase.to).toBe('/expenditure/recurring-bills/rb-1')

    const above = say({
      ...recurring,
      reason: 'RECURRING_OUT_OF_RANGE',
      occasion: 'OUT_OF_RANGE',
      daysFromDue: 0,
      arrivedBillId: 'b-77',
      variancePercent: 16.67,
    })
    expect(above.title).toBe('Office rent arrived outside its usual range')
    expect(above.body).toBe('<b>16.67%</b> above the usual amount.')
    // The bill that arrived is the thing to look at.
    expect(above.to).toBe('/expenditure/bills/b-77')
    expect(above.button).toBe('Open the bill')

    const below = say({
      ...recurring,
      reason: 'RECURRING_OUT_OF_RANGE',
      occasion: 'OUT_OF_RANGE',
      arrivedBillId: null,
      variancePercent: -8,
    })
    expect(below.body).toBe('<b>8%</b> below the usual amount.')
    // The bill can no longer be found: the instruction itself.
    expect(below.to).toBe('/expenditure/recurring-bills/rb-1')
  })

  it('never calls an out-of-range notice "a recurring bill that has not arrived"', () => {
    const bare = say({
      ...recurring,
      reason: 'RECURRING_OUT_OF_RANGE',
      amount: null,
      currency: null,
      variancePercent: null,
    })
    expect(bare.title).toBe('Office rent arrived outside its usual range')
    expect(bare.body).toBeNull()
    expect(
      say({ ...recurring, reason: 'RECURRING_OUT_OF_RANGE', variancePercent: null }).body,
    ).toBe('Usually <b>OMR 650.000</b>.')
    // A late or chase notice with no usual amount on file says which reminder it is.
    expect(say({ ...recurring, reason: 'RECURRING_LATE', amount: null }).body).toBe(
      "A recurring bill that hasn't arrived",
    )
  })

  it('writes another currency as its code, and a bill with no amount as its reminder', () => {
    expect(say({ amount: 120, currency: 'USD' }).body).toBe('<b>USD 120.00</b> still to pay.')
    expect(say({ amount: null, currency: null }).body).toBe('Once a bill is late')
  })
})

describe('a notice from before the server kept the name, or from a server before these fields', () => {
  const OLD: ReminderInboxItemDto = {
    id: 'n-old',
    ruleType: 'RECURRING_LATE',
    subjectType: 'RECURRING_BILL',
    subjectId: 'rb-1',
    billId: null,
    daysFromDue: 2,
    firedOn: '2026-09-20',
    headline: 'Recurring bill Office rent has not arrived',
    outcome: 'SENT',
    createdAt: '2026-09-20T04:00:00Z',
    acknowledgedAt: '2026-09-21T04:00:00Z',
  }

  it('shows the sentence the server wrote, which is the only thing that names the bill', () => {
    const note = reminderNote(OLD, NOW)
    expect(note.titleText).toBe('Recurring bill Office rent has not arrived')
    // What kind of reminder it is, in the reader's language.
    expect(i18n.t(note.bodyKey!)).toBe("A recurring bill that hasn't arrived")
    // The link ids are missing too: the subject's own id leads to the same place.
    expect(note.actions[0].to).toBe('/expenditure/recurring-bills/rb-1')
    expect(note.unread).toBe(false)
    expect(reasonOf(OLD)).toBe('RECURRING_LATE')
    expect(isAcknowledged(OLD)).toBe(true)
    expect(isAcknowledged({ ...OLD, acknowledgedAt: null })).toBe(false)
  })

  it('treats a new row with no name the same way, and a reason it does not know as its rule', () => {
    const note = reminderNote(
      item({ subjectDisplay: null, headline: 'A bill is 3 day(s) overdue' }),
      NOW,
    )
    expect(note.titleText).toBe('A bill is 3 day(s) overdue')
    expect(note.actions[0].to).toBe('/expenditure/bills/b-1')
    expect(reasonOf(item({ reason: 'SOMETHING_NEW' as never }))).toBe('LATE')
    // A blank name is no name.
    expect(reminderNote(item({ subjectDisplay: '  ' }), NOW).titleText).toBe(
      'ME-991 is 3 day(s) overdue',
    )
  })

  it('has no button for a subject it has no page for', () => {
    expect(
      reminderNote(item({ subjectType: 'PURCHASE_ORDER', billId: null }), NOW).actions,
    ).toEqual([])
  })
})

describe('when a notice arrived', () => {
  it('reads the day in Muscat: today, yesterday, or the date', () => {
    // 13:00 in Muscat on 1 October.
    expect(whenOf('2026-10-01T04:00:00Z', NOW)).toEqual({ when: { at: '08:00' }, group: 'today' })
    // 21:30 UTC on 30 September is already 01:30 on 1 October in Muscat.
    expect(whenOf('2026-09-30T21:30:00Z', NOW)).toEqual({ when: { at: '01:30' }, group: 'today' })
    expect(whenOf('2026-09-30T04:00:00Z', NOW)).toEqual({
      when: { yesterday: '08:00' },
      group: 'earlier',
    })
    const older = whenOf('2026-09-02T04:12:00Z', NOW)
    expect(older.group).toBe('earlier')
    expect(older.when).toEqual({ on: new Date(2026, 8, 2), at: '08:12' })
    expect(whenOf('not a date', NOW)).toEqual({ when: { at: '' }, group: 'earlier' })
  })
})

describe('the same lines in Arabic', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar')
  })

  it('says each kind of reminder in Arabic, with the Arabic plural', () => {
    const due = { ruleType: 'BEFORE_DUE', reason: 'BEFORE_DUE' } as const
    expect(say({ ...due, daysFromDue: 0 }).title).toBe('تستحق الفاتورة ME-991 اليوم')
    expect(say({ ...due, daysFromDue: -1 }).title).toBe('تستحق الفاتورة ME-991 غدًا')
    expect(say({ ...due, daysFromDue: -2 }).title).toBe('تستحق الفاتورة ME-991 بعد يومين')
    expect(say({ ...due, daysFromDue: -7 }).title).toBe('تستحق الفاتورة ME-991 بعد 7 أيام')
    expect(say({ ...due, daysFromDue: -11 }).title).toBe('تستحق الفاتورة ME-991 بعد 11 يومًا')
    expect(say({ ...due, daysFromDue: -100 }).title).toBe('تستحق الفاتورة ME-991 بعد 100 يوم')

    expect(say({ daysFromDue: 0 }).title).toBe('الفاتورة ME-991 متأخرة')
    expect(say({ daysFromDue: 1 }).title).toBe('الفاتورة ME-991 متأخرة يومًا واحدًا')
    expect(say({ daysFromDue: 2 }).title).toBe('الفاتورة ME-991 متأخرة يومين')
    expect(say({ daysFromDue: 9 }).title).toBe('الفاتورة ME-991 متأخرة 9 أيام')

    const discount = { ruleType: 'DISCOUNT_EXPIRY', reason: 'DISCOUNT_EXPIRY' } as const
    expect(say({ ...discount, daysFromDue: 0 }).title).toBe('ينتهي خصم الفاتورة ME-991 اليوم')
    expect(say({ ...discount, daysFromDue: -3 }).title).toBe('ينتهي خصم الفاتورة ME-991 بعد 3 أيام')

    const approval = { ruleType: 'APPROVAL_STALE', reason: 'APPROVAL_STALE' } as const
    expect(say({ ...approval, daysFromDue: 0 }).title).toBe('الفاتورة ME-991 بانتظار الاعتماد')
    expect(say({ ...approval, daysFromDue: 2 }).title).toBe(
      'الفاتورة ME-991 بانتظار الاعتماد منذ يومين',
    )

    const mismatch = { ruleType: 'MISMATCH_STALE', reason: 'MISMATCH_STALE' } as const
    expect(say({ ...mismatch, daysFromDue: 0 }).title).toBe(
      'في الفاتورة ME-991 اختلاف لم يحلّه أحد',
    )
    expect(say({ ...mismatch, daysFromDue: 3 }).title).toBe(
      'اختلاف الفاتورة ME-991 لم يُحلّ منذ 3 أيام',
    )

    const scan = {
      ruleType: 'SCAN_UNCONFIRMED',
      reason: 'SCAN_UNCONFIRMED',
      subjectType: 'INTAKE',
      subjectDisplay: 'receipt-12.jpg',
      amount: null,
    } as const
    expect(say({ ...scan, daysFromDue: 0 }).title).toBe('receipt-12.jpg بانتظار التأكيد')
    expect(say({ ...scan, daysFromDue: 1 }).title).toBe(
      'receipt-12.jpg بانتظار التأكيد منذ يوم واحد',
    )
    expect(say({ ...scan, daysFromDue: 1 }).body).toBe('إيصال ممسوح لم يُؤكَّد بعد')

    const recurring = {
      ruleType: 'RECURRING_LATE',
      subjectType: 'RECURRING_BILL',
      subjectId: 'rb-1',
      subjectDisplay: 'إيجار المكتب',
      amount: 650,
    } as const
    expect(say({ ...recurring, reason: 'RECURRING_LATE', daysFromDue: 0 }).title).toBe(
      'لم تصل إيجار المكتب بعد',
    )
    expect(say({ ...recurring, reason: 'RECURRING_LATE', daysFromDue: 4 }).title).toBe(
      'تأخر وصول إيجار المكتب 4 أيام',
    )
    expect(say({ ...recurring, reason: 'RECURRING_CHASE' }).title).toBe(
      'يُرجى متابعة المورد بشأن إيجار المكتب',
    )
    expect(say({ ...recurring, reason: 'RECURRING_OUT_OF_RANGE' }).title).toBe(
      'وصلت إيجار المكتب خارج نطاقها المعتاد',
    )
    expect(
      say({ ...recurring, reason: 'RECURRING_OUT_OF_RANGE', variancePercent: 16.67 }).body,
    ).toBe('أعلى من المبلغ المعتاد بنسبة <b>16.67٪</b>.')
    expect(say({ ...recurring, reason: 'RECURRING_OUT_OF_RANGE', variancePercent: -8 }).body).toBe(
      'أقل من المبلغ المعتاد بنسبة <b>8٪</b>.',
    )
  })

  it('writes the amount and the button in Arabic', () => {
    const line = say({ daysFromDue: 9 })
    expect(line.body).toMatch(/^<b>OMR .+<\/b> لم تُسدَّد بعد\.$/)
    expect(line.button).toBe('افتح الفاتورة')
    expect(
      say({ ruleType: 'RECURRING_LATE', reason: 'RECURRING_LATE', subjectType: 'RECURRING_BILL' })
        .body,
    ).toMatch(/^المبلغ المعتاد <b>OMR .+<\/b>\.$/)
  })

  it('leaves no key showing for any reason, counted or not', () => {
    const reasons = [
      'BEFORE_DUE',
      'LATE',
      'DISCOUNT_EXPIRY',
      'APPROVAL_STALE',
      'MISMATCH_STALE',
      'SCAN_UNCONFIRMED',
      'RECURRING_LATE',
      'RECURRING_CHASE',
      'RECURRING_OUT_OF_RANGE',
    ] as const
    for (const language of ['en', 'ar']) {
      for (const reason of reasons) {
        for (const daysFromDue of [0, 1, 2, 5, 11, 100]) {
          const note = reminderNote(item({ reason, daysFromDue }), NOW)
          const title = i18n.t(note.titleKey, { ...noteValues(note, language), lng: language })
          expect(title, `${language} ${reason} ${daysFromDue}`).not.toContain('notes.reminder')
          expect(title, `${language} ${reason} ${daysFromDue}`).not.toContain('{{')
          expect(title).not.toContain('—')
          expect(title).toContain('ME-991')
        }
      }
    }
  })
})
