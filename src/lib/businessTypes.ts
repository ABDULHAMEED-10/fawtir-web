import { useApiRead } from '../hooks/useApiRead'
import {
  SIGNUP_BUSINESS_TYPES_PATH,
  readSignupBusinessTypes,
  type SignupBusinessTypeDto,
  type SignupSubBusinessTypeDto,
  type SuggestedIsicDto,
} from '../api/catalog/businessTypes'
import { nameOf } from './codeLists/codeList'
import { ISIC_ACTIVITIES } from './codeLists/isic'
import foodBeverageIcon from '../assets/business-types/food-beverage.svg'
import automotiveIcon from '../assets/business-types/automotive.svg'
import retailIcon from '../assets/business-types/retail.svg'
import beautyWellnessIcon from '../assets/business-types/beauty-wellness.svg'
import healthcareIcon from '../assets/business-types/healthcare.svg'
import hospitalityIcon from '../assets/business-types/hospitality.svg'
import educationIcon from '../assets/business-types/education.svg'
import professionalIcon from '../assets/business-types/professional.svg'

/**
 * Business types and sub types as the server keeps them (console Settings › Business types).
 * Names come from the server; the Arabic name falls back to the English one until there is one.
 */
export type Named = { nameEn: string; nameAr?: string | null }

export function localName(named: Named, language: string): string {
  return language.startsWith('ar') ? named.nameAr || named.nameEn : named.nameEn
}

/**
 * The drawn icons, by the icon name the console stores and by the launch codes, so a type the
 * console adds with a known icon name draws it; anything else draws the general one.
 */
const ICON_BY_NAME: Record<string, string> = {
  utensils: foodBeverageIcon,
  store: retailIcon,
  sparkles: beautyWellnessIcon,
  briefcase: professionalIcon,
  stethoscope: healthcareIcon,
  hotel: hospitalityIcon,
  'graduation-cap': educationIcon,
  car: automotiveIcon,
}

const ICON_BY_CODE: Record<string, string> = {
  FOOD_AND_BEVERAGE: foodBeverageIcon,
  RETAIL: retailIcon,
  BEAUTY_AND_WELLNESS: beautyWellnessIcon,
  PROFESSIONAL_AND_HOME_SERVICES: professionalIcon,
  HEALTHCARE: healthcareIcon,
  HOSPITALITY_AND_TOURISM: hospitalityIcon,
  EDUCATION_AND_TRAINING: educationIcon,
  AUTOMOTIVE: automotiveIcon,
}

export function businessTypeIcon(type: { code: string; icon?: string | null }): string {
  return (
    (type.icon && Object.hasOwn(ICON_BY_NAME, type.icon) ? ICON_BY_NAME[type.icon] : undefined) ??
    (Object.hasOwn(ICON_BY_CODE, type.code) ? ICON_BY_CODE[type.code] : undefined) ??
    professionalIcon
  )
}

/** The types open for sign-up, read once per screen. */
export function useSignupBusinessTypes() {
  return useApiRead<SignupBusinessTypeDto[]>(SIGNUP_BUSINESS_TYPES_PATH, () =>
    readSignupBusinessTypes(),
  )
}

export function findBusinessType(
  types: readonly SignupBusinessTypeDto[] | undefined,
  code: string | undefined,
): SignupBusinessTypeDto | undefined {
  return code ? types?.find((type) => type.code === code) : undefined
}

export function findSubBusinessType(
  types: readonly SignupBusinessTypeDto[] | undefined,
  code: string | undefined,
): SignupSubBusinessTypeDto | undefined {
  if (!code || !types) return undefined
  for (const type of types) {
    const found = type.subTypes.find((sub) => sub.code === code)
    if (found) return found
  }
  return undefined
}

/**
 * The words of a suggested activity: the official list's name in the reader's language when the
 * code is on it, the server's otherwise.
 */
export function suggestedIsicLabel(isic: SuggestedIsicDto, language: string): string {
  const listed = ISIC_ACTIVITIES.find((activity) => activity.code === isic.code)
  return listed ? nameOf(listed, language) : localName(isic, language)
}
