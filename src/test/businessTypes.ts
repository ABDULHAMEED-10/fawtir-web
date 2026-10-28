import type { SignupBusinessTypeDto, SignupSubBusinessTypeDto } from '../api/catalog/businessTypes'

const sub = (
  code: string,
  nameEn: string,
  displayOrder: number,
  isic: string | null = null,
): SignupSubBusinessTypeDto => ({
  code,
  nameEn,
  nameAr: nameEn,
  icon: null,
  displayOrder,
  suggestedIsic: isic ? { code: isic, nameEn: 'Restaurants', nameAr: 'Restaurants' } : null,
  hasTemplate: false,
})

/** `GET /auth/signup/business-types`: what the console opened, in its order (Catalogue 1A). */
export const SIGNUP_BUSINESS_TYPES: SignupBusinessTypeDto[] = [
  {
    code: 'FOOD_AND_BEVERAGE',
    nameEn: 'Food & Beverage',
    nameAr: 'الأغذية والمشروبات',
    icon: 'utensils',
    displayOrder: 1,
    subTypes: [
      sub('COFFEE_SHOP', 'Coffee shop', 1),
      sub('RESTAURANT', 'Restaurant', 2, '561001'),
      sub('BAKERY', 'Bakery', 3),
      sub('FAST_FOOD', 'Fast food', 4),
      sub('JUICE_BAR', 'Juice bar', 5),
      sub('DESSERT_SHOP', 'Dessert shop', 6),
      sub('CATERING', 'Catering', 7),
    ],
  },
  {
    code: 'RETAIL',
    nameEn: 'Retail',
    nameAr: 'Retail',
    icon: 'store',
    displayOrder: 2,
    subTypes: [sub('GROCERY', 'Grocery', 1)],
  },
]

const LIST_URL = '/api/v1/auth/signup/business-types'

/**
 * A `fetch` that answers the business type list with {@link SIGNUP_BUSINESS_TYPES} and hands every
 * other request to `fetchMock`, so a step's own request counts stay its own.
 */
export function withBusinessTypes(
  fetchMock: (input: string, init?: RequestInit) => unknown,
): (input: string, init?: RequestInit) => unknown {
  return (input, init) =>
    String(input) === LIST_URL
      ? Promise.resolve(
          new Response(JSON.stringify(SIGNUP_BUSINESS_TYPES), {
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      : fetchMock(input, init)
}
