import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { createPurchaseOrder, type PurchaseOrderRequest } from '../../api/expenditure/purchaseOrders'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import { describeApiFailure } from '../../lib/apiFailure'
import { draftTotals, emptyLine, lineProblem, type LineDraft } from '../../lib/purchaseOrders'
import { formatAmount } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import chevronIcon from '../../assets/invoices/chevron.svg'

const FIELD =
  'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Suppliers › one supplier › New purchase order (E-13).
 *
 * Creates a DRAFT. Nothing is communicated to the supplier from here — the order is submitted,
 * approved and marked as sent on its own screen, and even "sent" transmits nothing.
 *
 * Lines are free text rather than catalogue picks: `LineRequest` takes a description, a quantity,
 * a unit price and a VAT rate, and carries no product id, so a picker here would collect
 * something the order cannot hold.
 */
export function NewPurchaseOrderPage() {
  return (
    <AppShell>
      <NewPurchaseOrder />
    </AppShell>
  )
}

function NewPurchaseOrder() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const session = useSession()
  const canManage = can(session, 'purchase-order.manage')

  const supplier = useApiRead<SupplierDetailDto>(slug ? supplierPath(slug) : null, () => loadSupplier(slug))
  const record = supplier.read.status === 'ready' ? supplier.read.data : null

  const [orderDate, setOrderDate] = useState('')
  const [wantedBy, setWantedBy] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const currency = record?.profile.defaultCurrency ?? 'OMR'
  const problems = lines.map(lineProblem)
  const totals = draftTotals(lines)
  const canSave = canManage && record !== null && problems.every((problem) => problem === null) && !busy

  const setLine = (index: number, change: Partial<LineDraft>) =>
    setLines(lines.map((line, other) => (other === index ? { ...line, ...change } : line)))

  const save = async () => {
    if (!record) return
    setBusy(true)
    setFailure(null)
    try {
      const body: PurchaseOrderRequest = {
        supplierId: record.profile.id,
        orderDate: orderDate || null,
        wantedBy: wantedBy || null,
        deliverToBranchId: null,
        yourReference: reference.trim() || null,
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
      const created = await createPurchaseOrder(body)
      navigate(`/expenditure/purchase-orders/${created.id}`)
    } catch (error) {
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setFailure(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/suppliers/${slug}`} className="text-2xl font-medium leading-[1.2] text-primary-700 hover:text-primary-800">
          {record?.profile.displayName ?? t('purchaseOrder.supplier')}
        </Link>
        <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
        <span className="text-2xl font-medium leading-[1.2] text-text-primary">{t('purchaseOrder.newTitle')}</span>
      </div>

      {supplier.read.status === 'loading' ? <LoadingNotice /> : null}
      {supplier.read.status === 'failed' ? <ApiReadFailure error={supplier.read.error} retry={supplier.retry} /> : null}
      {!canManage ? <PermissionDeniedNotice /> : null}

      {record && canManage ? (
        <>
          {failure ? (
            <Notice
              badge={t('supplierCreditNoteDetail.notDone')}
              body={failure}
              action={{ label: t('common.close'), onClick: () => setFailure(null) }}
            />
          ) : null}

          <section className="rounded-md bg-surface-card p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-text-quaternary">{t('purchaseOrder.orderDate')}</span>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={`${FIELD} mt-1`} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-text-quaternary">{t('purchaseOrder.wantedBy')}</span>
                <input type="date" value={wantedBy} onChange={(e) => setWantedBy(e.target.value)} className={`${FIELD} mt-1`} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-text-quaternary">{t('purchaseOrder.yourReference')}</span>
                <input type="text" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} className={`${FIELD} mt-1`} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-text-quaternary">{t('purchaseOrder.currency')}</span>
                {/* The supplier's default, and not editable here: the order is priced in what the
                    supplier bills in, and changing it per order would silently re-price the lines. */}
                <input type="text" value={currency} readOnly className={`${FIELD} mt-1 bg-surface-background`} />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-semibold text-text-quaternary">{t('purchaseOrder.supplierNote')}</span>
              <textarea
                maxLength={1000}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-sm border border-border-subtle bg-white p-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500"
              />
            </label>
          </section>

          <section className="rounded-md bg-surface-card p-6">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('purchaseOrder.linesTitle')}</h2>

            <div className="mt-4 flex flex-col gap-3">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_5rem_5rem_7rem_5rem_auto]">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => setLine(index, { description: e.target.value })}
                    placeholder={t('purchaseOrder.description')}
                    aria-label={t('purchaseOrder.lineDescription', { line: index + 1 })}
                    aria-invalid={problems[index] === 'description'}
                    className={FIELD}
                  />
                  <input
                    type="number"
                    value={line.quantity}
                    onChange={(e) => setLine(index, { quantity: e.target.value })}
                    aria-label={t('purchaseOrder.lineQuantity', { line: index + 1 })}
                    aria-invalid={problems[index] === 'quantity'}
                    className={FIELD}
                  />
                  <input
                    type="text"
                    maxLength={10}
                    value={line.unit}
                    onChange={(e) => setLine(index, { unit: e.target.value })}
                    placeholder={t('purchaseOrder.unit')}
                    aria-label={t('purchaseOrder.lineUnit', { line: index + 1 })}
                    className={FIELD}
                  />
                  <input
                    type="number"
                    value={line.unitPrice}
                    onChange={(e) => setLine(index, { unitPrice: e.target.value })}
                    placeholder={t('purchaseOrder.unitPrice')}
                    aria-label={t('purchaseOrder.lineUnitPrice', { line: index + 1 })}
                    aria-invalid={problems[index] === 'unitPrice'}
                    className={FIELD}
                  />
                  <input
                    type="number"
                    value={line.vatRate}
                    onChange={(e) => setLine(index, { vatRate: e.target.value })}
                    aria-label={t('purchaseOrder.lineVat', { line: index + 1 })}
                    aria-invalid={problems[index] === 'vatRate'}
                    className={FIELD}
                  />
                  <button
                    type="button"
                    disabled={lines.length === 1}
                    onClick={() => setLines(lines.filter((_, other) => other !== index))}
                    aria-label={t('purchaseOrder.removeLine', { line: index + 1 })}
                    className="h-[46px] px-2 text-sm font-semibold text-text-quaternary hover:text-warning-700 disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {problems.some((problem) => problem !== null) ? (
              <p role="alert" className="mt-3 text-sm font-medium text-warning-700">
                {t(`purchaseOrder.error.${problems.find((problem) => problem !== null)}`)}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => setLines([...lines, emptyLine()])}
              className="mt-4 inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
            >
              {t('purchaseOrder.addLine')}
            </button>

            <dl className="mt-6 flex flex-col gap-1 text-sm">
              <Total label={t('purchaseOrder.net')} value={formatAmount(totals.net, currency, language)} />
              <Total label={t('purchaseOrder.vat')} value={formatAmount(totals.vat, currency, language)} />
              <Total label={t('purchaseOrder.gross')} value={formatAmount(totals.gross, currency, language)} strong />
            </dl>
            <p className="mt-2 text-xs font-medium text-text-quaternary">{t('purchaseOrder.totalsNote')}</p>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void save()}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
            >
              {t(busy ? 'common.saving' : 'purchaseOrder.saveDraft')}
            </button>
            <Link
              to={`/suppliers/${slug}`}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary hover:bg-primary-25"
            >
              {t('common.cancel')}
            </Link>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={strong ? 'font-semibold text-text-secondary' : 'font-medium text-text-quaternary'}>{label}</dt>
      <dd className={['tabular-nums', strong ? 'text-base font-semibold text-text-secondary' : 'font-medium text-text-tertiary'].join(' ')}>
        {value}
      </dd>
    </div>
  )
}
