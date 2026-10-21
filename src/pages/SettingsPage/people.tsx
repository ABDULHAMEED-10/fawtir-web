import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { displayName, type CompanyUser } from '../../api/settings/people'
import { formatDate } from '../../lib/format'
import { TD, TH, personStatus, seesEveryBranch } from './peopleView'

export function PeopleTable({
  people,
  roleNames,
  lastSignedIn = false,
  branchName,
  personLink,
  markOwner = false,
  leavingOn,
  actions,
}: {
  people: CompanyUser[]
  roleNames: (code: string) => string
  /**
   * Draws the design's "Last signed in" column (Team members). The user record has no sign-in
   * time yet, so each cell reads "Not available yet" (TODO(backend): SETTINGS.md row 6.1).
   */
  lastSignedIn?: boolean
  /**
   * Draws the branches column (BA-1): "Every branch" for the Owner and Administrators, else the
   * person's branches by name. Absent, the column is not drawn.
   */
  branchName?: (id: string) => string | null
  /** Where the person's name leads (their own page); absent, the name is plain text. */
  personLink?: (person: CompanyUser) => string
  /** Marks the company's Owner (OW-1). */
  markOwner?: boolean
  /** The day a person removed at the renewal leaves (US-2); their status says so until then. */
  leavingOn?: (id: string) => string | null
  /** A last column with what can be done to the person (switch off, LG-2); absent, not drawn. */
  actions?: (person: CompanyUser) => ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-border-subtle">
          <tr>
            <th className={TH}>{t('team.col.person')}</th>
            <th className={TH}>{t('team.col.role')}</th>
            {branchName ? <th className={TH}>{t('branchAccess.col.branches')}</th> : null}
            <th className={TH}>{t('people.col.status')}</th>
            {lastSignedIn ? <th className={TH}>{t('team.col.lastSignedIn')}</th> : null}
            <th className={TH}>{t('people.col.authenticator')}</th>
            {actions ? (
              <th className={TH}>
                <span className="sr-only">{t('removal.actionsColumn')}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} className="border-b border-surface-background last:border-0">
              <td className={TD}>
                <span className="flex flex-wrap items-center gap-2">
                  {personLink ? (
                    <Link
                      to={personLink(person)}
                      className="font-semibold text-primary-700 transition-colors hover:text-primary-800"
                    >
                      {displayName(person)}
                    </Link>
                  ) : (
                    <span className="font-semibold">{displayName(person)}</span>
                  )}
                  {markOwner && person.owner ? <OwnerPill /> : null}
                </span>
                <span className="block text-text-tertiary">{person.email}</span>
              </td>
              <td className={TD}>
                {person.roles.length ? person.roles.map(roleNames).join(', ') : t('people.noRole')}
              </td>
              {branchName ? (
                <td className={TD}>
                  <BranchesCell person={person} branchName={branchName} />
                </td>
              ) : null}
              <td className={TD}>
                <StatusText person={person} leavingOn={leavingOn} />
              </td>
              {lastSignedIn ? (
                <td className={TD}>
                  <span className="text-text-quaternary">{t('team.notAvailableYet')}</span>
                </td>
              ) : null}
              <td className={TD}>
                {t(person.mfaEnabled ? 'people.authenticator.on' : 'people.authenticator.off')}
              </td>
              {actions ? <td className={`${TD} text-end`}>{actions(person)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusText({
  person,
  leavingOn,
}: {
  person: CompanyUser
  leavingOn?: (id: string) => string | null
}) {
  const { t, i18n } = useTranslation()
  const leaving = person.enabled ? (leavingOn?.(person.id) ?? null) : null
  return (
    <>
      {leaving
        ? t('removal.user.leaves', { date: formatDate(leaving, i18n.language) })
        : t(`people.status.${personStatus(person)}`)}
    </>
  )
}

/** The Owner's mark (OW-1), in the Pill shape the settings screens use for a state. */
export function OwnerPill() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex h-[22px] items-center rounded-[3px] bg-primary-50 px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-primary-800">
      {t('branchAccess.owner')}
    </span>
  )
}

/** Two names, then "+N": a person in many branches does not widen the row. */
function BranchesCell({
  person,
  branchName,
}: {
  person: CompanyUser
  branchName: (id: string) => string | null
}) {
  const { t } = useTranslation()
  if (seesEveryBranch(person)) return <>{t('branchAccess.everyBranch')}</>
  // An older server sends no branches at all, which is not the same as none.
  if (person.branchIds === undefined) {
    return <span className="text-text-quaternary">{t('branchAccess.notAvailableYet')}</span>
  }
  const names = (person.branchIds ?? [])
    .map(branchName)
    .filter((name): name is string => name !== null)
  if (names.length === 0) {
    return <span className="text-text-quaternary">{t('branchAccess.noBranch')}</span>
  }
  const shown = names.slice(0, 2).join(', ')
  return (
    <>
      {names.length > 2
        ? t('branchAccess.branchesAndMore', { names: shown, count: names.length - 2 })
        : shown}
    </>
  )
}
