/**
 * Order forms management (Figma 13:37935).
 *
 * Order forms are dual-natured: the same document is a *sales* order when a customer
 * orders from you and a *purchase* order when you order from a supplier. Every row
 * therefore carries a direction chip, and the fulfilment bar tracks value — how much
 * has been delivered/received and how much of that has been billed.
 */

export type OrderDirection = 'sales' | 'purchase'

export type OrderMode = 'all' | 'sales' | 'purchase'

export type OrderTabId =
  | 'all'
  | 'draft'
  | 'open'
  | 'overdue'
  | 'readyToInvoice'
  | 'awaitingSupplierBill'
  | 'completed'

export type OrderStatus =
  | 'readyToInvoice'
  | 'awaitingSupplierBill'
  | 'inProgress'
  | 'partReceived'
  | 'deliveryOverdue'
  | 'ordered'
  | 'completed'

/** The fulfilment bar fill — sand = moved but not billed, blue = invoiced, slate = supplier-billed. */
export type BarTone = 'invoiced' | 'unbilled' | 'supplierBilled'

export type OrderRow = {
  id: string
  direction: OrderDirection
  origin: string
  party: string
  /** "Customer" reads in brand blue, "Supplier" in grey. */
  partyRole: 'customer' | 'supplier'
  due: string
  dueNote: string
  dueTone: 'normal' | 'danger'
  value: string
  valueNote: string
  /** Bar fill as a percentage of the 225px track; 0 renders the plain-text state. */
  barPercent: number
  barTone: BarTone
  /** Legend under the bar — omitted when the row shows a plain sentence instead. */
  legend?: { dots: BarTone[]; amount: string; label: string }
  /** Some rows replace the bar legend with a single sentence. */
  barText?: { text: string; tone: 'normal' | 'done' }
  status: OrderStatus
  /** The next step — a filled button on the two rows that need action, else outlined. */
  action?: { labelKey: string; variant: 'primary' | 'slate' | 'outline' | 'link'; icon?: boolean }
}

export const ORDER_MODES: { id: OrderMode; titleKey: string; hintKey: string; count: string }[] = [
  { id: 'all', titleKey: 'orderForms.mode.all', hintKey: 'orderForms.mode.allHint', count: '34' },
  {
    id: 'sales',
    titleKey: 'orderForms.mode.sales',
    hintKey: 'orderForms.mode.salesHint',
    count: '21',
  },
  {
    id: 'purchase',
    titleKey: 'orderForms.mode.purchase',
    hintKey: 'orderForms.mode.purchaseHint',
    count: '13',
  },
]

export const ORDER_KPI: {
  id: string
  icon: 'orders' | 'transit' | 'delivered' | 'received'
  titleKey: string
  amount: string
  /** Two cards split the figure by direction, two offer a next-step link. */
  split?: { salesKey: string; purchaseKey: string }
  link?: string
}[] = [
  {
    id: 'open',
    icon: 'orders',
    titleKey: 'orderForms.kpi.open',
    amount: '46,880.000',
    split: { salesKey: 'orderForms.kpi.openSales', purchaseKey: 'orderForms.kpi.openPurchase' },
  },
  {
    id: 'transit',
    icon: 'transit',
    titleKey: 'orderForms.kpi.inTransit',
    amount: '26,610.000',
    split: {
      salesKey: 'orderForms.kpi.transitDeliver',
      purchaseKey: 'orderForms.kpi.transitReceive',
    },
  },
  {
    id: 'delivered',
    icon: 'delivered',
    titleKey: 'orderForms.kpi.deliveredNotInvoiced',
    amount: '7,918.000',
    link: 'orderForms.kpi.invoiceOrders',
  },
  {
    id: 'received',
    icon: 'received',
    titleKey: 'orderForms.kpi.receivedNotInvoiced',
    amount: '3,842.000',
    link: 'orderForms.kpi.reviewOrders',
  },
]

export const ORDER_TABS: { id: OrderTabId; labelKey: string; count: string; tone?: 'danger' }[] = [
  { id: 'all', labelKey: 'orderForms.tabs.all', count: '32' },
  { id: 'draft', labelKey: 'orderForms.tabs.draft', count: '4' },
  { id: 'open', labelKey: 'orderForms.tabs.open', count: '6' },
  { id: 'overdue', labelKey: 'orderForms.tabs.overdue', count: '1', tone: 'danger' },
  { id: 'readyToInvoice', labelKey: 'orderForms.tabs.readyToInvoice', count: '9' },
  { id: 'awaitingSupplierBill', labelKey: 'orderForms.tabs.awaitingSupplierBill', count: '9' },
  { id: 'completed', labelKey: 'orderForms.tabs.completed', count: '9' },
]

