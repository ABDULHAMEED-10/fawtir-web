import { useTranslation } from 'react-i18next'
import { displayName, type CompanyUser } from '../../api/settings/people'
import { TD, TH, personStatus } from './peopleView'

export function PeopleTable({
  people,
  roleNames,
  lastSignedIn = false,
}: {
  people: CompanyUser[]
  roleNames: (code: string) => string
  /**
   * Draws the design's "Last signed in" column (Team members). The user record has no sign-in
   * time yet, so each cell reads "Not available yet" (TODO(backend): SETTINGS.md row 6.1).
   */
  lastSignedIn?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-border-subtle">
          <tr>
            <th className={TH}>{t('team.col.person')}</th>
            <th className={TH}>{t('team.col.role')}</th>
            <th className={TH}>{t('people.col.status')}</th>
            {lastSignedIn ? <th className={TH}>{t('team.col.lastSignedIn')}</th> : null}
            <th className={TH}>{t('people.col.authenticator')}</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} className="border-b border-surface-background last:border-0">
              <td className={TD}>
                <span className="block font-semibold">{displayName(person)}</span>
                <span className="block text-text-tertiary">{person.email}</span>
              </td>
              <td className={TD}>
                {person.roles.length ? person.roles.map(roleNames).join(', ') : t('people.noRole')}
              </td>
              <td className={TD}>{t(`people.status.${personStatus(person)}`)}</td>
              {lastSignedIn ? (
                <td className={TD}>
                  <span className="text-text-quaternary">{t('team.notAvailableYet')}</span>
                </td>
              ) : null}
              <td className={TD}>
                {t(person.mfaEnabled ? 'people.authenticator.on' : 'people.authenticator.off')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
