/**
 * Payment reminders.
 *
 *   Management queue  (Figma 81:8594)
 *   Schedule settings (Figma 81:8206)
 *   Pause reminders   (Figma 81:9015)
 *   Send a reminder   (Figma 81:9092)
 *   Template editor   (Figma 81:9183)
 *
 * The whole feature turns on one idea: every reminder sits in a 24-hour hold before it goes out,
 * so anything with a countdown can still be cancelled. Nothing here is irreversible by accident.
 */

export type ReminderTone = 'polite' | 'direct' | 'firm'

/** Tone chip fills, shared by the schedule, the queue and both modals. */
export const TONE_CHIP: Record<ReminderTone, string> = {
  polite: 'bg-[#e6efea] text-[#4c6c5a]',
  direct: 'bg-[#f3f3f3] text-[#5b606c]',
  firm: 'bg-[#fff0f0] text-[#98140b]',
}

export const TONE_LABEL_KEY: Record<ReminderTone, string> = {
  polite: 'reminders.tones.polite',
  direct: 'reminders.tones.direct',
  firm: 'reminders.tones.firm',
}

export type ReminderStepId = 'friendly' | 'followUp' | 'finalNotice'

export type ScheduleStep = {
  id: ReminderStepId
  days: string
  titleKey: string
  tone: ReminderTone
  subjectKey: string
  metaKey: string
}

export const SCHEDULE_STEPS: ScheduleStep[] = [
  {
    id: 'friendly',
    days: '+7',
    titleKey: 'reminders.steps.friendly',
    tone: 'polite',
    subjectKey: 'reminders.steps.friendlySubject',
    metaKey: 'reminders.steps.friendlyMeta',
  },
  {
    id: 'followUp',
    days: '+14',
    titleKey: 'reminders.steps.followUp',
    tone: 'direct',
    subjectKey: 'reminders.steps.followUpSubject',
    metaKey: 'reminders.steps.followUpMeta',
  },
  {
    id: 'finalNotice',
    days: '+30',
    titleKey: 'reminders.steps.finalNotice',
    tone: 'firm',
    subjectKey: 'reminders.steps.finalNoticeSubject',
    metaKey: 'reminders.steps.finalNoticeMeta',
  },
]

/* ------------------------------------------------------ management queue */

export type QueueTabId = 'scheduled' | 'sent' | 'paused' | 'notSending'

export const QUEUE_TABS: { id: QueueTabId; labelKey: string; count: number }[] = [
  { id: 'scheduled', labelKey: 'reminders.queue.tabs.scheduled', count: 4 },
  { id: 'sent', labelKey: 'reminders.queue.tabs.sent', count: 11 },
  { id: 'paused', labelKey: 'reminders.queue.tabs.paused', count: 2 },
  { id: 'notSending', labelKey: 'reminders.queue.tabs.notSending', count: 3 },
]

export const QUEUE_KPI = [
  {
    id: 'goingOut',
    icon: 'goingOut' as const,
    disc: 'bg-[#eaedf8]',
    titleKey: 'reminders.queue.kpi.goingOut',
    value: '4',
    money: false,
    noteKey: 'reminders.queue.kpi.goingOutNote',
  },
  {
    id: 'overdue',
    icon: 'overdue' as const,
    disc: 'bg-[#f7f1e6]',
    titleKey: 'reminders.queue.kpi.overdue',
    value: '3,482.150',
    money: true,
    noteKey: 'reminders.queue.kpi.overdueNote',
  },
  {
    id: 'paid',
    icon: 'paid' as const,
    disc: 'bg-[#e6efea]',
    titleKey: 'reminders.queue.kpi.paid',
    value: '7',
    money: false,
    noteKey: 'reminders.queue.kpi.paidNote',
  },
  {
    id: 'paused',
    icon: 'paused' as const,
    disc: 'bg-[#f3f3f3]',
    titleKey: 'reminders.queue.kpi.paused',
    value: '2',
    money: false,
    noteKey: 'reminders.queue.kpi.pausedNote',
  },
]

/** The primary row action changes with what the row is waiting on. */
export type RowAction = 'sendNow' | 'review' | 'resume'
export type RowSecondary = 'cancel' | 'pause' | null

export type QueueRow = {
  id: string
  sendingKey: string
  sendingNoteKey: string
  paused?: boolean
  customer: string
  email: string
  invoice: string
  invoiceNoteKey: string
  step: 1 | 2 | 3
  stepLabelKey: string
  tone: ReminderTone
  amount: string
  dueKey: string
  action: RowAction
  secondary: RowSecondary
}

