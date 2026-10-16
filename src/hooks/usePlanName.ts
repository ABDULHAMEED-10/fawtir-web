import { useTranslation } from 'react-i18next'
import { useApiRead } from './useApiRead'
import {
  PUBLIC_PLANS_PATH,
  catalogueName,
  readPublicPlans,
  type SignupCataloguePlan,
} from '../lib/identity/signupPlans'

/**
 * Names a plan the server sent by code and English name (a bill, the subscription, a waiting
 * downgrade) in the reader's language (F37). Those answers carry no Arabic name, so an Arabic
 * reader's name comes from the published catalogue (`GET /v1/public/plans`, the one Settings ›
 * Plan reads) by the plan's code. Until it answers, if it cannot, or for a plan it does not list,
 * the server's own name stands. An English reader's catalogue is never asked for.
 */
export function usePlanName(): (code: string | null | undefined, fallback: string) => string {
  const { i18n } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  const catalogue = useApiRead<SignupCataloguePlan[]>(arabic ? PUBLIC_PLANS_PATH : null, () =>
    readPublicPlans(),
  )
  const plans = catalogue.read.status === 'ready' ? catalogue.read.data : null
  return (code, fallback) => catalogueName(plans, code, fallback, i18n.language)
}
