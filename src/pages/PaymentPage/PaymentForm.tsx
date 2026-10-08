import { useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, OmAmount, SelectionCard, Checkbox } from '../../components/ui'
import {
  formatOmr,
  formatRenewalDate,
  getOrderSummary,
  getRenewalDate,
  type BillingCycle,
  type PlanId,
  extractionOffer,
  extractionMonthly,
} from '../../lib/pricing'
import { PLATFORM_SETTINGS } from '../../lib/platformSettings'
import cardIcon from '../../assets/payment/card.svg'
import bankIcon from '../../assets/payment/bank.svg'
import emailIcon from '../../assets/payment/email.svg'
import tickIcon from '../../assets/payment/tick-circle.svg'

/**
 * How a new account pays its first bill (15 Sep 2026).
 *
 * Fawtir never takes card details: a card payment opens Paymob's own checkout, either straight
 * from here or from a link sent to the customer's phone or inbox. Bank transfer and cash are the
 * other two doors, and every one of them ends the same way — someone at Fawtir confirms the money
 * arrived and activates the account. So the design's card form is gone; the three routes stand
 * where it was, and the summary stays.
 */
export type SignupPaymentMethod = 'cardLink' | 'bankTransfer' | 'cash'

type LocationState = {
  plan?: PlanId
  billing?: BillingCycle
  /** The extraction add-on, ticked on the payment step. */
  addon?: boolean
  phone?: string
  email?: string
}

const METHODS: SignupPaymentMethod[] = ['cardLink', 'bankTransfer', 'cash']

