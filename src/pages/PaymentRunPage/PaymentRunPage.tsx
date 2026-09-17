import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, Select, TableCheckbox } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  PAYER_ACCOUNTS_PATH,
  addToRun,
  blockedPath,
  cancelRun,
  candidatesPath,
  createRun,
  exportRun,
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
  FORMATS,
  REASON_KEYS,
  actionsFor,
  dueBy,
  dueNote,
  groupBySupplier,
  refusalOf,
  sum,
  windowEnd,
  type DueTone,
  type DueWindow,
  type RunBill,
} from '../../lib/paymentRuns'
import { saveDownload } from '../../lib/supplierRecord'
import { can, useSession } from '../../lib/session/session'
import { AddPayerAccountModal, Amount, ConfirmModal, RunStatePill, SectionTitle } from './RunParts'
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

type Details = { paymentDate: string | null; payerAccountId: string | null; runReference: string; format: PaymentRunFormat | null }

const NO_DETAILS: Details = { paymentDate: null, payerAccountId: null, runReference: '', format: null }

/**
 * Expenditure › Payments › a run (E-11). `/expenditure/payments/new` builds a run that does not
 * exist yet: it is created when the first bill is ticked (decision 1). Every figure comes from the
 * server — what a bill would cost on the run's date, what the run totals, what cannot be paid.
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
  const canExport = can(session, 'invoice.export')
  const canAddAccount = can(session, 'admin.settings.manage')

  const loaded = useApiRead<PaymentRunDetailDto>(runId ? runPath(runId) : null, () => loadRun(runId!))
  const [detail, setDetail] = useState<PaymentRunDetailDto | null>(null)
  const [details, setDetails] = useState<Details>(NO_DETAILS)
  const [supplierFilter, setSupplierFilter] = useState('')
  const [window, setWindow] = useState<DueWindow | null>(null)
  const [dueByDate, setDueByDate] = useState('')
  const [blockedOpen, setBlockedOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addingAccount, setAddingAccount] = useState(false)
  const [confirming, setConfirming] = useState<'paid' | 'cancel' | null>(null)
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

  const offerPath = actions.editable ? candidatesPath(runId, currency, runId ? null : details.paymentDate) : null
  const offered = useApiRead<PaymentRunCandidateDto[]>(offerPath, () => loadCandidates(offerPath!))
  const blockedListPath = actions.editable ? blockedPath(runId, currency) : null
  const blocked = useApiRead<PaymentRunBlockedDto[]>(blockedListPath, () => loadBlocked(blockedListPath!))
  const accounts = useApiRead<PayerAccountDto[]>(PAYER_ACCOUNTS_PATH, loadPayerAccounts)
  const [addedAccounts, setAddedAccounts] = useState<PayerAccountDto[]>([])

  const inRun: RunBill[] = useMemo(
    () =>
      (detail?.items ?? []).map((item) => ({
        billId: item.billId,
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        supplierBillNumber: item.supplierBillNumber,
        dueDate: item.dueDate,
        outstanding: item.outstanding,
        discount: item.discountTaken,
        amount: item.amount,
      })),
    [detail],
  )
  const candidates: RunBill[] = offered.read.status === 'ready' ? offered.read.data : []
  const ticked = new Set(inRun.map((bill) => bill.billId))
  const every = [...inRun, ...candidates.filter((bill) => !ticked.has(bill.billId))]
  const groups = groupBySupplier(every)
  const shown = supplierFilter ? groups.filter((group) => group.key === supplierFilter) : groups
  const paying = groupBySupplier(inRun)

  const money = (value: number) => formatAmount(value, currency, i18n.language)

  /** One write at a time: a tick while another is in flight would be sent against a stale run. */
  const act = async (write: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      await write()
    } catch (error) {
      setNotice(refusalOf(error, t))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const detailsBody = (patch: Partial<Details>) => {
    const next = { ...details, ...patch }
    return { paymentDate: next.paymentDate, payerAccountId: next.payerAccountId, runReference: next.runReference.trim() || null, format: next.format }
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
    })

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

  const download = () =>
    act(async () => {
      if (!runId || !run) return
      saveDownload(await exportRun(runId), run.reference)
      loaded.retry()
    })

  const pickWindow = (next: DueWindow) => {
    setWindow(next)
    const end = windowEnd(next, today)
    setDueByDate(end ?? '')
    add(dueBy(candidates, end).map((bill) => bill.billId))
  }

  if (runId && loaded.read.status === 'loading') return <LoadingNotice />
  if (runId && loaded.read.status === 'failed') return <ApiReadFailure error={loaded.read.error} retry={loaded.retry} />

  const accountOptions = [...(accounts.read.status === 'ready' ? accounts.read.data : []), ...addedAccounts].map((account) => ({
    value: account.id,
    label: account.name,
    hint: account.iban,
  }))

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/expenditure/payments" className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary">
            {t('paymentsPage.breadcrumb')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-quaternary">{run ? run.reference : t('paymentRuns.newRun')}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{run ? t('paymentRuns.runTitle', { reference: run.reference }) : t('paymentsPage.title')}</h1>
          {run ? <RunStatePill state={run.state} /> : null}
          <div className="ms-auto flex flex-wrap items-center gap-3">
            {run ? (
              <Link
                to={`/expenditure/payments/${run.id}/invoices`}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] hover:bg-white"
              >
                <img src={viewInvoiceIcon} alt="" className="size-5 shrink-0" />
                {t('paymentRuns.reviewBills')}
              </Link>
            ) : null}
            {canManage && actions.canCancel && run ? (
              <button type="button" disabled={busy} onClick={() => setConfirming('cancel')} className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-60">
                {t('paymentRuns.cancel')}
              </button>
            ) : null}
            {canExport && run && actions.canExport ? (
              <button type="button" disabled={busy} onClick={() => void download()} className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60">
                {run.state === 'EXPORTED' ? t('paymentRuns.downloadAgain') : t('paymentRuns.makeFile')}
              </button>
            ) : null}
            {canManage && run && actions.canMarkPaid ? (
              <button type="button" disabled={busy} onClick={() => setConfirming('paid')} className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60">
                {t('paymentRuns.markPaid')}
              </button>
            ) : null}
          </div>
        </div>
        <p className="text-base font-medium leading-[1.3] text-text-quaternary">
          {run ? t(`paymentRuns.stateNote.${run.state}`, { date: run.paymentDate ? formatDate(run.paymentDate, i18n.language) : '' }) : t('paymentRuns.newNote')}
        </p>
      </div>

      {notice ? <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="rounded-md bg-surface-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle step={1} title={t('paymentsPage.whichBills')} note={actions.editable ? t('paymentRuns.readyOnly') : undefined} />
              {groups.length > 1 ? (
                <div className="w-[240px]">
                  <Select
                    value={supplierFilter}
                    onChange={setSupplierFilter}
                    ariaLabel={t('paymentsPage.filterBySupplier')}
                    options={[{ value: '', label: t('paymentRuns.allSuppliers') }, ...groups.map((group) => ({ value: group.key, label: group.name ?? t('paymentRuns.noSupplier') }))]}
                  />
                </div>
              ) : null}
            </div>

            {editable ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap text-base font-medium text-text-secondary">{t('paymentRuns.tickDueBy')}</span>
                  <div className="w-[168px]">
                    <DateField
                      value={dueByDate}
                      onChange={(value) => {
                        setDueByDate(value)
                        setWindow(null)
                        add(dueBy(candidates, value).map((bill) => bill.billId))
                      }}
                      ariaLabel={t('paymentRuns.tickDueBy')}
                    />
                  </div>
                </div>
                <div role="group" aria-label={t('paymentsPage.dueWindow')} className="inline-flex items-center rounded-sm bg-surface-background p-1 max-md:flex max-md:w-full max-md:overflow-x-auto">
                  {DUE_WINDOWS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={busy}
                      onClick={() => pickWindow(option)}
                      aria-pressed={window === option}
                      className={[
                        'inline-flex h-9 items-center whitespace-nowrap rounded-sm px-2.5 text-sm font-medium transition-colors',
                        window === option ? 'bg-primary-25 font-semibold text-primary-800 shadow-sm' : 'text-text-tertiary hover:text-text-secondary',
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
                  <span className="font-semibold text-text-primary">{t('paymentsPage.ofTotal', { selected: inRun.length, total: every.length })}</span> {t('paymentRuns.tickNote')}
                </span>
              </p>
            ) : null}

            {offered.read.status === 'failed' ? (
              <div className="mt-4">
                <ApiReadFailure error={offered.read.error} retry={offered.retry} />
              </div>
            ) : shown.length === 0 ? (
              <p className="mt-4 text-sm font-medium text-text-tertiary">
                {offered.read.status === 'loading' && actions.editable ? t('appAccess.loading') : t('paymentRuns.nothingToPay')}
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {shown.map((group) => {
                  const chosen = group.bills.filter((bill) => ticked.has(bill.billId))
                  const allOn = chosen.length === group.bills.length
                  const someOn = chosen.length > 0 && !allOn
                  return (
                    <div key={group.key} className="overflow-hidden rounded-sm border border-border-subtle">
                      <div className="flex flex-wrap items-center gap-3 bg-surface-background px-4 py-3">
                        {editable ? (
                          <TableCheckbox
                            checked={allOn}
                            indeterminate={someOn}
                            disabled={busy}
                            onChange={() =>
                              allOn
                                ? void remove(chosen.map((bill) => bill.billId))
                                : void add(group.bills.filter((bill) => !ticked.has(bill.billId)).map((bill) => bill.billId))
                            }
                            ariaLabel={t('paymentsPage.selectSupplier', { name: group.name ?? t('paymentRuns.noSupplier') })}
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="text-base font-semibold leading-[1.2] text-text-primary">{group.name ?? t('paymentRuns.noSupplier')}</p>
                          <p className="mt-0.5 text-xs font-medium leading-[1.2] text-text-muted">{t('paymentsPage.billsAsOneTransfer', { count: chosen.length })}</p>
                        </div>
                        <div className="ms-auto text-end">
                          <Amount value={money(sum(chosen.map((bill) => bill.amount)))} currency={currency} />
                          <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">{t('paymentsPage.oneTransfer')}</p>
                        </div>
                      </div>
                      {group.bills.map((bill) => {
                        const due = dueNote(bill.dueDate, today)
                        const on = ticked.has(bill.billId)
                        return (
                          <div key={bill.billId} className="flex flex-wrap items-center gap-3 border-t border-border-subtle px-4 py-3">
                            {editable ? (
                              <TableCheckbox
                                checked={on}
                                disabled={busy}
                                onChange={() => (on ? void remove([bill.billId]) : void add([bill.billId]))}
                                ariaLabel={t('paymentsPage.selectBill', { id: bill.supplierBillNumber ?? bill.billId })}
                              />
                            ) : null}
                            <div className="min-w-0">
                              <Link to={`/expenditure/bills/${bill.billId}`} className="text-sm font-semibold leading-[1.2] text-text-primary hover:underline">
                                {bill.supplierBillNumber ?? t('paymentRuns.unnumbered')}
                              </Link>
                            </div>
                            <span className={['ms-auto inline-flex items-center rounded-full px-3 py-1 text-[10px] font-medium leading-[1.2]', DUE_CHIP[due.tone]].join(' ')}>
                              {t(due.key, { count: due.days, date: bill.dueDate ? formatDate(bill.dueDate, i18n.language) : '' })}
                            </span>
                            <div className="w-[160px] text-end">
                              <Amount value={money(bill.amount)} currency={currency} />
                              {bill.discount > 0 ? (
                                <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-[#3d5648]">{t('paymentRuns.discountNote', { amount: money(bill.discount), currency })}</p>
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

            {blocked.read.status === 'ready' && blocked.read.data.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-sm">
                <button type="button" onClick={() => setBlockedOpen((open) => !open)} aria-expanded={blockedOpen} className="flex w-full items-center gap-2 py-2 text-start">
                  <img src={infoIcon} alt="" className="size-4 shrink-0" />
                  <span className="text-sm font-medium text-text-tertiary">
                    <span className="font-semibold text-text-primary">{t('paymentRuns.blocked.count', { count: blocked.read.data.length })}</span>
                  </span>
                  <img src={chevronIcon} alt="" className={['ms-auto size-5 shrink-0 transition-transform', blockedOpen ? '-rotate-90' : 'rotate-90'].join(' ')} />
                </button>
                {blockedOpen ? (
                  <div className="rounded-sm bg-surface-background">
                    {blocked.read.data.map((bill, index) => (
                      <div key={bill.billId} className={['flex flex-wrap items-center gap-3 px-4 py-3.5', index > 0 ? 'border-t border-border-subtle' : ''].join(' ')}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-[1.2] text-text-tertiary">
                            {bill.supplierName ?? t('paymentRuns.noSupplier')} · {bill.supplierBillNumber ?? t('paymentRuns.unnumbered')}
                          </p>
                          <p className="mt-0.5 text-xs font-medium leading-[1.2] text-text-muted">
                            {bill.reasonCodes.map((code) => t(REASON_KEYS[code], { given: bill.approvalsGiven, required: bill.approvalsRequired })).join(' · ')}
                          </p>
                        </div>
                        <div className="ms-auto">
                          <Amount value={money(bill.outstanding)} currency={currency} />
                        </div>
                        <Link to={`/expenditure/bills/${bill.billId}`} className="inline-flex h-[34px] items-center rounded-sm border border-border-subtle bg-white px-3 text-xs font-semibold text-text-secondary hover:bg-primary-25">
                          {t('paymentRuns.blocked.open')}
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <SectionTitle step={2} title={t('paymentsPage.whenAndWhere')} />
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium leading-[1.2] text-text-primary">{t('paymentsPage.paymentDate')}</span>
                <DateField value={details.paymentDate ?? ''} onChange={(paymentDate) => change({ paymentDate })} ariaLabel={t('paymentsPage.paymentDate')} min={today} disabled={!editable || busy} />
                <span className="text-xs font-medium text-text-quaternary">{t('paymentRuns.dateNote')}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium leading-[1.2] text-text-primary">{t('paymentsPage.payFrom')}</span>
                <Select
                  value={details.payerAccountId ?? ''}
                  onChange={(payerAccountId) => change({ payerAccountId: payerAccountId || null })}
                  options={[{ value: '', label: t('paymentRuns.noAccount') }, ...accountOptions]}
                  ariaLabel={t('paymentsPage.payFrom')}
                />
                {editable && canAddAccount ? (
                  <button type="button" onClick={() => setAddingAccount(true)} className="self-start text-sm font-semibold text-primary-700 hover:underline">
                    {t('paymentRuns.account.add')}
                  </button>
                ) : accountOptions.length === 0 ? (
                  <span className="text-xs font-medium text-text-quaternary">{t('paymentRuns.account.askAdmin')}</span>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-sm font-medium leading-[1.2] text-text-primary">{t('paymentsPage.runReference')}</span>
                  <span className="text-xs font-medium text-text-quaternary">{t('paymentsPage.shownOnStatements')}</span>
                </span>
                <input
                  value={details.runReference}
                  maxLength={35}
                  disabled={!editable}
                  onChange={(event) => setDetails((current) => ({ ...current, runReference: event.target.value }))}
                  onBlur={() => {
                    if (runId && details.runReference.trim() !== (run?.runReference ?? '')) change({})
                  }}
                  aria-label={t('paymentsPage.runReference')}
                  className="h-[50px] rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none disabled:opacity-60"
                />
              </div>
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <SectionTitle step={3} title={t('paymentsPage.howToSend')} />
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {FORMATS.map((option) => {
                const active = option.id === details.format
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!editable || busy}
                    onClick={() => change({ format: option.id })}
                    aria-pressed={active}
                    className={[
                      'flex items-start gap-3 rounded-sm border p-4 text-start transition-colors disabled:cursor-default',
                      active ? 'border-primary-700 bg-primary-25' : 'border-border-subtle bg-white hover:border-primary-300',
                    ].join(' ')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium leading-[1.2] text-text-primary">{t(option.titleKey)}</span>
                      <span className="mt-1 block text-xs font-medium leading-[1.3] text-text-quaternary">{t(option.noteKey)}</span>
                    </span>
                    {active ? (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-700">
                        <img src={tickIcon} alt="" className="size-3 brightness-0 invert" />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            {details.format === 'PAIN_001' && !details.payerAccountId ? (
              <p className="mt-3 text-xs font-medium text-pending-700">{t('paymentRuns.painNeedsAccount')}</p>
            ) : null}
          </section>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('paymentsPage.thisRun')}</h2>
            <dl className="mt-4 flex flex-col gap-3">
              {[
                [t('paymentsPage.billsSelected'), String(inRun.length)],
                [t('paymentsPage.transfers'), String(paying.length)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
                  <dd className="text-sm font-semibold text-text-primary">{value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-text-tertiary">{t('paymentsPage.billsTotal')}</dt>
                <dd>
                  <Amount value={money(run?.billsTotal ?? 0)} currency={currency} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-text-tertiary">{t('paymentsPage.earlyDiscount')}</dt>
                <dd className="flex items-center gap-1 text-sm font-medium text-[#3d5648]">
                  −<Amount value={money(run?.discountTotal ?? 0)} currency={currency} />
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-4">
              <span className="text-base font-medium text-text-secondary">{t('paymentsPage.leavingYourAccount')}</span>
              <Amount value={money(run?.netTotal ?? 0)} currency={currency} size="lg" />
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('paymentsPage.whoGetsPaid')}</h2>
            {paying.length === 0 ? (
              <p className="mt-4 text-sm font-medium text-text-tertiary">{t('paymentsPage.nobodyYet')}</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-4">
                {paying.map((group) => (
                  <li key={group.key} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-[1.2] text-text-primary">{group.name ?? t('paymentRuns.noSupplier')}</p>
                      <p className="mt-0.5 text-[10px] font-medium leading-[1.2] text-text-muted">{t('paymentsPage.billsAsOneTransfer', { count: group.bills.length })}</p>
                    </div>
                    <Amount value={money(sum(group.bills.map((bill) => bill.amount)))} currency={currency} />
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
      {confirming && runId && run ? (
        <ConfirmModal
          title={confirming === 'paid' ? t('paymentRuns.confirmPaid.title', { reference: run.reference }) : t('paymentRuns.confirmCancel.title', { reference: run.reference })}
          body={confirming === 'paid' ? t('paymentRuns.confirmPaid.body', { amount: money(run.netTotal) }) : t('paymentRuns.confirmCancel.body')}
          confirm={confirming === 'paid' ? t('paymentRuns.markPaid') : t('paymentRuns.cancel')}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            try {
              if (confirming === 'paid') await markRunPaid(runId)
              else await cancelRun(runId)
              setConfirming(null)
              loaded.retry()
            } catch (error) {
              setConfirming(null)
              setNotice(refusalOf(error, t))
            }
          }}
        />
      ) : null}
    </div>
  )
}
