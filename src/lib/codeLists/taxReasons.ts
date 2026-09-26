import type { CodeListEntry } from './codeList'

/**
 * The reason a line carries no VAT (IBT-121), as a code. Two lists that must never be mixed
 * (CL-05-OM and CL-10-OM): a zero-rated line (category Z) takes a `VATZR-OM-nn` code and an
 * exempt line (category E) a `VATEX-OM-nn` code. The 16 and 12 codes and English names of the
 * published PINT-OM lists "ZeroRating" and "Aligned-TaxExemptionCodes" (docs.peppol.eu). The Arabic
 * names are translated from the English by the project (pending review).
 *
 * TODO(backend): replace with `GET /v1/code-lists/tax-reasons`.
 */
export type TaxReason = CodeListEntry

const r = (code: string, en: string, ar: string = en): TaxReason => ({ code, en, ar })

/** VATZR-OM-01..16, for a zero-rated line. */
export const ZERO_RATED_REASONS: TaxReason[] = [
  r(
    'VATZR-OM-01',
    'Qualifying Supply of Food items specified by a decision from the Chairman',
    'التوريد المؤهل للمواد الغذائية المحددة بقرار من الرئيس',
  ),
  r(
    'VATZR-OM-02',
    'Qualifying Supply of Medicines and medical equipment',
    'التوريد المؤهل للأدوية والمعدات الطبية',
  ),
  r(
    'VATZR-OM-03',
    'Supply of investment gold, silver, and platinum',
    'توريد الذهب والفضة والبلاتين الاستثماري',
  ),
  r(
    'VATZR-OM-04',
    'Supplies of international and intra GCC transport of Goods or passengers',
    'توريدات النقل الدولي والنقل داخل دول مجلس التعاون الخليجي للبضائع أو الركاب',
  ),
  r(
    'VATZR-OM-05',
    'Supply of Services related to International and Intra GCC transportation of Goods or passengers',
    'توريد الخدمات المتعلقة بالنقل الدولي والنقل داخل دول مجلس التعاون الخليجي للبضائع أو الركاب',
  ),
  r(
    'VATZR-OM-06',
    'Supply of qualifying air, sea and land means of transport',
    'توريد وسائل النقل الجوية والبحرية والبرية المؤهلة',
  ),
  r(
    'VATZR-OM-07',
    'Supply of rescue planes, and rescue and assistance boats',
    'توريد طائرات الإنقاذ وقوارب الإنقاذ والمساعدة',
  ),
  r(
    'VATZR-OM-08',
    'Supply of oil, oil derivatives and natural gas',
    'توريد النفط ومشتقاته والغاز الطبيعي',
  ),
  r('VATZR-OM-09', 'Export of service', 'تصدير الخدمات'),
  r('VATZR-OM-10', 'Direct export of goods', 'التصدير المباشر للسلع'),
  r('VATZR-OM-11', 'Indirect export of goods', 'التصدير غير المباشر للسلع'),
  r('VATZR-OM-12', 'Re-export of goods', 'إعادة تصدير السلع'),
  r(
    'VATZR-OM-13',
    'Supply from a Special Zone to a Special Zone, or within a Special Zone',
    'التوريد من منطقة خاصة إلى منطقة خاصة أو داخل منطقة خاصة',
  ),
  r(
    'VATZR-OM-14',
    'Supply from Mainland to Special Zone',
    'التوريد من البر الرئيسي إلى منطقة خاصة',
  ),
  r(
    'VATZR-OM-15',
    'Customs Duty Suspension Statuses to a Special Zone',
    'حالات تعليق الرسوم الجمركية إلى منطقة خاصة',
  ),
  r(
    'VATZR-OM-16',
    'Special Zone to Customs Duty Suspension Statuses',
    'من منطقة خاصة إلى حالات تعليق الرسوم الجمركية',
  ),
]

/** VATEX-OM-01..12, for an exempt line. */
export const EXEMPT_REASONS: TaxReason[] = [
  r('VATEX-OM-01', 'Qualifying Financial Services', 'الخدمات المالية المؤهلة'),
  r(
    'VATEX-OM-02',
    'Educational Services and Related Goods and Services',
    'الخدمات التعليمية والسلع والخدمات ذات الصلة',
  ),
  r(
    'VATEX-OM-03',
    'Healthcare Services and related Goods and Services',
    'خدمات الرعاية الصحية والسلع والخدمات ذات الصلة',
  ),
  r(
    'VATEX-OM-04',
    'Rental of properties for residential purposes',
    'تأجير العقارات للأغراض السكنية',
  ),
  r('VATEX-OM-05', 'Local Passenger Transport', 'نقل الركاب المحلي'),
  r('VATEX-OM-06', 'Undeveloped land (bare land)', 'الأراضي غير المطورة (الأراضي الفضاء)'),
  r('VATEX-OM-07', 'Resale of residential properties', 'إعادة بيع العقارات السكنية'),
  r(
    'VATEX-OM-08',
    'Imported goods supplied to diplomatic and consular bodies, international organizations, and the heads and members of diplomatic and consular bodies',
    'السلع المستوردة الموردة للهيئات الدبلوماسية والقنصلية والمنظمات الدولية ورؤساء وأعضاء الهيئات الدبلوماسية والقنصلية',
  ),
  r(
    'VATEX-OM-09',
    'Imports for the Armed Forces and Internal Security Forces',
    'الواردات للقوات المسلحة وقوات الأمن الداخلي',
  ),
  r(
    'VATEX-OM-10',
    'Imported supplies for non-profit charities',
    'التوريدات المستوردة للجمعيات الخيرية غير الربحية',
  ),
  r('VATEX-OM-11', 'Import of returned goods', 'استيراد السلع المعادة'),
  r(
    'VATEX-OM-12',
    'Imported Goods in cases where the supply of such Goods is exempted from Tax or subject to Tax at a rate of zero percent in the Final Destination Point of Entry',
    'السلع المستوردة في الحالات التي يكون فيها توريد هذه السلع معفى من الضريبة أو خاضعا لها بنسبة صفر في المائة في نقطة الدخول إلى الوجهة النهائية',
  ),
]

/** The list a tax category takes its reason from; undefined for a category that takes a code from none. */
export function taxReasonsFor(en16931Category: string): TaxReason[] | undefined {
  if (en16931Category === 'Z') return ZERO_RATED_REASONS
  if (en16931Category === 'E') return EXEMPT_REASONS
  return undefined
}
