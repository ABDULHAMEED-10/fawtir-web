import { useEffect, useState } from 'react'
import { startNewSale, useFinishedSale, type FinishedSale } from '../../lib/posSale'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { Rial, withRial } from '../../components/ui'
import { CheckIcon, EnvelopeIcon, InfoIcon, PhoneIcon, PrinterIcon, QrIcon } from './posIcons'
import { PosTillGate } from './PosTillGate'
import { LULL, omr, omrSigned, tillTime, toBaisa, unitPrice } from '../../lib/pos'
import { FILING_STEPS, RECEIPT_WAYS } from '../../lib/posPayment'
import { loadPosSale, posSaleQrPath, type PosSaleDto } from '../../api/pos/pos'
import { API_BASE_URL } from '../../config/api'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import {
  COMPANY_PROFILE_PATH,
  loadCompanyProfile,
  type CompanyProfileDto,
} from '../../api/company/companyProfile'
import { initialsOf } from '../../lib/posTill'
import type { TillState } from '../../lib/posTill'

type Ready = Extract<TillState, { status: 'ready' }>

/** One picture per way of handing over the receipt. */
const WAY_ICONS: Record<string, typeof PrinterIcon> = {
  print: PrinterIcon,
  email: EnvelopeIcon,
  text: PhoneIcon,
  qr: QrIcon,
}

/**
 * The sale is in (Figma 143:18997): the invoice `POST /v1/pos/sales` raised, its filing as the
 * server reports it (`GET /v1/pos/sales/{id}?wait=` until the Authority answers) and the
 * receipt, with its QR (`GET /v1/pos/sales/{id}/qr`) for a consumer's simplified invoice. A sale
 * the till queued offline prints its own number and is sent when the connection is back.
 */
export function PosDonePage() {
  const done = useFinishedSale()
  if (!done) return <Navigate to="/pos" replace />
  return (
    <AppShell>
      <PosTillGate>{(till) => <Done done={done} till={till} />}</PosTillGate>
    </AppShell>
  )
}

/** How long the receipt stays before the till clears itself for the next customer. */
const CLEARS_AFTER_MS = 20_000

/** Accepted by the Authority, or sent over Peppol: nothing more to wait for. */
function settled(sale: PosSaleDto): boolean {
  return (
    sale.receipt.qr.status !== 'PENDING' &&
    (sale.filing.acceptedAt != null || sale.filing.dispatchState !== 'QUEUED')
  )
}

