import { useTranslation } from 'react-i18next'

/** The questions the pricing and contact frames both close on, in the frames' order. */
export function useFaqItems() {
  const { t } = useTranslation()
  return ['cafe', 'over', 'change', 'setup', 'vat', 'stop'].map((key) => ({
    q: t(`site.faq.items.${key}.q`),
    a: t(`site.faq.items.${key}.a`),
  }))
}
