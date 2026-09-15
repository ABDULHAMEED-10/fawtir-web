/**
 * The field catalogue a tenant maps its ERP onto — `GET /peppol/mapping-targets`, as the backend
 * describes it (ERP_MAPPING_SPEC-2026-09-11 §3, §7; docs/erp-and-console-plan.md Appendix A).
 *
 * Every row is one PINT-OM business term. The wizard renders this list and nothing else — never a
 * hard-coded set of fields — so when the backend's catalogue grows the screen follows. Until the
 * endpoint is wired, this file *is* the catalogue: the terms, their sections, what the rule says
 * about them, and who supplies them.
 *
 * `origin`: only TENANT_MAPPED terms can be mapped. PLATFORM_SUPPLIED ones Fawtir configures
 * (the Peppol identifiers, the document UUID); DERIVED ones the mapper computes (issue time,
 * the tax breakdown). Both are shown read-only as "Fawtir supplies this".
 *
 * `requirement`: MANDATORY on every PINT-OM invoice, CONDITIONAL under the stated condition, or
 * OPTIONAL. Readiness counts only MANDATORY + TENANT_MAPPED.
 */

export type Section = 'document' | 'seller' | 'buyer' | 'tax' | 'lines' | 'payment' | 'totals'
export type Requirement = 'MANDATORY' | 'CONDITIONAL' | 'OPTIONAL'
export type Origin = 'TENANT_MAPPED' | 'PLATFORM_SUPPLIED' | 'DERIVED'

export type CodeListId =
  | 'VAT_CATEGORY'
  | 'VAT_EXEMPTION_REASON'
  | 'VAT_ZERO_RATING_REASON'
  | 'INVOICE_TYPE'
  | 'PAYMENT_MEANS'
  | 'UNIT_OF_MEASURE'
  | 'CURRENCY'
  | 'COUNTRY'
  | 'EAS'
  | 'PARTY_ID_SCHEME_NAME'
  | 'NOTE_REASON'
  | 'GOODS_SERVICES'
  | 'COUNTRY_SUBDIVISION'
  | 'INCOTERMS'
  | 'SERVICE_TYPE'
  | 'PROFIT_MARGIN_ITEM'

export type Target = {
  /** `IBT-001`, `BTOM-004`, `IBT-049-1`. */
  id: string
  name: string
  nameAr: string
  section: Section
  requirement: Requirement
  /** For CONDITIONAL terms, the condition in plain words — `erp.condition.*`. */
  conditionKey?: string
  origin: Origin
  canonicalPath: string
  ublPath: string
  repeatable: boolean
  /** The list a value map on this target is validated against. */
  codeList?: CodeListId
  /** The PINT-OM rule that governs it, for the helper copy. */
  ruleId?: string
  /** Helper copy under the row — `erp.help.*`. */
  helpKey?: string
  /** A "lookup" rather than a list: HS codes, ISIC. Checked for shape only. */
  lookup?: 'HS' | 'ISIC'
  /** Pairs like buyer identifier / buyer VATIN — either satisfies the requirement. */
  eitherOf?: string
}

const t = (
  id: string,
  name: string,
  nameAr: string,
  section: Section,
  requirement: Requirement,
  canonicalPath: string,
  ublPath: string,
  extra: Partial<Target> = {},
): Target => ({
  id,
  name,
  nameAr,
  section,
  requirement,
  origin: 'TENANT_MAPPED',
  canonicalPath,
  ublPath,
  repeatable: section === 'lines',
  ...extra,
})

export const SECTIONS: Section[] = [
  'document',
  'seller',
  'buyer',
  'tax',
  'lines',
  'payment',
  'totals',
]