export const ORDER_ROWS: OrderRow[] = [
  {
    id: 'SO-0074',
    direction: 'sales',
    origin: 'From QUO-0117',
    party: 'Sohar Grand Mall',
    partyRole: 'customer',
    due: '02 Aug 2026',
    dueNote: 'Delivered in full',
    dueTone: 'normal',
    value: '12,900.000',
    valueNote: 'Nothing billed yet',
    barPercent: 100,
    barTone: 'unbilled',
    legend: { dots: ['unbilled'], amount: '12,900.000', label: 'to invoice' },
    status: 'readyToInvoice',
    action: { labelKey: 'orderForms.action.issueInvoice', variant: 'primary', icon: true },
  },
  {
    id: 'PO-0031',
    direction: 'purchase',
    origin: 'From their quote',
    party: 'Muscat Roastery Co',
    partyRole: 'supplier',
    due: '28 Jul 2026',
    dueNote: 'Received in full',
    dueTone: 'normal',
    value: '1,240.000',
    valueNote: 'No supplier bill',
    barPercent: 59,
    barTone: 'unbilled',
    legend: { dots: ['unbilled'], amount: '2,460.000', label: 'unbilled' },
    status: 'awaitingSupplierBill',
    action: { labelKey: 'orderForms.action.selfBillSupplier', variant: 'slate' },
  },
  {
    id: 'SO-0073',
    direction: 'sales',
    origin: 'Manual',
    party: 'Nizwa Souq Café',
    partyRole: 'customer',
    due: 'Weekly',
    dueNote: 'Next drop 04 Aug',
    dueTone: 'normal',
    value: '1,240.000',
    valueNote: '496.000 invoiced',
    barPercent: 57,
    barTone: 'unbilled',
    legend: { dots: ['invoiced', 'unbilled'], amount: '248.000', label: 'to invoice' },
    status: 'inProgress',
    action: { labelKey: 'orderForms.action.logDelivery', variant: 'outline' },
  },
  {
    id: 'PO-0029',
    direction: 'purchase',
    origin: 'Manual',
    party: 'Al Noor Dates LLC',
    partyRole: 'supplier',
    due: '06 Aug 2026',
    dueNote: 'Half received',
    dueTone: 'normal',
    value: '4,180.000',
    valueNote: '2,090.000 billed',
    barPercent: 59,
    barTone: 'supplierBilled',
    legend: { dots: [], amount: '2,090.000', label: 'still to receive' },
    status: 'partReceived',
    action: { labelKey: 'orderForms.action.recordReceipt', variant: 'outline' },
  },
  {
    id: 'SO-0071',
    direction: 'sales',
    origin: 'SAP · PO-44018',
    party: 'Salalah Beach Resort',
    partyRole: 'customer',
    due: '21 Jul 2026',
    dueNote: '9 days overdue',
    dueTone: 'danger',
    value: '4,610.000',
    valueNote: 'Nothing invoiced',
    barPercent: 35,
    barTone: 'unbilled',
    legend: { dots: [], amount: '3,227.000', label: 'still to ship' },
    status: 'deliveryOverdue',
    action: { labelKey: 'orderForms.action.logDelivery', variant: 'outline' },
  },
  {
    id: 'PO-0028',
    direction: 'purchase',
    origin: 'From their quote',
    party: 'Sohar Packaging LLC',
    partyRole: 'supplier',
    due: '11 Aug 2026',
    dueNote: 'In 12 days',
    dueTone: 'normal',
    value: '3,140.000',
    valueNote: 'Nothing billed',
    barPercent: 0,
    barTone: 'unbilled',
    barText: { text: 'Nothing received yet', tone: 'normal' },
    status: 'ordered',
    action: { labelKey: 'orderForms.action.recordReceipt', variant: 'outline' },
  },
  {
    id: 'SO-0068',
    direction: 'sales',
    origin: 'From QUO-0110',
    party: 'Bahla Fort Restaurant',
    partyRole: 'customer',
    due: '11 Aug 2026',
    dueNote: 'In 12 days',
    dueTone: 'normal',
    value: '3,940.000',
    valueNote: 'Fully invoiced',
    barPercent: 100,
    barTone: 'invoiced',
    barText: { text: 'Delivered and billed in full', tone: 'done' },
    status: 'completed',
    action: { labelKey: 'orderForms.action.viewInvoice', variant: 'link' },
  },
]

export const ORDER_PAGE_NUMBERS = ['1', '2', '3', '4', '...', '20']
