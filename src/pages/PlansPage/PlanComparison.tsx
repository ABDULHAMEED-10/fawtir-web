import { Fragment, useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../components/ui'
import { ChevronDownIcon } from '../../components/ui/icons'
import type { SignupCataloguePlan } from '../../lib/identity/signupPlans'
import type { BillingCycle } from '../../lib/pricing'
import { fullRial, periodPriceBaisa, planName, shortRial } from './catalogueView'
import {
  FAQ_COUNT,
  comparisonColumns,
  comparisonGroups,
  faqAnswerKey,
  faqParams,
  type Cell,
} from './comparison'
import checkIcon from '../../assets/plans/check.svg'

export function PlanComparison({
  billing,
  plans,
}: {
  billing: BillingCycle
  plans: readonly SignupCataloguePlan[]
}) {
  const { t, i18n } = useTranslation()
  const columns = comparisonColumns(plans)

  const renderCell = (cell: Cell): ReactNode => {
    switch (cell.kind) {
      case 'check':
        return (
          <img src={checkIcon} alt={t('plans.compare.included')} className="mx-auto size-[18px]" />
        )
      case 'dash':
        return (
          <span className="text-neutral-300" aria-label={t('plans.compare.notIncluded')}>
            —
          </span>
        )
      case 'money':
        return (
          <OmAmount
            size="xs"
            amount={fullRial(cell.baisa)}
            className="justify-center"
            amountClassName="text-sm font-medium text-text-primary"
          />
        )
      case 'text':
        return t(cell.key, cell.params)
    }
  }

  return (
    <div className="w-full overflow-x-auto rounded-sm border border-primary-25 bg-surface-card">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-primary-25">
            <th scope="col" className="w-[30%] px-5 py-4 text-start align-bottom">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                {t('plans.compare.columnFeature')}
              </span>
            </th>
            {columns.map((plan) => (
              <th
                key={plan?.code ?? 'enterprise'}
                scope="col"
                className={[
                  'px-4 py-4 text-center align-bottom',
                  plan?.recommended ? 'bg-primary-25/40' : '',
                ].join(' ')}
              >
                <p className="text-base font-semibold leading-[1.2] text-text-primary">
                  {plan ? planName(plan, i18n.language) : t('plans.enterprise.name')}
                </p>
                {plan ? (
                  <p className="mt-1 flex items-baseline justify-center gap-1 text-text-secondary">
                    <OmAmount
                      size="xs"
                      amount={shortRial(periodPriceBaisa(plan, billing))}
                      amountClassName="text-sm font-medium text-text-secondary"
                    />
                    <span className="text-xs">{t(billing === 'monthly' ? 'plans.perMonth' : 'plans.perYear')}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm font-medium text-text-secondary">
                    {t('plans.enterprise.price')}
                  </p>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparisonGroups(plans).map((group) => (
            <Fragment key={group.key}>
              <tr className="bg-surface-background">
                <th
                  scope="colgroup"
                  colSpan={columns.length + 1}
                  className="px-5 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-text-tertiary"
                >
                  {t(group.labelKey)}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.key} className="border-b border-primary-25 last:border-b-0">
                  <th scope="row" className="px-5 py-3 text-start font-medium text-text-primary">
                    {t(row.labelKey)}
                  </th>
                  {columns.map((plan) => (
                    <td
                      key={plan?.code ?? 'enterprise'}
                      className={[
                        'px-4 py-3 text-center text-text-secondary',
                        plan?.recommended ? 'bg-primary-25/40' : '',
                      ].join(' ')}
                    >
                      {renderCell(row.cell(plan))}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PlanFaq({ plans }: { plans: readonly SignupCataloguePlan[] | null }) {
  const { t } = useTranslation()
  const base = useId()
  const [open, setOpen] = useState<number | null>(0)
  const params = faqParams(plans)

  return (
    <div className="w-full max-w-[860px]">
      <h2 className="text-center text-2xl font-semibold leading-[1.2] text-text-primary">
        {t('plans.faq.title')}
      </h2>
      <div className="mt-4 divide-y divide-primary-25 rounded-sm border border-primary-25 bg-surface-card px-5">
        {Array.from({ length: FAQ_COUNT }, (_, i) => {
          const isOpen = open === i
          const panelId = `${base}-faq-${i}`
          return (
            <div key={i}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-4 text-start"
              >
                <span className="text-[15px] font-semibold leading-[1.3] text-text-primary">
                  {t(`plans.faq.q${i + 1}`)}
                </span>
                <ChevronDownIcon
                  size={18}
                  className={[
                    'shrink-0 text-text-tertiary transition-transform',
                    isOpen ? 'rotate-180' : '',
                  ].join(' ')}
                />
              </button>
              <div id={panelId} hidden={!isOpen} className="pb-4">
                <p className="text-sm leading-[1.6] text-text-secondary">
                  {t(faqAnswerKey(i, params), params)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
