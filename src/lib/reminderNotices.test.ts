import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import type { ReminderInboxItemDto } from '../api/expenditure/billReminders'
import { noteValues } from './notifications'
import { isAcknowledged, reasonOf, reminderNote, whenOf } from './reminderNotices'

/**
 * The sentence the bell writes for each kind of bill reminder, in both languages, from the fields
 * the inbox sends. The first groups are an entry that carries no supplier's name, which is worded
 * around the bill's number, the file's name or the recurring bill's name; the groups at the end
 * are the entry as the server sends it now, which names the supplier.
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
    expect(line.note.icon).toBe('bill')
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
    // A nudge on the day the bill arrived has waited no days yet: the owner's wording for it.
    expect(say({ ...approval, daysFromDue: 0 }).title).toBe(
      'Bill ME-991 has waited less than a day for approval',
    )
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
    expect(say({ ...scan, daysFromDue: 0 }).title).toBe('receipt-12.jpg still unconfirmed')
    expect(say({ ...scan, daysFromDue: 1 }).title).toBe('receipt-12.jpg unconfirmed for 1 day')
    const line = say({ ...scan, daysFromDue: 2 })
    expect(line.title).toBe('receipt-12.jpg unconfirmed for 2 days')
    // No supplier until it is confirmed: one sent with it would not change the line.
    expect(say({ ...scan, daysFromDue: 2, supplierName: 'Muscat Roastery' }).title).toBe(
      'receipt-12.jpg unconfirmed for 2 days',
    )
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

describe('the icon of a bill reminder', () => {
  it('is the one Bills icon for every kind, on the tile its kind is tinted', () => {
    const TONE = {
      BEFORE_DUE: 'brand',
      LATE: 'danger',
      DISCOUNT_EXPIRY: 'success',
      APPROVAL_STALE: 'brand',
      MISMATCH_STALE: 'neutral',
      SCAN_UNCONFIRMED: 'neutral',
      RECURRING_LATE: 'warning',
      RECURRING_CHASE: 'warning',
      RECURRING_OUT_OF_RANGE: 'warning',
    } as const
    for (const [reason, tone] of Object.entries(TONE)) {
      const ruleType = reason.startsWith('RECURRING') ? 'RECURRING_LATE' : reason
      const note = reminderNote(item({ reason, ruleType } as Partial<ReminderInboxItemDto>), NOW)
      expect(note.icon, reason).toBe('bill')
      expect(note.tone, reason).toBe(tone)
    }
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
    // "In N days" is «خلال», never «بعد» (the owner's decision of 2 Oct), here as in the line
    // that names the supplier.
    expect(say({ ...due, daysFromDue: -2 }).title).toBe('تستحق الفاتورة ME-991 خلال يومين')
    expect(say({ ...due, daysFromDue: -5 }).title).toBe('تستحق الفاتورة ME-991 خلال 5 أيام')
    expect(say({ ...due, daysFromDue: -7 }).title).toBe('تستحق الفاتورة ME-991 خلال 7 أيام')
    expect(say({ ...due, daysFromDue: -11 }).title).toBe('تستحق الفاتورة ME-991 خلال 11 يومًا')
    expect(say({ ...due, daysFromDue: -12 }).title).toBe('تستحق الفاتورة ME-991 خلال 12 يومًا')
    expect(say({ ...due, daysFromDue: -100 }).title).toBe('تستحق الفاتورة ME-991 خلال 100 يوم')

    expect(say({ daysFromDue: 0 }).title).toBe('الفاتورة ME-991 متأخرة')
    expect(say({ daysFromDue: 1 }).title).toBe('الفاتورة ME-991 متأخرة يومًا واحدًا')
    expect(say({ daysFromDue: 2 }).title).toBe('الفاتورة ME-991 متأخرة يومين')
    expect(say({ daysFromDue: 9 }).title).toBe('الفاتورة ME-991 متأخرة 9 أيام')

    const discount = { ruleType: 'DISCOUNT_EXPIRY', reason: 'DISCOUNT_EXPIRY' } as const
    expect(say({ ...discount, daysFromDue: 0 }).title).toBe('ينتهي خصم الفاتورة ME-991 اليوم')
    expect(say({ ...discount, daysFromDue: -1 }).title).toBe('ينتهي خصم الفاتورة ME-991 غدًا')
    expect(say({ ...discount, daysFromDue: -2 }).title).toBe('ينتهي خصم الفاتورة ME-991 خلال يومين')
    expect(say({ ...discount, daysFromDue: -3 }).title).toBe(
      'ينتهي خصم الفاتورة ME-991 خلال 3 أيام',
    )
    expect(say({ ...discount, daysFromDue: -5 }).title).toBe(
      'ينتهي خصم الفاتورة ME-991 خلال 5 أيام',
    )
    expect(say({ ...discount, daysFromDue: -12 }).title).toBe(
      'ينتهي خصم الفاتورة ME-991 خلال 12 يومًا',
    )
    expect(say({ ...discount, daysFromDue: -100 }).title).toBe(
      'ينتهي خصم الفاتورة ME-991 خلال 100 يوم',
    )

    const approval = { ruleType: 'APPROVAL_STALE', reason: 'APPROVAL_STALE' } as const
    expect(say({ ...approval, daysFromDue: 0 }).title).toBe(
      'الفاتورة ME-991 تنتظر الاعتماد منذ أقل من يوم',
    )
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
    expect(say({ ...scan, daysFromDue: 0 }).title).toBe('receipt-12.jpg لم يُؤكَّد بعد')
    expect(say({ ...scan, daysFromDue: 1 }).title).toBe('receipt-12.jpg لم يُؤكَّد منذ يوم واحد')
    expect(say({ ...scan, daysFromDue: 2 }).title).toBe('receipt-12.jpg لم يُؤكَّد منذ يومين')
    expect(say({ ...scan, daysFromDue: 7 }).title).toBe('receipt-12.jpg لم يُؤكَّد منذ 7 أيام')
    expect(say({ ...scan, daysFromDue: 11 }).title).toBe('receipt-12.jpg لم يُؤكَّد منذ 11 يومًا')
    expect(say({ ...scan, daysFromDue: 100 }).title).toBe('receipt-12.jpg لم يُؤكَّد منذ 100 يوم')
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
      'يُرجى متابعة المورّد بشأن إيجار المكتب',
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

  it('says "in N days" with «خلال» in every line that counts days to go, named by supplier or not', () => {
    for (const reason of ['BEFORE_DUE', 'DISCOUNT_EXPIRY'] as const) {
      for (const supplierName of [null, 'تمور النور']) {
        for (const days of [1, 2, 5, 12, 100]) {
          // No due date is sent: a due line then keeps the bill's own sentence even with a
          // supplier, and the discount line names the supplier and counts the days it carries.
          const title = say({ ruleType: reason, reason, supplierName, daysFromDue: -days }).title
          const where = `${reason} ${supplierName ?? 'no supplier'} ${days}`
          expect(title, where).not.toMatch(/بعد (يوم|\d)/)
          if (days === 1) expect(title, where).toContain('غدًا')
          else expect(title, where).toContain(days === 2 ? 'خلال يومين' : `خلال ${days} `)
        }
      }
    }
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

/**
 * The lines as the design words them: the supplier is named, and a late bill is "unpaid for N
 * days", N counted on the day it is read from the bill's due date. These need `supplierName` on
 * the inbox entry, and `dueDate` too for a bill that is due or late. An entry without them keeps
 * the sentences above.
 */
