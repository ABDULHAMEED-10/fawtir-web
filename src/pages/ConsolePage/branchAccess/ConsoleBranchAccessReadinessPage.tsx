import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_PAGE,
  ConsoleCardHead,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { formatInstant } from '../../../lib/format'
import {
  READINESS_PERMISSION,
  byCompany,
  readinessPath,
  type BranchAccessReadinessDto,
  type CompanyReadiness,
} from '../../../lib/console/branchAccessReadiness'

const K = 'console.branchAccess.'

/**
 * Before branch access is switched on (Business Rules BA-1, BA-6, RL-1, RL-5): per company, what
 * would read differently once it is on. Read-only and computed live by the server; nothing here
 * changes a company. Codes such as role and permission codes are shown as codes, left to right.
 */
export function ConsoleBranchAccessReadinessPage() {
  return (
    <ConsoleShell requires={READINESS_PERMISSION}>
      <BranchAccessReadiness />
    </ConsoleShell>
  )
}

function BranchAccessReadiness() {
  const { t } = useTranslation()
  const { read, retry } = useConsoleRead<BranchAccessReadinessDto>(readinessPath())

  let body: ReactNode
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t(`${K}loading`)} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else {
    const companies = byCompany(read.data)
    body = (
      <>
        <div className="flex flex-wrap items-center gap-3 rounded-sm bg-surface-card px-5 py-4">
          <ConsoleStatusPill
            tone={read.data.enforced ? 'success' : 'neutral'}
            label={t(read.data.enforced ? `${K}switch.on` : `${K}switch.off`)}
          />
          <p className="text-sm leading-[1.6] text-text-secondary">
            {t(read.data.enforced ? `${K}switch.onNote` : `${K}switch.offNote`)}
          </p>
        </div>
        {companies.length === 0 ? (
          <p className="rounded-sm bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
            {t(`${K}empty`)}
          </p>
        ) : (
          companies.map((company) => <CompanyCard key={company.tenantId} company={company} />)
        )}
      </>
    )
  }

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.branchAccess' }]} />
      <ConsolePageHeader title={t(`${K}title`)} subtitle={t(`${K}subtitle`)} />
      {body}
    </div>
  )
}

function CompanyCard({ company }: { company: CompanyReadiness }) {
  const { t, i18n } = useTranslation()
  return (
    <section className={CONSOLE_CARD} aria-label={company.companyName}>
      <ConsoleCardHead
        title={
          <Link
            className="hover:underline"
            to={`/console/tenants/${encodeURIComponent(company.tenantId)}`}
          >
            {company.companyName}
          </Link>
        }
        note={<bdi dir="ltr">{company.tenantCode}</bdi>}
      />
      <ul className="flex flex-col gap-4 p-5 text-sm leading-[1.6] text-text-secondary">
        {company.peopleWithoutBranch > 0 ? (
          <li>
            <p className="font-semibold text-text-primary">
              {t(`${K}withoutBranch.title`, { count: company.peopleWithoutBranch })}
            </p>
            <p>{t(`${K}withoutBranch.note`)}</p>
          </li>
        ) : null}
        {company.peopleWithSeveralRoles > 0 ? (
          <li>
            <p className="font-semibold text-text-primary">
              {t(`${K}severalRoles.title`, { count: company.peopleWithSeveralRoles })}
            </p>
            <p>{t(`${K}severalRoles.note`)}</p>
          </li>
        ) : null}
        {company.roles.map((role) => (
          <li key={role.roleId}>
            <p className="font-semibold text-text-primary">
              {t(`${K}reserved.title`, { role: role.roleName, count: role.holders })}
            </p>
            <p>{t(`${K}reserved.note`)}</p>
            <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              {role.reservedCodes.map((code) => (
                <bdi key={code} dir="ltr" className="font-mono text-[12px] text-text-tertiary">
                  {code}
                </bdi>
              ))}
            </p>
          </li>
        ))}
        {company.invitations.map((invitation) => (
          <li key={invitation.invitationId}>
            <p className="font-semibold text-text-primary">
              {t(`${K}invitation.title`, {
                date: formatInstant(invitation.expiresAt, i18n.language),
              })}
            </p>
            <p>{t(`${K}invitation.note`)}</p>
            <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              {[...invitation.jobRoles, ...invitation.otherRoles].map((code) => (
                <bdi key={code} dir="ltr" className="font-mono text-[12px] text-text-tertiary">
                  {code}
                </bdi>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
