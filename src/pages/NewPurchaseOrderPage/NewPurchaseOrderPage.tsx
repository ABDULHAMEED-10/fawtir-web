import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, OmAmount, Select, withRial } from '../../components/ui'
import { FieldLabel, SectionCard, ToggleRow } from '../../components/form'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import {
  actOnPurchaseOrder,
  createPurchaseOrder,
  loadPurchaseOrderPage,
  purchaseOrderListPath,
  type PurchaseOrderDto,
  type PurchaseOrderRequest,
} from '../../api/expenditure/purchaseOrders'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import {
  loadSupplierContacts,
  loadSupplierOverview,
  supplierContactsPath,
  supplierOverviewPath,
  type SupplierContactDto,
  type SupplierOverviewDto,
} from '../../api/expenditure/supplierRecord'
import { BRANCHES_PATH, loadBranches, type BranchDto } from '../../api/invoices/drafts'
import { describeApiFailure } from '../../lib/apiFailure'
import { DESIGN_REFERENCE } from '../../lib/invoiceDraft'
import { netDaysFor, taxCategoryFor, useReferenceData } from '../../lib/reference/referenceData'
import { muscatToday } from '../../lib/invoiceIssue'
import { addDays } from '../../lib/dates'
import { formatAmount, formatDate, initialsOf } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { earlySettlementNote, termsNote } from '../../lib/supplierRecord'
import {
  comparedWithLast,
  draftTotals,
  emptyLine,
  lineProblem,
  payableBy,
  type LineDraft,
} from '../../lib/purchaseOrders'
import { OrderLinesTable, LinesTotals } from './OrderLinesTable'
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
} from './SupplierComposerParts'
import sendIcon from '../../assets/invoice-details/send.svg'

/**
 * Suppliers › one supplier › New purchase order (Figma 163:27317).
 *
 * "Send for approval" creates the order and submits it in one go, as the design's single button
 * says; the order then lives on its own page (`/expenditure/purchase-orders/:id`), where it is
 * approved, marked as sent and received against.
 *
 * The lines follow the product owner's rules: free text, goods or service, the unit on the row,
 * the price excluding VAT, the tax rate read as text. The "How to send it" switches are drawn as
 * the design draws them and kept on the client (see §7.5 of the backend asks): nothing is
 * transmitted from this build, and the order's page says so.
 */
export function NewPurchaseOrderPage() {
  const { slug = '' } = useParams()
  return (
    <AppShell>
      <NewPurchaseOrder key={slug} id={slug} />
    </AppShell>
  )
}

