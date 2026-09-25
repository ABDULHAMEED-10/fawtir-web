import type { CodeListEntry } from './codeList'

/**
 * Service types, code list CL-12-OM, for the service line of a full tax invoice (IBR-155-OM;
 * `cac:CommodityClassification` with the service-type listID).
 *
 * A placeholder subset of about thirty service kinds. The codes follow the CPC Ver. 2.1 group
 * numbering the Oman list is built on, so a search by name behaves as it will; the published
 * CL-12-OM values replace them when the backend serves the list.
 *
 * TODO(backend): replace with `GET /v1/code-lists/service-types?q=training` (searched by service
 * name, English and Arabic names); see PINT_OM_LINE_CLASSIFICATION.md §7.
 */
export type ServiceType = CodeListEntry

const s = (code: string, en: string, ar: string): ServiceType => ({ code, en, ar })

export const SERVICE_TYPES: ServiceType[] = [
  s('63310', 'Restaurant and café meal service', 'خدمات تقديم الوجبات في المطاعم والمقاهي'),
  s('63393', 'Event and contract catering', 'خدمات التموين للمناسبات والعقود'),
  s('63399', 'Delivery of food and beverages', 'توصيل الأطعمة والمشروبات'),
  s('88121', 'Coffee roasting and processing service', 'خدمات تحميص البن ومعالجته'),
  s('92900', 'Training and courses (barista, staff)', 'التدريب والدورات (باريستا، موظفون)'),
  s('92910', 'Education services, other', 'خدمات تعليمية، غيرها'),
  s('83111', 'Management consulting', 'الاستشارات الإدارية'),
  s('82210', 'Accounting and bookkeeping', 'المحاسبة ومسك الدفاتر'),
  s('82310', 'Tax consulting and filing', 'الاستشارات الضريبية وتقديم الإقرارات'),
  s('82110', 'Legal advisory', 'الاستشارات القانونية'),
  s('83131', 'Software development and programming', 'تطوير البرمجيات والبرمجة'),
  s('83132', 'IT support and maintenance', 'الدعم الفني وصيانة تقنية المعلومات'),
  s('83151', 'Web hosting and cloud services', 'استضافة المواقع والخدمات السحابية'),
  s('73311', 'Software licence and subscription', 'ترخيص البرمجيات والاشتراكات'),
  s('83610', 'Advertising and marketing', 'الإعلان والتسويق'),
  s('83911', 'Graphic and interior design', 'التصميم الجرافيكي والداخلي'),
  s('83812', 'Photography and video production', 'التصوير الفوتوغرافي وإنتاج الفيديو'),
  s('89121', 'Printing services', 'خدمات الطباعة'),
  s('83910', 'Translation and interpretation', 'الترجمة التحريرية والشفوية'),
  s('85310', 'Cleaning services', 'خدمات التنظيف'),
  s('85230', 'Security and guarding', 'خدمات الأمن والحراسة'),
  s('87159', 'Repair and maintenance of equipment', 'إصلاح وصيانة المعدات'),
  s('87141', 'Vehicle repair and maintenance', 'إصلاح وصيانة المركبات'),
  s('87320', 'Installation of equipment', 'تركيب المعدات'),
  s('54100', 'Construction and building works', 'أعمال البناء والتشييد'),
  s('83310', 'Architectural and engineering services', 'الخدمات المعمارية والهندسية'),
  s('73121', 'Rental of machinery and equipment', 'تأجير الآلات والمعدات'),
  s('72111', 'Rental of commercial property', 'تأجير العقارات التجارية'),
  s('65111', 'Freight transport by road', 'نقل البضائع براً'),
  s('64220', 'Passenger transport by road', 'نقل الركاب براً'),
  s('67210', 'Storage and warehousing', 'التخزين والمستودعات'),
  s('84110', 'Telecommunications services', 'خدمات الاتصالات'),
  s('71610', 'Insurance brokerage', 'وساطة التأمين'),
  s('85970', 'Event management', 'إدارة الفعاليات'),
  s('93121', 'Medical and clinic services', 'الخدمات الطبية وخدمات العيادات'),
  s('63110', 'Hotel and accommodation', 'الفنادق والإقامة'),
  s('99000', 'Other services', 'خدمات أخرى'),
]
