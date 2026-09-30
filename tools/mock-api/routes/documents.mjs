/**
 * Compliance › Documents (E-07): the archive list and record, and the artefacts they point at. The
 * upload page's supplier search and filing are `suppliers.mjs`'s and `supplierRecord.mjs`'s.
 * Shapes follow `src/api/compliance/archive.ts` (snake_case, as on the wire) including the optional fields the
 * design needs and the backend does not answer yet (backend asks 3.1 to 3.12), so the screens can
 * be seen as drawn.
 *
 * The signed XML is served as `{ status, raw, headers }`: `server.mjs` writes `raw` as the literal
 * response body, so the viewer gets the XML itself rather than a JSON wrapper.
 */

const BY_ID = new Map()
const art = (available, href = null, byte_size = null, verified = null, languages) => ({
  available,
  href,
  byte_size,
  verified,
  ...(languages !== undefined ? { languages } : {}),
})

/** UNCL1001 codes by `document_kind` when a fixture does not name its own (backend ask 3.17). */
const TYPE_CODE = {
  STANDARD_INVOICE: '380',
  CREDIT_NOTE: '381',
  SELF_BILLING_INVOICE: '389',
  SELF_BILLING_CREDIT_NOTE: '261',
}
const KB = 1024

function record(input) {
  const sub = `sub-${input.number.toLowerCase()}`
  const a = input.artefacts
  const item = {
    invoice_uuid: input.uuid,
    direction: input.direction,
    document_kind: input.kind ?? 'STANDARD_INVOICE',
    invoice_number: input.number,
    type_code: input.typeCode ?? TYPE_CODE[input.kind ?? 'STANDARD_INVOICE'],
    // The document's own issue date; a received one reached us later (backend ask 3.18).
    issue_date: input.issued ?? input.at.slice(0, 10),
    counterparty: input.counterparty,
    counterparty_name: input.name,
    occurred_at: input.at,
    tax_year: Number(input.at.slice(0, 4)),
    b2c: false,
    tdd: { status: input.tdd ?? null, ack: input.tdd === 'ACCEPTED' ? 'AB' : 'NONE' },
    total_amount: input.total,
    currency: 'OMR',
    against_number: input.against ?? null,
    against_issue_date: input.againstIssued ?? null,
    against_uuid: input.againstUuid ?? null,
    artefacts: {
      xml: art(
        a.includes('xml'),
        `/api/v1/invoices/${sub}/document`,
        input.sizes?.xml ?? 18 * KB,
        true,
      ),
      tdd: art(a.includes('tdd'), `/api/v1/invoices/${sub}/tdd`, input.sizes?.tdd ?? 6 * KB, true),
      pdf: art(
        a.includes('pdf'),
        `/api/v1/invoices/${sub}/pdf`,
        input.sizes?.pdf ?? 142 * KB,
        true,
        // Our own PDFs are bilingual; a supplier's PDF is theirs and its languages are not read.
        input.direction === 'ISSUED' ? ['en', 'ar'] : null,
      ),
      qr: art(a.includes('qr'), `/api/v1/invoices/${sub}/qr`, 4 * KB, true),
      mls: art(a.includes('mls'), `/api/v1/compliance/activity/${input.uuid}`, 3 * KB, true),
      mls_count: a.includes('mls') ? 2 : 0,
      delivery_notification: art(a.includes('mdn'), null, 2 * KB, true),
    },
    retention: {
      retention_class: input.retention ?? 'STANDARD',
      retain_until: input.until,
      under_retention: true,
      legal_hold: input.hold
        ? { held: true, reason: input.hold, set_by: 'u-hafidh', set_at: '2026-08-02T06:10:00Z' }
        : { held: false, reason: null, set_by: null, set_at: null },
      frozen: true,
    },
    links: {
      self: `/api/v1/compliance/documents/${input.uuid}`,
      activity: `/api/v1/compliance/activity/${input.uuid}`,
    },
    integrity: {
      sha256: 'a3f9c1e08b7d2465fe0c9a17b3d48e527c61af90d2e8b4137a05c9fe6428db31',
      taken_at: input.at,
      last_checked_at: '2026-09-25T04:02:00Z',
      matches: true,
    },
    delivered_at: input.at,
    signature_valid: input.signature === undefined ? true : input.signature,
    validation:
      input.tdd === 'ACCEPTED'
        ? { passed: 5, total: 5 }
        : input.tdd === 'REJECTED'
          ? { passed: 3, total: 5 }
          : null,
    related: input.related ?? null,
    tags: input.tags ?? [],
    access_log: input.log ?? null,
  }
  BY_ID.set(item.invoice_uuid, item)
  return item
}

