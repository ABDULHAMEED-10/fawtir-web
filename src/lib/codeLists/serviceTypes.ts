import type { CodeListEntry } from './codeList'

/**
 * Service types, code list CL-12-OM (IBR-155-OM; `cac:ItemSpecificationDocumentReference` with
 * scheme MP). The 21 codes and English names of the published PINT-OM list ("ServiceType").
 * 00000000 is "Other". A service line needs one only on an export of services; every other
 * services line takes 00000000 from the backend. The Arabic names are translated from the
 * English by the project (pending review).
 *
 * TODO(backend): replace with `GET /v1/code-lists/service-types?q=`.
 */
export type ServiceType = CodeListEntry

const s = (code: string, en: string, ar: string = en): ServiceType => ({ code, en, ar })

export const SERVICE_TYPES: ServiceType[] = [
  s('00000000', 'Other', 'أخرى'),
  s(
    '64000000',
    'Financial Instruments, Products, Contracts and Agreements',
    'الأدوات والمنتجات والعقود والاتفاقيات المالية',
  ),
  s(
    '70000000',
    'Farming, Fishing, Forestry and Wildlife Services',
    'خدمات الزراعة وصيد الأسماك والحراجة والحياة البرية',
  ),
  s('71000000', 'Mining and Oil and Gas Services', 'خدمات التعدين والنفط والغاز'),
  s(
    '72000000',
    'Building and Facility Construction and Maintenance Services',
    'خدمات إنشاء وصيانة المباني والمرافق',
  ),
  s(
    '73000000',
    'Industrial Production and Manufacturing Services',
    'خدمات الإنتاج الصناعي والتصنيع',
  ),
  s('76000000', 'Industrial Cleaning Services', 'خدمات التنظيف الصناعي'),
  s('77000000', 'Environmental Services', 'الخدمات البيئية'),
  s('78000000', 'Transportation, Storage and Mail Services', 'خدمات النقل والتخزين والبريد'),
  s(
    '80000000',
    'Management, Business and Administrative Services',
    'خدمات الإدارة والأعمال والخدمات الإدارية',
  ),
  s(
    '81000000',
    'Engineering, Research and Technology Services',
    'الخدمات الهندسية وخدمات البحث والتكنولوجيا',
  ),
  s(
    '82000000',
    'Editorial, Design, Graphic and Fine Art Services',
    'خدمات التحرير والتصميم والفنون الجرافيكية والجميلة',
  ),
  s(
    '83000000',
    'Public Utilities and Public Sector Services',
    'خدمات المرافق العامة والقطاع العام',
  ),
  s('84000000', 'Financial and Insurance Services', 'الخدمات المالية وخدمات التأمين'),
  s('85000000', 'Healthcare Services', 'خدمات الرعاية الصحية'),
  s('86000000', 'Education and Training Services', 'خدمات التعليم والتدريب'),
  s(
    '90000000',
    'Travel, Food, Lodging and Entertainment Services',
    'خدمات السفر والأغذية والإقامة والترفيه',
  ),
  s('91000000', 'Personal and Domestic Services', 'الخدمات الشخصية والمنزلية'),
  s('92000000', 'Defense, Security and Safety Services', 'خدمات الدفاع والأمن والسلامة'),
  s('93000000', 'Politics and Civic Affairs Services', 'خدمات السياسة والشؤون المدنية'),
  s('94000000', 'Organizations and Clubs', 'المنظمات والنوادي'),
]
