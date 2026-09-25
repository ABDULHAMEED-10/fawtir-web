import { useMemo } from 'react'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import {
  REMINDER_SCHEDULE_PATH,
  loadReminderLog,
  loadReminderSchedule,
  reminderLogPath,
  type ReminderLogDto,
  type ReminderScheduleDto,
} from '../../api/invoices/reminders'
import { invoiceListPath, loadInvoicePage, type InvoiceRowDto } from '../../api/invoices/list'
import { customerListPath, loadCustomerPage, type CustomerDto } from '../../api/customers/customers'
import { buildQueue, type QueueEntry, type QueueInvoice } from '../../lib/paymentReminders'

/** The invoices list's own cap, and the customers list's: the queue is worked out from one page of each. */
const INVOICE_PAGE_SIZE = 100
const CUSTOMER_PAGE_SIZE = 100
/** The log's biggest page: the recent history the queue subtracts from. */
const LOG_PAGE_SIZE = 100

/**
 * Everything the reminders queue is made of (design 159:17137), read once and shared by the
 * queue page and the settings page's "Right now" card: the ladder (an administrator's read), the
 * issued invoices, the customers' e-mail addresses and the recent log.
 * TODO(backend): a queue endpoint and a log total would make these four reads one.
 */
export function useReminderQueue(canReadSchedule: boolean, today: string) {
  const schedule = useApiRead<ReminderScheduleDto>(
    canReadSchedule ? REMINDER_SCHEDULE_PATH : null,
    loadReminderSchedule,
  )
  const invoicesPath = invoiceListPath({
    state: 'ISSUED',
    payment: null,
    type: 'INVOICE',
    from: null,
    to: null,
    search: '',
    sort: 'DUE_SOONEST',
    page: 0,
    size: INVOICE_PAGE_SIZE,
  })
  const invoices = useApiRead<Page<InvoiceRowDto>>(invoicesPath, () =>
    loadInvoicePage(invoicesPath),
  )
  const customersPath = customerListPath({
    type: null,
    search: '',
    sort: 'NAME_ASC',
    page: 0,
    size: CUSTOMER_PAGE_SIZE,
  })
  const customers = useApiRead<Page<CustomerDto>>(customersPath, () =>
    loadCustomerPage(customersPath),
  )
  const logPath = reminderLogPath({ page: 0, pageSize: LOG_PAGE_SIZE })
  const log = useApiRead<ReminderLogDto[]>(logPath, () => loadReminderLog(logPath))

  const rows = useMemo<QueueInvoice[]>(
    () =>
      (invoices.read.status === 'ready' ? invoices.read.data.items : []).map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        customerId: row.customerId,
        customerName: row.customerName,
        dueDate: row.dueDate,
        currency: row.currency,
        outstanding: row.payment?.outstandingAmount ?? row.totals?.totalAmount ?? null,
        overdue: row.payment?.overdue ?? false,
        daysOverdue: row.payment?.daysOverdue ?? null,
        paid: row.payment?.state === 'PAID',
      })),
    [invoices.read],
  )
  const customerRows = customers.read.status === 'ready' ? customers.read.data.items : []
  const emails = useMemo(
    () =>
      new Map(
        customerRows.map((row) => [row.id, row.profile?.contact?.emailRecipients?.[0] ?? null]),
      ),
    [customerRows],
  )
  const muted = customerRows.filter(
    (row) => row.profile?.deliveryPreferences?.automaticPaymentReminders === false,
  ).length
  const ladder = schedule.read.status === 'ready' ? schedule.read.data : null
  const logRows = log.read.status === 'ready' ? log.read.data : []
  const queue = useMemo<QueueEntry[]>(
    () =>
      ladder
        ? buildQueue(rows, ladder.offsets, logRows, (id) => emails.get(id) ?? null, today)
        : [],
    [ladder, rows, logRows, emails, today],
  )

  return {
    schedule,
    invoices,
    customers,
    log,
    ladder,
    rows,
    logRows,
    emails,
    muted,
    queue,
    loading:
      invoices.read.status === 'loading' ||
      log.read.status === 'loading' ||
      (canReadSchedule && schedule.read.status === 'loading'),
    retry: () => {
      schedule.retry()
      invoices.retry()
      log.retry()
    },
  }
}