export const TARGETS: Target[] = [
  /* 15.1 Document */
  t(
    'IBT-024',
    'Specification identifier',
    'معرّف المواصفة',
    'document',
    'MANDATORY',
    'specification.customizationId',
    'cbc:CustomizationID',
    { origin: 'PLATFORM_SUPPLIED', ruleId: 'ALIGNED-IBRP-001-OM' },
  ),
  t(
    'IBT-023',
    'Business process',
    'العملية التجارية',
    'document',
    'MANDATORY',
    'specification.profileId',
    'cbc:ProfileID',
    { origin: 'PLATFORM_SUPPLIED', ruleId: 'ALIGNED-IBRP-002-OM' },
  ),
  t(
    'IBT-001',
    'Invoice number',
    'رقم الفاتورة',
    'document',
    'MANDATORY',
    'document.number',
    'cbc:ID',
    { ruleId: 'ibr-002', helpKey: 'erp.help.invoiceNumber' },
  ),
  t(
    'BTOM-002',
    'Invoice UUID',
    'المعرّف الفريد للفاتورة',
    'document',
    'MANDATORY',
    'document.uuid',
    'cbc:UUID',
    { origin: 'PLATFORM_SUPPLIED', ruleId: 'IBR-002-OM' },
  ),
  t(
    'IBT-002',
    'Issue date',
    'تاريخ الإصدار',
    'document',
    'MANDATORY',
    'document.issueDate',
    'cbc:IssueDate',
    { ruleId: 'ibr-073', helpKey: 'erp.help.date' },
  ),
  t(
    'IBT-168',
    'Issue time',
    'وقت الإصدار',
    'document',
    'MANDATORY',
    'document.issueTime',
    'cbc:IssueTime',
    { origin: 'DERIVED', ruleId: 'ALIGNED-IBRP-016-OM' },
  ),
  t(
    'IBT-003',
    'Invoice type code',
    'رمز نوع الفاتورة',
    'document',
    'MANDATORY',
    'document.typeCode',
    'cbc:InvoiceTypeCode',
    { codeList: 'INVOICE_TYPE', ruleId: 'ibr-cl-01' },
  ),
  t(
    'BTOM-001',
    'Transaction type',
    'نوع المعاملة',
    'document',
    'MANDATORY',
    'document.transactionType',
    'cbc:InvoiceTypeCode/@name',
    {
      origin: 'PLATFORM_SUPPLIED',
      ruleId: 'ALIGNED-IBRP-000-OM',
      helpKey: 'erp.help.transactionType',
    },
  ),
  t(
    'IBT-005',
    'Invoice currency',
    'عملة الفاتورة',
    'document',
    'MANDATORY',
    'document.currency',
    'cbc:DocumentCurrencyCode',
    { codeList: 'CURRENCY', ruleId: 'ibr-cl-04', helpKey: 'erp.help.currency' },
  ),
  t(
    'IBT-009',
    'Payment due date',
    'تاريخ استحقاق الدفع',
    'document',
    'OPTIONAL',
    'document.dueDate',
    'cbc:DueDate',
    { helpKey: 'erp.help.date' },
  ),
  t(
    'IBT-010',
    'Buyer reference',
    'مرجع المشتري',
    'document',
    'OPTIONAL',
    'document.buyerReference',
    'cbc:BuyerReference',
  ),
  t(
    'IBT-013',
    'Purchase order reference',
    'مرجع أمر الشراء',
    'document',
    'OPTIONAL',
    'document.orderReference',
    'cac:OrderReference/cbc:ID',
  ),
  t('IBT-022', 'Note', 'ملاحظة', 'document', 'OPTIONAL', 'document.note', 'cbc:Note'),
  t(
    'IBT-025',
    'Preceding invoice number',
    'رقم الفاتورة السابقة',
    'document',
    'CONDITIONAL',
    'document.preceding.number',
    'cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID',
    { conditionKey: 'erp.condition.creditOrDebit', ruleId: 'IBR-032-OM' },
  ),
  t(
    'IBT-026',
    'Preceding invoice date',
    'تاريخ الفاتورة السابقة',
    'document',
    'CONDITIONAL',
    'document.preceding.issueDate',
    'cac:BillingReference/cac:InvoiceDocumentReference/cbc:IssueDate',
    { conditionKey: 'erp.condition.creditOrDebit', ruleId: 'IBR-032-OM', helpKey: 'erp.help.date' },
  ),
  t(
    'BTOM-031',
    'Preceding invoice UUID',
    'المعرّف الفريد للفاتورة السابقة',
    'document',
    'CONDITIONAL',
    'document.preceding.uuid',
    'cac:BillingReference/cac:InvoiceDocumentReference/cbc:UUID',
    { conditionKey: 'erp.condition.creditOrDebit', ruleId: 'IBR-032-OM' },
  ),
  t(
    'BTOM-032',
    'Credit or debit note reason',
    'سبب الإشعار الدائن أو المدين',
    'document',
    'CONDITIONAL',
    'document.noteReason',
    'cac:BillingReference/cbc:ReasonCode',
    { conditionKey: 'erp.condition.creditOrDebit', codeList: 'NOTE_REASON', ruleId: 'IBR-023-OM' },
  ),

  /* 15.2 Seller */
  t(
    'IBT-034',
    'Seller electronic address',
    'العنوان الإلكتروني للبائع',
    'seller',
    'MANDATORY',
    'supplier.endpoint.id',
    'cac:AccountingSupplierParty/cac:Party/cbc:EndpointID',
    { origin: 'PLATFORM_SUPPLIED', ruleId: 'ibr-081' },
  ),
  t(
    'IBT-034-1',
    'Seller electronic address scheme',
    'مخطط العنوان الإلكتروني للبائع',
    'seller',
    'MANDATORY',
    'supplier.endpoint.scheme',
    'cac:AccountingSupplierParty/cac:Party/cbc:EndpointID/@schemeID',
    { origin: 'PLATFORM_SUPPLIED', ruleId: 'ibr-cl-25' },
  ),
  t(
    'IBT-027',
    'Seller name',
    'اسم البائع',
    'seller',
    'MANDATORY',
    'supplier.party.legalName',
    'cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName',
    { ruleId: 'ibr-006' },
  ),
  t(
    'IBT-028',
    'Seller trading name',
    'الاسم التجاري للبائع',
    'seller',
    'OPTIONAL',
    'supplier.party.tradingName',
    'cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name',
    { ruleId: 'ibr-099' },
  ),
  t(
    'IBT-029',
    'Seller identifier',
    'معرّف البائع',
    'seller',
    'CONDITIONAL',
    'supplier.party.partyIdentifications[].value',
    'cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID',
    { conditionKey: 'erp.condition.specialTransactions', ruleId: 'IBR-007-OM' },
  ),
  t(
    'BTOM-015',
    'Seller identifier scheme',
    'مخطط معرّف البائع',
    'seller',
    'CONDITIONAL',
    'supplier.party.partyIdentifications[].scheme',
    'cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID/@schemeName',
    {
      conditionKey: 'erp.condition.specialTransactions',
      codeList: 'PARTY_ID_SCHEME_NAME',
      ruleId: 'CL-06-OM',
    },
  ),
  t(
    'IBT-030',
    'Seller legal registration id',
    'رقم السجل التجاري للبائع',
    'seller',
    'OPTIONAL',
    'supplier.party.companyId',
    'cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:CompanyID',
    { ruleId: 'ibr-100' },
  ),
  t(
    'IBT-031',
    'Seller VATIN',
    'الرقم الضريبي للبائع',
    'seller',
    'MANDATORY',
    'supplier.party.vatin',
    'cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID',
    { ruleId: 'IBR-003-OM', helpKey: 'erp.help.vatin' },
  ),
  t(
    'IBT-035',
    'Seller address line 1',
    'عنوان البائع، السطر 1',
    'seller',
    'MANDATORY',
    'supplier.party.postalAddress.line1',
    'cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cbc:StreetName',
    { ruleId: 'IBR-010-OM' },
  ),
  t(
    'IBT-036',
    'Seller address line 2',
    'عنوان البائع، السطر 2',
    'seller',
    'MANDATORY',
    'supplier.party.postalAddress.line2',
    'cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cbc:AdditionalStreetName',
    { ruleId: 'IBR-010-OM' },
  ),
  t(
    'IBT-162',
    'Seller address line 3',
    'عنوان البائع، السطر 3',
    'seller',
    'MANDATORY',
    'supplier.party.postalAddress.line3',
    'cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cac:AddressLine/cbc:Line',
    { ruleId: 'IBR-010-OM' },
  ),
  t(
    'IBT-037',
    'Seller city',
    'مدينة البائع',
    'seller',
    'MANDATORY',
    'supplier.party.postalAddress.city',
    'cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cbc:CityName',
    { ruleId: 'IBR-010-OM' },
  ),
  t(
    'IBT-038',
    'Seller postcode',
    'الرمز البريدي للبائع',
    'seller',
    'MANDATORY',
    'supplier.party.postalAddress.postalZone',
    'cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cbc:PostalZone',
    { ruleId: 'IBR-010-OM' },
  ),
  t(
    'IBT-040',
    'Seller country',
    'بلد البائع',
    'seller',
    'MANDATORY',
    'supplier.party.postalAddress.country',
    'cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cac:Country/cbc:IdentificationCode',
    { codeList: 'COUNTRY', ruleId: 'ibr-009' },
  ),
  t(
    'IBT-042',
    'Seller contact telephone',
    'هاتف البائع',
    'seller',
    'MANDATORY',
    'supplier.party.contact.telephone',
    'cac:AccountingSupplierParty/cac:Party/cac:Contact/cbc:Telephone',
    { ruleId: 'IBR-011-OM', helpKey: 'erp.help.sellerPhone' },
  ),
  t(
    'BTOM-004',
    'Seller UUID',
    'المعرّف الفريد للبائع',
    'seller',
    'MANDATORY',
    'supplier.uuid',
    'cac:AccountingSupplierParty/cac:Party/cbc:UUID',
    { origin: 'PLATFORM_SUPPLIED' },
  ),

  /* 15.3 Buyer */
  t(
    'IBT-049',
    'Buyer electronic address',
    'العنوان الإلكتروني للمشتري',
    'buyer',
    'MANDATORY',
    'customer.endpoint.id',
    'cac:AccountingCustomerParty/cac:Party/cbc:EndpointID',
    { ruleId: 'ibr-080', helpKey: 'erp.help.buyerEndpoint' },
  ),
  t(
    'IBT-049-1',
    'Buyer electronic address scheme',
    'مخطط العنوان الإلكتروني للمشتري',
    'buyer',
    'MANDATORY',
    'customer.endpoint.scheme',
    'cac:AccountingCustomerParty/cac:Party/cbc:EndpointID/@schemeID',
    { codeList: 'EAS', ruleId: 'ibr-cl-25' },
  ),
  t(
    'IBT-044',
    'Buyer name',
    'اسم المشتري',
    'buyer',
    'MANDATORY',
    'customer.party.legalName',
    'cac:AccountingCustomerParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName',
    { ruleId: 'ibr-007' },
  ),
  t(
    'IBT-045',
    'Buyer trading name',
    'الاسم التجاري للمشتري',
    'buyer',
    'OPTIONAL',
    'customer.party.tradingName',
    'cac:AccountingCustomerParty/cac:Party/cac:PartyName/cbc:Name',
    { ruleId: 'ibr-112' },
  ),
  t(
    'IBT-046',
    'Buyer identifier',
    'معرّف المشتري',
    'buyer',
    'CONDITIONAL',
    'customer.party.partyIdentifications[].value',
    'cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID',
    { conditionKey: 'erp.condition.buyerIdOrVatin', ruleId: 'IBR-016-OM', eitherOf: 'IBT-048' },
  ),
  t(
    'BTOM-018',
    'Buyer identifier scheme',
    'مخطط معرّف المشتري',
    'buyer',
    'CONDITIONAL',
    'customer.party.partyIdentifications[].scheme',
    'cac:AccountingCustomerParty/cac:Party/cac:PartyIdentification/cbc:ID/@schemeName',
    {
      conditionKey: 'erp.condition.withBuyerId',
      codeList: 'PARTY_ID_SCHEME_NAME',
      ruleId: 'CL-06-OM',
    },
  ),
  t(
    'IBT-047',
    'Buyer legal registration id',
    'رقم السجل التجاري للمشتري',
    'buyer',
    'OPTIONAL',
    'customer.party.companyId',
    'cac:AccountingCustomerParty/cac:Party/cac:PartyLegalEntity/cbc:CompanyID',
    { ruleId: 'ibr-103' },
  ),
  t(
    'IBT-048',
    'Buyer VATIN',
    'الرقم الضريبي للمشتري',
    'buyer',
    'CONDITIONAL',
    'customer.party.vatin',
    'cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID',
    {
      conditionKey: 'erp.condition.buyerIdOrVatin',
      ruleId: 'IBR-017-OM',
      helpKey: 'erp.help.vatin',
      eitherOf: 'IBT-046',
    },
  ),
  t(
    'IBT-050',
    'Buyer address line 1',
    'عنوان المشتري، السطر 1',
    'buyer',
    'CONDITIONAL',
    'customer.party.postalAddress.line1',
    'cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:StreetName',
    { conditionKey: 'erp.condition.notSimplified', ruleId: 'IBR-019-OM' },
  ),
  t(
    'IBT-051',
    'Buyer address line 2',
    'عنوان المشتري، السطر 2',
    'buyer',
    'CONDITIONAL',
    'customer.party.postalAddress.line2',
    'cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:AdditionalStreetName',
    { conditionKey: 'erp.condition.notSimplified', ruleId: 'IBR-019-OM' },
  ),
  t(
    'IBT-163',
    'Buyer address line 3',
    'عنوان المشتري، السطر 3',
    'buyer',
    'CONDITIONAL',
    'customer.party.postalAddress.line3',
    'cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cac:AddressLine/cbc:Line',
    { conditionKey: 'erp.condition.notSimplified', ruleId: 'IBR-019-OM' },
  ),
  t(
    'IBT-052',
    'Buyer city',
    'مدينة المشتري',
    'buyer',
    'CONDITIONAL',
    'customer.party.postalAddress.city',
    'cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:CityName',
    { conditionKey: 'erp.condition.notSimplified', ruleId: 'IBR-019-OM' },
  ),
  t(
    'IBT-053',
    'Buyer postcode',
    'الرمز البريدي للمشتري',
    'buyer',
    'CONDITIONAL',
    'customer.party.postalAddress.postalZone',
    'cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:PostalZone',
    { conditionKey: 'erp.condition.notSimplified', ruleId: 'IBR-019-OM' },
  ),
  t(
    'IBT-055',
    'Buyer country',
    'بلد المشتري',
    'buyer',
    'MANDATORY',
    'customer.party.postalAddress.country',
    'cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cac:Country/cbc:IdentificationCode',
    { codeList: 'COUNTRY', ruleId: 'ibr-011' },
  ),

  /* 15.4 Tax */
  t(
    'IBT-116',
    'Category taxable amount',
    'المبلغ الخاضع للضريبة للفئة',
    'tax',
    'MANDATORY',
    'taxBreakdown[].taxableAmount',
    'cac:TaxTotal/cac:TaxSubtotal/cbc:TaxableAmount',
    { origin: 'DERIVED', ruleId: 'ALIGNED-IBRP-045' },
  ),
  t(
    'IBT-117',
    'Category tax amount',
    'مبلغ الضريبة للفئة',
    'tax',
    'MANDATORY',
    'taxBreakdown[].taxAmount',
    'cac:TaxTotal/cac:TaxSubtotal/cbc:TaxAmount',
    { origin: 'DERIVED', ruleId: 'ALIGNED-IBRP-046' },
  ),
  t(
    'IBT-118',
    'VAT category code',
    'رمز فئة ضريبة القيمة المضافة',
    'tax',
    'MANDATORY',
    'taxBreakdown[].category',
    'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:ID',
    { codeList: 'VAT_CATEGORY', ruleId: 'CL-04-OM', helpKey: 'erp.help.vatCategory' },
  ),
  t(
    'IBT-119',
    'VAT category rate',
    'نسبة فئة ضريبة القيمة المضافة',
    'tax',
    'CONDITIONAL',
    'taxBreakdown[].rate',
    'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:Percent',
    { conditionKey: 'erp.condition.rateSZ', ruleId: 'IBR-046-OM', helpKey: 'erp.help.rate' },
  ),
  t(
    'IBT-121',
    'VAT exemption reason code',
    'رمز سبب الإعفاء الضريبي',
    'tax',
    'CONDITIONAL',
    'taxBreakdown[].exemptionReasonCode',
    'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReasonCode',
    {
      conditionKey: 'erp.condition.exemptOrZero',
      codeList: 'VAT_EXEMPTION_REASON',
      ruleId: 'IBR-069-OM',
      helpKey: 'erp.help.exemptionReason',
    },
  ),
  t(
    'IBT-120',
    'VAT exemption reason text',
    'نص سبب الإعفاء الضريبي',
    'tax',
    'OPTIONAL',
    'taxBreakdown[].exemptionReason',
    'cac:TaxTotal/cac:TaxSubtotal/cac:TaxCategory/cbc:TaxExemptionReason',
    { ruleId: 'ibr-sr-32' },
  ),

  /* 15.5 Lines */
  t(
    'IBT-126',
    'Line id',
    'معرّف السطر',
    'lines',
    'MANDATORY',
    'lines[].id',
    'cac:InvoiceLine/cbc:ID',
    { ruleId: 'ibr-021' },
  ),
  t(
    'IBT-129',
    'Quantity',
    'الكمية',
    'lines',
    'MANDATORY',
    'lines[].quantity',
    'cac:InvoiceLine/cbc:InvoicedQuantity',
    { ruleId: 'IBR-137-OM', helpKey: 'erp.help.positive' },
  ),
  t(
    'IBT-130',
    'Unit code',
    'رمز الوحدة',
    'lines',
    'MANDATORY',
    'lines[].unitCode',
    'cac:InvoiceLine/cbc:InvoicedQuantity/@unitCode',
    { codeList: 'UNIT_OF_MEASURE', ruleId: 'ibr-cl-23' },
  ),
  t(
    'IBT-131',
    'Line net amount',
    'صافي مبلغ السطر',
    'lines',
    'MANDATORY',
    'lines[].netAmount',
    'cac:InvoiceLine/cbc:LineExtensionAmount',
    { ruleId: 'IBR-071-OM', helpKey: 'erp.help.threeDecimals' },
  ),
  t(
    'IBT-146',
    'Item net price',
    'صافي سعر الصنف',
    'lines',
    'MANDATORY',
    'lines[].price.amount',
    'cac:InvoiceLine/cac:Price/cbc:PriceAmount',
    { ruleId: 'ibr-027', helpKey: 'erp.help.threeDecimals' },
  ),
  t(
    'IBT-149',
    'Item price base quantity',
    'الكمية الأساسية للسعر',
    'lines',
    'OPTIONAL',
    'lines[].price.baseQuantity',
    'cac:InvoiceLine/cac:Price/cbc:BaseQuantity',
    { ruleId: 'ibr-087' },
  ),
  t(
    'IBT-151',
    'Line VAT category',
    'فئة ضريبة السطر',
    'lines',
    'MANDATORY',
    'lines[].tax.category',
    'cac:InvoiceLine/cac:Item/cac:ClassifiedTaxCategory/cbc:ID',
    { codeList: 'VAT_CATEGORY', ruleId: 'IBR-076-OM', helpKey: 'erp.help.vatCategory' },
  ),
  t(
    'IBT-152',
    'Line VAT rate',
    'نسبة ضريبة السطر',
    'lines',
    'CONDITIONAL',
    'lines[].tax.rate',
    'cac:InvoiceLine/cac:Item/cac:ClassifiedTaxCategory/cbc:Percent',
    {
      conditionKey: 'erp.condition.rateSZ',
      ruleId: 'ALIGNED-IBRP-S-05-OM',
      helpKey: 'erp.help.rate',
    },
  ),
  t(
    'IBT-153',
    'Item name',
    'اسم الصنف',
    'lines',
    'MANDATORY',
    'lines[].item.name',
    'cac:InvoiceLine/cac:Item/cbc:Name',
    { ruleId: 'ibr-025' },
  ),
  t(
    'IBT-154',
    'Item description',
    'وصف الصنف',
    'lines',
    'OPTIONAL',
    'lines[].item.description',
    'cac:InvoiceLine/cac:Item/cbc:Description',
    { ruleId: 'ibr-sr-50' },
  ),
  t(
    'IBT-155',
    "Seller's item id",
    'معرّف الصنف لدى البائع',
    'lines',
    'OPTIONAL',
    'lines[].item.sellersId',
    'cac:InvoiceLine/cac:Item/cac:SellersItemIdentification/cbc:ID',
  ),
  t(
    'IBT-156',
    "Buyer's item id",
    'معرّف الصنف لدى المشتري',
    'lines',
    'OPTIONAL',
    'lines[].item.buyersId',
    'cac:InvoiceLine/cac:Item/cac:BuyersItemIdentification/cbc:ID',
  ),
  t(
    'IBT-157',
    'Standard item id',
    'المعرّف القياسي للصنف',
    'lines',
    'OPTIONAL',
    'lines[].item.standardId',
    'cac:InvoiceLine/cac:Item/cac:StandardItemIdentification/cbc:ID',
    { ruleId: 'ibr-064' },
  ),
  t(
    'BTOM-019',
    'Goods or services',
    'سلع أم خدمات',
    'lines',
    'CONDITIONAL',
    'lines[].item.goodsOrServices',
    'cac:InvoiceLine/cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode',
    {
      conditionKey: 'erp.condition.notSimplified',
      codeList: 'GOODS_SERVICES',
      ruleId: 'IBR-078-OM',
    },
  ),
  t(
    'BTOM-033',
    'ISIC code',
    'رمز ISIC',
    'lines',
    'CONDITIONAL',
    'lines[].item.isic',
    'cac:InvoiceLine/cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode[@listID="ISIC"]',
    {
      conditionKey: 'erp.condition.notSimplified',
      lookup: 'ISIC',
      ruleId: 'IBR-081-OM',
      helpKey: 'erp.help.isic',
    },
  ),
  t(
    'BTOM-016',
    'Line VAT amount',
    'مبلغ ضريبة السطر',
    'lines',
    'CONDITIONAL',
    'lines[].tax.amount',
    'cac:InvoiceLine/cac:TaxTotal/cbc:TaxAmount',
    {
      conditionKey: 'erp.condition.notSimplified',
      ruleId: 'IBR-038-OM',
      helpKey: 'erp.help.threeDecimals',
    },
  ),
  t(
    'BTOM-017',
    'Line total including VAT',
    'إجمالي السطر شاملًا الضريبة',
    'lines',
    'MANDATORY',
    'lines[].totalIncludingTax',
    'cac:InvoiceLine/cac:TaxTotal/cbc:RoundingAmount',
    { ruleId: 'IBR-158-OM', helpKey: 'erp.help.threeDecimals' },
  ),

  /* 15.6 Payment */
  t(
    'IBT-081',
    'Payment means code',
    'رمز وسيلة الدفع',
    'payment',
    'CONDITIONAL',
    'payment.meansCode',
    'cac:PaymentMeans/cbc:PaymentMeansCode',
    {
      conditionKey: 'erp.condition.withPaymentMeans',
      codeList: 'PAYMENT_MEANS',
      ruleId: 'ibr-049',
    },
  ),
  t(
    'IBT-083',
    'Remittance information',
    'معلومات التحويل',
    'payment',
    'OPTIONAL',
    'payment.remittance',
    'cac:PaymentMeans/cbc:PaymentID',
  ),
  t(
    'IBT-084',
    'Payment account identifier',
    'معرّف حساب الدفع',
    'payment',
    'OPTIONAL',
    'payment.account.id',
    'cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID',
  ),
  t(
    'IBT-020',
    'Payment terms',
    'شروط الدفع',
    'payment',
    'OPTIONAL',
    'payment.terms',
    'cac:PaymentTerms/cbc:Note',
    { ruleId: 'ibr-sr-05' },
  ),
  t(
    'IBT-059',
    'Payee name',
    'اسم المستفيد',
    'payment',
    'OPTIONAL',
    'payee.name',
    'cac:PayeeParty/cac:PartyName/cbc:Name',
  ),
  t(
    'IBT-060',
    'Payee identifier',
    'معرّف المستفيد',
    'payment',
    'OPTIONAL',
    'payee.id',
    'cac:PayeeParty/cac:PartyIdentification/cbc:ID',
  ),
  t(
    'IBT-061',
    'Payee legal registration id',
    'رقم السجل التجاري للمستفيد',
    'payment',
    'OPTIONAL',
    'payee.companyId',
    'cac:PayeeParty/cac:PartyLegalEntity/cbc:CompanyID',
  ),

  /* 15.7 Totals */
  t(
    'IBT-106',
    'Sum of line net amounts',
    'مجموع صافي السطور',
    'totals',
    'MANDATORY',
    'totals.lineExtension',
    'cac:LegalMonetaryTotal/cbc:LineExtensionAmount',
    { ruleId: 'ibr-co-10', helpKey: 'erp.help.twoDecimals' },
  ),
  t(
    'IBT-107',
    'Sum of allowances',
    'مجموع الخصومات',
    'totals',
    'CONDITIONAL',
    'totals.allowance',
    'cac:LegalMonetaryTotal/cbc:AllowanceTotalAmount',
    {
      conditionKey: 'erp.condition.withAllowances',
      ruleId: 'ibr-co-11',
      helpKey: 'erp.help.twoDecimals',
    },
  ),
  t(
    'IBT-108',
    'Sum of charges',
    'مجموع الرسوم',
    'totals',
    'CONDITIONAL',
    'totals.charge',
    'cac:LegalMonetaryTotal/cbc:ChargeTotalAmount',
    {
      conditionKey: 'erp.condition.withCharges',
      ruleId: 'ibr-co-12',
      helpKey: 'erp.help.twoDecimals',
    },
  ),
  t(
    'IBT-109',
    'Total without VAT',
    'الإجمالي دون الضريبة',
    'totals',
    'MANDATORY',
    'totals.taxExclusive',
    'cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount',
    { ruleId: 'ibr-co-13', helpKey: 'erp.help.twoDecimals' },
  ),
  t(
    'IBT-110',
    'Total VAT',
    'إجمالي الضريبة',
    'totals',
    'MANDATORY',
    'totals.tax',
    'cac:TaxTotal/cbc:TaxAmount',
    { ruleId: 'ibr-co-14', helpKey: 'erp.help.twoDecimals' },
  ),
  t(
    'IBT-112',
    'Total with VAT',
    'الإجمالي شاملًا الضريبة',
    'totals',
    'MANDATORY',
    'totals.taxInclusive',
    'cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount',
    { ruleId: 'ibr-co-15', helpKey: 'erp.help.twoDecimals' },
  ),
  t(
    'IBT-113',
    'Paid amount',
    'المبلغ المدفوع',
    'totals',
    'OPTIONAL',
    'totals.prepaid',
    'cac:LegalMonetaryTotal/cbc:PrepaidAmount',
    { ruleId: 'IBR-058-OM', helpKey: 'erp.help.prepaid' },
  ),
  t(
    'IBT-114',
    'Rounding amount',
    'مبلغ التقريب',
    'totals',
    'OPTIONAL',
    'totals.rounding',
    'cac:LegalMonetaryTotal/cbc:PayableRoundingAmount',
    { ruleId: 'ibr-co-16' },
  ),
  t(
    'IBT-115',
    'Amount due',
    'المبلغ المستحق',
    'totals',
    'MANDATORY',
    'totals.payable',
    'cac:LegalMonetaryTotal/cbc:PayableAmount',
    { ruleId: 'ibr-co-16', helpKey: 'erp.help.twoDecimals' },
  ),
]

