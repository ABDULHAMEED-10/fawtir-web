import { useTranslation } from 'react-i18next'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleSettingsFrame } from '../../../layouts/ConsoleShell/ConsoleSettingsFrame'
import { CONSOLE_PAGE, ConsolePageHeader } from '../../../layouts/ConsoleShell/consoleStyle'
import { hasPermission, peekEntitlements } from '../../../lib/identity/entitlements'
import {
  BILLING_MANAGE_PERMISSION,
  BILLING_READ_PERMISSION,
} from '../../../lib/console/billingPayments'
import { Seller } from './ConsoleSellerPage'
import { BankAccounts } from './ConsoleBankAccountsPage'
import { CompanyContact } from './ConsoleCompanyContactPage'

/**
 * Console › Settings › Fawtir company details: who Fawtir is on its bills and to its customers,
 * on one page (owner, 24 Oct 2026) — the seller, the bank account customers pay into, and the
 * contact details. Each section is the screen it was, with its own Save, reason and history: the
 * bank account needs a second operator, the seller applies only to new bills, and the contact
 * details reach the website within minutes, so one shared Save would blur them. The seller
 * section shows only to an operator its own page admits (billing manage).
 */
export function ConsoleFawtirCompanyPage() {
  return (
    <ConsoleShell requires={BILLING_READ_PERMISSION}>
      <FawtirCompany />
    </ConsoleShell>
  )
}

function FawtirCompany() {
  const { t } = useTranslation()
  // Read inside the shell, which renders this only once the entitlements are known.
  const entitlements = peekEntitlements()
  const mayManage = entitlements ? hasPermission(entitlements, BILLING_MANAGE_PERMISSION) : false
  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleSettingsFrame tab="company" />
      <ConsolePageHeader
        level="section"
        title={t('console.settingsHub.card.companyTitle')}
        subtitle={t('console.settingsHub.card.companyBody')}
      />
      {mayManage ? (
        <section className="flex flex-col gap-5 border-t border-border-subtle pt-5">
          <Seller embedded />
        </section>
      ) : null}
      <section className="flex flex-col gap-5 border-t border-border-subtle pt-5">
        <BankAccounts embedded />
      </section>
      <section className="flex flex-col gap-5 border-t border-border-subtle pt-5">
        <CompanyContact embedded />
      </section>
    </div>
  )
}
