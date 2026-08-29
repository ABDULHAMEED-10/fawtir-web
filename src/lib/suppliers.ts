/**
 * Suppliers — Contacts › Suppliers (Figma 117:31875).
 *
 * Everyone who bills us. The business is corner 4 of Oman's 5-corner Peppol model here, so
 * invoices arrive *from* the supplier and money flows out — which is why terms, bank details and
 * Peppol status lead the record rather than credit limits.
 *
 * Figma prints its head-count and its tab counts separately and they disagree (68 suppliers with
 * "61 active", against an Active tab reading 48). Here one population is stated and every card,
 * tab and total is counted off it, so the two can't drift apart.
 */

/** Business or government — the two kinds the onboarding form asks about. */
export type SupplierKind = 'business' | 'government'

/** How bills reach us from this supplier. */
export type SupplierChannel = 'peppol' | 'emailPdf' | 'paper'

/** What, if anything, is wrong with the record. */
export type RecordIssue =
  'complete' | 'bankChanged' | 'noBankDetails' | 'noVatNumber' | 'notOnPeppol' | 'switchedOff'

export type SupplierRow = {
  id: string
  slug: string
  name: string
  initials: string
  /** VAT registration, or absent when they have never given us one. */
  vat?: string
  channel: SupplierChannel
  /** The Peppol participant ID, present only for suppliers on the network. */
  peppolId?: string
  channelNoteKey: string
  termsKey: string
  termsNoteKey: string
  /** What we owe them right now, as a plain number so totals can be added up. */
  owed: number
  /** How many of their bills are still open. */
  openBills: number
  owedNoteKey: string
  /** Whether the owed line is a warning (late, disputed). */
  owedAlert?: boolean
  issue: RecordIssue
  /** Out of four — the filled dots in the "their record" column. */
  score: number
  recordNoteKey: string
  active: boolean
  /** When they were switched off, for the rows that were. */
  switchedOffOn?: string
}

/** The action offered on each row follows from what is wrong with it. */
export const ROW_ACTION: Record<RecordIssue, string> = {
  complete: 'suppliersPage.rowAction.newBill',
  bankChanged: 'suppliersPage.rowAction.checkIt',
  noBankDetails: 'suppliersPage.rowAction.addIt',
  noVatNumber: 'suppliersPage.rowAction.addIt',
  notOnPeppol: 'suppliersPage.rowAction.chaseIt',
  switchedOff: 'suppliersPage.rowAction.turnBackOn',
}

