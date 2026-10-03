import { useState, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import { Button, RowsView } from '../../components/ui'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead, type ConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import { formatMoment, formatUtcMoment, localeFor } from '../../lib/console/format'
import {
  BLOCKERS_PATH,
  FORWARD_TRANSITIONS,
  PID_POLICY_TYPE,
  POLICIES_ROUTE,
  POLICY_CONSOLE_PERMISSION,
  VERSION_PAGE_SIZE,
  isBlockerType,
  isVersionId,
  newerVersion,
  queueLabel,
  separationNote,
  versionPath,
  versionsPath,
  type BlockerOverviewEntry,
  type BlockerType,
  type BlockerVersionView,
  type PolicyFailure,
  type PolicyTransition,
} from '../../lib/console/validationPolicies'
import { peekEntitlements } from '../../lib/identity/entitlements'
import type { FormMessage } from '../../lib/identity/errors'
import { PidPolicyEditor, type EditorTarget } from './policies/PidPolicyEditor'
import { PolicyContents } from './policies/PolicyContents'
import { PolicyFailureNotice } from './policies/PolicyFailureNotice'
import { PolicyQueueLabel } from './policies/PolicyQueueLabel'
import { PolicyStatusPill } from './policies/PolicyStatusPill'
import { PolicyTrail } from './policies/PolicyTrail'
import { PolicyTransitionDialog } from './policies/PolicyTransitionDialog'
import { ReviewCard, ReviewLine } from './verification/ReviewCard'

/**
 * One validation policy: its versions, the selected version in full, and the steps the server
 * says this operator may take on it.
 *
 * Every button here is drawn from the version's `allowedActions`. Nothing compares user ids or
 * roles to decide what to offer, so the separation of duties cannot drift from what the server
 * enforces. There is no Figma frame for this screen: it is built from the console's existing
 * cards, lines, table and dialogs.
 */
export function ValidationPolicyPage() {
  return (
    <ConsoleShell requires={POLICY_CONSOLE_PERMISSION}>
      <PolicyDetail />
    </ConsoleShell>
  )
}

type Notice = { kind: 'done'; message: FormMessage } | { kind: 'failed'; failure: PolicyFailure }

function isNotFound(read: ConsoleRead<unknown>): boolean {
  return read.status === 'failed' && read.error instanceof ApiError && read.error.status === 404
}

function PolicyDetail() {
  const { t } = useTranslation()
  const { type } = useParams()

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <ConsoleBreadcrumbs
        items={[
          { labelKey: 'console.nav.policies', to: POLICIES_ROUTE },
          ...(isBlockerType(type) ? [{ labelKey: `console.policies.type.${type}` }] : []),
        ]}
      />
      {isBlockerType(type) ? (
        // Remounted per type, so a version answered for one policy is never shown under another.
        <PolicyVersions key={type} type={type} />
      ) : (
        <ConsoleNotice
          body={t('console.policies.notFound')}
          action={{ label: t('console.policies.back'), to: POLICIES_ROUTE }}
        />
      )}
    </div>
  )
}

