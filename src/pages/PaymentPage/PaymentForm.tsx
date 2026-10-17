import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SignupCardPayment } from './SignupCardPayment'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, OmAmount, SelectionCard, Checkbox, Switch } from '../../components/ui'
import { FileDropzone } from '../../components/ui/FileDropzone'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { ApiError } from '../../api'
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
  uploadSignupPaymentEvidence,
  type EnrollmentChoice,
  type SignupCardStatus,
  type SignupHeldPayment,
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
import { isConfirmedPayment } from '../../lib/identity/signupRejection'
import { sellerName } from '../../api/settings/billing'
import cardIcon from '../../assets/payment/card.svg'
import bankIcon from '../../assets/payment/bank.svg'
import tickIcon from '../../assets/payment/tick-circle.svg'
import rialIcon from '../../assets/brand/omr.svg'

/**
 * The free-trial or pay-now choice, and for pay-now the payment itself (15 Sep 2026; reshaped
 * 8 Oct 2026; trial made a choice 11 Oct 2026, V287; payment before approval 12 Oct 2026, V289).
 *
 * A bank transfer's receipt is uploaded here, before review, and held with the application: the
 * reviewer sees it, Finance verifies it with four-eyes, and nothing activates until the company is
 * approved and the money is confirmed. Cash is a request the Fawtir team collects. Card is offered
 * only once Paymob's embedded checkout is built; Fawtir never takes card details in its own form.
 * Which methods can be chosen comes from the server (`/signup/payment-options`).
 */
export type { SignupPaymentMethod }

const METHODS: SignupPaymentMethod[] = ['cardLink', 'bankTransfer', 'cash']

