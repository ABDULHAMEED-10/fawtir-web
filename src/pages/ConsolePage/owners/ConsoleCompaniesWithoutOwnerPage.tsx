import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Input, Modal, Select } from '../../../components/ui'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_PAGE,
  CONSOLE_SMALL,
  CONSOLE_SMALL_PRIMARY,
  ConsoleButton,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { formatInstant } from '../../../lib/format'
import {
  OWNERS_MANAGE_PERMISSION,
  OWNER_TEXT_MAX,
  candidateLabel,
  fetchOwnerCandidates,
  ownerRefusalKey,
  pickOwner,
  withoutOwnerPath,
  type CompaniesWithoutOwnerPage,
  type CompanyWithoutOwnerDto,
  type OwnerCandidateDto,
} from '../../../lib/console/companyOwners'

const K = 'console.owners.'

/**
 * Companies with no clear Owner (Business Rules OW-5): "nobody is promoted automatically. The
 * company is listed in the console and a Fawtir member chooses the Owner, with a reason." Only an
 * enabled Administrator of the company can be chosen; the server re-checks both, under a lock.
 */
export function ConsoleCompaniesWithoutOwnerPage() {
  return (
    <ConsoleShell requires={OWNERS_MANAGE_PERMISSION}>
      <CompaniesWithoutOwner />
    </ConsoleShell>
  )
}

