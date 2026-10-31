import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DiscountField } from '../../components/invoice'
import { setSaleDiscount, useOpenSale } from '../../lib/posSale'
import { useEntitlements } from '../../hooks/useEntitlements'
import { discountBreach, type DiscountBreach } from '../../lib/posDiscountLimit'
import { Rial, withRial } from '../../components/ui'
import { PosFootNote } from './PosFootNote'
import {
  omr,
  omrSigned,
  ruleApplies,
  ruleNames,
  ruleSaving,
  tillTime,
  totalsFor,
  typedDiscount,
  unitPrice,
  type SaleLine,
} from '../../lib/pos'
import { dismissStaleRuleNotice, useStaleRuleNotices } from '../../lib/posPriceRules'

/**
 * The sale as it stands (Figma 143:18015, right-hand panel).
 *
 * It explains itself: each line says which size and add-ons were chosen and what one of them
 * costs, and the price rule that fired says so in words rather than just making the number
 * smaller. Everything is worked out from the lines, so changing a quantity moves the discount,
 * the VAT and the total together.
 *
 * The figures come from the invoice's own engine over the lines the sale files (`totalsFor`), so
 * the till and the invoice cannot disagree. "% Discount" is a discount on the whole sale, the
 * invoice's document discount, taken after the price rule and before VAT (owner, 21 Oct 2026).
 */
