/**
 * The signed UBL (PINT-OM) document an archive record holds, read into what the document page
 * lays out (Figma 154:140005, "The signed XML, laid out so you can read it").
 *
 * The archive serves the XML itself (`artefacts.xml.href`), so the preview is drawn from the
 * actual signed bytes rather than from a second copy of the invoice: what a person reads here is
 * what was sent. Invoices and credit notes differ only in their line and quantity element names.
 */

export type ArchiveParty = {
  name: string | null
  vat: string | null
  endpoint: string | null
  address: string | null
}

export type ArchiveSheetLine = {
  item: string
  quantity: string | null
  unitCode: string | null
  price: string | null
  vatPercent: string | null
  amount: string | null
}

export type ArchiveSheet = {
  number: string | null
  typeCode: string | null
  issueDate: string | null
  dueDate: string | null
  currency: string | null
  uuid: string | null
  profile: string | null
  orderReference: string | null
  sender: ArchiveParty
  receiver: ArchiveParty
  lines: ArchiveSheetLine[]
  net: string | null
  vat: string | null
  /** The VAT rate when every line carries the same one ("VAT · 5%"). */
  vatPercent: string | null
  total: string | null
  isCredit: boolean
  /**
   * The invoice a credit or debit note corrects (`cac:BillingReference/cac:InvoiceDocumentReference`,
   * required on a credit note by PINT-OM IBR-032-OM): its number, issue date and UUID if given.
   */
  preceding: { number: string; issueDate: string | null; uuid: string | null } | null
}

const children = (parent: Element | Document, name: string): Element[] =>
  Array.from(parent.childNodes).filter(
    (node): node is Element => node.nodeType === 1 && (node as Element).localName === name,
  )

/** The first descendant along a path of local names (namespace prefixes ignored). */
function at(parent: Element | Document | null | undefined, ...path: string[]): Element | null {
  let current: Element | Document | null | undefined = parent
  for (const name of path) {
    if (!current) return null
    current = children(current, name)[0] ?? null
  }
  return (current as Element | null) ?? null
}

const text = (parent: Element | Document | null | undefined, ...path: string[]) =>
  at(parent, ...path)?.textContent?.trim() || null

function party(
  root: Element,
  role: 'AccountingSupplierParty' | 'AccountingCustomerParty',
): ArchiveParty {
  const node = at(root, role, 'Party')
  const endpoint = at(node, 'EndpointID')
  const scheme = endpoint?.getAttribute('schemeID')
  const endpointValue = endpoint?.textContent?.trim() || null
  const street = text(node, 'PostalAddress', 'StreetName')
  const city = text(node, 'PostalAddress', 'CityName')
  return {
    name: text(node, 'PartyLegalEntity', 'RegistrationName') ?? text(node, 'PartyName', 'Name'),
    vat: text(node, 'PartyTaxScheme', 'CompanyID'),
    endpoint: endpointValue ? (scheme ? `${scheme}:${endpointValue}` : endpointValue) : null,
    address: [street, city].filter(Boolean).join(', ') || null,
  }
}

/** Reads the signed document; `null` when the bytes are not a UBL invoice or credit note. */
export function readArchiveXml(xml: string): ArchiveSheet | null {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml')
  } catch {
    return null
  }
  const root = doc.documentElement
  if (!root || root.getElementsByTagName('parsererror').length > 0) return null
  const isCredit = root.localName === 'CreditNote'
  if (root.localName !== 'Invoice' && !isCredit) return null

  const lineName = isCredit ? 'CreditNoteLine' : 'InvoiceLine'
  const quantityName = isCredit ? 'CreditedQuantity' : 'InvoicedQuantity'
  const lines = children(root, lineName).map((line) => {
    const quantity = at(line, quantityName)
    return {
      item: text(line, 'Item', 'Name') ?? text(line, 'Item', 'Description') ?? '',
      quantity: quantity?.textContent?.trim() || null,
      unitCode: quantity?.getAttribute('unitCode') ?? null,
      price: text(line, 'Price', 'PriceAmount'),
      vatPercent: text(line, 'Item', 'ClassifiedTaxCategory', 'Percent'),
      amount: text(line, 'LineExtensionAmount'),
    }
  })
  const rates = [...new Set(lines.map((line) => line.vatPercent).filter(Boolean))]
  const reference = at(root, 'BillingReference', 'InvoiceDocumentReference')
  const precedingNumber = text(reference, 'ID')

  return {
    number: text(root, 'ID'),
    typeCode: text(root, isCredit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'),
    issueDate: text(root, 'IssueDate'),
    dueDate: text(root, 'DueDate') ?? text(root, 'PaymentMeans', 'PaymentDueDate'),
    currency: text(root, 'DocumentCurrencyCode'),
    uuid: text(root, 'UUID'),
    profile: text(root, 'CustomizationID'),
    orderReference: text(root, 'OrderReference', 'ID'),
    sender: party(root, 'AccountingSupplierParty'),
    receiver: party(root, 'AccountingCustomerParty'),
    lines,
    net:
      text(root, 'LegalMonetaryTotal', 'TaxExclusiveAmount') ??
      text(root, 'LegalMonetaryTotal', 'LineExtensionAmount'),
    vat: text(root, 'TaxTotal', 'TaxAmount'),
    vatPercent: rates.length === 1 ? (rates[0] as string) : null,
    total:
      text(root, 'LegalMonetaryTotal', 'PayableAmount') ??
      text(root, 'LegalMonetaryTotal', 'TaxInclusiveAmount'),
    isCredit,
    preceding: precedingNumber
      ? {
          number: precedingNumber,
          issueDate: text(reference, 'IssueDate'),
          uuid: text(reference, 'UUID'),
        }
      : null,
  }
}

/** "urn:peppol:pint:billing-1@om-1" reads as "PINT-OM"; anything else is shown as given. */
export function profileLabel(customizationId: string | null): string | null {
  if (!customizationId) return null
  return /pint.*@om/i.test(customizationId) ? 'PINT-OM' : customizationId
}
