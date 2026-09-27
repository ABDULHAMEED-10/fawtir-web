import { API_BASE_URL } from '../../config/api'
import { apiRequest } from '../client'

/**
 * The company's logo and print colour (`CompanyProfileController`'s `/branding*` routes, V159).
 * Separate from the identity fields on `/company-profile` itself: saving these must not re-submit
 * the company for verification, and — unlike the identity fields — they stay editable after the
 * company is verified.
 */
export const BRANDING_PATH = '/v1/company-profile/branding'
export const LOGO_PATH = '/v1/company-profile/branding/logo'

/** The exact bytes URL: an `<img>` can point at this directly (cookie session, no CSRF on a GET). */
export const COMPANY_LOGO_URL = `${API_BASE_URL}${LOGO_PATH}`

export type CompanyLogo = {
  id: string
  contentType: string
  byteSize: number
  sha256: string
  /** Null for an SVG, which has no raster size. */
  widthPx: number | null
  heightPx: number | null
}

export type CompanyBrandingDto = {
  logo: CompanyLogo | null
  brandColour: string | null
  receiptMonochrome: boolean
}

export function loadBranding(): Promise<CompanyBrandingDto> {
  return apiRequest<CompanyBrandingDto>(BRANDING_PATH)
}

export function saveBranding(brandColour: string | null, receiptMonochrome: boolean) {
  return apiRequest<CompanyBrandingDto>(BRANDING_PATH, {
    method: 'PUT',
    body: { brandColour, receiptMonochrome },
    credentials: 'same-origin',
  })
}

export function uploadLogo(file: File): Promise<CompanyLogo> {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<CompanyLogo>(LOGO_PATH, { method: 'POST', body, credentials: 'same-origin' })
}

export function removeLogo(): Promise<void> {
  return apiRequest<void>(LOGO_PATH, { method: 'DELETE', credentials: 'same-origin' })
}
