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
import { Select, Switch } from '../../components/ui'
import { PEOPLE_PATH, USERS_PERMISSION, loadPeople, type UserPage } from '../../api/settings/people'
import { PeopleTable } from './people'
import { useRoleNames } from './peopleView'

/**
 * Settings › Signing in: who has an authenticator app set up, from the same `GET /v1/users` the
 * Team screen reads.
 *
 * PR #166 removed the "require it of everyone" switch and the session lengths because no tenant
 * policy endpoint stands behind them. They are drawn again, disabled and marked "Not available
 * yet" (SETTINGS.md rows 9.1 and 9.2), so the screen keeps what the Settings hub card promises
 * without pretending to save anything; the notice says those rules are Fawtir's for now.
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
  return useCan(USERS_PERMISSION) ? <SigningIn /> : <PermissionDeniedNotice />
}

function SigningIn() {
  const { t } = useTranslation()
  const people = useApiRead<UserPage>(PEOPLE_PATH, loadPeople)
  const roleNames = useRoleNames()
  const list = people.read.status === 'ready' ? people.read.data : null
  const complete = list !== null && list.totalElements === list.content.length

  return (
    <>
      <section aria-labelledby="signing-in-two-step" className="overflow-hidden rounded-md bg-surface-card">
        <div className="p-5">
          <h3 id="signing-in-two-step" className="text-lg font-semibold leading-[1.2] text-text-primary">
            {t('signingIn.twoStep')}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">{t('signingIn.twoStepNote')}</p>
        </div>
        <ul>
          {/* TODO(backend): SETTINGS.md row 9.1. No tenant two-step policy to read or save. */}
          <ToggleRow
            title={t('signingIn.requireEveryone')}
            note={
              complete
                ? t('signingIn.requireEveryoneNote', {
                    count: list.content.filter((person) => !person.mfaEnabled).length,
                    total: list.content.length,
                  })
                : undefined
            }
          />
        </ul>
      </section>

      {/* TODO(backend): SETTINGS.md row 9.2. No session-length policy to read or save. */}
      <section aria-labelledby="signing-in-sessions" className="overflow-hidden rounded-md bg-surface-card">
        <div className="p-5">
          <h3 id="signing-in-sessions" className="text-lg font-semibold leading-[1.2] text-text-primary">
            {t('signingIn.sessions')}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">{t('signingIn.sessionsNote')}</p>
        </div>
        <div className="grid gap-5 p-5 pt-0 md:grid-cols-2">
          <div>
            <span className="mb-1 block text-sm font-medium text-text-primary">
              {t('signingIn.sessionLength')}
            </span>
            <Select
              ariaLabel={t('signingIn.sessionLength')}
              value=""
              placeholder={t('signingIn.notAvailableYet')}
              onChange={() => {}}
              disabled
              options={['day', 'week', 'fortnight', 'month'].map((id) => ({
                value: id,
                label: t(`signingIn.sessionOption.${id}`),
              }))}
            />
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium text-text-primary">
              {t('signingIn.tillLength')}
            </span>
            <Select
              ariaLabel={t('signingIn.tillLength')}
              value=""
              placeholder={t('signingIn.notAvailableYet')}
              onChange={() => {}}
              disabled
              options={['shift', 'day', 'never'].map((id) => ({
                value: id,
                label: t(`signingIn.tillOption.${id}`),
              }))}
            />
          </div>
        </div>
      </section>

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
    </>
  )
}

/** A designed switch the API cannot answer yet: drawn off, disabled, and saying so. */
function ToggleRow({ title, note }: { title: string; note?: string }) {
  const { t } = useTranslation()
  return (
    <li className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-[1.3] text-text-primary">{title}</p>
        {note ? (
          <p className="mt-1 max-w-[560px] text-xs font-medium leading-[1.5] text-text-quaternary">{note}</p>
        ) : null}
        <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
          {t('signingIn.notAvailableYet')}
        </p>
      </div>
      <Switch checked={false} onChange={() => {}} disabled label={title} />
    </li>
  )
}