describe('a reminder that names its supplier, in English', () => {
  const alNoor = { supplierName: 'Al Noor Dates', dueDate: '2026-09-28' } as const

  it('says a late bill is unpaid for N days, counted today from its due date', () => {
    // Due 28 September, read on 1 October in Muscat: three days. The number stored when the
    // notice was recorded (here 1) is not what is shown.
    const line = say({ ...alNoor, daysFromDue: 1 })
    expect(line.title).toBe('Al Noor Dates unpaid for 3 days')
    expect(line.body).toBe('<b>OMR 411.500</b> still to pay.')
    expect(line.to).toBe('/expenditure/bills/b-1')
    expect(line.button).toBe('Open the bill')
    expect(line.note.tone).toBe('danger')
    // The server's own English sentence is not used once the supplier is known.
    expect(line.note.titleText).toBeUndefined()

    expect(say({ ...alNoor, dueDate: '2026-09-30' }).title).toBe('Al Noor Dates unpaid for 1 day')
    expect(say({ ...alNoor, dueDate: '2026-09-01' }).title).toBe('Al Noor Dates unpaid for 30 days')
  })

  it('counts on, so the same notice read later is still true', () => {
    const notice = item({ ...alNoor, daysFromDue: 1 })
    const title = (now: string) => {
      const note = reminderNote(notice, new Date(now))
      return i18n.t(note.titleKey, noteValues(note, 'en'))
    }
    expect(title('2026-09-29T09:00:00Z')).toBe('Al Noor Dates unpaid for 1 day')
    expect(title('2026-10-01T09:00:00Z')).toBe('Al Noor Dates unpaid for 3 days')
    expect(title('2026-10-12T09:00:00Z')).toBe('Al Noor Dates unpaid for 14 days')
    // The day turns in Muscat, not in UTC: 21:00 UTC on the 1st is already the 2nd there.
    expect(title('2026-10-01T21:00:00Z')).toBe('Al Noor Dates unpaid for 4 days')
  })

  it('says when a bill is due, from the same due date', () => {
    const sohar = {
      ruleType: 'BEFORE_DUE',
      reason: 'BEFORE_DUE',
      supplierName: 'Sohar Packaging',
      // Stored as seven days to go; what is shown is what is true on the day it is read.
      daysFromDue: -7,
    } as const
    expect(say({ ...sohar, dueDate: '2026-10-04' }).title).toBe('Sohar Packaging due in 3 days')
    expect(say({ ...sohar, dueDate: '2026-10-02' }).title).toBe('Sohar Packaging due tomorrow')
    expect(say({ ...sohar, dueDate: '2026-10-01' }).title).toBe('Sohar Packaging due today')
    // Read after the due date has passed, a bill that was "due soon" is unpaid.
    expect(say({ ...sohar, dueDate: '2026-09-29' }).title).toBe('Sohar Packaging unpaid for 2 days')
    // And a late notice whose bill was given a later due date is due, not unpaid.
    expect(say({ ...alNoor, dueDate: '2026-10-06' }).title).toBe('Al Noor Dates due in 5 days')
    expect(say({ ...sohar, dueDate: '2026-10-04' }).body).toBe('<b>OMR 411.500</b> still to pay.')
  })

  it('reads a due date sent with a time as its day', () => {
    expect(say({ ...alNoor, dueDate: '2026-09-28T00:00:00Z' }).title).toBe(
      'Al Noor Dates unpaid for 3 days',
    )
  })

  it('names the supplier for every other kind', () => {
    const named = { supplierName: 'Muscat Roastery' } as const

    const discount = { ...named, ruleType: 'DISCOUNT_EXPIRY', reason: 'DISCOUNT_EXPIRY' } as const
    expect(say({ ...discount, daysFromDue: 0 }).title).toBe(
      'Muscat Roastery discount runs out today',
    )
    expect(say({ ...discount, daysFromDue: -1 }).title).toBe(
      'Muscat Roastery discount expires tomorrow',
    )
    expect(say({ ...discount, daysFromDue: -3 }).title).toBe(
      'Muscat Roastery discount expires in 3 days',
    )

    const approval = { ...named, ruleType: 'APPROVAL_STALE', reason: 'APPROVAL_STALE' } as const
    expect(say({ ...approval, daysFromDue: 0 }).title).toBe(
      'Muscat Roastery approval waiting less than a day',
    )
    expect(say({ ...approval, daysFromDue: 1 }).title).toBe(
      'Muscat Roastery approval waiting 1 day',
    )
    expect(say({ ...approval, daysFromDue: 6 }).title).toBe(
      'Muscat Roastery approval waiting 6 days',
    )
    // The design's own second line for an approval.
    expect(say({ ...approval, daysFromDue: 6 }).body).toBe('<b>OMR 411.500</b> held up.')

    const mismatch = { ...named, ruleType: 'MISMATCH_STALE', reason: 'MISMATCH_STALE' } as const
    expect(say({ ...mismatch, daysFromDue: 0 }).title).toBe('Muscat Roastery mismatch unresolved')
    expect(say({ ...mismatch, daysFromDue: 1 }).title).toBe(
      'Muscat Roastery mismatch unresolved for 1 day',
    )
    expect(say({ ...mismatch, daysFromDue: 3 }).title).toBe(
      'Muscat Roastery mismatch unresolved for 3 days',
    )

    const recurring = {
      supplierName: 'Oman Electricity',
      ruleType: 'RECURRING_LATE',
      subjectType: 'RECURRING_BILL',
      subjectId: 'rb-1',
      recurringBillId: 'rb-1',
      billId: null,
      subjectDisplay: 'Electricity',
      amount: 650,
    } as const
    const late = { ...recurring, reason: 'RECURRING_LATE', occasion: 'LATE' } as const
    expect(say({ ...late, daysFromDue: 0 }).title).toBe('Oman Electricity bill not arrived')
    expect(say({ ...late, daysFromDue: 1 }).title).toBe(
      'Oman Electricity bill not arrived, 1 day late',
    )
    expect(say({ ...late, daysFromDue: 4 }).title).toBe(
      'Oman Electricity bill not arrived, 4 days late',
    )
    expect(say({ ...late, daysFromDue: 4 }).body).toBe('Usually <b>OMR 650.000</b>.')
    expect(say({ ...late, daysFromDue: 4 }).to).toBe('/expenditure/recurring-bills/rb-1')

    const chase = say({ ...recurring, reason: 'RECURRING_CHASE', occasion: 'CHASE' })
    expect(chase.title).toBe('Chase Oman Electricity for the bill that has not arrived')
    expect(chase.to).toBe('/expenditure/recurring-bills/rb-1')

    const range = say({
      ...recurring,
      reason: 'RECURRING_OUT_OF_RANGE',
      occasion: 'OUT_OF_RANGE',
      arrivedBillId: 'b-77',
      variancePercent: 16.67,
    })
    expect(range.title).toBe('Oman Electricity bill arrived outside the range')
    expect(range.body).toBe('<b>16.67%</b> above the usual amount.')
    expect(range.to).toBe('/expenditure/bills/b-77')
  })

  it('writes the discount line as the design does once the server sends its three facts', () => {
    const discount = {
      supplierName: 'Muscat Roastery',
      ruleType: 'DISCOUNT_EXPIRY',
      reason: 'DISCOUNT_EXPIRY',
      daysFromDue: -3,
      amount: 2354.5,
    } as const
    const facts = { discountPercent: 2, discountExpiresOn: '2026-10-05', discountSaving: 47.09 }

    // The design's sample: "2% discount expires 5 Aug" over "Saves 47.090".
    const line = say({ ...discount, ...facts })
    expect(line.title).toBe('Muscat Roastery 2% discount expires 5 Oct')
    expect(line.body).toBe('Saves <b>OMR 47.090</b>.')
    expect(line.to).toBe('/expenditure/bills/b-1')
    expect(line.note.tone).toBe('success')
    expect(say({ ...discount, ...facts, discountPercent: 2.5 }).title).toBe(
      'Muscat Roastery 2.5% discount expires 5 Oct',
    )
    // The date is the day it is read against, not the count stored with the notice.
    expect(say({ ...discount, ...facts, discountExpiresOn: '2026-10-01' }).title).toBe(
      'Muscat Roastery 2% discount runs out today',
    )
    expect(say({ ...discount, ...facts, discountExpiresOn: '2026-10-01' }).body).toBe(
      'Saves <b>OMR 47.090</b>.',
    )
    // Read after the date has gone: it says so, and nothing claims a saving still to be had.
    const gone = say({ ...discount, ...facts, discountExpiresOn: '2026-10-15' })
    expect(gone.title).toBe('Muscat Roastery 2% discount expires 15 Oct')
    const past = (() => {
      const note = reminderNote(item({ ...discount, ...facts }), new Date('2026-10-09T09:00:00Z'))
      const values = noteValues(note, 'en')
      return { title: i18n.t(note.titleKey, values), body: i18n.t(note.bodyKey!, values) }
    })()
    expect(past.title).toBe('Muscat Roastery 2% discount expired 5 Oct')
    expect(past.body).toBe('<b>OMR 2,354.500</b> still to pay.')
    // The saving is in the entry's own currency.
    expect(say({ ...discount, ...facts, currency: 'USD', discountSaving: 12.5 }).body).toBe(
      'Saves <b>USD 12.50</b>.',
    )
    // With no supplier to name, the same shape around the bill's number.
    expect(say({ ...discount, ...facts, supplierName: null }).title).toBe(
      '2% discount on bill ME-991 expires 5 Oct',
    )
    expect(
      say({ ...discount, ...facts, supplierName: null, discountExpiresOn: '2026-10-01' }).title,
    ).toBe('2% discount on bill ME-991 runs out today')
  })

  it('keeps the day-count discount line when the server does not send the facts', () => {
    const discount = {
      supplierName: 'Muscat Roastery',
      ruleType: 'DISCOUNT_EXPIRY',
      reason: 'DISCOUNT_EXPIRY',
      daysFromDue: -3,
    } as const
    const asToday = {
      title: 'Muscat Roastery discount expires in 3 days',
      body: '<b>OMR 411.500</b> still to pay.',
    }
    expect(say(discount)).toMatchObject(asToday)
    expect(
      say({ ...discount, discountPercent: null, discountExpiresOn: null, discountSaving: null }),
    ).toMatchObject(asToday)
    // The title needs the percentage and the date together; the line under it needs the saving.
    expect(say({ ...discount, discountPercent: 2 }).title).toBe(asToday.title)
    expect(say({ ...discount, discountExpiresOn: '2026-10-05' }).title).toBe(asToday.title)
    expect(say({ ...discount, discountPercent: 2, discountExpiresOn: 'soon' }).title).toBe(
      asToday.title,
    )
    expect(say({ ...discount, discountPercent: 0, discountExpiresOn: '2026-10-05' }).title).toBe(
      asToday.title,
    )
    expect(say({ ...discount, discountPercent: 2, discountExpiresOn: '2026-10-05' })).toMatchObject(
      { title: 'Muscat Roastery 2% discount expires 5 Oct', body: asToday.body },
    )
    expect(say({ ...discount, discountSaving: 0 }).body).toBe(asToday.body)
    expect(say({ ...discount, discountSaving: 47.09 })).toMatchObject({
      title: asToday.title,
      body: 'Saves <b>OMR 47.090</b>.',
    })
    // The facts belong to the discount notice alone.
    expect(
      say({
        supplierName: 'Al Noor Dates',
        dueDate: '2026-09-28',
        discountPercent: 2,
        discountExpiresOn: '2026-10-05',
        discountSaving: 47.09,
      }),
    ).toMatchObject({ title: 'Al Noor Dates unpaid for 3 days', body: asToday.body })
  })

  it('never prints a zero for a discount on its last day or an approval not a day old', () => {
    for (const language of ['en', 'ar']) {
      for (const supplierName of ['Muscat Roastery', null]) {
        for (const reason of ['DISCOUNT_EXPIRY', 'APPROVAL_STALE'] as const) {
          const note = reminderNote(
            item({ ruleType: reason, reason, supplierName, daysFromDue: 0 }),
            NOW,
          )
          const title = i18n.t(note.titleKey, { ...noteValues(note, language), lng: language })
          expect(title, `${language} ${reason} ${supplierName}`).not.toMatch(/\b0\b|٠/)
          expect(title).toMatch(
            reason === 'DISCOUNT_EXPIRY'
              ? /runs out today|ينتهي .*اليوم|ينتهي اليوم/
              : /less than a day|منذ أقل من يوم/,
          )
        }
      }
    }
  })

  it('does not need the bill number once the supplier is named', () => {
    // A row recorded before the server kept the number: the supplier still names it.
    expect(say({ ...alNoor, subjectDisplay: null }).title).toBe('Al Noor Dates unpaid for 3 days')
  })

  it('keeps the earlier sentence when the supplier or the due date is not sent', () => {
    expect(say({ daysFromDue: 9 }).title).toBe('Bill ME-991 is 9 days late')
    expect(say({ supplierName: '  ', dueDate: '2026-09-28', daysFromDue: 9 }).title).toBe(
      'Bill ME-991 is 9 days late',
    )
    // A late or due line cannot count without the date.
    expect(say({ supplierName: 'Al Noor Dates', dueDate: null, daysFromDue: 9 }).title).toBe(
      'Bill ME-991 is 9 days late',
    )
    expect(say({ supplierName: 'Al Noor Dates', dueDate: 'soon', daysFromDue: 9 }).title).toBe(
      'Bill ME-991 is 9 days late',
    )
    expect(
      say({
        ruleType: 'BEFORE_DUE',
        reason: 'BEFORE_DUE',
        supplierName: 'Al Noor Dates',
        daysFromDue: -2,
      }).title,
    ).toBe('Bill ME-991 is due in 2 days')
  })
})

