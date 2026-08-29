/**
 * The technical record behind one activity event — Compliance › Activity › event.
 *
 * The list answers "what happened"; this answers "what exactly was sent, what exactly came back,
 * and what has already been tried". It is kept beside the feed rather than inside it because the
 * feed only needs a summary and this is the part an accountant forwards to the Tax Authority
 * when they argue about a rejection.
 */

import { ACTIVITY, type ActivityEvent, type Outcome } from './activity'

/** The wire details of a single send. */
export type Transmission = {
  /** Peppol message identifier, or the OTA submission reference. */
  messageId: string
  endpoint: string
  /** What the network sent back, when it sent anything. */
  responseCode?: string
  responseMessageKey?: string
  /** The field the Authority objected to, for rejections. */
  responseField?: string
  severity?: 'accepted' | 'rejected' | 'pending'
  /** Round trip, in milliseconds. */
  tookMs?: number
}

export const TRANSMISSIONS: Record<string, Transmission> = {
  e1: {
    messageId: 'ota-sub-2f81c4a9',
    endpoint: 'https://api.fawtara.om/v1/tax-documents',
    severity: 'pending',
  },
  e2: {
    messageId: 'c9f1a04e-8c2b-4f77-9a31-5d0e2b71a884',
    endpoint: 'accesspoint.fawtir.om → 0248:OM1100882140',
    responseCode: 'AP_DELIVERED',
    responseMessageKey: 'activityEvent.response.delivered',
    severity: 'accepted',
    tookMs: 820,
  },
  e3: {
    messageId: '5b31d7c0-1a49-4e02-b6f8-7c2049aa1e6d',
    endpoint: '0248:OM1100554027 → accesspoint.fawtir.om',
    responseCode: 'AP_RECEIVED',
    responseMessageKey: 'activityEvent.response.received',
    severity: 'accepted',
    tookMs: 640,
  },
  e4: {
    messageId: 'ota-sub-77b0e315',
    endpoint: 'https://api.fawtara.om/v1/tax-documents',
    responseCode: 'OTA-4102',
    responseMessageKey: 'activityEvent.response.buyerVatUnknown',
    responseField: 'AccountingCustomerParty/PartyTaxScheme/CompanyID',
    severity: 'rejected',
    tookMs: 1310,
  },
  e5: {
    messageId: 'ota-sub-1c40ba62',
    endpoint: 'https://api.fawtara.om/v1/tax-documents',
    responseCode: 'OTA-2000',
    responseMessageKey: 'activityEvent.response.accepted',
    severity: 'accepted',
    tookMs: 2140,
  },
  e6: {
    messageId: 'a1c8f204-6b93-4d51-8e77-2f0b9c3d5a11',
    endpoint: '0248:OM1100447102 → accesspoint.fawtir.om',
    responseCode: 'AP_RECEIVED',
    responseMessageKey: 'activityEvent.response.received',
    severity: 'accepted',
    tookMs: 710,
  },
  e7: {
    messageId: 'ota-sub-90ae43f1',
    endpoint: 'https://api.fawtara.om/v1/tax-documents',
    responseCode: 'OTA-2000',
    responseMessageKey: 'activityEvent.response.accepted',
    severity: 'accepted',
    tookMs: 3020,
  },
  e8: {
    messageId: 'd7420b19-3ce8-4a06-91b2-6ec5f8107d40',
    endpoint: 'accesspoint.fawtir.om → 0248:OM1100447301',
    responseCode: 'AP_DELIVERED',
    responseMessageKey: 'activityEvent.response.delivered',
    severity: 'accepted',
    tookMs: 905,
  },
  e9: {
    messageId: 'ota-sub-b52c7e08',
    endpoint: 'https://api.fawtara.om/v1/tax-documents',
    responseCode: 'OTA-2000',
    responseMessageKey: 'activityEvent.response.accepted',
    severity: 'accepted',
    tookMs: 1870,
  },
  e10: {
    messageId: 'ota-sub-4d19f7c3',
    endpoint: 'https://api.fawtara.om/v1/tax-documents',
    responseCode: 'OTA-4310',
    responseMessageKey: 'activityEvent.response.roundingMismatch',
    responseField: 'LegalMonetaryTotal/TaxInclusiveAmount',
    severity: 'rejected',
    tookMs: 1490,
  },
  e11: {
    messageId: 'f0b6c832-72a1-4de9-8c05-3b7419ea62d7',
    endpoint: 'accesspoint.fawtir.om → 0248:OM1100628391',
    responseCode: 'AP_DELIVERED',
    responseMessageKey: 'activityEvent.response.delivered',
    severity: 'accepted',
    tookMs: 760,
  },
  e12: {
    messageId: 'ota-sub-e83a1d04',
    endpoint: 'https://api.fawtara.om/v1/tax-documents',
    responseCode: 'OTA-2000',
    responseMessageKey: 'activityEvent.response.accepted',
    severity: 'accepted',
    tookMs: 4010,
  },
}