const ITEMS = [
  record({
    uuid: '8f3c44a1-9d02-477b-be21-0a6c5d19e0f1',
    number: 'INV-2038',
    direction: 'ISSUED',
    counterparty: '0248:OM1100392847',
    name: 'Nizwa Souq Café',
    at: '2026-06-23T05:14:00Z',
    total: 318.78,
    tdd: 'ACCEPTED',
    until: '2036-06-23',
    artefacts: ['xml', 'tdd', 'pdf', 'qr', 'mls'],
    tags: ['Q2 2026', 'Wholesale'],
    related: [
      {
        kind: 'CUSTOMER',
        id: 'c-nizwa-souq',
        label: 'Nizwa Souq Café',
        note: 'Customer · 14 invoices on file',
      },
      { kind: 'ORDER', id: 'so-0073', label: 'SO-0073', note: 'Standing weekly order' },
      {
        kind: 'DELIVERY_NOTE',
        id: 'dn-0124',
        label: 'DN-0124',
        note: 'Delivery note · signed 27 Jun',
      },
    ],
    log: [
      {
        actor_name: 'Hafidh Saif',
        action: 'OPENED',
        artefact: null,
        at: '2026-09-25T04:02:00Z',
        channel: 'web',
      },
      {
        actor_name: null,
        action: 'SHARED_LINK_OPENED',
        artefact: null,
        at: '2026-07-28T07:40:00Z',
        channel: 'sent to the accountant · link expired',
      },
      {
        actor_name: 'Yusuf Al Balushi',
        action: 'DOWNLOADED',
        artefact: 'the PDF',
        at: '2026-06-27T10:11:00Z',
        channel: 'web',
      },
      {
        actor_name: null,
        action: 'FILED',
        artefact: null,
        at: '2026-06-23T05:14:00Z',
        channel: null,
      },
    ],
  }),
  record({
    uuid: '1b2e0c77-4f11-4c52-9a1d-3e5f0b8c2d41',
    number: 'INV-1842',
    direction: 'ISSUED',
    counterparty: '0248:OM1100477120',
    name: 'Muscat Grand Properties',
    at: '2026-02-11T06:30:00Z',
    total: 24500,
    tdd: 'ACCEPTED',
    retention: 'REAL_ESTATE',
    until: '2041-02-11',
    hold: 'OTA audit of Q1 2026',
    artefacts: ['xml', 'tdd', 'pdf', 'qr'],
  }),
  record({
    uuid: '5c9d2e10-7a33-4b8e-8f02-6d1a4c7e9b53',
    number: 'MR-INV-8821',
    direction: 'RECEIVED',
    counterparty: '0248:OM1100581904',
    name: 'Muscat Roastery Co',
    at: '2026-07-29T08:05:00Z',
    issued: '2026-07-27',
    total: 2354.31,
    tdd: 'ACCEPTED',
    until: '2036-07-29',
    artefacts: ['xml', 'tdd', 'pdf', 'mdn'],
  }),
  record({
    uuid: '7e4a1f28-2b66-4d90-a7c3-9f0e2b5d6a18',
    number: 'AND-CN-0442',
    kind: 'CREDIT_NOTE',
    direction: 'RECEIVED',
    counterparty: '0248:OM1100690233',
    name: 'Al Noor Dates LLC',
    at: '2026-07-30T09:20:00Z',
    total: 84.9,
    issued: '2026-07-29',
    against: 'AND-INV-3382',
    againstIssued: '2026-07-02',
    // A supplier's credit note: its signature has not been checked yet.
    signature: null,
    tdd: 'ACCEPTED',
    until: '2036-07-30',
    artefacts: ['xml', 'tdd', 'pdf'],
  }),
  record({
    uuid: '3d6b8a55-0c21-4e7f-b914-2a8c6e0d4f97',
    number: 'CN-0107',
    kind: 'CREDIT_NOTE',
    direction: 'ISSUED',
    counterparty: '0248:OM1100392847',
    name: 'Nizwa Souq Café',
    at: '2026-09-04T07:45:00Z',
    total: 42.5,
    against: 'INV-2038',
    againstIssued: '2026-06-23',
    againstUuid: '8f3c44a1-9d02-477b-be21-0a6c5d19e0f1',
    tdd: 'PENDING',
    until: '2036-09-04',
    artefacts: ['xml', 'pdf'],
  }),
  record({
    uuid: '4b7e2d19-6a58-4c03-9e61-8d2f5a1c7b40',
    number: 'DN-0031',
    typeCode: '383',
    direction: 'ISSUED',
    counterparty: '0248:OM1100581904',
    name: 'Muscat Roastery Co',
    at: '2026-09-12T06:20:00Z',
    total: 36.75,
    against: 'INV-1993',
    againstIssued: '2026-06-08',
    againstUuid: '9a0f3c62-5e84-4b17-8d26-1c7b9e3a0f25',
    tdd: 'SUBMITTED',
    until: '2036-09-12',
    artefacts: ['xml', 'tdd', 'pdf', 'qr'],
  }),
  record({
    uuid: '9a0f3c62-5e84-4b17-8d26-1c7b9e3a0f25',
    number: 'INV-1993',
    direction: 'ISSUED',
    counterparty: '0248:OM1100733518',
    name: 'Barka Beach Resort',
    at: '2026-06-08T06:00:00Z',
    total: 1842,
    tdd: 'REJECTED',
    until: '2036-06-08',
    artefacts: ['xml', 'tdd', 'pdf', 'qr'],
  }),
]

