import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, withRial } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  formatAmount,
  offersErpAddon,
  planHistoryPath,
  type CatalogueAdminPlan,
  type PlanEvent,
  type PlanHistory,
  type PlanVersion,
} from '../../../lib/console/planCatalogue'
import { formatInstant } from '../../../lib/format'
import { peekEntitlements } from '../../../lib/identity/entitlements'
import { displayPlanName } from './planName'

/** The editor's own labels for the fields a change can name; anything else shows its key. */
const FIELD_LABELS: Record<string, string> = {
  nameEn: 'console.plans.field.nameEn',
  nameAr: 'console.plans.field.nameAr',
  descriptionEn: 'console.plans.field.descriptionEn',
  descriptionAr: 'console.plans.field.descriptionAr',
  active: 'console.plans.field.active',
  publicVisible: 'console.plans.field.publicVisible',
  recommended: 'console.plans.field.recommended',
  sortOrder: 'console.plans.field.sortOrder',
  annualFreeMonths: 'console.plans.field.annualFreeMonths',
  trialDays: 'console.plans.field.trialDays',
  trialDocuments: 'console.plans.field.trialDocuments',
  monthlyPrice: 'console.plans.field.monthlyPrice',
  invoicesPerMonth: 'console.plans.field.invoicesPerMonth',
  peopleIncluded: 'console.plans.field.peopleIncluded',
  extraPersonPrice: 'console.plans.field.extraPersonPrice',
  branchesIncluded: 'console.plans.field.branchesIncluded',
  extraBranchPrice: 'console.plans.field.extraBranchPrice',
  overagePricePerInvoice: 'console.plans.field.overagePrice',
  erpAddonMonthlyPrice: 'console.plans.field.erpAddonPrice',
  apiAccess: 'console.plans.field.apiAccess',
  prioritySupport: 'console.plans.field.prioritySupport',
}

const KNOWN_KINDS = new Set([
  'CREATED',
  'UPDATED',
  'PRICE_VERSION_PUBLISHED',
  'ACTIVATED',
  'DEACTIVATED',
  'VISIBILITY_CHANGED',
  'FEATURES_CHANGED',
])

const isBeforeAfter = (value: unknown): value is { before: unknown; after: unknown } =>
  typeof value === 'object' && value !== null && 'before' in value && 'after' in value

/**
 * A plan's catalogue history, read-only: every published price version and every recorded
 * change, newest first, with who made it. It is the only record of who changed a price, so it
 * shows what the server recorded and nothing derived.
 */
