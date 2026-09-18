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
    {
      id: 'view',
      labelKey: 'rowActions.invoice.view',
      icon: viewIcon,
      to: `/invoices/${invoiceId}`,
    },
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

export function quotationRowActions(documentId: string): ActionMenuItem[] {
  return [
    {
      id: 'view',
      labelKey: 'rowActions.quotation.view',
      icon: viewIcon,
      to: `/trade-documents/quotations/${documentId}`,
    },
    { id: 'send', labelKey: 'rowActions.quotation.send', icon: sendIcon },
    { id: 'edit', labelKey: 'rowActions.quotation.edit', icon: editIcon },
    { id: 'convert', labelKey: 'rowActions.quotation.convert', icon: invoiceIcon },
    { id: 'duplicate', labelKey: 'rowActions.invoice.duplicate', icon: duplicateIcon },
    { id: 'delete', labelKey: 'rowActions.delete', icon: deleteIcon, danger: true },
  ]
}

export function orderFormRowActions(documentId: string): ActionMenuItem[] {
  return [
    {
      id: 'view',
      labelKey: 'rowActions.orderForm.view',
      icon: viewIcon,
      to: `/trade-documents/order-forms/${documentId}`,
    },
    { id: 'edit', labelKey: 'rowActions.orderForm.edit', icon: editIcon },
    { id: 'delivery', labelKey: 'rowActions.orderForm.delivery', icon: sendIcon },
    { id: 'invoice', labelKey: 'rowActions.orderForm.invoice', icon: invoiceIcon },
    { id: 'duplicate', labelKey: 'rowActions.invoice.duplicate', icon: duplicateIcon },
    { id: 'delete', labelKey: 'rowActions.delete', icon: deleteIcon, danger: true },
  ]
}

export function deliveryNoteRowActions(documentId: string): ActionMenuItem[] {
  return [
    {
      id: 'view',
      labelKey: 'rowActions.deliveryNote.view',
      icon: viewIcon,
      to: `/trade-documents/delivery-notes/${documentId}`,
    },
    { id: 'edit', labelKey: 'rowActions.deliveryNote.edit', icon: editIcon },
    { id: 'invoice', labelKey: 'rowActions.deliveryNote.invoice', icon: invoiceIcon },
    { id: 'print', labelKey: 'rowActions.deliveryNote.print', icon: sendIcon },
    { id: 'duplicate', labelKey: 'rowActions.invoice.duplicate', icon: duplicateIcon },
    { id: 'delete', labelKey: 'rowActions.delete', icon: deleteIcon, danger: true },
  ]
}

/** Bills row menu — open, take the file, or take it out of the payment run. */
export function billRowActions(billId: string): ActionMenuItem[] {
  return [
    {
      id: 'view',
      labelKey: 'rowActions.bill.view',
      icon: viewIcon,
      to: `/expenditure/bills/${billId}`,
    },
    { id: 'download', labelKey: 'rowActions.bill.download', icon: statementIcon },
    { id: 'hold', labelKey: 'rowActions.bill.hold', icon: pauseIcon },
    { id: 'reject', labelKey: 'rowActions.bill.reject', icon: deleteIcon, danger: true },
  ]
}

/** The Fawtir console's tenant rows (Figma 143:17411). */
export function tenantRowActions(): ActionMenuItem[] {
  return [
    { id: 'open', labelKey: 'console.tenants.action.open', icon: viewIcon, to: '/console/tenants' },
    { id: 'signIn', labelKey: 'console.tenants.action.signIn', icon: sendIcon },
    { id: 'suspend', labelKey: 'console.tenants.action.suspend', icon: pauseIcon, danger: true },
  ]
}

/** A sale in the day's list at the till (Figma 143:20498). */
export function posSaleRowActions(invoiceId: string): ActionMenuItem[] {
  return [
    { id: 'receipt', labelKey: 'pos.today.printReceipt', icon: viewIcon },
    { id: 'email', labelKey: 'pos.today.emailReceipt', icon: sendIcon },
    {
      id: 'open',
      labelKey: 'pos.today.openInvoice',
      icon: invoiceIcon,
      to: `/invoices/${invoiceId}`,
    },
  ]
}

/* ------------------------------------------------------- console · subscriptions */

/** The queue's states, spelt out here so this file stays free of the ledger module. */
type SubscriptionRowState =
  'trial' | 'awaitingPayment' | 'active' | 'grace' | 'suspended' | 'cancelled'

/**
 * The Subscriptions queue's row menu (docs/erp-and-console-plan.md §7.3). Every action is a deep
 * link the tenant's page answers with the matching modal, so the queue never opens one itself.
 * What makes no sense for the state is left out: nothing to record for a trial or a cancelled
 * tenant, nothing to activate that is already live, and a suspended tenant is resumed, not
 * suspended again.
 */
export function subscriptionRowActions(
  tenantId: string,
  state: SubscriptionRowState,
): ActionMenuItem[] {
  const tenant = `/console/tenants/${tenantId}?from=subscriptions`
  const hasOpenInvoice = state === 'awaitingPayment' || state === 'grace' || state === 'suspended'
  const items: ActionMenuItem[] = [
    { id: 'open', labelKey: 'rowActions.subscription.open', icon: viewIcon, to: tenant },
  ]
  if (hasOpenInvoice) {
    items.push(
      {
        id: 'recordPayment',
        labelKey: 'rowActions.subscription.recordPayment',
        icon: invoiceIcon,
        to: `${tenant}&action=recordPayment`,
      },
      {
        id: 'sendLink',
        labelKey: 'rowActions.subscription.sendLink',
        icon: sendIcon,
        to: `${tenant}&action=sendLink`,
      },
    )
  }
  if (state === 'suspended') {
    items.push({
      id: 'resume',
      labelKey: 'rowActions.subscription.resume',
      icon: periodicIcon,
      to: `${tenant}&action=resume`,
    })
  } else if (state !== 'active') {
    items.push({
      id: 'activate',
      labelKey: 'rowActions.subscription.activate',
      icon: periodicIcon,
      to: `${tenant}&action=activate`,
    })
  }
  if (state !== 'cancelled') {
    items.push({
      id: 'changePlan',
      labelKey: 'rowActions.subscription.changePlan',
      icon: editIcon,
      to: `${tenant}&action=changePlan`,
    })
  }
  if (state === 'active' || state === 'awaitingPayment' || state === 'grace') {
    items.push({
      id: 'suspend',
      labelKey: 'rowActions.subscription.suspend',
      icon: pauseIcon,
      to: `${tenant}&action=suspend`,
      danger: true,
    })
  }
  return items
}

/**
 * A subscription invoice's row menu. Recording a payment and sending a link only apply while the
 * invoice is still open; `settled` hides them for a paid or waived one.
 */
export function subscriptionInvoiceRowActions(
  tenantId: string,
  invoiceId: string,
  settled = false,
): ActionMenuItem[] {
  const tenant = `/console/tenants/${tenantId}?from=invoices`
  return [
    { id: 'open', labelKey: 'rowActions.subscription.open', icon: viewIcon, to: tenant },
    ...(settled
      ? []
      : [
          {
            id: 'recordPayment',
            labelKey: 'rowActions.subscription.recordPayment',
            icon: invoiceIcon,
            to: `${tenant}&action=recordPayment&invoice=${invoiceId}`,
          },
          {
            id: 'sendLink',
            labelKey: 'rowActions.subscription.sendLink',
            icon: sendIcon,
            to: `${tenant}&action=sendLink&invoice=${invoiceId}`,
          },
        ]),
    { id: 'download', labelKey: 'rowActions.subscription.download', icon: statementIcon },
  ]
}
