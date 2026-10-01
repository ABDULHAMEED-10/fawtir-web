import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, withRial } from '../../components/ui'
import { FieldLabel, SectionCard, ToggleRow } from '../../components/form'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError, type Page } from '../../api'
import {
  confirmIntake,
  discardIntake,
  newBillKey,
  possibleDuplicateOf,
  recordBillWithoutFile,
  uploadIntake,
  type PossibleDuplicateDto,
} from '../../api/expenditure/billIntake'
import {
  loadApprovalPolicy,
  APPROVAL_POLICY_PATH,
  type ApprovalPolicyDto,
} from '../../api/expenditure/approvalPolicy'
import {
  loadGoodsReceipts,
  purchaseOrderPath,
  type GoodsReceiptDto,
} from '../../api/expenditure/purchaseOrders'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import {
  loadSupplierOrders,
  loadSupplierOverview,
  supplierOrdersPath,
  supplierOverviewPath,
  type PurchaseOrderRowDto,
  type SupplierOverviewDto,
} from '../../api/expenditure/supplierRecord'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  BILL_FILE_TYPES,
  CONFIRM_REFUSALS,
  UPLOAD_REFUSALS,
  blankBillForm,
  linesTotals,
  supplierTaxCategory,
  toConfirmation,
  type BillLine,
} from '../../lib/billIntake'
import { DESIGN_REFERENCE } from '../../lib/invoiceDraft'
import { netDaysFor, useReferenceData } from '../../lib/reference/referenceData'
import { muscatToday } from '../../lib/invoiceIssue'
import { addDays } from '../../lib/dates'
import { formatAmount, formatDate, initialsOf } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { earlySettlementNote, termsNote } from '../../lib/supplierRecord'
import { emptyLine, lineProblem, receivedByLine, type LineDraft } from '../../lib/purchaseOrders'
import { OrderLinesTable, LinesTotals } from '../NewPurchaseOrderPage/OrderLinesTable'
import {
  ComposerHeader,
  FIELD_SHELL,
  PRIMARY_BUTTON,
  PlainWords,
  SECONDARY_BUTTON,
  SideCard,
  SideRow,
  StepsCard,
  SupplierStrip,
} from '../NewPurchaseOrderPage/SupplierComposerParts'
import tickIcon from '../../assets/supplier-credit-notes/act-set.svg'
import checkIcon from '../../assets/bill-detail/tick.svg'
import warnIcon from '../../assets/bills/match-warn.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

/** Orders a bill can still be matched against. */
const BILLABLE = new Set<PurchaseOrderRowDto['state']>(['SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'])
const NO_ORDER = 'none'
const round3 = (value: number) => Math.round(value * 1000) / 1000

/**
 * Suppliers › one supplier › Record a bill (Figma 163:27781): a supplier's bill typed in by hand,
 * with the order it settles chosen from their open ones.
 *
 * With a file attached in step 4 the bill is uploaded and confirmed in one go (bill intake,
 * D12a), as the design's one button says. Without one the typed bill is recorded as it is
 * (`POST /bills`, §7.9; owner decision 2026-10-01: a bill may have no file), and its page then
 * says no original is on record. The "straight for approval" switch is drawn as designed and
 * kept on the client (§7.10).
 */
export function RecordSupplierBillPage() {
  const { slug = '' } = useParams()
  return (
    <AppShell>
      <RecordBill key={slug} id={slug} />
    </AppShell>
  )
}

