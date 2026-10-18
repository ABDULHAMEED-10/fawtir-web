import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, OmAmount, Select } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  PLANS_PATH,
  sortCatalogue,
  type CatalogueAdminPlan,
} from '../../../lib/console/planCatalogue'
import {
  describePayLinkFailure,
  enterpriseTermsPath,
  startBilling,
  type BillingCycle,
  type EnterpriseTermsDto,
  type StartBillingDto,
} from '../../../lib/console/payLinks'
import { chargesVat } from '../../../lib/console/billingSettings'
import { OperatorReasonDialog } from '../operators/OperatorReasonDialog'
import { Field } from '../subscriptions/modalFields'

const K = 'console.payLinks.start.'
const CYCLES: BillingCycle[] = ['MONTHLY', 'ANNUAL']

/**
 * "Start billing" for a company Fawtir created, or an Enterprise company whose terms are set
 * (P2-8 §3.2): the plan and cycle, the price the server holds for them, the reason, and the
 * company code typed back as the confirmation. The server opens the lifecycle and issues the first
 * bill; nothing here computes an amount.
 *
 * An Enterprise company with terms set is billed on its own plan, so it has no plan choice and its
 * quote is the server's next-bill quote from the terms read. Any other company picks a public plan
 * and sees that plan's current price for the cycle; VAT and any paid places are added by the server
 * on the bill itself, shown once it exists.
 */
export function StartBillingDialog({
  tenantId,
  tenantCode,
  onDone,
  onClose,
}: {
  tenantId: string
  tenantCode: string
  onDone: (answer: StartBillingDto) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const terms = useConsoleRead<EnterpriseTermsDto>(enterpriseTermsPath(tenantId))
  const enterprise = terms.read.status === 'ready' && terms.read.data.state === 'TERMS_SET'
  // The plan list is needed only for a company that is not on its own Enterprise plan.
  const plansPath = terms.read.status === 'loading' || enterprise ? null : PLANS_PATH
  const plans = useConsoleRead<CatalogueAdminPlan[]>(plansPath)

  const [planCode, setPlanCode] = useState('')
  const [cycle, setCycle] = useState<BillingCycle | ''>('')
  const [typed, setTyped] = useState('')
  const [errors, setErrors] = useState<{ plan?: string; cycle?: string; confirm?: string }>({})

  const enterpriseTerms = enterprise && terms.read.status === 'ready' ? terms.read.data : null
  const termsCycle = CYCLES.find((value) => value === enterpriseTerms?.nextBill?.billingCycle)
  const chosenCycle: BillingCycle | '' = cycle || termsCycle || ''
  const offered =
    plans.read.status === 'ready'
      ? sortCatalogue(plans.read.data.filter((plan) => plan.active && plan.publicVisible))
      : []
  const chosenPlan = offered.find((plan) => plan.code === planCode) ?? null

  let fields: ReactNode
  if (terms.read.status === 'loading' || (!enterprise && plans.read.status === 'loading')) {
    fields = <ConsoleNotice busy body={t(`${K}loading`)} />
  } else if (!enterprise && plans.read.status === 'failed') {
    fields = <ConsoleReadFailure error={plans.read.error} retry={plans.retry} />
  } else {
    fields = (
      <>
        {enterpriseTerms ? (
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {t(`${K}enterprisePlan`, {
              plan:
                (i18n.language.startsWith('ar') ? enterpriseTerms.plan?.nameAr : null) ??
                enterpriseTerms.plan?.nameEn ??
                '',
            })}
          </p>
        ) : (
          <Field name="plan" label={t(`${K}plan`)} required error={errors.plan}>
            <Select
              value={planCode}
              ariaLabel={t(`${K}plan`)}
              placeholder={t(`${K}planPlaceholder`)}
              onChange={(value) => {
                setPlanCode(value)
                setErrors((current) => ({ ...current, plan: undefined }))
              }}
              options={offered.map((plan) => ({
                value: plan.code,
                label: (i18n.language.startsWith('ar') ? plan.nameAr : null) ?? plan.nameEn,
              }))}
            />
          </Field>
        )}
        {enterpriseTerms && termsCycle ? (
          // The Enterprise terms fix the cycle; the server refuses any other.
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {t(`${K}enterpriseCycle`, { cycle: t(`${K}cycleName.${termsCycle}`) })}
          </p>
        ) : (
          <Field name="cycle" label={t(`${K}cycle`)} required error={errors.cycle}>
            <Select
              value={chosenCycle}
              ariaLabel={t(`${K}cycle`)}
              placeholder={t(`${K}cyclePlaceholder`)}
              onChange={(value) => {
                setCycle(value as BillingCycle)
                setErrors((current) => ({ ...current, cycle: undefined }))
              }}
              options={CYCLES.map((value) => ({ value, label: t(`${K}cycleName.${value}`) }))}
            />
          </Field>
        )}
        <Quote enterprise={enterpriseTerms} plan={chosenPlan} cycle={chosenCycle} />
        <Input
          bordered
          name="confirm"
          label={t(`${K}confirmLabel`, { code: tenantCode })}
          requiredMark
          autoComplete="off"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value)
            setErrors((current) => ({ ...current, confirm: undefined }))
          }}
          error={errors.confirm}
        />
      </>
    )
  }

  const ready = terms.read.status !== 'loading' && (enterprise || plans.read.status === 'ready')

  return (
    <OperatorReasonDialog<StartBillingDto>
      formId="company-start-billing"
      title={t(`${K}title`)}
      body={t(enterprise ? `${K}bodyEnterprise` : `${K}body`)}
      fields={fields}
      validate={() => {
        // Still reading the plans or the terms: nothing to send yet.
        if (!ready) return 'plan'
        const next: typeof errors = {}
        if (!enterprise && !chosenPlan) next.plan = t('validation.required')
        if (!chosenCycle) next.cycle = t('validation.required')
        if (typed.trim() !== tenantCode)
          next.confirm = t(`${K}confirmMismatch`, { code: tenantCode })
        setErrors(next)
        return next.plan ? 'plan' : next.cycle ? 'cycle' : next.confirm ? 'confirm' : undefined
      }}
      confirmLabel={t(`${K}confirm`)}
      confirmingLabel={t(`${K}sending`)}
      send={(reason) =>
        startBilling(tenantId, {
          ...(enterprise ? {} : { planCode }),
          billingCycle: chosenCycle as BillingCycle,
          reason,
        })
      }
      describeFailure={describePayLinkFailure}
      onDone={onDone}
      onClose={onClose}
    />
  )
}

