import { OperatorInvitationPage } from '../OperatorInvitationPage/OperatorInvitationPage'

/**
 * Where a company user's invitation mail lands (`/invitation#token=…`), including the first
 * administrator of a company onboarded from the console. The operator acceptance page with
 * company wording: same endpoint, same fields, same handling of the token and of refusals.
 */
export function CompanyInvitationPage() {
  return <OperatorInvitationPage copy="companyInvitation" />
}