export function PosSalePanel({
  lines,
  onLines,
  onTakePayment,
  onCompany,
  company,
}: {
  lines: SaleLine[]
  onLines: (lines: SaleLine[]) => void
  onTakePayment: () => void
  onCompany?: () => void
  /** Set once the sale has been put on a company account. */
  company?: { name: string }
}) {
  const { t, i18n } = useTranslation()
  const [discountOpen, setDiscountOpen] = useState(false)
  const { saleDiscount, startedAt } = useOpenSale()
  const started = tillTime(startedAt, i18n.language.startsWith('ar') ? 'ar' : 'en-GB')
  const totals = totalsFor(lines, saleDiscount)
  const items = lines.reduce((sum, line) => sum + line.qty, 0)
  const discounted = lines.some(ruleApplies) && totals.discount > 0
  const rules = ruleNames(lines)
  const stale = useStaleRuleNotices()
  const { entitlements } = useEntitlements()
  const limit = entitlements?.discountLimits?.['pos.sell'] ?? null
  const breach = discountBreach(lines, saleDiscount, limit)
  const [discountLine, setDiscountLine] = useState<string | null>(null)
  const setLineDiscount = (id: string, lineDiscount: SaleLine['lineDiscount']) =>
    onLines(lines.map((l) => (l.id === id ? { ...l, lineDiscount } : l)))

  const setQty = (id: string, qty: number) =>
    onLines(
      qty <= 0
        ? lines.filter((l) => l.id !== id)
        : lines.map((l) => (l.id === id ? { ...l, qty } : l)),
    )

  return (
    <aside className="flex w-full flex-col rounded-md bg-surface-card xl:w-[392px] xl:shrink-0">
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-medium leading-[1.2] text-text-primary">
            {company ? company.name : t('pos.thisSale')}
          </h2>
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            {company
              ? t('pos.itemsFullInvoice', { count: items })
              : started
                ? t('pos.itemsStarted', { count: items, time: started })
                : t('pos.today.itemCount', { count: items })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={t('pos.editSale')}
            className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle text-text-tertiary transition-colors hover:bg-primary-25"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path
                d="M13.5 3.5a2.1 2.1 0 0 1 3 3L8 15l-4 1 1-4 8.5-8.5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onLines([])}
            aria-label={t('pos.clearSale')}
            className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle text-text-tertiary transition-colors hover:bg-danger-100 hover:text-danger-700"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path
                d="M4 6h12M8 6V4h4v2M6.5 6l.7 10h5.6l.7-10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {!company ? (
        <div className="px-5 pt-4">
          {/* One grey bar with the chosen side raised in white, as the frame draws it. */}
          <div className="grid grid-cols-2 gap-1 rounded-sm bg-surface-background p-1">
            <button
              type="button"
              aria-pressed="true"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] bg-surface-card text-sm font-semibold text-text-primary shadow-sm"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {t('pos.walkIn')}
            </button>
            <button
              type="button"
              aria-pressed="false"
              onClick={onCompany}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[3px] text-sm font-medium text-text-tertiary transition-colors hover:text-text-secondary"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M3.5 17V8.5L10 4l6.5 4.5V17M8 17v-4.5h4V17"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              {t('pos.onTheCompany')}
            </button>
          </div>
          <p className="mt-2 text-xs font-medium leading-[1.5] text-text-quaternary">
            {t('pos.walkInNote')}
          </p>
        </div>
      ) : null}

      <ul className="flex flex-col px-5 pt-4">
        {lines.map((line) => {
          const addOns = line.addOns
          return (
            <li key={line.id} className="flex items-start gap-3 py-3">
              <div className="flex shrink-0 items-center gap-1 rounded-sm border border-border-subtle">
                <button
                  type="button"
                  onClick={() => setQty(line.id, line.qty - 1)}
                  aria-label={t('pos.oneFewer', { name: line.name })}
                  className="flex size-7 items-center justify-center text-text-secondary transition-colors hover:text-primary-800"
                >
                  −
                </button>
                <span className="min-w-[18px] text-center text-sm font-semibold tabular-nums text-text-primary">
                  {line.qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(line.id, line.qty + 1)}
                  aria-label={t('pos.oneMore', { name: line.name })}
                  className="flex size-7 items-center justify-center text-text-secondary transition-colors hover:text-primary-800"
                >
                  +
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium leading-[1.2] text-text-primary">{line.name}</p>
                <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                  {line.variant ? line.variant.label : t('pos.oneSizeOnly')}
                  {addOns.length ? (
                    <span className="text-primary-700">
                      {' · '}
                      {addOns.map((a) => `+ ${a.label}`).join(', ')}
                    </span>
                  ) : null}
                </p>
                <button
                  type="button"
                  onClick={() => setDiscountLine(discountLine === line.id ? null : line.id)}
                  aria-expanded={discountLine === line.id}
                  aria-label={t('pos.lineDiscount.open', { name: line.name })}
                  className="mt-1 text-xs font-semibold text-primary-700"
                >
                  {typedDiscount(line)
                    ? typedDiscount(line)?.type === 'PERCENTAGE'
                      ? t('pos.lineDiscount.setPercent', { value: typedDiscount(line)?.value })
                      : t('pos.lineDiscount.setAmount', {
                          value: omr(Math.round(Number(typedDiscount(line)?.value) * 1000)),
                        })
                    : t('pos.lineDiscount.add')}
                </button>
                {discountLine === line.id ? (
                  <div className="mt-2">
                    <DiscountField
                      type={line.lineDiscount?.type ?? 'PERCENTAGE'}
                      value={line.lineDiscount?.value ?? ''}
                      onTypeChange={(type) =>
                        setLineDiscount(line.id, { type, value: line.lineDiscount?.value ?? '' })
                      }
                      onValueChange={(value) =>
                        setLineDiscount(line.id, {
                          type: line.lineDiscount?.type ?? 'PERCENTAGE',
                          value: value.replace(/[^\d.]/g, '').replace(/(\.\d{3})\d+$/, '$1'),
                        })
                      }
                      resolved={BigInt(
                        line.lineDiscount?.type === 'FIXED_AMOUNT'
                          ? 0
                          : Math.round(
                              (unitPrice(line) *
                                line.qty *
                                (Number(line.lineDiscount?.value) || 0)) /
                                100,
                            ),
                      )}
                    />
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      {limit != null ? (
                        <span className="text-xs font-medium text-text-quaternary">
                          {t('pos.lineDiscount.limit', { limit })}
                        </span>
                      ) : null}
                      {limit == null || limit >= 100 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLineDiscount(line.id, { type: 'PERCENTAGE', value: '100' })
                          }
                          className="text-xs font-semibold text-primary-700"
                        >
                          {t('pos.lineDiscount.giveAway')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {breach && 'lineId' in breach && breach.lineId === line.id ? (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">
                    {breachSentence(breach, limit, t)}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-end">
                <p className="text-base font-semibold text-text-primary">
                  {omr(unitPrice(line) * line.qty)}
                </p>
                {line.qty > 1 ? (
                  <p className="mt-1 text-xs font-medium text-text-quaternary">
                    {t('pos.each', { amount: omr(unitPrice(line)) })}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
        {lines.length === 0 ? (
          <li className="py-10 text-center text-sm font-medium text-text-tertiary">
            {t('pos.nothingYet')}
          </li>
        ) : null}
      </ul>

      {discounted ? (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-sm bg-success-100 px-3 py-2.5">
          <span className="mt-0.5 text-success-700">✓</span>
          <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
            {withRial(t('pos.ruleApplied', { names: rules, amount: omr(ruleSaving(lines)) }))}
          </p>
        </div>
      ) : null}
      {/* A sale sent from the offline queue kept the discount it was printed with although the
          rules now give another (POS_PRICE_RULE_STALE_ACCEPTED). */}
      {stale.map((notice) => (
        <div
          key={notice.saleId}
          role="status"
          className="mx-5 mt-3 flex items-start justify-between gap-2 rounded-sm bg-pending-100 px-3 py-2.5"
        >
          <p className="min-w-0 text-xs font-medium leading-[1.5] text-pending-700">
            {t('pos.ruleStaleAccepted', {
              number: notice.invoiceNumber,
              lines: notice.lines.join(', '),
            })}
          </p>
          <button
            type="button"
            onClick={() => dismissStaleRuleNotice(notice.saleId)}
            aria-label={t('pos.ruleStaleDismiss')}
            className="relative shrink-0 text-xs font-semibold text-pending-700 after:absolute after:-inset-2 after:content-['']"
          >
            ×
          </button>
        </div>
      ))}

      <div className="mt-4 flex flex-col gap-2.5 border-t border-border-subtle px-5 py-4">
        <Row label={t('pos.totals.items')} value={omr(totals.items)} />
        {totals.discount > 0 ? (
          <Row
            label={
              discounted ? t('pos.totals.rule', { names: rules }) : t('pos.totals.lineDiscounts')
            }
            value={omrSigned(-totals.discount)}
          />
        ) : null}
        {totals.saleDiscount > 0 ? (
          <Row label={t('pos.totals.saleDiscount')} value={omrSigned(-totals.saleDiscount)} />
        ) : null}
        <Row
          label={
            totals.vatRates.length === 1
              ? t('pos.totals.vatAt', { rate: totals.vatRates[0] })
              : t('pos.totals.vatMixed')
          }
          value={omr(totals.vat)}
        />
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
          <span className="text-lg font-medium text-text-primary">{t('pos.totals.toPay')}</span>
          <span className="inline-flex items-baseline gap-1.5 text-[26px] font-semibold leading-none text-text-primary">
            <Rial />
            {omr(totals.sale)}
          </span>
        </div>
      </div>

      <div className="px-5 pb-5">
        {breach && !('lineId' in breach) ? (
          <p role="alert" className="mb-2 text-xs font-medium text-danger-700">
            {breachSentence(breach, limit, t)}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onTakePayment}
          disabled={lines.length === 0 || breach !== null}
          className="inline-flex h-[52px] w-full items-center justify-center rounded-sm bg-primary-700 text-base font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('pos.takePayment')}
        </button>
        {!company ? (
          <>
            <button
              type="button"
              onClick={() => setDiscountOpen((open) => !open)}
              aria-expanded={discountOpen}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <PercentIcon />
              {t('pos.discount')}
            </button>
            {discountOpen ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-text-secondary">
                  {t('pos.saleDiscountLabel')}
                </p>
                <DiscountField
                  type={saleDiscount.type}
                  value={saleDiscount.value}
                  onTypeChange={(type) => setSaleDiscount({ ...saleDiscount, type })}
                  onValueChange={(value) =>
                    setSaleDiscount({ ...saleDiscount, value: value.replace(/[^\d.]/g, '') })
                  }
                  resolved={BigInt(totals.saleDiscount)}
                />
                <p className="mt-1.5 text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t('pos.saleDiscountNote')}
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      {company ? <PosFootNote>{t('pos.company.tippingOff')}</PosFootNote> : null}
    </aside>
  )
}

/** Said where it is fixed, in the words of the server's refusal (`pos.refusal.DISCOUNT_ABOVE_LIMIT`). */
function breachSentence(
  breach: DiscountBreach,
  limit: number | null,
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  if (breach.kind === 'tooMuch') return t('pos.lineDiscount.tooMuch')
  return t(`pos.lineDiscount.over.${breach.kind}`, { percent: breach.percent, limit })
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-text-tertiary">{label}</span>
      {/* LTR so a taken-off "−1.120" keeps its minus on the left in Arabic too. */}
      <span dir="ltr" className="text-sm font-semibold text-text-primary tabular-nums">
        {value}
      </span>
    </div>
  )
}

function PercentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="6" cy="6" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="1.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
