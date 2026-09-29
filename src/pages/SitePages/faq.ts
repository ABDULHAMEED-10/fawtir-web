import { useTranslation } from 'react-i18next'
import { FAQ_COUNT, faqParams } from '../PlansPage/PlanComparison'

/** The sign-up plans screen's questions and answers, so the site and the app say the same. */
export function useFaqItems() {
  const { t } = useTranslation()
  const params = faqParams()
  return Array.from({ length: FAQ_COUNT }, (_, i) => ({
    q: t(`plans.faq.q${i + 1}`),
    a: t(`plans.faq.a${i + 1}`, params),
  }))
}