export function PlanHistoryPanel({
  plan,
  onClose,
}: {
  plan: CatalogueAdminPlan
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<PlanHistory>(planHistoryPath(plan.code))
  const name = displayPlanName(plan, i18n.language)

  let body: ReactNode
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.plans.history.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else {
    // Newest first whatever order arrives: the panel answers "what is the latest change".
    const versions = [...(read.data.versions ?? [])].sort(
      (a, b) => b.versionNumber - a.versionNumber,
    )
    const events = [...(read.data.events ?? [])].sort((a, b) =>
      a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
    )
    body = (
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3" aria-labelledby="plan-history-versions">
          <p
            id="plan-history-versions"
            className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary"
          >
            {t('console.plans.history.versions')}
          </p>
          {versions.length === 0 ? (
            <p className="text-sm font-medium text-text-tertiary">
              {t('console.plans.history.noVersions')}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {versions.map((version) => (
                <VersionEntry
                  key={version.id}
                  version={version}
                  current={version.id === plan.currentVersion.id}
                  erpAddonOffered={offersErpAddon(plan)}
                />
              ))}
            </ol>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="plan-history-events">
          <p
            id="plan-history-events"
            className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary"
          >
            {t('console.plans.history.events')}
          </p>
          {events.length === 0 ? (
            <p className="text-sm font-medium text-text-tertiary">
              {t('console.plans.history.noEvents')}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {events.map((event) => (
                <EventEntry key={event.id} event={event} />
              ))}
            </ol>
          )}
        </section>
      </div>
    )
  }

  return (
    <Modal
      open
      width={680}
      onClose={onClose}
      title={t('console.plans.history.title', { name })}
      subtitle={t('console.plans.history.subtitle')}
      footer={
        <div className="flex justify-end">
          <ConsoleButton type="button" size="md" variant="secondary" onClick={onClose}>
            {t('common.close')}
          </ConsoleButton>
        </div>
      }
    >
      {body}
    </Modal>
  )
}

function useActor() {
  const { t } = useTranslation()
  const me = peekEntitlements()?.userId ?? null
  return (actorId: string | null) =>
    actorId === null ? (
      t('console.plans.history.system')
    ) : actorId === me ? (
      t('console.plans.history.you')
    ) : (
      // Only the operator's id is recorded; it is shown as recorded rather than guessed at.
      <bdi dir="ltr" className="font-mono text-[11px]">
        {actorId}
      </bdi>
    )
}

function VersionEntry({
  version,
  current,
  erpAddonOffered,
}: {
  version: PlanVersion
  current: boolean
  erpAddonOffered: boolean
}) {
  const { t, i18n } = useTranslation()
  const actor = useActor()
  return (
    <li className="rounded-sm border border-border-subtle p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-text-primary">
          {t('console.plans.history.version', { version: version.versionNumber })}
          {current ? (
            <span className="ms-2 text-xs font-medium text-primary-700">
              {t('console.plans.history.current')}
            </span>
          ) : null}
        </p>
        <p className="text-xs font-medium text-text-quaternary">
          {t('console.plans.history.effective', {
            date: formatInstant(version.effectiveFrom, i18n.language),
          })}
        </p>
      </div>
      <p className="mt-2 text-sm font-medium text-text-tertiary">
        {withRial(
          t('console.plans.history.prices', {
            monthly: `OMR ${formatAmount(version.monthlyPrice)}`,
            annual: `OMR ${formatAmount(version.annualPrice)}`,
          }),
        )}
      </p>
      {erpAddonOffered && version.erpAddonMonthlyPrice ? (
        <p className="mt-1 text-sm font-medium text-text-tertiary">
          {withRial(
            t('console.plans.history.erpAddon', {
              amount: `OMR ${formatAmount(version.erpAddonMonthlyPrice)}`,
            }),
          )}
        </p>
      ) : null}
      <p className="mt-1 text-sm font-medium text-text-tertiary">
        {t('console.plans.history.limits', {
          invoices: version.invoicesPerMonth.toLocaleString('en-US'),
          people: version.peopleIncluded,
          branches:
            version.branchesIncluded === null
              ? t('console.plans.history.unlimited')
              : version.branchesIncluded,
        })}
      </p>
      <p className="mt-2 text-sm font-medium text-text-secondary">
        {t('console.plans.history.reason')}: {version.reason || t('console.plans.history.none')}
      </p>
      <p className="mt-1 text-xs font-medium text-text-quaternary">
        {t('console.plans.history.by')} {actor(version.createdBy)}
      </p>
    </li>
  )
}

function EventEntry({ event }: { event: PlanEvent }) {
  const { t, i18n } = useTranslation()
  const actor = useActor()
  const shown = (value: unknown): string => {
    if (value === null || value === undefined || value === '')
      return t('console.plans.history.none')
    if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no')
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    return JSON.stringify(value)
  }
  const label = (key: string): ReactNode =>
    FIELD_LABELS[key] ? (
      t(FIELD_LABELS[key])
    ) : (
      <bdi dir="ltr" className="font-mono text-[11px]">
        {key}
      </bdi>
    )
  return (
    <li className="rounded-sm border border-border-subtle p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-text-primary">
          {KNOWN_KINDS.has(event.kind)
            ? t(`console.plans.history.kind.${event.kind}`)
            : t('console.plans.history.kind.other')}
        </p>
        <p className="text-xs font-medium text-text-quaternary">
          {formatInstant(event.occurredAt, i18n.language)}
        </p>
      </div>
      {event.changes && Object.keys(event.changes).length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {Object.entries(event.changes).map(([key, value]) => (
            <li key={key} className="text-sm font-medium text-text-tertiary">
              {label(key)}:{' '}
              {isBeforeAfter(value) ? (
                <>
                  <bdi>{shown(value.before)}</bdi> → <bdi>{shown(value.after)}</bdi>
                </>
              ) : (
                <bdi>{shown(value)}</bdi>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-xs font-medium text-text-quaternary">
        {t('console.plans.history.by')} {actor(event.actorId)}
      </p>
    </li>
  )
}
