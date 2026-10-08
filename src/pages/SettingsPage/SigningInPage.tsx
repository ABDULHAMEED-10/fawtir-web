import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { useApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { PEOPLE_PATH, USERS_PERMISSION, loadPeople, type UserPage } from '../../api/settings/people'
import { PeopleTable } from './people'
import { useRoleNames } from './peopleView'

/**
 * Settings › Signing in: who has an authenticator app set up, from the same `GET /v1/users` the
 * Team screen reads. The session-length and "require it of everyone" switches it used to offer
 * saved nothing — no tenant policy endpoint stands behind them — so they are gone rather than
 * left pretending; the screen says those rules are Fawtir's for now.
 */
export function SigningInPage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="people">
      <SettingsHeader title={t('signingIn.title')} subtitle={t('people.signingIn.subtitle')} />
      <Notice body={t('people.signingIn.policy')} />
      <Gate />
    </SettingsShell>
  )
}

/** Inside the shell, which is what provides the session the permission is read from. */
function Gate() {
  return useCan(USERS_PERMISSION) ? <WhoHasIt /> : <PermissionDeniedNotice />
}

function WhoHasIt() {
  const { t } = useTranslation()
  const people = useApiRead<UserPage>(PEOPLE_PATH, loadPeople)
  const roleNames = useRoleNames()

  return (
    <section aria-labelledby="signing-in-who" className="flex flex-col gap-3 rounded-md bg-surface-card p-5">
      <h3 id="signing-in-who" className="text-lg font-semibold text-text-primary">
        {t('signingIn.whoHasIt')}
      </h3>
      {people.read.status === 'loading' ? (
        <LoadingNotice />
      ) : people.read.status === 'failed' ? (
        <ApiReadFailure error={people.read.error} retry={people.retry} />
      ) : people.read.data.content.length === 0 ? (
        <Notice body={t('people.team.empty')} />
      ) : (
        <>
          <p className="text-sm font-medium text-text-tertiary">
            {t('people.signingIn.count', {
              count: people.read.data.content.filter((person) => person.mfaEnabled).length,
              total: people.read.data.content.length,
            })}
          </p>
          <PeopleTable people={people.read.data.content} roleNames={roleNames} />
        </>
      )}
    </section>
  )
}
