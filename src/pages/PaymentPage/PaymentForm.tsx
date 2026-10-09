import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, OmAmount, SelectionCard, Checkbox } from '../../components/ui'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import {
  billAmounts,
  useSignupPlanTerms,
  vatPercent,
  type PlanTermsRead,
} from '../../hooks/useSignupPlanTerms'
import {
  LINK_CHANNEL,
  PAYMENT_METHOD_CODE,
  REVIEW_ROUTE,
  recordPaymentPreference,
} from '../../lib/identity/onboarding'
import { onboardingStateFrom, planDisplayName, type OnboardingState } from '../../lib/onboarding'
import {
  formatBaisa,
  formatOmr,
  toBaisa,
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
import rialIcon from '../../assets/brand/omr.svg'

/**
 * How a new account will pay its first bill (15 Sep 2026; reshaped 8 Oct 2026).
 *
 * Nothing is charged here. The trial starts when the Fawtir team approves the registration, and
 * the first bill goes out by the method chosen here when it ends, or on approval for a plan the
 * super admin gives no trial. Fawtir never takes card details: a card bill arrives as a Paymob
 * link. The methods on offer, the bank details and the link's life are console settings
 * (`PLATFORM_SETTINGS.payments`). The choice is saved on the draft (ONBOARDING.md row 1.3).
 */
export type { SignupPaymentMethod }

const METHODS: SignupPaymentMethod[] = ['cardLink', 'bankTransfer', 'cash']

/**
 * Bank transfer stays on screen but cannot be chosen until Fawtir's beneficiary is confirmed: the
 * registrant would otherwise expect to pay into an account the screen cannot name (A3).
 */
const unavailable = (method: SignupPaymentMethod) =>
  method === 'bankTransfer' && !PLATFORM_SETTINGS.payments.bankBeneficiaryVerified

export function PaymentForm() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const state = onboardingStateFrom(location.state)
  const { save, submitting, formError } = useOnboardingStep()

  const plan: PlanId = state.plan ?? 'premium'
  const billing: BillingCycle = state.billing ?? 'annual'
  const termsRead = useSignupPlanTerms(plan, billing)
  const terms = termsRead.status === 'ready' ? termsRead.terms : null
  // `undefined`: not known (still reading, or a server that sends no trial); `null`: no trial.
  const trialDays = terms ? terms.trialDays : undefined
  // Automatic ERP extraction: offered as a priced add-on only where the console says so (handbook
  // section 6).
  const offer = extractionOffer(plan)
  const [addon, setAddon] = useState(Boolean(state.addon))
  const months = billing === 'annual' ? 12 : 1

  const offered = METHODS.filter((id) => PLATFORM_SETTINGS.payments.methods[id])
  const choosable = offered.filter((id) => !unavailable(id))
  const [method, setMethod] = useState<SignupPaymentMethod>(
    state.paymentMethod && choosable.includes(state.paymentMethod)
      ? state.paymentMethod
      : (choosable[0] ?? 'cardLink'),
  )
  const [linkVia, setLinkVia] = useState<PaymentLinkVia>(state.linkVia ?? 'email')

  // The saved preference is the server's, and wins over the tab's history until the registrant
  // picks something on this visit: browser Back lands on a history entry from before the choice,
  // which preselected Card over a saved Cash, and Continue would have overwritten it (local run).
  const touched = useRef(false)
  const saved = termsRead.status === 'ready' ? termsRead.preference : null
  useEffect(() => {
    if (!saved || touched.current) return
    const savedMethod = (Object.keys(PAYMENT_METHOD_CODE) as SignupPaymentMethod[]).find(
      (id) => PAYMENT_METHOD_CODE[id] === saved.method,
    )
    if (savedMethod && choosable.includes(savedMethod)) setMethod(savedMethod)
    const savedVia = (Object.keys(LINK_CHANNEL) as PaymentLinkVia[]).find(
      (via) => LINK_CHANNEL[via] === saved.linkChannel,
    )
    if (savedVia) setLinkVia(savedVia)
    setAddon(saved.erpExtractionAddon)
    // choosable is derived from static settings; the saved preference is the only input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  const planName = planDisplayName(t, state, i18n.language)
  const linkDays = PLATFORM_SETTINGS.payments.linkExpiryDays
  const when =
    trialDays === undefined || trialDays === 0
      ? t('payment.when.later')
      : trialDays === null
        ? t('payment.when.onApproval')
        : t('payment.when.afterTrial', { count: trialDays })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (unavailable(method)) return
    const withAddon = addon && offer === 'priced'
    const result = await save((token, signal) =>
      recordPaymentPreference(token, method, linkVia, withAddon, signal),
    )
    if (!result.saved) return
    const next: OnboardingState = {
      ...state,
      plan,
      billing,
      addon: withAddon,
      paymentMethod: method,
      linkVia: method === 'cardLink' ? linkVia : undefined,
      // Review shows the same server figures without asking for them again.
      planTerms: terms ?? undefined,
    }
    navigate(REVIEW_ROUTE, { state: next })
  }

  // The rial sign, drawn like the card and bank outlines: the filled blue tick it replaced read
  // as "selected" on a card that was not.
  const icon = { cardLink: cardIcon, bankTransfer: bankIcon, cash: rialIcon } as const

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
            {trialDays === undefined || trialDays === 0
              ? t('payment.descriptionPending')
              : trialDays === null
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
              disabled={unavailable(id)}
              onSelect={() => {
                touched.current = true
                setMethod(id)
              }}
              icon={<img src={icon[id]} alt="" className="size-6 object-contain" />}
            />
          ))}
        </div>
        {offered.some(unavailable) ? (
          <p className="text-xs font-medium text-text-quaternary">
            {t('payment.bank.unavailable')}
          </p>
        ) : null}

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
                        onChange={() => {
                          touched.current = true
                          setLinkVia(option)
                        }}
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
              <BankTransferDetails when={when} />
            ) : (
              <Note icon={tickIcon} text={t('payment.cash.noteLater', { when })} />
            )}
          </div>

          <div className="flex w-full max-w-[332px] flex-col gap-4 lg:shrink-0">
            {offer === 'priced' ? (
              <AddonOffer
                checked={addon}
                onChange={(checked) => {
                  touched.current = true
                  setAddon(checked)
                }}
                months={months}
              />
            ) : null}
            <OrderSummaryCard
              planName={planName}
              billing={billing}
              months={months}
              termsRead={termsRead}
              addonBaisa={
                addon && offer === 'priced' ? toBaisa(extractionMonthly()) * months : null
              }
              when={when}
            />
          </div>
        </div>
      </div>

      <OnboardingFormError error={formError} />

      <Button type="submit" disabled={submitting} className="w-full max-w-[400px] gap-1.5">
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