export const TARGET_BY_ID: Record<string, Target> = Object.fromEntries(
  TARGETS.map((target) => [target.id, target]),
)

export const targetsIn = (section: Section) =>
  TARGETS.filter((target) => target.section === section)

/** What readiness counts: mandatory terms the tenant has to map. */
export const REQUIRED_TARGETS = TARGETS.filter(
  (target) => target.requirement === 'MANDATORY' && target.origin === 'TENANT_MAPPED',
)

export const MAPPABLE_TARGETS = TARGETS.filter((target) => target.origin === 'TENANT_MAPPED')

/**
 * The invoice kinds the guided path cannot express, because their terms are not in the catalogue.
 * Returned on every validation and shown beside every readiness indicator.
 */
export type CoverageLimit = {
  id: 'GOODS_CLASSIFICATION' | 'FOREIGN_CURRENCY' | 'INVOICING_PERIOD'
  businessTermIds: string[]
  ruleIds: string[]
}

export const COVERAGE_LIMITS: CoverageLimit[] = [
  {
    id: 'GOODS_CLASSIFICATION',
    businessTermIds: ['IBT-158'],
    ruleIds: ['IBR-079-OM', 'IBR-080-OM'],
  },
  {
    id: 'FOREIGN_CURRENCY',
    businessTermIds: ['BTOM-003', 'BTOM-028', 'BTOM-029', 'IBT-006', 'IBT-111'],
    ruleIds: ['IBR-004-OM', 'IBR-034-OM', 'IBR-065-OM'],
  },
  {
    id: 'INVOICING_PERIOD',
    businessTermIds: ['IBT-073', 'IBT-074', 'IBT-134', 'IBT-135'],
    ruleIds: ['IBR-037-OM', 'IBR-072-OM'],
  },
]