/** The ledger's method of a held payment as the method card it was paid with. */
const HELD_METHOD: Record<SignupHeldPayment['method'], SignupPaymentMethod> = {
  CARD: 'cardLink',
  BANK_TRANSFER: 'bankTransfer',
  CASH: 'cash',
}

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

  const held = termsRead.status === 'ready' ? termsRead.held : null
  const [evidence, setEvidence] = useState<BankEvidence>({ proof: null, reference: '', note: '' })
  const [evidenceProblem, setEvidenceProblem] = useState<'receipt' | 'reference' | null>(null)
  // One key per receipt as entered: a retried Continue resends the same upload and the server
  // returns the payment it already recorded instead of a second one.
  const uploadKey = useRef<string | null>(null)
  const changeEvidence = (next: Partial<BankEvidence>) => {
    uploadKey.current = null
    setEvidenceProblem(null)
    setReceiptRefused(false)
    setEvidence((current) => ({ ...current, ...next }))
  }
  // The server refused the receipt (`400`): said under the receipt, in the reader's language,
  // instead of the generic "not accepted" line. The server's own sentence is English, so not shown.
  const [receiptRefused, setReceiptRefused] = useState(false)
  const keepsHeldReceipt = heldBankReceipt(held) && evidence.proof === null
  // Money Finance has confirmed is held with this application: the method can no longer change.
  const paymentLocked = isConfirmedPayment(held?.status)
  const heldMethod = held ? HELD_METHOD[held.method] : null
  // ...so the confirmed payment's own method is the one shown chosen.
  useEffect(() => {
    if (!paymentLocked || !heldMethod) return
    setTrial(false)
    setMethod(heldMethod)
  }, [paymentLocked, heldMethod])
  // Card: Continue only once Fawtir's server has verified the payment with Paymob.
  const [cardStatus, setCardStatus] = useState<SignupCardStatus | null>(null)
  const [cardProblem, setCardProblem] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trialChosen && (method === null || !chosenAvailable)) {
      setMethodMissing(true)
      return
    }
    if (!trialChosen && method === 'cardLink' && cardStatus !== 'VERIFIED') {
      setCardProblem(true)
      return
    }
    const uploading = !trialChosen && method === 'bankTransfer' && !keepsHeldReceipt
    if (uploading && evidence.proof === null) {
      setEvidenceProblem('receipt')
      return
    }
    if (uploading && !evidence.reference.trim()) {
      setEvidenceProblem('reference')
      return
    }
    const withAddon = addon && offer === 'priced'
    const choice: EnrollmentChoice = trialChosen
      ? { enrollment: 'trial' }
      : { enrollment: 'payNow', method: method as SignupPaymentMethod }
    uploadKey.current ??= `signup-payment-${crypto.randomUUID()}`
    const key = uploadKey.current
    setReceiptRefused(false)
    const result = await save(async (token, signal) => {
      // The method first: switching it withdraws a receipt still waiting under another one.
      await recordPaymentPreference(token, choice, withAddon, signal)
      if (uploading && evidence.proof) {
        try {
          await uploadSignupPaymentEvidence(
            token,
            { proof: evidence.proof, reference: evidence.reference.trim(), note: evidence.note },
            key,
            signal,
          )
        } catch (error) {
          if (error instanceof ApiError && error.status === 400) setReceiptRefused(true)
          throw error
        }
      }
    })
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
      seller: options?.seller ?? undefined,
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
                  disabled={!availableIn(options, id) || paymentLocked}
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
              <SignupCardPayment
                save={save}
                addon={addon && offer === 'priced'}
                held={held}
                onStatus={(next) => {
                  setCardStatus(next)
                  if (next === 'VERIFIED') setCardProblem(false)
                }}
              />
            ) : method === 'bankTransfer' && chosenAvailable ? (
              // Offered with or without a confirmed Fawtir account (owner, 13 Oct 2026); the account
              // is shown only when the server returns a verified one.
              <BankTransferDetails
                beneficiary={options?.beneficiary ?? null}
                maxBytes={options?.proofMaximumBytes}
                held={heldBankReceipt(held) ? held : null}
                evidence={evidence}
                problem={evidenceProblem}
                refused={receiptRefused}
                onChange={changeEvidence}
              />
            ) : method === 'cash' && chosenAvailable ? (
              <Note
                icon={tickIcon}
                text={t(
                  held?.method === 'CASH' && held.status === 'FUNDS_VERIFIED'
                    ? 'payment.cash.received'
                    : 'payment.cash.noteSignup',
                )}
              />
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
              seller={sellerName(options?.seller, i18n.language)}
              addonBaisa={
                addon && offer === 'priced' ? toBaisa(extractionMonthly()) * months : null
              }
              when={when}
              payNow={!trialChosen}
            />
          </div>
        </div>
      </div>

      {cardProblem ? (
        <p className="text-xs font-medium text-text-danger" role="alert">
          {t('payment.card.verifyBeforeContinue')}
        </p>
      ) : null}

      <OnboardingFormError error={receiptRefused ? null : formError} />

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

export function Note({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex gap-2 rounded-sm border border-black/10 bg-surface-card p-4">
      <img src={icon} alt="" className="mt-0.5 size-5 shrink-0" />
      <p className="text-sm font-medium leading-6 tracking-[0.14px] text-[rgba(58,58,58,0.8)]">
        {text}
      </p>
    </div>
  )
}

export type BankEvidence = { proof: File | null; reference: string; note: string }

const PROOF_ACCEPT = '.pdf,.png,.jpg,.jpeg'

/** A transfer receipt the server already holds that still counts: not rejected or withdrawn. */
const heldBankReceipt = (held: SignupHeldPayment | null): held is SignupHeldPayment =>
  held !== null &&
  held.method === 'BANK_TRANSFER' &&
  held.hasProof &&
  held.status !== 'REJECTED' &&
  held.status !== 'WITHDRAWN'

/**
 * The confirmed ACTIVE account the server returned, never an app constant, and the receipt for the
 * transfer into it. A receipt the server already holds is shown instead of asked for again; it can
 * be replaced only while nobody has verified it, which the server enforces too. The IBAN and SWIFT
 * are Latin in either language, hence `ltr`.
 */
export function BankTransferDetails({
  beneficiary,
  maxBytes,
  held,
  evidence,
  problem,
  refused,
  onChange,
  transferNote,
  noAccountNote,
}: {
  beneficiary: SignupPaymentOptions['beneficiary']
  maxBytes: number | undefined
  held: SignupHeldPayment | null
  evidence: BankEvidence
  problem: 'receipt' | 'reference' | null
  /** The server refused the last receipt sent. */
  refused: boolean
  onChange: (next: Partial<BankEvidence>) => void
  /** The pay-link page's own wording; sign-up keeps its application sentences. */
  transferNote?: string
  noAccountNote?: string
}) {
  const { t } = useTranslation()
  const [replacing, setReplacing] = useState(false)
  const [fileProblem, setFileProblem] = useState<'size' | 'type' | null>(null)
  return (
    <div className="flex flex-col gap-3">
      {beneficiary ? (
        <>
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
          <Note icon={tickIcon} text={transferNote ?? t('payment.bank.transferNow')} />
        </>
      ) : (
        // No verified account to show: nothing is made up in its place.
        <Note icon={tickIcon} text={noAccountNote ?? t('payment.bank.noAccountDetails')} />
      )}
      {held === null || replacing ? (
        <fieldset className="flex flex-col gap-3 rounded-sm border border-black/10 bg-surface-card p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-[0.5px] text-text-quaternary">
            {t('payment.bank.evidenceTitle')}
          </legend>
          <span id="signup-receipt-label" className="text-sm font-medium text-text-secondary">
            {t('payment.bank.receiptLabel')}
          </span>
          <FileDropzone
            accept={PROOF_ACCEPT}
            maxBytes={maxBytes}
            labelledBy="signup-receipt-label"
            describedBy="signup-receipt-problem"
            onFiles={(files) => {
              setFileProblem(null)
              onChange({ proof: files[0] ?? null })
            }}
            onReject={(reason) => setFileProblem(reason)}
          >
            {() => (
              <span className="flex min-h-14 items-center justify-center rounded-sm border border-dashed border-border-default bg-white px-4 py-3 text-sm font-medium text-text-secondary">
                {evidence.proof ? evidence.proof.name : t('payment.bank.receiptPick')}
              </span>
            )}
          </FileDropzone>
          {fileProblem || problem === 'receipt' || refused ? (
            <p id="signup-receipt-problem" role="alert" className="text-xs font-medium text-danger-700">
              {fileProblem
                ? t(`billing.bank.proofRejected.${fileProblem}`)
                : problem === 'receipt'
                  ? t('payment.bank.receiptRequired')
                  : t('payment.bank.receiptRefused')}
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
            {t('payment.bank.referenceLabel')}
            <input
              value={evidence.reference}
              maxLength={100}
              aria-invalid={problem === 'reference'}
              onChange={(event) => onChange({ reference: event.target.value })}
              className="rounded-sm border border-border-subtle bg-white px-3 py-2 text-sm"
            />
          </label>
          {problem === 'reference' ? (
            <p role="alert" className="text-xs font-medium text-danger-700">
              {t('payment.bank.referenceRequired')}
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
            {t('payment.bank.notesLabel')}
            <textarea
              rows={2}
              maxLength={500}
              value={evidence.note}
              onChange={(event) => onChange({ note: event.target.value })}
              className="rounded-sm border border-border-subtle bg-white px-3 py-2 text-sm"
            />
          </label>
        </fieldset>
      ) : (
        <div className="flex flex-col gap-2 rounded-sm border border-black/10 bg-surface-card p-4">
          <p className="text-sm font-medium text-text-secondary">
            {held.status === 'SUBMITTED'
              ? t('payment.bank.received', { reference: held.reference ?? '' })
              : t('payment.bank.verified')}
          </p>
          {held.status === 'SUBMITTED' ? (
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className="self-start text-sm font-semibold text-primary-700 underline"
            >
              {t('payment.bank.replace')}
            </button>
          ) : null}
        </div>
      )}
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
  seller,
  addonBaisa,
  when,
  payNow,
}: {
  planName: string
  billing: BillingCycle
  months: number
  termsRead: PlanTermsRead
  /** Who is paid, in the reader's language; null when the server named no seller. */
  seller: string | null
  addonBaisa: number | null
  when: string
  /** Paid with the application: the total is due now, and the period still starts at activation. */
  payNow: boolean
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
        {seller ? (
          <p className="text-sm font-medium text-text-primary/70">
            {t('payment.summary.seller', { name: seller })}
          </p>
        ) : null}
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
        {/* Rate 0 is how the server says no VAT is charged: no line, rather than "VAT (0%)". */}
        {rate === '0' ? null : (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-text-primary/70">
              {rate === null
                ? t('payment.summary.vatUnknownRate')
                : t('payment.summary.vatRate', { rate })}
            </span>
            {figure(amounts?.vat, 'font-semibold text-text-primary/80', 'xs')}
          </div>
        )}
      </div>
      <div className="border-t border-dashed border-[#e8e8e8]" />

      <div className="flex items-center justify-between gap-2 px-3 py-4">
        <span className="text-base font-medium text-text-primary/90">
          {payNow ? t('payment.summary.payNowTotal') : t('payment.summary.firstBill')}
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
        {payNow ? t('payment.summary.payNowNote') : t('payment.summary.firstBillNote', { when })}
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
