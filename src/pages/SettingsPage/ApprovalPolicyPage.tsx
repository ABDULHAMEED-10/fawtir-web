import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsShell } from './SettingsShell'
import { withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  APPROVAL_POLICY_PATH,
  MAX_REQUIRED_APPROVALS,
  MIN_REQUIRED_APPROVALS,
  loadApprovalPolicy,
  saveApprovalPolicy,
  type ApprovalPolicyDto,
} from '../../api/expenditure/approvalPolicy'
import {
  approversProblem,
  clearsThreshold,
  formOf,
  policyChanged,
  policyOf,
  thresholdProblem,
  type ApprovalPolicyForm,
  type ThresholdMode,
} from '../../lib/approvalPolicy'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'

const FIELD =
  'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Settings › Approval policy (E-17).
 *
 * The two figures that decide when a bill may be paid: how many distinct people must approve it,
 * and the amount below which none need to. It is the configuration half of what the Bills screen
 * enforces — `readiness` there reads the policy set here.
 *
 * **Reading and changing are different rights.** `GET` needs `invoice.read`, `PUT` needs
 * `admin.settings.manage`, and the controller's reasoning for the split is that "letting an
 * approver lower the approver count is letting the guarded change the guard". Someone who may see
 * the policy but not change it therefore gets the figures read-only rather than a permission wall
 * — knowing what the rule is, is not the same as being able to move it.
 *
 * **No "no approval at all".** The count starts at one because V137 admits no zero: approval
 * always gates payment and only the count is configurable. The screen does not offer an option the
 * server would refuse.
 */
export function ApprovalPolicyPage() {
  return (
    <SettingsShell group="company">
      <ApprovalPolicy />
    </SettingsShell>
  )
}

