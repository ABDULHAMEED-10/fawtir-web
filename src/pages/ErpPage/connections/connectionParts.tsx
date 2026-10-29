import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pill } from '../ErpShell'
import { SecondaryLink } from '../overview/idiom'
import { SettingsShell, SettingsHeader } from '../../SettingsPage/SettingsShell'
import { Notice } from '../../../components/feedback/ApiNotice'
import { describeApiFailure } from '../../../lib/apiFailure'
import { erpRefusalKey, needsReload } from '../../../lib/erp/connectionPolicy'
import { EXTRACTION_STATUS_TONE } from '../../../lib/erp/extractionTone'
import type {
  ConnectionHealthDto,
  ErpConnectionState,
  ErpConnectionTestOutcome,
} from '../../../api/erp/connections'
import type { ExtractionStatusCode } from '../../../api/erp/extraction'

/** The four real states in the app's pill idiom. There is deliberately no ACTIVE and no ERROR. */
const STATE_TONE: Record<ErpConnectionState, 'danger' | 'success' | 'pending' | 'neutral'> = {
  DRAFT: 'neutral',
  READY: 'success',
  DISABLED: 'pending',
  ARCHIVED: 'neutral',
}

export function ConnectionStatePill({ state }: { state: ErpConnectionState }) {
  const { t } = useTranslation()
  return <Pill tone={STATE_TONE[state]} label={t(`erp.connections.state.${state}`)} />
}

/** A status the build does not know is shown neutral, in the server's own word. */
export function ExtractionStatusPill({ status }: { status: string }) {
  const { t } = useTranslation()
  const tone = Object.hasOwn(EXTRACTION_STATUS_TONE, status) ? EXTRACTION_STATUS_TONE[status as ExtractionStatusCode] : 'neutral'
  return <Pill tone={tone} label={t(`erp.extraction.state.${status}`, { defaultValue: status })} />
}

/** The channel's extraction headline, or why there is none. Shared with the connection list. */
export function CollectionCell({ health }: { health: ConnectionHealthDto | undefined }) {
  const { t } = useTranslation()
  if (!health) return <span className="text-text-quaternary">—</span>
  if (health.connectionMode !== 'MANAGED_PULL') {
    return (
      <span className="text-xs font-medium text-text-quaternary">
        {t('erp.home.connections.notPulled')}
      </span>
    )
  }
  if (!health.extractionReadable || health.extractionStatus === null) {
    return <Pill tone="danger" label={t('erp.home.connections.unreadable')} />
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <ExtractionStatusPill status={health.extractionStatus} />
      {health.consecutiveFailures > 0 ? (
        <span className="text-xs font-medium text-text-quaternary">
          {t('erp.home.connections.failures', { count: health.consecutiveFailures })}
        </span>
      ) : null}
    </div>
  )
}

export function TestOutcomePill({ outcome }: { outcome: ErpConnectionTestOutcome }) {
  const { t } = useTranslation()
  return (
    <Pill
      tone={outcome === 'SUCCESS' ? 'success' : 'danger'}
      label={t(`erp.connections.test.${outcome === 'SUCCESS' ? 'success' : 'failure'}`)}
    />
  )
}

/**
 * A failed mutation, said once and said specifically.
 *
 * The ERP module's own refusal codes come first, because each calls for a different action —
 * reload for a version conflict, a new name for a duplicate, a fix for an invalid configuration —
 * and one generic "something went wrong" would convey none of that. Whatever the module does not
 * name falls through to the app's shared `describeApiFailure`, which already handles 403, 404 and
 * the network cases.
 *
 * Reload is offered only for the refusals that mean the screen is out of date. Offering it on a
 * duplicate-name error would be wrong advice, not merely unhelpful.
 */
export function ConnectionFailure({ error, onReload }: { error: unknown; onReload?: () => void }) {
  const { t } = useTranslation()
  if (error === null || error === undefined) return null

  const refusal = erpRefusalKey(error)
  const generic = describeApiFailure(error)
  const body = refusal !== null ? t(refusal) : t(generic.key, generic.values)
  const withReference =
    generic.reference !== null ? `${body} ${t('apiErrors.reference', { id: generic.reference })}` : body

  return (
    <Notice
      body={withReference}
      action={
        onReload !== undefined && needsReload(error)
          ? { label: t('erp.connections.reload'), onClick: onReload }
          : undefined
      }
    />
  )
}

/** A short confirmation after a successful write, in the same card idiom as the failures. */
export function ConnectionNotice({ children }: { children: ReactNode }) {
  return (
    <section
      role="status"
      className="rounded-md bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary"
    >
      {children}
    </section>
  )
}

/**
 * The frame for a connection screen that has no backend behind it.
 *
 * Used by the four extraction-domain screens — runs, records, write-back and the per-connection
 * mapping view. They stay as reachable URLs rather than being deleted, so an existing bookmark
 * does not 404, but they are **off the tab strip** and say plainly that the feature is not
 * switched on.
 *
 * The alternative was leaving them rendering invented run counts, watermarks and sync health.
 * That is worse than an empty screen: a tenant reading "3 collected, 1 rejected" has no way to
 * tell that none of it happened, and would reasonably conclude their invoices are being submitted.
 */
export function ConnectionFeatureUnavailable({ connectionId }: { connectionId?: string }) {
  const { t } = useTranslation()
  return (
    <SettingsShell group="integration">
      <SettingsHeader
        title={t('erp.connections.unavailable.title')}
        subtitle={t('erp.connections.unavailable.body')}
      />
      <div>
        <SecondaryLink
          to={
            connectionId === undefined
              ? '/settings/erp/connections'
              : `/settings/erp/connections/${connectionId}`
          }
        >
          {t('erp.connections.backToList')}
        </SecondaryLink>
      </div>
    </SettingsShell>
  )
}
