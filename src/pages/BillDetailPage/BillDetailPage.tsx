import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Modal, Rial, RialMark } from '../../components/ui'
import { BillStatusChip } from '../../components/bills'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api'
import {
  approveBill,
  billMatchPath,
  billOriginalPath,
  downloadBillOriginal,
  holdBill,
  loadBill,
  loadBillMatch,
  loadSupplierOrders,
  matchBill,
  rejectBill,
  releaseBill,
  unmatchBill,
  type BillDetailDto,
  type BillMatchDto,
  type PurchaseOrderOptionDto,
} from '../../api/expenditure/bills'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import {
  loadSupplierOverview,
  supplierOverviewPath,
  type SupplierOverviewDto,
} from '../../api/expenditure/supplierRecord'
import {
  activityOf,
  complianceOf,
  decisionNoteOf,
  decisionsOf,
  singleVatRate,
  stepsOf,
  termsDaysOf,
  threeWayOf,
  type BillStepState,
  type Note,
} from '../../lib/billDetail'
import { toBillListItem } from '../../lib/billList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, formatInstant, formatInstantDay } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import stepIcon from '../../assets/bill-detail/step.svg'
import hdrBtnIcon from '../../assets/bill-detail/hdr-btn.svg'
import stepCurrentIcon from '../../assets/bill-detail/step-current.svg'
import complianceIcon from '../../assets/bill-detail/tick.svg'
import activityIcon from '../../assets/bill-detail/activity.svg'
import matchOkIcon from '../../assets/bills/match-ok.svg'
import matchWarnIcon from '../../assets/bills/match-warn.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import peppolBadgeIcon from '../../assets/invoice-details/peppol-badge.svg'
import clockIcon from '../../assets/invoice-details/clock.svg'
import docOrderIcon from '../../assets/create-invoice/doc-order.svg'
import docDeliveryIcon from '../../assets/create-invoice/doc-delivery.svg'
import pdfIcon from '../../assets/invoice-details/pdf.svg'
import fileIcon from '../../assets/bill-capture/file.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

/** Step circles: completed is a filled grey disc, the one you are on is brand blue. */
const STEP_CIRCLE: Record<BillStepState, string> = {
  done: 'bg-neutral-50 border-border-default',
  current: 'bg-primary-700 border-primary-700',
  upcoming: 'bg-white border-border-default',
}

/** Server refusals worth their own sentence; anything else reads through `describeApiFailure`. */
const REFUSALS: Record<string, string> = {
  APPROVAL_ALREADY_GIVEN: 'billDetail.refused.alreadyApproved',
  APPROVAL_TRANSITION_INVALID: 'billDetail.refused.changed',
  APPROVAL_REJECTION_REASON_REQUIRED: 'billDetail.refused.reasonRequired',
  BILL_HOLD_ALREADY_OPEN: 'billDetail.refused.changed',
  BILL_HOLD_NOT_OPEN: 'billDetail.refused.changed',
  BILL_HOLD_ON_PAID_REFUSED: 'billDetail.refused.paidCannotHold',
  BILL_HOLD_NOT_PAYABLE: 'billDetail.refused.notPayable',
  GOODS_RECEIPT_WRONG_ORDER: 'billDetail.refused.wrongReceipt',
}

const OUTLINE_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'
const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60'
const QUIET_BUTTON =
  'inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60'

type Translate = (key: string, values?: Record<string, unknown>) => string

function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={['rounded-md bg-surface-card p-5 shadow-card', className].join(' ')}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function BillDetailPage() {
  return (
    <AppShell>
      <BillScreen />
    </AppShell>
  )
}