describe('a reminder that names its supplier, in Arabic', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar')
  })

  const late = (dueDate: string) => say({ supplierName: 'تمور النور', dueDate }).title
  const due = (dueDate: string) =>
    say({ ruleType: 'BEFORE_DUE', reason: 'BEFORE_DUE', supplierName: 'تمور النور', dueDate }).title
  const counted = (reason: 'DISCOUNT_EXPIRY' | 'APPROVAL_STALE' | 'MISMATCH_STALE', days: number) =>
    say({
      ruleType: reason,
      reason,
      supplierName: 'تمور النور',
      daysFromDue: reason === 'DISCOUNT_EXPIRY' ? -days : days,
    }).title

  // The owner's decision of 2 Oct: the line opens with «فاتورة», as «فاتورة {{supplier}} لم تصل»
  // does. Without it «تمور النور غير مدفوعة» reads as the supplier being unpaid, not its bill.
  it("says a late bill is the supplier's bill, with each Arabic plural form", () => {
    expect(late('2026-09-30')).toBe('فاتورة تمور النور غير مدفوعة منذ يوم واحد')
    expect(late('2026-09-29')).toBe('فاتورة تمور النور غير مدفوعة منذ يومين')
    expect(late('2026-09-28')).toBe('فاتورة تمور النور غير مدفوعة منذ 3 أيام')
    expect(late('2026-09-26')).toBe('فاتورة تمور النور غير مدفوعة منذ 5 أيام')
    expect(late('2026-09-21')).toBe('فاتورة تمور النور غير مدفوعة منذ 10 أيام')
    expect(late('2026-09-20')).toBe('فاتورة تمور النور غير مدفوعة منذ 11 يومًا')
    expect(late('2026-09-19')).toBe('فاتورة تمور النور غير مدفوعة منذ 12 يومًا')
    expect(late('2026-06-23')).toBe('فاتورة تمور النور غير مدفوعة منذ 100 يوم')
  })

  it("says a bill that is due is the supplier's bill, with each Arabic plural form", () => {
    expect(due('2026-10-01')).toBe('فاتورة تمور النور تستحق اليوم')
    expect(due('2026-10-02')).toBe('فاتورة تمور النور تستحق غدًا')
    expect(due('2026-10-03')).toBe('فاتورة تمور النور تستحق خلال يومين')
    expect(due('2026-10-06')).toBe('فاتورة تمور النور تستحق خلال 5 أيام')
    expect(due('2026-10-08')).toBe('فاتورة تمور النور تستحق خلال 7 أيام')
    expect(due('2026-10-12')).toBe('فاتورة تمور النور تستحق خلال 11 يومًا')
    expect(due('2026-10-13')).toBe('فاتورة تمور النور تستحق خلال 12 يومًا')
    expect(due('2027-01-09')).toBe('فاتورة تمور النور تستحق خلال 100 يوم')
  })

  it('never opens a due or late line with the supplier, at any count', () => {
    for (const days of [1, 2, 5, 12, 100]) {
      const day = (offset: number) =>
        new Date(Date.UTC(2026, 9, 1 + offset)).toISOString().slice(0, 10)
      expect(late(day(-days)), `late ${days}`).toMatch(/^فاتورة تمور النور غير مدفوعة منذ /)
      expect(due(day(days)), `due ${days}`).toMatch(/^فاتورة تمور النور تستحق /)
    }
    expect(due('2026-10-01')).toMatch(/^فاتورة تمور النور تستحق /)
  })

  it('says the discount, the approval and the mismatch with each plural form', () => {
    expect(counted('DISCOUNT_EXPIRY', 0)).toBe('خصم تمور النور ينتهي اليوم')
    expect(counted('DISCOUNT_EXPIRY', 1)).toBe('خصم تمور النور ينتهي غدًا')
    expect(counted('DISCOUNT_EXPIRY', 2)).toBe('خصم تمور النور ينتهي خلال يومين')
    expect(counted('DISCOUNT_EXPIRY', 3)).toBe('خصم تمور النور ينتهي خلال 3 أيام')
    expect(counted('DISCOUNT_EXPIRY', 11)).toBe('خصم تمور النور ينتهي خلال 11 يومًا')
    expect(counted('DISCOUNT_EXPIRY', 100)).toBe('خصم تمور النور ينتهي خلال 100 يوم')

    expect(counted('APPROVAL_STALE', 0)).toBe('اعتماد تمور النور ينتظر منذ أقل من يوم')
    expect(counted('APPROVAL_STALE', 1)).toBe('اعتماد تمور النور ينتظر يومًا واحدًا')
    expect(counted('APPROVAL_STALE', 2)).toBe('اعتماد تمور النور ينتظر يومين')
    expect(counted('APPROVAL_STALE', 6)).toBe('اعتماد تمور النور ينتظر 6 أيام')
    expect(counted('APPROVAL_STALE', 11)).toBe('اعتماد تمور النور ينتظر 11 يومًا')
    expect(counted('APPROVAL_STALE', 100)).toBe('اعتماد تمور النور ينتظر 100 يوم')
    expect(
      say({
        ruleType: 'APPROVAL_STALE',
        reason: 'APPROVAL_STALE',
        supplierName: 'تمور النور',
        daysFromDue: 6,
      }).body,
    ).toMatch(/^<b>OMR .+<\/b> بانتظار الاعتماد\.$/)

    expect(counted('MISMATCH_STALE', 0)).toBe('اختلاف تمور النور لم يُحلّ')
    expect(counted('MISMATCH_STALE', 1)).toBe('اختلاف تمور النور لم يُحلّ منذ يوم واحد')
    expect(counted('MISMATCH_STALE', 2)).toBe('اختلاف تمور النور لم يُحلّ منذ يومين')
    expect(counted('MISMATCH_STALE', 3)).toBe('اختلاف تمور النور لم يُحلّ منذ 3 أيام')
    expect(counted('MISMATCH_STALE', 11)).toBe('اختلاف تمور النور لم يُحلّ منذ 11 يومًا')
    expect(counted('MISMATCH_STALE', 100)).toBe('اختلاف تمور النور لم يُحلّ منذ 100 يوم')
  })

  it('writes the discount line with its percentage, its date and the saving', () => {
    const discount = {
      supplierName: 'تمور النور',
      ruleType: 'DISCOUNT_EXPIRY',
      reason: 'DISCOUNT_EXPIRY',
      daysFromDue: -3,
      discountPercent: 2,
      discountExpiresOn: '2026-10-05',
      discountSaving: 47.09,
    } as const
    // Digits stay Latin in Arabic, as everywhere in the app.
    expect(say(discount).title).toBe('خصم 2٪ من تمور النور ينتهي 5 أكتوبر')
    expect(say(discount).body).toBe('يوفّر <b>OMR 47.090</b>.')
    expect(say({ ...discount, discountExpiresOn: '2026-10-01' }).title).toBe(
      'خصم 2٪ من تمور النور ينتهي اليوم',
    )
    expect(say({ ...discount, discountExpiresOn: '2026-09-28' }).title).toBe(
      'خصم 2٪ من تمور النور انتهى 28 سبتمبر',
    )
    expect(say({ ...discount, supplierName: null }).title).toBe(
      'خصم 2٪ على الفاتورة ME-991 ينتهي 5 أكتوبر',
    )
    expect(say({ ...discount, supplierName: null, discountExpiresOn: '2026-10-01' }).title).toBe(
      'خصم 2٪ على الفاتورة ME-991 ينتهي اليوم',
    )
    expect(say({ ...discount, supplierName: null, discountExpiresOn: '2026-09-28' }).title).toBe(
      'خصم 2٪ على الفاتورة ME-991 انتهى 28 سبتمبر',
    )
    for (const on of ['2026-09-28', '2026-10-01', '2026-10-05']) {
      const line = say({ ...discount, discountExpiresOn: on })
      expect(line.title, on).not.toMatch(/notes\.|[A-Za-z]{3,}/)
      expect(line.body, on).not.toMatch(/notes\./)
    }
  })

  it('says the three recurring notices', () => {
    const recurring = {
      ruleType: 'RECURRING_LATE',
      subjectType: 'RECURRING_BILL',
      subjectId: 'rb-1',
      supplierName: 'كهرباء عُمان',
      subjectDisplay: 'الكهرباء',
      amount: 650,
    } as const
    const arriving = (days: number) =>
      say({ ...recurring, reason: 'RECURRING_LATE', daysFromDue: days }).title
    expect(arriving(0)).toBe('فاتورة كهرباء عُمان لم تصل')
    expect(arriving(1)).toBe('فاتورة كهرباء عُمان لم تصل، متأخرة يومًا')
    expect(arriving(2)).toBe('فاتورة كهرباء عُمان لم تصل، متأخرة يومين')
    expect(arriving(4)).toBe('فاتورة كهرباء عُمان لم تصل، متأخرة 4 أيام')
    expect(arriving(11)).toBe('فاتورة كهرباء عُمان لم تصل، متأخرة 11 يومًا')
    expect(arriving(100)).toBe('فاتورة كهرباء عُمان لم تصل، متأخرة 100 يوم')
    expect(say({ ...recurring, reason: 'RECURRING_CHASE' }).title).toBe(
      'تابع كهرباء عُمان بشأن الفاتورة التي لم تصل',
    )
    expect(say({ ...recurring, reason: 'RECURRING_OUT_OF_RANGE' }).title).toBe(
      'فاتورة كهرباء عُمان وصلت خارج النطاق',
    )
  })

  it('leaves no key and no English showing for any kind or any count', () => {
    const reasons = [
      'BEFORE_DUE',
      'LATE',
      'DISCOUNT_EXPIRY',
      'APPROVAL_STALE',
      'MISMATCH_STALE',
      'RECURRING_LATE',
      'RECURRING_CHASE',
      'RECURRING_OUT_OF_RANGE',
    ] as const
    for (const reason of reasons) {
      for (const days of [0, 1, 2, 3, 11, 100]) {
        for (const dueDate of ['2026-09-20', '2026-10-01', '2026-10-02', '2026-10-20']) {
          const line = say({
            reason,
            ruleType: (reason.startsWith('RECURRING')
              ? 'RECURRING_LATE'
              : reason) as ReminderInboxItemDto['ruleType'],
            supplierName: 'تمور النور',
            dueDate,
            daysFromDue: reason === 'BEFORE_DUE' || reason === 'DISCOUNT_EXPIRY' ? -days : days,
          })
          expect(line.title, `${reason} ${days} ${dueDate}`).not.toMatch(/notes\.|[A-Za-z]{3,}/)
          expect(line.title).toContain('تمور النور')
        }
      }
    }
  })
})
