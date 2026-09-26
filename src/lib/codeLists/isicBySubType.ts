import { ISIC_ACTIVITIES, type IsicActivity } from './isic'

/**
 * The sign-up "specialty" (sub-business type) pre-fills the business activity (ISIC Rev. 4,
 * Oman 6-digit) on the Business identity step, so most registrants confirm rather than search.
 * One activity per specialty, and only where the published PINT-OM list has a clear match by name
 * (checked 2026-09-26): a specialty with several plausible activities, or none, pre-fills nothing
 * and the registrant searches. The earlier table held codes that are not on the official list or
 * that name a different activity (e.g. 141010 is "Manufacture of omani kimmah").
 * TODO(backend): once `GET /v1/code-lists/isic` exists this table stays as the default.
 */
const ISIC_BY_SUB_TYPE: Record<string, string> = {
  'coffee-shop': '563001',
  restaurant: '561001',
  'fast-food': '561002',
  'juice-bar': '563002',
  'dessert-shop': '561003',
  catering: '562901',
  'flower-shop': '477305',
  'gift-shop': '477304',
  bookstore: '476103',
  'home-store': '475901',
  'beauty-salon': '960202',
  'barber-shop': '960201',
  'massage-center': '960902',
  'fitness-studio': '931101',
  consultancy: '702001',
  laundry: '960104',
  tailoring: '141009',
  'medical-clinic': '862002',
  'dental-clinic': '862003',
  pharmacy: '477201',
  hotel: '551001',
  resort: '551001',
  'guest-house': '551006',
  'travel-agency': '791100',
  'driving-school': '854903',
  'car-wash': '452011',
}

/** The activity a specialty suggests, or nothing when the specialty is unknown. */
export function isicForSubType(subBusinessType: string | undefined): IsicActivity | undefined {
  const code = subBusinessType ? ISIC_BY_SUB_TYPE[subBusinessType] : undefined
  return code ? ISIC_ACTIVITIES.find((activity) => activity.code === code) : undefined
}
