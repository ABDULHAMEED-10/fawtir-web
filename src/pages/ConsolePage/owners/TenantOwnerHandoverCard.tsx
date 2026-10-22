import { useState } from 'react'
import { ApiError } from '../../../api'
import { useTranslation } from 'react-i18next'
import { Input, Select } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import {
  ConsoleStatusPill,
  type ConsolePillTone,
} from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import {
  CONSOLE_PRIMARY,
  CONSOLE_SECONDARY,
  CONSOLE_SMALL,
  CONSOLE_SMALL_PRIMARY,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { hasPermission } from '../../../lib/identity/entitlements'
import { formatInstant } from '../../../lib/format'
import {
  OWNERS_MANAGE_PERMISSION,
  OWNER_TEXT_MAX,
  cancelOwnerHandover,
  candidateLabel,
  confirmOwnerHandover,
  ownerCandidatesPath,
  ownerHandoverPath,
  ownerRefusalKey,
  requestOwnerHandover,
  type HandoverStatus,
  type OwnerCandidateDto,
  type OwnerHandoverDto,
} from '../../../lib/console/companyOwners'

const K = 'console.owners.handover.'

const TONE: Record<HandoverStatus, ConsolePillTone> = {
  REQUESTED: 'pending',
  CONFIRMED: 'success',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
}

/**
 * "Change the Owner" on a company's console page (Business Rules OW-4: "through Fawtir support
 * with proof if the Owner cannot be reached"). One operator asks, naming an enabled Administrator,
 * the reason and the proof; a different operator confirms; a request nobody confirms expires. The
 * server enforces each of these; this card only offers what can follow.
 */
export function TenantOwnerHandoverCard({ tenantId }: { tenantId: string }) {
  const { t, i18n } = useTranslation()
  const { entitlements } = useEntitlements()
  const canManage = entitlements !== null && hasPermission(entitlements, OWNERS_MANAGE_PERMISSION)
  const me = entitlements?.userId ?? null
  const history = useConsoleRead<OwnerHandoverDto[]>(canManage ? ownerHandoverPath(tenantId) : null)
  const people = useConsoleRead<OwnerCandidateDto[]>(
    canManage ? ownerCandidatesPath(tenantId) : null,
  )
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  if (!canManage) return null

  const frame = (children: React.ReactNode) => (
    <section
      aria-labelledby="tenant-owner-handover"
      className="flex flex-col gap-4 rounded-sm bg-surface-card p-5"
    >
      <h2 id="tenant-owner-handover" className="text-[17px] font-semibold text-text-primary">
        {t(`${K}title`)}
      </h2>
      {children}
    </section>
  )

  if (history.read.status === 'loading' || people.read.status === 'loading')
    return frame(<ConsoleNotice busy body={t(`${K}loading`)} />)
  // Only business companies have an Owner; for anything else the server answers "not found".
  if (
    people.read.status === 'failed' &&
    people.read.error instanceof ApiError &&
    people.read.error.status === 404
  )
    return null
  if (history.read.status === 'failed')
    return frame(<ConsoleReadFailure error={history.read.error} retry={history.retry} />)
  if (people.read.status === 'failed')
    return frame(<ConsoleReadFailure error={people.read.error} retry={people.retry} />)

  const candidates = people.read.data
  const requests = history.read.data
  // Only enabled Administrators are listed with a name; anyone else (no longer an Administrator,
  // switched off or removed) is "a former user", never a raw user id.
  const nameOf = (userId: string) => {
    const person = candidates.find((c) => c.userId === userId)
    return person ? candidateLabel(person) : t(`${K}formerUser`)
  }
  const owner = candidates.find((c) => c.isOwner)
  const targets = candidates.filter((c) => !c.isOwner)
  const open = requests.find(
    (r) => r.status === 'REQUESTED' && Date.parse(r.expiresAt) > Date.now(),
  )

  const act = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true)
    setFailure(null)
    setDone(null)
    try {
      await work()
      setDone(message)
    } catch (error) {
      setFailure(t(ownerRefusalKey(error)))
    } finally {
      setBusy(false)
      history.retry()
      people.retry()
    }
  }

  return frame(
    <>
      {/* The candidates are enabled Administrators only, so an Owner who is not one (switched off,
          or no longer an Administrator) is simply absent here. That is not "no Owner": the server
          gives no per-company "no Owner" answer on this read, so say nothing rather than guess. */}
      {owner ? (
        <p className="text-sm leading-[1.6] text-text-secondary">
          {t(`${K}owner`, { name: candidateLabel(owner) })}
        </p>
      ) : null}

      {requests.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {requests.map((request) => {
            const status: HandoverStatus =
              request.status === 'REQUESTED' && Date.parse(request.expiresAt) <= Date.now()
                ? 'EXPIRED'
                : request.status
            const mine = request.requestedBy === me
            return (
              <li key={request.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
                <div className="flex flex-wrap items-center gap-3">
                  <ConsoleStatusPill tone={TONE[status]} label={t(`${K}status.${status}`)} />
                  <span className="text-sm font-medium text-text-primary">
                    {nameOf(request.fromUserId)}{' '}
                    <span className="font-normal text-text-tertiary">{t(`${K}to`)}</span>{' '}
                    {nameOf(request.toUserId)}
                  </span>
                </div>
                <p className="text-xs leading-[1.6] text-text-tertiary">
                  {t(`${K}askedOn`, { date: formatInstant(request.requestedAt, i18n.language) })}
                  {mine ? ` · ${t(`${K}byYou`)}` : ''}
                  {status === 'REQUESTED'
                    ? ` · ${t(`${K}expiresOn`, { date: formatInstant(request.expiresAt, i18n.language) })}`
                    : ''}
                </p>
                <p className="text-xs leading-[1.6] text-text-secondary">
                  {t(`${K}reasonIs`, { reason: request.reason })} ·{' '}
                  {t(`${K}evidenceIs`, { evidence: request.evidenceRef })}
                </p>
                {status === 'REQUESTED' ? (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {mine ? (
                      <span className="text-xs font-semibold text-pending-700">
                        {t(`${K}secondOperator`)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={CONSOLE_SMALL_PRIMARY}
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () => confirmOwnerHandover(tenantId, request.id),
                            t(`${K}confirmed`),
                          )
                        }
                      >
                        {t(`${K}confirm`)}
                      </button>
                    )}
                    <button
                      type="button"
                      className={CONSOLE_SMALL}
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => cancelOwnerHandover(tenantId, request.id),
                          t(`${K}cancelled`),
                        )
                      }
                    >
                      {t(`${K}cancel`)}
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {done ? (
        <p
          role="status"
          className="rounded-sm bg-success-100 px-4 py-3 text-sm font-medium text-success-700"
        >
          {done}
        </p>
      ) : null}
      {failure ? (
        <p
          role="alert"
          className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {failure}
        </p>
      ) : null}

      {/* A company with no Owner is given one from "Companies without an Owner", not handed over. */}
      {owner && !open && !asking ? (
        targets.length > 0 ? (
          <div>
            <button
              type="button"
              className={CONSOLE_SECONDARY}
              onClick={() => {
                setDone(null)
                setFailure(null)
                setAsking(true)
              }}
            >
              {t(`${K}start`)}
            </button>
          </div>
        ) : (
          <p className="text-sm leading-[1.6] text-text-tertiary">{t(`${K}noTarget`)}</p>
        )
      ) : null}

      {owner && !open && asking ? (
        <HandoverForm
          tenantId={tenantId}
          targets={targets}
          onCancel={() => setAsking(false)}
          onAsked={() => {
            setAsking(false)
            setDone(t(`${K}asked`))
            history.retry()
          }}
        />
      ) : null}
    </>,
  )
}

function HandoverForm({
  tenantId,
  targets,
  onCancel,
  onAsked,
}: {
  tenantId: string
  targets: OwnerCandidateDto[]
  onCancel: () => void
  onAsked: () => void
}) {
  const { t } = useTranslation()
  const [toUserId, setToUserId] = useState('')
  const [reason, setReason] = useState('')
  const [evidenceRef, setEvidenceRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const ready = toUserId !== '' && reason.trim() !== '' && evidenceRef.trim() !== ''

  const submit = async () => {
    if (!ready) return
    setBusy(true)
    setFailure(null)
    try {
      await requestOwnerHandover(tenantId, {
        toUserId,
        reason: reason.trim(),
        evidenceRef: evidenceRef.trim(),
      })
      onAsked()
    } catch (error) {
      setFailure(t(ownerRefusalKey(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="flex flex-col gap-5 rounded-sm border border-border-subtle p-4">
      <legend className="px-1 text-sm font-semibold text-text-primary">
        {t(`${K}form.title`)}
      </legend>
      <p className="text-sm leading-[1.6] text-text-secondary">{t(`${K}form.note`)}</p>
      <div className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
        <span>{t(`${K}form.to`)}</span>
        <Select
          value={toUserId}
          onChange={setToUserId}
          ariaLabel={t(`${K}form.to`)}
          placeholder={t(`${K}form.choose`)}
          disabled={busy}
          options={targets.map((c) => ({ value: c.userId, label: candidateLabel(c) }))}
        />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Input
          bordered
          label={t(`${K}form.reason`)}
          requiredMark
          value={reason}
          maxLength={OWNER_TEXT_MAX}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
        />
        <Input
          bordered
          label={t(`${K}form.evidence`)}
          requiredMark
          hint={t(`${K}form.evidenceHint`)}
          value={evidenceRef}
          maxLength={OWNER_TEXT_MAX}
          disabled={busy}
          onChange={(event) => setEvidenceRef(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={CONSOLE_PRIMARY}
          disabled={!ready || busy}
          onClick={() => void submit()}
        >
          {t(`${K}form.submit`)}
        </button>
        <button type="button" className={CONSOLE_SECONDARY} disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
      {failure ? (
        <p
          role="alert"
          className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {failure}
        </p>
      ) : null}
    </fieldset>
  )
}
