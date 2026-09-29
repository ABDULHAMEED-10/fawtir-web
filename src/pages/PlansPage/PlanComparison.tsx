import { Fragment, useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../components/ui'
import { ChevronDownIcon } from '../../components/ui/icons'
import {
  CATALOGUE,
  FEATURES,
  FEATURE_GROUPS,
  SUBSCRIPTION_VAT,
  TRIAL,
  annualMonthly,
  type AnyPlanId,
  type CataloguePlan,
} from '../../lib/plans'
import { DEFAULT_SETTINGS, PLATFORM_SETTINGS } from '../../lib/platformSettings'
import checkIcon from '../../assets/plans/check.svg'

/*
 * The full comparison behind the four cards — the limits from `Fawtir_Pricing_Model` §6 and the
 * subscription defaults, then every feature switch in the catalogue (`plans.ts`), grouped the way
 * the console's plan editor groups them, so a buyer who wants the detail can read it without
 * leaving sign-up. A `null` plan is Enterprise: Business Plus with limits agreed on a call, so its
 * feature cells match Business Plus and its limit cells say so.
 */

export type Cell =
  | { kind: 'check' }
  | { kind: 'dash' }
  | { kind: 'text'; key: string; params?: Record<string, unknown> }
  | { kind: 'money'; amount: number }

export type Row = { key: string; labelKey: string; cell: (plan: CataloguePlan | null) => Cell }
export type Group = { key: string; labelKey: string; rows: Row[] }

const count = (value: number) => value.toLocaleString('en-US')
const check: Cell = { kind: 'check' }
const dash: Cell = { kind: 'dash' }
const text = (key: string, params?: Record<string, unknown>): Cell => ({
  kind: 'text',
  key,
  params,
})
/** A cell from the table's own vocabulary (`plans.compare.value.*`). */
const value = (key: string, params?: Record<string, unknown>) =>
  text(`plans.compare.value.${key}`, params)
const money = (amount: number): Cell => ({ kind: 'money', amount })
const flag = (on: boolean): Cell => (on ? check : dash)
/** Enterprise negotiates every figure. */
const negotiated = value('negotiated')
const agreed = value('agreed')

const planId = (plan: CataloguePlan | null): AnyPlanId => plan?.id ?? 'enterprise'

const limitRow = (key: string, cell: Row['cell']): Row => ({
  key,
  labelKey: `plans.compare.row.${key}`,
  cell,
})

/** The limits first: how much of everything a plan allows, and what more costs. */
const LIMIT_GROUPS: Group[] = [
  {
    key: 'documents',
    labelKey: 'plans.compare.group.documents',
    rows: [
      limitRow('documents', (p) => (p ? value('count', { count: count(p.documents) }) : agreed)),
      limitRow('overage', (p) => (p ? money(p.overage) : negotiated)),
    ],
  },
  {
    key: 'people',
    labelKey: 'plans.compare.group.people',
    rows: [
      limitRow('people', (p) => (p ? value('count', { count: count(p.people) }) : agreed)),
      limitRow('extraPerson', (p) => (p ? money(p.extraPerson) : negotiated)),
      limitRow('branches', (p) =>
        p
          ? p.branches
            ? value('count', { count: count(p.branches) })
            : value('unlimited')
          : agreed,
      ),
      limitRow('extraBranch', (p) =>
        p ? (p.extraBranch ? money(p.extraBranch) : value('upgrade')) : negotiated,
      ),
      limitRow('accountants', () => value('free')),
    ],
  },
]

/**
 * Then every feature, straight from the catalogue's matrix — a check where the plan has it. The
 * extraction add-on sits with the other ways in for another system, and reads the console's
 * per-plan availability rather than a flag.
 */
const FEATURE_TABLE: Group[] = FEATURE_GROUPS.map((group) => ({
  key: group.id,
  labelKey: `plan.featureGroup.${group.id}`,
  rows: [
    ...group.features.map(
      (feature): Row => ({
        key: feature,
        labelKey: `plan.featureName.${feature}`,
        cell: (p) => flag(FEATURES[planId(p)][feature]),
      }),
    ),
    ...(group.id === 'integration'
      ? [
          {
            key: 'erpExtraction',
            labelKey: 'plan.extraction.name',
            cell: (p) =>
              text(
                `plan.extraction.${PLATFORM_SETTINGS.addons.erpExtraction.availability[planId(p)]}`,
              ),
          } satisfies Row,
        ]
      : []),
  ],
}))

const SUPPORT_GROUP: Group = {
  key: 'support',
  labelKey: 'plans.compare.group.support',
  rows: [
    limitRow('support', (p) =>
      // Enterprise differs from Business Plus by limits alone, support included.
      p ? value(p.prioritySupport ? 'emailChat' : 'email') : value('emailChat'),
    ),
    limitRow('annual', (p) => (p ? value('twoMonthsFree') : negotiated)),
    limitRow('vat', () => value('vatExcl', { rate: SUBSCRIPTION_VAT * 100 })),
  ],
}

/** Also read by the public pricing page, so both tables list the same rows. */
export const GROUPS: Group[] = [...LIMIT_GROUPS, ...FEATURE_TABLE, SUPPORT_GROUP]

/** Rial figures on the table read to three places, the way the bill will print them. */
const rial = (amount: number) => amount.toFixed(3)

export const COLUMNS: (CataloguePlan | null)[] = [...CATALOGUE, null]

export function PlanComparison({ billing }: { billing: 'monthly' | 'annual' }) {
  const { t } = useTranslation()

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
            amount={rial(cell.amount)}
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
            {COLUMNS.map((plan) => {
              const id = plan ? (plan.id === 'business' ? 'premium' : plan.id) : 'enterprise'
              const popular = plan?.id === 'business'
              return (
                <th
                  key={id}
                  scope="col"
                  className={[
                    'px-4 py-4 text-center align-bottom',
                    popular ? 'bg-primary-25/40' : '',
                  ].join(' ')}
                >
                  <p className="text-base font-semibold leading-[1.2] text-text-primary">
                    {t(`plans.${id}.name`)}
                  </p>
                  {plan ? (
                    <p className="mt-1 flex items-baseline justify-center gap-1 text-text-secondary">
                      <OmAmount
                        size="xs"
                        amount={billing === 'monthly' ? plan.monthly : annualMonthly(plan)}
                        amountClassName="text-sm font-medium text-text-secondary"
                      />
                      <span className="text-xs">{t('plans.perMonth')}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-text-secondary">
                      {t('plans.enterprise.price')}
                    </p>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((group) => (
            <Fragment key={group.key}>
              <tr className="bg-surface-background">
                <th
                  scope="colgroup"
                  colSpan={COLUMNS.length + 1}
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
                  {COLUMNS.map((plan) => (
                    <td
                      key={plan?.id ?? 'enterprise'}
                      className={[
                        'px-4 py-3 text-center text-text-secondary',
                        plan?.id === 'business' ? 'bg-primary-25/40' : '',
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

export const FAQ_COUNT = 9

/** The figures the answers quote, from the platform defaults. */
export function faqParams() {
  const { notices, lifecycle } = DEFAULT_SETTINGS
  return {
    days: TRIAL.days,
    documents: TRIAL.documents,
    thresholds: notices.thresholds.join(', '),
    grace: lifecycle.graceDays,
    rate: SUBSCRIPTION_VAT * 100,
  }
}

export function PlanFaq() {
  const { t } = useTranslation()
  const base = useId()
  const [open, setOpen] = useState<number | null>(0)
  const params = faqParams()

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
                  {t(`plans.faq.a${i + 1}`, params)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