function RecordBill({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const navigate = useNavigate()
  const canRecord = can(session, 'invoice.payment.manage')
  const reference = useReferenceData() ?? DESIGN_REFERENCE
  const today = muscatToday()

  const supplier = useApiRead<SupplierDetailDto>(supplierPath(id), () => loadSupplier(id))
  const overview = useApiRead<SupplierOverviewDto>(supplierOverviewPath(id), () =>
    loadSupplierOverview(id),
  )
  const ordersPath = supplierOrdersPath(id, 0, 50)
  const orders = useApiRead<Page<PurchaseOrderRowDto>>(ordersPath, () =>
    loadSupplierOrders(ordersPath),
  )
  const policy = useApiRead<ApprovalPolicyDto>(APPROVAL_POLICY_PATH, loadApprovalPolicy)

  const profile = supplier.read.status === 'ready' ? supplier.read.data.profile : null
  const head = overview.read.status === 'ready' ? overview.read.data : null
  const billable =
    orders.read.status === 'ready'
      ? orders.read.data.items.filter((order) => BILLABLE.has(order.state))
      : []
  const currency = profile?.defaultCurrency ?? 'OMR'
  // Oman's four only (CL-04-OM): a supplier defaulting to AE or G starts on S5.
  const category = supplierTaxCategory(reference, profile?.defaultTaxCategory)
  const vatRate = category?.rate ?? '5'
  const netDays =
    netDaysFor(reference, profile?.paymentTerms) ??
    Number(/^NET_?(\d+)$/.exec(profile?.paymentTerms ?? '')?.[1] ?? NaN)

  const [billNumber, setBillNumber] = useState('')
  const [billDate, setBillDate] = useState(today)
  const [dueDate, setDueDate] = useState('')
  const [against, setAgainst] = useState<string>('')
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine(vatRate)])
  const [file, setFile] = useState<File | null>(null)
  const [straight, setStraight] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<PossibleDuplicateDto | null>(null)
  const [errors, setErrors] = useState<
    Partial<Record<'billNumber' | 'billDate' | 'dueDate', string>>
  >({})
  const [attempted, setAttempted] = useState(false)
  const inFlight = useRef(false)
  // The file already stored, and the intake it became: a save that failed is retried on the same
  // intake, as Upload a bill does, so a refused confirm leaves no upload behind per attempt.
  const stored = useRef<{ file: File; intakeId: string } | null>(null)
  // The key a bill with no file is sent under, and the body it was made for. A save sent again
  // unchanged (a lost answer, a second try) reuses it, so the server records one bill; a changed
  // bill is another request and takes a new key, as does the next bill after this one is saved.
  const attempt = useRef<{ body: string; key: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // The order waiting for its bill comes first, as the design chooses it; else the first open one.
  const chosenId =
    against || (billable.find((order) => order.state === 'RECEIVED') ?? billable[0])?.id || NO_ORDER
  const chosen = billable.find((order) => order.id === chosenId) ?? null
  const receipts = useApiRead<GoodsReceiptDto[]>(
    chosen ? `${purchaseOrderPath(chosen.id)}/receipts` : null,
    () => loadGoodsReceipts(chosen!.id),
  )
  const booked = receipts.read.status === 'ready' ? receipts.read.data : []

  const due = dueDate || (Number.isFinite(netDays) && billDate ? addDays(billDate, netDays) : '')
  const problems = lines.map(lineProblem)
  const billLines: BillLine[] = useMemo(
    () =>
      lines.map((line, index) => ({
        id: line.id ?? `line-${index}`,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        taxCategoryCode: category.code,
        // The unit chosen on the row goes with the line (EXPENDITURE.md 7.11).
        unit: line.unit,
      })),
    [lines, category.code],
  )
  const totals = useMemo(() => linesTotals(billLines), [billLines])
  const net = Number(totals?.net ?? 0)
  const vat = Number(totals?.vat ?? 0)
  const total = Number(totals?.total ?? 0)
  const money = (value: number) => formatAmount(value, currency, language)
  // In sentences the code goes in front so `withRial` puts the sign there.
  const sum = (value: number) => `${currency} ${money(value)}`
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')
  const ordered = chosen?.totalGross ?? null
  const matches = ordered !== null && Math.abs(ordered - total) < 0.0005
  const receivedLine = receivedSummary(booked, t)
  const discount =
    profile && profile.earlyPaymentDiscountPercent && profile.earlyPaymentDiscountDays && billDate
      ? {
          by: addDays(billDate, profile.earlyPaymentDiscountDays),
          saves: round3((total * profile.earlyPaymentDiscountPercent) / 100),
        }
      : null
  const threshold = policy.read.status === 'ready' ? policy.read.data.autoApproveBelow : null
  const underLimit = threshold !== null && total < threshold
  const canSend = canRecord && profile !== null && !busy

  const validate = () => {
    const next: typeof errors = {}
    if (!billNumber.trim()) next.billNumber = 'validation.required'
    if (!billDate) next.billDate = 'validation.required'
    if (due && billDate && due < billDate) next.dueDate = 'billIntake.error.dueBeforeIssue'
    setErrors(next)
    return Object.keys(next).length === 0 && problems.every((problem) => problem === null)
  }

  const save = async (notDuplicateOf: string | null) => {
    if (!profile || inFlight.current) return
    setNotice(null)
    setAttempted(true)
    if (!validate()) {
      setNotice(t('billIntake.fixFirst'))
      return
    }
    inFlight.current = true
    setBusy(true)
    try {
      if (stored.current && stored.current.file !== file) {
        // Another file was chosen, or the file was taken off: the stored one goes, as "Replace
        // the file" does on Upload a bill.
        await discardIntake(stored.current.intakeId).catch(() => undefined)
        stored.current = null
      }
      if (file && !stored.current) {
        const uploaded = await uploadIntake(file, 'UPLOADED')
        stored.current = { file, intakeId: uploaded.id }
      }
      const form = {
        ...blankBillForm(),
        supplierId: profile.id,
        supplierName: profile.displayName,
        billNumber: billNumber.trim(),
        issueDate: billDate,
        dueDate: due,
        currency,
        lines: billLines,
        vat: totals?.vat ?? '',
        total: totals?.total ?? '0',
        purchaseOrderId: chosen?.id ?? '',
      }
      const confirmation = toConfirmation(form, { notDuplicateOf })
      // No file attached: the typed bill is recorded on its own, with no intake behind it.
      let bill
      if (stored.current) {
        bill = await confirmIntake(stored.current.intakeId, confirmation)
      } else {
        const body = JSON.stringify(confirmation)
        if (attempt.current?.body !== body) attempt.current = { body, key: newBillKey() }
        bill = await recordBillWithoutFile(attempt.current.key, confirmation)
      }
      stored.current = null
      attempt.current = null
      navigate(`/expenditure/bills/${bill.id}`)
    } catch (failure) {
      // An intake that is gone or already a bill cannot be confirmed again: the next save uploads.
      if (
        failure instanceof ApiError &&
        (failure.code === 'BILL_INTAKE_NOT_FOUND' ||
          failure.code === 'BILL_INTAKE_ALREADY_CONFIRMED')
      )
        stored.current = null
      const same = possibleDuplicateOf(failure)
      if (same) {
        setDuplicate(same)
      } else if (
        failure instanceof ApiError &&
        failure.code &&
        (CONFIRM_REFUSALS[failure.code] || UPLOAD_REFUSALS[failure.code])
      ) {
        setNotice(t(CONFIRM_REFUSALS[failure.code]?.key ?? UPLOAD_REFUSALS[failure.code]))
      } else {
        const described = describeApiFailure(failure)
        const body = t(described.key, described.values)
        setNotice(
          described.reference
            ? `${body} ${t('apiErrors.reference', { id: described.reference })}`
            : body,
        )
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  if (supplier.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {supplier.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={supplier.read.error} retry={supplier.retry} />
        )}
      </div>
    )
  }
  if (!profile) return null

  const back = `/suppliers/${profile.id}`
  const terms = termsNote(profile.paymentTerms)
  const early = earlySettlementNote(profile)
  const orderLabel = chosen
    ? (chosen.number ?? t('supplierRecord.unnumbered'))
    : t('recordBill.noOrderShort')

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <ComposerHeader
        crumbs={[
          { label: t('suppliersPage.title'), to: '/suppliers' },
          { label: profile.displayName, to: back },
          { label: t('recordBill.crumb') },
        ]}
        title={t('recordBill.title')}
        subtitle={t('recordBill.subtitle')}
        actions={
          <>
            <Link to={back} className={SECONDARY_BUTTON}>
              {t('recordBill.discard')}
            </Link>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => void save(null)}
              className={PRIMARY_BUTTON}
            >
              <img src={tickIcon} alt="" className="size-4" />
              {busy ? t('billIntake.saving') : t('recordBill.sendForApproval')}
            </button>
          </>
        }
      />

      {!canRecord ? <PermissionDeniedNotice /> : null}
      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}
      {duplicate ? (
        <section role="alert" className="rounded-md border border-[#d8c9a8] bg-[#faf5ea] p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <img src={warnIcon} alt="" className="size-5" />
            {t('billIntake.duplicate.title')}
          </h2>
          <p className="mt-2 text-sm font-medium leading-[1.5] text-text-secondary">
            {t('billIntake.duplicate.body', {
              number: duplicate.supplierBillNumber,
              date: day(duplicate.issueDate),
              total:
                duplicate.total === null
                  ? '—'
                  : formatAmount(duplicate.total, duplicate.currencyCode ?? currency, language),
              source: t(`billIntake.duplicate.source.${duplicate.source}`),
            })}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to={`/expenditure/bills/${duplicate.billId}`} className={SECONDARY_BUTTON}>
              {t('billIntake.duplicate.open')}
            </Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(duplicate.billId)}
              className={PRIMARY_BUTTON}
            >
              {t('billIntake.duplicate.different')}
            </button>
          </div>
        </section>
      ) : null}

      <SupplierStrip
        initials={initialsOf(profile.displayName)}
        name={profile.displayName}
        note={[
          profile.vatNumber
            ? t('supplierRecord.vat', { vat: profile.vatNumber })
            : t('supplierRecord.noVat'),
          profile.receivingChannel === 'PEPPOL'
            ? t('recordBill.peppolNote')
            : t(`supplierRecord.channel.${profile.receivingChannel ?? 'MANUAL'}`),
        ].join(' · ')}
        facts={[
          { label: t('recordBill.terms'), value: terms ? t(terms.key, terms.values) : '—' },
          {
            label: t('recordBill.earlySettlement'),
            value: t(early.key, early.values),
            tone: 'brand',
          },
          {
            label: t('recordBill.openOrders'),
            value:
              orders.read.status === 'ready'
                ? String(billable.length)
                : head
                  ? String(head.tabs.orders)
                  : '—',
          },
        ]}
      />

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <SectionCard step={1} title={t('recordBill.theirBill')}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel label={t('recordBill.billNumber')} required htmlFor="bill-number" />
                <input
                  id="bill-number"
                  value={billNumber}
                  maxLength={200}
                  onChange={(event) => setBillNumber(event.target.value)}
                  aria-invalid={Boolean(errors.billNumber)}
                  className={FIELD_SHELL}
                />
                {errors.billNumber ? (
                  <p className="text-xs font-medium text-text-danger">{t(errors.billNumber)}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel label={t('recordBill.billDate')} required />
                <DateField
                  value={billDate}
                  max={today}
                  onChange={setBillDate}
                  ariaLabel={t('recordBill.billDate')}
                />
                {errors.billDate ? (
                  <p className="text-xs font-medium text-text-danger">{t(errors.billDate)}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel label={t('recordBill.paymentDue')} required />
                <DateField
                  value={due}
                  min={billDate || undefined}
                  onChange={setDueDate}
                  ariaLabel={t('recordBill.paymentDue')}
                />
                {errors.dueDate ? (
                  <p className="text-xs font-medium text-text-danger">{t(errors.dueDate)}</p>
                ) : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard step={2} title={t('recordBill.whichOrder')}>
            {orders.read.status === 'loading' ? <LoadingNotice /> : null}
            {orders.read.status === 'failed' ? (
              <ApiReadFailure error={orders.read.error} retry={orders.retry} />
            ) : null}
            {orders.read.status === 'ready' ? (
              <div
                className="flex flex-col gap-2.5"
                role="radiogroup"
                aria-label={t('recordBill.whichOrder')}
              >
                {billable.map((order) => {
                  const active = chosenId === order.id
                  return (
                    <button
                      key={order.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setAgainst(order.id)}
                      className={[
                        'flex items-center gap-3 rounded-sm border p-4 text-start transition-colors',
                        active
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:border-primary-300',
                      ].join(' ')}
                    >
                      <Radio active={active} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-[1.3] text-text-primary">
                          {t('recordBill.orderPlaced', {
                            id: order.number ?? t('supplierRecord.unnumbered'),
                            date: day(order.orderDate),
                          })}
                        </span>
                        <span className="mt-1 block text-xs font-medium leading-[1.4] text-text-quaternary">
                          {t(`recordBill.orderNote.${order.state}`, { date: day(order.wantedBy) })}
                        </span>
                      </span>
                      <span className="shrink-0 text-end">
                        <span className="flex items-center justify-end gap-1 text-sm font-semibold text-text-primary tabular-nums">
                          {order.totalGross === null ? (
                            '—'
                          ) : (
                            <>
                              <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                              {formatAmount(order.totalGross, order.currency, language)}
                            </>
                          )}
                        </span>
                        <span className="mt-1 block whitespace-nowrap text-xs font-medium text-text-quaternary">
                          {t(`recordBill.orderState.${order.state}`)}
                        </span>
                      </span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  role="radio"
                  aria-checked={chosenId === NO_ORDER}
                  onClick={() => setAgainst(NO_ORDER)}
                  className={[
                    'flex items-center gap-3 rounded-sm border p-4 text-start transition-colors',
                    chosenId === NO_ORDER
                      ? 'border-primary-700 bg-primary-25'
                      : 'border-border-subtle bg-white hover:border-primary-300',
                  ].join(' ')}
                >
                  <Radio active={chosenId === NO_ORDER} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-[1.3] text-text-primary">
                      {t('recordBill.noOrder')}
                    </span>
                    <span className="mt-1 block text-xs font-medium leading-[1.4] text-text-quaternary">
                      {t('recordBill.noOrderNote')}
                    </span>
                  </span>
                </button>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard step={3} title={t('recordBill.whatCharging')}>
            <OrderLinesTable
              lines={lines}
              onChange={setLines}
              currency={currency}
              vatRate={vatRate}
              taxCategory={t(`reference.taxCategory.${category?.code ?? 'S5'}`, {
                defaultValue: category?.code ?? '',
              })}
              reference={reference}
              problems={attempted ? problems : problems.map(() => null)}
              language={language}
            />
            <LinesTotals
              net={net}
              vat={vat}
              vatRate={vatRate}
              total={total}
              totalLabel={t('recordBill.theyreCharging')}
              currency={currency}
              language={language}
            />
          </SectionCard>

          <SectionCard step={4} title={t('recordBill.beforeYouSave')}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-[1.2] text-text-primary">
                    {t('recordBill.attachDocument')}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                    {file
                      ? t('recordBill.attached', { name: file.name })
                      : t('recordBill.attachDocumentNote')}
                  </p>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept={BILL_FILE_TYPES}
                  className="sr-only"
                  aria-label={t('recordBill.attachFile')}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className={`${SECONDARY_BUTTON} h-[42px] px-4`}
                >
                  {file ? t('recordBill.replaceFile') : t('recordBill.attachFile')}
                </button>
              </div>
              {/* TODO(backend): the workflow state is the server's; the switch is kept on the client (§7.10). */}
              <ToggleRow
                label={t('recordBill.straightToApproval')}
                hint={withRial(
                  threshold === null
                    ? t('recordBill.straightToApprovalAny')
                    : underLimit
                      ? t('recordBill.straightToApprovalUnder', { limit: sum(threshold) })
                      : t('recordBill.straightToApprovalOver', { limit: sum(threshold) }),
                )}
                checked={straight}
                onChange={setStraight}
              />
            </div>
          </SectionCard>
        </div>

        <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
          <SideCard title={t('recordBill.doesItMatch')}>
            <ul className="mt-3 flex flex-col gap-3">
              <MatchRow
                ok={chosen !== null}
                label={t('recordBill.match.ordered')}
                value={ordered === null ? t('recordBill.noOrderShort') : money(ordered)}
                currency={ordered !== null}
              />
              <MatchRow
                ok={chosen !== null && booked.length > 0}
                label={t('recordBill.match.received')}
                value={chosen ? receivedLine : t('recordBill.noOrderShort')}
              />
              <MatchRow
                ok={chosen === null || matches}
                label={t('recordBill.match.billing')}
                value={money(total)}
                currency
              />
            </ul>
          </SideCard>

          <SideCard title={t('recordBill.vatEffect')}>
            <dl className="mt-3 flex flex-col">
              <SideRow label={t('recordBill.vatOnBill')} value={money(vat)} currency />
              <SideRow
                label={t('recordBill.reclaimable')}
                value={Number(vatRate) > 0 ? t('recordBill.allOfIt') : t('recordBill.noneOfIt')}
              />
              <SideRow
                label={t('recordBill.theirVatNumber')}
                value={profile.vatNumber ? t('recordBill.onFile') : t('recordBill.notOnFile')}
                last
              />
            </dl>
          </SideCard>

          <StepsCard
            title={t('purchaseOrder.whatHappens')}
            steps={[
              {
                title: t('recordBill.after.approves'),
                note: withRial(
                  threshold === null
                    ? t('recordBill.after.approvesAny')
                    : underLimit
                      ? t('recordBill.after.approvesUnder', { limit: sum(threshold) })
                      : t('recordBill.after.approvesOver', { limit: sum(threshold) }),
                ),
              },
              {
                title: t('recordBill.after.joinsRun'),
                note: withRial(
                  discount
                    ? t('recordBill.after.joinsRunNote', {
                        due: day(due || null),
                        by: day(discount.by),
                        saves: sum(discount.saves),
                      })
                    : t('recordBill.after.joinsRunPlain', { due: day(due || null) }),
                ),
              },
              chosen
                ? {
                    title: t('recordBill.after.orderCloses', { order: orderLabel }),
                    note: t('recordBill.after.orderClosesNote'),
                  }
                : {
                    title: t('recordBill.after.nothingMatched'),
                    note: t('recordBill.noOrderNote'),
                  },
            ]}
          />

          <PlainWords label={t('purchaseOrder.inPlainWords')}>
            {withRial(
              t(chosen ? 'recordBill.plainWords' : 'recordBill.plainWordsNoOrder', {
                amount: sum(total),
                supplier: profile.displayName,
                order: orderLabel,
                payable: day(due || null),
              }),
            )}{' '}
            {chosen && matches ? t('recordBill.everythingMatches') : null}
          </PlainWords>
        </aside>
      </div>
    </div>
  )
}

/** "240 KG · 10 sacks": what the receipts booked in, added up per line and named by its unit. */
function receivedSummary(
  receipts: GoodsReceiptDto[],
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  if (receipts.length === 0) return t('recordBill.nothingReceived')
  const byLine = receivedByLine(receipts)
  const parts = [...byLine.values()].map((quantity) => new Intl.NumberFormat().format(quantity))
  return parts.length > 0
    ? t('recordBill.receivedUnits', { units: parts.join(' · ') })
    : t('recordBill.nothingReceived')
}

function MatchRow({
  ok,
  label,
  value,
  currency,
}: {
  ok: boolean
  label: string
  value: string
  currency?: boolean
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={[
          'flex size-6 shrink-0 items-center justify-center rounded-full',
          ok ? 'bg-success-100' : 'bg-[#faf5ea]',
        ].join(' ')}
      >
        <img src={ok ? checkIcon : warnIcon} alt="" className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium text-text-secondary">{label}</span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-text-primary tabular-nums">
        {currency ? <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" /> : null}
        {value}
      </span>
    </li>
  )
}

function Radio({ active }: { active: boolean }) {
  return (
    <span
      className={[
        'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
        active ? 'border-primary-700' : 'border-border-default',
      ].join(' ')}
    >
      {active ? <span className="size-2.5 rounded-full bg-primary-700" /> : null}
    </span>
  )
}