export const QUEUE_ROWS: QueueRow[] = [
  {
    id: 'r1',
    sendingKey: 'reminders.queue.tomorrow',
    sendingNoteKey: 'reminders.queue.in16Hours',
    customer: 'Nizwa Souq Café',
    email: 'khalid@nizwasouq.om',
    invoice: 'INV-2038',
    invoiceNoteKey: 'reminders.queue.overdue7',
    step: 1,
    stepLabelKey: 'reminders.steps.friendly',
    tone: 'polite',
    amount: '318.780',
    dueKey: 'reminders.queue.due23Jul',
    action: 'sendNow',
    secondary: 'cancel',
  },
  {
    id: 'r2',
    sendingKey: 'reminders.queue.tomorrow',
    sendingNoteKey: 'reminders.queue.in16Hours',
    customer: 'Salalah Beach Resort',
    email: 'finance@salalahbeach.om',
    invoice: 'INV-2019',
    invoiceNoteKey: 'reminders.queue.overdue14',
    step: 2,
    stepLabelKey: 'reminders.steps.followUp',
    tone: 'direct',
    amount: '1,204.500',
    dueKey: 'reminders.queue.due16Jul',
    action: 'sendNow',
    secondary: 'cancel',
  },
  {
    id: 'r3',
    sendingKey: 'reminders.queue.aug4',
    sendingNoteKey: 'reminders.queue.in5Days',
    customer: 'Bahla Fort Restaurant',
    email: 'ahmed@bahlafort.om',
    invoice: 'INV-2027',
    invoiceNoteKey: 'reminders.queue.due28Jul',
    step: 1,
    stepLabelKey: 'reminders.steps.friendly',
    tone: 'polite',
    amount: '642.000',
    dueKey: 'reminders.queue.due28Jul',
    action: 'sendNow',
    secondary: 'pause',
  },
  {
    id: 'r4',
    sendingKey: 'reminders.queue.aug11',
    sendingNoteKey: 'reminders.queue.in12Days',
    customer: 'Muscat Grand Hotel LLC',
    email: 'ap@muscatgrand.om',
    invoice: 'INV-1994',
    invoiceNoteKey: 'reminders.queue.overdue30',
    step: 1,
    stepLabelKey: 'reminders.steps.finalNotice',
    tone: 'firm',
    amount: '1,316.870',
    dueKey: 'reminders.queue.due12Jul',
    /** The firm step needs a human to look before it goes — hence Review, not Send now. */
    action: 'review',
    secondary: 'pause',
  },
  {
    id: 'r5',
    sendingKey: 'reminders.queue.paused',
    sendingNoteKey: 'reminders.queue.until15Aug',
    paused: true,
    customer: 'Al Mouj Marina Café',
    email: 'reminders.queue.promisedByPhone',
    invoice: 'INV-2004',
    invoiceNoteKey: 'reminders.queue.overdue21',
    step: 2,
    stepLabelKey: 'reminders.steps.followUp',
    tone: 'direct',
    amount: '228.000',
    dueKey: 'reminders.queue.due9Jul',
    action: 'resume',
    secondary: null,
  },
]

export const QUEUE_PAGE_NUMBERS = ['1', '2', '3', '4', '...', '20']

/* ----------------------------------------------------------- settings */

export type StopRule = { id: string; titleKey: string; noteKey: string; on: boolean }

export const STOP_RULES: StopRule[] = [
  { id: 'paid', titleKey: 'reminders.stop.paid', noteKey: 'reminders.stop.paidNote', on: false },
  {
    id: 'partPayment',
    titleKey: 'reminders.stop.partPayment',
    noteKey: 'reminders.stop.partPaymentNote',
    on: true,
  },
  {
    id: 'creditNote',
    titleKey: 'reminders.stop.creditNote',
    noteKey: 'reminders.stop.creditNoteNote',
    on: true,
  },
  {
    id: 'replies',
    titleKey: 'reminders.stop.replies',
    noteKey: 'reminders.stop.repliesNote',
    on: true,
  },
  {
    id: 'dispute',
    titleKey: 'reminders.stop.dispute',
    noteKey: 'reminders.stop.disputeNote',
    on: false,
  },
]

export const SENDING_SETTINGS = {
  sendFrom: 'accounts@albahjacoffee.om',
  replyTo: 'hafidh@albahjacoffee.om',
  sendAt: '09:00 · Asia/Muscat',
  attachPdf: 'Yes, attach every time',
}

export const BEFORE_SENT_RULES = [
  { id: 'hold', titleKey: 'reminders.before.hold', noteKey: 'reminders.before.holdNote', on: true },
  {
    id: 'approveFinal',
    titleKey: 'reminders.before.approveFinal',
    noteKey: 'reminders.before.approveFinalNote',
    on: false,
  },
]

