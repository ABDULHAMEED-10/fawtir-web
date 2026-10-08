/**
 * Fawtara (Oman e-invoicing) onboarding status.
 *
 * Under the OTA's 5-corner Peppol model a taxpayer cannot report invoices directly: they must
 * authorize an Accredited Service Provider (ASP) on the Fawtara Portal, and the ASP approves the
 * connection before invoices can flow. A taxpayer may be linked to exactly one ASP at a time.
 * This screen is what the taxpayer sees while that approval is outstanding.
 */

export const FAWTARA_PORTAL_URL = 'https://tms.taxoman.gov.om/portal'
