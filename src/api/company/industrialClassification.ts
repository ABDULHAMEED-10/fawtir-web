import { apiRequest } from '../client'

/**
 * The tenant's business activity (BTOM-033 / IBR-081-OM): one ISIC Rev. 4 code at Oman's six-digit
 * level, or `null` until it is set. The backend copies it onto every line of a full tax invoice at
 * issue. Issuing is not blocked when it is missing; the Tax Authority submission is (dispatch).
 *
 * `PUT` needs `admin.settings.manage` and refuses a code that is not on the official list.
 */
export const INDUSTRIAL_CLASSIFICATION_PATH = '/v1/company-profile/industrial-classification'

export type IndustrialClassificationDto = { code: string | null }

export function readIndustrialClassification(): Promise<IndustrialClassificationDto> {
  return apiRequest<IndustrialClassificationDto>(INDUSTRIAL_CLASSIFICATION_PATH)
}

export function saveIndustrialClassification(code: string): Promise<IndustrialClassificationDto> {
  return apiRequest<IndustrialClassificationDto>(INDUSTRIAL_CLASSIFICATION_PATH, {
    method: 'PUT',
    body: { code },
  })
}