function NewPurchaseOrder({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const navigate = useNavigate()
  const session = useSession()
  const canManage = can(session, 'purchase-order.manage')
  const reference = useReferenceData() ?? DESIGN_REFERENCE
  const today = muscatToday()

  const supplier = useApiRead<SupplierDetailDto>(supplierPath(id), () => loadSupplier(id))
  const overview = useApiRead<SupplierOverviewDto>(supplierOverviewPath(id), () =>
    loadSupplierOverview(id),
  )
  const contacts = useApiRead<SupplierContactDto[]>(supplierContactsPath(id), () =>
    loadSupplierContacts(id),
  )
  const branches = useApiRead<BranchDto[]>(BRANCHES_PATH, loadBranches)
  const lastPath = purchaseOrderListPath({ supplierId: id, pageSize: 1 })
  const previous = useApiRead<Page<PurchaseOrderDto>>(lastPath, () =>
    loadPurchaseOrderPage(lastPath),
  )

  const record = supplier.read.status === 'ready' ? supplier.read.data : null
  const head = overview.read.status === 'ready' ? overview.read.data : null
  const profile = record?.profile ?? null
  const currency = profile?.defaultCurrency ?? 'OMR'
  const category =
    taxCategoryFor(reference, profile?.defaultTaxCategory ?? 'S5') ?? reference.taxCategories[0]
  const vatRate = category?.rate ?? '5'
  const netDays =
    netDaysFor(reference, profile?.paymentTerms) ??
    Number(/^NET_?(\d+)$/.exec(profile?.paymentTerms ?? '')?.[1] ?? NaN)
  const branchList = branches.read.status === 'ready' ? branches.read.data : []
  const mainContact =
    contacts.read.status === 'ready'
      ? (contacts.read.data.find((c) => c.purpose === 'MAIN') ?? contacts.read.data[0] ?? null)
      : null
  const last = previous.read.status === 'ready' ? (previous.read.data.items[0] ?? null) : null

  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine(vatRate)])
  const [orderDate, setOrderDate] = useState(today)
  const [wantedBy, setWantedBy] = useState('')
  const [yourReference, setYourReference] = useState('')
  const [deliverTo, setDeliverTo] = useState('')
  const [note, setNote] = useState('')
  const [overPeppol, setOverPeppol] = useState(true)
  const [emailPdf, setEmailPdf] = useState(true)
  const [remindMe, setRemindMe] = useState(true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)

  const problems = lines.map(lineProblem)
  const totals = useMemo(() => draftTotals(lines), [lines])
  const comparison = useMemo(() => comparedWithLast(lines, last), [lines, last])
  const wanted =
    wantedBy || (head?.usualLeadTimeDays ? addDays(orderDate, head.usualLeadTimeDays) : '')
  const payable = payableBy(wanted, Number.isFinite(netDays) ? netDays : null)
  const branch = branchList.find((entry) => entry.id === deliverTo) ?? branchList[0] ?? null
  const money = (value: number) => formatAmount(value, currency, language)
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')
  const complete =
    problems.every((problem) => problem === null) && orderDate !== '' && wanted !== ''
  const canSend = canManage && profile !== null && !busy

  const send = async () => {
    if (!profile || !canSend) return
    setAttempted(true)
    if (!complete) return
    setBusy(true)
    setFailure(null)
    const body: PurchaseOrderRequest = {
      supplierId: profile.id,
      orderDate: orderDate || null,
      wantedBy: wanted || null,
      deliverToBranchId: branch?.id ?? null,
      yourReference: yourReference.trim() || null,
      supplierNote: note.trim() || null,
      currency,
      lines: lines.map((line, index) => ({
        lineNo: index + 1,
        description: line.description.trim(),
        quantity: Number(line.quantity),
        unit: line.unit.trim() || null,
        unitPrice: Number(line.unitPrice),
        vatRate: line.vatRate.trim() === '' ? null : Number(line.vatRate),
      })),
    }
    try {
      const created = await createPurchaseOrder(body)
      // The design's one button both saves and submits; a refusal to submit still leaves the
      // draft, and its own page offers the step again.
      await actOnPurchaseOrder(created.id, 'submit').catch(() => undefined)
      navigate(`/expenditure/purchase-orders/${created.id}`)
    } catch (error) {
      const message = describeApiFailure(error)
      const text = t(message.key, message.values)
      setFailure(
        message.reference ? `${text} ${t('apiErrors.reference', { id: message.reference })}` : text,
      )
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
  const sendNote =
    overPeppol && emailPdf
      ? t('purchaseOrder.after.sentBoth')
      : overPeppol
        ? t('purchaseOrder.after.sentPeppol')
        : emailPdf
          ? t('purchaseOrder.after.sentEmail')
          : t('purchaseOrder.after.sentYourself')

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <ComposerHeader
        crumbs={[
          { label: t('suppliersPage.title'), to: '/suppliers' },
          { label: profile.displayName, to: back },
          { label: t('purchaseOrder.newCrumb') },
        ]}
        title={t('purchaseOrder.title')}
        subtitle={t('purchaseOrder.subtitle')}
        actions={
          <>
            <Link to={back} className={SECONDARY_BUTTON}>
              {t('purchaseOrder.discard')}
            </Link>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => void send()}
              className={PRIMARY_BUTTON}
            >
              <img src={sendIcon} alt="" className="size-4 brightness-0 invert" />
              {busy ? t('common.saving') : t('purchaseOrder.sendForApproval')}
            </button>
          </>
        }
      />

      {!canManage ? <PermissionDeniedNotice /> : null}
      {failure ? (
        <Notice
          badge={t('supplierCreditNoteDetail.notDone')}
          body={failure}
          action={{ label: t('common.close'), onClick: () => setFailure(null) }}
        />
      ) : null}

      <SupplierStrip
        initials={initialsOf(profile.displayName)}
        name={profile.displayName}
        note={[
          profile.receivingChannel === 'PEPPOL'
            ? t('purchaseOrder.onPeppol')
            : t('purchaseOrder.notOnPeppol'),
          head
            ? t('purchaseOrder.billsMatched', {
                count: head.tabs.bills,
                matched: head.match.agreed,
                backed: head.match.orderBacked,
              })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        facts={[
          { label: t('purchaseOrder.terms'), value: terms ? t(terms.key, terms.values) : '—' },
          {
            label: t('purchaseOrder.earlySettlement'),
            value: t(early.key, early.values),
            tone: 'brand',
          },
          {
            label: t('purchaseOrder.leadTime'),
            value: head?.usualLeadTimeDays
              ? t('purchaseOrder.days', { count: head.usualLeadTimeDays })
              : '—',
          },
        ]}
      />

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <SectionCard step={1} title={t('purchaseOrder.whatOrdering')}>
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
              net={totals.net}
              vat={totals.vat}
              vatRate={vatRate}
              total={totals.gross}
              totalLabel={t('purchaseOrder.orderValue')}
              currency={currency}
              language={language}
            />
          </SectionCard>

          <SectionCard step={2} title={t('purchaseOrder.whenAndWhere')}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('purchaseOrder.orderDate')} required />
                  <DateField
                    value={orderDate}
                    onChange={setOrderDate}
                    ariaLabel={t('purchaseOrder.orderDate')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('purchaseOrder.wantedBy')} required />
                  <DateField
                    value={wanted}
                    min={orderDate || undefined}
                    onChange={setWantedBy}
                    ariaLabel={t('purchaseOrder.wantedBy')}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel label={t('purchaseOrder.yourReference')} htmlFor="po-reference" />
                  <input
                    id="po-reference"
                    value={yourReference}
                    maxLength={100}
                    onChange={(event) => setYourReference(event.target.value)}
                    className={FIELD_SHELL}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel label={t('purchaseOrder.deliverTo')} required />
                {branchList.length > 0 ? (
                  <Select
                    value={branch?.id ?? ''}
                    onChange={setDeliverTo}
                    options={branchList.map((entry) => ({
                      value: entry.id,
                      label: [entry.name, entry.city].filter(Boolean).join(', '),
                    }))}
                    ariaLabel={t('purchaseOrder.deliverTo')}
                  />
                ) : (
                  <p className="flex h-[50px] items-center rounded-sm border border-border-subtle bg-surface-background px-4 text-sm font-medium text-text-quaternary">
                    {branches.read.status === 'loading'
                      ? t('appAccess.loading')
                      : t('purchaseOrder.noBranches')}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel label={t('purchaseOrder.noteForSupplier')} htmlFor="po-note" />
                <input
                  id="po-note"
                  value={note}
                  maxLength={1000}
                  onChange={(event) => setNote(event.target.value)}
                  className={FIELD_SHELL}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard step={3} title={t('purchaseOrder.howToSend')}>
            {/* TODO(backend): the order API transmits nothing (§7.5); the switches are kept on the client. */}
            <div className="flex flex-col gap-5">
              <ToggleRow
                label={t('purchaseOrder.sendOverPeppol')}
                hint={t('purchaseOrder.sendOverPeppolHint')}
                checked={overPeppol}
                onChange={setOverPeppol}
              />
              <ToggleRow
                label={t('purchaseOrder.emailPdf')}
                hint={
                  mainContact?.email
                    ? t('purchaseOrder.emailPdfHint', {
                        name: mainContact.fullName,
                        email: mainContact.email,
                      })
                    : t('purchaseOrder.emailPdfNoContact')
                }
                checked={emailPdf}
                onChange={setEmailPdf}
              />
              <ToggleRow
                label={t('purchaseOrder.tellMeArrive')}
                hint={t('purchaseOrder.tellMeArriveHint', { date: day(wanted || null) })}
                checked={remindMe}
                onChange={setRemindMe}
              />
            </div>
          </SectionCard>
        </div>

        <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
          <SideCard title={t('purchaseOrder.thisOrder')}>
            <dl className="mt-3 flex flex-col">
              <SideRow label={t('purchaseOrder.lines')} value={String(lines.length)} />
              <SideRow label={t('purchaseOrder.net')} value={money(totals.net)} currency />
              <SideRow label={t('purchaseOrder.vat')} value={money(totals.vat)} currency />
              <SideRow label={t('purchaseOrder.orderValue')} value={money(totals.gross)} currency />
              <SideRow label={t('purchaseOrder.payableBy')} value={day(payable)} last />
            </dl>
          </SideCard>

          <StepsCard
            title={t('purchaseOrder.whatHappens')}
            steps={[
              {
                title: t('purchaseOrder.after.approves'),
                note: t('purchaseOrder.after.approvesNote'),
              },
              { title: t('purchaseOrder.after.sent'), note: sendNote },
              {
                title: t('purchaseOrder.after.goodsArrive'),
                note: t('purchaseOrder.after.goodsArriveNote'),
              },
              {
                title: t('purchaseOrder.after.billTurnsUp'),
                note: t('purchaseOrder.after.billTurnsUpNote'),
              },
            ]}
          />

          <SideCard title={t('purchaseOrder.comparedWithLast')}>
            {last && comparison ? (
              <dl className="mt-3 flex flex-col">
                <SideRow
                  label={last.number ?? t('purchaseOrder.unnumbered')}
                  value={
                    <>
                      {day(last.orderDate)} ·{' '}
                      {last.totalGross === null ? (
                        '—'
                      ) : (
                        <OmAmount
                          size="xs"
                          amount={money(last.totalGross)}
                          amountClassName="text-sm font-semibold tabular-nums"
                        />
                      )}
                    </>
                  }
                />
                <SideRow
                  label={t('purchaseOrder.sameItems')}
                  value={t('purchaseOrder.ofItems', {
                    matched: comparison.sameItems.matched,
                    total: comparison.sameItems.total,
                  })}
                />
                <SideRow
                  label={t('purchaseOrder.quantity')}
                  value={
                    comparison.quantity
                      ? t('purchaseOrder.movedBy', {
                          percent: signed(comparison.quantity.percent),
                          item: comparison.quantity.description,
                        })
                      : t('purchaseOrder.unchanged')
                  }
                  tone={comparison.quantity && comparison.quantity.percent > 0 ? 'up' : undefined}
                />
                <SideRow
                  label={t('purchaseOrder.unitPrice')}
                  value={
                    comparison.price
                      ? t(
                          comparison.price.percent > 0
                            ? 'purchaseOrder.priceUp'
                            : 'purchaseOrder.priceDown',
                          {
                            percent: Math.abs(comparison.price.percent),
                            item: comparison.price.description,
                          },
                        )
                      : t('purchaseOrder.unchanged')
                  }
                  tone={comparison.price && comparison.price.percent > 0 ? 'warn' : undefined}
                  last
                />
              </dl>
            ) : (
              <p className="mt-3 text-sm font-medium leading-[1.5] text-text-quaternary">
                {previous.read.status === 'loading'
                  ? t('appAccess.loading')
                  : t('purchaseOrder.noPrevious')}
              </p>
            )}
          </SideCard>

          <PlainWords label={t('purchaseOrder.inPlainWords')}>
            {withRial(
              t('purchaseOrder.plainWords', {
                amount: money(totals.gross),
                supplier: profile.displayName,
                wanted: day(wanted || null),
                payable: day(payable),
                terms: terms ? t(terms.key, terms.values) : '—',
              }),
            )}
          </PlainWords>
        </aside>
      </div>
    </div>
  )
}

const signed = (percent: number) => `${percent > 0 ? '+' : ''}${percent}%`
