import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { loadRuns, runsListPath, type PaymentRunDto, type PaymentRunState } from '../../api/expenditure/paymentRuns'
import { formatAmount, formatDate } from '../../lib/format'
import { RUN_STATES } from '../../lib/paymentRuns'
import { can, useSession } from '../../lib/session/session'
import { RunStatePill } from './RunParts'

/** Expenditure › Payments (E-11, decision 1): every run, by state, and the way into a new one. */
export function PaymentRunsListPage() {
  return (
    <AppShell>
      <PaymentRunsList />
    </AppShell>
  )
}

function PaymentRunsList() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const [state, setState] = useState<PaymentRunState | null>(null)
  const path = runsListPath(state)
  const runs = useApiRead<PaymentRunDto[]>(path, () => loadRuns(path))

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('paymentRuns.title')}</h1>
          <p className="mt-1 text-base font-medium leading-[1.3] text-text-quaternary">{t('paymentRuns.subtitle')}</p>
        </div>
        {can(session, 'invoice.payment.manage') ? (
          <Link
            to="/expenditure/payments/new"
            className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t('paymentRuns.newRun')}
          </Link>
        ) : null}
      </div>

      <div role="tablist" className="flex flex-wrap items-center gap-1 border-b border-border-subtle">
        {[null, ...RUN_STATES].map((entry) => (
          <button
            key={entry ?? 'all'}
            type="button"
            role="tab"
            aria-selected={state === entry}
            onClick={() => setState(entry)}
            className={[
              '-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
              state === entry ? 'border-primary-700 text-primary-800' : 'border-transparent text-text-tertiary hover:text-text-secondary',
            ].join(' ')}
          >
            {entry ? t(`paymentRuns.state.${entry}`) : t('paymentRuns.all')}
          </button>
        ))}
      </div>

      {runs.read.status === 'loading' ? (
        <LoadingNotice />
      ) : runs.read.status === 'failed' ? (
        <ApiReadFailure error={runs.read.error} retry={runs.retry} />
      ) : runs.read.data.length === 0 ? (
        <p className="rounded-md bg-surface-card p-8 text-center text-sm font-medium text-text-tertiary">
          {state ? t('paymentRuns.noneInState') : t('paymentRuns.none')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md bg-surface-card">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                <th className="px-5 py-3 text-start font-semibold">{t('paymentRuns.col.run')}</th>
                <th className="px-3 py-3 text-start font-semibold">{t('paymentRuns.col.state')}</th>
                <th className="px-3 py-3 text-start font-semibold">{t('paymentsPage.paymentDate')}</th>
                <th className="px-3 py-3 text-start font-semibold">{t('paymentsPage.runReference')}</th>
                <th className="px-5 py-3 text-end font-semibold">{t('paymentsPage.leavingYourAccount')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.read.data.map((run) => (
                <tr key={run.id} className="border-t border-surface-background">
                  <td className="px-5 py-3.5">
                    <Link to={`/expenditure/payments/${run.id}`} className="text-sm font-semibold text-primary-700 hover:underline">
                      {run.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-3.5">
                    <RunStatePill state={run.state} />
                  </td>
                  <td className="px-3 py-3.5 text-sm font-medium text-text-secondary">
                    {run.paymentDate ? formatDate(run.paymentDate, i18n.language) : '—'}
                  </td>
                  <td className="px-3 py-3.5 text-sm font-medium text-text-secondary">{run.runReference ?? '—'}</td>
                  <td className="px-5 py-3.5 text-end text-sm font-semibold text-text-primary tabular-nums">
                    {formatAmount(run.netTotal, run.currency, i18n.language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
