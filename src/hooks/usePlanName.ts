import { useTranslation } from 'react-i18next'
import { useApiRead } from './useApiRead'
import {
  PUBLIC_PLANS_PATH,
  catalogueName,
  readPublicPlans,
  type SignupCataloguePlan,
} from '../lib/identity/signupPlans'

/** The server's name for an Enterprise plan nobody renamed (`EnterpriseTerms.DEFAULT_NAME_EN`). */
const ENTERPRISE_DEFAULT_NAME = 'Enterprise'

/** The signup choice (`ENTERPRISE`) or a company's own Enterprise plan (`ENT_` + its id, V348). */
export function isEnterpriseCode(code: string | null | undefined): boolean {
  return code === 'ENTERPRISE' || (typeof code === 'string' && code.startsWith('ENT_'))
}

/**
 * Names a plan the server sent by code and English name (a bill, the subscription, a waiting
 * downgrade) in the reader's language (F37). Those answers carry no Arabic name, so an Arabic
 * reader's name comes from the published catalogue (`GET /v1/public/plans`, the one Settings ›
 * Plan reads) by the plan's code. Until it answers, if it cannot, or for a plan it does not list,
 * the server's own name stands. An English reader's catalogue is never asked for.
 */
export function usePlanName(): (code: string | null | undefined, fallback: string) => string {
  const { t, i18n } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  const catalogue = useApiRead<SignupCataloguePlan[]>(arabic ? PUBLIC_PLANS_PATH : null, () =>
    readPublicPlans(),
  )
  const plans = catalogue.read.status === 'ready' ? catalogue.read.data : null
  return (code, fallback) =>
    // A company's own Enterprise plan is never in the published catalogue: its default English
    // name reads in the reader's language; a name the operator chose stands as given.
    isEnterpriseCode(code) && fallback === ENTERPRISE_DEFAULT_NAME
      ? t('plan.planName.enterprise')
      : catalogueName(plans, code, fallback, i18n.language)
}