function PolicyVersions({ type }: { type: BlockerType }) {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const requested = params.get('version')
  const authorable = type === PID_POLICY_TYPE

  const list = useConsoleRead<BlockerVersionView[]>(versionsPath(type))
  // Read only for the one type that can be authored here, and only for its `canCreateDraft`: the
  // version list says what may be done to a version, not whether a new one may be started.
  const overview = useConsoleRead<BlockerOverviewEntry[]>(authorable ? BLOCKERS_PATH : null)

  // A write's own answer, kept until a read as new or newer replaces it.
  const [answered, setAnswered] = useState<BlockerVersionView | null>(null)
  const [dialog, setDialog] = useState<PolicyTransition | null>(null)
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const versions = list.read.status === 'ready' ? list.read.data : null
  const listed =
    versions && requested !== null ? versions.find((entry) => entry.id === requested) : undefined
  // The list is one page of the newest. A version named in the URL but older than that page is
  // read on its own, and only then: never for a version the list or a write already supplied.
  const single = useConsoleRead<BlockerVersionView>(
    versions !== null && isVersionId(requested) && !listed && answered?.id !== requested
      ? versionPath(type, requested)
      : null,
  )

  const targetId = requested ?? versions?.[0]?.id ?? null
  const fromRead =
    requested === null
      ? (versions?.[0] ?? null)
      : (listed ?? (single.read.status === 'ready' ? single.read.data : null))
  const selected = newerVersion(
    fromRead,
    answered !== null && answered.id === targetId ? answered : null,
  )

  const canCreateDraft =
    authorable &&
    overview.read.status === 'ready' &&
    overview.read.data.some((entry) => entry.type === type && entry.canCreateDraft)

  const number = new Intl.NumberFormat(localeFor(i18n.language))

  const select = (versionId: string) => {
    setNotice(null)
    setParams({ version: versionId })
  }

  // Reads everything again, and forgets the write's answer so it cannot mask what comes back.
  const reload = () => {
    setAnswered(null)
    list.retry()
    single.retry()
    overview.retry()
  }

  const moved = (failure: PolicyFailure) => {
    setDialog(null)
    setNotice({ kind: 'failed', failure })
    reload()
  }

  const done = (updated: BlockerVersionView, messageKey: string) => {
    setDialog(null)
    setEditor(null)
    setAnswered(updated)
    setNotice({
      kind: 'done',
      message: { key: messageKey, values: { number: number.format(updated.versionNumber) } },
    })
    // The step may have moved other versions too (an activation supersedes the one in force), so
    // the list is read again rather than patched. The overview too: a new or ended draft changes
    // whether the server still offers "Create draft".
    list.retry()
    overview.retry()
  }

  let body: ReactNode
  if (isNotFound(list.read)) {
    body = (
      <ConsoleNotice
        body={t('console.policies.notFound')}
        action={{ label: t('console.policies.back'), to: POLICIES_ROUTE }}
      />
    )
  } else if (list.read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.policies.detail.loading')} />
  } else if (list.read.status === 'failed') {
    body = <ConsoleReadFailure error={list.read.error} retry={list.retry} />
  } else if (list.read.data.length === 0 && requested === null) {
    body = (
      <p className="rounded-md bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('console.policies.detail.noVersions')}
      </p>
    )
  } else {
    let detail: ReactNode
    if (selected) {
      detail = (
        <VersionView
          version={selected}
          canCreateDraft={canCreateDraft}
          onTransition={(transition) => {
            setNotice(null)
            setDialog(transition)
          }}
          onEdit={(target) => {
            setNotice(null)
            setEditor(target)
          }}
        />
      )
    } else if (!isVersionId(requested) || isNotFound(single.read)) {
      detail = <ConsoleNotice body={t('console.policies.detail.versionNotFound')} />
    } else if (single.read.status === 'failed') {
      detail = <ConsoleReadFailure error={single.read.error} retry={single.retry} />
    } else {
      detail = <ConsoleNotice busy body={t('console.policies.detail.loading')} />
    }
    body = (
      <>
        {list.read.data.length > 0 ? (
          <ReviewCard title={t('console.policies.detail.versions')}>
            <VersionTable
              versions={list.read.data}
              selectedId={selected?.id ?? null}
              onSelect={select}
            />
            {list.read.data.length >= VERSION_PAGE_SIZE ? (
              <p className="mt-3 text-xs font-medium text-text-quaternary">
                {t('console.policies.detail.newestOnly', { count: VERSION_PAGE_SIZE })}
              </p>
            ) : null}
          </ReviewCard>
        ) : null}
        {detail}
      </>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t(`console.policies.type.${type}`)}
          </h1>
          <p className="mt-1.5 text-sm font-medium text-text-quaternary">
            <span dir="ltr" className="break-all font-mono">
              {type}
            </span>
          </p>
        </div>
        {canCreateDraft ? (
          <Button
            type="button"
            size="md"
            className="shrink-0"
            onClick={() => {
              setNotice(null)
              setEditor({ mode: 'create', source: null })
            }}
          >
            {t('console.policies.action.create')}
          </Button>
        ) : null}
      </div>

      {notice?.kind === 'done' ? (
        <p
          role="status"
          className="rounded-md bg-surface-card p-5 text-sm font-medium leading-[1.6] text-text-tertiary"
        >
          {t(notice.message.key, notice.message.values)}
        </p>
      ) : null}
      {notice?.kind === 'failed' ? <PolicyFailureNotice card failure={notice.failure} /> : null}

      {body}

      {dialog && selected ? (
        <PolicyTransitionDialog
          version={selected}
          transition={dialog}
          onClose={() => setDialog(null)}
          onDone={(updated) =>
            done(
              updated,
              // A future effective date makes the server answer SCHEDULED, not ACTIVE: the policy in
              // force has not changed, so the notice must not say it has.
              dialog === 'activate' && updated.status === 'SCHEDULED'
                ? 'console.policies.done.activateScheduled'
                : `console.policies.done.${dialog}`,
            )
          }
          onMoved={moved}
        />
      ) : null}

      {editor ? (
        <PidPolicyEditor
          target={editor}
          onClose={() => setEditor(null)}
          onSaved={(saved, mode) => {
            done(
              saved,
              mode === 'edit' ? 'console.policies.done.saved' : 'console.policies.done.created',
            )
            // A new draft becomes the selected version; an edited one already is.
            if (mode === 'create') setParams({ version: saved.id })
          }}
          onMoved={reload}
        />
      ) : null}
    </>
  )
}