function CompaniesWithoutOwner() {
  const { t, i18n } = useTranslation()
  // Keyset pages: the cursors of the pages before this one, so "Previous" goes back exactly.
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1]
  const { read, retry } = useConsoleRead<CompaniesWithoutOwnerPage>(withoutOwnerPath(cursor))
  const [choosing, setChoosing] = useState<CompanyWithoutOwnerDto | null>(null)
  const [done, setDone] = useState<string | null>(null)

  let body: ReactNode
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t(`${K}loading`)} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (read.data.items.length === 0) {
    body = (
      <p className="rounded-sm bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t(`${K}empty`)}
      </p>
    )
  } else {
    body = (
      <div className={`${CONSOLE_CARD} overflow-x-auto`}>
        <table className="w-full min-w-[760px] text-start text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.6px] text-text-muted">
              <th className="px-4 py-3 text-start">{t(`${K}col.company`)}</th>
              <th className="px-4 py-3 text-start">{t(`${K}col.why`)}</th>
              <th className="px-4 py-3 text-start">{t(`${K}col.people`)}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {read.data.items.map((row) => (
              <tr key={row.tenantId}>
                <td className="px-4 py-3 font-medium text-text-primary">
                  <Link
                    className="hover:underline"
                    to={`/console/tenants/${encodeURIComponent(row.tenantId)}`}
                  >
                    {row.companyName}
                  </Link>
                  <span className="block text-xs font-normal text-text-tertiary">
                    <bdi dir="ltr">{row.tenantCode}</bdi> · {t(`${K}origin.${row.origin}`)} ·{' '}
                    {t(`${K}createdOn`, { date: formatInstant(row.createdAt, i18n.language) })}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {t(`${K}classification.${row.classification}`)}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {t(`${K}administrators`, { count: row.activeAdministrators })}
                  <span className="block text-xs text-text-tertiary">
                    {t(`${K}enabledUsers`, { count: row.enabledUsers })}
                  </span>
                </td>
                <td className="px-4 py-3 text-end">
                  {row.activeAdministrators > 0 ? (
                    <button
                      type="button"
                      className={CONSOLE_SMALL_PRIMARY}
                      onClick={() => {
                        setDone(null)
                        setChoosing(row)
                      }}
                    >
                      {t(`${K}choose`)}
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-text-tertiary">
                      {t(`${K}noAdministrator`)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const nextCursor = read.status === 'ready' ? read.data.nextCursor : null

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.owners' }]} />
      <ConsolePageHeader title={t(`${K}title`)} subtitle={t(`${K}subtitle`)} />
      {done ? (
        <p
          role="status"
          className="rounded-sm bg-success-100 px-4 py-3 text-sm font-medium text-success-700"
        >
          {done}
        </p>
      ) : null}
      {body}
      {cursors.length > 1 || nextCursor ? (
        <div className="flex flex-wrap gap-3">
          {cursors.length > 1 ? (
            <button
              type="button"
              className={CONSOLE_SMALL}
              onClick={() => setCursors((list) => list.slice(0, -1))}
            >
              {t(`${K}previous`)}
            </button>
          ) : null}
          {nextCursor ? (
            <button
              type="button"
              className={CONSOLE_SMALL}
              onClick={() => setCursors((list) => [...list, nextCursor])}
            >
              {t(`${K}next`)}
            </button>
          ) : null}
        </div>
      ) : null}
      {choosing ? (
        <ChooseOwnerDialog
          company={choosing}
          onClose={() => setChoosing(null)}
          onChosen={(name) => {
            setChoosing(null)
            setDone(t(`${K}chosen`, { name, company: choosing.companyName }))
            retry()
          }}
        />
      ) : null}
    </div>
  )
}

function ChooseOwnerDialog({
  company,
  onClose,
  onChosen,
}: {
  company: CompanyWithoutOwnerDto
  onClose: () => void
  onChosen: (name: string) => void
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [candidates, setCandidates] = useState<OwnerCandidateDto[] | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [userId, setUserId] = useState('')
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchOwnerCandidates(company.tenantId).then(
      (list) => {
        if (active) setCandidates(list)
      },
      () => {
        if (active) setReadFailed(true)
      },
    )
    return () => {
      active = false
    }
  }, [company.tenantId])

  const ready = userId !== '' && reason.trim() !== ''

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || sending) return
    setSending(true)
    setFailure(null)
    try {
      await pickOwner(company.tenantId, { userId, reason: reason.trim() })
      const chosen = candidates?.find((c) => c.userId === userId)
      onChosen(chosen ? candidateLabel(chosen) : '')
    } catch (error) {
      setFailure(t(ownerRefusalKey(error)))
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!sending) onClose()
      }}
      title={t(`${K}dialog.title`, { company: company.companyName })}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <ConsoleButton variant="secondary" disabled={sending} onClick={onClose}>
            {t('common.cancel')}
          </ConsoleButton>
          <ConsoleButton type="submit" form={formId} disabled={!ready || sending}>
            {t(`${K}dialog.submit`)}
          </ConsoleButton>
        </div>
      }
    >
      <form id={formId} noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
        <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
          {t(`${K}dialog.body`)}
        </p>
        {readFailed ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(`${K}dialog.candidatesFailed`)}
          </p>
        ) : candidates === null ? (
          <ConsoleNotice busy body={t(`${K}dialog.candidatesLoading`)} />
        ) : candidates.length === 0 ? (
          <p className="text-sm font-semibold leading-[1.6] text-pending-700">
            {t(`${K}noAdministrator`)}
          </p>
        ) : (
          <div className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
            <span>{t(`${K}dialog.person`)}</span>
            <Select
              value={userId}
              onChange={setUserId}
              ariaLabel={t(`${K}dialog.person`)}
              placeholder={t(`${K}dialog.choosePerson`)}
              disabled={sending}
              options={candidates.map((c) => ({
                value: c.userId,
                label: c.isOrigin
                  ? `${candidateLabel(c)} · ${t(`${K}dialog.origin`)}`
                  : candidateLabel(c),
              }))}
            />
          </div>
        )}
        <Input
          bordered
          name="reason"
          label={t(`${K}dialog.reason`)}
          requiredMark
          autoComplete="off"
          maxLength={OWNER_TEXT_MAX}
          value={reason}
          disabled={sending}
          onChange={(event) => setReason(event.target.value)}
          hint={t(`${K}dialog.reasonHint`, { max: OWNER_TEXT_MAX })}
        />
        {failure ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {failure}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