function ApprovalPolicy() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'admin.settings.manage')

  const read = useApiRead<ApprovalPolicyDto>(APPROVAL_POLICY_PATH, loadApprovalPolicy)
  const saved = read.read.status === 'ready' ? read.read.data : null

  const [form, setForm] = useState<ApprovalPolicyForm | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (saved) setForm(formOf(saved))
  }, [saved])

  const money = (value: number) => formatAmount(value, 'OMR', language)

  if (read.read.status === 'loading' || form === null) {
    return read.read.status === 'failed' ? (
      <ApiReadFailure error={read.read.error} retry={read.retry} />
    ) : (
      <LoadingNotice />
    )
  }
  if (read.read.status === 'failed')
    return <ApiReadFailure error={read.read.error} retry={read.retry} />

  const set = (changes: Partial<ApprovalPolicyForm>) => setForm({ ...form, ...changes })

  const approvers = approversProblem(form.requiredApprovals)
  const threshold = thresholdProblem(form.threshold, form.mode)
  const next = policyOf(form)
  const dirty = saved !== null && next !== null && policyChanged(saved, next)
  const removing = saved !== null && next !== null && clearsThreshold(saved, next)

  const save = async () => {
    if (next === null) return
    setSaving(true)
    setFailure(null)
    try {
      await saveApprovalPolicy(next)
      setNotice(t('approvalPolicy.saved'))
      read.retry()
    } catch (error) {
      setNotice(null)
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setFailure(
        message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-medium leading-[1.2] text-text-primary">
          {t('approvalPolicy.title')}
        </h2>
        <p className="mt-1 max-w-[680px] text-sm font-medium leading-[1.5] text-text-quaternary">
          {t('approvalPolicy.subtitle')}
        </p>
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}
      {failure ? (
        <Notice
          badge={t('approvalPolicy.notSaved')}
          body={failure}
          action={{ label: t('common.close'), onClick: () => setFailure(null) }}
        />
      ) : null}

      {!canManage ? (
        <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
          {t('approvalPolicy.readOnly')}
        </p>
      ) : null}

      <section className="rounded-md bg-surface-card p-6">
        <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
          {t('approvalPolicy.approvers.title')}
        </h3>
        <p className="mt-1 max-w-[560px] text-sm font-medium leading-[1.5] text-text-quaternary">
          {t('approvalPolicy.approvers.note')}
        </p>

        <label className="mt-4 block max-w-[220px]">
          <span className="text-xs font-semibold text-text-quaternary">
            {t('approvalPolicy.approvers.label')}
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_REQUIRED_APPROVALS}
            max={MAX_REQUIRED_APPROVALS}
            disabled={!canManage}
            value={form.requiredApprovals}
            onChange={(event) => set({ requiredApprovals: event.target.value })}
            aria-label={t('approvalPolicy.approvers.label')}
            aria-invalid={approvers !== null}
            className={`${FIELD} mt-1 disabled:bg-surface-background disabled:text-text-tertiary`}
          />
        </label>
        {approvers ? (
          <p className="mt-2 text-sm font-medium text-danger-700">
            {t(`approvalPolicy.problem.${approvers}`)}
          </p>
        ) : null}
        {/* Said plainly, because "1" reading as "nobody has to approve" is the likely misreading. */}
        <p className="mt-2 text-sm font-medium leading-[1.5] text-text-quaternary">
          {t('approvalPolicy.approvers.floor')}
        </p>
      </section>

      <section className="rounded-md bg-surface-card p-6">
        <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
          {t('approvalPolicy.threshold.title')}
        </h3>
        <p className="mt-1 max-w-[560px] text-sm font-medium leading-[1.5] text-text-quaternary">
          {t('approvalPolicy.threshold.note')}
        </p>

        {/*
          A choice, not a blank field. The PUT replaces the policy whole, so an empty amount box
          would quietly remove a stored threshold; the reader has to be able to say which they
          meant, and see which is currently true.
        */}
        <div className="mt-4 flex flex-col gap-3">
          {(['EVERY_BILL', 'BELOW_AMOUNT'] as ThresholdMode[]).map((mode) => (
            <label key={mode} className="flex items-start gap-3">
              <input
                type="radio"
                name="threshold-mode"
                value={mode}
                checked={form.mode === mode}
                disabled={!canManage}
                onChange={() => set({ mode })}
                className="mt-1 size-4 accent-primary-700"
              />
              <span className="text-sm font-medium leading-[1.4] text-text-secondary">
                {t(`approvalPolicy.threshold.${mode}`)}
              </span>
            </label>
          ))}
        </div>

        {form.mode === 'BELOW_AMOUNT' ? (
          <label className="mt-4 block max-w-[260px]">
            <span className="text-xs font-semibold text-text-quaternary">
              {t('approvalPolicy.threshold.label')}
            </span>
            <input
              type="text"
              inputMode="decimal"
              disabled={!canManage}
              value={form.threshold}
              onChange={(event) => set({ threshold: event.target.value })}
              aria-label={t('approvalPolicy.threshold.label')}
              aria-invalid={threshold !== null}
              className={`${FIELD} mt-1 disabled:bg-surface-background disabled:text-text-tertiary`}
            />
          </label>
        ) : null}
        {threshold ? (
          <p className="mt-2 text-sm font-medium text-danger-700">
            {t(`approvalPolicy.problem.${threshold}`)}
          </p>
        ) : null}

        {/* "Strictly below" is the server's word, and the boundary case is the one people get wrong. */}
        {form.mode === 'BELOW_AMOUNT' && threshold === null && form.threshold.trim() !== '' ? (
          <p className="mt-2 text-sm font-medium leading-[1.5] text-text-quaternary">
            {withRial(
              t('approvalPolicy.threshold.boundary', {
                amount: `OMR ${money(Number(form.threshold))}`,
              }),
            )}
          </p>
        ) : null}

        {removing ? (
          <p className="mt-3 rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
            {withRial(
              t('approvalPolicy.threshold.removing', {
                amount: `OMR ${money(saved?.autoApproveBelow ?? 0)}`,
              }),
            )}
          </p>
        ) : null}
      </section>

      {canManage ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!dirty || next === null || saving}
            onClick={save}
            className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:bg-[#d0d2d5]"
          >
            {saving ? t('approvalPolicy.saving') : t('approvalPolicy.save')}
          </button>
          {dirty ? (
            <button
              type="button"
              onClick={() => saved && setForm(formOf(saved))}
              className="text-sm font-semibold text-primary-700 hover:underline"
            >
              {t('approvalPolicy.discard')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