/** The six the design draws in full. */
const FEATURED: SupplierRow[] = [
  {
    id: 'muscat-roastery',
    slug: 'muscat-roastery',
    name: 'Muscat Roastery Co',
    initials: 'MR',
    vat: 'OM1100447102',
    channel: 'peppol',
    peppolId: '0248:OM1100447102',
    channelNoteKey: '',
    termsKey: 'suppliersPage.terms.net30',
    termsNoteKey: 'suppliersPage.termsNote.earlySettlement',
    owed: 2759.1,
    openBills: 2,
    owedNoteKey: 'suppliersPage.owedNote.bothApproved',
    issue: 'complete',
    score: 4,
    recordNoteKey: 'suppliersPage.recordNote.elevenOnTime',
    active: true,
  },
  {
    id: 'gulf-cold',
    slug: 'gulf-cold-logistics',
    name: 'Gulf Cold Logistics',
    initials: 'GC',
    vat: 'OM1100554027',
    channel: 'peppol',
    peppolId: '0248:OM1100554027',
    channelNoteKey: '',
    termsKey: 'suppliersPage.terms.net30',
    termsNoteKey: 'suppliersPage.termsNote.rateCard',
    owed: 699.9,
    openBills: 1,
    owedNoteKey: 'suppliersPage.owedNote.onHold',
    owedAlert: true,
    issue: 'bankChanged',
    score: 3,
    recordNoteKey: 'suppliersPage.recordNote.confirmBeforeRun',
    active: true,
  },
  {
    id: 'sohar-packaging',
    slug: 'sohar-packaging',
    name: 'Sohar Packaging LLC',
    initials: 'SP',
    vat: 'OM1100628391',
    channel: 'peppol',
    peppolId: '',
    channelNoteKey: 'suppliersPage.channelNote.selfBilled',
    termsKey: 'suppliersPage.terms.net10',
    termsNoteKey: 'suppliersPage.termsNote.agreementTo',
    owed: 3140,
    openBills: 1,
    owedNoteKey: 'suppliersPage.owedNote.dueInFour',
    issue: 'complete',
    score: 4,
    recordNoteKey: 'suppliersPage.recordNote.nineOfTen',
    active: true,
  },
  {
    id: 'nizwa-hardware',
    slug: 'nizwa-hardware',
    name: 'Nizwa Hardware Store',
    initials: 'NH',
    channel: 'paper',
    channelNoteKey: 'suppliersPage.channelNote.receiptsScanned',
    termsKey: 'suppliersPage.terms.onReceipt',
    termsNoteKey: 'suppliersPage.termsNote.usuallyCash',
    owed: 191.72,
    openBills: 1,
    owedNoteKey: 'suppliersPage.owedNote.twoDaysLate',
    owedAlert: true,
    issue: 'noVatNumber',
    score: 2,
    recordNoteKey: 'suppliersPage.recordNote.cantReclaim',
    active: true,
  },
  {
    id: 'al-bahja-properties',
    slug: 'al-bahja-properties',
    name: 'Al Bahja Properties',
    initials: 'AB',
    vat: 'OM1100201477',
    channel: 'emailPdf',
    channelNoteKey: 'suppliersPage.channelNote.substituteId',
    termsKey: 'suppliersPage.terms.fifthOfMonth',
    termsNoteKey: 'suppliersPage.termsNote.monthlyRecurring',
    owed: 0,
    openBills: 0,
    owedNoteKey: 'suppliersPage.owedNote.notArrived',
    issue: 'notOnPeppol',
    score: 4,
    recordNoteKey: 'suppliersPage.recordNote.askingWouldSave',
    active: true,
  },
  {
    id: 'muttrah-roasters',
    slug: 'muttrah-roasters',
    name: 'Muttrah Roasters',
    initials: 'MZ',
    channel: 'emailPdf',
    channelNoteKey: 'suppliersPage.channelNote.noLongerTrading',
    termsKey: 'suppliersPage.terms.net30',
    termsNoteKey: '',
    owed: 0,
    openBills: 0,
    owedNoteKey: 'suppliersPage.owedNote.settledInFull',
    issue: 'switchedOff',
    score: 0,
    recordNoteKey: 'suppliersPage.recordNote.stillSearchable',
    active: false,
    switchedOffOn: '12 Apr 2026',
  },
]

/**
 * The rest of the book.
 *
 * Figma shows six rows above a head-count of 68, so the other sixty-two are filled in here to
 * the exact shape those cards describe — 61 active, 44 on Peppol, 6 records needing a fix, and
 * 18 open bills across 9 suppliers. Without them the tabs would count six things and the cards
 * would claim sixty-eight.
 */