export function PaymentForm() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState | null) ?? {}

  const plan: PlanId = state.plan ?? 'premium'
  const billing: BillingCycle = state.billing ?? 'annual'
  // Automatic ERP extraction: offered as a priced add-on only where the console says so.
  const offer = extractionOffer(plan)
  const [addon, setAddon] = useState(Boolean(state.addon))
  const summary = useMemo(
    () => getOrderSummary(plan, billing, { addon: addon && offer === 'priced' }),
    [plan, billing, addon, offer],
  )

  const [method, setMethod] = useState<SignupPaymentMethod>('cardLink')
  const [linkVia, setLinkVia] = useState<'now' | 'whatsapp' | 'email'>('now')

  const planName = t(`plans.${plan}.name`)
  const totalLabel = summary ? formatOmr(summary.total) : t('plans.enterprise.price')
  const renewalDate = formatRenewalDate(getRenewalDate(billing), i18n.language)
  const linkDays = PLATFORM_SETTINGS.payments.linkExpiryDays

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/fawtara-status', {
      state: {
        addon: addon && offer === 'priced',
        ...state,
        paymentMethod: method,
        linkVia: method === 'cardLink' ? linkVia : undefined,
      },
    })
  }

  const icon = { cardLink: cardIcon, bankTransfer: bankIcon, cash: tickIcon } as const

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-[700px] flex-col items-center gap-11"
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('payment.title')}
          </h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">
            {t('payment.description')}
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-[17px] sm:grid-cols-3">
          {METHODS.map((id) => (
            <SelectionCard
              key={id}
              title={t(`payment.method.${id}.title`)}
              description={t(`payment.method.${id}.subtitle`)}
              selected={method === id}
              onSelect={() => setMethod(id)}
              icon={<img src={icon[id]} alt="" className="size-6" />}
            />
          ))}
        </div>

        <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="w-full max-w-[351px] shrink-0">
            {method === 'cardLink' ? (
              <div className="flex flex-col gap-3">
                <Note icon={cardIcon} text={t('payment.cardLink.note')} />
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                    {t('payment.cardLink.how')}
                  </legend>
                  {(['now', 'whatsapp', 'email'] as const).map((option) => (
                    <label
                      key={option}
                      className={[
                        'flex cursor-pointer items-center gap-3 rounded-sm border px-3.5 py-3 transition-colors',
                        linkVia === option
                          ? 'border-primary-300 bg-primary-25'
                          : 'border-border-subtle bg-surface-card hover:border-primary-300',
                      ].join(' ')}
                    >
                      <input
                        type="radio"
                        name="linkVia"
                        value={option}
                        checked={linkVia === option}
                        onChange={() => setLinkVia(option)}
                        className="size-4 accent-primary-700"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-text-primary">
                          {t(`payment.cardLink.via.${option}`)}
                        </span>
                        <span className="block text-xs font-medium text-text-quaternary">
                          {option === 'now'
                            ? t('payment.cardLink.viaNowNote')
                            : option === 'whatsapp'
                              ? t('payment.cardLink.viaWhatsAppNote', {
                                  phone: state.phone ?? t('payment.cardLink.yourPhone'),
                                  days: linkDays,
                                })
                              : t('payment.cardLink.viaEmailNote', {
                                  email: state.email ?? t('payment.cardLink.yourEmail'),
                                  days: linkDays,
                                })}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </div>
            ) : method === 'bankTransfer' ? (
              <div className="flex flex-col gap-3">
                {/* The account name and IBAN came from the console's local launch defaults, not a
                    confirmed Fawtir account; a payer must never be shown an account to pay into
                    that nobody has confirmed. Fawtir sends the details with the subscription invoice. */}
                <Note icon={bankIcon} text={t('payment.bank.detailsOnRequest')} />
                <Note icon={emailIcon} text={t('payment.bank.note')} />
              </div>
            ) : (
              <Note icon={tickIcon} text={t('payment.cash.note')} />
            )}
          </div>

          <div className="flex w-full max-w-[332px] flex-col gap-4 lg:shrink-0">
            {offer === 'priced' ? (
              <AddonOffer checked={addon} onChange={setAddon} months={summary?.months ?? 1} />
            ) : null}
            <OrderSummaryCard
              planName={planName}
              billing={billing}
              summary={summary}
              totalLabel={totalLabel}
              renewalDate={renewalDate}
            />
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full max-w-[400px] gap-1.5">
        {method === 'cardLink'
          ? linkVia === 'now'
            ? t('payment.payCta', { amount: totalLabel })
            : t('payment.sendLinkCta')
          : method === 'bankTransfer'
            ? t('payment.bankCta')
            : t('payment.cashCta')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}

/**
 * The add-on offer beside the order: one tick adds automatic ERP extraction to the first invoice
 * and the request reaches the console with the subscription, so the operator activates both.
 */
function AddonOffer({
  checked,
  onChange,
  months,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  months: number
}) {
  const { t } = useTranslation()
  const monthly = extractionMonthly()
  return (
    <div className="w-full rounded-sm border border-[#f3f3f3] bg-surface-card px-[18px] py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
        {t('payment.addon.title')}
      </p>
      <div className="mt-2">
        <Checkbox
          label={t('payment.addon.label')}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
      <p className="mt-1.5 text-xs font-medium leading-[1.5] text-text-tertiary">
        {t('payment.addon.body')}
      </p>
      <p className="mt-2 flex items-baseline gap-1 text-sm font-semibold text-text-primary">
        <OmAmount size="xs" amount={formatOmr(monthly)} amountClassName="font-semibold" />
        <span className="text-xs font-medium text-text-quaternary">
          {months > 1
            ? t('payment.addon.perMonthTimes', { count: months })
            : t('payment.addon.perMonth')}
        </span>
      </p>
    </div>
  )
}

function Note({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex gap-2 rounded-sm border border-black/10 bg-surface-card p-4">
      <img src={icon} alt="" className="mt-0.5 size-5 shrink-0" />
      <p className="text-sm font-medium leading-6 tracking-[0.14px] text-[rgba(58,58,58,0.8)]">
        {text}
      </p>
    </div>
  )
}

function OrderSummaryCard({
  planName,
  billing,
  summary,
  totalLabel,
  renewalDate,
}: {
  planName: string
  billing: BillingCycle
  summary: ReturnType<typeof getOrderSummary>
  totalLabel: string
  renewalDate: string
}) {
  const { t } = useTranslation()

  return (
    <div className="flex h-auto min-h-[370px] w-full max-w-[332px] flex-col overflow-hidden rounded-sm border border-[#f3f3f3] bg-surface-card lg:shrink-0">
      <div className="px-[18px] pb-3 pt-5">
        <p className="text-base font-medium text-text-primary">{t('payment.summary.title')}</p>
      </div>
      <div className="border-t border-dashed border-[#e8e8e8]" />

      <div className="flex flex-col gap-1.5 px-[18px] py-3">
        <p className="text-2xl font-semibold text-text-primary">{planName}</p>
        <p className="text-sm font-medium text-text-primary/70">
          {billing === 'annual'
            ? t('payment.summary.annualBilling')
            : t('payment.summary.monthlyBilling')}
        </p>
      </div>
      <div className="border-t border-dashed border-[#e8e8e8]" />

      <div className="flex flex-1 flex-col gap-3 px-3 py-4">
        {summary ? (
          <>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-text-primary/70">
                {t('payment.summary.planLine', {
                  plan: planName,
                  cycle: t(`payment.summary.${billing}`),
                })}
              </span>
              <OmAmount
                size="xs"
                amount={formatOmr(summary.planSubtotal)}
                amountClassName="font-semibold text-text-primary/80"
              />
            </div>
            {billing === 'annual' ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-text-primary/50">
                  {t('payment.summary.monthlyRate', { rate: formatOmr(summary.monthlyRate) })}
                </span>
                <span className="font-semibold text-text-primary/60">
                  {t('payment.summary.months', { count: summary.months })}
                </span>
              </div>
            ) : null}
            {summary.addonSubtotal > 0 ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-text-primary/70">
                  {t('payment.summary.addonLine', {
                    cycle: t(`payment.summary.${billing}`),
                  })}
                </span>
                <OmAmount
                  size="xs"
                  amount={formatOmr(summary.addonSubtotal)}
                  amountClassName="font-semibold text-text-primary/80"
                />
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-text-primary/70">{t('payment.summary.vat')}</span>
              <OmAmount
                size="xs"
                amount={formatOmr(summary.vat)}
                amountClassName="font-semibold text-text-primary/80"
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-text-primary/70">{planName}</span>
            <span className="font-semibold text-text-primary/80">
              {t('plans.enterprise.price')}
            </span>
          </div>
        )}
      </div>
      <div className="border-t border-dashed border-[#e8e8e8]" />

      <div className="flex items-center justify-between gap-2 px-3 py-4">
        <span className="text-base font-medium text-text-primary/90">
          {t('payment.summary.totalDue')}
        </span>
        <span className="text-[22px] font-semibold text-text-primary/90">
          {summary ? (
            <OmAmount
              size="sm"
              amount={formatOmr(summary.total)}
              amountClassName="text-[22px] font-semibold text-text-primary/90"
            />
          ) : (
            totalLabel
          )}
        </span>
      </div>
      <div className="border-t border-dashed border-[#e8e8e8]" />

      <p className="px-[18px] py-4 text-center text-[10px] font-medium leading-normal text-text-primary/60">
        {t('payment.summary.renewPrefix', { date: renewalDate, amount: totalLabel })}
        <span className="text-primary-700">{t('payment.summary.cancelAnytime')}</span>
        {t('payment.summary.renewSuffix')}
      </p>
    </div>
  )
}