export const CUSTOMER_SEES = [
  { n: '0', titleKey: 'reminders.sees.dueDate', noteKey: 'reminders.sees.dueDateNote' },
  { n: '1', titleKey: 'reminders.sees.day7', noteKey: 'reminders.sees.day7Note' },
  { n: '2', titleKey: 'reminders.sees.day14', noteKey: 'reminders.sees.day14Note' },
  { n: '3', titleKey: 'reminders.sees.day30', noteKey: 'reminders.sees.day30Note' },
]

export const RIGHT_NOW = [
  { labelKey: 'reminders.now.overdue', value: '6' },
  { labelKey: 'reminders.now.queued', value: '4' },
  { labelKey: 'reminders.now.muted', value: '1' },
  { labelKey: 'reminders.now.sent', value: '11' },
]

/* --------------------------------------------------------- pause modal */

export const PAUSE_REASONS = [
  { id: 'promised', labelKey: 'reminders.pause.reasons.promised' },
  { id: 'dispute', labelKey: 'reminders.pause.reasons.dispute' },
  { id: 'correction', labelKey: 'reminders.pause.reasons.correction' },
  { id: 'relationship', labelKey: 'reminders.pause.reasons.relationship' },
  { id: 'other', labelKey: 'reminders.pause.reasons.other' },
]

export const PAUSE_SCOPES = [
  {
    id: 'invoice',
    titleKey: 'reminders.pause.scopeInvoice',
    noteKey: 'reminders.pause.scopeInvoiceNote',
  },
  {
    id: 'customer',
    titleKey: 'reminders.pause.scopeCustomer',
    noteKey: 'reminders.pause.scopeCustomerNote',
  },
]

export const PAUSE_TARGET = {
  invoice: 'INV-2004 · Al Mouj Marina Café',
  metaKey: 'reminders.pause.targetMeta',
  amount: '228.000',
  resumeDate: '15 Aug 2026',
  note: 'Ibrahim called on 29 Jul, says the transfer goes out after their month-end run. Check on 15 Aug before chasing again.',
}

/* ---------------------------------------------------------- send modal */

export const SEND_TARGET = {
  invoice: 'INV-2038 · Nizwa Souq Café',
  metaKey: 'reminders.send.targetMeta',
  amount: '318.780',
  outstandingKey: 'reminders.send.outstanding',
  to: 'khalid@nizwasouq.om',
  subject: 'Invoice INV-2038 — just a reminder',
  from: 'accounts@albahjacoffee.om',
  replyTo: 'hafidh@albahjacoffee.om',
  contactFirstName: 'Khalid',
  rows: [
    { labelKey: 'reminders.send.preview.invoice', value: 'INV-2038' },
    { labelKey: 'reminders.send.preview.issued', value: '23 Jun 2026' },
    { labelKey: 'reminders.send.preview.due', value: '23 Jul 2026' },
    { labelKey: 'reminders.send.preview.outstanding', value: 'OMR 318.780' },
  ],
  attachment: 'INV-2038.pdf',
}

export const SEND_MESSAGE_OPTIONS: {
  id: ReminderStepId
  titleKey: string
  tone: ReminderTone
  hintKey: string
}[] = [
  {
    id: 'friendly',
    titleKey: 'reminders.steps.friendly',
    tone: 'polite',
    hintKey: 'reminders.send.friendlyHint',
  },
  {
    id: 'followUp',
    titleKey: 'reminders.steps.followUp',
    tone: 'direct',
    hintKey: 'reminders.send.followUpHint',
  },
  {
    id: 'finalNotice',
    titleKey: 'reminders.steps.finalNotice',
    tone: 'firm',
    hintKey: 'reminders.send.finalNoticeHint',
  },
]

/* ------------------------------------------------------ template editor */

export const TEMPLATE_DRAFT = {
  stepId: 'friendly' as ReminderStepId,
  days: '+7',
  titleKey: 'reminders.steps.friendly',
  tone: 'polite' as ReminderTone,
  descriptionKey: 'reminders.template.friendlyDescription',
  subject: 'Invoice INV-2038 — just a reminder',
  /** Placeholders in braces are substituted per invoice when the reminder is queued. */
  body: `Dear {contact_first_name},

I hope things are going well. This is a gentle reminder that invoice {invoice_number} is still showing as unpaid on our side.

If it has already been paid, please ignore this note and accept our apologies. If there is a query on the invoice, just reply to this email and we will sort it out.

Kind regards,
{sender_name}
{business_name}`,
}
