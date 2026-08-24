/**
 * The reminder schedule attached to one invoice (Figma 86:30049, "Reminder").
 *
 * Three reminders follow the invoice out of the door on a fixed cadence. The banner on the
 * invoice shows which one is next and lets the user push it early or hold the whole sequence.
 * The anchor step is the invoice itself, which is why the stepper has four nodes for three
 * reminders.
 */

export type ReminderStepId = 'friendly' | 'followUp' | 'finalNotice'

/** Where a step sits relative to what has already gone out. */
export type ReminderStepState = 'sent' | 'next' | 'upcoming'

export type ReminderStep = {
  id: ReminderStepId
  labelKey: string
  /** Already formatted for display — the server sends the resolved local date. */
  when: string
}

export type InvoiceReminderPlan = {
  /** Date the invoice itself went out; the first node of the stepper. */
  sentOn: string
  /** Phrase completing "goes out …", e.g. "tomorrow at 09:00". */
  nextAt: string
  steps: ReminderStep[]
}

export const INVOICE_REMINDER_PLAN: InvoiceReminderPlan = {
  sentOn: '22 Jul',
  nextAt: 'tomorrow at 09:00',
  steps: [
    { id: 'friendly', labelKey: 'invoiceReminder.steps.friendly', when: 'Tomorrow 09:00' },
    { id: 'followUp', labelKey: 'invoiceReminder.steps.followUp', when: '6 Aug' },
    { id: 'finalNotice', labelKey: 'invoiceReminder.steps.finalNotice', when: '22 Aug' },
  ],
}

/** `sentCount` reminders have gone out, so the one at that index is next in line. */
export function stepState(index: number, sentCount: number): ReminderStepState {
  if (index < sentCount) return 'sent'
  if (index === sentCount) return 'next'
  return 'upcoming'
}
