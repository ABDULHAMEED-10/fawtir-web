import type { CodeListId } from './erpCatalogue'

/**
 * The code lists a value map's right-hand side is picked from — `GET /settings/erp-mapping/
 * code-lists` (ERP_MAPPING_SPEC §7.3). The backend reads them from the PINT-OM 1.0.1 rules
 * artefact so an upgrade cannot leave the pickers stale; until it is wired these are the same
 * lists typed in.
 *
 * The long lists (units, currencies, countries, EAS) are shown here with the codes an Omani
 * business meets; the backend serves them whole. HS and ISIC are lookups, not lists.
 */

export type CodeValue = { code: string; name?: string; nameAr?: string; hint?: string }

export type CodeList = {
  id: CodeListId
  authority: string
  ruleId: string
  /** How many the full list holds — the backend's, not this excerpt. */
  size: number
  values: CodeValue[]
}

const v = (code: string, name?: string, nameAr?: string, hint?: string): CodeValue => ({
  code,
  name,
  nameAr,
  hint,
})

export const CODE_LISTS: Record<CodeListId, CodeList> = {
  VAT_CATEGORY: {
    id: 'VAT_CATEGORY',
    authority: 'Tax Authority Oman',
    ruleId: 'CL-04-OM',
    size: 4,
    values: [
      v('S', 'Standard rate', 'النسبة الأساسية', 'Rate must be 5'),
      v('E', 'Exempt', 'معفى', 'No rate; needs an exemption reason (VATEX-OM-…)'),
      v('O', 'Not subject to VAT', 'غير خاضع', 'No rate, no reason code'),
      v('Z', 'Zero-rated', 'نسبة صفرية', 'Rate 0; needs a zero-rating reason (VATZR-OM-…)'),
    ],
  },
  VAT_EXEMPTION_REASON: {
    id: 'VAT_EXEMPTION_REASON',
    authority: 'Tax Authority Oman',
    ruleId: 'CL-05-OM',
    size: 12,
    values: Array.from({ length: 12 }, (_, i) => v(`VATEX-OM-${String(i + 1).padStart(2, '0')}`)),
  },
  VAT_ZERO_RATING_REASON: {
    id: 'VAT_ZERO_RATING_REASON',
    authority: 'Tax Authority Oman',
    ruleId: 'CL-10-OM',
    size: 16,
    values: Array.from({ length: 16 }, (_, i) => v(`VATZR-OM-${String(i + 1).padStart(2, '0')}`)),
  },
  INVOICE_TYPE: {
    id: 'INVOICE_TYPE',
    authority: 'UNCL1001 (PINT subset)',
    ruleId: 'ibr-cl-01',
    size: 32,
    values: [
      v('380', 'Commercial invoice', 'فاتورة تجارية'),
      v('381', 'Credit note', 'إشعار دائن'),
      v('383', 'Debit note', 'إشعار مدين'),
      v('386', 'Prepayment invoice', 'فاتورة دفعة مقدمة'),
      v('388', 'Tax invoice', 'فاتورة ضريبية'),
      v('389', 'Self-billed invoice', 'فاتورة ذاتية', 'Self-billing ruleset only'),
      v('261', 'Self-billed credit note', 'إشعار دائن ذاتي', 'Self-billing ruleset only'),
      v('393', 'Factored invoice'),
      v('395', 'Consignment invoice'),
      v('575', "Insurer's invoice"),
      v('623', "Forwarder's invoice"),
      v('780', 'Freight invoice'),
      v('80', 'Debit note related to goods or services'),
      v('82', 'Metered services invoice'),
      v('84', 'Debit note related to financial adjustments'),
      v('81', 'Credit note related to goods or services'),
      v('83', 'Credit note related to financial adjustments'),
      v('396', 'Factored credit note'),
      v('532', "Forwarder's credit note"),
    ],
  },
  PAYMENT_MEANS: {
    id: 'PAYMENT_MEANS',
    authority: 'UNCL4461',
    ruleId: 'ibr-cl-16',
    size: 92,
    values: [
      v('10', 'In cash', 'نقدًا'),
      v('20', 'Cheque', 'شيك'),
      v('30', 'Credit transfer', 'تحويل ائتماني'),
      v('31', 'Debit transfer'),
      v('42', 'Payment to bank account', 'دفع إلى حساب بنكي'),
      v('48', 'Bank card', 'بطاقة بنكية'),
      v('49', 'Direct debit', 'خصم مباشر'),
      v('54', 'Credit card', 'بطاقة ائتمان'),
      v('55', 'Debit card', 'بطاقة خصم'),
      v('58', 'SEPA credit transfer'),
      v('68', 'Online payment service', 'خدمة دفع إلكتروني'),
      v('97', 'Clearing between partners'),
      v('ZZZ', 'Mutually defined', 'متفق عليه'),
    ],
  },
  UNIT_OF_MEASURE: {
    id: 'UNIT_OF_MEASURE',
    authority: 'UN/ECE Recommendation 20 + 21',
    ruleId: 'ibr-cl-23',
    size: 2_000,
    values: [
      v('C62', 'One (unit)', 'وحدة'),
      v('EA', 'Each', 'قطعة'),
      v('H87', 'Piece', 'حبة'),
      v('KGM', 'Kilogram', 'كيلوغرام'),
      v('GRM', 'Gram', 'غرام'),
      v('TNE', 'Tonne', 'طن'),
      v('LTR', 'Litre', 'لتر'),
      v('MLT', 'Millilitre', 'مليلتر'),
      v('MTR', 'Metre', 'متر'),
      v('CMT', 'Centimetre', 'سنتيمتر'),
      v('MTK', 'Square metre', 'متر مربع'),
      v('MTQ', 'Cubic metre', 'متر مكعب'),
      v('HUR', 'Hour', 'ساعة'),
      v('DAY', 'Day', 'يوم'),
      v('MON', 'Month', 'شهر'),
      v('ANN', 'Year', 'سنة'),
      v('SET', 'Set', 'طقم'),
      v('PR', 'Pair', 'زوج'),
      v('DZN', 'Dozen', 'دزينة'),
      // Rec 21 package codes: PINT-OM takes them only with the X prefix (ibr-cl-23).
      v('XBX', 'Box', 'صندوق'),
      v('XCT', 'Carton', 'كرتون'),
      v('XBG', 'Bag', 'كيس'),
      v('XPK', 'Pack', 'عبوة'),
      v('XBO', 'Bottle', 'زجاجة'),
      v('XCA', 'Can', 'علبة'),
      v('XRO', 'Roll', 'لفة'),
      v('XSA', 'Sack', 'جوال'),
      v('XPX', 'Pallet', 'منصة نقالة'),
    ],
  },
  CURRENCY: {
    id: 'CURRENCY',
    authority: 'ISO 4217',
    ruleId: 'ibr-cl-04',
    size: 180,
    values: [
      v('OMR', 'Omani rial', 'ريال عماني', 'The only currency the guided path can express'),
      v('AED', 'UAE dirham', 'درهم إماراتي'),
      v('SAR', 'Saudi riyal', 'ريال سعودي'),
      v('QAR', 'Qatari riyal', 'ريال قطري'),
      v('KWD', 'Kuwaiti dinar', 'دينار كويتي'),
      v('BHD', 'Bahraini dinar', 'دينار بحريني'),
      v('USD', 'US dollar', 'دولار أمريكي'),
      v('EUR', 'Euro', 'يورو'),
      v('GBP', 'Pound sterling', 'جنيه إسترليني'),
      v('INR', 'Indian rupee', 'روبية هندية'),
      v('PKR', 'Pakistani rupee', 'روبية باكستانية'),
      v('CNY', 'Chinese yuan', 'يوان صيني'),
      v('JPY', 'Japanese yen', 'ين ياباني'),
    ],
  },
  COUNTRY: {
    id: 'COUNTRY',
    authority: 'ISO 3166-1 alpha-2',
    ruleId: 'ibr-cl-14',
    size: 250,
    values: [
      v('OM', 'Oman', 'عُمان'),
      v('AE', 'United Arab Emirates', 'الإمارات'),
      v('SA', 'Saudi Arabia', 'السعودية'),
      v('QA', 'Qatar', 'قطر'),
      v('KW', 'Kuwait', 'الكويت'),
      v('BH', 'Bahrain', 'البحرين'),
      v('IN', 'India', 'الهند'),
      v('PK', 'Pakistan', 'باكستان'),
      v('EG', 'Egypt', 'مصر'),
      v('JO', 'Jordan', 'الأردن'),
      v('GB', 'United Kingdom', 'المملكة المتحدة'),
      v('US', 'United States', 'الولايات المتحدة'),
      v('DE', 'Germany', 'ألمانيا'),
      v('CN', 'China', 'الصين'),
      v('TR', 'Türkiye', 'تركيا'),
    ],
  },
  EAS: {
    id: 'EAS',
    authority: 'CEF EAS (as shipped in the rules jar)',
    ruleId: 'ibr-cl-25',
    size: 90,
    values: [
      v('0248', 'Oman VATIN', 'الرقم الضريبي العماني', 'The scheme Omani participants use'),
      v('0242', 'Oman SPIS', 'نظام SPIS العماني'),
      v('0088', 'GS1 GLN'),
      v('0208', 'Belgian CBE'),
      v('0184', 'Danish CVR'),
      v('0192', 'Norwegian organisation number'),
      v('0007', 'Swedish organisation number'),
      v('9925', 'Belgian VAT'),
      v('9930', 'German VAT'),
      v('9932', 'UK VAT'),
      v('9944', 'Dutch VAT'),
      v('0151', 'Australian ABN'),
    ],
  },
  PARTY_ID_SCHEME_NAME: {
    id: 'PARTY_ID_SCHEME_NAME',
    authority: 'Tax Authority Oman',
    ruleId: 'CL-06-OM',
    size: 7,
    values: [
      v('CR', 'Commercial registration', 'سجل تجاري'),
      v('TIN', 'Tax identification number', 'رقم تعريف ضريبي'),
      v('CID', 'Civil ID', 'بطاقة مدنية'),
      v('PASNUM', 'Passport number', 'رقم جواز سفر'),
      v('OTHID', 'Other identifier', 'معرّف آخر'),
      v('ICID', 'Investment card', 'بطاقة استثمار'),
      v('SZLN', 'Special zone licence', 'رخصة منطقة خاصة'),
    ],
  },
  NOTE_REASON: {
    id: 'NOTE_REASON',
    authority: 'Tax Authority Oman',
    ruleId: 'CL-02-OM',
    size: 5,
    values: [
      v('CAN', 'Cancellation', 'إلغاء'),
      v('VAT', 'VAT correction', 'تصحيح ضريبي'),
      v('VAL', 'Value correction', 'تصحيح قيمة'),
      v('QTY', 'Quantity correction', 'تصحيح كمية'),
      v('OTH', 'Other', 'أخرى'),
    ],
  },
  GOODS_SERVICES: {
    id: 'GOODS_SERVICES',
    authority: 'Tax Authority Oman',
    ruleId: 'CL-07-OM',
    size: 2,
    values: [
      v('G', 'Goods', 'سلع', 'Goods need an HS code (hand-written route)'),
      v('S', 'Services', 'خدمات'),
    ],
  },
  COUNTRY_SUBDIVISION: {
    id: 'COUNTRY_SUBDIVISION',
    authority: 'Tax Authority Oman',
    ruleId: 'CL-13-OM',
    size: 6,
    values: [
      v('SHRFZ', 'Sohar Free Zone', 'المنطقة الحرة بصحار'),
      v('SEZAD', 'Duqm Special Economic Zone', 'المنطقة الاقتصادية الخاصة بالدقم'),
      v('SLLFZ', 'Salalah Free Zone', 'المنطقة الحرة بصلالة'),
      v('AFZ', 'Al Mazunah Free Zone', 'المنطقة الحرة بالمزيونة'),
      v('MO', 'Mainland Oman', 'داخل السلطنة'),
      v('OTH', 'Other', 'أخرى'),
    ],
  },
  INCOTERMS: {
    id: 'INCOTERMS',
    authority: 'ICC Incoterms 2020',
    ruleId: 'CL-09-OM',
    size: 11,
    values: ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF'].map(
      (code) => v(code),
    ),
  },
  SERVICE_TYPE: {
    id: 'SERVICE_TYPE',
    authority: 'Tax Authority Oman',
    ruleId: 'CL-12-OM',
    size: 21,
    values: [
      v('64000000', 'Telecommunications'),
      v('70000000', 'Real estate services'),
      v('71000000', 'Architecture and engineering'),
      v('72000000', 'IT services'),
      v('73000000', 'Advertising and market research'),
      v('76000000', 'Professional and scientific'),
      v('77000000', 'Rental and leasing'),
      v('78000000', 'Employment services'),
      v('80000000', 'Security services'),
      v('81000000', 'Building services'),
      v('82000000', 'Office and business support'),
      v('83000000', 'Legal and accounting'),
      v('84000000', 'Public administration'),
      v('85000000', 'Education'),
      v('86000000', 'Health'),
      v('90000000', 'Arts and entertainment'),
      v('91000000', 'Libraries and museums'),
      v('92000000', 'Gambling'),
      v('93000000', 'Sports and recreation'),
      v('94000000', 'Membership organisations'),
      v('00000000', 'Not a service'),
    ],
  },
  PROFIT_MARGIN_ITEM: {
    id: 'PROFIT_MARGIN_ITEM',
    authority: 'Tax Authority Oman',
    ruleId: 'CL-11-OM',
    size: 5,
    values: Array.from({ length: 5 }, (_, i) => v(`VATPM-OM-${String(i + 1).padStart(2, '0')}`)),
  },
}

export const CODE_LIST_IDS = Object.keys(CODE_LISTS) as CodeListId[]

export function codeIn(list: CodeListId, code: string) {
  return CODE_LISTS[list].values.some((value) => value.code === code)
}

/**
 * The exemption reason list depends on the category the line carries: E takes VATEX, Z takes
 * VATZR. A value map on IBT-121 accepts both; dry-run checks the pairing.
 */
export const EXEMPTION_LISTS: CodeListId[] = ['VAT_EXEMPTION_REASON', 'VAT_ZERO_RATING_REASON']
