import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, OmAmount, SelectionCard, Checkbox, Switch } from '../../components/ui'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import {
  billAmounts,
  useSignupPlanTerms,
  vatPercent,
  type PlanTermsRead,
} from '../../hooks/useSignupPlanTerms'
import { useSignupPaymentOptions } from '../../hooks/useSignupPaymentOptions'
import {
  PAYMENT_METHOD_CODE,
  REVIEW_ROUTE,
  recordPaymentPreference,
  type EnrollmentChoice,
  type SignupPaymentOptions,
} from '../../lib/identity/onboarding'
import { onboardingStateFrom, planDisplayName, type OnboardingState } from '../../lib/onboarding'
import {
  formatBaisa,
  formatOmr,
  toBaisa,
  type BillingCycle,
  type PlanId,
  type SignupPaymentMethod,
  extractionOffer,
  extractionMonthly,
} from '../../lib/pricing'
import { PLATFORM_SETTINGS } from '../../lib/platformSettings'
import cardIcon from '../../assets/payment/card.svg'
import bankIcon from '../../assets/payment/bank.svg'
import emailIcon from '../../assets/payment/email.svg'
import tickIcon from '../../assets/payment/tick-circle.svg'
import rialIcon from '../../assets/brand/omr.svg'

/**
 * The free-trial or pay-now choice, and for pay-now how the first bill will be paid (15 Sep 2026;
 * reshaped 8 Oct 2026; trial made a choice 11 Oct 2026, V283).
 *
 * Nothing is charged here. Every payment belongs to a bill, and bills exist only after the Fawtir
 * team approves the registration (ONBOARDING.md row 1.5), so a card checkout or a transfer receipt
 * cannot be taken on this screen: they happen on the bill, in Settings > Bills. A trial is opened
 * at approval only when chosen here; pay-now opens none. Fawtir never takes card details: a card
 * bill is paid on Paymob's hosted checkout. Which methods can be chosen comes from the server
 * (`/signup/payment-options`), not from app settings.
 */
export type { SignupPaymentMethod }

const METHODS: SignupPaymentMethod[] = ['cardLink', 'bankTransfer', 'cash']

