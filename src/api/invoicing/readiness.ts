/**
 * `GET /v1/invoicing/readiness` (permission `invoice.read`): what still stands between the company
 * and its first issued invoice. Older backends do not have the route; a screen treats a 404, like
 * any other failure, as "nothing to show" rather than as "ready".
 */
export const INVOICING_READINESS_PATH = '/v1/invoicing/readiness'

export type ReadinessCode =
  | 'COMPANY_VERIFIED'
  | 'PARTICIPANT_VERIFIED'
  | 'REGISTERED_ADDRESS'
  | 'CONTACT_PHONE'
  | 'BUSINESS_ACTIVITY'
  | 'ACTIVE_BRANCH'

export type ReadinessItem = {
  code: ReadinessCode | string
  status: 'DONE' | 'ACTION_REQUIRED' | 'AWAITING_PLATFORM'
  owner: 'COMPANY' | 'PLATFORM'
}

export type InvoicingReadinessDto = { ready: boolean; items: ReadinessItem[] }
