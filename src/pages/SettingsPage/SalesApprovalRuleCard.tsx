import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch, withRial } from '../../components/ui'
import { useApiRead } from '../../hooks'
import {
  MAX_REQUIRED_APPROVALS,
  MIN_REQUIRED_APPROVALS,
} from '../../api/expenditure/approvalPolicy'
import {
  SALES_APPROVAL_RULE_PATH,
  loadSalesApprovalRule,
  saveSalesApprovalRule,
  type SalesApprovalRuleDto,
} from '../../api/invoices/salesApproval'
import { approversProblem, thresholdProblem, type ThresholdMode } from '../../lib/approvalPolicy'
import {
  COVER_KEYS,
  coversProblem,
  isSalesApprovalUnavailable,
  ruleChangeOf,
  ruleChanged,
  ruleFormOf,
  tooFewApprovers,
  type SalesApprovalRuleForm,
} from '../../lib/salesApproval'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount } from '../../lib/format'
import { ApiReadFailure } from '../../components/feedback/ApiNotice'
import { selectAllOnFocus } from '../../components/invoice'
import { ApiError } from '../../api'

/**
 * A read that says this reader gets no card: a server that predates the rule (404) or a reader
 * the server does not let read it (403). The Approvals page then looks as it did before.
 */
const isNotForThisReader = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 403)

const FIELD =
  'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Settings › Approvals, the sales documents card (RL-6): whether sales documents need approval
 * before they are issued, which kinds, how many people, and the amount below which none is needed.
 *
 * Built like the bills cards above it, with its own save: the two rules are separate documents on
 * the server. Reading takes `invoice.read`, changing takes `admin.settings.manage`, so a reader
 * without the second sees it read-only. A 503 `SALES_APPROVAL_UNAVAILABLE`, a 403 or a 404 on the
 * read draws no card at all, and nothing is drawn while the read is in flight, so a card that is
 * about to vanish never flashes a loading notice first.
 */
