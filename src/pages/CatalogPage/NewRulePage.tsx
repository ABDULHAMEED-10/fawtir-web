import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell } from './CatalogShell'
import { Combobox, DateField, Input, Modal, Rial, Select, Switch } from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { useApiRead } from '../../hooks'
import { formatDate } from '../../lib/format'
import { muscatToday } from '../../lib/pos'
import { weekdayName } from '../../lib/catalogStock'
import {
  COUNTED_OPTIONS,
  PER_OPTIONS,
  RULE_KINDS,
  VAT_RATE,
  WEEKDAYS,
  belowCostItems,
  blankRuleForm,
  formFromRule,
  formProblems,
  omr,
  ruleRequest,
  rulesThatOverlap,
  tiersInOrder,
  tryItOut,
  type RuleForm,
  type TargetChoice,
  type TierForm,
} from '../../lib/catalogRules'
import {
  createPriceRule,
  loadPriceRule,
  loadPriceRules,
  newPriceRuleKey,
  priceRuleListPath,
  priceRulePath,
  switchPriceRule,
  updatePriceRule,
  type PriceRuleBelowCostItem,
  type PriceRuleDto,
  type PriceRuleListDto,
  type PriceRuleTargetType,
} from '../../api/catalog/priceRules'
import { getCatalogGroups, type CatalogGroupsDto } from '../../api/catalog/groups'
import {
  getProduct,
  productSearchPath,
  searchProducts,
  type ProductDto,
} from '../../api/catalog/products'
import { customerListPath, loadCustomer, loadCustomerPage } from '../../api/customers/customers'
import { BelowCostDialog, BelowCostList, PRIMARY, SECONDARY } from './PriceRuleParts'
import { usePriceRuleAccess, usePriceRuleFailureText } from './priceRuleAccess'
import bagIcon from '../../assets/catalog/kind-bag.svg'
import clockIcon from '../../assets/catalog/kind-hour.svg'
import usersIcon from '../../assets/catalog/kpi-customers.svg'
import giftIcon from '../../assets/catalog/kind-bundle.svg'
import tickIcon from '../../assets/catalog/check-green.svg'
import crossIcon from '../../assets/catalog/cross-danger.svg'
import plusIcon from '../../assets/catalog/plus-muted.svg'
import trashIcon from '../../assets/catalog/trash-danger.svg'
import tickWhiteIcon from '../../assets/catalog/check-white.svg'

const KIND_ICON: Record<string, string> = {
  VOLUME: bagIcon,
  TIME: clockIcon,
  CUSTOMER: usersIcon,
  BUY_ONE_GET: giftIcon,
}

/** Every half hour; "24:00" closes a window at midnight. */
const TIMES = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2)
  return `${String(hour).padStart(2, '0')}:${index % 2 ? '30' : '00'}`
})

const TARGET_TYPES: PriceRuleTargetType[] = ['ALL', 'GROUP', 'KIND', 'PRODUCT', 'VARIANT']

/**
 * A new price rule, or a change to one (Figma 135:51027), saved to `/v1/price-rules`.
 *
 * - A new rule is always saved off (`POST`, with an Idempotency-Key kept while the rule is the
 *   same, so a retry never makes a second one). "Switch it on" then switches it on.
 * - A change replaces the whole rule (`PUT ?expectedVersion=`); its on/off and pause are kept.
 * - Below cost is the server's check against each item's average cost: saving is never refused
 *   and the items come back in `belowCost[]`; going live asks again (422 PRICE_RULE_BELOW_COST)
 *   and "Go live anyway" sends the same request with `acknowledgeBelowCost: true`.
 * - "Buy one, get something", counting per month or year and stacking are drawn as Coming later
 *   and cannot be picked (Abdul, 28 Oct 2026; INCOME.md rows P.32 to P.34).
 */
export function NewRulePage() {
  const { t } = useTranslation()
  const { ruleId } = useParams()
  const [search] = useSearchParams()
  const copyId = search.get('copy')
  const access = usePriceRuleAccess()
  const sourceId = ruleId ?? copyId
  const sourcePath = access.canManage && sourceId ? priceRulePath(sourceId) : null
  const source = useApiRead<PriceRuleDto>(sourcePath, () => loadPriceRule(sourcePath!))
  const editing = Boolean(ruleId)

  const shell = (body: React.ReactNode) => (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'priceRules.title', to: '/catalog/rules' },
        { labelKey: editing ? 'newRule.editCrumb' : 'priceRules.newRule' },
      ]}
      title={editing ? t('newRule.editTitle') : t('newRule.title')}
      subtitle={t('newRule.subtitle')}
    >
      {body}
    </CatalogShell>
  )

  if (!access.ready) return shell(<LoadingNotice />)
  if (!access.canManage) return shell(<PermissionDeniedNotice />)
  if (sourceId) {
    if (source.read.status === 'loading') return shell(<LoadingNotice />)
    if (source.read.status === 'failed')
      return shell(<ApiReadFailure error={source.read.error} retry={source.retry} />)
    const rule = source.read.data
    return (
      <RuleEditor
        key={rule.id}
        shell={shell}
        editing={editing ? rule : null}
        start={(() => {
          const form = formFromRule(rule, muscatToday())
          return editing ? form : { ...form, name: t('newRule.copyName', { name: rule.name }) }
        })()}
      />
    )
  }
  return <RuleEditor shell={shell} editing={null} start={blankRuleForm(muscatToday())} />
}

