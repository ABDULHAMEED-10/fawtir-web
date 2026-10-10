import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  loadRun,
  removeFromRun,
  runPath,
  type PaymentRunDetailDto,
  type PaymentRunItemDto,
} from '../../api/expenditure/paymentRuns'
import {
  billOriginalPath,
  downloadBillOriginal,
  loadBill,
  type BillDetailDto,
} from '../../api/expenditure/bills'
import { formatAmount, formatDate, formatInstantDay } from '../../lib/format'
import { muscatToday } from '../../lib/invoiceIssue'
import {
  actionsFor,
  discountPercent,
  groupBySupplier,
  refusalOf,
  type RunBill,
} from '../../lib/paymentRuns'
import { saveDownload } from '../../lib/supplierRecord'
import { can, useSession } from '../../lib/session/session'
import { Amount, HEADER_BUTTON, RunMenu, SupplierTile } from '../PaymentRunPage/RunParts'
import printIcon from '../../assets/invoice-details/print.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import fileIcon from '../../assets/bill-capture/file.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const SOURCE_STYLE: Record<
  BillDetailDto['bill']['source'],
  { bg: string; fg: string; labelKey: string }
> = {
  PEPPOL: { bg: 'bg-success-100', fg: 'text-success-700', labelKey: 'billsPage.source.peppol' },
  UPLOADED: { bg: 'bg-[#e3e4ea]', fg: 'text-[#474a5e]', labelKey: 'billsPage.source.uploaded' },
  SCANNED: { bg: 'bg-pending-100', fg: 'text-pending-700', labelKey: 'billsPage.source.scanned' },
  RECURRING: {
    bg: 'bg-primary-50',
    fg: 'text-primary-800',
    labelKey: 'billsPage.source.recurring',
  },
  SELF_BILLED: {
    bg: 'bg-primary-50',
    fg: 'text-primary-800',
    labelKey: 'billsPage.source.selfBilled',
  },
}

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5]

type Loaded = BillDetailDto | 'failed'

/**
 * Payments › View their invoice (Figma 163:17374): every bill in the run as the supplier sent it.
 * The pile on the left is the run's own items; the document and the recorded figures are each
 * bill's own read (`GET /bills/{id}`), which also names its source, its order and who approved it.
 */
export function PaymentRunInvoicesPage() {
  const { runId = '' } = useParams()
  return (
    <AppShell>
      <RunInvoices key={runId} runId={runId} />
    </AppShell>
  )
}