const EMPTY = process.env.DOCUMENTS_EMPTY === '1'

function list(query) {
  const direction = query.get('direction')
  const kind = query.get('document_kind')
  const number = (query.get('invoice_number') ?? '').toLowerCase()
  const status = query.get('tdd_status')
  const rows = EMPTY
    ? []
    : ITEMS.filter(
        (item) =>
          (!direction || item.direction === direction) &&
          (!kind || item.document_kind === kind) &&
          (!status || item.tdd.status === status) &&
          (!number || item.invoice_number.toLowerCase().includes(number)),
      )
  const files = ITEMS.reduce(
    (sum, item) =>
      sum +
      ['xml', 'tdd', 'pdf', 'qr', 'mls', 'delivery_notification'].filter(
        (id) => item.artefacts[id].available,
      ).length,
    0,
  )
  return {
    items: rows,
    page: Number(query.get('page') ?? 0),
    page_size: Number(query.get('page_size') ?? 20),
    has_more: false,
    summary: EMPTY
      ? {
          documents: 0,
          invoices_and_bills: 0,
          bytes_used: 0,
          quota_bytes: 10 * 1024 ** 3,
          integrity: null,
          legal_hold: { count: 0, reason: null },
        }
      : {
          documents: files,
          invoices_and_bills: ITEMS.length,
          bytes_used: Math.round(2.8 * 1024 ** 3),
          quota_bytes: 10 * 1024 ** 3,
          integrity: { all_passing: true, last_sweep_at: '2026-09-24T22:00:00Z' },
          legal_hold: {
            count: ITEMS.filter((item) => item.retention.legal_hold.held).length,
            reason: 'OTA audit of Q1 2026',
          },
        },
    totals: EMPTY
      ? { all: 0, issued: 0, received: 0, legal_hold: 0 }
      : {
          all: ITEMS.length,
          issued: ITEMS.filter((item) => item.direction === 'ISSUED').length,
          received: ITEMS.filter((item) => item.direction === 'RECEIVED').length,
          legal_hold: ITEMS.filter((item) => item.retention.legal_hold.held).length,
        },
  }
}

const XML_2038 = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:peppol:pint:billing-1@om-1</cbc:CustomizationID>
  <cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID>
  <cbc:ID>INV-2038</cbc:ID>
  <cbc:UUID>8f3c44a1-9d02-77be</cbc:UUID>
  <cbc:IssueDate>2026-06-23</cbc:IssueDate>
  <cbc:DueDate>2026-07-23</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>OMR</cbc:DocumentCurrencyCode>
  <cac:OrderReference><cbc:ID>NSC-PO-4471</cbc:ID></cac:OrderReference>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0248">OM1100392000</cbc:EndpointID>
    <cac:PostalAddress><cbc:StreetName>Souq Street</cbc:StreetName><cbc:CityName>Nizwa</cbc:CityName></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>OM1100392000</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Al Bahja Coffee LLC</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0248">OM1100392847</cbc:EndpointID>
    <cac:PartyTaxScheme><cbc:CompanyID>OM1100392847</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Nizwa Souq Café LLC</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="OMR">15.180</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="OMR">303.600</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="OMR">303.600</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="OMR">318.780</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="OMR">318.780</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="KGM">24</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="OMR">228.000</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Green beans, House Blend</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>5</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="OMR">9.500</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:InvoiceLine>
    <cbc:ID>2</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">18</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="OMR">75.600</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Roasting service, per batch</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>5</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="OMR">4.200</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>
