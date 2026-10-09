import { useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, OmAmount, SelectionCard, Checkbox } from '../../components/ui'
import { REVIEW_ROUTE } from '../../lib/identity/onboarding'
import { onboardingStateFrom, type OnboardingState } from '../../lib/onboarding'
import {
  formatOmr,
  getOrderSummary,
  trialDaysFor,
  type BillingCycle,
  type PaymentLinkVia,
  type PlanId,
  type SignupPaymentMethod,
  extractionOffer,
  extractionMonthly,
} from '../../lib/pricing'
import { PLATFORM_SETTINGS } from '../../lib/platformSettings'
import { toOmanE164 } from '../../lib/validation'
import cardIcon from '../../assets/payment/card.svg'
import bankIcon from '../../assets/payment/bank.svg'
import emailIcon from '../../assets/payment/email.svg'
import tickIcon from '../../assets/payment/tick-circle.svg'

/**
 * How a new account will pay its first bill (15 Sep 2026; reshaped 8 Oct 2026).
 *
 * Nothing is charged here. The trial starts when the Fawtir team approves the registration, and
 * the first bill goes out by the method chosen here when it ends, or on approval for a plan the
 * super admin gives no trial. Fawtir never takes card details: a card bill arrives as a Paymob
 * link. The methods on offer, the bank details and the link's life are console settings
 * (`PLATFORM_SETTINGS.payments`). TODO(backend): the choice is not saved yet, ONBOARDING.md
 * row 1.3.
 */
export type { SignupPaymentMethod }

const METHODS: SignupPaymentMethod[] = ['cardLink', 'bankTransfer', 'cash']

export function PaymentForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const state = onboardingStateFrom(location.state)

  const plan: PlanId = state.plan ?? 'premium'
  const billing: BillingCycle = state.billing ?? 'annual'
  const trialDays = trialDaysFor(plan)
  // Automatic ERP extraction: offered as a priced add-on only where the console says so (handbook
  // section 6). TODO(backend): the tick is carried to review but not saved yet, ONBOARDING.md row 1.3.
  const offer = extractionOffer(plan)
  const [addon, setAddon] = useState(Boolean(state.addon))
  const summary = useMemo(
    () => getOrderSummary(plan, billing, { addon: addon && offer === 'priced' }),
    [plan, billing, addon, offer],
  )

  const offered = METHODS.filter((id) => PLATFORM_SETTINGS.payments.methods[id])
  const [method, setMethod] = useState<SignupPaymentMethod>(
    state.paymentMethod && offered.includes(state.paymentMethod)
      ? state.paymentMethod
      : (offered[0] ?? 'cardLink'),
  )
  const [linkVia, setLinkVia] = useState<PaymentLinkVia>(state.linkVia ?? 'email')

  const planName = t(`plans.${plan}.name`)
  const totalLabel = summary ? formatOmr(summary.total) : t('plans.enterprise.price')
  const bank = PLATFORM_SETTINGS.payments.bank
  const linkDays = PLATFORM_SETTINGS.payments.linkExpiryDays
  const when =
    trialDays === null
      ? t('payment.when.onApproval')
      : t('payment.when.afterTrial', { count: trialDays })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: OnboardingState = {
      ...state,
      plan,
      billing,
      addon: addon && offer === 'priced',
      paymentMethod: method,
      linkVia: method === 'cardLink' ? linkVia : undefined,
    }
    navigate(REVIEW_ROUTE, { state: next })
  }

  const icon = { cardLink: cardIcon, bankTransfer: bankIcon, cash: tickIcon } as const

  return (
    <form
      onSubmit={handleSubmit}
      className="my-auto flex w-full max-w-[700px] flex-col items-center gap-11"
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('payment.title')}
          </h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">
            {trialDays === null
              ? t('payment.descriptionNoTrial')
              : t('payment.descriptionTrial', { count: trialDays })}
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-[17px] sm:grid-cols-3">
          {offered.map((id) => (
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
                <Note icon={cardIcon} text={t('payment.cardLink.noteLater', { when })} />
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                    {t('payment.cardLink.sendTo')}
                  </legend>
                  {(['email', 'whatsapp'] as const).map((option) => (
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
                          {t(`payment.cardLink.byVia.${option}`)}
                        </span>
                        <span className="block break-words text-xs font-medium text-text-quaternary">
                          {option === 'whatsapp'
                            ? t('payment.cardLink.viaWhatsAppNote', {
                                // Isolated so the leading + stays at the start in Arabic.
                                phone: state.address
                                  ? `\u2066${toOmanE164(state.address.phone)}\u2069`
                                  : t('payment.cardLink.yourPhone'),
                                days: linkDays,
                              })
                            : t('payment.cardLink.viaEmailNote', {
                                email:
                                  state.accountEmail ??
                                  state.address?.email ??
                                  t('payment.cardLink.yourEmail'),
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
                <div className="rounded-sm border border-black/10 bg-surface-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                    {t('payment.bank.detailsTitle')}
                  </p>
                  <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                    <Row label={t('payment.bank.accountName')} value={bank.accountName} />
                    <Row label={t('payment.bank.bank')} value={bank.bank} />
                    <Row label="IBAN" value={bank.iban} mono />
                    <Row
                      label={t('payment.bank.reference')}
                      value={bank.referenceFormat.replace(
                        '{invoice}',
                        t('payment.bank.yourInvoice'),
                      )}
                      mono
                    />
                  </dl>
                </div>
                <Note icon={emailIcon} text={t('payment.bank.noteLater', { when })} />
              </div>
            ) : (
              <Note icon={tickIcon} text={t('payment.cash.noteLater', { when })} />
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
              when={when}
            />
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full max-w-[400px] gap-1.5">
        {t('payment.continueCta')}
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

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-medium text-text-quaternary">{label}</dt>
      <dd
        dir={mono ? 'ltr' : undefined}
        className={[
          'text-end font-semibold text-text-primary',
          mono ? 'font-mono text-xs' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}

function OrderSummaryCard({
  planName,
  billing,
  summary,
  totalLabel,
  when,
}: {
  planName: string
  billing: BillingCycle
  summary: ReturnType<typeof getOrderSummary>
  totalLabel: string
  when: string
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
          {t('payment.summary.firstBill')}
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
        {t('payment.summary.firstBillNote', { when })}
        <span className="text-primary-700">{t('payment.summary.cancelAnytime')}</span>
        {t('payment.summary.renewSuffix')}
      </p>
    </div>
  )
}
