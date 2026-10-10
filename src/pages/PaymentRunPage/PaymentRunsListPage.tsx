import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { RowsView, withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  loadRuns,
  runsListPath,
  type PaymentRunDto,
  type PaymentRunState,
} from '../../api/expenditure/paymentRuns'
import { formatAmount, formatDate, formatInstantDay } from '../../lib/format'
import { RUN_STATES } from '../../lib/paymentRuns'
import { can, useSession } from '../../lib/session/session'
import { Amount, PRIMARY_BUTTON, RunStatePill } from './RunParts'
import plusIcon from '../../assets/bill-capture/plus.svg'

/**
 * Expenditure › Payments: every run, by state, and the way into a new one.
 *
 * The Payments frame (163:16960) draws the run itself; this list has no frame of its own and is
 * kept to the frames' shell: the page header, a card, the same pills and figures. It has no bank
 * format column: Fawtir makes no bank files (owner, 9 Oct 2026).
 */
/**
 * The tabs. No run reaches "Sent to bank" now that no file is made; a run sent before that still
 * shows under All, with its pill.
 */
const LISTED_STATES = RUN_STATES.filter((entry) => entry !== 'EXPORTED')

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[720px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('paymentRuns.title')}
          </h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('paymentRuns.subtitle')}
          </p>
        </div>
        {can(session, 'invoice.payment.manage') ? (
          <Link to="/expenditure/payments/new" className={PRIMARY_BUTTON}>
            <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
            {t('paymentRuns.newRun')}
          </Link>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div
          role="tablist"
          className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4 max-md:gap-x-5"
        >
          {[null, ...LISTED_STATES].map((entry) => {
            const active = state === entry
            return (
              <button
                key={entry ?? 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setState(entry)}
                className={[
                  'relative pb-3 text-base leading-[1.2] transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {entry ? t(`paymentRuns.state.${entry}`) : t('paymentRuns.all')}
                {active ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-800" />
                ) : null}
              </button>
            )
          })}
        </div>

        {runs.read.status === 'loading' ? (
          <LoadingNotice />
        ) : runs.read.status === 'failed' ? (
          <ApiReadFailure error={runs.read.error} retry={runs.retry} />
        ) : runs.read.data.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm font-medium text-text-quaternary">
            {state ? t('paymentRuns.noneInState') : t('paymentRuns.none')}
          </p>
        ) : (
          <RowsView>
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                  <th className="px-6 py-3 text-start font-semibold">{t('paymentRuns.col.run')}</th>
                  <th className="px-3 py-3 text-start font-semibold">
                    {t('paymentRuns.col.state')}
                  </th>
                  <th className="px-3 py-3 text-start font-semibold">
                    {t('paymentsPage.paymentDate')}
                  </th>
                  <th className="px-3 py-3 text-start font-semibold">
                    {t('paymentsPage.runReference')}
                  </th>
                  <th className="px-6 py-3 text-end font-semibold">
                    {t('paymentsPage.leavingYourAccount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.read.data.map((run) => (
                  <tr key={run.id} className="border-b border-surface-background last:border-0">
                    <td className="px-6 py-4">
                      <Link
                        to={`/expenditure/payments/${run.id}`}
                        className="text-sm font-semibold text-primary-700 hover:underline"
                      >
                        {run.reference}
                      </Link>
                      <p className="mt-1 text-xs font-medium text-text-quaternary">
                        {t('paymentRuns.createdOn', {
                          date: formatInstantDay(run.createdAt, i18n.language),
                        })}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      <RunStatePill state={run.state} />
                    </td>
                    <td className="px-3 py-4 text-sm font-medium text-text-secondary">
                      {run.paymentDate
                        ? formatDate(run.paymentDate, i18n.language)
                        : t('paymentRuns.noDate')}
                    </td>
                    <td className="px-3 py-4 text-sm font-medium text-text-secondary">
                      {run.runReference ?? t('paymentRuns.noReference')}
                    </td>
                    <td className="px-6 py-4 text-end">
                      {/* A cancelled run pays nothing, whatever its bills added up to. */}
                      {run.state === 'CANCELLED' ? (
                        <span className="text-sm font-medium text-text-quaternary">
                          {t('paymentRuns.nothingSent')}
                        </span>
                      ) : (
                        <>
                          <Amount
                            value={run.netTotal}
                            currency={run.currency}
                            className="text-sm font-semibold text-text-primary"
                          />
                          {/* A paid run with bills taken out: what was paid and what was not,
                              under its total, as on the run itself (owner, 9 Oct 2026, D2). */}
                          {run.state === 'PAID' &&
                          run.paidTotal != null &&
                          (run.takenOutTotal ?? 0) > 0 ? (
                            <p className="mt-0.5 text-end text-[10px] font-medium leading-[1.2] text-text-muted">
                              {withRial(
                                t('paymentRuns.paidAndTakenOut', {
                                  paid: `${run.currency} ${formatAmount(run.paidTotal, run.currency, i18n.language)}`,
                                  takenOut: `${run.currency} ${formatAmount(run.takenOutTotal!, run.currency, i18n.language)}`,
                                }),
                              )}
                            </p>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RowsView>
        )}
      </section>
    </div>
  )
}