const FILLER_NAMES = [
  'Al Noor Dates LLC',
  'Mazoon Electricity',
  'Salalah Spice House',
  'Barka Glass Works',
  'Ibri Motors',
  'Seeb Stationery',
  'Duqm Steel',
  'Rustaq Textiles',
  'Sur Marine Supplies',
  'Bahla Pottery',
  'Ibra Dairy',
  'Khasab Cold Store',
  'Adam Agro',
  'Bidbid Bakery',
  'Samail Fruits',
  'Nakhal Water',
  'Quriyat Fisheries',
  'Jalan Furniture',
  'Shinas Cement',
  'Liwa Plastics',
  'Sohar Aluminium',
  'Falaj Print House',
  'Ghala Couriers',
  'Wadi Kabir Garage',
  'Athaiba Signs',
  'Qurum Cleaning',
  'Amerat Landscaping',
  'Ruwi Electricals',
  'Darsait Hardware',
  'Wattayah Tyres',
  'Azaiba Uniforms',
  'Bausher Security',
  'Misfah Honey',
  'Jabal Akhdar Farms',
  'Sinaw Livestock',
  'Buraimi Traders',
  'Yanqul Minerals',
  'Dhank Gravel',
  'Hamra Guides',
  'Manah Poultry',
  'Izki Olive Press',
  'Fanja Bricks',
  'Sumail Gypsum',
  'Halban Feeds',
  'Mabelah Packaging',
  'Seeb Signage',
  'Maabilah Coffee',
  'Ansab Recycling',
  'Rusayl Tooling',
  'Ghubrah Interiors',
  'Shatti Linens',
  'Madinat Catering',
  'Muttrah Souq Traders',
  'Sidab Boats',
  'Yiti Sands',
  'Bandar Jissah Resort',
  'Wadi Adai Motors',
  'Hail Al Awamir Transport',
  'Mawaleh Vegetables',
  'Barka Poultry',
  'Suwaiq Nets',
  'Musannah Timber',
]

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/**
 * Amounts for the eight further suppliers we owe, chosen so the whole book comes to the
 * 11,247.880 the "You owe them" card prints, across the 18 bills it counts.
 */
const OWED_FILLER: { owed: number; bills: number }[] = [
  { owed: 1_284.5, bills: 3 },
  { owed: 962.34, bills: 3 },
  { owed: 845.0, bills: 3 },
  { owed: 810.226, bills: 2 },
  { owed: 555.094, bills: 2 },
]

const FILLER: SupplierRow[] = FILLER_NAMES.map((name, index) => {
  // 7 switched off in total, one of which is featured, so six more here — taken from the tail.
  const switchedOff = index >= FILLER_NAMES.length - 6
  // Records needing a fix: 3 with no bank details, 2 missing VAT, 1 changed account. One
  // changed-account and one missing-VAT are already featured, so four more are needed here.
  const issue: RecordIssue = switchedOff
    ? 'switchedOff'
    : index < 3
      ? 'noBankDetails'
      : index === 3
        ? 'noVatNumber'
        : index < 19
          ? 'notOnPeppol'
          : 'complete'
  const owedEntry = OWED_FILLER[index] as { owed: number; bills: number } | undefined
  const onPeppol = !switchedOff && issue !== 'notOnPeppol'

  return {
    id: slugOf(name),
    slug: slugOf(name),
    name,
    initials: initialsOf(name),
    vat: issue === 'noVatNumber' ? undefined : `OM11${String(200000 + index * 137).slice(0, 8)}`,
    channel: onPeppol ? 'peppol' : index % 2 === 0 ? 'emailPdf' : 'paper',
    peppolId: onPeppol ? `0248:OM11${String(200000 + index * 137).slice(0, 8)}` : undefined,
    channelNoteKey: '',
    termsKey: 'suppliersPage.terms.net30',
    termsNoteKey: '',
    owed: owedEntry?.owed ?? 0,
    openBills: owedEntry?.bills ?? 0,
    owedNoteKey: owedEntry ? 'suppliersPage.owedNote.open' : 'suppliersPage.owedNote.settledInFull',
    issue,
    score: issue === 'switchedOff' ? 0 : issue === 'complete' ? 4 : issue === 'noVatNumber' ? 2 : 3,
    recordNoteKey: '',
    active: !switchedOff,
  }
})

export const SUPPLIERS: SupplierRow[] = [...FEATURED, ...FILLER]

/* ------------------------------------------------------------------ derived */

const round3 = (value: number) => Math.round(value * 1000) / 1000

