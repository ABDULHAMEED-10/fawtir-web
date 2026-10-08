import { useState, type FormEvent } from 'react'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, Input, Rial } from '../../components/ui'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import { billAmounts } from '../../hooks/useSignupPlanTerms'
import {
  PAYMENT_ROUTE,
  PENDING_ROUTE,
  PLANS_ROUTE,
  submitForReview,
} from '../../lib/identity/onboarding'
import { markOnboardingSubmitted } from '../../lib/identity/onboardingSession'
import {
  BUSINESS_SIZE_LABEL_KEYS,
  CATEGORY_LABEL_KEYS,
  INVOICING_METHOD_LABEL_KEYS,
  onboardingStateFrom,
  planDisplayName,
} from '../../lib/onboarding'
import { SUB_TYPES_BY_BUSINESS } from '../../lib/subBusinessTypes'
import { toOmanE164 } from '../../lib/validation'
import { findCode, nameOf } from '../../lib/codeLists/codeList'
import { ISIC_ACTIVITIES } from '../../lib/codeLists/isic'

/** `money`: the value is a rial figure and carries the rial sign. */
type Row = { label: string; value: string; money?: boolean }

function ReviewSection({ title, editTo, rows }: { title: string; editTo: string; rows: Row[] }) {
  const { t } = useTranslation()
  const location = useLocation()
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase leading-[1.2] text-text-muted">{title}</p>
        <Link
          to={editTo}
          state={location.state}
          className="text-xs font-semibold text-primary-700 hover:text-primary-800"
        >
          {t('signupReview.edit')}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <Input
            key={row.label}
            label={row.label}
            value={row.value}
            readOnly
            readOnlyAppearance
            leadingIcon={row.money ? <Rial className="text-text-secondary" /> : undefined}
          />
        ))}
      </div>
    </section>
  )
}

/**
 * The last page before a human takes over. Shows the saved answers — carried by this tab, or
 * refilled from the status read's draft when the page opens without them — each section with a
 * way to change it, because editing closes once the draft is with a reviewer (backend signup
 * guide §10a).
 */
