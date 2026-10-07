import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmailText } from './EmailText'
import { RowsView } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { localeFor } from '../../../lib/console/format'
import { DEACTIVATED_OPERATORS_PATH } from '../../../lib/console/operatorReactivation'
import { displayName, type PlatformUser, type UserPage } from '../../../lib/console/platformOperators'
import { ReactivateOperatorDialog } from './ReactivateOperatorDialog'
import {
  CONSOLE_CARD,
  CONSOLE_CARD_TITLE,
  CONSOLE_ROWS,
  CONSOLE_TABLE,
  CONSOLE_TABLE_BODY,
  CONSOLE_THEAD,
  ConsoleButton,
} from '../../../layouts/ConsoleShell/consoleStyle'

/** Where each person changed on this screen now stands, as the page tracks it. */
export type LifecycleStatus = 'active' | 'deactivated'

/**
 * Operators whose access was ended, and the way to give it back.
 *
 * Read only when asked for: bringing someone back is rare, and the screen already reads three
 * things on every visit. Someone reactivated here leaves this list for the team; someone
 * deactivated here joins it at the top, as the most recently deactivated.
 */
export function DeactivatedOperators({
  deactivatedHere,
  statuses,
  onReactivated,
}: {
  /** People deactivated on this screen, newest first. */
  deactivatedHere: readonly PlatformUser[]
  /** The latest change made here to each person, which outranks what was read. */
  statuses: ReadonlyMap<string, LifecycleStatus>
  onReactivated: (user: PlatformUser) => void
}) {
  const { t, i18n } = useTranslation()
  const [shown, setShown] = useState(false)
  const { read, retry } = useConsoleRead<UserPage>(shown ? DEACTIVATED_OPERATORS_PATH : null)
  const [reactivating, setReactivating] = useState<PlatformUser | null>(null)
  const number = new Intl.NumberFormat(localeFor(i18n.language))

  let body
  if (!shown) {
    body = (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm font-medium text-text-tertiary">{t('console.operators.deactivated.intro')}</p>
        <ConsoleButton type="button" size="md" variant="secondary" onClick={() => setShown(true)}>
          {t('console.operators.deactivated.show')}
        </ConsoleButton>
      </div>
    )
  } else if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.operators.deactivated.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else {
    const listed = read.data.content.filter((user) => !deactivatedHere.some((here) => here.id === user.id))
    const people = [...deactivatedHere, ...listed].filter((user) => statuses.get(user.id) !== 'active')
    body =
      people.length === 0 ? (
        <p className="py-6 text-center text-sm font-medium text-text-tertiary">
          {t('console.operators.deactivated.empty')}
        </p>
      ) : (
        <>
          <RowsView className={CONSOLE_ROWS}>
            <table className={`${CONSOLE_TABLE} min-w-[640px]`}>
              <thead>
                <tr className={CONSOLE_THEAD}>
                  <th className="px-4 py-3 text-start font-semibold">{t('console.operators.col.person')}</th>
                  <th className="px-2 py-3 text-start font-semibold">{t('console.operators.col.email')}</th>
                  <th className="px-4 py-3 text-end font-semibold">
                    <span className="sr-only">{t('console.operators.col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {people.map((user) => {
                  const name = displayName(user)
                  return (
                    <tr key={user.id} className="border-b border-[#f3f3f3] last:border-b-0">
                      <td className="px-4 py-4">
                        <span className={CONSOLE_CARD_TITLE}>{name}</span>
                        {name !== user.username ? (
                          <span className="mt-1 block text-xs font-medium text-text-quaternary">
                            <bdi>{user.username}</bdi>
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-4 text-sm font-medium text-text-secondary">
                        <EmailText email={user.email} />
                      </td>
                      <td className="px-4 py-4 text-end">
                        <ConsoleButton
                          type="button"
                          size="md"
                          variant="small"
                          aria-label={t('console.operators.deactivated.reactivateFor', { name })}
                          onClick={() => setReactivating(user)}
                        >
                          {t('console.operators.deactivated.reactivate')}
                        </ConsoleButton>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </RowsView>
          {read.data.totalElements > read.data.content.length ? (
            <p className="mt-3 text-sm font-medium text-text-tertiary">
              {t('console.operators.deactivated.more', {
                shown: number.format(read.data.content.length),
                total: number.format(read.data.totalElements),
              })}
            </p>
          ) : null}
        </>
      )
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-medium leading-[1.2] text-text-primary">{t('console.operators.deactivated.title')}</h2>
      <div className={`${CONSOLE_CARD} ${CONSOLE_TABLE_BODY}`}>{body}</div>
      {reactivating ? (
        <ReactivateOperatorDialog
          user={reactivating}
          onClose={() => setReactivating(null)}
          onReactivated={(user) => {
            setReactivating(null)
            onReactivated(user)
          }}
        />
      ) : null}
    </section>
  )
}
