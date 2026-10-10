import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, Popover, Select, TableCheckbox, withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  PAYER_ACCOUNTS_PATH,
  addToRun,
  blockedPath,
  cancelRun,
  candidatesPath,
  createRun,
  loadBlocked,
  loadCandidates,
  loadPayerAccounts,
  loadRun,
  markRunPaid,
  removeFromRun,
  runPath,
  updateRun,
  type PayerAccountDto,
  type PaymentRunBlockedDto,
  type PaymentRunCandidateDto,
  type PaymentRunDetailDto,
  type PaymentRunFormat,
} from '../../api/expenditure/paymentRuns'
import { formatAmount, formatDate } from '../../lib/format'
import { muscatToday } from '../../lib/invoiceIssue'
import {
  DUE_WINDOWS,
  REASON_KEYS,
  actionsFor,
  bankDetailsChangedIn,
  discountPercent,
  dueBy,
  dueNote,
  groupBySupplier,
  paidOn,
  refusalOf,
  sum,
  windowEnd,
  type DueTone,
  type DueWindow,
  type RunAction,
  type RunBill,
} from '../../lib/paymentRuns'
import { can, useSession } from '../../lib/session/session'
import {
  AddPayerAccountModal,
  Amount,
  CancelSentRunModal,
  ConfirmModal,
  HEADER_BUTTON,
  MarkPaidModal,
  PRIMARY_BUTTON,
  RunMenu,
  RunStatePill,
  SectionTitle,
  SupplierTile,
} from './RunParts'
import printIcon from '../../assets/invoice-details/print.svg'
import viewInvoiceIcon from '../../assets/bill-capture/file.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const DUE_CHIP: Record<DueTone, string> = {
  soon: 'bg-pending-100 text-pending-700',
  later: 'bg-success-100 text-[#3d5648]',
  late: 'bg-danger-100 text-[#7a1009]',
  none: 'bg-surface-background text-text-tertiary',
}

type Details = {
  paymentDate: string | null
  payerAccountId: string | null
  runReference: string
  /**
   * Not chosen on this page any more (owner, 9 Oct 2026: Fawtir makes no bank files); the run's
   * stored format is sent back unchanged, as the update replaces all four details.
   */
  format: PaymentRunFormat | null
}

const NO_DETAILS: Details = {
  paymentDate: null,
  payerAccountId: null,
  runReference: '',
  format: null,
}

/**
 * Expenditure › Payments › a run (Figma 163:16960). `/expenditure/payments/new` builds a run that
 * does not exist yet: it is created when the first bill is ticked (decision 1). Every figure comes
 * from the server: what a bill would cost on the run's date, what the run totals, what cannot be paid.
 *
 * Fawtir makes no bank files (owner, 9 Oct 2026): the company pays its suppliers itself, then marks
 * the run paid here. The frame's "How to send it to the bank" step and its Download are not drawn.
 */
export function PaymentRunPage() {
  const { runId = null } = useParams()
  return (
    <AppShell>
      <RunBuilder key={runId ?? 'new'} runId={runId === 'new' ? null : runId} />
    </AppShell>
  )
}