/** What the server holds for the choice: never a figure this screen works out itself. */
function Quote({
  enterprise,
  plan,
  cycle,
}: {
  enterprise: EnterpriseTermsDto | null
  plan: CatalogueAdminPlan | null
  cycle: BillingCycle | ''
}) {
  const { t } = useTranslation()
  if (!cycle) return null
  const row = (label: string, amount: string, strong = false) => (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="font-medium text-text-tertiary">{label}</span>
      <OmAmount
        amount={amount}
        size="xs"
        amountClassName={strong ? 'font-semibold text-text-primary' : 'font-semibold'}
      />
    </div>
  )
  if (enterprise) {
    const quote = enterprise.nextBill
    if (!quote || quote.billingCycle !== cycle) {
      return (
        <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
          {t(`${K}quoteOnBill`)}
        </p>
      )
    }
    return (
      <div className="flex flex-col gap-2 rounded-sm bg-surface-background px-4 py-3">
        {row(t(`${K}quoteExcl`), quote.amountExclVat)}
        {/* No VAT line at all while none is charged, never "VAT 0". */}
        {chargesVat(quote.vatRate) ? row(t(`${K}quoteVat`), quote.vatAmount) : null}
        {row(t(`${K}quoteTotal`), quote.amountInclVat, true)}
      </div>
    )
  }
  if (!plan) return null
  const price =
    cycle === 'ANNUAL' ? plan.currentVersion.annualPrice : plan.currentVersion.monthlyPrice
  return (
    <div className="flex flex-col gap-2 rounded-sm bg-surface-background px-4 py-3">
      {row(t(`${K}quotePlan.${cycle}`), price, true)}
      <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
        {t(`${K}quotePlanNote`)}
      </p>
    </div>
  )
}
