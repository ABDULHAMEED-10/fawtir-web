import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { loadRun, removeFromRun, runPath, type PaymentRunDetailDto } from '../../api/expenditure/paymentRuns'
import { formatAmount, formatDate } from '../../lib/format'
import { actionsFor, refusalOf } from '../../lib/paymentRuns'
import { can, useSession } from '../../lib/session/session'
import { RunStatePill } from '../PaymentRunPage/RunParts'
import chevronIcon from '../../assets/invoices/chevron.svg'

/**
 * A run's bills, one row each, to check before the file goes to the bank (E-11). Each row opens
 * the bill itself, where its file and history are; the design's drawn invoice, print-all and
 * empty-run have nothing behind them and are not shown (decision 4).
 */
export function PaymentRunInvoicesPage() {
  const { runId = '' } = useParams()
  return (
    <AppShell>
      <RunBills runId={runId} />
    </AppShell>
  )
}

function RunBills({ runId }: { runId: string }) {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const loaded = useApiRead<PaymentRunDetailDto>(runPath(runId), () => loadRun(runId))
  const [changed, setChanged] = useState<PaymentRunDetailDto | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inFlight = useRef(false)

  if (loaded.read.status === 'loading') return <LoadingNotice />
  if (loaded.read.status === 'failed') return <ApiReadFailure error={loaded.read.error} retry={loaded.retry} />
  const { run, items } = changed ?? loaded.read.data
  const canTakeOut = can(session, 'invoice.payment.manage') && actionsFor(run.state).editable
  const money = (value: number) => `${formatAmount(value, run.currency, i18n.language)} ${run.currency}`

  const takeOut = async (billId: string) => {
    if (inFlight.current) return
    inFlight.current = true
    setNotice(null)
    try {
      setChanged(await removeFromRun(runId, billId))
    } catch (error) {
      setNotice(refusalOf(error, t))
    } finally {
      inFlight.current = false
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/expenditure/payments" className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary">
          {t('paymentsPage.breadcrumb')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <Link to={`/expenditure/payments/${run.id}`} className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary">
          {run.reference}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('paymentRuns.billsInRun')}</h1>
        <RunStatePill state={run.state} />
      </div>

      {notice ? <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

      {items.length === 0 ? (
        <p className="rounded-md bg-surface-card p-8 text-center text-sm font-medium text-text-tertiary">{t('paymentsPage.nobodyYet')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md bg-surface-card">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                <th className="px-5 py-3 text-start font-semibold">{t('paymentRuns.col.supplier')}</th>
                <th className="px-3 py-3 text-start font-semibold">{t('paymentRuns.col.bill')}</th>
                <th className="px-3 py-3 text-start font-semibold">{t('paymentRuns.col.due')}</th>
                <th className="px-3 py-3 text-end font-semibold">{t('paymentRuns.col.owed')}</th>
                <th className="px-3 py-3 text-end font-semibold">{t('paymentsPage.earlyDiscount')}</th>
                <th className="px-3 py-3 text-end font-semibold">{t('paymentRuns.col.paying')}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-surface-background text-sm font-medium text-text-secondary">
                  <td className="px-5 py-3.5">{item.supplierName ?? t('paymentRuns.noSupplier')}</td>
                  <td className="px-3 py-3.5">
                    <Link to={`/expenditure/bills/${item.billId}`} className="font-semibold text-primary-700 hover:underline">
                      {item.supplierBillNumber ?? t('paymentRuns.unnumbered')}
                    </Link>
                  </td>
                  <td className="px-3 py-3.5">{item.dueDate ? formatDate(item.dueDate, i18n.language) : '—'}</td>
                  <td className="px-3 py-3.5 text-end tabular-nums">{money(item.outstanding)}</td>
                  <td className="px-3 py-3.5 text-end tabular-nums">{item.discountTaken > 0 ? money(item.discountTaken) : '—'}</td>
                  <td className="px-3 py-3.5 text-end font-semibold text-text-primary tabular-nums">{money(item.amount)}</td>
                  <td className="px-5 py-3.5 text-end">
                    {canTakeOut ? (
                      <button type="button" onClick={() => void takeOut(item.billId)} className="text-sm font-semibold text-text-tertiary hover:text-danger-700">
                        {t('paymentRuns.takeOut')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-subtle text-sm font-semibold text-text-primary">
                <td className="px-5 py-3.5" colSpan={3}>
                  {t('paymentRuns.totals')}
                </td>
                <td className="px-3 py-3.5 text-end tabular-nums">{money(run.billsTotal)}</td>
                <td className="px-3 py-3.5 text-end tabular-nums">{money(run.discountTotal)}</td>
                <td className="px-3 py-3.5 text-end tabular-nums">{money(run.netTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