function RunBuilder({ runId }: { runId: string | null }) {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const today = muscatToday()
  const canManage = can(session, 'invoice.payment.manage')
  const canAddAccount = can(session, 'admin.settings.manage')

  const loaded = useApiRead<PaymentRunDetailDto>(runId ? runPath(runId) : null, () =>
    loadRun(runId!),
  )
  const [detail, setDetail] = useState<PaymentRunDetailDto | null>(null)
  const [details, setDetails] = useState<Details>(NO_DETAILS)
  const [supplierFilter, setSupplierFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLButtonElement>(null)
  const [window, setWindow] = useState<DueWindow | null>(null)
  const [dueByDate, setDueByDate] = useState('')
  const [blockedOpen, setBlockedOpen] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addingAccount, setAddingAccount] = useState(false)
  const [confirmingPaid, setConfirmingPaid] = useState(false)
  const [cancellingSent, setCancellingSent] = useState(false)
  const [cancellingUnsent, setCancellingUnsent] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    if (loaded.read.status !== 'ready') return
    const next = loaded.read.data
    setDetail(next)
    setDetails({
      paymentDate: next.run.paymentDate,
      payerAccountId: next.run.payerAccountId,
      runReference: next.run.runReference ?? '',
      format: next.run.format,
    })
  }, [loaded.read])

  const run = detail?.run ?? null
  const currency = run?.currency ?? 'OMR'
  const actions = actionsFor(run?.state ?? null)
  const editable = canManage && actions.editable

  const offerPath = actions.editable
    ? candidatesPath(runId, currency, runId ? null : details.paymentDate)
    : null
  const offered = useApiRead<PaymentRunCandidateDto[]>(offerPath, () => loadCandidates(offerPath!))
  const blockedListPath = actions.editable ? blockedPath(runId, currency) : null
  const blocked = useApiRead<PaymentRunBlockedDto[]>(blockedListPath, () =>
    loadBlocked(blockedListPath!),
  )
  const accounts = useApiRead<PayerAccountDto[]>(PAYER_ACCOUNTS_PATH, loadPayerAccounts)
  const [addedAccounts, setAddedAccounts] = useState<PayerAccountDto[]>([])

  const inRun: RunBill[] = useMemo(
    () =>
      (detail?.items ?? []).map((item) => ({
        billId: item.billId,
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        supplierBillNumber: item.supplierBillNumber,
        issueDate: item.issueDate,
        dueDate: item.dueDate,
        outstanding: item.outstanding,
        discount: item.discountTaken,
        amount: item.amount,
      })),
    [detail],
  )
  // A bill taken out as the rest of a sent run was marked paid: the run paid nothing for it.
  const takenOut = new Map(
    (detail?.items ?? []).flatMap((item) => (item.takenOut ? [[item.billId, item.takenOut]] : [])),
  )
  // On a paid run with bills taken out, the run's totals stay as they were; a line under them
  // splits them into what was paid and what was taken out (owner, 9 Oct 2026).
  const paidRun = run?.state === 'PAID'
  const runItems = detail?.items ?? []
  const split =
    paidRun && runItems.some((item) => item.takenOut != null)
      ? {
          paid: sum(runItems.filter((item) => item.takenOut == null).map((item) => item.amount)),
          takenOut: sum(
            runItems.filter((item) => item.takenOut != null).map((item) => item.amount),
          ),
        }
      : null
  const candidates: RunBill[] = offered.read.status === 'ready' ? offered.read.data : []
  const ticked = new Set(inRun.map((bill) => bill.billId))
  const every = [...inRun, ...candidates.filter((bill) => !ticked.has(bill.billId))]
  const groups = groupBySupplier(every)
  const shown = supplierFilter ? groups.filter((group) => group.key === supplierFilter) : groups
  const paying = groupBySupplier(inRun)
  const blockedRows = blocked.read.status === 'ready' ? blocked.read.data : []
  const changedSinceAdded = bankDetailsChangedIn(run?.state ?? null, detail?.items ?? [])

  /** One write at a time: a tick while another is in flight would be sent against a stale run. */
  const act = async (write: () => Promise<void>, action?: RunAction) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      await write()
    } catch (error) {
      setNotice(refusalOf(error, t, action))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const detailsBody = (patch: Partial<Details>) => {
    const next = { ...details, ...patch }
    return {
      paymentDate: next.paymentDate,
      payerAccountId: next.payerAccountId,
      runReference: next.runReference.trim() || null,
      format: next.format,
    }
  }

  const add = (billIds: string[]) =>
    act(async () => {
      if (billIds.length === 0) return
      if (!runId) {
        const created = await createRun({ currency, ...detailsBody({}) })
        try {
          await addToRun(created.id, billIds)
        } finally {
          // The run exists now whether or not the bill went in; the page must show it rather than
          // leave an empty draft nobody can find from here.
          navigate(`/expenditure/payments/${created.id}`, { replace: true })
        }
        return
      }
      setDetail(await addToRun(runId, billIds))
      offered.retry()
      blocked.retry()
    }, 'add')

  const remove = (billIds: string[]) =>
    act(async () => {
      if (!runId) return
      let latest: PaymentRunDetailDto | null = null
      for (const billId of billIds) latest = await removeFromRun(runId, billId)
      if (latest) setDetail(latest)
      offered.retry()
    })

  const change = (patch: Partial<Details>) => {
    setDetails((current) => ({ ...current, ...patch }))
    if (!runId) return
    void act(async () => {
      setDetail(await updateRun(runId, detailsBody(patch)))
    })
  }

  const pickWindow = (next: DueWindow) => {
    setWindow(next)
    const end = windowEnd(next, today)
    setDueByDate(end ?? '')
    add(dueBy(candidates, end).map((bill) => bill.billId))
  }

  // A paid run says the day its bills were paid on, as the server records it.
  const noteDay = run?.state === 'PAID' ? paidOn(run) : (run?.paymentDate ?? null)
  const stateDate = noteDay ? formatDate(noteDay, i18n.language) : ''

  if (runId && loaded.read.status === 'loading') return <LoadingNotice />
  if (runId && loaded.read.status === 'failed')
    return <ApiReadFailure error={loaded.read.error} retry={loaded.retry} />

  const accountOptions = [
    ...(accounts.read.status === 'ready' ? accounts.read.data : []),
    ...addedAccounts,
  ].map((account) => ({
    value: account.id,
    label: account.name,
    hint: account.iban,
  }))

  const required = <span className="text-xl leading-4 text-primary-700">*</span>

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/expenditure/payments"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
          >
            {t('paymentsPage.breadcrumb')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {run ? run.reference : t('paymentRuns.newCrumb')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {run && run.state !== 'DRAFT'
              ? t('paymentRuns.runTitle', { reference: run.reference })
              : t('paymentsPage.title')}
          </h1>
          <RunStatePill state={run?.state ?? 'DRAFT'} />
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => globalThis.print()}
              className={[HEADER_BUTTON, 'max-lg:w-[46px] max-lg:px-0'].join(' ')}
              title={t('paymentsPage.print')}
            >
              <img src={printIcon} alt="" className="size-5 shrink-0" />
              <span className="max-lg:sr-only">{t('paymentsPage.print')}</span>
            </button>
            {/* An empty run has nothing to mark paid. */}
            {canManage && run && actions.canMarkPaid && runItems.length > 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingPaid(true)}
                className={PRIMARY_BUTTON}
              >
                {t('paymentRuns.markPaid')}
              </button>
            ) : null}
            {run ? (
              <Link to={`/expenditure/payments/${run.id}/invoices`} className={PRIMARY_BUTTON}>
                <img src={viewInvoiceIcon} alt="" className="size-5 shrink-0 brightness-0 invert" />
                {t('paymentsPage.viewInvoices')}
              </Link>
            ) : null}
            {run && detail ? (
              <RunMenu
                run={run}
                items={detail.items}
                onNotice={setNotice}
                onChanged={() => loaded.retry()}
                onCancelSent={
                  canManage && run.state === 'EXPORTED' ? () => setCancellingSent(true) : undefined
                }
              />
            ) : null}
          </div>
        </div>
        <p className="text-base font-medium leading-[1.3] text-text-quaternary">
          {run && run.state !== 'DRAFT'
            ? t(`paymentRuns.stateNote.${run.state}`, { date: stateDate })
            : t('paymentsPage.subtitle')}
        </p>
        {/* Owner, 10 Oct 2026: a supplier whose bank details changed after their bill joined. */}
        {changedSinceAdded.map((supplier) => (
          <p key={supplier.key} className="text-sm font-medium leading-[1.3] text-pending-700">
            {t('paymentRuns.bankDetailsChanged', { supplier: supplier.name })}
          </p>
        ))}
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* 1: which bills */}
          <section className="rounded-md bg-surface-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle
                step={1}
                title={t('paymentsPage.whichBills')}
                note={t('paymentsPage.approvedOnly')}
              />
              {groups.length > 1 ? (
                <>
                  <button
                    ref={filterRef}
                    type="button"
                    onClick={() => setFilterOpen((open) => !open)}
                    aria-haspopup="listbox"
                    aria-expanded={filterOpen}
                    className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                  >
                    {supplierFilter
                      ? (groups.find((group) => group.key === supplierFilter)?.name ??
                        t('paymentRuns.noSupplier'))
                      : t('paymentsPage.filterBySupplier')}
                  </button>
                  <Popover
                    open={filterOpen}
                    anchorRef={filterRef}
                    onClose={() => setFilterOpen(false)}
                    width={260}
                    align="end"
                  >
                    <ul
                      role="listbox"
                      aria-label={t('paymentsPage.filterBySupplier')}
                      className="py-1"
                    >
                      {[
                        { key: '', name: t('paymentRuns.allSuppliers') },
                        ...groups.map((group) => ({
                          key: group.key,
                          name: group.name ?? t('paymentRuns.noSupplier'),
                        })),
                      ].map((option) => (
                        <li key={option.key || 'all'}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={supplierFilter === option.key}
                            onClick={() => {
                              setSupplierFilter(option.key)
                              setFilterOpen(false)
                            }}
                            className={[
                              'w-full px-4 py-2.5 text-start text-sm transition-colors hover:bg-primary-25',
                              supplierFilter === option.key
                                ? 'font-semibold text-primary-800'
                                : 'font-medium text-text-secondary',
                            ].join(' ')}
                          >
                            {option.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Popover>
                </>
              ) : null}
            </div>

            {editable ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap text-base font-medium text-text-secondary">
                    {t('paymentsPage.payEverythingDueBy')}
                  </span>
                  <div className="w-[168px]">
                    <DateField
                      value={dueByDate}
                      onChange={(value) => {
                        setDueByDate(value)
                        setWindow(null)
                        add(dueBy(candidates, value).map((bill) => bill.billId))
                      }}
                      ariaLabel={t('paymentsPage.payEverythingDueBy')}
                    />
                  </div>
                </div>
                <div
                  role="group"
                  aria-label={t('paymentsPage.dueWindow')}
                  className="inline-flex items-center rounded-sm border border-border-subtle bg-[#fafafa] p-0.5 max-md:flex max-md:w-full max-md:flex-wrap"
                >
                  {DUE_WINDOWS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={busy}
                      onClick={() => pickWindow(option)}
                      aria-pressed={window === option}
                      className={[
                        'inline-flex h-[30px] items-center justify-center whitespace-nowrap rounded-sm border px-3 text-xs font-medium transition-colors max-md:basis-[calc(50%-2px)] max-md:grow',
                        window === option
                          ? 'border-border-subtle bg-primary-25 font-semibold text-primary-800'
                          : 'border-transparent text-text-tertiary hover:text-text-secondary',
                      ].join(' ')}
                    >
                      {t(`paymentsPage.window.${option}`)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {editable ? (
              <p className="mt-3 flex items-start gap-1.5 text-sm font-medium leading-[1.4] text-text-tertiary">
                <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-semibold text-text-primary">
                    {t('paymentsPage.fallInWindow', {
                      selected: inRun.length,
                      total: every.length,
                    })}
                  </span>{' '}
                  {t('paymentsPage.fallInWindowNote')}
                </span>
              </p>
            ) : null}

            {offered.read.status === 'failed' ? (
              <div className="mt-4">
                <ApiReadFailure error={offered.read.error} retry={offered.retry} />
              </div>
            ) : shown.length === 0 ? (
              <p className="mt-4 text-sm font-medium text-text-tertiary">
                {offered.read.status === 'loading' && actions.editable
                  ? t('appAccess.loading')
                  : t('paymentRuns.nothingToPay')}
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {shown.map((group) => {
                  const chosen = group.bills.filter((bill) => ticked.has(bill.billId))
                  const allOn = chosen.length === group.bills.length
                  const someOn = chosen.length > 0 && !allOn
                  // On a paid run the supplier's header counts only the bills actually paid; a
                  // taken-out row still shows, with its label (owner, 9 Oct 2026).
                  const counted = paidRun
                    ? chosen.filter((bill) => !takenOut.has(bill.billId))
                    : chosen
                  return (
                    <div
                      key={group.key}
                      className="overflow-hidden rounded-sm border border-border-subtle"
                    >
                      <div className="flex flex-wrap items-center gap-3 bg-surface-background px-4 py-3">
                        {editable ? (
                          <TableCheckbox
                            checked={allOn}
                            indeterminate={someOn}
                            disabled={busy}
                            onChange={() =>
                              allOn
                                ? void remove(chosen.map((bill) => bill.billId))
                                : void add(
                                    group.bills
                                      .filter((bill) => !ticked.has(bill.billId))
                                      .map((bill) => bill.billId),
                                  )
                            }
                            ariaLabel={t('paymentsPage.selectSupplier', {
                              name: group.name ?? t('paymentRuns.noSupplier'),
                            })}
                          />
                        ) : null}
                        <SupplierTile name={group.name} />
                        <div className="min-w-0">
                          <p className="text-base font-semibold leading-[1.2] text-text-primary">
                            {group.name ?? t('paymentRuns.noSupplier')}
                          </p>
                          <p className="mt-0.5 text-xs font-medium leading-[1.2] text-text-muted">
                            {t('paymentsPage.billsAsOneTransfer', { count: counted.length })}
                          </p>
                        </div>
                        <div className="ms-auto text-end">
                          <Amount
                            value={sum(counted.map((bill) => bill.amount))}
                            currency={currency}
                          />
                          <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">
                            {t('paymentsPage.oneTransfer')}
                          </p>
                        </div>
                      </div>
                      {group.bills.map((bill) => {
                        const due = dueNote(bill.dueDate, today)
                        const on = ticked.has(bill.billId)
                        const saved = discountPercent(bill.discount, bill.outstanding)
                        return (
                          <div
                            key={bill.billId}
                            className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-4 py-3"
                          >
                            {editable ? (
                              <TableCheckbox
                                checked={on}
                                disabled={busy}
                                onChange={() =>
                                  on ? void remove([bill.billId]) : void add([bill.billId])
                                }
                                ariaLabel={t('paymentsPage.selectBill', {
                                  id: bill.supplierBillNumber ?? bill.billId,
                                })}
                              />
                            ) : null}
                            <div className="min-w-0">
                              <Link
                                to={`/expenditure/bills/${bill.billId}`}
                                className="text-sm font-semibold leading-[1.2] text-text-primary hover:underline"
                              >
                                {bill.supplierBillNumber ?? t('paymentRuns.unnumbered')}
                              </Link>
                              <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">
                                {/* TODO(backend): the approval date and the matched order on a candidate; the issue date stands in. */}
                                {bill.issueDate
                                  ? t('paymentsPage.issued', {
                                      date: formatDate(bill.issueDate, i18n.language),
                                    })
                                  : t('paymentRuns.noDate')}
                              </p>
                              {takenOut.has(bill.billId) ? (
                                <span
                                  className={[
                                    'mt-1 inline-flex items-center rounded-sm px-3 py-1 text-[10px] font-medium leading-[1.2]',
                                    DUE_CHIP.none,
                                  ].join(' ')}
                                >
                                  {t('paymentRuns.takenOutRow', {
                                    reason: takenOut.get(bill.billId)!.reason,
                                  })}
                                </span>
                              ) : null}
                            </div>
                            <span
                              className={[
                                'ms-auto inline-flex items-center rounded-sm px-3 py-1 text-[10px] font-medium leading-[1.2]',
                                DUE_CHIP[due.tone],
                              ].join(' ')}
                            >
                              {t(due.key, {
                                count: due.days,
                                date: bill.dueDate ? formatDate(bill.dueDate, i18n.language) : '',
                              })}
                            </span>
                            <div className="w-[150px] text-end">
                              <Amount value={bill.amount} currency={currency} />
                              {saved > 0 ? (
                                <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-[#3d5648]">
                                  {t('paymentsPage.savedEarly', { percent: saved })}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}

            {blockedRows.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-sm">
                <button
                  type="button"
                  onClick={() => setBlockedOpen((open) => !open)}
                  aria-expanded={blockedOpen}
                  className="flex w-full items-center gap-2 py-2 text-start"
                >
                  <img src={infoIcon} alt="" className="size-4 shrink-0" />
                  <span className="text-sm font-medium text-text-tertiary">
                    <span className="font-semibold text-text-primary">
                      {t('paymentsPage.blocked.more', { count: blockedRows.length })}
                    </span>
                    {' · '}
                    {t('paymentsPage.blocked.reason')}
                  </span>
                  <img
                    src={chevronIcon}
                    alt=""
                    className={[
                      'ms-auto size-5 shrink-0 transition-transform',
                      blockedOpen ? '-rotate-90' : 'rotate-90',
                    ].join(' ')}
                  />
                </button>
                {blockedOpen ? (
                  <div className="rounded-sm bg-surface-background">
                    {blockedRows.map((bill, index) => (
                      <div
                        key={bill.billId}
                        className={[
                          'flex flex-wrap items-center gap-3 px-4 py-3.5',
                          index > 0 ? 'border-t border-border-subtle' : '',
                        ].join(' ')}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-[1.2] text-text-tertiary">
                            {bill.supplierName ?? t('paymentRuns.noSupplier')} ·{' '}
                            {bill.supplierBillNumber ?? t('paymentRuns.unnumbered')}
                          </p>
                          <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">
                            {bill.reasonCodes
                              .map((code) =>
                                t(REASON_KEYS[code], {
                                  given: bill.approvalsGiven,
                                  required: bill.approvalsRequired,
                                }),
                              )
                              .join(' · ')}
                          </p>
                        </div>
                        <div className="ms-auto">
                          <Amount value={bill.outstanding} currency={currency} />
                        </div>
                        <Link
                          to={`/expenditure/bills/${bill.billId}`}
                          className="inline-flex h-[34px] items-center rounded-sm border border-border-subtle bg-white px-3 text-xs font-semibold text-text-secondary hover:bg-primary-25"
                        >
                          {bill.reasonCodes.some(
                            (code) =>
                              code === 'ON_HOLD' || code === 'MISMATCH' || code === 'REJECTED',
                          )
                            ? t('paymentsPage.blocked.openDispute')
                            : t('paymentRuns.blocked.open')}
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* 2: when and from where */}
          <section className="rounded-md bg-surface-card p-5">
            <SectionTitle step={2} title={t('paymentsPage.whenAndWhere')} />
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
                  {t('paymentsPage.paymentDate')}
                  {required}
                </span>
                <DateField
                  value={details.paymentDate ?? ''}
                  onChange={(paymentDate) => change({ paymentDate })}
                  ariaLabel={t('paymentsPage.paymentDate')}
                  min={today}
                  disabled={!editable || busy}
                />
                {editable ? (
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('paymentRuns.dateNote')}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                {/* Optional: kept with the run for tracking; nothing asks for it (9 Oct 2026). */}
                <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
                  {t('paymentsPage.payFrom')}
                </span>
                <Select
                  value={details.payerAccountId ?? ''}
                  onChange={(payerAccountId) => change({ payerAccountId: payerAccountId || null })}
                  options={accountOptions}
                  placeholder={t('paymentRuns.noAccount')}
                  ariaLabel={t('paymentsPage.payFrom')}
                  disabled={!editable || busy}
                />
                {editable && canAddAccount ? (
                  <button
                    type="button"
                    onClick={() => setAddingAccount(true)}
                    className="self-start text-sm font-semibold text-primary-700 hover:underline"
                  >
                    {t('paymentRuns.account.add')}
                  </button>
                ) : editable && accountOptions.length === 0 ? (
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('paymentRuns.account.askAdmin')}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-sm font-medium leading-[1.2] text-text-primary">
                    {t('paymentsPage.runReference')}
                  </span>
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('paymentsPage.shownOnStatements')}
                  </span>
                </span>
                <input
                  value={details.runReference}
                  maxLength={35}
                  disabled={!editable}
                  onChange={(event) =>
                    setDetails((current) => ({ ...current, runReference: event.target.value }))
                  }
                  onBlur={() => {
                    if (runId && details.runReference.trim() !== (run?.runReference ?? ''))
                      change({})
                  }}
                  aria-label={t('paymentsPage.runReference')}
                  className="h-[50px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none disabled:opacity-60"
                />
              </div>
            </div>
          </section>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t('paymentsPage.thisRun')}
            </h2>
            <dl className="mt-4 flex flex-col gap-3 border-t border-surface-background pt-4">
              {[
                [
                  t('paymentsPage.billsSelected'),
                  t('paymentsPage.ofTotal', { selected: inRun.length, total: every.length }),
                ],
                [t('paymentsPage.suppliers'), String(paying.length)],
                [t('paymentsPage.transfers'), String(paying.length)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
                  <dd className="text-sm font-semibold text-text-primary">{value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-text-tertiary">
                  {t('paymentsPage.billsTotal')}
                </dt>
                <dd>
                  <Amount value={run?.billsTotal ?? 0} currency={currency} size="md" />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-text-tertiary">
                  {t('paymentsPage.earlyDiscount')}
                </dt>
                <dd className="flex items-center gap-1 text-sm font-medium text-[#3d5648]">
                  <span aria-hidden="true">-</span>
                  <Amount
                    value={run?.discountTotal ?? 0}
                    currency={currency}
                    className="text-sm font-medium text-[#3d5648]"
                  />
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
              <span className="text-base font-medium text-text-secondary">
                {t('paymentsPage.leavingYourAccount')}
              </span>
              <Amount
                value={run?.netTotal ?? 0}
                currency={currency}
                size="lg"
                className="whitespace-nowrap text-2xl font-semibold leading-[1.2] text-text-primary"
              />
            </div>
            {split ? (
              <p className="mt-0.5 text-end text-[10px] font-medium leading-[1.2] text-text-muted">
                {withRial(
                  t('paymentRuns.paidAndTakenOut', {
                    paid: `${currency} ${formatAmount(split.paid, currency, i18n.language)}`,
                    takenOut: `${currency} ${formatAmount(split.takenOut, currency, i18n.language)}`,
                  }),
                )}
              </p>
            ) : null}
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t('paymentsPage.whoGetsPaid')}
            </h2>
            {paying.length === 0 ? (
              <p className="mt-4 border-t border-surface-background pt-4 text-sm font-medium text-text-tertiary">
                {t('paymentsPage.nobodyYet')}
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-4 border-t border-surface-background pt-4">
                {paying.map((group) => (
                  <li key={group.key} className="flex items-center gap-3">
                    <SupplierTile name={group.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-[1.2] text-text-primary">
                        {group.name ?? t('paymentRuns.noSupplier')}
                      </p>
                      <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">
                        {t('paymentsPage.billsAsOneTransfer', { count: group.bills.length })}
                      </p>
                    </div>
                    <Amount
                      value={sum(group.bills.map((bill) => bill.amount))}
                      currency={currency}
                      size="md"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {addingAccount ? (
        <AddPayerAccountModal
          onClose={() => setAddingAccount(false)}
          onAdded={(account) => {
            setAddingAccount(false)
            setAddedAccounts((current) => [...current, account])
            change({ payerAccountId: account.id })
          }}
        />
      ) : null}
      {confirmingPaid && runId && run && detail ? (
        <MarkPaidModal
          run={run}
          items={detail.items}
          today={today}
          onClose={() => setConfirmingPaid(false)}
          onCancelInstead={() => {
            setConfirmingPaid(false)
            // A run made before bank files were dropped asks whether the bank paid nothing; any
            // other is cancelled as from the menu.
            if (run.state === 'EXPORTED') setCancellingSent(true)
            else setCancellingUnsent(true)
          }}
          onConfirm={async (takeOut, paymentDate) => {
            try {
              await markRunPaid(runId, takeOut, paymentDate)
              setConfirmingPaid(false)
              loaded.retry()
            } catch (error) {
              setConfirmingPaid(false)
              setNotice(refusalOf(error, t, 'markPaid'))
            }
          }}
        />
      ) : null}
      {cancellingUnsent && runId && run ? (
        <ConfirmModal
          title={t('paymentRuns.confirmCancel.title', { reference: run.reference })}
          body={t('paymentRuns.confirmCancel.body')}
          confirm={t('paymentRuns.cancel')}
          danger
          onClose={() => setCancellingUnsent(false)}
          onConfirm={async () => {
            try {
              await cancelRun(runId)
              setCancellingUnsent(false)
              loaded.retry()
            } catch (error) {
              setCancellingUnsent(false)
              setNotice(refusalOf(error, t))
            }
          }}
        />
      ) : null}
      {cancellingSent && runId && run ? (
        <CancelSentRunModal
          run={run}
          onClose={() => setCancellingSent(false)}
          onConfirm={async (reason) => {
            try {
              await cancelRun(runId, { reason })
              setCancellingSent(false)
              loaded.retry()
            } catch (error) {
              setCancellingSent(false)
              setNotice(refusalOf(error, t))
            }
          }}
        />
      ) : null}
    </div>
  )
}
