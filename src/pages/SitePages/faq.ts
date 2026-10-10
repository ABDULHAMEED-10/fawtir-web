import { useTranslation } from 'react-i18next'
import type { SignupCataloguePlan } from '../../lib/identity/signupPlans'
import { FAQ_COUNT, faqAnswerKey, faqParams } from '../PlansPage/comparison'

/**
 * The sign-up plans screen's questions and answers, so the site and the app say the same. A page
 * that does not read the catalogue passes nothing, and the trial answer then quotes no figure.
 */
export function useFaqItems(plans: readonly SignupCataloguePlan[] | null = null) {
  const { t } = useTranslation()
  const params = faqParams(plans)
  return Array.from({ length: FAQ_COUNT }, (_, i) => ({
    q: t(`plans.faq.q${i + 1}`),
    a: t(faqAnswerKey(i, params), params),
  }))
}