export function SignupReviewForm() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const state = onboardingStateFrom(location.state)
  const { save, submitting, formError } = useOnboardingStep({
    conflictKey: 'signupReview.conflict',
  })
  const [planMissing, setPlanMissing] = useState(false)
  const activity = findCode(ISIC_ACTIVITIES, state.identity?.industrialClassification)
  // Only for a value the server did not return (an older server, or a step it reports complete
  // without its draft): it is saved, but there is nothing honest to show, so the field says so.
  const saved = t('signupReview.savedEarlier')
  const shown = (key: string | undefined) => (key ? t(key) : saved)
  const optional = (value: string | undefined) => (address ? value || '—' : saved)

  const trade = state.businessType
    ? SUB_TYPES_BY_BUSINESS[state.businessType].find(
        (option) => option.id === state.subBusinessType,
      )
    : undefined
  const { identity, address } = state
  const sizeKey = state.businessSize && BUSINESS_SIZE_LABEL_KEYS[state.businessSize]
  const invoicingKey = state.invoicingMethod && INVOICING_METHOD_LABEL_KEYS[state.invoicingMethod]
  const categoryKey = state.businessType && CATEGORY_LABEL_KEYS[state.businessType]
  const accentKey = identity && `businessIdentity.accents.${identity.accent}`
  const governorateKey = address && `governorate.${address.governorate}`

  // A plan, and for every plan but Enterprise a way to pay, before anything reaches a reviewer.
  const { plan, paymentMethod } = state
  const planChosen = Boolean(plan && (plan === 'enterprise' || paymentMethod))
  // From the status read only; an older server sends no trial and no amounts, and the page then
  // says they are not known rather than working them out from the launch catalogue.
  const trialDays = state.planTerms ? state.planTerms.trialDays : undefined
  const amounts = billAmounts(state.planTerms ?? null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!planChosen) {
      setPlanMissing(true)
      return
    }
    // The server refuses the same draft itself (`signup-plan-required`,
    // `signup-payment-preference-required`); this check only spares the request.
    const result = await save((token, signal) => submitForReview(token, signal))
    if (!result.saved) return
    markOnboardingSubmitted(true)
    // Replace: the draft is now closed, so Back must not reopen a page that can only mislead.
    navigate(PENDING_ROUTE, {
      replace: true,
      state: { ...state, submitted: true, email: state.accountEmail },
    })
  }

  const sections: Array<{ key: string; title: string; editTo: string; rows: Row[] }> = [
    {
      key: 'business',
      title: t('signupReview.sections.business'),
      editTo: '/about-business',
      rows: [
        { label: t('signupReview.fields.size'), value: shown(sizeKey) },
        { label: t('signupReview.fields.invoicing'), value: shown(invoicingKey) },
        {
          label: t('signupReview.fields.pos'),
          value:
            state.usesPos === undefined
              ? saved
              : t(state.usesPos ? 'signupReview.posYes' : 'signupReview.posNo'),
        },
        // The trade is asked only of POS users; without POS the backend holds none.
        ...(state.usesPos === false
          ? []
          : [
              { label: t('signupReview.fields.category'), value: shown(categoryKey) },
              { label: t('signupReview.fields.trade'), value: shown(trade?.labelKey) },
            ]),
      ],
    },
    {
      key: 'identity',
      title: t('signupReview.sections.identity'),
      editTo: '/business-identity',
      rows: [
        { label: t('businessIdentity.companyNameLabel'), value: identity?.companyName ?? saved },
        { label: t('businessIdentity.crLabel'), value: identity?.crNumber ?? saved },
        {
          label: t('signupReview.fields.activity'),
          value: identity
            ? activity
              ? `${activity.code} · ${nameOf(activity, i18n.language)}`
              : '—'
            : saved,
        },
        { label: t('businessIdentity.vatinLabel'), value: identity?.vatin ?? saved },
        { label: t('businessIdentity.accentLabel'), value: shown(accentKey) },
      ],
    },
    {
      key: 'address',
      title: t('signupReview.sections.address'),
      editTo: '/address-contact',
      rows: [
        { label: t('addressContact.addressLine'), value: address?.addressLine ?? saved },
        { label: t('addressContact.addressLine2'), value: address?.addressLine2 ?? saved },
        { label: t('addressContact.addressLine3'), value: address?.addressLine3 ?? saved },
        { label: t('addressContact.postalCode'), value: address?.postalCode ?? saved },
        { label: t('addressContact.poBox'), value: optional(address?.poBox) },
        { label: t('addressContact.city'), value: address?.city ?? saved },
        { label: t('addressContact.governorate'), value: shown(governorateKey) },
        { label: t('addressContact.contactName'), value: address?.contactName ?? saved },
        { label: t('addressContact.role'), value: optional(address?.role) },
        { label: t('addressContact.phone'), value: address ? toOmanE164(address.phone) : saved },
        { label: t('addressContact.email'), value: address?.email ?? saved },
      ],
    },
    {
      key: 'plan',
      title: t('signupReview.sections.plan'),
      editTo: plan && plan !== 'enterprise' ? PAYMENT_ROUTE : PLANS_ROUTE,
      rows: !plan
        ? [{ label: t('signupReview.fields.plan'), value: t('signupReview.notChosen') }]
        : plan === 'enterprise'
          ? [
              { label: t('signupReview.fields.plan'), value: t('plans.enterprise.name') },
              { label: t('signupReview.fields.terms'), value: t('signupReview.enterpriseTerms') },
            ]
          : [
              {
                label: t('signupReview.fields.plan'),
                value: t('signupReview.planValue', {
                  plan: planDisplayName(t, state, i18n.language),
                  cycle: t(
                    state.billing === 'annual'
                      ? 'signupReview.billedAnnually'
                      : 'signupReview.billedMonthly',
                  ),
                }),
              },
              {
                label: t('signupReview.fields.payment'),
                value: paymentMethod
                  ? paymentMethod === 'cardLink'
                    ? t(`signupReview.payment.cardLink.${state.linkVia ?? 'email'}`)
                    : t(`signupReview.payment.${paymentMethod}`)
                  : t('signupReview.notChosen'),
              },
              {
                label: t('signupReview.fields.firstBill'),
                value:
                  trialDays === undefined || trialDays === 0
                    ? t('signupReview.firstBillUnknown')
                    : trialDays === null
                      ? t('signupReview.firstBillOnApproval')
                      : t('signupReview.firstBillAfterTrial', { count: trialDays }),
              },
              amounts
                ? {
                    label: t('signupReview.fields.firstBillAmount'),
                    value: amounts.inclVat,
                    money: true,
                  }
                : {
                    label: t('signupReview.fields.firstBillAmount'),
                    value: t('signupReview.amountUnavailable'),
                  },
              ...(state.addon
                ? [{ label: t('payment.addon.title'), value: t('signupReview.addonValue') }]
                : []),
            ],
    },
  ]

  return (
    // my-auto, not the layout's centring alone: this page is taller than most viewports, and a
    // centred child taller than its scroll container starts above the scroll origin, cutting off
    // the heading where no scroll can reach it (measured: 103px at 1440, 493px at 390).
    <form
      onSubmit={handleSubmit}
      className="my-auto flex w-full max-w-[700px] flex-col items-center gap-11"
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('signupReview.title')}
          </h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">
            {t('signupReview.description')}
          </p>
        </div>
        {sections.map((section) => (
          <ReviewSection
            key={section.key}
            title={section.title}
            editTo={section.editTo}
            rows={section.rows}
          />
        ))}
      </div>

      {planMissing && !planChosen ? (
        <p className="text-xs font-medium text-text-danger" role="alert">
          {t('signupReview.planMissing')}{' '}
          <Link
            to={plan && plan !== 'enterprise' ? PAYMENT_ROUTE : PLANS_ROUTE}
            state={location.state}
            className="font-semibold text-primary-700 underline"
          >
            {t(plan ? 'signupReview.choosePayment' : 'signupReview.choosePlan')}
          </Link>
        </p>
      ) : null}

      <OnboardingFormError error={formError} />

      <Button type="submit" disabled={submitting} className="w-full max-w-[400px] gap-1.5">
        {submitting ? t('signupReview.submitting') : t('signupReview.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
