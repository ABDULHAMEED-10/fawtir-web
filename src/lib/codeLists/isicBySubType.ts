import { ISIC_ACTIVITIES, type IsicActivity } from './isic'

/**
 * The sign-up "specialty" (sub-business type) pre-fills the business activity (ISIC Rev. 4,
 * Oman 6-digit) on the Business identity step, so most registrants confirm rather than search.
 * One activity per specialty: the closest class on the placeholder list; the registrant can pick
 * any other. TODO(backend): once `GET /v1/code-lists/isic` exists this table stays as the default.
 */
const ISIC_BY_SUB_TYPE: Record<string, string> = {
  // Food & beverage
  'coffee-shop': '561020',
  restaurant: '561010',
  bakery: '107110',
  'fast-food': '561010',
  'juice-bar': '563010',
  'dessert-shop': '561010',
  catering: '562110',
  // Retail
  grocery: '471110',
  electronics: '474110',
  fashion: '477110',
  'flower-shop': '477310',
  'gift-shop': '477310',
  bookstore: '476110',
  'pet-shop': '477310',
  'home-store': '475910',
  // Beauty & wellness
  'beauty-salon': '960210',
  'barber-shop': '960210',
  spa: '960910',
  'nail-salon': '960210',
  'massage-center': '960910',
  'fitness-studio': '931110',
  // Professional services
  consultancy: '702010',
  cleaning: '812110',
  laundry: '960910',
  tailoring: '141010',
  printing: '181110',
  repair: '951110',
  maintenance: '331210',
  'freelance-services': '741010',
  // Healthcare
  'medical-clinic': '862010',
  'dental-clinic': '862010',
  physiotherapy: '869010',
  laboratory: '869010',
  pharmacy: '477210',
  'medical-supplies': '477210',
  // Hospitality & travel
  hotel: '551010',
  resort: '551010',
  'guest-house': '551010',
  'travel-agency': '791110',
  'tour-operator': '791210',
  'car-rental': '771010',
  'event-venue': '823010',
  // Education
  'training-center': '854910',
  'tuition-center': '854910',
  nursery: '851010',
  school: '852110',
  'driving-school': '854910',
  'online-academy': '854910',
  // Automotive
  garage: '452010',
  'car-wash': '452010',
  detailing: '452010',
  'tire-shop': '453010',
  'spare-parts': '453010',
  'battery-shop': '453010',
  'vehicle-inspection': '712010',
}

/** The activity a specialty suggests, or nothing when the specialty is unknown. */
export function isicForSubType(subBusinessType: string | undefined): IsicActivity | undefined {
  const code = subBusinessType ? ISIC_BY_SUB_TYPE[subBusinessType] : undefined
  return code ? ISIC_ACTIVITIES.find((activity) => activity.code === code) : undefined
}
