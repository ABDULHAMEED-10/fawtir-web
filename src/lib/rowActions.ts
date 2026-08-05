import type { ActionMenuItem } from '../components/ui'
import viewIcon from '../assets/actions/view.svg'
import sendIcon from '../assets/actions/send.svg'
import duplicateIcon from '../assets/actions/duplicate.svg'
import creditNoteIcon from '../assets/actions/credit-note.svg'
import periodicIcon from '../assets/actions/periodic.svg'
import invoiceIcon from '../assets/actions/invoice.svg'
import statementIcon from '../assets/actions/statement.svg'
import editIcon from '../assets/actions/edit.svg'
import pauseIcon from '../assets/actions/pause.svg'
import deleteIcon from '../assets/actions/delete.svg'

/**
 * The "Actions" popups from Figma (13:36532 invoices, 13:47161 customers, 13:47188 schedules).
 * Icons are the exported SVGs from those frames, not lookalikes. Each menu is a factory
 * because the view/edit entries link to the row being acted on.
 */

export function invoiceRowActions(invoiceId: string): ActionMenuItem[] {
  return [
    { id: 'view', labelKey: 'rowActions.invoice.view', icon: viewIcon, to: `/invoices/${invoiceId}` },
    { id: 'send', labelKey: 'rowActions.invoice.send', icon: sendIcon },
    { id: 'duplicate', labelKey: 'rowActions.invoice.duplicate', icon: duplicateIcon },
    {
      id: 'creditNote',
      labelKey: 'rowActions.invoice.creditNote',
      icon: creditNoteIcon,
      to: '/income/credit-notes/new',
    },
    {
      id: 'periodic',
      labelKey: 'rowActions.invoice.periodic',
      icon: periodicIcon,
      to: '/income/periodic',
    },
    { id: 'delete', labelKey: 'rowActions.delete', icon: deleteIcon, danger: true },
  ]
}

export function customerRowActions(customerId: string): ActionMenuItem[] {
  return [
    {
      id: 'view',
      labelKey: 'rowActions.customer.view',
      icon: viewIcon,
      to: `/customers/${customerId}`,
    },
    {
      id: 'newInvoice',
      labelKey: 'rowActions.customer.newInvoice',
      icon: invoiceIcon,
      to: '/invoices/new',
    },
    { id: 'statement', labelKey: 'rowActions.customer.statement', icon: statementIcon },
    { id: 'edit', labelKey: 'rowActions.customer.edit', icon: editIcon },
    { id: 'delete', labelKey: 'rowActions.delete', icon: deleteIcon, danger: true },
  ]
}

/** Supplier equivalent: we record a bill rather than raise an invoice, and pay rather than collect. */
export function supplierRowActions(supplierId: string): ActionMenuItem[] {
  return [
    {
      id: 'view',
      labelKey: 'rowActions.supplier.view',
      icon: viewIcon,
      to: `/suppliers/${supplierId}`,
    },
    { id: 'recordBill', labelKey: 'rowActions.supplier.recordBill', icon: invoiceIcon },
    { id: 'statement', labelKey: 'rowActions.supplier.statement', icon: statementIcon },
    { id: 'edit', labelKey: 'rowActions.supplier.edit', icon: editIcon },
    { id: 'delete', labelKey: 'rowActions.delete', icon: deleteIcon, danger: true },
  ]
}

/**
 * No Figma frame exists for the credit-note row menu — modelled on the invoice one,
 * minus the actions that cannot apply to a credit note.
 */
export function creditNoteRowActions(creditNoteId: string): ActionMenuItem[] {
  return [
    {
      id: 'view',
      labelKey: 'rowActions.creditNote.view',
      icon: viewIcon,
      to: `/income/credit-notes/${creditNoteId}`,
    },
    { id: 'send', labelKey: 'rowActions.invoice.send', icon: sendIcon },
    { id: 'duplicate', labelKey: 'rowActions.invoice.duplicate', icon: duplicateIcon },
    { id: 'delete', labelKey: 'rowActions.delete', icon: deleteIcon, danger: true },
  ]
}

/** Debit note row menu — no Figma frame, modelled on the credit note one. */
export function debitNoteRowActions(debitNoteId: string): ActionMenuItem[] {
  return [
    {
      id: 'view',
      labelKey: 'rowActions.debitNote.view',
      icon: viewIcon,
      to: `/income/debit-notes/${debitNoteId}`,
    },
    { id: 'send', labelKey: 'rowActions.invoice.send', icon: sendIcon },
    { id: 'duplicate', labelKey: 'rowActions.invoice.duplicate', icon: duplicateIcon },
    { id: 'delete', labelKey: 'rowActions.delete', icon: deleteIcon, danger: true },
  ]
}

/** Agreement row menu — no Figma frame; actions follow the agreement lifecycle. */
export function agreementRowActions(agreementId: string): ActionMenuItem[] {
  return [
    {
      id: 'view',
      labelKey: 'rowActions.agreement.view',
      icon: viewIcon,
      to: `/income/self-billing/agreements/${agreementId}`,
    },
    { id: 'renew', labelKey: 'rowActions.agreement.renew', icon: editIcon },
    { id: 'resend', labelKey: 'rowActions.agreement.resend', icon: sendIcon },
    { id: 'duplicate', labelKey: 'rowActions.invoice.duplicate', icon: duplicateIcon },
    { id: 'terminate', labelKey: 'rowActions.agreement.terminate', icon: deleteIcon, danger: true },
  ]
}

/** Self-billed document row menu — no Figma frame, modelled on the invoice one. */
export function selfBillRowActions(documentId: string): ActionMenuItem[] {
  return [
    {
      id: 'view',
      labelKey: 'rowActions.selfBill.view',
      icon: viewIcon,
      to: `/income/self-billing/${documentId}`,
    },
    { id: 'send', labelKey: 'rowActions.invoice.send', icon: sendIcon },
    { id: 'edit', labelKey: 'rowActions.selfBill.edit', icon: editIcon },
    { id: 'duplicate', labelKey: 'rowActions.invoice.duplicate', icon: duplicateIcon },
    { id: 'delete', labelKey: 'rowActions.delete', icon: deleteIcon, danger: true },
  ]
}

export function scheduleRowActions(): ActionMenuItem[] {
  return [
    { id: 'view', labelKey: 'rowActions.schedule.view', icon: viewIcon, to: '/income/periodic/monthly-coffee-supply' },
    {
      id: 'edit',
      labelKey: 'rowActions.schedule.edit',
      icon: editIcon,
      to: '/income/periodic/monthly-coffee-supply/edit',
    },
    { id: 'generate', labelKey: 'rowActions.schedule.generate', icon: invoiceIcon },
    { id: 'pause', labelKey: 'rowActions.schedule.pause', icon: pauseIcon },
    { id: 'duplicate', labelKey: 'rowActions.schedule.duplicate', icon: duplicateIcon },
    { id: 'delete', labelKey: 'rowActions.delete', icon: deleteIcon, danger: true },
  ]
}
