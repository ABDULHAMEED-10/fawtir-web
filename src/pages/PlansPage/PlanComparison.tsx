import { Fragment, useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../components/ui'
import { ChevronDownIcon } from '../../components/ui/icons'
import {
  CATALOGUE,
  SUBSCRIPTION_VAT,
  TRIAL,
  annualMonthly,
  type CataloguePlan,
} from '../../lib/plans'
import { DEFAULT_SETTINGS } from '../../lib/platformSettings'
import checkIcon from '../../assets/plans/check.svg'

/*
 * The full comparison behind the four cards — every row of `Fawtir_Pricing_Model` §6 and the
 * subscription defaults, so a buyer who wants the detail can read it without leaving sign-up.
 * A `null` plan is Enterprise: nothing is priced publicly, so its cells say so.
 */

type Cell =
  | { kind: 'check' }
  | { kind: 'dash' }
  | { kind: 'text'; key: string; params?: Record<string, unknown> }
  | { kind: 'money'; amount: number }

type Row = { key: string; cell: (plan: CataloguePlan | null) => Cell }
type Group = { key: string; rows: Row[] }

const count = (value: number) => value.toLocaleString('en-US')
const check: Cell = { kind: 'check' }
const dash: Cell = { kind: 'dash' }
const text = (key: string, params?: Record<string, unknown>): Cell => ({
  kind: 'text',
  key,
  params,
})
const money = (amount: number): Cell => ({ kind: 'money', amount })
const flag = (on: boolean): Cell => (on ? check : dash)
/** Enterprise negotiates every figure. */
const negotiated = text('negotiated')

const GROUPS: Group[] = [
  {
    key: 'documents',
    rows: [
      {
        key: 'documents',
        cell: (p) => (p ? text('count', { count: count(p.documents) }) : text('onRequest')),
      },
      { key: 'overage', cell: (p) => (p ? money(p.overage) : negotiated) },
      { key: 'peppol', cell: () => check },
      { key: 'validation', cell: () => check },
      { key: 'pos', cell: () => check },
      { key: 'archive', cell: () => check },
    ],
  },
  {
    key: 'people',
    rows: [
      {
        key: 'people',
        cell: (p) => (p ? text('count', { count: count(p.people) }) : text('unlimited')),
      },
      { key: 'extraPerson', cell: (p) => (p ? money(p.extraPerson) : negotiated) },
      {
        key: 'branches',
        cell: (p) =>
          p
            ? p.branches
              ? text('count', { count: count(p.branches) })
              : text('unlimited')
            : text('unlimited'),
      },
      {
        key: 'extraBranch',
        cell: (p) => (p ? (p.extraBranch ? money(p.extraBranch) : text('upgrade')) : negotiated),
      },
      { key: 'accountants', cell: () => text('free') },
    ],
  },
  {
    key: 'features',
    rows: [
      { key: 'rbac', cell: (p) => flag(!p || p.roleBasedAccess) },
      { key: 'recurring', cell: (p) => flag(!p || p.recurring) },
      { key: 'approvals', cell: (p) => flag(!p || p.approvals) },
      { key: 'api', cell: (p) => flag(!p || p.api) },
      { key: 'webhooks', cell: (p) => flag(!p || p.webhooks) },
      { key: 'erpMapping', cell: () => check },
      { key: 'erpExtraction', cell: (p) => (p ? text('addon') : text('included')) },
      { key: 'sso', cell: (p) => flag(!p) },
      { key: 'reports', cell: (p) => flag(!p) },
      { key: 'whiteLabel', cell: (p) => flag(!p) },
    ],
  },
  {
    key: 'support',
    rows: [
      {
        key: 'support',
        cell: (p) => (p ? text(p.prioritySupport ? 'emailChat' : 'email') : text('accountManager')),
      },
      { key: 'sla', cell: (p) => flag(!p) },
      { key: 'annual', cell: (p) => (p ? text('twoMonthsFree') : negotiated) },
      { key: 'vat', cell: () => text('vatExcl', { rate: SUBSCRIPTION_VAT * 100 }) },
    ],
  },
]

/** Rial figures on the table read to three places, the way the bill will print them. */
const rial = (amount: number) => amount.toFixed(3)

const COLUMNS: (CataloguePlan | null)[] = [...CATALOGUE, null]

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
        return t(`plans.compare.value.${cell.key}`, cell.params)
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
                  {t(`plans.compare.group.${group.key}`)}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.key} className="border-b border-primary-25 last:border-b-0">
                  <th scope="row" className="px-5 py-3 text-start font-medium text-text-primary">
                    {t(`plans.compare.row.${row.key}`)}
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

const FAQ_COUNT = 8

export function PlanFaq() {
  const { t } = useTranslation()
  const base = useId()
  const [open, setOpen] = useState<number | null>(0)
  const { notices, lifecycle } = DEFAULT_SETTINGS
  const params = {
    days: TRIAL.days,
    documents: TRIAL.documents,
    thresholds: notices.thresholds.join(', '),
    grace: lifecycle.graceDays,
    rate: SUBSCRIPTION_VAT * 100,
  }

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