export const formatOmr = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

const active = SUPPLIERS.filter((s) => s.active)
const switchedOff = SUPPLIERS.filter((s) => !s.active)
const onPeppol = active.filter((s) => s.channel === 'peppol')
const notOnPeppol = active.filter((s) => s.channel !== 'peppol')
const needsFix = SUPPLIERS.filter(
  (s) => s.issue === 'noBankDetails' || s.issue === 'noVatNumber' || s.issue === 'bankChanged',
)
const owedTo = SUPPLIERS.filter((s) => s.owed > 0)

export const SUPPLIER_SUMMARY = {
  total: SUPPLIERS.length,
  active: active.length,
  switchedOff: switchedOff.length,
  onPeppol: onPeppol.length,
  notOnPeppol: notOnPeppol.length,
  owedTotal: round3(owedTo.reduce((sum, s) => sum + s.owed, 0)),
  owedSuppliers: owedTo.length,
  openBills: owedTo.reduce((sum, s) => sum + s.openBills, 0),
  needsFix: needsFix.length,
  noBankDetails: needsFix.filter((s) => s.issue === 'noBankDetails').length,
  missingVat: needsFix.filter((s) => s.issue === 'noVatNumber').length,
  changedAccount: needsFix.filter((s) => s.issue === 'bankChanged').length,
}

/* --------------------------------------------------------------------- tabs */

export type SupplierTabId = 'all' | 'active' | 'needsFix' | 'youOwe' | 'notOnPeppol' | 'switchedOff'

export const SUPPLIER_TABS: { id: SupplierTabId; labelKey: string }[] = [
  { id: 'all', labelKey: 'suppliersPage.tabs.all' },
  { id: 'active', labelKey: 'suppliersPage.tabs.active' },
  { id: 'needsFix', labelKey: 'suppliersPage.tabs.needsFix' },
  { id: 'youOwe', labelKey: 'suppliersPage.tabs.youOwe' },
  { id: 'notOnPeppol', labelKey: 'suppliersPage.tabs.notOnPeppol' },
  { id: 'switchedOff', labelKey: 'suppliersPage.tabs.switchedOff' },
]

export const matchesTab = (supplier: SupplierRow, tab: SupplierTabId) => {
  switch (tab) {
    case 'all':
      return true
    case 'active':
      return supplier.active
    case 'needsFix':
      return (
        supplier.issue === 'noBankDetails' ||
        supplier.issue === 'noVatNumber' ||
        supplier.issue === 'bankChanged'
      )
    case 'youOwe':
      return supplier.owed > 0
    case 'notOnPeppol':
      return supplier.active && supplier.channel !== 'peppol'
    case 'switchedOff':
      return !supplier.active
  }
}

export const countTab = (tab: SupplierTabId) =>
  SUPPLIERS.filter((supplier) => matchesTab(supplier, tab)).length

/* ------------------------------------------------------------------- sorting */

export type SupplierSortKey = 'natural' | 'owedDesc' | 'owedAsc' | 'nameAsc'

export const SUPPLIER_SORTS: { value: SupplierSortKey; labelKey: string }[] = [
  { value: 'natural', labelKey: 'recurringBills.sortOptions.natural' },
  { value: 'owedDesc', labelKey: 'suppliersPage.sortOptions.owedDesc' },
  { value: 'owedAsc', labelKey: 'suppliersPage.sortOptions.owedAsc' },
  { value: 'nameAsc', labelKey: 'suppliersPage.sortOptions.nameAsc' },
]

/** The row menu (Figma 117:35273) — two sections, each item with its own explanation. */
export const ROW_MENU_SECTIONS = [
  {
    id: 'workWithThem',
    items: ['newPurchaseOrder', 'recordBill', 'payNow'] as const,
  },
  {
    id: 'theirRecord',
    items: ['attachDocument', 'exportStatement', 'copyToNew', 'switchOff'] as const,
  },
]
