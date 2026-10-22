/**
 * The console's read-only report of what to check before branch access is switched on (Business
 * Rules BA-1, BA-6, RL-1, RL-5), in the shape `PlatformBranchAccessReadinessController` answers.
 * It changes nothing; `platform.tenants.manage`.
 */
export const READINESS_PERMISSION = 'platform.tenants.manage'

const PATH = '/v1/platform/branch-access/readiness'

type Company = { tenantId: string; tenantCode: string; companyName: string }

export type CustomRoleWithReservedCodesDto = Company & {
  roleId: string
  roleCode: string
  roleName: string
  reservedCodes: string[]
  holders: number
}

export type InvitationNamingSeveralRolesDto = Company & {
  invitationId: string
  expiresAt: string
  jobRoles: string[]
  otherRoles: string[]
}

export type CompanyPeopleDto = Company & { people: number }

export type BranchAccessReadinessDto = {
  enforced: boolean
  customRolesWithReservedCodes: CustomRoleWithReservedCodesDto[]
  invitationsNamingSeveralRoles: InvitationNamingSeveralRolesDto[]
  peopleWithoutBranch: CompanyPeopleDto[]
  /** Absent from older servers. */
  peopleWithSeveralRoles?: CompanyPeopleDto[]
}

export function readinessPath(tenantId?: string): string {
  return tenantId ? `${PATH}?tenantId=${encodeURIComponent(tenantId)}` : PATH
}

/** Everything the report says about one company. */
export type CompanyReadiness = Company & {
  peopleWithoutBranch: number
  peopleWithSeveralRoles: number
  roles: CustomRoleWithReservedCodesDto[]
  invitations: InvitationNamingSeveralRolesDto[]
}

/** The report regrouped per company, in company code order: one row to read per company. */
export function byCompany(report: BranchAccessReadinessDto): CompanyReadiness[] {
  const companies = new Map<string, CompanyReadiness>()
  const of = (row: Company) => {
    let company = companies.get(row.tenantId)
    if (!company) {
      company = {
        tenantId: row.tenantId,
        tenantCode: row.tenantCode,
        companyName: row.companyName,
        peopleWithoutBranch: 0,
        peopleWithSeveralRoles: 0,
        roles: [],
        invitations: [],
      }
      companies.set(row.tenantId, company)
    }
    return company
  }
  report.peopleWithoutBranch.forEach((row) => (of(row).peopleWithoutBranch = row.people))
  ;(report.peopleWithSeveralRoles ?? []).forEach(
    (row) => (of(row).peopleWithSeveralRoles = row.people),
  )
  report.customRolesWithReservedCodes.forEach((row) => of(row).roles.push(row))
  report.invitationsNamingSeveralRoles.forEach((row) => of(row).invitations.push(row))
  return [...companies.values()].sort((a, b) => a.tenantCode.localeCompare(b.tenantCode))
}