function RuleEditor({
  shell,
  editing,
  start,
}: {
  shell: (body: React.ReactNode) => React.ReactElement
  editing: PriceRuleDto | null
  start: RuleForm
}) {
  const { t, i18n } = useTranslation()
  const ar = i18n.language.startsWith('ar')
  const navigate = useNavigate()
  const failureText = usePriceRuleFailureText()
  const { branches } = useWorkingBranch()
  const [form, setForm] = useState<RuleForm>(start)
  const [saved, setSaved] = useState<PriceRuleDto | null>(editing)
  const [belowCost, setBelowCost] = useState<PriceRuleBelowCostItem[]>([])
  const [asked, setAsked] = useState<{ items: PriceRuleBelowCostItem[]; goLive: boolean } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [quantity, setQuantity] = useState('12')
  const [normalText, setNormalText] = useState('1.000')
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)

  const change = (patch: Partial<RuleForm>) => setForm((current) => ({ ...current, ...patch }))
  const setTier = (index: number, patch: Partial<TierForm>) =>
    change({ tiers: form.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)) })

  /* ------------------------------------------- names for what is already chosen */
  const groups = useApiRead<CatalogGroupsDto>('/v1/catalog/groups', getCatalogGroups)
  const groupList = groups.read.status === 'ready' ? groups.read.data.groups : []
  const [products, setProducts] = useState<Record<string, ProductDto>>({})
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({})
  const productIds = form.targets
    .map((target) =>
      target.type === 'PRODUCT' ? target.id : target.type === 'VARIANT' ? target.productId : null,
    )
    .filter((id): id is string => Boolean(id))
  const missingProducts = productIds.filter((id) => !products[id]).join(',')
  useEffect(() => {
    if (!missingProducts) return
    let live = true
    Promise.all(missingProducts.split(',').map((id) => getProduct(id).catch(() => null))).then(
      (found) => {
        if (!live) return
        setProducts((current) => ({
          ...current,
          ...Object.fromEntries(found.filter(Boolean).map((p) => [p!.id, p!])),
        }))
      },
    )
    return () => {
      live = false
    }
  }, [missingProducts])
  const missingCustomers = form.customers
    .filter((c) => !c.label && !customerNames[c.id])
    .map((c) => c.id)
    .join(',')
  useEffect(() => {
    if (!missingCustomers) return
    let live = true
    Promise.all(
      missingCustomers.split(',').map((id) =>
        loadCustomer(id).then(
          (customer) => [id, customer.displayName] as const,
          () => [id, ''] as const,
        ),
      ),
    ).then((found) => {
      if (live) setCustomerNames((current) => ({ ...current, ...Object.fromEntries(found) }))
    })
    return () => {
      live = false
    }
  }, [missingCustomers])

  const name = (entry: { name: string; nameAr?: string | null }) =>
    ar && entry.nameAr ? entry.nameAr : entry.name
  const targetLabel = (target: TargetChoice): string => {
    if (target.label) return target.label
    if (target.type === 'ALL') return t('newRule.target.everything')
    if (target.type === 'GROUP') {
      const group = groupList.find((g) => g.id === target.id)
      return group ? name(group) : '…'
    }
    if (target.type === 'KIND') {
      for (const group of groupList) {
        const kind = group.kinds.find((k) => k.id === target.id)
        if (kind) return `${name(group)} › ${name(kind)}`
      }
      return '…'
    }
    const product = products[(target.type === 'VARIANT' ? target.productId : target.id) ?? '']
    if (!product) return '…'
    if (target.type === 'PRODUCT') return name(product)
    const variant = (product.variants ?? []).find((v) => v.id === target.id)
    return variant ? `${name(product)} · ${variant.name}` : name(product)
  }

  /* --------------------------------------------------------- the rest of the form */
  const firstProduct = productIds.map((id) => products[id]).find(Boolean)
  useEffect(() => {
    const price = firstProduct?.defaultUnitPrice
    if (price !== null && price !== undefined) setNormalText(price.toFixed(3))
  }, [firstProduct?.id, firstProduct?.defaultUnitPrice])
  const normalPrice = Number(normalText) || 0
  const qty = Number(quantity) || 0
  const trial = useMemo(
    () => tryItOut(qty, form.tiers, normalPrice),
    [qty, form.tiers, normalPrice],
  )

  const others = useApiRead<PriceRuleListDto>(priceRuleListPath({}), () =>
    loadPriceRules(priceRuleListPath({})),
  )
  const clashes = rulesThatOverlap(
    form.targets,
    others.read.status === 'ready' ? others.read.data.items : [],
    saved?.id ?? null,
  ).filter((entry) => entry.shared > 0)

  const problems = formProblems(form)
  const inOrder = form.kind !== 'VOLUME' || tiersInOrder(form.tiers)
  const losing = new Set(belowCost.flatMap((item) => item.fromQtys))
  const live = Boolean(saved && (saved.enabled || saved.pausedUntil))

  /* ------------------------------------------------------------------ saving */
  const persist = async (acknowledge: boolean): Promise<PriceRuleDto | null> => {
    const body = ruleRequest(form, acknowledge)
    if (saved) return updatePriceRule(saved.id, saved.version, body)
    // A retried create is the same create: the same key while the rule is unchanged.
    const fingerprint = JSON.stringify(ruleRequest(form))
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: newPriceRuleKey() }
    }
    return createPriceRule(attempt.current.key, body)
  }

  const save = async (goLive: boolean, acknowledge = false) => {
    if (problems.length > 0) {
      setProblem(t('newRule.fixFirst'))
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      let rule = saved
      // A rule that is on is live as soon as it is changed: the edit itself carries the answer.
      const savingNeeded =
        !saved ||
        JSON.stringify(ruleRequest(form)) !==
          JSON.stringify(ruleRequest(formFromRule(saved, muscatToday())))
      if (savingNeeded || !goLive) {
        rule = await persist(acknowledge)
        if (!rule) return
        setSaved(rule)
        setBelowCost(rule.belowCost ?? [])
      }
      if (goLive && rule && !rule.enabled) {
        rule = await switchPriceRule(rule.id, rule.version, {
          enabled: true,
          ...(acknowledge ? { acknowledgeBelowCost: true } : {}),
        })
        setSaved(rule)
      }
      setAsked(null)
      // Saved off with items below cost: the warning stays on the screen before leaving.
      if (!goLive && rule && (rule.belowCost ?? []).length > 0) return
      navigate('/catalog/rules')
    } catch (error) {
      const items = belowCostItems(error)
      if (items) setAsked({ items, goLive })
      else setProblem(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  const dayLabel = (index: number) =>
    i18n.language.startsWith('en') ? WEEKDAYS[index] : weekdayName(index, i18n.language, 'short')

  return shell(
    <>
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Step n={1} title={t('newRule.step.kind')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {RULE_KINDS.map((entry) => {
                const picked = entry.id === form.kind
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={entry.comingLater}
                    onClick={() =>
                      entry.comingLater ? undefined : change({ kind: entry.id as RuleForm['kind'] })
                    }
                    aria-pressed={picked}
                    className={[
                      'flex items-start gap-3 rounded-sm border p-4 text-start transition-colors',
                      entry.comingLater
                        ? 'cursor-not-allowed border-border-subtle bg-surface-background/60 opacity-70'
                        : picked
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:bg-primary-25',
                    ].join(' ')}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-background">
                      <img src={KIND_ICON[entry.id]} alt="" className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={[
                          'flex flex-wrap items-center gap-2 text-sm font-semibold',
                          picked ? 'text-primary-800' : 'text-text-primary',
                        ].join(' ')}
                      >
                        {t(entry.titleKey)}
                        {entry.comingLater ? <ComingLater /> : null}
                      </span>
                      <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-quaternary">
                        {t(entry.noteKey)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </Step>

          <Step n={2} title={t('newRule.step.name')}>
            <div className="grid gap-5">
              <Input
                bordered
                label={t('newRule.name')}
                requiredMark
                maxLength={80}
                value={form.name}
                onChange={(event) => change({ name: event.target.value })}
              />

              <div>
                <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                  {t('newRule.whatItAppliesTo')}
                  <span className="text-danger-700">*</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {form.targets.map((target, index) => (
                    <span
                      key={`${target.type}-${target.id ?? 'all'}`}
                      className="inline-flex h-[38px] max-w-full items-center gap-2 rounded-sm border border-primary-100 bg-primary-25 px-3"
                    >
                      <span className="truncate text-sm font-medium text-primary-800">
                        {targetLabel(target)}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-text-quaternary">
                        {t(`newRule.target.type.${target.type}`)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          change({ targets: form.targets.filter((_, i) => i !== index) })
                        }
                        aria-label={t('newRule.removeScope')}
                        className="relative text-text-quaternary transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-danger-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {form.targets.some((target) => target.type === 'ALL') ? null : (
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="inline-flex h-[38px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                    >
                      <img src={plusIcon} alt="" className="size-4" />
                      {t('newRule.addSomething')}
                    </button>
                  )}
                </span>
              </div>

              {form.kind === 'VOLUME' ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                      {t('newRule.counted')}
                    </span>
                    <Select
                      quiet
                      ariaLabel={t('newRule.counted')}
                      value={form.countedAs}
                      onChange={(value) => change({ countedAs: value as RuleForm['countedAs'] })}
                      options={COUNTED_OPTIONS.map((entry) => ({
                        value: entry.id,
                        label: t(entry.labelKey),
                      }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                      {t('newRule.per')}
                    </span>
                    {/* Per one month and per one year are Coming later (row P.33). */}
                    <Select
                      quiet
                      ariaLabel={t('newRule.per')}
                      value="INVOICE"
                      onChange={() => undefined}
                      options={PER_OPTIONS.map((entry) => ({
                        value: entry.id,
                        label: entry.comingLater
                          ? `${t(entry.labelKey)} (${t('priceRules.comingLater')})`
                          : t(entry.labelKey),
                        disabled: entry.comingLater,
                      }))}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </Step>

          {form.kind === 'VOLUME' ? (
            <Step n={3} title={t('newRule.step.breaks')}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="whitespace-nowrap bg-[#151c2d] text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                      <th className="h-[38px] px-3 text-start font-semibold">
                        {t('newRule.col.from')}
                      </th>
                      <th className="h-[38px] px-3 text-start font-semibold">
                        {t('newRule.col.upTo')}
                      </th>
                      <th className="h-[38px] px-3 text-start font-semibold">
                        {t('newRule.col.how')}
                      </th>
                      <th className="h-[38px] px-3 text-end font-semibold">
                        {t('newRule.col.value')}
                      </th>
                      <th className="h-[38px] px-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.tiers.map((tier, index) => {
                      const bad = losing.has(tier.from)
                      return (
                        <tr
                          key={index}
                          className={[
                            'border-b border-surface-background last:border-0',
                            bad ? 'bg-[#fdf4f2]' : '',
                          ].join(' ')}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              value={tier.from}
                              onChange={(event) =>
                                setTier(index, {
                                  from: Number(event.target.value.replace(/\D/g, '')) || 0,
                                })
                              }
                              onFocus={selectAllOnFocus}
                              inputMode="numeric"
                              aria-label={t('newRule.col.from')}
                              className="h-[42px] w-full rounded-sm border border-border-default bg-white px-3 text-sm font-medium text-text-primary outline-none focus:border-border-brand"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              value={tier.to ?? ''}
                              placeholder={t('newRule.noLimit')}
                              onChange={(event) => {
                                const raw = event.target.value.replace(/\D/g, '')
                                setTier(index, { to: raw === '' ? null : Number(raw) })
                              }}
                              onFocus={selectAllOnFocus}
                              inputMode="numeric"
                              aria-label={t('newRule.col.upTo')}
                              className="h-[42px] w-full rounded-sm border border-border-default bg-white px-3 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <Select
                              compact
                              ariaLabel={t('newRule.col.how')}
                              value={tier.mode}
                              onChange={(mode) =>
                                setTier(index, { mode: mode as TierForm['mode'] })
                              }
                              options={[
                                { value: 'percent', label: t('newRule.mode.percent') },
                                { value: 'price', label: t('newRule.mode.price') },
                              ]}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              value={tier.value}
                              onChange={(event) =>
                                setTier(index, { value: event.target.value.replace(/[^\d.]/g, '') })
                              }
                              onFocus={selectAllOnFocus}
                              inputMode="decimal"
                              aria-label={t('newRule.col.value')}
                              className={[
                                'h-[42px] w-full rounded-sm border px-3 text-end text-sm font-semibold outline-none',
                                bad
                                  ? 'border-danger-700 bg-danger-100 text-danger-700'
                                  : 'border-border-default bg-white text-text-primary focus:border-border-brand',
                              ].join(' ')}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-end">
                            <button
                              type="button"
                              disabled={form.tiers.length === 1}
                              onClick={() =>
                                change({ tiers: form.tiers.filter((_, i) => i !== index) })
                              }
                              aria-label={t('newRule.removeBreak')}
                              className="inline-flex size-8 items-center justify-center rounded-sm transition-colors hover:bg-danger-100 disabled:opacity-30"
                            >
                              <img src={trashIcon} alt="" className="size-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                disabled={form.tiers.length >= 20}
                onClick={() => {
                  const last = form.tiers[form.tiers.length - 1]
                  const end = last ? (last.to ?? last.from + 9) : 0
                  change({
                    tiers: [
                      ...form.tiers.map((tier, i) =>
                        i === form.tiers.length - 1 && tier.to === null
                          ? { ...tier, to: end }
                          : tier,
                      ),
                      { from: end + 1, to: null, mode: last?.mode ?? 'percent', value: '0' },
                    ],
                  })
                }}
                className="mt-3 inline-flex h-[38px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-40"
              >
                <img src={plusIcon} alt="" className="size-4" />
                {t('newRule.addABreak')}
              </button>

              <div className="mt-4 flex items-center justify-between gap-4 border-t border-surface-background pt-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                    {t('newRule.extrasOnly')}
                  </p>
                  <p className="mt-1 max-w-[600px] text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('newRule.extrasOnlyNote', {
                      count: form.tiers[0]?.to ?? 9,
                      next: (form.tiers[0]?.to ?? 9) + 1,
                    })}
                  </p>
                </div>
                <Switch
                  checked={form.extrasOnly}
                  onChange={(extrasOnly) => change({ extrasOnly })}
                  label={t('newRule.extrasOnly')}
                />
              </div>
            </Step>
          ) : (
            <Step
              n={3}
              title={form.kind === 'TIME' ? t('newRule.step.when3') : t('newRule.step.who')}
            >
              <div className="grid gap-5">
                {form.kind === 'TIME' ? (
                  <>
                    {form.windows.map((window, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-3 rounded-sm border border-border-subtle p-4"
                      >
                        <span
                          className="flex flex-wrap gap-1.5"
                          role="group"
                          aria-label={t('newRule.days')}
                        >
                          {WEEKDAYS.map((day, dayIndex) => {
                            const picked = window.days.includes(dayIndex)
                            return (
                              <button
                                key={day}
                                type="button"
                                aria-pressed={picked}
                                onClick={() =>
                                  change({
                                    windows: form.windows.map((w, i) =>
                                      i === index
                                        ? {
                                            ...w,
                                            days: picked
                                              ? w.days.filter((d) => d !== dayIndex)
                                              : [...w.days, dayIndex],
                                          }
                                        : w,
                                    ),
                                  })
                                }
                                className={[
                                  'inline-flex h-[34px] min-w-[38px] items-center justify-center rounded-sm border px-2 text-xs font-semibold',
                                  picked
                                    ? 'border-primary-700 bg-primary-50 text-primary-800'
                                    : 'border-border-subtle bg-white text-text-tertiary',
                                ].join(' ')}
                              >
                                {dayLabel(dayIndex)}
                              </button>
                            )
                          })}
                        </span>
                        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
                          <label className="block min-w-0">
                            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                              {t('newRule.fromTime')}
                            </span>
                            <Select
                              quiet
                              ariaLabel={t('newRule.fromTime')}
                              value={window.from}
                              onChange={(from) =>
                                change({
                                  windows: form.windows.map((w, i) =>
                                    i === index ? { ...w, from } : w,
                                  ),
                                })
                              }
                              options={TIMES.map((time) => ({ value: time, label: time }))}
                            />
                          </label>
                          <label className="block min-w-0">
                            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                              {t('newRule.toTime')}
                            </span>
                            <Select
                              quiet
                              ariaLabel={t('newRule.toTime')}
                              value={window.to}
                              onChange={(to) =>
                                change({
                                  windows: form.windows.map((w, i) =>
                                    i === index ? { ...w, to } : w,
                                  ),
                                })
                              }
                              options={[...TIMES.slice(1), '24:00'].map((time) => ({
                                value: time,
                                label: time,
                              }))}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={form.windows.length === 1}
                            onClick={() =>
                              change({ windows: form.windows.filter((_, i) => i !== index) })
                            }
                            aria-label={t('newRule.removeWindow')}
                            className="inline-flex size-[42px] items-center justify-center rounded-sm transition-colors hover:bg-danger-100 disabled:opacity-30"
                          >
                            <img src={trashIcon} alt="" className="size-4" />
                          </button>
                        </div>
                        {window.to <= window.from && window.to !== '24:00' ? (
                          <p className="text-xs font-medium text-text-quaternary">
                            {t('newRule.passesMidnight')}
                          </p>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={form.windows.length >= 14}
                      onClick={() =>
                        change({
                          windows: [
                            ...form.windows,
                            { days: [0, 1, 2, 3, 4], from: '18:00', to: '22:00' },
                          ],
                        })
                      }
                      className="inline-flex h-[38px] w-max items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-40"
                    >
                      <img src={plusIcon} alt="" className="size-4" />
                      {t('newRule.addWindow')}
                    </button>
                    <p className="text-xs font-medium text-text-quaternary">
                      {t('newRule.muscatTime')}
                    </p>
                  </>
                ) : (
                  <CustomerPicker
                    customers={form.customers.map((c) => ({
                      ...c,
                      label: c.label || customerNames[c.id] || '…',
                    }))}
                    tags={form.tags}
                    onCustomers={(customers) => change({ customers })}
                    onTags={(tags) => change({ tags })}
                  />
                )}

                <div className="grid gap-5 border-t border-surface-background pt-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                      {t('newRule.offer')}
                    </span>
                    <Select
                      quiet
                      ariaLabel={t('newRule.offer')}
                      value={form.offerMode}
                      onChange={(mode) => change({ offerMode: mode as RuleForm['offerMode'] })}
                      options={[
                        { value: 'percent', label: t('newRule.mode.percent') },
                        { value: 'price', label: t('newRule.mode.price') },
                      ]}
                    />
                  </label>
                  <Input
                    bordered
                    label={
                      form.offerMode === 'percent'
                        ? t('newRule.percentOff')
                        : t('newRule.priceEach')
                    }
                    requiredMark
                    inputMode="decimal"
                    value={form.offerValue}
                    onFocus={selectAllOnFocus}
                    onChange={(event) =>
                      change({ offerValue: event.target.value.replace(/[^\d.]/g, '') })
                    }
                  />
                </div>
              </div>
            </Step>
          )}

          <Step n={4} title={t('newRule.step.when')} flush>
            <div className="grid gap-5 p-5 pt-0 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  {t('newRule.starts')}
                </span>
                <DateField
                  value={form.validFrom}
                  onChange={(validFrom) => change({ validFrom })}
                  ariaLabel={t('newRule.starts')}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-text-secondary">
                  {t('newRule.ends')}
                  <span className="font-normal text-text-quaternary">{t('newRule.endsHint')}</span>
                </span>
                <DateField
                  value={form.validTo}
                  onChange={(validTo) => change({ validTo })}
                  min={form.validFrom || undefined}
                  placeholder={t('newRule.noEndDate')}
                  ariaLabel={t('newRule.ends')}
                />
              </label>
              <Input
                bordered
                label={t('newRule.priority')}
                hint={t('newRule.priorityHint')}
                inputMode="numeric"
                value={form.priority}
                onFocus={selectAllOnFocus}
                onChange={(event) =>
                  change({ priority: event.target.value.replace(/\D/g, '').slice(0, 4) })
                }
              />
              <div>
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  {t('newRule.branches')}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    aria-pressed={form.branchIds.length === 0}
                    onClick={() => change({ branchIds: [] })}
                    className={chip(form.branchIds.length === 0)}
                  >
                    {t('newRule.everyBranch')}
                  </button>
                  {branches.map((branch) => {
                    const picked = form.branchIds.includes(branch.id)
                    return (
                      <button
                        key={branch.id}
                        type="button"
                        aria-pressed={picked}
                        onClick={() =>
                          change({
                            branchIds: picked
                              ? form.branchIds.filter((id) => id !== branch.id)
                              : [...form.branchIds, branch.id],
                          })
                        }
                        className={chip(picked)}
                      >
                        <bdi>{ar && branch.nameAr ? branch.nameAr : branch.name}</bdi>
                      </button>
                    )
                  })}
                </span>
              </div>
            </div>

            <ul>
              {/* TODO(backend): stacking is refused in the first version; always sent false
                  (Abdul, 28 Oct 2026; INCOME.md row P.34). */}
              <ToggleRow
                title={t('newRule.stacks')}
                note={t('newRule.stacksNote')}
                checked={false}
                onChange={() => undefined}
                comingLater
              />
              <ToggleRow
                title={t('newRule.showOnInvoice')}
                note={t('newRule.showOnInvoiceNote')}
                checked={form.showOnInvoice}
                onChange={(showOnInvoice) => change({ showOnInvoice })}
              />
              <ToggleRow
                title={t('newRule.atTheTill')}
                note={t('newRule.atTheTillNote')}
                checked={form.atTheTill}
                onChange={(atTheTill) => change({ atTheTill })}
              />
            </ul>
          </Step>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[300px] xl:shrink-0">
          {form.kind === 'VOLUME' ? (
            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('newRule.tryItOut')}
              </h3>
              <div className="mt-3 overflow-hidden rounded-sm border border-border-subtle">
                <p className="bg-[#151c2d] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                  {t('newRule.ifSomeoneBought')}
                </p>
                <div className="bg-white p-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <input
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))}
                      onFocus={selectAllOnFocus}
                      inputMode="numeric"
                      aria-label={t('newRule.ifSomeoneBought')}
                      className="h-[38px] w-[64px] rounded-sm border border-border-default bg-white px-2 text-center text-sm font-semibold text-text-primary outline-none focus:border-border-brand"
                    />
                    <span className="text-sm font-medium text-text-tertiary">
                      {t('newRule.atEach')}
                    </span>
                    <input
                      value={normalText}
                      onChange={(event) => setNormalText(event.target.value.replace(/[^\d.]/g, ''))}
                      onFocus={selectAllOnFocus}
                      inputMode="decimal"
                      aria-label={t('newRule.normalPrice')}
                      className="h-[38px] w-[84px] rounded-sm border border-border-default bg-white px-2 text-center text-sm font-semibold text-text-primary outline-none focus:border-border-brand"
                    />
                  </p>

                  <dl className="mt-3">
                    <Line label={t('newRule.normally')} value={omr(trial.normally)} />
                    <Line
                      label={t('newRule.withThisRule', { price: omr(trial.each) })}
                      value={omr(trial.withRule)}
                    />
                    <Line
                      label={t('newRule.theySave')}
                      value={`−${omr(trial.save)} · ${trial.savePercent}%`}
                      tone="good"
                    />
                    <Line
                      label={t('newRule.vat', { rate: VAT_RATE * 100 })}
                      value={omr(trial.vat)}
                    />
                  </dl>

                  <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-border-subtle pt-2 text-sm font-semibold text-text-primary">
                    <span>{t('newRule.theyPay')}</span>
                    <span className="tabular-nums">
                      <span className="me-1">
                        <Rial />
                      </span>
                      {omr(trial.pay)}
                    </span>
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('newRule.readyToSwitchOn')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              <Check
                state={form.name.trim() && form.targets.length ? 'yes' : 'no'}
                label={
                  form.name.trim() && form.targets.length
                    ? t('newRule.check.named', { count: form.targets.length })
                    : t('newRule.check.unnamed')
                }
              />
              {form.kind === 'VOLUME' ? (
                <Check
                  state={inOrder ? 'yes' : 'bad'}
                  label={
                    inOrder ? t('newRule.check.breaksInOrder') : t('newRule.check.breaksOverlap')
                  }
                />
              ) : null}
              <Check
                state={!saved ? 'no' : belowCost.length ? 'bad' : 'yes'}
                label={
                  !saved
                    ? t('newRule.check.costOnSave')
                    : belowCost.length
                      ? t('newRule.check.belowCost', { count: belowCost.length })
                      : t('newRule.check.aboveCost')
                }
              />
              <Check
                state="no"
                label={
                  form.validTo
                    ? t('newRule.check.hasEndDate', {
                        date: formatDate(form.validTo, i18n.language),
                      })
                    : t('newRule.check.noEndDate')
                }
              />
            </ul>
            {saved?.belowCostAcknowledged ? (
              <p className="mt-3 text-xs font-medium text-text-quaternary">
                {t('newRule.acknowledged', {
                  date: formatDate(saved.belowCostAcknowledged.at.slice(0, 10), i18n.language),
                })}
              </p>
            ) : null}
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('newRule.clashes')}
            </h3>
            {clashes.length === 0 ? (
              <p className="mt-2 text-sm font-medium text-text-quaternary">
                {t('newRule.noClashes')}
              </p>
            ) : (
              <dl className="mt-2">
                {clashes.map((clash, index) => (
                  <div
                    key={clash.rule.id}
                    className={[
                      'flex items-center justify-between gap-3 py-2.5',
                      index < clashes.length - 1 ? 'border-b border-surface-background' : '',
                    ].join(' ')}
                  >
                    <dt className="min-w-0 break-words text-sm font-medium text-text-tertiary">
                      {clash.rule.name}
                    </dt>
                    <dd className="shrink-0 text-sm font-medium text-pending-700">
                      {t('newRule.coversNOfYours', { count: clash.shared })}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-2 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('newRule.clashesNote')}
            </p>
          </section>
        </aside>
      </div>

      {belowCost.length > 0 ? (
        <section role="status" className="rounded-md bg-surface-card p-5">
          <h3 className="text-base font-semibold text-danger-700">
            {t('newRule.savedBelowCost', { count: belowCost.length })}
          </h3>
          <p className="mt-1 text-xs font-medium text-text-tertiary">
            {t('newRule.savedBelowCostNote')}
          </p>
          <div className="mt-3">
            <BelowCostList items={belowCost} branches={branches} />
          </div>
        </section>
      ) : null}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="min-w-0 text-sm font-medium text-text-tertiary">
          {problem ? (
            <span role="alert" className="text-danger-700">
              {problem}
            </span>
          ) : problems.length ? (
            t(problems[0])
          ) : saved ? (
            saved.enabled ? (
              t('newRule.footerOn')
            ) : (
              t('newRule.footerSavedOff')
            )
          ) : (
            t('newRule.footerNew')
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link to="/catalog/rules" className={SECONDARY}>
            {t('newRule.cancel')}
          </Link>
          {live ? null : (
            <button type="button" disabled={busy} onClick={() => save(false)} className={SECONDARY}>
              {t('newRule.saveWithoutSwitchingOn')}
            </button>
          )}
          <button
            type="button"
            disabled={busy || problems.length > 0}
            onClick={() => save(true)}
            className={PRIMARY}
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {live ? t('newRule.saveChanges') : t('newRule.switchItOn')}
          </button>
        </div>
      </div>

      <TargetPicker
        open={adding}
        groups={groupList}
        onClose={() => setAdding(false)}
        onAdd={(target) => {
          setAdding(false)
          if (target.type === 'ALL') change({ targets: [target] })
          else if (!form.targets.some((t2) => t2.type === target.type && t2.id === target.id))
            change({ targets: [...form.targets, target].slice(0, 200) })
        }}
      />
      <BelowCostDialog
        items={asked?.items ?? null}
        branches={branches}
        busy={busy}
        onCancel={() => setAsked(null)}
        onGoLive={() => asked && save(asked.goLive, true)}
      />
    </>,
  )
}

/** "Add something": everything, a group, a kind, an item or one of its sizes. */
function TargetPicker({
  open,
  groups,
  onClose,
  onAdd,
}: {
  open: boolean
  groups: CatalogGroupsDto['groups']
  onClose: () => void
  onAdd: (target: TargetChoice) => void
}) {
  const { t, i18n } = useTranslation()
  const ar = i18n.language.startsWith('ar')
  const name = (entry: { name: string; nameAr?: string | null }) =>
    ar && entry.nameAr ? entry.nameAr : entry.name
  const [type, setType] = useState<PriceRuleTargetType>('PRODUCT')
  const [picked, setPicked] = useState('')
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<ProductDto[]>([])
  const [product, setProduct] = useState<ProductDto | null>(null)
  useEffect(() => {
    if (!open || (type !== 'PRODUCT' && type !== 'VARIANT')) return
    let live = true
    const id = window.setTimeout(() => {
      searchProducts(productSearchPath(query, 25)).then(
        (page) => live && setFound(page.items),
        () => live && setFound([]),
      )
    }, 250)
    return () => {
      live = false
      window.clearTimeout(id)
    }
  }, [open, type, query])
  useEffect(() => {
    if (type !== 'VARIANT' || !picked) return
    let live = true
    getProduct(picked).then(
      (detail) => live && setProduct(detail),
      () => live && setProduct(null),
    )
    return () => {
      live = false
    }
  }, [type, picked])
  const [variant, setVariant] = useState('')

  const options =
    type === 'GROUP'
      ? groups.map((g) => ({ value: g.id, label: name(g) }))
      : type === 'KIND'
        ? groups.flatMap((g) =>
            g.kinds.map((k) => ({ value: k.id, label: `${name(g)} › ${name(k)}` })),
          )
        : found.map((p) => ({ value: p.id, label: name(p), hint: p.code }))
  const label = options.find((option) => option.value === picked)?.label ?? ''
  const variants = (product?.variants ?? []).filter((v) => v.onSale)
  const ready =
    type === 'ALL' || (type === 'VARIANT' ? Boolean(picked && variant) : Boolean(picked))

  const add = () => {
    if (type === 'ALL') onAdd({ type, id: null, label: t('newRule.target.everything') })
    else if (type === 'VARIANT') {
      const chosen = variants.find((v) => v.id === variant)
      onAdd({
        type,
        id: variant,
        productId: picked,
        label: chosen ? `${label} · ${chosen.name}` : label,
      })
    } else onAdd({ type, id: picked, label })
    setPicked('')
    setVariant('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('newRule.addSomething')}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" onClick={onClose} className={SECONDARY}>
            {t('priceRules.cancel')}
          </button>
          <button type="button" disabled={!ready} onClick={add} className={PRIMARY}>
            {t('newRule.add')}
          </button>
        </div>
      }
    >
      <div className="grid gap-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-text-secondary">
            {t('newRule.target.what')}
          </span>
          <Select
            quiet
            ariaLabel={t('newRule.target.what')}
            value={type}
            onChange={(value) => {
              setType(value as PriceRuleTargetType)
              setPicked('')
              setVariant('')
            }}
            options={TARGET_TYPES.map((value) => ({
              value,
              label: t(`newRule.target.pick.${value}`),
            }))}
          />
        </label>
        {type === 'ALL' ? (
          <p className="text-sm font-medium text-text-tertiary">{t('newRule.target.allNote')}</p>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
              {t(`newRule.target.type.${type === 'VARIANT' ? 'PRODUCT' : type}`)}
            </span>
            <Combobox
              value={picked}
              onChange={setPicked}
              options={options}
              ariaLabel={t(`newRule.target.type.${type === 'VARIANT' ? 'PRODUCT' : type}`)}
              placeholder={t('newRule.target.choose')}
              emptyText={t('newRule.target.none')}
              onSearch={type === 'PRODUCT' || type === 'VARIANT' ? setQuery : undefined}
            />
          </label>
        )}
        {type === 'VARIANT' && picked ? (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-text-secondary">
              {t('newRule.target.type.VARIANT')}
            </span>
            <Select
              quiet
              ariaLabel={t('newRule.target.type.VARIANT')}
              value={variant}
              onChange={setVariant}
              placeholder={
                variants.length ? t('newRule.target.choose') : t('newRule.target.noSizes')
              }
              options={variants.map((v) => ({ value: v.id, label: v.name }))}
            />
          </label>
        ) : null}
      </div>
    </Modal>
  )
}

/** Named customers (searched) and customer tags, matched ignoring case. */
function CustomerPicker({
  customers,
  tags,
  onCustomers,
  onTags,
}: {
  customers: { id: string; label: string }[]
  tags: string[]
  onCustomers: (customers: { id: string; label: string }[]) => void
  onTags: (tags: string[]) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const [tag, setTag] = useState('')
  useEffect(() => {
    let live = true
    const id = window.setTimeout(() => {
      loadCustomerPage(
        customerListPath({ type: null, search: query, sort: 'NAME_ASC', page: 0, size: 25 }),
      ).then(
        (page) =>
          live && setOptions(page.items.map((c) => ({ value: c.id, label: c.displayName }))),
        () => live && setOptions([]),
      )
    }, 250)
    return () => {
      live = false
      window.clearTimeout(id)
    }
  }, [query])
  const addTag = () => {
    const next = tag.trim()
    if (next && !tags.some((x) => x.toLowerCase() === next.toLowerCase()) && tags.length < 50)
      onTags([...tags, next])
    setTag('')
  }
  return (
    <div className="grid gap-5">
      <div>
        <span className="mb-1.5 block text-xs font-medium text-text-secondary">
          {t('newRule.customers')}
        </span>
        <Combobox
          value=""
          onChange={(id) => {
            const found = options.find((option) => option.value === id)
            if (found && !customers.some((c) => c.id === id) && customers.length < 500)
              onCustomers([...customers, { id, label: found.label }])
          }}
          options={options}
          onSearch={setQuery}
          ariaLabel={t('newRule.customers')}
          placeholder={t('newRule.addCustomer')}
          emptyText={t('newRule.target.none')}
        />
        <span className="mt-2 flex flex-wrap gap-2">
          {customers.map((customer) => (
            <span
              key={customer.id}
              className="inline-flex h-[34px] max-w-full items-center gap-2 rounded-sm border border-primary-100 bg-primary-25 px-3 text-sm font-medium text-primary-800"
            >
              <span className="truncate">{customer.label}</span>
              <button
                type="button"
                aria-label={t('newRule.removeCustomer')}
                onClick={() => onCustomers(customers.filter((c) => c.id !== customer.id))}
                className="relative text-text-quaternary after:absolute after:-inset-2 after:content-[''] hover:text-danger-700"
              >
                ×
              </button>
            </span>
          ))}
        </span>
      </div>
      <div>
        <Input
          bordered
          label={t('newRule.tags')}
          hint={t('newRule.tagsHint')}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addTag()
            }
          }}
          onBlur={addTag}
        />
        <span className="mt-2 flex flex-wrap gap-2">
          {tags.map((entry) => (
            <span
              key={entry}
              className="inline-flex h-[34px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-background px-3 text-sm font-medium text-text-secondary"
            >
              {entry}
              <button
                type="button"
                aria-label={t('newRule.removeTag')}
                onClick={() => onTags(tags.filter((x) => x !== entry))}
                className="relative text-text-quaternary after:absolute after:-inset-2 after:content-[''] hover:text-danger-700"
              >
                ×
              </button>
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

const chip = (picked: boolean) =>
  [
    'inline-flex h-[34px] max-w-full items-center rounded-sm border px-3 text-xs font-semibold',
    picked
      ? 'border-primary-700 bg-primary-50 text-primary-800'
      : 'border-border-subtle bg-white text-text-tertiary hover:bg-primary-25',
  ].join(' ')

function ComingLater() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex h-[20px] items-center rounded-[3px] bg-pending-100 px-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-pending-700">
      {t('priceRules.comingLater')}
    </span>
  )
}

function Step({
  n,
  title,
  flush,
  children,
}: {
  n: number
  title: string
  flush?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <p className="flex items-center gap-2.5 p-5">
        <span className="flex size-6 items-center justify-center rounded-[4px] bg-primary-50 text-[11px] font-semibold text-primary-800">
          {n}
        </span>
        <span className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</span>
      </p>
      <div className={flush ? 'pb-1' : 'p-5 pt-0'}>{children}</div>
    </section>
  )
}

function ToggleRow({
  title,
  note,
  checked,
  onChange,
  comingLater,
}: {
  title: string
  note: string
  checked: boolean
  onChange: (value: boolean) => void
  comingLater?: boolean
}) {
  return (
    <li className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-[1.3] text-text-primary">
          {title}
          {comingLater ? <ComingLater /> : null}
        </p>
        <p className="mt-1 max-w-[600px] text-xs font-medium leading-[1.5] text-text-quaternary">
          {note}
        </p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} disabled={comingLater} />
    </li>
  )
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt
        className={[
          'text-xs',
          tone === 'good' ? 'font-medium text-success-700' : 'font-medium text-text-tertiary',
        ].join(' ')}
      >
        {label}
      </dt>
      <dd
        dir="ltr"
        className={[
          'shrink-0 text-xs font-semibold tabular-nums',
          tone === 'good' ? 'text-success-700' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}

function Check({ state, label }: { state: 'yes' | 'no' | 'bad'; label: string }) {
  return (
    <li className="flex items-start gap-2">
      {state === 'no' ? (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="mt-px size-4 shrink-0">
          <circle cx="8" cy="8" r="5.6" stroke="#887147" strokeWidth="1.5" />
        </svg>
      ) : (
        <img
          src={state === 'yes' ? tickIcon : crossIcon}
          alt=""
          className="mt-px size-4 shrink-0"
        />
      )}
      <span
        className={[
          'text-[13px] font-medium leading-[1.4]',
          state === 'bad'
            ? 'text-danger-700'
            : state === 'yes'
              ? 'text-text-secondary'
              : 'text-text-quaternary',
        ].join(' ')}
      >
        {label}
      </span>
    </li>
  )
}