function VersionTable({
  versions,
  selectedId,
  onSelect,
}: {
  versions: BlockerVersionView[]
  selectedId: string | null
  onSelect: (versionId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const number = new Intl.NumberFormat(localeFor(i18n.language))

  return (
    <RowsView>
      <table className="w-full min-w-[680px] border-collapse text-start">
        <thead>
          <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
            <th className="px-4 py-3 text-start font-semibold">
              {t('console.policies.col.version')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.policies.col.status')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.policies.col.queue')}
            </th>
            <th className="px-2 py-3 text-start font-semibold">
              {t('console.policies.col.updated')}
            </th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const active = version.id === selectedId
            return (
              <tr
                key={version.id}
                className={[
                  'border-b border-[#f3f3f3] last:border-b-0',
                  active ? 'bg-primary-25' : '',
                ].join(' ')}
              >
                <td className="px-4 py-4">
                  <span className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(version.id)}
                      aria-pressed={active}
                      className={[
                        'text-start text-base leading-[1.2] hover:text-primary-800',
                        active ? 'font-semibold text-primary-800' : 'font-medium text-text-primary',
                      ].join(' ')}
                    >
                      {t('console.policies.version', {
                        number: number.format(version.versionNumber),
                      })}
                    </button>
                    {version.testOnly ? (
                      <span className="text-xs font-semibold uppercase tracking-[0.04em] text-pending-700">
                        {t('console.policies.testOnly')}
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-2 py-4">
                  <PolicyStatusPill status={version.status} />
                </td>
                <td className="px-2 py-4 text-sm font-medium text-text-secondary">
                  <PolicyQueueLabel version={version} />
                </td>
                <td className="px-2 py-4 text-sm font-medium text-text-secondary">
                  {formatMoment(version.updatedAt, i18n.language)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </RowsView>
  )
}

function VersionView({
  version,
  canCreateDraft,
  onTransition,
  onEdit,
}: {
  version: BlockerVersionView
  canCreateDraft: boolean
  onTransition: (transition: PolicyTransition) => void
  onEdit: (target: EditorTarget) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const none = t('console.policies.none')
  const number = new Intl.NumberFormat(localeFor(language))
  const moment = (iso: string | null) => (iso ? formatMoment(iso, language) : none)
  const effective = (iso: string | null) => (iso ? formatUtcMoment(iso, language) : none)
  const code = (value: string | null) =>
    value ? (
      <span dir="ltr" className="break-all font-mono">
        {value}
      </span>
    ) : (
      none
    )

  const authorable = version.type === PID_POLICY_TYPE
  const { allowedActions } = version
  const transitions = FORWARD_TRANSITIONS.filter((transition) => allowedActions[transition].allowed)
  // Read on its own and not from the reason approval was refused: rejecting has no separation of
  // duties, so an author who may not approve their own version may still be allowed to reject it.
  const canReject = allowedActions.reject.allowed
  // Never inferred from the status and the effective date here: a schedule that took effect is no
  // longer withdrawable, and only the server's clock can say it has.
  const canWithdraw = allowedActions.withdraw?.allowed === true
  // The editor exists for one type only, so a draft of any other type is never offered for editing
  // even where the server would allow it.
  const canEdit = authorable && allowedActions.editDraft.allowed
  const canCopy = authorable && canCreateDraft
  const separation = separationNote(version)
  const label = queueLabel(version)
  const blockedKey =
    label === 'approvedBlocked'
      ? 'console.policies.error.activationPrecondition'
      : label === 'approvedScheduledPending'
        ? 'console.policies.action.scheduledPending'
        : null
  const blocked = blockedKey !== null
  const nothingOffered =
    transitions.length === 0 && !canReject && !canWithdraw && !canEdit && !canCopy

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <ReviewCard title={t('console.policies.detail.section.details')}>
          <ReviewLine
            label={t('console.policies.detail.field.status')}
            value={<PolicyStatusPill status={version.status} />}
          />
          <ReviewLine
            label={t('console.policies.detail.field.version')}
            value={number.format(version.versionNumber)}
          />
          <ReviewLine
            label={t('console.policies.detail.field.lockVersion')}
            value={number.format(version.optimisticLockVersion)}
          />
          {version.testOnly ? (
            <ReviewLine
              label={t('console.policies.detail.field.testOnly')}
              value={t('common.yes')}
            />
          ) : null}
          <ReviewLine
            label={t('console.policies.detail.field.effectiveFrom')}
            value={effective(version.effectiveFrom)}
          />
          <ReviewLine
            label={t('console.policies.detail.field.effectiveTo')}
            value={effective(version.effectiveTo)}
          />
          <ReviewLine
            label={t('console.policies.detail.field.evidence')}
            value={code(version.evidenceReference)}
          />
          <ReviewLine
            label={t('console.policies.detail.field.reasonCode')}
            value={code(version.reasonCode)}
          />
          <ReviewLine
            label={t('console.policies.detail.field.contentHash')}
            value={code(version.contentHash)}
          />
          <ReviewLine
            label={t('console.policies.detail.field.updated')}
            value={moment(version.updatedAt)}
          />
        </ReviewCard>

        <ReviewCard title={t('console.policies.detail.section.contents')}>
          <PolicyContents version={version} />
        </ReviewCard>
      </div>

      <div className="flex w-full flex-col gap-4 xl:w-[380px] xl:shrink-0">
        <ReviewCard title={t('console.policies.detail.section.actions')}>
          <p className="pb-1 text-sm font-semibold leading-[1.6] text-text-secondary">
            <PolicyQueueLabel version={version} />
          </p>
          {separation ? (
            <p role="note" className="pb-1 text-sm font-medium leading-[1.6] text-pending-700">
              {t(`console.policies.separation.${separation}`)}
            </p>
          ) : null}
          {blockedKey ? (
            <p role="note" className="pb-1 text-sm font-medium leading-[1.6] text-pending-700">
              {t(blockedKey)}
            </p>
          ) : null}
          {nothingOffered && !separation && !blocked ? (
            <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('console.policies.action.none')}
            </p>
          ) : null}
          {nothingOffered ? null : (
            <div className="mt-3 flex flex-col gap-2.5">
              {transitions.map((transition) => (
                <Button
                  key={transition}
                  type="button"
                  size="md"
                  fullWidth
                  onClick={() => onTransition(transition)}
                >
                  {t(`console.policies.action.${transition}`)}
                </Button>
              ))}
              {canReject ? (
                // Drawn as the console's other refusals are ("Reject ID", "Reject registration"):
                // the secondary button under the step it is the alternative to.
                <Button
                  type="button"
                  size="md"
                  variant="secondary"
                  fullWidth
                  onClick={() => onTransition('reject')}
                >
                  {t('console.policies.action.reject')}
                </Button>
              ) : null}
              {canWithdraw ? (
                // Secondary like Reject: it ends a version instead of advancing it.
                <Button
                  type="button"
                  size="md"
                  variant="secondary"
                  fullWidth
                  onClick={() => onTransition('withdraw')}
                >
                  {t('console.policies.action.withdraw')}
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  type="button"
                  size="md"
                  variant="secondary"
                  fullWidth
                  onClick={() => onEdit({ mode: 'edit', source: version })}
                >
                  {t('console.policies.action.edit')}
                </Button>
              ) : null}
              {canCopy ? (
                <Button
                  type="button"
                  size="md"
                  variant="secondary"
                  fullWidth
                  onClick={() => onEdit({ mode: 'create', source: version })}
                >
                  {t('console.policies.action.newFrom')}
                </Button>
              ) : null}
            </div>
          )}
        </ReviewCard>

        <ReviewCard title={t('console.policies.detail.section.trail')}>
          <PolicyTrail version={version} currentUserId={peekEntitlements()?.userId ?? null} />
        </ReviewCard>
      </div>
    </div>
  )
}