/**
 * Only reachable once the beneficiary is verified (the card is disabled before). The reference
 * reads "your invoice number" in the reader's language, so it is not set in the Latin monospace
 * the IBAN uses.
 */
function BankTransferDetails({ when }: { when: string }) {
  const { t } = useTranslation()
  const bank = PLATFORM_SETTINGS.payments.bank
  if (!PLATFORM_SETTINGS.payments.bankBeneficiaryVerified) {
    return <Note icon={bankIcon} text={t('payment.bank.detailsOnRequest')} />
  }
  return (
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
            value={bank.referenceFormat.replace('{invoice}', t('payment.bank.yourInvoice'))}
          />
        </dl>
      </div>
      <Note icon={emailIcon} text={t('payment.bank.noteLater', { when })} />
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

/**
 * The order as the backend priced it: every figure on the plan's lines comes from the status
 * read (catalogue contract §14), never from the app's own arithmetic. The add-on is priced from
 * the platform settings, which the status does not cover yet, so it is shown on its own line
 * outside the total rather than added into a figure the server computed.
 */
function OrderSummaryCard({
  planName,
  billing,
  months,
  termsRead,
  addonBaisa,
  when,
}: {
  planName: string
  billing: BillingCycle
  months: number
  termsRead: PlanTermsRead
  addonBaisa: number | null
  when: string
}) {
  const { t } = useTranslation()
  const terms = termsRead.status === 'ready' ? termsRead.terms : null
  const amounts = billAmounts(terms)
  const rate = vatPercent(terms?.vatRate)
  const missing =
    termsRead.status === 'loading' ? t('payment.summary.loading') : t('payment.summary.unavailable')

  const figure = (amount: string | null | undefined, className: string, size: 'xs' | 'sm') =>
    amount ? (
      <OmAmount size={size} amount={amount} amountClassName={className} />
    ) : (
      <span className="font-semibold text-text-primary/60">{missing}</span>
    )

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
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-text-primary/70">
            {t('payment.summary.planLine', {
              plan: planName,
              cycle: t(`payment.summary.${billing}`),
            })}
          </span>
          {figure(amounts?.exclVat, 'font-semibold text-text-primary/80', 'xs')}
        </div>
        {billing === 'annual' && terms?.monthlyPrice ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-text-primary/50">
              {t('payment.summary.monthlyPrice', { rate: terms.monthlyPrice })}
            </span>
            <span className="font-semibold text-text-primary/60">
              {freeMonths(terms.monthlyPrice, terms.annualPrice, months) > 0
                ? t('payment.summary.monthsWithFree', {
                    count: months,
                    free: freeMonths(terms.monthlyPrice, terms.annualPrice, months),
                  })
                : t('payment.summary.months', { count: months })}
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-text-primary/70">
            {rate === null
              ? t('payment.summary.vatUnknownRate')
              : t('payment.summary.vatRate', { rate })}
          </span>
          {figure(amounts?.vat, 'font-semibold text-text-primary/80', 'xs')}
        </div>
      </div>
      <div className="border-t border-dashed border-[#e8e8e8]" />

      <div className="flex items-center justify-between gap-2 px-3 py-4">
        <span className="text-base font-medium text-text-primary/90">
          {t('payment.summary.firstBill')}
        </span>
        <span className="text-[22px] font-semibold text-text-primary/90">
          {figure(amounts?.inclVat, 'text-[22px] font-semibold text-text-primary/90', 'sm')}
        </span>
      </div>
      {addonBaisa !== null ? (
        <div className="flex items-center justify-between gap-2 px-3 pb-4 text-sm">
          <span className="font-medium text-text-primary/70">
            {t('payment.summary.addonOnTop', { cycle: t(`payment.summary.${billing}`) })}
          </span>
          <OmAmount
            size="xs"
            amount={formatBaisa(addonBaisa)}
            amountClassName="font-semibold text-text-primary/80"
          />
        </div>
      ) : null}
      <div className="border-t border-dashed border-[#e8e8e8]" />

      <p className="px-[18px] py-4 text-center text-[10px] font-medium leading-normal text-text-primary/60">
        {t('payment.summary.firstBillNote', { when })}
        <span className="text-primary-700">{t('payment.summary.cancelAnytime')}</span>
        {t('payment.summary.renewSuffix')}
      </p>
    </div>
  )
}

/**
 * Months the year gives free, from the server's own prices: "Monthly price 80.000 · 12 months"
 * beside an 800.000 year read as an arithmetic error (80 × 12 is 960). 0 when the prices do not
 * divide into whole months, so nothing is claimed that the figures do not show.
 */
function freeMonths(monthlyPrice: string, annualPrice: string | null | undefined, months: number): number {
  if (!annualPrice) return 0
  const month = toBaisa(Number(monthlyPrice))
  const year = toBaisa(Number(annualPrice))
  if (month <= 0 || year % month !== 0) return 0
  const free = months - year / month
  return free > 0 && free < months ? free : 0
}
