import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  addToRun,
  blockedPath,
  candidatesPath,
  createRun,
  loadBlocked,
  loadCandidates,
  loadRuns,
  runsListPath,
  type PaymentRunBlockedDto,
  type PaymentRunCandidateDto,
  type PaymentRunDto,
} from '../../api/expenditure/paymentRuns'
import { formatAmount, formatDate } from '../../lib/format'
import { refusalOf, sum } from '../../lib/paymentRuns'
import { addDays } from '../../lib/dates'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import tickIcon from '../../assets/supplier-credit-notes/act-set.svg'

const NEW_RUN = 'new'
const round3 = (value: number) => Math.round(value * 1000) / 1000

/**
 * "Pay this supplier" (Add to a payment run, Figma 163:29156): the supplier's bills a run could
 * take now, the ones it cannot yet and why, the run to put them in, and what one transfer comes
 * to. Every figure in the summary is added up from what is ticked, so unticking a bill moves the
 * discount and the transfer total together.
 *
 * Only what the server offers can be ticked (`/payment-runs/candidates`), so every tick is one
 * the run will accept; the blocked list (`/payment-runs/blocked`) draws the greyed rows. The
 * credit-note section waits for the supplier's unused credit notes on this endpoint (§7.4).
 */
export function AddToPaymentRunModal({
  supplierId,
  supplierName,
  currency,
  bankName,
  discountPercent,
  discountDays,
  onClose,
}: {
  supplierId: string
  supplierName: string
  currency: string
  bankName: string | null
  discountPercent: number | null
  discountDays: number | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const navigate = useNavigate()
  const offerPath = candidatesPath(null, currency, null)
  const offered = useApiRead<PaymentRunCandidateDto[]>(offerPath, () => loadCandidates(offerPath))
  const heldPath = blockedPath(null, currency)
  const held = useApiRead<PaymentRunBlockedDto[]>(heldPath, () => loadBlocked(heldPath))
  const openPath = runsListPath(null)
  const runs = useApiRead<PaymentRunDto[]>(openPath, () => loadRuns(openPath))
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const bills =
    offered.read.status === 'ready'
      ? offered.read.data.filter((bill) => bill.supplierId === supplierId)
      : []
  const blocked =
    held.read.status === 'ready'
      ? held.read.data.filter((bill) => bill.supplierId === supplierId)
      : []
  const chosen = bills.filter((bill) => !unticked.has(bill.billId))
  const open =
    runs.read.status === 'ready'
      ? runs.read.data.filter(
          (run) =>
            (run.state === 'DRAFT' || run.state === 'SCHEDULED') && run.currency === currency,
        )
      : []
  const draft = open[0] ?? null
  const chosenRun = target ?? draft?.id ?? NEW_RUN
  const money = (value: number) => formatAmount(value, currency, language)
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')

  const totals = useMemo(() => {
    const gross = round3(sum(chosen.map((bill) => bill.outstanding)))
    const discount = round3(sum(chosen.map((bill) => bill.discount)))
    return {
      count: chosen.length,
      gross,
      discount,
      net: round3(sum(chosen.map((bill) => bill.amount))),
    }
  }, [chosen])

  const discountNote = (bill: PaymentRunCandidateDto) => {
    if (bill.discount > 0 && discountPercent && discountDays && bill.issueDate) {
      return t('supplierPay.bill.discountBy', {
        percent: discountPercent,
        date: day(addDays(bill.issueDate, discountDays)),
      })
    }
    return discountPercent ? t('supplierPay.bill.windowPassed') : t('supplierPay.bill.noDiscount')
  }

  const submit = async () => {
    if (inFlight.current || chosen.length === 0) return
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      const runId = chosenRun === NEW_RUN ? (await createRun({ currency })).id : chosenRun
      await addToRun(
        runId,
        chosen.map((bill) => bill.billId),
      )
      navigate(`/expenditure/payments/${runId}`)
    } catch (error) {
      setNotice(refusalOf(error, t, 'add'))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const toggle = (billId: string) =>
    setUnticked((current) => {
      const next = new Set(current)
      if (next.has(billId)) next.delete(billId)
      else next.add(billId)
      return next
    })

  const targetRun = open.find((run) => run.id === chosenRun) ?? null

  return (
    <Modal
      open
      onClose={onClose}
      width={680}
      title={t('supplierPay.title', { name: supplierName })}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text-tertiary">
            <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
            <span className="font-semibold text-text-primary tabular-nums">
              {money(totals.net)}
            </span>
            {targetRun?.paymentDate
              ? t('supplierPay.footerNote', { date: day(targetRun.paymentDate) })
              : t('supplierPay.footerNoteNoDate')}
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierPay.cancel')}
            </button>
            <button
              type="button"
              disabled={busy || chosen.length === 0}
              onClick={() => void submit()}
              className="inline-flex h-[42px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
            >
              <img src={tickIcon} alt="" className="size-4" />
              {targetRun
                ? t('supplierPay.addToRun', { run: targetRun.reference })
                : t('supplierPay.startTheRun')}
            </button>
          </div>
        </div>
      }
    >
      {notice ? (
        <p
          role="alert"
          className="mb-4 rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {notice}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
          {t('supplierPay.whichBills')}
        </p>
        <button
          type="button"
          onClick={() => setUnticked(new Set())}
          className="text-sm font-semibold text-primary-700 hover:underline"
        >
          {t('supplierPay.selectAll')}
        </button>
      </div>

      {offered.read.status === 'loading' ? (
        <LoadingNotice />
      ) : offered.read.status === 'failed' ? (
        <ApiReadFailure error={offered.read.error} retry={offered.retry} />
      ) : bills.length === 0 && blocked.length === 0 ? (
        <p className="mt-3 text-sm font-medium text-text-tertiary">
          {t('paymentRuns.addModal.none')}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {bills.map((bill) => {
            const checked = !unticked.has(bill.billId)
            return (
              <li key={bill.billId}>
                <button
                  type="button"
                  onClick={() => toggle(bill.billId)}
                  aria-pressed={checked}
                  aria-label={t('paymentsPage.selectBill', {
                    id: bill.supplierBillNumber ?? bill.billId,
                  })}
                  className={[
                    'flex w-full items-center gap-3 rounded-sm border p-4 text-start transition-colors',
                    checked
                      ? 'border-primary-700 bg-primary-25'
                      : 'border-border-subtle bg-white hover:border-primary-300',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'flex size-5 shrink-0 items-center justify-center rounded-[4px] border',
                      checked
                        ? 'border-primary-700 bg-primary-700'
                        : 'border-border-default bg-white',
                    ].join(' ')}
                  >
                    {checked ? <img src={tickIcon} alt="" className="size-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-[1.3] text-text-primary">
                      {bill.supplierBillNumber ?? t('paymentRuns.unnumbered')}
                    </span>
                    <span className="mt-1 block text-xs font-medium leading-[1.4] text-text-quaternary">
                      {t('supplierPay.bill.approvedNotInRun', {
                        issued: day(bill.issueDate),
                        due: day(bill.dueDate),
                      })}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="flex items-center justify-end gap-1 text-sm font-semibold text-text-primary tabular-nums">
                      <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                      {money(bill.outstanding)}
                    </span>
                    <span
                      className={[
                        'mt-1 block whitespace-nowrap text-xs font-medium',
                        bill.discount > 0 ? 'text-[#3d5648]' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {discountNote(bill)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {blocked.map((bill) => (
            <li key={bill.billId}>
              <div className="flex w-full cursor-not-allowed items-center gap-3 rounded-sm border border-border-subtle bg-surface-background/60 p-4 text-start">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-border-default bg-surface-background text-xs font-semibold text-text-quaternary">
                  ×
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-[1.3] text-text-quaternary">
                    {bill.supplierBillNumber ?? t('paymentRuns.unnumbered')}
                  </span>
                  <span className="mt-1 block text-xs font-medium leading-[1.4] text-pending-500">
                    {bill.reasonCodes.includes('AWAITING_APPROVALS')
                      ? t('supplierPay.bill.waitingApproval', {
                          given: bill.approvalsGiven ?? 0,
                          required: bill.approvalsRequired ?? 1,
                        })
                      : bill.reasonCodes.includes('ON_HOLD')
                        ? t('supplierPay.bill.onHold')
                        : bill.reasonCodes.includes('MISMATCH')
                          ? t('supplierPay.bill.mismatch')
                          : t('supplierPay.bill.rejected')}
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="flex items-center justify-end gap-1 text-sm font-semibold text-text-quaternary tabular-nums">
                    <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0 opacity-50" />
                    {money(bill.outstanding)}
                  </span>
                  <span className="mt-1 block whitespace-nowrap text-xs font-medium text-text-quaternary">
                    {bill.reasonCodes.includes('AWAITING_APPROVALS')
                      ? t('supplierPay.bill.chaseApproval')
                      : t('supplierPay.bill.openTheBill')}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
        {t('supplierPay.whichRun')}
      </p>
      {runs.read.status === 'failed' ? (
        <ApiReadFailure error={runs.read.error} retry={runs.retry} />
      ) : null}
      <div
        className="mt-3 flex flex-col gap-2.5"
        role="radiogroup"
        aria-label={t('supplierPay.whichRun')}
      >
        {[
          ...open.map((run) => ({
            id: run.id,
            title: t(
              run.state === 'DRAFT' ? 'supplierPay.addToDraft' : 'supplierPay.addToScheduled',
              { run: run.reference },
            ),
            note: run.paymentDate
              ? t('supplierPay.addToDraftNote', {
                  amount: money(run.billsTotal),
                  date: day(run.paymentDate),
                })
              : t('supplierPay.addToDraftNoteNoDate', { amount: money(run.billsTotal) }),
          })),
          {
            id: NEW_RUN,
            title: t('supplierPay.startOwn'),
            note: t('supplierPay.startOwnNote', { name: supplierName }),
          },
        ].map((option) => {
          const active = chosenRun === option.id
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTarget(option.id)}
              className={[
                'flex items-start gap-3 rounded-sm border p-4 text-start transition-colors',
                active
                  ? 'border-primary-700 bg-primary-25'
                  : 'border-border-subtle bg-white hover:border-primary-300',
              ].join(' ')}
            >
              <span
                className={[
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                  active ? 'border-primary-700' : 'border-border-default',
                ].join(' ')}
              >
                {active ? <span className="size-2.5 rounded-full bg-primary-700" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-[1.3] text-text-primary">
                  {option.title}
                </span>
                <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-quaternary">
                  {option.note}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.7px] text-text-quaternary">
        {t('supplierPay.creditTheyOwe')}
      </p>
      {/* TODO(backend): the supplier's unused credit notes are not on the candidates answer (§7.4). */}
      <div className="mt-3 rounded-sm bg-surface-background p-4">
        <p className="text-sm font-semibold leading-[1.3] text-text-secondary">
          {t('supplierPay.noCredit')}
        </p>
        <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
          {t('supplierPay.noCreditNote')}
        </p>
      </div>

      <dl className="mt-5 rounded-sm border border-border-subtle p-4">
        <SummaryRow
          label={t('supplierPay.nBills', { count: totals.count })}
          value={money(totals.gross)}
        />
        <SummaryRow
          label={t('supplierPay.earlyDiscount')}
          value={money(totals.discount)}
          negative
        />
        <div className="mt-3 flex items-center justify-between gap-4 border-t border-border-subtle pt-3.5">
          <dt className="text-base font-semibold text-text-primary">
            {bankName
              ? t('supplierPay.oneTransfer', { bank: bankName })
              : t('supplierPay.oneTransferNoBank')}
          </dt>
          <dd className="flex items-center gap-1.5 text-[22px] font-semibold leading-[1.2] text-text-primary tabular-nums">
            <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
            {money(totals.net)}
          </dd>
        </div>
      </dl>
    </Modal>
  )
}

function SummaryRow({
  label,
  value,
  negative,
}: {
  label: string
  value: string
  negative?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd
        className={[
          'flex items-center gap-1 text-sm font-semibold tabular-nums',
          negative ? 'text-[#3d5648]' : 'text-text-secondary',
        ].join(' ')}
      >
        {negative ? '−' : null}
        <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
        {value}
      </dd>
    </div>
  )
}
