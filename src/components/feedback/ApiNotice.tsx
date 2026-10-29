import { useTranslation } from 'react-i18next'
// The console already draws these states (a card with a pill, a spinner or an alert). Borrowed
// as it is, so a customer-app state looks identical to a console one, and neither copy can drift
// from the other.
import { ConsoleNotice } from '../../layouts/ConsoleShell/ConsoleNotice'
import { ApiError } from '../../api'
import { describeApiFailure, isNotFound, isPermissionDenied } from '../../lib/apiFailure'

export { ConsoleNotice as Notice }

/** A screen, or one panel of it, waiting on its first answer. */
export function LoadingNotice({ label }: { label?: string }) {
  const { t } = useTranslation()
  return <ConsoleNotice busy body={label ?? t('appAccess.loading')} />
}

/** Nothing the user can do about it here: the server refused them, or the record is not there. */
export function PermissionDeniedNotice() {
  const { t } = useTranslation()
  return <ConsoleNotice badge={t('appAccess.noAccess')} body={t('appAccess.missingPermission')} />
}

/**
 * A read that failed.
 *
 * A `403` reads as "no access", never as an empty list, which would claim there is nothing there.
 * A `404` reads as not found, and so does a `400`: on a read the only input is the address, so a
 * refused one (a malformed id) names a record that cannot exist, and "Some details were not
 * accepted. Check the form" pointed at a form the reader never had. Retrying either cannot help.
 * Anything else can be retried, and shows the request's reference so a support conversation can
 * find it. (A `401` never gets here: `useApiRead` sends the reader to
 * sign in.)
 */
export function ApiReadFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useTranslation()
  if (isPermissionDenied(error)) return <PermissionDeniedNotice />
  const unreadable = error instanceof ApiError && error.status === 400
  const message = unreadable
    ? { key: 'apiErrors.notFound', values: undefined, reference: error.correlationId }
    : describeApiFailure(error)
  const body = t(message.key, message.values)
  const withReference = message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
  if (unreadable || isNotFound(error))
    return <ConsoleNotice badge={t('appAccess.notFound')} body={withReference} />
  return <ConsoleNotice body={withReference} action={{ label: t('appAccess.retry'), onClick: retry }} />
}
