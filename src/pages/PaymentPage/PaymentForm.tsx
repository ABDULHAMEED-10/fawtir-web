import { useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Checkbox,
  ChevronDownIcon,
  ChevronRightIcon,
  Input,
  OmAmount,
  SelectionCard,
} from '../../components/ui'
import {
  formatOmr,
  formatRenewalDate,
  getOrderSummary,
  getRenewalDate,
  type BillingCycle,
  type PlanId,
} from '../../lib/pricing'
import cardIcon from '../../assets/payment/card.svg'
import bankIcon from '../../assets/payment/bank.svg'
import emailIcon from '../../assets/payment/email.svg'
import visaIcon from '../../assets/payment/visa.svg'
import mastercardIcon from '../../assets/payment/mastercard.svg'
import amexIcon from '../../assets/payment/amex.svg'

type PaymentMethod = 'card' | 'bank'

type LocationState = {
  plan?: PlanId
  billing?: BillingCycle
}

function formatCardNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 16)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function PaymentForm() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as LocationState | null) ?? {}

  const plan: PlanId = state.plan ?? 'premium'
  const billing: BillingCycle = state.billing ?? 'annual'
  const summary = useMemo(() => getOrderSummary(plan, billing), [plan, billing])

  const [method, setMethod] = useState<PaymentMethod>('card')
  const [nameOnCard, setNameOnCard] = useState('Hafidh Saif Al Balushi')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [billingCountry, setBillingCountry] = useState('Oman')
  const [saveCard, setSaveCard] = useState(true)

  const planName = t(`plans.${plan}.name`)
  const totalLabel = summary ? formatOmr(summary.total) : t('plans.enterprise.price')
  const renewalDate = formatRenewalDate(getRenewalDate(billing), i18n.language)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/fawtara-status', {
      state: {
        ...state,
        paymentMethod: method,
        ...(method === 'card'
          ? { nameOnCard, cardNumber, expiry, billingCountry, saveCard }
          : {}),
      },
    })
  }

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

        <div className="grid w-full grid-cols-1 gap-[17px] sm:grid-cols-2">
          <SelectionCard
            title={t('payment.card.title')}
            description={t('payment.card.subtitle')}
            selected={method === 'card'}
            onSelect={() => setMethod('card')}
            icon={<img src={cardIcon} alt="" className="size-6" />}
          />
          <SelectionCard
            title={t('payment.bank.title')}
            description={t('payment.bank.subtitle')}
            selected={method === 'bank'}
            onSelect={() => setMethod('bank')}
            icon={<img src={bankIcon} alt="" className="size-6" />}
          />
        </div>

        <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="w-full max-w-[351px] shrink-0">
            {method === 'card' ? (
              <div className="flex flex-col gap-4">
                <Input
                  label={t('payment.card.nameLabel')}
                  requiredMark
                  value={nameOnCard}
                  onChange={(e) => setNameOnCard(e.target.value)}
                  autoComplete="cc-name"
                  className="border border-primary-300"
                />

                <Input
                  label={t('payment.card.numberLabel')}
                  requiredMark
                  placeholder={t('payment.card.numberPlaceholder')}
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  labelEnd={
                    <span className="inline-flex items-center gap-[3px]">
                      <img src={visaIcon} alt="" className="h-[17px] w-[27px] object-contain" />
                      <img
                        src={mastercardIcon}
                        alt=""
                        className="h-[17px] w-[27px] object-contain"
                      />
                      <span className="inline-flex h-[17px] w-[27px] items-center justify-center overflow-hidden rounded-[1.5px] bg-[#016fd0]">
                        <img src={amexIcon} alt="" className="h-3 w-[22px] object-contain" />
                      </span>
                    </span>
                  }
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label={t('payment.card.expiryLabel')}
                    requiredMark
                    placeholder={t('payment.card.expiryPlaceholder')}
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    inputMode="numeric"
                    autoComplete="cc-exp"
                  />
                  <Input
                    label={t('payment.card.cvcLabel')}
                    requiredMark
                    placeholder={t('payment.card.cvcPlaceholder')}
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    type="password"
                  />
                </div>

                <Input
                  label={t('payment.card.countryLabel')}
                  requiredMark
                  value={billingCountry}
                  onChange={(e) => setBillingCountry(e.target.value)}
                  autoComplete="country-name"
                  className="border border-primary-300"
                  trailingIcon={<ChevronDownIcon className="text-text-quaternary" />}
                />

                <Checkbox
                  label={t('payment.card.saveCard')}
                  checked={saveCard}
                  onChange={(e) => setSaveCard(e.target.checked)}
                  className="gap-[9px] text-xs font-medium text-text-primary"
                />
              </div>
            ) : (
              <div className="flex gap-2 rounded-sm border border-black/10 bg-surface-card p-4">
                <img src={emailIcon} alt="" className="mt-0.5 size-5 shrink-0" />
                <p className="text-sm font-medium leading-6 tracking-[0.14px] text-[rgba(58,58,58,0.8)]">
                  {t('payment.bank.notePrefix')}
                  <span className="font-semibold text-[#3a3a3a]">
                    {t('payment.bank.noteHighlight')}
                  </span>
                  {t('payment.bank.noteSuffix')}
                </p>
              </div>
            )}
          </div>

          <OrderSummaryCard
            planName={planName}
            billing={billing}
            summary={summary}
            totalLabel={totalLabel}
            renewalDate={renewalDate}
          />
        </div>
      </div>

      <Button type="submit" className="w-full max-w-[400px] gap-1.5">
        {method === 'card'
          ? t('payment.payCta', { amount: totalLabel })
          : t('payment.bankCta')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
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
                amount={formatOmr(summary.subtotal)}
                amountClassName="font-semibold text-text-primary/80"
              />
            </div>
            {billing === 'annual' ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-text-primary/50">
                  {t('payment.summary.monthlyRate', { rate: summary.monthlyRate })}
                </span>
                <span className="font-semibold text-text-primary/60">
                  {t('payment.summary.months', { count: summary.months })}
                </span>
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