function RunInvoices({ runId }: { runId: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const today = muscatToday()
  const loaded = useApiRead<PaymentRunDetailDto>(runPath(runId), () => loadRun(runId))
  const [bills, setBills] = useState<Record<string, Loaded>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [zoomIndex, setZoomIndex] = useState(1)
  const [notice, setNotice] = useState<string | null>(null)
  const inFlight = useRef(false)

  const detail = loaded.read.status === 'ready' ? loaded.read.data : null
  const items = useMemo(() => detail?.items ?? [], [detail])

  // TODO(backend): the source, net, VAT, order match and approver on a run's items themselves;
  // until then each bill is read once, in the order the pile lists them.
  useEffect(() => {
    let active = true
    for (const item of items) {
      if (bills[item.billId]) continue
      loadBill(item.billId).then(
        (bill) => active && setBills((current) => ({ ...current, [item.billId]: bill })),
        () => active && setBills((current) => ({ ...current, [item.billId]: 'failed' })),
      )
    }
    return () => {
      active = false
    }
    // Only a new set of items starts reads; a read landing must not start the loop again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const pile: RunBill[] = useMemo(
    () =>
      items.map((item) => ({
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
    [items],
  )
  const groups = useMemo(() => groupBySupplier(pile), [pile])
  const ordered = useMemo(() => groups.flatMap((group) => group.bills), [groups])
  const index = Math.max(
    0,
    ordered.findIndex((bill) => bill.billId === activeId),
  )
  const current = ordered[index] ?? null
  const currentItem: PaymentRunItemDto | null = current
    ? (items.find((item) => item.billId === current.billId) ?? null)
    : null
  const bill = current ? bills[current.billId] : undefined
  const zoom = ZOOM_STEPS[zoomIndex]

  const go = (step: number) => {
    const next = ordered[index + step]
    if (next) setActiveId(next.billId)
  }

  /** Arrow keys move through the pile, as the footer says; not while someone is typing. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.key === 'ArrowRight') go(1)
      if (event.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (loaded.read.status === 'loading') return <LoadingNotice />
  if (loaded.read.status === 'failed')
    return <ApiReadFailure error={loaded.read.error} retry={loaded.retry} />
  const run = detail!.run
  const canTakeOut = can(session, 'invoice.payment.manage') && actionsFor(run.state).editable

  const takeOut = async () => {
    if (!current || inFlight.current) return
    inFlight.current = true
    setNotice(null)
    try {
      const next = ordered[index + 1] ?? ordered[index - 1]
      await removeFromRun(runId, current.billId)
      if (next) setActiveId(next.billId)
      loaded.retry()
    } catch (error) {
      setNotice(refusalOf(error, t))
    } finally {
      inFlight.current = false
    }
  }

  const downloadOne = async (target: BillDetailDto) => {
    const path = billOriginalPath(target)
    if (!path) return
    saveDownload(await downloadBillOriginal(path), target.bill.supplierBillNumber ?? target.bill.id)
  }

  const downloadAll = async () => {
    setNotice(null)
    try {
      for (const entry of ordered) {
        const loadedBill = bills[entry.billId]
        if (loadedBill && loadedBill !== 'failed') await downloadOne(loadedBill)
      }
    } catch (error) {
      setNotice(refusalOf(error, t))
    }
  }

  const dateLine = (entry: RunBill) => {
    const issued = entry.issueDate ? formatDate(entry.issueDate, language) : t('paymentRuns.noDate')
    if (!entry.dueDate) return issued
    return entry.dueDate < today
      ? t('paymentsInvoices.issuedOverdue', { issued })
      : t('paymentsInvoices.issuedDue', { issued, due: formatDate(entry.dueDate, language) })
  }

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
          <Link
            to={`/expenditure/payments/${run.id}`}
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
          >
            {run.reference}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <span className="text-2xl font-medium leading-[1.2] text-text-primary">
            {t('paymentsInvoices.breadcrumb')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('paymentsInvoices.title')}
          </h1>
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => globalThis.print()} className={HEADER_BUTTON}>
              <img src={printIcon} alt="" className="size-5" />
              {t('paymentsInvoices.printAll')}
            </button>
            <button type="button" onClick={() => void downloadAll()} className={HEADER_BUTTON}>
              <img src={downloadIcon} alt="" className="size-5" />
              {t('paymentsInvoices.downloadAll')}
            </button>
            <RunMenu
              run={run}
              items={items}
              onNotice={setNotice}
              onChanged={() => loaded.retry()}
            />
          </div>
        </div>
        <p className="text-base font-medium leading-[1.3] text-text-quaternary">
          {t('paymentsInvoices.subtitle', { reference: run.reference })}
        </p>
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      {ordered.length === 0 ? (
        <p className="rounded-md bg-surface-card p-8 text-center text-sm font-medium text-text-tertiary">
          {t('paymentsPage.nobodyYet')}
        </p>
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row">
          {/* The pile */}
          <section className="w-full shrink-0 self-start overflow-hidden rounded-md bg-surface-card xl:w-[280px]">
            <div className="px-4 py-4">
              <p className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('paymentsInvoices.billsInRun', { count: ordered.length })}
              </p>
              <p className="mt-1 text-sm font-medium leading-[1.2] text-text-quaternary">
                {t('paymentsInvoices.groupedBySupplier')}
              </p>
            </div>
            {groups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center gap-2 border-y border-border-subtle bg-surface-background px-4 py-2.5">
                  <SupplierTile name={group.name} size="sm" />
                  <span className="truncate text-sm font-medium text-text-secondary">
                    {group.name ?? t('paymentRuns.noSupplier')}
                  </span>
                </div>
                {group.bills.map((entry) => {
                  const active = current?.billId === entry.billId
                  const known = bills[entry.billId]
                  const source =
                    known && known !== 'failed' ? SOURCE_STYLE[known.bill.source] : null
                  return (
                    <button
                      key={entry.billId}
                      type="button"
                      onClick={() => setActiveId(entry.billId)}
                      aria-current={active}
                      className={[
                        'flex w-full flex-col gap-1 border-b border-border-subtle px-4 py-3 text-start transition-colors',
                        active
                          ? 'border-s-2 border-s-primary-700 bg-primary-25'
                          : 'hover:bg-surface-background',
                      ].join(' ')}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={[
                            'text-sm font-semibold leading-[1.2]',
                            active ? 'text-primary-700' : 'text-text-primary',
                          ].join(' ')}
                        >
                          {entry.supplierBillNumber ?? t('paymentRuns.unnumbered')}
                        </span>
                        <Amount value={entry.amount} currency={run.currency} size="md" />
                      </span>
                      <span className="text-xs font-medium leading-[1.2] text-text-quaternary">
                        {dateLine(entry)}
                      </span>
                      {source ? (
                        <span
                          className={[
                            'mt-1 inline-flex w-fit items-center rounded-[2px] px-2 py-0.5 text-[10px] font-semibold uppercase leading-[1.4]',
                            source.bg,
                            source.fg,
                          ].join(' ')}
                        >
                          {t(source.labelKey)}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </section>

          {/* The document */}
          <section className="flex min-w-0 flex-1 flex-col self-start overflow-hidden rounded-md bg-surface-card max-xl:w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                <img src={fileIcon} alt="" className="size-5" />
                {t('paymentsInvoices.pageOf', {
                  id: current?.supplierBillNumber ?? t('paymentRuns.unnumbered'),
                })}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={t('invoiceDetails.zoomOut')}
                  disabled={zoomIndex === 0}
                  onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={zoomOutIcon} alt="" className="size-5" />
                </button>
                <span className="w-11 text-center text-xs font-medium text-text-tertiary tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  aria-label={t('invoiceDetails.zoomIn')}
                  disabled={zoomIndex === ZOOM_STEPS.length - 1}
                  onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={zoomInIcon} alt="" className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label={t('invoiceDetails.print')}
                  onClick={() => globalThis.print()}
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white"
                >
                  <img src={printIcon} alt="" className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label={t('invoiceDetails.download')}
                  disabled={!bill || bill === 'failed' || !billOriginalPath(bill)}
                  onClick={() =>
                    bill &&
                    bill !== 'failed' &&
                    void downloadOne(bill).catch((error: unknown) => setNotice(refusalOf(error, t)))
                  }
                  className="inline-flex size-[30px] items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={downloadIcon} alt="" className="size-5" />
                </button>
              </div>
            </div>
            <div className="flex min-h-[420px] justify-center-safe overflow-auto bg-[#e7e8ec] p-6">
              {!bill ? (
                <LoadingNotice />
              ) : bill === 'failed' ? (
                <p className="self-center text-sm font-medium text-text-tertiary">
                  {t('paymentsInvoices.documentUnavailable')}
                </p>
              ) : (
                <Document bill={bill} zoom={zoom} />
              )}
            </div>
          </section>

          {/* What we recorded */}
          <aside className="w-full shrink-0 self-start rounded-md bg-surface-card p-5 xl:w-[300px]">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t('paymentsInvoices.whatRecorded')}
            </h2>
            {current && currentItem ? <Recorded bill={bill} item={currentItem} run={run} /> : null}

            <div className="mt-4 flex flex-col gap-2.5">
              {current ? (
                <Link
                  to={`/expenditure/bills/${current.billId}`}
                  className="inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('paymentsInvoices.openFullBill')}
                </Link>
              ) : null}
              {canTakeOut ? (
                <button
                  type="button"
                  onClick={() => void takeOut()}
                  className="inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  {t('paymentsInvoices.takeOut')}
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-border-subtle pt-4">
              <button
                type="button"
                onClick={() => go(-1)}
                disabled={index === 0}
                className="inline-flex h-[46px] items-center justify-center gap-1.5 rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <img src={chevronIcon} alt="" className="size-4 rotate-180 rtl:rotate-0" />
                {t('paymentsInvoices.previous')}
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                disabled={index >= ordered.length - 1}
                className="inline-flex h-[46px] items-center justify-center gap-1.5 rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('paymentsInvoices.next')}
                <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
              </button>
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.4] text-text-tertiary">
              <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
              {t('paymentsInvoices.arrowHint', { current: index + 1, total: ordered.length })}
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}

/** The figures Fawtir holds against the bill, and the three checks the design lists under them. */
function Recorded({
  bill,
  item,
  run,
}: {
  bill: Loaded | undefined
  item: PaymentRunItemDto
  run: PaymentRunDetailDto['run']
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const known = bill && bill !== 'failed' ? bill : null
  const vat = known?.bill.vatAmount ?? null
  const total = known?.bill.totalIncludingVat ?? item.outstanding
  const net = vat === null ? null : Math.round((total - vat) * 1000) / 1000
  const saved = discountPercent(item.discountTaken, item.outstanding)

  const checks: string[] = []
  if (known) {
    const source = known.bill.source
    if (source === 'PEPPOL')
      checks.push(
        t(
          known.bill.networkVerified
            ? 'paymentsInvoices.checks.peppolVerified'
            : 'paymentsInvoices.checks.matchesDocument',
        ),
      )
    else if (source === 'SCANNED') checks.push(t('paymentsInvoices.checks.readFromPhoto'))
    else if (source === 'UPLOADED') checks.push(t('paymentsInvoices.checks.uploaded'))
    else checks.push(t('paymentsInvoices.checks.matchesDocument'))

    const match = known.bill.match
    if (!match || match.verdict === 'NO_ORDER') checks.push(t('paymentsInvoices.checks.noOrder'))
    else if (match.verdict === 'MATCHED_BY_HAND')
      checks.push(
        t('paymentsInvoices.checks.matchedByHand', { order: match.purchaseOrderNumber ?? '' }),
      )
    else if (match.verdict === 'MATCHED')
      checks.push(
        match.goodsReceiptNumber
          ? t('paymentsInvoices.checks.matchedToBoth', {
              order: match.purchaseOrderNumber ?? '',
              receipt: match.goodsReceiptNumber,
            })
          : t('paymentsInvoices.checks.matchedTo', { order: match.purchaseOrderNumber ?? '' }),
      )
    else
      checks.push(t('paymentsInvoices.checks.mismatch', { order: match.purchaseOrderNumber ?? '' }))

    const approval = [...known.approvals].reverse().find((entry) => entry.decision === 'APPROVED')
    if (approval)
      checks.push(
        t('paymentsInvoices.checks.approvedBy', {
          who: approval.decidedBy,
          date: formatInstantDay(approval.decidedAt, language),
        }),
      )
    else if (known.readiness.autoApproved)
      checks.push(t('paymentsInvoices.checks.approvedAutomatically'))
    else checks.push(t('paymentsInvoices.checks.awaitingApproval'))
  }

  return (
    <>
      <dl className="mt-4 flex flex-col gap-3 border-t border-surface-background pt-4">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm font-medium text-text-tertiary">
            {t('paymentsInvoices.supplier')}
          </dt>
          <dd className="truncate text-sm font-semibold text-text-primary">
            {item.supplierName ?? t('paymentRuns.noSupplier')}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm font-medium text-text-tertiary">
            {t('paymentsInvoices.theirBillNo')}
          </dt>
          <dd className="truncate text-sm font-semibold text-text-primary">
            {item.supplierBillNumber ?? t('paymentRuns.unnumbered')}
          </dd>
        </div>
        {(
          [
            [t('paymentsInvoices.net'), net],
            [t('paymentsInvoices.vat'), vat],
            [t('paymentsInvoices.total'), total],
            [t('paymentsInvoices.payingInThisRun'), item.amount],
          ] as [string, number | null][]
        ).map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
            <dd>
              {value === null ? (
                <span className="text-sm font-medium text-text-quaternary">
                  {t('paymentsInvoices.notRecorded')}
                </span>
              ) : (
                <Amount value={value} currency={run.currency} size="md" />
              )}
            </dd>
          </div>
        ))}
      </dl>

      {checks.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2.5 border-t border-border-subtle pt-4">
          {checks.map((check) => (
            <li key={check} className="flex items-start gap-2">
              <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
              <span className="text-sm font-medium leading-[1.3] text-text-tertiary">{check}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {item.discountTaken > 0 ? (
        <p className="mt-4 flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.4] text-text-tertiary">
          <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
          <span>
            {withRial(
              t('paymentsInvoices.discountNote', {
                date: run.paymentDate
                  ? formatDate(run.paymentDate, language)
                  : t('paymentsInvoices.onTime'),
                percent: saved,
                amount: `OMR ${formatAmount(item.discountTaken, run.currency, language)}`,
              }),
            )}
          </span>
        </p>
      ) : null}
    </>
  )
}

/**
 * The bill as it came in. A file someone uploaded or scanned is shown as it is; a Peppol document
 * has no picture, so the sheet is drawn from what was recorded off it.
 */
function Document({ bill, zoom }: { bill: BillDetailDto; zoom: number }) {
  const { t } = useTranslation()
  const path = billOriginalPath(bill)
  const kind = bill.intake ? fileKind(bill.intake.contentType, bill.intake.filename) : 'none'
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!path || kind === 'none' || kind === 'xml') return
    let created: string | null = null
    let active = true
    setUrl(null)
    setFailed(false)
    downloadBillOriginal(path).then(
      (file) => {
        if (!active) return
        created = URL.createObjectURL(file.blob)
        setUrl(created)
      },
      () => active && setFailed(true),
    )
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [path, kind])

  if (kind === 'pdf' || kind === 'image') {
    if (failed)
      return (
        <p className="self-center text-sm font-medium text-text-tertiary">
          {t('paymentsInvoices.documentUnavailable')}
        </p>
      )
    if (!url) return <LoadingNotice />
    const width = 480 * zoom
    return kind === 'pdf' ? (
      <iframe
        src={url}
        title={bill.intake?.filename ?? ''}
        style={{ width }}
        className="h-[640px] shrink-0 border-0 bg-white shadow-card"
      />
    ) : (
      <img
        src={url}
        alt={bill.intake?.filename ?? ''}
        style={{ width }}
        className="h-auto shrink-0 self-start bg-white shadow-card"
      />
    )
  }
  return <Sheet bill={bill} zoom={zoom} />
}

function fileKind(contentType: string | null, filename: string | null): 'pdf' | 'xml' | 'image' {
  const type = (contentType ?? '').toLowerCase()
  const name = (filename ?? '').toLowerCase()
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (type.includes('xml') || name.endsWith('.xml')) return 'xml'
  return 'image'
}

/** The supplier's document, drawn from what was recorded off it. */
function Sheet({ bill, zoom }: { bill: BillDetailDto; zoom: number }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const row = bill.bill
  const money = (value: number | null) =>
    value === null ? '' : formatAmount(value, row.currencyCode, language)
  const vat = row.vatAmount ?? 0
  const total = row.totalIncludingVat ?? 0
  const small = { fontSize: 9 * zoom, marginTop: 4 * zoom }
  const label = { fontSize: 7.5 * zoom, letterSpacing: `${0.08 * zoom}em` }

  return (
    <article
      style={{ width: 480 * zoom, fontSize: 10 * zoom }}
      className="max-w-full shrink-0 self-start rounded-sm bg-white shadow-card"
    >
      <div style={{ padding: 26 * zoom }}>
        <header className="flex items-start justify-between gap-6">
          <div>
            <p
              style={{ fontSize: 15 * zoom }}
              className="font-bold leading-[1.2] text-text-primary"
            >
              {row.supplierName ?? t('paymentRuns.noSupplier')}
            </p>
            {row.source === 'PEPPOL' ? (
              <p style={small} className="font-medium leading-[1.3] text-text-tertiary">
                {t('paymentsInvoices.viaPeppol')}
              </p>
            ) : null}
          </div>
          <div className="text-end">
            <p
              style={{ fontSize: 13 * zoom }}
              className="font-bold uppercase leading-[1.2] text-text-primary"
            >
              {t('paymentsInvoices.taxInvoice')}
            </p>
            {[
              `No. ${row.supplierBillNumber ?? ''}`,
              `${t('paymentsInvoices.issued')} ${row.issueDate ? formatDate(row.issueDate, language) : ''}`,
              `${t('paymentsInvoices.due')} ${row.dueDate ? formatDate(row.dueDate, language) : ''}`,
            ].map((line) => (
              <p key={line} style={small} className="font-medium leading-[1.3] text-text-tertiary">
                {line}
              </p>
            ))}
          </div>
        </header>

        {row.match && row.match.verdict !== 'NO_ORDER' ? (
          <div
            style={{ marginTop: 20 * zoom, paddingTop: 14 * zoom }}
            className="border-t border-[#151c2d]"
          >
            <p style={label} className="font-semibold uppercase text-text-quaternary">
              {t('paymentsInvoices.against')}
            </p>
            <p style={small} className="font-medium leading-[1.3] text-text-tertiary">
              {t('paymentsInvoices.yourOrder')} {row.match.purchaseOrderNumber ?? ''}
            </p>
            {row.match.goodsReceiptNumber ? (
              <p style={small} className="font-medium leading-[1.3] text-text-tertiary">
                {t('paymentsInvoices.receivedOn')} {row.match.goodsReceiptNumber}
              </p>
            ) : null}
          </div>
        ) : null}

        <table style={{ marginTop: 18 * zoom }} className="w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-b border-[#eceef2]">
              {['description', 'qty', 'unit', 'vat', 'amount'].map((key, i) => (
                <th
                  key={key}
                  style={{ fontSize: 7.5 * zoom, paddingBottom: 6 * zoom }}
                  className={[
                    'font-semibold uppercase leading-[1.2] text-text-quaternary',
                    i === 0 ? 'text-start' : 'text-end',
                  ].join(' ')}
                >
                  {t(`paymentsInvoices.col.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((line) => (
              <tr key={line.lineNo} className="border-b border-[#f3f3f3]">
                <td
                  style={{ fontSize: 9 * zoom, paddingBlock: 8 * zoom }}
                  className="font-medium leading-[1.3] text-text-secondary"
                >
                  {line.description ?? ''}
                </td>
                {[
                  line.quantity === null ? '' : `${line.quantity} ${line.unit ?? ''}`.trim(),
                  money(line.unitPrice),
                  line.vatRate === null ? '' : `${line.vatRate}%`,
                  money(line.lineNet),
                ].map((cell, i) => (
                  <td
                    key={i}
                    style={{ fontSize: 9 * zoom, paddingBlock: 8 * zoom }}
                    className="text-end font-medium text-text-secondary"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 14 * zoom }} className="flex justify-end">
          <div style={{ width: '55%' }}>
            {[
              [t('paymentsInvoices.net'), money(total - vat)],
              [t('paymentsInvoices.vat'), money(vat)],
            ].map(([name, value]) => (
              <div
                key={name}
                style={{ fontSize: 9 * zoom, paddingBlock: 5 * zoom }}
                className="flex justify-between font-medium text-text-tertiary"
              >
                <span>{name}</span>
                <span>{value}</span>
              </div>
            ))}
            <div
              style={{ fontSize: 11.5 * zoom, marginTop: 6 * zoom, paddingTop: 8 * zoom }}
              className="flex justify-between border-t border-[#eceef2] font-bold text-text-primary"
            >
              <span>{t('paymentsInvoices.total')}</span>
              <span>{money(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