const availableIn = (options: SignupPaymentOptions | null, method: SignupPaymentMethod) =>
  options !== null &&
  (method === 'cardLink'
    ? options.card
    : method === 'bankTransfer'
      ? options.bankTransfer
      : options.cash)

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
  const trialOffered = typeof trialDays === 'number' && trialDays > 0
  // Automatic ERP extraction: offered as a priced add-on only where the console says so (handbook
  // section 6).
  const offer = extractionOffer(plan)
  const [addon, setAddon] = useState(Boolean(state.addon))
  const months = billing === 'annual' ? 12 : 1

  const optionsRead = useSignupPaymentOptions()
  const options = optionsRead.status === 'ready' ? optionsRead.options : null
  const offered = METHODS.filter((id) => PLATFORM_SETTINGS.payments.methods[id])

  // Off unless the registrant turns it on: an unanswered choice must never become a trial.
  const [trial, setTrial] = useState(state.enrollment === 'trial')
  const [method, setMethod] = useState<SignupPaymentMethod | null>(
    state.enrollment === 'trial' ? null : (state.paymentMethod ?? null),
  )
  const [methodMissing, setMethodMissing] = useState(false)
  // A plan without a trial cannot carry one, whatever an earlier visit chose.
  const trialChosen = trial && trialOffered

  // The saved preference is the server's, and wins over the tab's history until the registrant
  // picks something on this visit: browser Back lands on a history entry from before the choice,
  // which preselected Card over a saved Cash, and Continue would have overwritten it (local run).
  const touched = useRef(false)
  const saved = termsRead.status === 'ready' ? termsRead.preference : null
  useEffect(() => {
    if (!saved || touched.current) return
    if (saved.enrollment === 'TRIAL') {
      setTrial(true)
      setMethod(null)
    } else if (saved.enrollment === 'PAY_NOW') {
      setTrial(false)
      const savedMethod = (Object.keys(PAYMENT_METHOD_CODE) as SignupPaymentMethod[]).find(
        (id) => PAYMENT_METHOD_CODE[id] === saved.method,
      )
      setMethod(savedMethod ?? null)
    }
    setAddon(saved.erpExtractionAddon)
  }, [saved])

  const planName = planDisplayName(t, state, i18n.language)
  const when = trialChosen
    ? t('payment.when.afterTrial', { count: trialDays })
    : t('payment.when.onApproval')

  const chosenAvailable = method !== null && availableIn(options, method)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trialChosen && (method === null || !chosenAvailable)) {
      setMethodMissing(true)
      return
    }
    const withAddon = addon && offer === 'priced'
    const choice: EnrollmentChoice = trialChosen
      ? { enrollment: 'trial' }
      : { enrollment: 'payNow', method: method as SignupPaymentMethod }
    const result = await save((token, signal) =>
      recordPaymentPreference(token, choice, withAddon, signal),
    )
    if (!result.saved) return
    const next: OnboardingState = {
      ...state,
      plan,
      billing,
      addon: withAddon,
      enrollment: choice.enrollment,
      paymentMethod: choice.enrollment === 'payNow' ? choice.method : undefined,
      // Review shows the same server figures without asking for them again.
      planTerms: terms ?? undefined,
    }
    navigate(REVIEW_ROUTE, { state: next })
  }

  // The rial sign, drawn like the card and bank outlines: the filled blue tick it replaced read
  // as "selected" on a card that was not.
  const icon = { cardLink: cardIcon, bankTransfer: bankIcon, cash: rialIcon } as const
  const waitingForOptions = !trialChosen && optionsRead.status === 'loading'

  return (
    <form
      onSubmit={handleSubmit}
      className="my-auto flex w-full max-w-[700px] flex-col items-center gap-11"
    >
      <div className="@container flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('payment.title')}
          </h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">
            {trialDays === undefined || trialDays === 0
              ? t('payment.descriptionPending')
              : trialOffered
                ? t('payment.descriptionChoose')
                : t('payment.descriptionNoTrial')}
          </p>
        </div>

        {trialOffered ? (
          <TrialToggle
            days={trialDays}
            checked={trial}
            onChange={(next) => {
              touched.current = true
              setTrial(next)
              setMethodMissing(false)
            }}
          />
        ) : null}

        {trialChosen ? null : (
          <>
            <div
              role="group"
              aria-label={t('payment.methodGroup')}
              className="grid w-full grid-cols-1 gap-[17px] sm:grid-cols-3"
            >
              {offered.map((id) => (
                <SelectionCard
                  key={id}
                  title={t(`payment.method.${id}.title`)}
                  description={t(`payment.method.${id}.subtitle`)}
                  selected={method === id}
                  disabled={!availableIn(options, id)}
                  onSelect={() => {
                    touched.current = true
                    setMethod(id)
                    setMethodMissing(false)
                  }}
                  icon={<img src={icon[id]} alt="" className="size-6 object-contain" />}
                />
              ))}
            </div>
            <MethodAvailabilityNote read={optionsRead} offered={offered} />
            {methodMissing ? (
              <p role="alert" className="text-sm font-medium text-danger-700">
                {t('payment.methodRequired')}
              </p>
            ) : null}
          </>
        )}

        {/* Two columns only when this form itself is wide enough: it sits beside the illustration,
            so the window width said nothing about its room and the summary ran off the edge (F-09). */}
        <div className="flex w-full flex-col gap-6 @min-[700px]:flex-row @min-[700px]:items-start @min-[700px]:justify-between">
          <div className="w-full max-w-[351px] shrink-0">
            {trialChosen ? (
              <Note icon={tickIcon} text={t('payment.trial.note', { count: trialDays })} />
            ) : method === 'cardLink' && chosenAvailable ? (
              <Note icon={cardIcon} text={t('payment.cardLink.noteHosted')} />
            ) : method === 'bankTransfer' && chosenAvailable && options?.beneficiary ? (
              <BankTransferDetails beneficiary={options.beneficiary} />
            ) : method === 'cash' && chosenAvailable ? (
              <Note icon={tickIcon} text={t('payment.cash.noteLater', { when })} />
            ) : null}
          </div>

          <div className="flex w-full max-w-[332px] flex-col gap-4 @min-[700px]:shrink-0">
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

      <Button
        type="submit"
        disabled={submitting || waitingForOptions}
        className="w-full max-w-[400px] gap-1.5"
      >
        {t('payment.continueCta')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}

/** "Start with a 14-day free trial": off by default, and only shown on a plan that has a trial. */
function TrialToggle({
  days,
  checked,
  onChange,
}: {
  days: number
  checked: boolean
  onChange: (next: boolean) => void
}) {
  const { t } = useTranslation()
  const label = t('payment.trial.toggle', { count: days })
  return (
    <div className="flex w-full items-start justify-between gap-4 rounded-sm border border-black/10 bg-surface-card p-4">
      <div className="min-w-0">
        <p className="text-base font-semibold text-text-primary">{label}</p>
        <p className="mt-1 text-sm font-medium text-text-quaternary">
          {checked ? t('payment.trial.onHint') : t('payment.trial.offHint')}
        </p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

/**
 * Why a method card is greyed out, in the server's words: bank transfer without a confirmed
 * account is not offered, rather than shown with details nobody has confirmed.
 */
function MethodAvailabilityNote({
  read,
  offered,
}: {
  read: ReturnType<typeof useSignupPaymentOptions>
  offered: SignupPaymentMethod[]
}) {
  const { t } = useTranslation()
  if (read.status === 'loading') {
    return <p className="text-xs font-medium text-text-quaternary">{t('payment.optionsLoading')}</p>
  }
  if (read.status === 'failed') {
    return (
      <p role="alert" className="text-xs font-medium text-danger-700">
        {t('payment.optionsFailed')}
      </p>
    )
  }
  const { options } = read
  const lines: string[] = []
  if (!offered.some((id) => availableIn(options, id))) lines.push(t('payment.noMethod'))
  if (offered.includes('cardLink') && !options.card) lines.push(t('payment.cardUnavailable'))
  if (offered.includes('bankTransfer') && !options.bankTransfer) {
    lines.push(
      options.bankTransferStatus === 'STORAGE_UNAVAILABLE'
        ? t('payment.bank.storageUnavailable')
        : t('payment.bank.unavailable'),
    )
  }
  if (offered.includes('cash') && !options.cash) lines.push(t('payment.cashUnavailable'))
  if (lines.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 text-xs font-medium text-text-quaternary">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}

/**
 * The add-on offer beside the order (handbook section 6). The tick is a request: it is not saved
 * yet (TODO(backend), ONBOARDING.md row 1.3) and the Fawtir team confirms it, so the words say
 * "requested" and promise nothing the product does not do, such as writing back to the ERP.
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
 * The confirmed ACTIVE account the server returned, never an app constant. No receipt or note is
 * taken here: a receipt belongs to a bill, and the first bill exists only after approval, so the
 * upload happens on that bill in Settings > Bills, where Finance verifies it. The IBAN and SWIFT
 * are Latin in either language, hence `ltr`.
 */
function BankTransferDetails({
  beneficiary,
}: {
  beneficiary: NonNullable<SignupPaymentOptions['beneficiary']>
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-sm border border-black/10 bg-surface-card p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
          {t('payment.bank.detailsTitle')}
        </p>
        <dl className="mt-2 flex flex-col gap-1.5 text-sm">
          <Row label={t('payment.bank.accountName')} value={beneficiary.legalName} />
          <Row label={t('payment.bank.bank')} value={beneficiary.bankName} />
          <Row label="IBAN" value={beneficiary.iban} mono />
          {beneficiary.swiftCode ? <Row label="SWIFT" value={beneficiary.swiftCode} mono /> : null}
        </dl>
      </div>
      <Note icon={emailIcon} text={t('payment.bank.afterApproval')} />
      {/* Shown so the registrant knows what will be asked, and disabled: evidence is accepted only
          against the first bill, which exists once the company is approved (owner, 12 Oct 2026). */}
      <fieldset disabled className="flex flex-col gap-3 rounded-sm border border-dashed border-black/15 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
          {t('payment.bank.evidenceTitle')}
        </legend>
        <label className="flex flex-col gap-1 text-sm font-medium text-text-quaternary">
          {t('payment.bank.receiptLabel')}
          <input type="file" aria-describedby="bank-evidence-later" className="text-xs disabled:cursor-not-allowed" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-text-quaternary">
          {t('payment.bank.notesLabel')}
          <textarea
            rows={2}
            aria-describedby="bank-evidence-later"
            className="rounded-sm border border-border-subtle bg-surface-background px-3 py-2 text-sm disabled:cursor-not-allowed"
          />
        </label>
        <p id="bank-evidence-later" className="text-xs font-medium text-text-tertiary">
          {t('payment.bank.evidenceLater')}
        </p>
      </fieldset>
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
    <div className="flex h-auto min-h-[370px] w-full max-w-[332px] flex-col overflow-hidden rounded-sm border border-[#f3f3f3] bg-surface-card @min-[700px]:shrink-0">
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
