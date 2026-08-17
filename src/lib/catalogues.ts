/**
 * Reference data for the invoice composer.
 *
 * Stands in for the catalogues `FAWTIR-INV-SRS-001` §14–§20 says the backend will own
 * (products, units, tax categories, payment terms, payment methods) plus the Customer master.
 * Shapes match what those APIs are specified to return, so swapping the source is a data change
 * rather than a rewrite.
 */

import type { SelectOption } from '../components/ui/Select'
import businessIcon from '../assets/create-invoice/business.svg'
import consumerIcon from '../assets/create-invoice/consumer.svg'
import governmentIcon from '../assets/create-invoice/government.svg'

/** The same glyphs the customer-type tabs use, so the dropdown reads the same way. */
export const CUSTOMER_KIND_ICON: Record<'business' | 'consumer' | 'government', string> = {
  business: businessIcon,
  consumer: consumerIcon,
  government: governmentIcon,
}

/** Tax categories carry the EN 16931 category id, so the rate is never typed by hand. */
export type TaxCategory = {
  code: string
  label: string
  categoryId: 'S' | 'Z' | 'E' | 'AE' | 'G' | 'O'
  /** Percent, as a string so it feeds the calculation engine unchanged. */
  rate: string
}

export const TAX_CATEGORIES: TaxCategory[] = [
  { code: 'S5', label: 'Standard rate - 5%', categoryId: 'S', rate: '5' },
  { code: 'Z0', label: 'Zero-rated - 0%', categoryId: 'Z', rate: '0' },
  { code: 'E0', label: 'Exempt - 0%', categoryId: 'E', rate: '0' },
  { code: 'O0', label: 'Out of scope - 0%', categoryId: 'O', rate: '0' },
  { code: 'AE0', label: 'Reverse charge - 0%', categoryId: 'AE', rate: '0' },
  { code: 'G0', label: 'Export - 0%', categoryId: 'G', rate: '0' },
]

export const TAX_CATEGORY_OPTIONS: SelectOption[] = TAX_CATEGORIES.map((category) => ({
  value: category.code,
  label: category.label,
  shortLabel: `${category.rate}%`,
  hint: `EN 16931 category ${category.categoryId}`,
}))

/** UN/ECE Recommendation 20 codes — the list PEPPOL BIS and PINT-OM require. */
export const UNIT_OPTIONS: SelectOption[] = [
  { value: 'EA', label: 'EA', hint: 'Each' },
  { value: 'KGM', label: 'KG', hint: 'Kilogram' },
  { value: 'LTR', label: 'L', hint: 'Litre' },
  { value: 'BX', label: 'BX', hint: 'Box' },
  { value: 'PK', label: 'PK', hint: 'Pack' },
  { value: 'HUR', label: 'HR', hint: 'Hour' },
  { value: 'DAY', label: 'DAY', hint: 'Day' },
  { value: 'MTR', label: 'M', hint: 'Metre' },
]

export const PAYMENT_TERMS_OPTIONS: SelectOption[] = [
  { value: 'NET0', label: 'Due on receipt', hint: '0 days' },
  { value: 'NET7', label: 'Net 7 days', hint: '7 days' },
  { value: 'NET14', label: 'Net 14 days', hint: '14 days' },
  { value: 'NET30', label: 'Net 30 days', hint: '30 days' },
  { value: 'NET45', label: 'Net 45 days', hint: '45 days' },
  { value: 'NET60', label: 'Net 60 days', hint: '60 days' },
]

/** Net days per term — the composer derives the due date from this (`INV-PD-005`). */
export const PAYMENT_TERM_DAYS: Record<string, number> = {
  NET0: 0,
  NET7: 7,
  NET14: 14,
  NET30: 30,
  NET45: 45,
  NET60: 60,
}

export const PAYMENT_METHOD_OPTIONS: SelectOption[] = [
  { value: '30', label: 'Bank transfer', hint: 'UNCL4461 · 30' },
  { value: '10', label: 'Cash', hint: 'UNCL4461 · 10' },
  { value: '20', label: 'Cheque', hint: 'UNCL4461 · 20' },
  { value: '48', label: 'Card payment', hint: 'UNCL4461 · 48' },
  { value: '68', label: 'Online payment', hint: 'UNCL4461 · 68' },
]

/**
 * OMR only for now — `INV-PD-006` is unresolved, so the module refuses any document currency
 * other than the tenant's tax currency. The others are listed but disabled to show why.
 */
export const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'OMR', label: 'OMR - Omani Rial', hint: '3 decimals' },
  {
    value: 'AED',
    label: 'AED - UAE Dirham',
    hint: 'Needs an exchange-rate policy',
    disabled: true,
  },
  { value: 'USD', label: 'USD - US Dollar', hint: 'Needs an exchange-rate policy', disabled: true },
  { value: 'EUR', label: 'EUR - Euro', hint: 'Needs an exchange-rate policy', disabled: true },
]

export const BRANCH_OPTIONS: SelectOption[] = [
  { value: 'MAIN', label: 'Al Bahja Coffee (Main)', hint: 'Way 3025, Al Khuwair' },
  { value: 'SEEB', label: 'Al Bahja Coffee (Seeb)', hint: 'Seeb Souq, Muscat' },
  { value: 'NIZWA', label: 'Al Bahja Coffee (Nizwa)', hint: 'Souq Street, Nizwa' },
]

/* ------------------------------------------------------------------ customers */

export type CustomerKind = 'business' | 'consumer' | 'government'

