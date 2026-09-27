import { vatin } from './validation'

/** Oman's Peppol scheme: a company is addressed as `0248:` followed by its VAT number. */
export const OMAN_PEPPOL_SCHEME = '0248'

/**
 * The Participant ID a registering company would carry, made from its VAT number, or `null`
 * until that number is valid. It is only a candidate: Fawtir reviews it with the registration
 * (Console › Verification), and the reviewer may approve another one for an OM12 group VAT
 * number or an ID already registered elsewhere. The company never types it.
 *
 * TODO(backend): the registration stores this candidate as pending and the console reads it
 * (docs/backend-guides/INCOME.md, "Update 2026-09-27 (Participant ID)", rows P.1 to P.3).
 */
export function candidateParticipantId(vatNumber: string | null | undefined): string | null {
  const value = (vatNumber ?? '').trim().toUpperCase()
  return value && vatin(value) === undefined ? `${OMAN_PEPPOL_SCHEME}:${value}` : null
}