export function SalesApprovalRuleCard({ canManage }: { canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const read = useApiRead<SalesApprovalRuleDto>(SALES_APPROVAL_RULE_PATH, loadSalesApprovalRule)
  const saved = read.read.status === 'ready' ? read.read.data : null

  const [form, setForm] = useState<SalesApprovalRuleForm | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (saved) setForm(ruleFormOf(saved))
  }, [saved])

  if (read.read.status === 'failed') {
    // Switched off (503 SALES_APPROVAL_UNAVAILABLE), not readable (403) or not served (404).
    if (isSalesApprovalUnavailable(read.read.error) || isNotForThisReader(read.read.error)) return null
    return <ApiReadFailure error={read.read.error} retry={read.retry} />
  }
  if (saved === null || form === null) return null

  const set = (changes: Partial<SalesApprovalRuleForm>) => setForm({ ...form, ...changes })
  const approvers = approversProblem(form.requiredApprovals)
  const threshold = thresholdProblem(form.threshold, form.mode)
  const covers = coversProblem(form)
  const next = ruleChangeOf(form, saved.version)
  const dirty = next !== null && ruleChanged(saved, next)
  const switchingOn = !saved.enabled && form.enabled
  const required = approvers === null ? Number(form.requiredApprovals) : saved.requiredApprovals
  const money = (value: number) => `OMR ${formatAmount(value, 'OMR', i18n.language)}`
  const disabled = !canManage || saving

  const save = async () => {
    if (next === null) return
    setSaving(true)
    setFailure(null)
    try {
      await saveSalesApprovalRule(next)
      setNotice(t('salesApproval.rule.saved'))
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
    <section className="rounded-md bg-surface-card p-6" aria-label={t('salesApproval.rule.title')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
          {t('salesApproval.rule.title')}
        </h3>
      </div>
      <p className="mt-1 max-w-[560px] text-sm font-medium leading-[1.5] text-text-quaternary">
        {t('salesApproval.rule.note')}
      </p>

      <div className="mt-5 flex flex-col gap-5">
        <label className="flex items-center gap-3">
          <Switch
            checked={form.enabled}
            onChange={(enabled) => set({ enabled })}
            label={t('salesApproval.rule.enabled')}
            disabled={disabled}
          />
          <span className="text-sm font-medium leading-[1.4] text-text-secondary">
            {t('salesApproval.rule.enabled')}
          </span>
        </label>

        {switchingOn ? (
          <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
            {t('salesApproval.rule.switchingOn')}
          </p>
        ) : null}

        <fieldset className="flex flex-col gap-3">
          <legend className="text-xs font-semibold text-text-quaternary">
            {t('salesApproval.rule.covers')}
          </legend>
          {COVER_KEYS.map((key) => (
            <label key={key} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={form.covers[key]}
                disabled={disabled}
                onChange={(event) =>
                  set({ covers: { ...form.covers, [key]: event.target.checked } })
                }
                className="mt-1 size-4 accent-primary-700"
              />
              <span className="text-sm font-medium leading-[1.4] text-text-secondary">
                {t(`salesApproval.rule.cover.${key}`)}
              </span>
            </label>
          ))}
          {covers ? (
            <p className="text-sm font-medium text-danger-700">
              {t('salesApproval.rule.problem.coversNothing')}
            </p>
          ) : null}
        </fieldset>

        <div>
          <label className="block max-w-[220px]">
            <span className="text-xs font-semibold text-text-quaternary">
              {t('salesApproval.rule.approvers')}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_REQUIRED_APPROVALS}
              max={MAX_REQUIRED_APPROVALS}
              disabled={disabled}
              value={form.requiredApprovals}
              onFocus={selectAllOnFocus}
              onChange={(event) => set({ requiredApprovals: event.target.value })}
              aria-label={t('salesApproval.rule.approvers')}
              aria-invalid={approvers !== null}
              className={`${FIELD} mt-1 disabled:bg-surface-background disabled:text-text-tertiary`}
            />
          </label>
          {approvers ? (
            <p className="mt-2 text-sm font-medium text-danger-700">
              {t(`approvalPolicy.problem.${approvers}`)}
            </p>
          ) : null}
          {saved.approverCount !== null ? (
            <p className="mt-2 text-sm font-medium leading-[1.5] text-text-quaternary">
              {t('salesApproval.rule.approverCount', { n: saved.approverCount })}
            </p>
          ) : null}
          {form.enabled && tooFewApprovers(saved.approverCount, required) ? (
            <p className="mt-2 rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
              {t('salesApproval.rule.tooFew')}
            </p>
          ) : null}
        </div>

        <div>
          <span className="text-xs font-semibold text-text-quaternary">
            {t('salesApproval.rule.threshold')}
          </span>
          <div className="mt-2 flex flex-col gap-3">
            {(['EVERY_BILL', 'BELOW_AMOUNT'] as ThresholdMode[]).map((mode) => (
              <label key={mode} className="flex items-start gap-3">
                <input
                  type="radio"
                  name="sales-threshold-mode"
                  value={mode}
                  checked={form.mode === mode}
                  disabled={disabled}
                  onChange={() => set({ mode })}
                  className="mt-1 size-4 accent-primary-700"
                />
                <span className="text-sm font-medium leading-[1.4] text-text-secondary">
                  {t(`salesApproval.rule.mode.${mode}`)}
                </span>
              </label>
            ))}
          </div>
          {form.mode === 'BELOW_AMOUNT' ? (
            <label className="mt-4 block max-w-[260px]">
              <span className="text-xs font-semibold text-text-quaternary">
                {t('salesApproval.rule.thresholdLabel')}
              </span>
              <input
                type="text"
                inputMode="decimal"
                disabled={disabled}
                value={form.threshold}
                onFocus={selectAllOnFocus}
                onChange={(event) => set({ threshold: event.target.value })}
                aria-label={t('salesApproval.rule.thresholdLabel')}
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
          {form.mode === 'BELOW_AMOUNT' && threshold === null && form.threshold.trim() !== '' ? (
            <p className="mt-2 text-sm font-medium leading-[1.5] text-text-quaternary">
              {withRial(
                t('salesApproval.rule.boundary', { amount: money(Number(form.threshold)) }),
              )}
            </p>
          ) : null}
        </div>

        <p className="text-sm font-medium leading-[1.5] text-text-quaternary">
          {t('salesApproval.rule.erpNote')}
        </p>

        {notice ? (
          <p className="rounded-md bg-success-100 p-3 text-sm font-medium text-success-700">
            {notice}
          </p>
        ) : null}
        {failure ? (
          <p className="rounded-md bg-danger-100 p-3 text-sm font-medium text-danger-700">
            {failure}
          </p>
        ) : null}

        {canManage ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void save()}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:bg-[#d0d2d5]"
            >
              {saving ? t('approvalPolicy.saving') : t('salesApproval.rule.save')}
            </button>
            {dirty ? (
              <button
                type="button"
                onClick={() => setForm(ruleFormOf(saved))}
                className="text-sm font-semibold text-primary-700 hover:underline"
              >
                {t('approvalPolicy.discard')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
