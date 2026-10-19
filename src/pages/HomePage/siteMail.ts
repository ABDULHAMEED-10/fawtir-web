import { useTranslation } from 'react-i18next'
import { mailto, useCompanyContact } from '../../lib/companyContact'

/**
 * The site's mail links, to the support email of the console's company contact setting (CS-1;
 * the old address until the server returns one).
 */
export function useSiteMail() {
  const { i18n } = useTranslation()
  const contact = useCompanyContact(i18n.language)
  const email = contact.supportEmail
  return {
    contact,
    demo: mailto(email, 'Fawtir demo request'),
    // TODO(backend): SITE.md 1.3. No partner programme page exists yet; the link asks by email meanwhile.
    partners: mailto(email, 'Fawtir partners'),
    newsletter: (body: string) => mailto(email, 'Fawtir newsletter', body),
  }
}
