import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Modal, TableCheckbox } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  addToRun,
  candidatesPath,
  createRun,
  loadCandidates,
  loadRuns,
  runsListPath,
  type PaymentRunCandidateDto,
  type PaymentRunDto,
} from '../../api/expenditure/paymentRuns'
import { formatAmount, formatDate } from '../../lib/format'
import { refusalOf, sum } from '../../lib/paymentRuns'

const NEW_RUN = 'new'

/**
 * "Pay this supplier" (E-11, decision 4): the supplier's bills that a run could take now, into a
 * draft or scheduled run or a new one. Only what the server offers is listed, so every tick is one
 * the run will accept; the credit-note toggle waits for supplier credit notes (E-15).
 */
export function AddToPaymentRunModal({
  supplierId,
  supplierName,
  currency,
  onClose,
}: {
  supplierId: string
  supplierName: string
  currency: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const offerPath = candidatesPath(null, currency, null)
  const offered = useApiRead<PaymentRunCandidateDto[]>(offerPath, () => loadCandidates(offerPath))
  const openPath = runsListPath(null)
  const runs = useApiRead<PaymentRunDto[]>(openPath, () => loadRuns(openPath))
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<string>(NEW_RUN)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const bills = offered.read.status === 'ready' ? offered.read.data.filter((bill) => bill.supplierId === supplierId) : []
  const chosen = bills.filter((bill) => !unticked.has(bill.billId))
  const open = runs.read.status === 'ready' ? runs.read.data.filter((run) => (run.state === 'DRAFT' || run.state === 'SCHEDULED') && run.currency === currency) : []
  const money = (value: number) => `${formatAmount(value, currency, i18n.language)} ${currency}`

  const submit = async () => {
    if (inFlight.current || chosen.length === 0) return
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      const runId = target === NEW_RUN ? (await createRun({ currency })).id : target
      await addToRun(runId, chosen.map((bill) => bill.billId))
      navigate(`/expenditure/payments/${runId}`)
    } catch (error) {
      setNotice(refusalOf(error, t))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title={t('supplierPay.title', { name: supplierName })}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-text-primary">{t('paymentRuns.addModal.total', { amount: money(sum(chosen.map((bill) => bill.amount))) })}</span>
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary">
              {t('common.cancel')}
            </button>
            <button type="button" disabled={busy || chosen.length === 0} onClick={() => void submit()} className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white disabled:opacity-60">
              {t('paymentRuns.addModal.submit')}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {notice ? (
          <p role="alert" className="text-sm font-medium text-text-danger">
            {notice}
          </p>
        ) : null}
        <h3 className="text-sm font-semibold text-text-primary">{t('supplierPay.whichBills')}</h3>
        {offered.read.status === 'loading' ? (
          <LoadingNotice />
        ) : offered.read.status === 'failed' ? (
          <ApiReadFailure error={offered.read.error} retry={offered.retry} />
        ) : bills.length === 0 ? (
          <p className="text-sm font-medium text-text-tertiary">{t('paymentRuns.addModal.none')}</p>
        ) : (
          <ul className="flex flex-col rounded-sm border border-border-subtle">
            {bills.map((bill) => (
              <li key={bill.billId} className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-0">
                <TableCheckbox
                  checked={!unticked.has(bill.billId)}
                  onChange={() =>
                    setUnticked((current) => {
                      const next = new Set(current)
                      if (next.has(bill.billId)) next.delete(bill.billId)
                      else next.add(bill.billId)
                      return next
                    })
                  }
                  ariaLabel={t('paymentsPage.selectBill', { id: bill.supplierBillNumber ?? bill.billId })}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{bill.supplierBillNumber ?? t('paymentRuns.unnumbered')}</p>
                  <p className="text-xs font-medium text-text-quaternary">
                    {bill.dueDate ? t('paymentRuns.addModal.due', { date: formatDate(bill.dueDate, i18n.language) }) : t('paymentRuns.due.none')}
                  </p>
                </div>
                <span className="ms-auto text-sm font-semibold text-text-secondary tabular-nums">{money(bill.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        <h3 className="text-sm font-semibold text-text-primary">{t('supplierPay.whichRun')}</h3>
        <div role="radiogroup" className="flex flex-col gap-2">
          {[...open.map((run) => ({ id: run.id, label: t('paymentRuns.addModal.existing', { reference: run.reference, state: t(`paymentRuns.state.${run.state}`) }) })), { id: NEW_RUN, label: t('paymentRuns.addModal.newRun') }].map((option) => (
            <label key={option.id} className={['flex cursor-pointer items-center gap-3 rounded-sm border px-4 py-3 text-sm font-medium', target === option.id ? 'border-primary-700 bg-primary-25 text-primary-800' : 'border-border-subtle text-text-secondary'].join(' ')}>
              <input type="radio" name="run" value={option.id} checked={target === option.id} onChange={() => setTarget(option.id)} />
              {option.label}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  )
}