/** Every event this document has produced, oldest first — its whole journey. */
export function journeyFor(document: string): ActivityEvent[] {
  const order = ['yesterday', 'today']
  return ACTIVITY.filter((event) => event.document === document)
    .slice()
    .sort((a, b) => {
      const day = order.indexOf(a.day) - order.indexOf(b.day)
      return day !== 0 ? day : a.at.localeCompare(b.at)
    })
}

/** The attempts made at filing this document, for the retry panel. */
export function attemptsFor(document: string) {
  return journeyFor(document)
    .filter((event) => event.channel === 'ota')
    .map((event, index) => ({
      n: event.attempt ?? index + 1,
      event,
      outcome: event.outcome,
      transmission: TRANSMISSIONS[event.id],
    }))
}

export const findEvent = (id: string) => ACTIVITY.find((event) => event.id === id)

/** What the document is worth, for the side panel. */
export const DOCUMENT_AMOUNTS: Record<string, { net: string; vat: string; total: string }> = {
  'INV-2044': { net: '1,240.000', vat: '62.000', total: '1,302.000' },
  'INV-2043': { net: '880.000', vat: '44.000', total: '924.000' },
  'INV-2038': { net: '472.381', vat: '23.619', total: '496.000' },
  'SI-0912': { net: '18.400', vat: '0.920', total: '19.320' },
  'CN-0118': { net: '231.000', vat: '11.550', total: '242.550' },
  'DN-0091': { net: '91.905', vat: '4.595', total: '96.500' },
  'MR-INV-8821': { net: '2,242.200', vat: '112.110', total: '2,354.310' },
  'SB-0044': { net: '640.000', vat: '32.000', total: '672.000' },
}

/**
 * The document as it went on the wire.
 *
 * Built from the same facts the rest of the screen shows rather than pasted in, so the payload
 * can never disagree with the amounts and identifiers printed beside it. It is PINT-OM shaped —
 * UBL 2.1 with the Oman customisation and the `0248` scheme Peppol uses for Omani VAT numbers.
 */
export function buildUbl(event: ActivityEvent) {
  const amounts = DOCUMENT_AMOUNTS[event.document] ?? {
    net: '0.000',
    vat: '0.000',
    total: '0.000',
  }
  const plain = (value: string) => value.replace(/,/g, '')
  const isCredit = event.documentKind === 'creditNote'
  const isDebit = event.documentKind === 'debitNote'
  const root = isCredit ? 'CreditNote' : isDebit ? 'DebitNote' : 'Invoice'
  // 380 invoice, 381 credit note, 383 debit note — the UN/CEFACT codes PINT-OM expects.
  const typeCode = isCredit ? '381' : isDebit ? '383' : '380'
  const supplier = event.direction === 'outbound' ? 'Al Bahja Coffee LLC' : event.party
  const supplierVat = event.direction === 'outbound' ? 'OM1100392000' : 'OM1100447102'
  const customer = event.direction === 'outbound' ? event.party : 'Al Bahja Coffee LLC'
  const customerVat = event.direction === 'outbound' ? 'OM1100882140' : 'OM1100392000'

  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:peppol:pint:billing-1@om-1</cbc:CustomizationID>
  <cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID>
  <cbc:ID>${event.document}</cbc:ID>
  <cbc:IssueDate>2026-07-30</cbc:IssueDate>
  <cbc:${root}TypeCode>${typeCode}</cbc:${root}TypeCode>
  <cbc:DocumentCurrencyCode>OMR</cbc:DocumentCurrencyCode>

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0248">${supplierVat}</cbc:EndpointID>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${supplier}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${supplierVat}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0248">${customerVat}</cbc:EndpointID>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${customer}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${customerVat}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="OMR">${plain(amounts.vat)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="OMR">${plain(amounts.net)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="OMR">${plain(amounts.vat)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>5.00</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="OMR">${plain(amounts.net)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="OMR">${plain(amounts.net)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="OMR">${plain(amounts.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="OMR">${plain(amounts.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</${root}>`
}

/** The tone each outcome is drawn in, shared by the banner and the journey rail. */
export const OUTCOME_TONE: Record<Outcome, { bg: string; border: string; text: string }> = {
  cleared: { bg: 'bg-[#eef5f0]', border: 'border-[#cfe0d5]', text: 'text-[#2f4438]' },
  waiting: { bg: 'bg-pending-100', border: 'border-pending-200', text: 'text-pending-700' },
  attention: { bg: 'bg-[#fdf4f2]', border: 'border-[#f0d4ce]', text: 'text-warning-700' },
  failed: {
    bg: 'bg-surface-background',
    border: 'border-border-subtle',
    text: 'text-text-tertiary',
  },
}