export type CatalogueCustomer = {
  id: string
  name: string
  kind: CustomerKind
  /** Empty for a consumer — a private individual legitimately has no tax scheme. */
  vat: string
  onPeppol: boolean
  defaultTerms: string
  defaultTaxCategory: string
  defaultBranch: string
  buyerReference?: string
  purchaseOrder?: string
}

export const CUSTOMERS: CatalogueCustomer[] = [
  {
    id: 'CUS-001',
    name: 'Muscat Grand Hotel LLC',
    kind: 'business',
    vat: 'VAT OM1100447102 · 0248:OM1100447102',
    onPeppol: true,
    defaultTerms: 'NET30',
    defaultTaxCategory: 'S5',
    defaultBranch: 'MAIN',
    purchaseOrder: 'PO-88213',
  },
  {
    id: 'CUS-002',
    name: 'Nizwa Souq Café',
    kind: 'business',
    vat: 'VAT OM1100338914 · 0248:OM1100338914',
    onPeppol: true,
    defaultTerms: 'NET14',
    defaultTaxCategory: 'S5',
    defaultBranch: 'NIZWA',
  },
  {
    id: 'CUS-003',
    name: 'Salalah Beach Resort',
    kind: 'business',
    vat: 'VAT OM1100562773 · 0248:OM1100562773',
    onPeppol: true,
    defaultTerms: 'NET30',
    defaultTaxCategory: 'S5',
    defaultBranch: 'MAIN',
  },
  {
    id: 'CUS-004',
    name: 'Bahla Fort Restaurant',
    kind: 'business',
    vat: 'VAT OM1100714208 · 0248:OM1100714208',
    onPeppol: false,
    defaultTerms: 'NET14',
    defaultTaxCategory: 'S5',
    defaultBranch: 'NIZWA',
  },
  {
    id: 'CUS-005',
    name: 'Sohar Grand Mall',
    kind: 'business',
    vat: 'VAT OM1100901556 · 0248:OM1100901556',
    onPeppol: true,
    defaultTerms: 'NET45',
    defaultTaxCategory: 'S5',
    defaultBranch: 'MAIN',
  },
  {
    id: 'CUS-006',
    name: 'Ministry of Heritage & Tourism',
    kind: 'government',
    vat: 'VAT OM1100000114 · 0248:OM1100000114',
    onPeppol: true,
    defaultTerms: 'NET60',
    defaultTaxCategory: 'S5',
    defaultBranch: 'MAIN',
    buyerReference: 'MHT-2026-COFFEE',
    purchaseOrder: 'MHT-PO-4471',
  },
  {
    id: 'CUS-007',
    name: 'Muscat Municipality',
    kind: 'government',
    vat: 'VAT OM1100000229 · 0248:OM1100000229',
    onPeppol: true,
    defaultTerms: 'NET60',
    defaultTaxCategory: 'S5',
    defaultBranch: 'MAIN',
    buyerReference: 'MM-PROC-8821',
  },
  {
    id: 'CUS-008',
    name: 'Aisha Al Balushi',
    kind: 'consumer',
    vat: '',
    onPeppol: false,
    defaultTerms: 'NET0',
    defaultTaxCategory: 'S5',
    defaultBranch: 'SEEB',
  },
  {
    id: 'CUS-009',
    name: 'Khalid Al Rashdi',
    kind: 'consumer',
    vat: '',
    onPeppol: false,
    defaultTerms: 'NET0',
    defaultTaxCategory: 'S5',
    defaultBranch: 'MAIN',
  },
]

export function customerOptions(kind: CustomerKind): SelectOption[] {
  return CUSTOMERS.filter((customer) => customer.kind === kind).map((customer) => ({
    value: customer.id,
    label: customer.name,
    hint: customer.vat || 'Private individual · no tax scheme',
    icon: CUSTOMER_KIND_ICON[customer.kind],
  }))
}

/* ------------------------------------------------------------------- products */

export type CatalogueProduct = {
  id: string
  name: string
  unitPrice: string
  unit: string
  taxCategory: string
}

export const PRODUCTS: CatalogueProduct[] = [
  { id: 'P-001', name: 'Cappuccino - Large', unitPrice: '1.800', unit: 'EA', taxCategory: 'S5' },
  {
    id: 'P-002',
    name: 'Coffee Beans 1kg - House Blend',
    unitPrice: '9.500',
    unit: 'KGM',
    taxCategory: 'S5',
  },
  {
    id: 'P-003',
    name: 'Green Beans - Yirgacheffe',
    unitPrice: '10.250',
    unit: 'KGM',
    taxCategory: 'S5',
  },
  {
    id: 'P-004',
    name: 'Roasting service - per batch',
    unitPrice: '4.200',
    unit: 'EA',
    taxCategory: 'S5',
  },
  {
    id: 'P-005',
    name: 'Takeaway cups - 500 pack',
    unitPrice: '22.800',
    unit: 'PK',
    taxCategory: 'S5',
  },
  {
    id: 'P-006',
    name: 'Barista training - per hour',
    unitPrice: '15.000',
    unit: 'HUR',
    taxCategory: 'S5',
  },
  { id: 'P-007', name: 'Delivery charge', unitPrice: '2.500', unit: 'EA', taxCategory: 'S5' },
]

export const PRODUCT_OPTIONS: SelectOption[] = PRODUCTS.map((product) => ({
  value: product.id,
  label: product.name,
  hint: `${product.unitPrice} per ${product.unit}`,
}))