function Done({ done, till }: { done: FinishedSale; till: Ready }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const navigate = useNavigate()
  const [way, setWay] = useState('print')
  const [sale, setSale] = useState<PosSaleDto | null>(done.sale)
  const { entitlements } = useEntitlements()
  const profile = useApiRead<CompanyProfileDto>(COMPANY_PROFILE_PATH, loadCompanyProfile)
  const business = profile.read.status === 'ready' ? profile.read.data : null

  // Waits (up to 15 s a time, three times) for the filed and accepted steps and the QR.
  useEffect(() => {
    if (!done.sale || settled(done.sale)) return
    let active = true
    const id = done.sale.saleId
    ;(async () => {
      for (let round = 0; round < 3 && active; round++) {
        try {
          const next = await loadPosSale(id, 15)
          if (!active) return
          setSale(next)
          if (settled(next)) return
        } catch {
          return
        }
      }
    })()
    return () => {
      active = false
    }
  }, [done.sale])

  // "Or press Enter. This screen clears itself after 20 seconds": the next customer's empty till,
  // for a sale filed or queued alike (retest N-6).
  useEffect(() => {
    const next = () => {
      startNewSale()
      navigate('/pos')
    }
    const timer = window.setTimeout(next, CLEARS_AFTER_MS)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) next()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [navigate])

  const { totals, tip, change, lines } = done
  const total = sale
    ? toBaisa(sale.receipt.invoiceTotal) + toBaisa(sale.receipt.tip)
    : totals.sale + tip
  const invoice = sale?.invoiceNumber ?? done.queuedNumber ?? ''
  const seconds =
    sale?.filing.acceptedAt != null
      ? Math.max(
          0,
          (new Date(sale.filing.acceptedAt).getTime() - new Date(done.finishedAt).getTime()) / 1000,
        ).toFixed(1)
      : null
  const company = done.company
  const buyer = done.buyer ?? null
  // A full tax invoice prints as one in both languages: to a company, or to a named buyer (F-6).
  const fullInvoice = sale ? sale.transactionType === 'FULL_TAX' : !!company || !!buyer
  const accepted = !!sale?.filing.acceptedAt
  const sent = !!sale && sale.filing.dispatchState !== 'QUEUED'
  const stepDone = {
    raised: !!sale,
    signed: !!sale,
    filed: sent,
    accepted: accepted || (sent && !!company),
  }
  const name = business?.legalName ?? entitlements?.tenantName ?? ''
  const address = business
    ? [business.registeredAddress, business.registeredCity].filter(Boolean).join(', ')
    : ''

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-success-100 px-6 py-5">
        <div className="flex min-w-0 flex-1 items-start gap-4 max-md:basis-full">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success-700 text-white">
            <CheckIcon className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-medium leading-[1.2] text-text-primary">
              {sale
                ? t('pos.done.title')
                : done.queuedBehind
                  ? t('pos.done.queuedBehindTitle')
                  : t('pos.done.queuedTitle')}
            </h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.6] text-text-tertiary">
              {/* The amount goes in as "OMR 2.000" so withRial sets the sign beside it. */}
              {withRial(
                !sale
                  ? t(
                      done.queuedBehind ? 'pos.done.queuedBehindSummary' : 'pos.done.queuedSummary',
                      {
                        invoice,
                        change: `OMR ${omr(change)}`,
                      },
                    )
                  : seconds != null
                    ? t('pos.done.summary', { invoice, seconds, change: `OMR ${omr(change)}` })
                    : t('pos.done.summaryWaiting', { invoice, change: `OMR ${omr(change)}` }),
              )}
            </p>
          </div>
        </div>
        <div className="text-end max-md:basis-full max-md:text-start">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
            {t('pos.pay.changeToGive')}
          </p>
          <p className="mt-1 inline-flex items-baseline gap-1.5 text-[30px] font-semibold leading-none text-success-700">
            <Rial />
            {omr(change)}
          </p>
        </div>
      </section>

      {sale?.warnings.length ? (
        <section className="rounded-md bg-pending-100 px-6 py-4">
          <ul className="flex flex-col gap-1 text-sm font-medium text-pending-700">
            {sale.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>
                {t(`pos.warning.${warning.code}`, {
                  line: warning.line ?? '',
                  defaultValue: t('pos.warning.other'),
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[320px] flex-1 flex-col gap-4">
          <section className="rounded-md bg-surface-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
              <div>
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('pos.done.whatHappened')}
                </h2>
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {sale
                    ? t('pos.done.underTwoSeconds')
                    : t(
                        done.queuedBehind ? 'pos.done.sentAfterEarlier' : 'pos.done.sentWhenOnline',
                      )}
                </p>
              </div>
              <Link
                to="/compliance/activity"
                className="text-sm font-semibold text-primary-700 hover:text-primary-800"
              >
                {t('pos.done.seeFilingRecord')}
              </Link>
            </div>
            {/* Four checks joined by a line, as the frame draws the run; two by two on a phone. */}
            <ol className="grid grid-cols-2 gap-y-5 px-6 py-5 sm:grid-cols-4">
              {FILING_STEPS.map((step, index) => {
                const ok = stepDone[step.id as keyof typeof stepDone]
                return (
                  <li
                    key={step.id}
                    className="relative flex min-w-0 flex-col items-center gap-2 px-1 text-center sm:after:absolute sm:after:start-[calc(50%+24px)] sm:after:top-4 sm:after:h-px sm:after:w-[calc(100%-48px)] sm:after:bg-border-default sm:last:after:hidden"
                  >
                    <span
                      className={[
                        'flex size-8 items-center justify-center rounded-full',
                        ok ? 'bg-success-700 text-white' : 'bg-neutral-100 text-text-quaternary',
                      ].join(' ')}
                    >
                      <CheckIcon className="size-4" />
                    </span>
                    <span className="text-sm font-semibold text-text-primary">
                      {company && step.id === 'filed' ? t('pos.done.sentPeppol') : t(step.labelKey)}
                    </span>
                    <span className="text-xs font-medium text-text-quaternary">
                      {ok
                        ? t(step.noteKey, {
                            invoice,
                            sent: tillTime(sale?.receivedAt, locale),
                            accepted: tillTime(sale?.filing.acceptedAt ?? sale?.receivedAt, locale),
                          })
                        : t('pos.done.waiting')}
                    </span>
                    <span className="sr-only">{index + 1}</span>
                  </li>
                )
              })}
            </ol>
          </section>

          <section className="rounded-md bg-surface-card">
            <div className="border-b border-border-subtle px-6 py-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.done.giveReceipt')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {/* A queued sale has no QR yet, and is not filed yet (retest N-6). */}
                {sale ? t('pos.done.qrAlreadyUp') : t('pos.done.qrAfterFiling')}
              </p>
            </div>
            {/* TODO(backend): only printing works; e-mailing or texting a receipt has no route
                yet (INCOME.md row P.29). */}
            <div className="grid grid-cols-2 gap-3 px-6 py-4 max-md:grid-cols-1">
              {RECEIPT_WAYS.map((option) => {
                const chosen = option.id === way
                const Icon = WAY_ICONS[option.id] ?? PrinterIcon
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setWay(option.id)
                      if (option.id === 'print') window.print()
                    }}
                    aria-pressed={chosen}
                    className={[
                      'flex items-center gap-3 rounded-md border px-4 py-3.5 text-start transition-colors',
                      chosen
                        ? 'border-success-700 bg-success-100'
                        : 'border-border-subtle bg-white hover:border-primary-300',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex size-9 shrink-0 items-center justify-center rounded-sm',
                        chosen
                          ? 'bg-success-700 text-white'
                          : 'bg-surface-background text-text-tertiary',
                      ].join(' ')}
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    {/* Name and note on one line; the note gives way first. */}
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                      <span className="shrink-0 text-sm font-semibold text-text-primary">
                        {t(option.labelKey)}
                      </span>
                      <span
                        title={t(option.noteKey)}
                        className="min-w-0 truncate text-xs font-medium text-text-quaternary"
                      >
                        {t(option.noteKey)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-text-quaternary">
                      {option.hotkey}
                    </span>
                  </button>
                )
              })}
            </div>
            {till.can.refund ? (
              <div className="mx-6 mb-6 flex flex-wrap items-center gap-3 rounded-sm bg-surface-background px-4 py-3">
                <p className="flex min-w-[220px] flex-1 items-start gap-2 text-sm font-medium leading-[1.6] text-text-tertiary">
                  <InfoIcon className="mt-1 size-4 shrink-0 text-text-quaternary" />
                  <span className="min-w-0 flex-1">
                    {sale ? t('pos.done.rungUpWrong') : t('pos.done.rungUpWrongQueued')}
                  </span>
                </p>
                {sale ? (
                  <Link
                    to={`/pos/refund?invoice=${encodeURIComponent(sale.invoiceNumber)}`}
                    className="inline-flex h-11 shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                  >
                    {t('pos.done.refundOrVoid')}
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="pb-2" />
            )}
          </section>

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-card px-6 py-5">
            <div>
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('pos.done.readyNext')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('pos.done.clearsItself')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                startNewSale()
                navigate('/pos')
              }}
              className="inline-flex h-[52px] shrink-0 items-center rounded-sm bg-primary-700 px-6 text-base font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t('pos.done.startNew')}
            </button>
          </section>
        </div>

        <aside className="flex w-full flex-col rounded-md bg-surface-card xl:w-[392px] xl:shrink-0">
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
            <h2 className="text-base font-medium leading-[1.2] text-text-primary">
              {t('pos.done.theirReceipt')}
            </h2>
            <button
              type="button"
              onClick={() => window.print()}
              className="text-sm font-semibold text-primary-700"
            >
              {t('pos.done.printAgain')}
            </button>
          </div>

          {/* The receipt paper on a grey card body, as the frame draws it. */}
          <div className="rounded-b-md bg-surface-background p-5 max-sm:px-3">
            <div className="rounded-sm bg-white px-5 py-6 text-center shadow-sm">
              <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary-700 text-sm font-semibold text-white">
                {initialsOf(name || 'F')}
              </span>
              <p className="mt-3 text-base font-semibold text-text-primary">{name}</p>
              <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                {address}
                {business ? (
                  <>
                    <br />
                    {t('pos.done.vat')} <span dir="ltr">{business.taxNumber}</span>
                  </>
                ) : null}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
                {fullInvoice ? t('pos.done.taxInvoice') : t('pos.done.simplifiedInvoice')}
              </p>
              <p className="font-arabic text-xs text-text-secondary">
                {fullInvoice ? 'فاتورة ضريبية' : 'فاتورة ضريبية مبسطة'}
              </p>

              <div className="mt-4 border-t border-dashed border-border-subtle pt-3 text-start">
                <ReceiptRow
                  label={invoice}
                  value={new Date(done.finishedAt).toLocaleString(locale, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    timeZone: 'Asia/Muscat',
                  })}
                />
                <ReceiptRow
                  label={t('pos.done.till', {
                    number: till.till.number,
                    who: sale?.cashier.name ?? till.till.openShift?.cashier.name ?? '',
                  })}
                  value={till.branchName ?? ''}
                />
                {/* The buyer of a full invoice, named with their VAT number or ID (F-6). */}
                {company ? (
                  <>
                    <ReceiptRow label={company.name} value="" />
                    {company.vat ? (
                      <ReceiptRow label={t('pos.done.vat')} value={company.vat} />
                    ) : company.identifier ? (
                      <ReceiptRow
                        label={t(`customerForm.identifier.schemes.${company.identifier.scheme}`)}
                        value={company.identifier.value}
                      />
                    ) : null}
                  </>
                ) : buyer ? (
                  <>
                    <ReceiptRow label={buyer.name} value="" />
                    <ReceiptRow
                      label={t(`customerForm.identifier.schemes.${buyer.identifierScheme}`)}
                      value={buyer.identifierValue}
                    />
                  </>
                ) : null}
              </div>

              <div className="mt-3 border-t border-dashed border-border-subtle pt-3 text-start">
                {lines.map((line) => (
                  <ReceiptRow
                    key={line.id}
                    label={`${line.qty} × ${line.name}${line.variant ? ` (${line.variant.label})` : ''}`}
                    value={omr(unitPrice(line) * line.qty)}
                  />
                ))}
              </div>

              <div className="mt-3 border-t border-dashed border-border-subtle pt-3 text-start">
                <ReceiptRow label={t('pos.totals.items')} value={omr(totals.items)} />
                {totals.discount > 0 ? (
                  <ReceiptRow
                    label={
                      lines.some((line) => line.rulePercent)
                        ? t('pos.totals.lullShort', { percent: LULL.percent })
                        : t('pos.totals.lineDiscounts')
                    }
                    value={omrSigned(-totals.discount)}
                  />
                ) : null}
                {totals.saleDiscount > 0 ? (
                  <ReceiptRow
                    label={t('pos.totals.saleDiscount')}
                    value={omrSigned(-totals.saleDiscount)}
                  />
                ) : null}
                <ReceiptRow label={t('pos.done.beforeVat')} value={omr(totals.beforeVat)} />
                <ReceiptRow
                  label={
                    totals.vatRates.length === 1
                      ? t('pos.totals.vatAt', { rate: totals.vatRates[0] })
                      : t('pos.totals.vatMixed')
                  }
                  value={omr(totals.vat)}
                />
                <ReceiptRow label={t('pos.pay.sale')} value={omr(totals.sale)} />
                {/* A tip is printed below the invoice total, never inside it (Abdul 14). */}
                {tip > 0 ? <ReceiptRow label={t('pos.done.tipNoVat')} value={omr(tip)} /> : null}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-dashed border-border-subtle pt-3">
                <span className="text-sm font-semibold uppercase tracking-[0.04em] text-text-primary">
                  {t('pos.total')}
                </span>
                <span className="inline-flex items-baseline gap-1 text-base font-semibold text-text-primary">
                  <Rial />
                  {omr(total)}
                </span>
              </div>

              <div className="mt-3 border-t border-dashed border-border-subtle pt-3 text-start">
                {done.payments.map((payment, index) => (
                  <ReceiptRow
                    key={index}
                    label={
                      payment.method === 'card' && payment.approvalCode?.trim()
                        ? t('pos.done.cardApproval', { code: payment.approvalCode.trim() })
                        : t(`pos.pay.${payment.method}`)
                    }
                    value={omr(payment.amount)}
                  />
                ))}
                <ReceiptRow label={t('pos.done.change')} value={omr(change)} />
              </div>

              <div className="mt-5 flex flex-col items-center gap-2">
                {sale?.receipt.qr.status === 'READY' ? (
                  <>
                    <img
                      src={`${API_BASE_URL}${posSaleQrPath(sale.saleId)}`}
                      alt={t('pos.done.qrAlt')}
                      className="size-[132px]"
                    />
                    <p className="text-[11px] font-medium leading-[1.5] text-text-quaternary">
                      {t('pos.done.scanToCheck')}
                    </p>
                  </>
                ) : !company ? (
                  <p className="text-[11px] font-medium leading-[1.5] text-text-quaternary">
                    {t('pos.done.qrComing')}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] font-medium text-text-quaternary">
                  {t('pos.done.thankYou')} · شكراً لكم
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-xs font-medium text-text-tertiary">{label}</span>
      <span dir="ltr" className="text-xs font-semibold tabular-nums text-text-primary">
        {value}
      </span>
    </div>
  )
}
