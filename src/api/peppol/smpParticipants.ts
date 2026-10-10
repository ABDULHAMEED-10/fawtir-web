/**
 * `GET /v1/peppol/smp/participants` (permission `smp.participant.view`): the tenant's registrations
 * in the Oman SMP. `participantReference` arrives masked, so a screen cannot match a row to the
 * verified Participant ID; it can only say whether the SMP confirmed any registration as active.
 */
export type SmpRemoteState = 'UNKNOWN' | 'CONFIRMED_ACTIVE' | 'CONFIRMED_REMOVED'

export type SmpParticipantStatus = {
  registrationId: string
  participantReference: string
  desiredState: string
  remoteState: SmpRemoteState | string
  countryCode: string
  effectiveAt: string | null
  deadlineAt: string | null
}

export type SmpParticipantPage = {
  items: SmpParticipantStatus[]
  page: number
  size: number
  totalElements: number
}

export const SMP_PARTICIPANTS_PATH = '/v1/peppol/smp/participants'

/** Only the SMP's own confirmation counts; a registration Fawtir merely asked for does not. */
export function smpConfirmedActive(page: SmpParticipantPage): boolean {
  return page.items.some((item) => item.remoteState === 'CONFIRMED_ACTIVE')
}