`

/** Our own company, the supplier on what we issue and the customer on what we receive. */
const OURS = {
  endpoint: 'OM1100392000',
  name: 'Al Bahja Coffee LLC',
  address:
    '<cac:PostalAddress><cbc:StreetName>Souq Street</cbc:StreetName><cbc:CityName>Nizwa</cbc:CityName></cac:PostalAddress>',
}

const party = (tag, { endpoint, name, address = '' }) =>
  `<cac:${tag}><cac:Party>
    <cbc:EndpointID schemeID="0248">${endpoint}</cbc:EndpointID>${address ? `\n    ${address}` : ''}
    <cac:PartyTaxScheme><cbc:CompanyID>${endpoint}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${name}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:${tag}>`

const SUPPLIER_BLOCK = /<cac:AccountingSupplierParty>[\s\S]*?<\/cac:AccountingSupplierParty>/
const CUSTOMER_BLOCK = /<cac:AccountingCustomerParty>[\s\S]*?<\/cac:AccountingCustomerParty>/

/**
 * The document XML for `sub-<number>`. On a RECEIVED document the counterparty is the seller
 * (AccountingSupplierParty) and our company the buyer (AccountingCustomerParty); on an issued one
 * it is the other way round.
 */
function documentXml(sub) {
  const number = sub.slice(4).toUpperCase()
  let xml = XML_2038.replace(/INV-2038/g, number)
  const item = ITEMS.find((entry) => entry.invoice_number.toUpperCase() === number)
  if (item) xml = xml.replace(/<cbc:IssueDate>[^<]*</, `<cbc:IssueDate>${item.issue_date}<`)
  if (item?.against_number) {
    // PINT-OM IBR-032-OM: a credit note names the invoice it corrects.
    const reference = `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${item.against_number}</cbc:ID>${item.against_issue_date ? `<cbc:IssueDate>${item.against_issue_date}</cbc:IssueDate>` : ''}</cac:InvoiceDocumentReference></cac:BillingReference>`
    xml = xml.replace('</cac:OrderReference>', `</cac:OrderReference>\n  ${reference}`)
  }
  if (item?.document_kind === 'CREDIT_NOTE') {
    xml = xml
      .replace(
        /<Invoice xmlns="[^"]*Invoice-2"/,
        '<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"',
      )
      .replace('</Invoice>', '</CreditNote>')
      .replace(
        /<cbc:InvoiceTypeCode>380<\/cbc:InvoiceTypeCode>/,
        '<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>',
      )
      .replace(/InvoiceLine>/g, 'CreditNoteLine>')
      .replace(/InvoicedQuantity/g, 'CreditedQuantity')
  } else if (item?.type_code && item.type_code !== '380') {
    xml = xml.replace('<cbc:InvoiceTypeCode>380<', `<cbc:InvoiceTypeCode>${item.type_code}<`)
  }
  if (!item || item.direction !== 'RECEIVED') return xml
  const them = { endpoint: item.counterparty.replace(/^0248:/, ''), name: item.counterparty_name }
  return xml
    .replace(SUPPLIER_BLOCK, party('AccountingSupplierParty', them))
    .replace(CUSTOMER_BLOCK, party('AccountingCustomerParty', OURS))
}

export default [
  { match: '/api/v1/compliance/documents', reply: ({ query }) => list(query) },
  {
    match: /^\/api\/v1\/compliance\/documents\/([^/]+)$/,
    reply: ({ params }) =>
      BY_ID.get(params[0]) ?? {
        status: 404,
        body: { type: 'https://api.fawtir.om/problems/resource-not-found', status: 404 },
      },
  },
  {
    match: /^\/api\/v1\/invoices\/(sub-[^/]+)\/(document|tdd)$/,
    reply: ({ params }) => ({
      status: 200,
      raw:
        params[1] === 'document'
          ? documentXml(params[0])
          : `<?xml version="1.0"?>\n<TaxDataDocument id="${params[0].slice(4).toUpperCase()}">\n  <Status>ACCEPTED</Status>\n</TaxDataDocument>\n`,
      headers: { 'Content-Type': 'application/xml' },
    }),
  },
]