/**
 * The transforms the wizard offers as presets — plain JSONata on `$src`, stored like any other
 * transform. Each serves a rule.
 */
export const TRANSFORM_PRESETS = [
  {
    id: 'dateDmy',
    fragment: "$fromMillis($toMillis($src, '[D01]/[M01]/[Y0001]'), '[Y0001]-[M01]-[D01]')",
    ruleId: 'ibr-073',
  },
  {
    id: 'dateEpoch',
    fragment: "$fromMillis($number($src), '[Y0001]-[M01]-[D01]')",
    ruleId: 'ibr-073',
  },
  { id: 'trimUpper', fragment: '$uppercase($trim($src))', ruleId: 'IBR-003-OM' },
  { id: 'digitsOnly', fragment: '$join($match($src, /[0-9]/).match)', ruleId: 'IBR-080-OM' },
  { id: 'round3', fragment: '$round($number($src), 3)', ruleId: 'IBR-DEC-03-OM' },
  { id: 'round2', fragment: '$round($number($src), 2)', ruleId: 'ibr-121' },
  { id: 'abs', fragment: '$abs($number($src))', ruleId: 'IBR-137-OM' },
  { id: 'percentFromFraction', fragment: '$round($number($src) * 100, 2)', ruleId: 'IBR-046-OM' },
] as const

export type TransformPresetId = (typeof TRANSFORM_PRESETS)[number]['id']

/** The grammar a source path must follow — a dotted field walk, `[]` for a repeated element. */
export const SOURCE_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\[\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[\])?)*$/
export const SOURCE_PATH_MAX = 512
