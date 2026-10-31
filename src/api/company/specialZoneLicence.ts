import { apiRequest } from '../client'

/**
 * The company's own Special Zone licence (PINT-OM IBT-029 under scheme SZLN). IBR-151-OM asks a
 * special-zone supply for it when the seller's subdivision (BTOM-024) is not `MO`; without it such
 * an invoice is refused at issue. `PUT` needs `admin.settings.manage` and refuses a company whose
 * registered subdivision is mainland or not stated. An older server has no route, so a failed read
 * means no field.
 */
export const SPECIAL_ZONE_LICENCE_PATH = '/v1/company-profile/special-zone-licence'

export type SpecialZoneLicenceDto = {
  specialZoneLicenceNumber: string | null
  countrySubdivisionCode: string | null
  inSpecialZone: boolean
}

export function readSpecialZoneLicence(): Promise<SpecialZoneLicenceDto> {
  return apiRequest<SpecialZoneLicenceDto>(SPECIAL_ZONE_LICENCE_PATH)
}

export function saveSpecialZoneLicence(
  specialZoneLicenceNumber: string,
): Promise<SpecialZoneLicenceDto> {
  return apiRequest<SpecialZoneLicenceDto>(SPECIAL_ZONE_LICENCE_PATH, {
    method: 'PUT',
    body: { specialZoneLicenceNumber },
  })
}

export function clearSpecialZoneLicence(): Promise<void> {
  return apiRequest<void>(SPECIAL_ZONE_LICENCE_PATH, { method: 'DELETE' })
}
