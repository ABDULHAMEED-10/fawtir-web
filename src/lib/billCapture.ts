import type { SelectOption } from '../components/ui'

/**
 * What the reader pulled out of an uploaded bill (Figma 86:15655) and a scanned receipt
 * (86:16098).
 *
 * Both screens are the same idea: a machine had a go, and a person confirms it. So both models
 * carry the value *and* whether the reader was confident, because the amber highlighting is the
 * only thing telling the user where to look.
 */

export const SUPPLIER_OPTIONS: SelectOption[] = [
  { value: 'Sohar Packaging LLC', label: 'Sohar Packaging LLC', hint: 'VAT OM1100628391' },
  { value: 'Muscat Roastery Co', label: 'Muscat Roastery Co', hint: 'VAT OM1100447102' },
  { value: 'Al Noor Dates LLC', label: 'Al Noor Dates LLC', hint: 'VAT OM1100771290' },
  { value: 'Nizwa Hardware Store', label: 'Nizwa Hardware Store', hint: 'VAT OM1100773310' },
  { value: 'Gulf Cold Logistics', label: 'Gulf Cold Logistics', hint: 'VAT OM1100582341' },
]

export const UPLOADED_BILL = {
  file: { name: 'SP-INV-1151.pdf', pages: 1, size: '248 KB', seconds: 3, read: 11, fields: 13 },

  /** The parsed values that populate the form on the right. */
  fields: {
    supplier: 'Sohar Packaging LLC',
    billNumber: 'SP-INV-1151',
    billDate: '2026-07-26',
    dueDate: '2026-08-05',
    lines: [
      {
        id: 'l1',
        description: 'Kraft coffee bags 1kg, printed',
        qty: '2000',
        rate: '0.240',
        vat: '5%',
      },
      {
        id: 'l2',
        description: 'Kraft coffee bags 250g, printed',
        qty: '1500',
        rate: '0.088',
        vat: '5%',
      },
      // The reader found the row but no rate or amount against it.
      { id: 'l3', description: 'Pallet handling', qty: '1', rate: '', vat: '5%', unsure: true },
    ],
  },

  suggestedOrder: 'PO-0033',

  /** The document as printed, which the left pane renders. */
  sheet: {
    supplier: 'Sohar Packaging LLC',
    address: 'Industrial Area 4, Sohar',
    vat: 'OM1100628391',
    kind: 'Tax invoice',
    number: 'SP-INV-1151',
    date: '26 Jul 2026',
    billedToLabel: 'Billed to',
    billedTo: ['Al Bahja Coffee LLC', 'Souq Street, Nizwa', 'VAT OM1100392000'],
    columns: ['Description', 'Qty', 'Rate', 'Amount'],
    lines: [
      {
        description: 'Kraft coffee bags 1kg, printed',
        qty: '2,000',
        rate: '0.240',
        amount: '480.000',
      },
      {
        description: 'Kraft coffee bags 250g, printed',
        qty: '1,500',
        rate: '0.088',
        amount: '132.000',
      },
      { description: 'Pallet handling', qty: '1', rate: 'n/a', amount: 'n/a' },
    ],
    totals: [
      { label: 'Subtotal', value: '612.000' },
      { label: 'VAT 5%', value: '30.600' },
    ],
    totalLabel: 'Total',
    total: '642.600',
    /** Bare number, for comparing against what the lines add up to. */
    totalPlain: '642.600',
    termsLabel: 'Terms',
    termsPrefix: 'Payment within',
    termsHighlight: '10 days',
    termsSuffix: 'of invoice date. Bank Muscat, IBAN OM90 0018 0000 6283 91.',
  },
}

/* ------------------------------------------------------------------ receipts */

export type ReceiptStatus = 'saved' | 'current' | 'todo'

export type ScannedReceipt = {
  id: string
  labelKey: string
  status: ReceiptStatus
  merchant: string
  date: string
  number: string
  total: string
  vat: string
  /** 5 / 0 / exempt — the rate the reader settled on. */
  vatRate: '5' | '0' | 'exempt'
  category: string
  /** Fields the reader was not sure of, so the form marks them amber. */
  unsure: ('vat' | 'category')[]
  fileName: string
  fileSize: string
  /** Lines as printed on the paper. */
  lines: { description: string; amount: string }[]
  subtotal: string
}

export const SCANNED_RECEIPTS: ScannedReceipt[] = [
  {
    id: 'fuel',
    labelKey: 'scanReceipts.tiles.fuel',
    status: 'saved',
    merchant: 'Muscat Fuel',
    date: '2026-07-28',
    number: '11820',
    total: '14.800',
    vat: '0.700',
    vatRate: '5',
    category: 'Vehicle & fuel',
    unsure: [],
    fileName: 'IMG_4468.jpg',
    fileSize: '0.9 MB',
    lines: [{ description: 'Diesel 40L', amount: '14.800' }],
    subtotal: '14.100',
  },
  {
    id: 'market',
    labelKey: 'scanReceipts.tiles.market',
    status: 'saved',
    merchant: 'Al Fayha Market',
    date: '2026-07-29',
    number: '20714',
    total: '46.900',
    vat: '2.233',
    vatRate: '5',
    category: 'Kitchen supplies',
    unsure: [],
    fileName: 'IMG_4469.jpg',
    fileSize: '1.1 MB',
    lines: [{ description: 'Milk, sugar', amount: '46.900' }],
    subtotal: '44.667',
  },
  {
    id: 'hardware',
    labelKey: 'scanReceipts.tiles.hardware',
    status: 'current',
    merchant: 'Nizwa Hardware Store',
    date: '2026-07-30',
    number: '4471',
    total: '28.400',
    vat: '1.350',
    vatRate: '5',
    category: 'Repairs & maintenance',
    unsure: ['vat', 'category'],
    fileName: 'IMG_4471.jpg',
    fileSize: '1.2 MB',
    lines: [
      { description: 'Wire brush x2', amount: '6.400' },
      { description: 'Sealant tube', amount: '4.900' },
      { description: 'Drain cover', amount: '15.750' },
    ],
    subtotal: '27.050',
  },
  {
    id: 'taxi',
    labelKey: 'scanReceipts.tiles.taxi',
    status: 'todo',
    merchant: 'Taxi receipt',
    date: '2026-07-30',
    number: '—',
    total: '22.000',
    vat: '0.000',
    vatRate: 'exempt',
    category: 'Travel',
    unsure: ['vat'],
    fileName: 'IMG_4472.jpg',
    fileSize: '0.8 MB',
    lines: [{ description: 'Nizwa — Muscat', amount: '22.000' }],
    subtotal: '22.000',
  },
  {
    id: 'stationery',
    labelKey: 'scanReceipts.tiles.stationery',
    status: 'todo',
    merchant: 'Sohar Stationery',
    date: '2026-07-30',
    number: '9480',
    total: '9.480',
    vat: '0.451',
    vatRate: '5',
    category: 'Office supplies',
    unsure: [],
    fileName: 'IMG_4473.jpg',
    fileSize: '0.7 MB',
    lines: [{ description: 'Print paper, ink', amount: '9.480' }],
    subtotal: '9.029',
  },
]

export const EXPENSE_CATEGORIES = [
  'Repairs & maintenance',
  'Kitchen supplies',
  'Office supplies',
  'Vehicle & fuel',
  'Travel',
  'Utilities',
  'Marketing',
  'Professional fees',
]

/** How the purchase was settled. The first two answer "was it paid", the rest "with what". */
export type PaidState = 'paidOnSpot' | 'stillOwing'
export type PaidMethod = 'cash' | 'card' | 'pettyCash'
