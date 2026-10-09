import { useTranslation } from 'react-i18next'
import { displayName, type CompanyUser } from '../../api/settings/people'
import { TD, TH, personStatus } from './peopleView'

export function PeopleTable({
  people,
  roleNames,
}: {
  people: CompanyUser[]
  roleNames: (code: string) => string
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