function BillScreen() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const { id = '' } = useParams()

  const path = `/v1/bills/${id}`
  const bill = useApiRead<BillDetailDto>(path, () => loadBill(id))

  // The per-line comparison is a separate read, and a stricter permission than the bill itself.
  const canApproveBills = can(session, 'invoice.approve')
  const matchPath = canApproveBills ? billMatchPath(id) : null
  const match = useApiRead<BillMatchDto>(matchPath, () => loadBillMatch(id))

  // The supplier's record and standing feed the design's Payment terms and Supplier cards (VAT
  // number, bank, early-payment terms, open bills), which the bill itself does not carry.
  const supplierId = bill.read.status === 'ready' ? bill.read.data.bill.supplierId : null
  const canReadSupplier = can(session, 'supplier.read') && supplierId !== null
  const supplier = useApiRead<SupplierDetailDto>(
    canReadSupplier ? supplierPath(supplierId!) : null,
    () => loadSupplier(supplierId!),
  )
  const standing = useApiRead<SupplierOverviewDto>(
    canReadSupplier ? supplierOverviewPath(supplierId!) : null,
    () => loadSupplierOverview(supplierId!),
  )

  // A success is held as its key, not its text: the notice stays on screen across a language
  // switch, and a sentence translated when it was raised would stay in the old language.
  const [notice, setNotice] = useState<{ key: string } | { body: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<'reject' | 'hold' | null>(null)
  const [reason, setReason] = useState('')
  const [matching, setMatching] = useState(false)

  const act = async (run: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setNotice(null)
    try {
      await run()
      setNotice({ key: done })
      bill.retry()
      if (matchPath) match.retry()
      return true
    } catch (error) {
      setNotice({ body: refusalText(t, error) })
      bill.retry()
      return false
    } finally {
      setBusy(false)
    }
  }

  if (bill.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-5">
        <Breadcrumb title={null} />
        {bill.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={bill.read.error} retry={bill.retry} />
        )}
      </div>
    )
  }

  const detail = bill.read.data
  const row = detail.bill
  const listItem = toBillListItem(row)
  const money = (value: number | null) =>
    value === null ? t('billDetail.notStated') : formatAmount(value, row.currencyCode, language)
  const steps = stepsOf(detail, {
    day: (iso) => formatDate(iso, language),
    instantDay: (iso) => formatInstantDay(iso, language),
  })
  const decisions = decisionsOf(detail, (permission) => can(session, permission))
  const original = billOriginalPath(detail)
  const orderNumber =
    row.match?.verdict !== 'NO_ORDER' ? (row.match?.purchaseOrderNumber ?? null) : null
  const profile = supplier.read.status === 'ready' ? supplier.read.data.profile : null
  const payables = standing.read.status === 'ready' ? standing.read.data.payables : null

  const download = async () => {
    if (!original) return
    setNotice(null)
    try {
      const file = await downloadBillOriginal(original)
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename ?? `${row.supplierBillNumber ?? 'bill'}.xml`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setNotice({ body: refusalText(t, error) })
    }
  }

  const confirmReason = async () => {
    const text = reason.trim()
    if (text === '') return
    const ok = await act(
      () => (asking === 'reject' ? rejectBill(id, text) : holdBill(id, text)),
      asking === 'reject' ? 'billDetail.done.rejected' : 'billDetail.done.held',
    )
    if (ok) {
      setAsking(null)
      setReason('')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-5 pb-10">
      <Breadcrumb title={row.supplierBillNumber} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {row.supplierBillNumber ?? t('billsPage.rows.noNumber')}
          </h1>
          <BillStatusChip item={listItem} className="h-[31px]" />
          {row.source === 'PEPPOL' && row.networkVerified ? (
            <span className="inline-flex h-[31px] items-center gap-1.5 rounded-full bg-success-100 px-3 text-xs font-semibold uppercase tracking-[0.5px] text-success-700">
              <img src={peppolBadgeIcon} alt="" className="size-4" />
              {t('billDetail.arrivedOverPeppol')}
            </span>
          ) : null}

          <div className="ms-auto flex flex-wrap items-center gap-3">
            {original ? (
              <button type="button" onClick={download} className={OUTLINE_BUTTON}>
                <img src={downloadIcon} alt="" className="size-5" />
                {t('billDetail.actions.download')}
              </button>
            ) : null}
            {decisions.reject ? (
              <button
                type="button"
                onClick={() => setAsking('reject')}
                disabled={busy}
                className="inline-flex h-[46px] items-center rounded-sm border border-danger-700 bg-white px-4 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100 disabled:opacity-60"
              >
                {t('billDetail.actions.reject')}
              </button>
            ) : null}
            {decisions.approve ? (
              <button
                type="button"
                onClick={() => act(() => approveBill(id), 'billDetail.done.approved')}
                disabled={busy}
                className={PRIMARY_BUTTON}
              >
                <img src={hdrBtnIcon} alt="" className="size-[17px]" />
                {t('billDetail.actions.approve')}
              </button>
            ) : null}
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
          <span className="font-medium text-text-quaternary">{t('billDetail.from')}</span>
          <span className="font-semibold text-text-primary">
            {row.supplierName ?? t('billDetail.supplierUnknown')}
          </span>
          {row.issueDate ? (
            <>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span className="font-medium text-text-quaternary">
                {t('billDetail.issuedOn', { date: formatDate(row.issueDate, language) })}
              </span>
            </>
          ) : null}
          {row.dueDate ? (
            <>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span className="font-medium text-text-quaternary">
                {t('billDetail.dueOn', { date: formatDate(row.dueDate, language) })}
              </span>
            </>
          ) : null}
          {(orderNumber ?? row.purchaseOrderReference) ? (
            <>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span className="font-medium text-text-quaternary">
                {orderNumber ? t('billDetail.against') : t('billDetail.theirOrderRef')}
              </span>
              <span className="font-semibold text-text-primary">
                {orderNumber ?? row.purchaseOrderReference}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {notice ? (
        <Notice
          body={'key' in notice ? t(notice.key) : notice.body}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      <div className="rounded-md bg-surface-card px-6 py-5 shadow-card">
        <div className="flex items-start overflow-x-auto">
          {steps.map((step, index) => (
            <Fragment key={step.id}>
              {index > 0 ? (
                <span
                  className={[
                    'mt-4 h-0.5 min-w-[24px] flex-1 shrink',
                    step.state === 'upcoming' ? 'bg-neutral-50' : 'bg-border-default',
                  ].join(' ')}
                />
              ) : null}
              <div className="flex w-[104px] shrink-0 flex-col items-center gap-[7px]">
                <span
                  className={[
                    'flex size-8 items-center justify-center rounded-full border',
                    STEP_CIRCLE[step.state],
                  ].join(' ')}
                >
                  {step.state === 'upcoming' ? null : (
                    <img
                      src={step.state === 'current' ? stepCurrentIcon : stepIcon}
                      alt=""
                      className="size-[15px]"
                    />
                  )}
                </span>
                <span
                  className={[
                    'text-center text-[10.5px] font-semibold uppercase leading-[13.65px] tracking-[0.52px]',
                    step.state === 'upcoming' ? 'text-[#8a8e96]' : 'text-text-quaternary',
                  ].join(' ')}
                >
                  {t(step.labelKey)}
                </span>
                <span
                  className={[
                    'text-center text-[11.5px] leading-[14.95px]',
                    step.state === 'current'
                      ? 'font-semibold text-primary-700'
                      : 'font-medium text-text-quaternary',
                  ].join(' ')}
                >
                  {step.detail ? <StepDetail note={step.detail} /> : t('billDetail.steps.notYet')}
                </span>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <MatchSection
            detail={detail}
            comparison={canApproveBills && match.read.status === 'ready' ? match.read.data : null}
            language={language}
            busy={busy}
            canMatch={
              canApproveBills && can(session, 'purchase-order.read') && row.supplierId !== null
            }
            onOpenMatch={() => setMatching(true)}
          />

          <Card>
            <div className="mb-4 flex flex-wrap items-baseline gap-2">
              <h2 className="text-lg font-semibold leading-[1.2] text-text-primary">
                {t('billDetail.lines.title')}
              </h2>
              <span className="text-sm font-medium text-text-quaternary">
                {t('billDetail.lines.asSent')}
              </span>
            </div>

            {detail.lines.length === 0 ? (
              <p className="py-6 text-center text-sm font-medium text-text-quaternary">
                {t('billDetail.lines.none')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-start">
                  <thead>
                    <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.8px] text-text-quaternary">
                      <th className="py-2 text-start font-semibold">
                        {t('billDetail.lines.item')}
                      </th>
                      <th className="py-2 text-end font-semibold">{t('billDetail.lines.qty')}</th>
                      <th className="py-2 text-end font-semibold">
                        {t('billDetail.lines.unitPrice')}
                      </th>
                      <th className="py-2 text-end font-semibold">{t('billDetail.lines.vat')}</th>
                      <th className="py-2 text-end font-semibold">
                        {t('billDetail.lines.lineTotal')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.lineNo} className="border-b border-surface-background">
                        <td className="py-3.5">
                          <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                            {line.description ?? t('billDetail.notStated')}
                          </p>
                          {line.goodsReceiptId && row.match?.goodsReceiptNumber ? (
                            <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                              {t('billDetail.lines.receivedOn', {
                                receipt: row.match.goodsReceiptNumber,
                              })}
                            </p>
                          ) : null}
                        </td>
                        <td className="py-3.5 text-end text-sm font-medium text-text-secondary">
                          {line.quantity === null
                            ? t('billDetail.notStated')
                            : `${line.quantity}${line.unit ? ` ${line.unit}` : ''}`}
                        </td>
                        <td className="py-3.5 text-end text-sm font-medium text-text-secondary">
                          <span className="me-1">
                            <Rial />
                          </span>
                          {money(line.unitPrice)}
                        </td>
                        <td className="py-3.5 text-end text-sm font-medium text-text-secondary">
                          {line.vatRate === null ? t('billDetail.notStated') : `${line.vatRate}%`}
                        </td>
                        <td className="py-3.5 text-end text-base font-semibold text-text-primary">
                          <span className="me-1">
                            <Rial />
                          </span>
                          {money(line.lineNet)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <dl className="w-full max-w-[340px]">
                {netAndVat(detail).map(([labelKey, values, value]) => (
                  <div
                    key={labelKey}
                    className="flex items-center justify-between gap-4 border-b border-surface-background py-2.5"
                  >
                    <dt className="text-sm font-medium text-text-tertiary">
                      {t(labelKey, values)}
                    </dt>
                    <dd className="text-sm font-semibold text-text-secondary tabular-nums">
                      <span className="me-1">
                        <Rial />
                      </span>
                      {money(value)}
                    </dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 pt-3.5">
                  <dt className="text-base font-semibold text-text-primary">
                    {t('billDetail.lines.theyreCharging')}
                  </dt>
                  <dd className="text-[22px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                    <span className="me-1">
                      <Rial />
                    </span>
                    {money(row.totalIncludingVat)}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>

          <LinkedDocuments
            detail={detail}
            language={language}
            busy={busy}
            canMatch={
              canApproveBills && can(session, 'purchase-order.read') && row.supplierId !== null
            }
            onOpenMatch={() => setMatching(true)}
            onRemoveMatch={() => act(() => unmatchBill(id), 'billDetail.done.unmatched')}
            onDownload={original ? download : null}
          />

          <Card title={t('billDetail.activity.title')}>
            <ol className="flex flex-col">
              {activityOf(detail, session?.userId ?? null).map((event, index, all) => (
                <li key={`${event.key}-${event.at ?? index}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={[
                        'flex size-7 shrink-0 items-center justify-center rounded-full',
                        index === 0 && listItem.canApprove ? 'bg-primary-50' : 'bg-success-100',
                      ].join(' ')}
                    >
                      <img
                        src={index === 0 && listItem.canApprove ? activityIcon : matchOkIcon}
                        alt=""
                        className="size-3.5"
                      />
                    </span>
                    {index < all.length - 1 ? (
                      <span className="w-px flex-1 bg-border-subtle" />
                    ) : null}
                  </div>
                  <div className="pb-5">
                    <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                      {t(event.key)}
                      {event.byYou ? (
                        <span className="font-medium text-text-quaternary">
                          {' '}
                          · {t('billDetail.activity.byYou')}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                      {[event.detail, event.at ? formatInstant(event.at, language) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </li>
              ))}
              {detail.activity.length === 0 ? (
                <li className="text-sm font-medium text-text-quaternary">
                  {t('billDetail.activity.none')}
                </li>
              ) : null}
            </ol>
          </Card>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-5 xl:w-[340px]">
          <section className="rounded-md border border-primary-300 bg-primary-25 p-5">
            <div className="flex items-center gap-2">
              <img src={activityIcon} alt="" className="size-4" />
              <h2 className="text-base font-semibold leading-[1.2] text-primary-800">
                {t('billDetail.decision.title')}
              </h2>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary">
              <span className="me-1.5">
                <Rial />
              </span>
              {money(row.totalIncludingVat)}
            </p>
            <p className="mt-2 text-sm font-medium leading-[1.5] text-text-tertiary">
              <NoteText note={decisionNoteOf(detail)} />
            </p>

            <div className="mt-4 flex flex-col gap-3">
              {decisions.approve ? (
                <button
                  type="button"
                  onClick={() => act(() => approveBill(id), 'billDetail.done.approved')}
                  disabled={busy}
                  className={PRIMARY_BUTTON}
                >
                  <img src={hdrBtnIcon} alt="" className="size-[17px]" />
                  {t('billDetail.decision.approveForPayment')}
                </button>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                {decisions.reject ? (
                  <button
                    type="button"
                    onClick={() => setAsking('reject')}
                    disabled={busy}
                    className={QUIET_BUTTON}
                  >
                    {t('billDetail.decision.queryIt')}
                  </button>
                ) : null}
                {decisions.hold ? (
                  <button
                    type="button"
                    onClick={() => setAsking('hold')}
                    disabled={busy}
                    className={QUIET_BUTTON}
                  >
                    {t('billDetail.decision.putOnHold')}
                  </button>
                ) : null}
                {decisions.release ? (
                  <button
                    type="button"
                    onClick={() => act(() => releaseBill(id), 'billDetail.done.released')}
                    disabled={busy}
                    className={QUIET_BUTTON}
                  >
                    {t('billDetail.decision.release')}
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <PaymentTermsCard detail={detail} profile={profile} language={language} />

          <Card title={t('billDetail.compliance.title')}>
            <ul className="flex flex-col gap-2.5">
              {complianceOf(detail).map((note) => (
                <li key={note.key} className="flex items-start gap-2">
                  <img
                    src={note.ok ? complianceIcon : clockIcon}
                    alt=""
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span className="text-sm font-medium leading-[1.3] text-text-tertiary">
                    <NoteText note={note} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={t('billDetail.supplier.title')}>
            <dl className="flex flex-col gap-3">
              {[
                ['billDetail.supplier.name', row.supplierName ?? t('billDetail.supplierUnknown')],
                ['billDetail.supplier.vat', profile?.vatNumber ?? t('billDetail.notStated')],
                [
                  'billDetail.supplier.theirRef',
                  row.supplierBillNumber ?? t('billDetail.notStated'),
                ],
                [
                  'billDetail.supplier.openBills',
                  payables
                    ? t('billDetail.supplier.openBillsValue', {
                        count:
                          payables.notDue.bills +
                          payables.dueSoon.bills +
                          payables.late.bills +
                          payables.onHold.bills,
                        amount: formatAmount(payables.total, payables.currencyCode, language),
                      })
                    : t('billDetail.notStated'),
                ],
                // TODO(backend): the design shows "Paid on time · 11 of 11"; nothing counts a
                // supplier's bills paid by their due date. `everLate` is the one fact held.
                [
                  'billDetail.supplier.paidOnTime',
                  payables
                    ? t(
                        payables.everLate
                          ? 'billDetail.supplier.paidLateBefore'
                          : 'billDetail.supplier.alwaysOnTime',
                      )
                    : t('billDetail.notStated'),
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm font-medium text-text-tertiary">{t(label)}</dt>
                  <dd className="text-end text-sm font-semibold text-text-primary">
                    <RialInText text={value} />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </aside>
      </div>

      <Modal
        open={asking !== null}
        onClose={() => {
          setAsking(null)
          setReason('')
        }}
        title={t(asking === 'hold' ? 'billDetail.hold.title' : 'billDetail.reject.title')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setAsking(null)
                setReason('')
              }}
              className={QUIET_BUTTON}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirmReason}
              disabled={busy || reason.trim() === ''}
              className={[
                PRIMARY_BUTTON,
                asking === 'reject' ? 'bg-danger-700 hover:bg-danger-700/90' : '',
              ].join(' ')}
            >
              {t(asking === 'hold' ? 'billDetail.hold.confirm' : 'billDetail.reject.confirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t(asking === 'hold' ? 'billDetail.hold.body' : 'billDetail.reject.body')}
        </p>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-text-secondary">
            {t('billDetail.reject.reason')}
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={asking === 'hold' ? 500 : 1000}
            rows={3}
            className="mt-1.5 w-full rounded-sm border border-border-subtle p-3 text-sm text-text-primary outline-none focus:border-primary-500"
          />
        </label>
      </Modal>

      <MatchModal
        open={matching}
        supplierId={row.supplierId}
        onClose={() => setMatching(false)}
        busy={busy}
        onPick={async (order) => {
          const ok = await act(() => matchBill(id, order.id), 'billDetail.done.matched')
          if (ok) setMatching(false)
        }}
      />
    </div>
  )
}

function Breadcrumb({ title }: { title: string | null }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/expenditure/bills"
        className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
      >
        {t('billDetail.breadcrumb')}
      </Link>
      <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
      <span className="text-2xl font-medium leading-[1.2] text-text-primary">
        {title ?? t('billDetail.breadcrumbBill')}
      </span>
    </div>
  )
}

function NoteText({ note }: { note: Note }) {
  const { t } = useTranslation()
  return <>{t(note.key, note.values)}</>
}

/** A step's detail: the source under "Arrived" is named through its own key. */
function StepDetail({ note }: { note: Note }) {
  const { t } = useTranslation()
  if (note.key === 'billDetail.steps.arrivedVia') {
    return (
      <>
        {t(note.key, {
          ...note.values,
          source: t(`billDetail.steps.via.${String(note.values?.source)}`),
        })}
      </>
    )
  }
  return <NoteText note={note} />
}

/** A card value that may carry an amount: "2 · 2,759.100" gets the sign before its figure. */
function RialInText({ text }: { text: string }) {
  const parts = text.split('¤')
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts[0]}
      <span className="me-1">
        <Rial />
      </span>
      {parts.slice(1).join('')}
    </>
  )
}

/** Net and VAT, derived: the bill carries its total and its VAT, never a net of its own. */
function netAndVat(
  detail: BillDetailDto,
): [string, Record<string, unknown> | undefined, number | null][] {
  const total = detail.bill.totalIncludingVat
  const vat = detail.bill.vatAmount
  const rate = singleVatRate(detail)
  return [
    ['billDetail.lines.net', undefined, total !== null && vat !== null ? total - vat : null],
    [
      rate === null ? 'billDetail.lines.vatOnly' : 'billDetail.lines.vatRate',
      rate === null ? undefined : { rate: `${rate}%` },
      vat,
    ],
  ]
}

function refusalText(t: Translate, error: unknown): string {
  if (error instanceof ApiError && error.code && REFUSALS[error.code])
    return t(REFUSALS[error.code])
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

/**
 * The three-way match (Figma 163:23284): a verdict line and three tiles, what was ordered, what
 * arrived and what they billed. The tiles are summed from the per-line comparison, which only an
 * approver may read; a reader without it sees the verdict alone.
 */
function MatchSection({
  detail,
  comparison,
  language,
  busy,
  canMatch,
  onOpenMatch,
}: {
  detail: BillDetailDto
  comparison: BillMatchDto | null
  language: string
  busy: boolean
  canMatch: boolean
  onOpenMatch: () => void
}) {
  const { t } = useTranslation()
  const match = detail.bill.match
  const verdict = match?.verdict ?? null
  const agrees = verdict === 'MATCHED' || verdict === 'MATCHED_BY_HAND'
  const differs = verdict === 'MISMATCH'
  // NO_ORDER is a verdict, not a match: the matcher looked and found no order to hold the bill
  // against. There is nothing to compare.
  const tiles =
    comparison && (agrees || differs) ? threeWayOf(comparison, detail.bill.currencyCode) : null

  return (
    <section
      className={[
        'rounded-md border p-5',
        agrees
          ? 'border-[#cfe0d5] bg-[#eef5f0]'
          : differs
            ? 'border-pending-200 bg-pending-100'
            : 'border-border-subtle bg-surface-card',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white">
          <img src={agrees ? matchOkIcon : matchWarnIcon} alt="" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className={[
              'text-lg font-semibold leading-[1.2]',
              agrees ? 'text-success-700' : 'text-text-primary',
            ].join(' ')}
          >
            {t(
              agrees
                ? match?.byHand || verdict === 'MATCHED_BY_HAND'
                  ? 'billDetail.match.agreeByHand'
                  : 'billDetail.match.agree'
                : differs
                  ? 'billDetail.match.differs'
                  : 'billDetail.match.noOrder',
            )}
          </h2>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-text-tertiary">
            {match?.summary ??
              t(
                verdict === null || verdict === 'NO_ORDER'
                  ? detail.bill.purchaseOrderReference
                    ? 'billDetail.match.theirRefOnly'
                    : 'billDetail.match.noOrderNote'
                  : 'billDetail.match.agreeNote',
                { reference: detail.bill.purchaseOrderReference ?? '' },
              )}
          </p>
        </div>
        {canMatch && !agrees && !differs ? (
          <button
            type="button"
            onClick={onOpenMatch}
            disabled={busy}
            className="text-sm font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-60"
          >
            {t('billDetail.linked.matchIt')}
          </button>
        ) : null}
      </div>

      {tiles ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {tiles.map((tile) => (
            <div
              key={tile.id}
              className={[
                'rounded-sm border bg-white p-3.5',
                tile.ok
                  ? agrees
                    ? 'border-[#cfe0d5]'
                    : 'border-border-subtle'
                  : 'border-pending-200',
              ].join(' ')}
            >
              <div className="flex items-center gap-1.5">
                <img src={tile.ok ? matchOkIcon : matchWarnIcon} alt="" className="size-4" />
                <span className="text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.5px] text-text-tertiary">
                  {t(`billDetail.match.${tile.id}Tile`)}
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold leading-[1.2] text-text-primary">
                <NoteText note={tile.quantity} />
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                {tile.note ? (
                  <TileNote
                    note={tile.note}
                    language={language}
                    tail={tile.id === 'billed' ? t('billDetail.match.thisBill') : undefined}
                  />
                ) : null}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

/** "7.400 per KG · PO-0031": the price wears the rial sign, the reference follows it. */
function TileNote({ note, language, tail }: { note: Note; language: string; tail?: string }) {
  const { t } = useTranslation()
  if (note.key !== 'billDetail.match.perUnit') return <NoteText note={note} />
  const values = note.values ?? {}
  const price = formatAmount(Number(values.price), String(values.currency), language)
  const after = tail ?? String(values.tail ?? '')
  return (
    <>
      <Rial />
      <span>
        {t('billDetail.match.perUnitText', { price, unit: values.unit })}
        {after ? ` · ${after}` : ''}
      </span>
    </>
  )
}

/**
 * Linked documents (Figma 163:23284): the order, the receipt and the original file. The order
 * links to its page; the receipt has none yet; the file downloads.
 */
function LinkedDocuments({
  detail,
  language,
  busy,
  canMatch,
  onOpenMatch,
  onRemoveMatch,
  onDownload,
}: {
  detail: BillDetailDto
  language: string
  busy: boolean
  canMatch: boolean
  onOpenMatch: () => void
  onRemoveMatch: () => void
  onDownload: (() => void) | null
}) {
  const { t } = useTranslation()
  const match = detail.bill.match
  const order = match && match.verdict !== 'NO_ORDER' && match.purchaseOrderNumber ? match : null
  const originalName =
    detail.intake?.filename ??
    (detail.bill.inboundDeliveryId ? `${detail.bill.supplierBillNumber ?? 'bill'}.xml` : null)

  const docs: {
    id: string
    icon: string
    title: string
    to?: string
    kindKey: string
    detail: string
    onClick?: () => void
  }[] = []
  if (order) {
    docs.push({
      id: 'order',
      icon: docOrderIcon,
      title: order.purchaseOrderNumber ?? '',
      to: order.purchaseOrderId
        ? `/expenditure/purchase-orders/${order.purchaseOrderId}`
        : undefined,
      kindKey: 'billDetail.linked.purchaseOrder',
      // TODO(backend): the design says "Placed 20 Jul · approved by Hafidh Saif"; the match
      // carries the order's number and id only, so the day it was matched stands in.
      detail: order.matchedAt
        ? t(order.byHand ? 'billDetail.linked.matchedByHandOn' : 'billDetail.linked.matchedOn', {
            date: formatInstantDay(order.matchedAt, language),
          })
        : t('billDetail.linked.matchedToThisBill'),
    })
  }
  if (order?.goodsReceiptNumber) {
    docs.push({
      id: 'receipt',
      icon: docDeliveryIcon,
      title: order.goodsReceiptNumber,
      kindKey: 'billDetail.linked.purchaseReceipt',
      // TODO(backend): "Received 28 Jul · checked in by Yusuf Al Balushi" needs the receipt's
      // date and who recorded it; neither is on the bill.
      detail: t('billDetail.linked.receiptAgainst', { order: order.purchaseOrderNumber ?? '' }),
    })
  }
  if (originalName) {
    docs.push({
      id: 'file',
      // A PDF keeps its mark; an e-invoice XML is drawn with the plain file icon, as in the frame.
      icon: /\.pdf$/i.test(originalName) ? pdfIcon : fileIcon,
      title: originalName,
      kindKey: 'billDetail.linked.originalFile',
      detail: t('billDetail.linked.originalNote'),
      onClick: onDownload ?? undefined,
    })
  }

  return (
    <Card
      title={t('billDetail.linked.title')}
      action={
        canMatch ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenMatch}
              disabled={busy}
              className="text-sm font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-60"
            >
              {t(order ? 'billDetail.linked.changeMatch' : 'billDetail.linked.matchIt')}
            </button>
            {order ? (
              <button
                type="button"
                onClick={onRemoveMatch}
                disabled={busy}
                className="text-sm font-semibold text-text-quaternary hover:text-danger-700 disabled:opacity-60"
              >
                {t('billDetail.linked.removeMatch')}
              </button>
            ) : null}
          </div>
        ) : null
      }
    >
      {docs.length === 0 ? (
        <p className="text-sm font-medium text-text-quaternary">{t('billDetail.linked.none')}</p>
      ) : (
        <ul className="flex flex-col">
          {docs.map((doc, index) => (
            <li
              key={doc.id}
              className={[
                'flex items-center gap-3 py-3',
                index < docs.length - 1 ? 'border-b border-surface-background' : '',
              ].join(' ')}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background">
                <img src={doc.icon} alt="" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-[1.2]">
                  {doc.to ? (
                    <Link to={doc.to} className="font-semibold text-primary-700 hover:underline">
                      {doc.title}
                    </Link>
                  ) : doc.onClick ? (
                    <button
                      type="button"
                      onClick={doc.onClick}
                      className="font-semibold text-text-primary hover:underline"
                    >
                      {doc.title}
                    </button>
                  ) : (
                    <span className="font-semibold text-text-primary">{doc.title}</span>
                  )}
                  <span className="font-medium text-text-quaternary">
                    {' · '}
                    {t(doc.kindKey)}
                  </span>
                </p>
                <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                  {doc.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * Payment terms (Figma 163:23284): due, terms, early payment, where to pay, and what paying early
 * would save. The terms come from the bill's own dates; the discount and the bank from the
 * supplier's record. What has already been paid is added under the rule, so a part-paid bill says so.
 */
function PaymentTermsCard({
  detail,
  profile,
  language,
}: {
  detail: BillDetailDto
  profile: SupplierDetailDto['profile'] | null
  language: string
}) {
  const { t } = useTranslation()
  const { bill, settlement } = detail
  const money = (value: number) => formatAmount(value, bill.currencyCode, language)
  const termsDays = termsDaysOf(detail)
  const discount =
    profile?.earlyPaymentDiscountPercent &&
    profile.earlyPaymentDiscountDays !== null &&
    bill.issueDate
      ? {
          percent: profile.earlyPaymentDiscountPercent,
          by: new Date(Date.parse(bill.issueDate) + profile.earlyPaymentDiscountDays * 86_400_000)
            .toISOString()
            .slice(0, 10),
        }
      : null
  const saving =
    discount && bill.totalIncludingVat !== null && settlement.paymentState !== 'PAID'
      ? Math.round(bill.totalIncludingVat * discount.percent * 10) / 1000
      : null
  const bank = profile?.bankDetails
  const rows: [string, string, string?][] = [
    [
      'billDetail.terms.due',
      bill.dueDate ? formatDate(bill.dueDate, language) : t('billDetail.notStated'),
    ],
    [
      'billDetail.terms.terms',
      termsDays !== null
        ? t('billDetail.terms.netDays', { count: termsDays })
        : bill.paidOnTheSpot
          ? t('billDetail.terms.paidOnTheSpot')
          : t('billDetail.notStated'),
    ],
    [
      'billDetail.terms.earlyPayment',
      discount
        ? t('billDetail.terms.earlyPaymentValue', {
            percent: discount.percent,
            date: formatDate(discount.by, language),
          })
        : t('billDetail.terms.none'),
      discount ? 'text-success-700' : undefined,
    ],
    [
      'billDetail.terms.payTo',
      bank
        ? `${bank.bankName ?? t('billDetail.terms.bank')} ···${bank.iban.replace(/\s/g, '').slice(-4)}`
        : t('billDetail.terms.noBank'),
    ],
    ...(settlement.paidAmount > 0
      ? ([
          ['billDetail.payment.paid', `¤${money(settlement.paidAmount)}`],
          ['billDetail.payment.outstanding', `¤${money(settlement.outstandingAmount)}`],
        ] as [string, string][])
      : []),
    ...(detail.paymentRunReference
      ? ([['billDetail.payment.run', detail.paymentRunReference]] as [string, string][])
      : []),
  ]

  return (
    <Card title={t('billDetail.terms.title')}>
      <dl className="flex flex-col gap-3">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-sm font-medium text-text-tertiary">{t(label)}</dt>
            <dd
              className={['text-end text-sm font-semibold', tone ?? 'text-text-primary'].join(' ')}
            >
              <RialInText text={value} />
            </dd>
          </div>
        ))}
      </dl>
      {saving !== null && discount ? (
        <p className="mt-4 flex items-center justify-between gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.3] text-text-tertiary">
          <span className="flex items-center gap-1.5">
            <img src={clockIcon} alt="" className="size-4" />
            {t('billDetail.terms.saving', { date: formatDate(discount.by, language) })}
          </span>
          <span className="flex items-center gap-1 font-semibold text-text-secondary">
            <Rial />
            {money(saving)}
          </span>
        </p>
      ) : null}
    </Card>
  )
}

function MatchModal({
  open,
  supplierId,
  busy,
  onClose,
  onPick,
}: {
  open: boolean
  supplierId: string | null
  busy: boolean
  onClose: () => void
  onPick: (order: PurchaseOrderOptionDto) => void
}) {
  const { t, i18n } = useTranslation()
  const orders = useApiRead<PurchaseOrderOptionDto[]>(
    open && supplierId ? `/v1/purchase-orders?supplierId=${supplierId}` : null,
    () => loadSupplierOrders(supplierId!),
  )

  return (
    <Modal open={open} onClose={onClose} title={t('billDetail.matchModal.title')}>
      <p className="text-sm font-medium leading-[1.5] text-text-secondary">
        {t('billDetail.matchModal.body')}
      </p>
      <div className="mt-4 max-h-[320px] overflow-y-auto">
        {orders.read.status === 'loading' ? <LoadingNotice /> : null}
        {orders.read.status === 'failed' ? (
          <ApiReadFailure error={orders.read.error} retry={orders.retry} />
        ) : null}
        {orders.read.status === 'ready' && orders.read.data.length === 0 ? (
          <p className="py-6 text-center text-sm font-medium text-text-quaternary">
            {t('billDetail.matchModal.none')}
          </p>
        ) : null}
        {orders.read.status === 'ready'
          ? orders.read.data.map((order) => (
              <button
                key={order.id}
                type="button"
                disabled={busy}
                onClick={() => onPick(order)}
                className="flex w-full items-center justify-between gap-3 border-b border-surface-background px-1 py-3 text-start transition-colors last:border-b-0 hover:bg-primary-25 disabled:opacity-60"
              >
                <span>
                  <span className="block text-sm font-semibold text-text-primary">
                    {order.number ?? order.id.slice(0, 8)}
                  </span>
                  <span className="block text-xs font-medium text-text-quaternary">
                    {[
                      order.orderDate ? formatDate(order.orderDate, i18n.language) : null,
                      t(`billDetail.matchModal.state.${order.state}`),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
                  {order.totalGross === null ? (
                    t('billDetail.notStated')
                  ) : (
                    <>
                      <RialMark className="w-4" />
                      {formatAmount(order.totalGross, order.currency, i18n.language)}
                    </>
                  )}
                </span>
              </button>
            ))
          : null}
      </div>
    </Modal>
  )
}
