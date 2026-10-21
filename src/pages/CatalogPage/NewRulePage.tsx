import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell } from './CatalogShell'
import { Input, Rial, Select, Switch } from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice'
import { omr } from '../../lib/catalog'
import {
  RULE_KINDS,
  COUNTED_OPTIONS,
  PER_OPTIONS,
  NEW_RULE,
  CLASHES,
  VAT_RATE,
  keepOn,
  itemsCovered,
  tryItOut,
  type Break,
} from '../../lib/catalogRules'
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
  volume: bagIcon,
  time: clockIcon,
  customer: usersIcon,
  buyOneGet: giftIcon,
}

/**
 * A new price rule (Figma 135:51027).
 *
 * The worked example on the right is the whole argument for the screen: a quantity is typed in
 * and the break, the saving, the VAT and the total follow from the table on the left. A break
 * below cost is caught by comparing it against what the item costs, not by a warning someone
 * remembered to write.
 */
export function NewRulePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [kind, setKind] = useState('volume')
  const [name, setName] = useState(NEW_RULE.name)
  const [scope, setScope] = useState(NEW_RULE.appliesTo)
  const [counted, setCounted] = useState(NEW_RULE.counted)
  const [per, setPer] = useState(NEW_RULE.per)
  const [breaks, setBreaks] = useState<Break[]>(NEW_RULE.breaks)
  const [extrasOnly, setExtrasOnly] = useState(NEW_RULE.extrasOnly)
  const [starts, setStarts] = useState(NEW_RULE.starts)
  const [ends, setEnds] = useState(NEW_RULE.ends)
  const [stacks, setStacks] = useState(NEW_RULE.stacks)
  const [showOnInvoice, setShowOnInvoice] = useState(NEW_RULE.showOnInvoice)
  const [atTheTill, setAtTheTill] = useState(NEW_RULE.atTheTill)
  const [quantity, setQuantity] = useState(String(NEW_RULE.tryQuantity))

  const items = itemsCovered(scope)
  const qty = Number(quantity) || 0
  const trial = useMemo(() => tryItOut(qty, breaks, NEW_RULE.normalPrice), [qty, breaks])

  const belowCost = breaks.some((entry) => keepOn(entry.price, NEW_RULE.cost).losing)
  /** Each break must start where the last one ended, or a quantity falls through a gap. */
  const inOrder = breaks.every(
    (entry, index) => index === 0 || entry.from === (breaks[index - 1].to ?? 0) + 1,
  )
  const named = name.trim().length > 0 && items > 0
  const canGoLive = named && !belowCost

  const setBreak = (index: number, patch: Partial<Break>) =>
    setBreaks((list) => list.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))

  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'priceRules.title', to: '/catalog/rules' },
        { labelKey: 'priceRules.newRule' },
      ]}
      title={t('newRule.title')}
      subtitle={t('newRule.subtitle')}
    >
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Step n={1} title={t('newRule.step.kind')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {RULE_KINDS.map((entry) => {
                const picked = entry.id === kind
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setKind(entry.id)}
                    aria-pressed={picked}
                    className={[
                      'flex items-start gap-3 rounded-sm border p-4 text-start transition-colors',
                      picked
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
                          'block text-sm font-semibold',
                          picked ? 'text-primary-800' : 'text-text-primary',
                        ].join(' ')}
                      >
                        {t(entry.titleKey)}
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
            <div className="grid gap-4">
              <Input
                bordered
                label={t('newRule.name')}
                requiredMark
                value={name}
                onChange={(event) => setName(event.target.value)}
              />

              <div>
                <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                  {t('newRule.whatItAppliesTo')}
                  <span className="text-danger-700">*</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {scope.map((entry) => (
                    <span
                      key={entry.id}
                      className="inline-flex h-[38px] items-center gap-2 rounded-sm border border-primary-100 bg-primary-25 px-3"
                    >
                      <span className="text-sm font-medium text-primary-800">{entry.name}</span>
                      <span className="text-xs font-medium text-text-quaternary">
                        {entry.items === 1
                          ? t('newRule.oneItem')
                          : t('newRule.nItems', { count: entry.items })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setScope((list) => list.filter((x) => x.id !== entry.id))}
                        aria-label={t('newRule.removeScope')}
                        className="relative text-text-quaternary transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-danger-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className="inline-flex h-[38px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                  >
                    <img src={plusIcon} alt="" className="size-4" />
                    {t('newRule.addSomething')}
                  </button>
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                    {t('newRule.counted')}
                  </span>
                  <Select
                    quiet
                    ariaLabel={t('newRule.counted')}
                    value={counted}
                    onChange={setCounted}
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
                  <Select
                    quiet
                    ariaLabel={t('newRule.per')}
                    value={per}
                    onChange={setPer}
                    options={PER_OPTIONS.map((entry) => ({
                      value: entry.id,
                      label: t(entry.labelKey),
                    }))}
                  />
                </label>
              </div>
            </div>
          </Step>

          <Step n={3} title={t('newRule.step.breaks')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse">
                <thead>
                  <tr className="whitespace-nowrap bg-[#151c2d] text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                    <th className="h-[38px] px-3 text-start font-semibold">
                      {t('newRule.col.from')}
                    </th>
                    <th className="h-[38px] px-3 text-start font-semibold">
                      {t('newRule.col.upTo')}
                    </th>
                    <th className="h-[38px] px-3 text-end font-semibold">
                      {t('newRule.col.priceEach')}
                    </th>
                    <th className="h-[38px] px-3 text-end font-semibold">
                      {t('newRule.col.keep')}
                    </th>
                    <th className="h-[38px] px-3" />
                  </tr>
                </thead>
                <tbody>
                  {breaks.map((entry, index) => {
                    const keep = keepOn(entry.price, NEW_RULE.cost)
                    return (
                      <tr
                        key={index}
                        className={[
                          'border-b border-surface-background last:border-0',
                          keep.losing ? 'bg-[#fdf4f2]' : '',
                        ].join(' ')}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            value={entry.from}
                            onChange={(event) =>
                              setBreak(index, {
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
                            value={entry.to ?? ''}
                            placeholder={t('newRule.noLimit')}
                            onChange={(event) => {
                              const raw = event.target.value.replace(/\D/g, '')
                              setBreak(index, { to: raw === '' ? null : Number(raw) })
                            }}
                            onFocus={selectAllOnFocus}
                            inputMode="numeric"
                            aria-label={t('newRule.col.upTo')}
                            className="h-[42px] w-full rounded-sm border border-border-default bg-white px-3 text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder focus:border-border-brand"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            value={omr(entry.price)}
                            onChange={(event) =>
                              setBreak(index, {
                                price: Number(event.target.value.replace(/[^\d.]/g, '')) || 0,
                              })
                            }
                            onFocus={selectAllOnFocus}
                            inputMode="decimal"
                            aria-label={t('newRule.col.priceEach')}
                            className={[
                              'h-[42px] w-full rounded-sm border px-3 text-end text-sm font-semibold outline-none',
                              keep.losing
                                ? 'border-danger-700 bg-danger-100 text-danger-700'
                                : 'border-border-default bg-white text-text-primary focus:border-border-brand',
                            ].join(' ')}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="flex items-baseline justify-end gap-3 whitespace-nowrap">
                            <span
                              className={[
                                'text-xs font-medium',
                                keep.losing ? 'text-danger-700' : 'text-text-quaternary',
                              ].join(' ')}
                            >
                              {keep.losing
                                ? t('newRule.losingMoney')
                                : t('newRule.margin', { percent: keep.marginPercent })}
                            </span>
                            <span
                              dir="ltr"
                              className={[
                                'w-[52px] text-end text-sm font-semibold tabular-nums',
                                keep.losing ? 'text-danger-700' : 'text-text-primary',
                              ].join(' ')}
                            >
                              {keep.keep < 0 ? '−' : ''}
                              {omr(Math.abs(keep.keep))}
                            </span>
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-end">
                          <button
                            type="button"
                            onClick={() => setBreaks((list) => list.filter((_, i) => i !== index))}
                            aria-label={t('newRule.removeBreak')}
                            className="inline-flex size-8 items-center justify-center rounded-sm transition-colors hover:bg-danger-100"
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
              onClick={() =>
                setBreaks((list) => [
                  ...list,
                  { from: (list[list.length - 1]?.to ?? 0) + 1, to: null, price: 1 },
                ])
              }
              className="mt-3 inline-flex h-[38px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
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
                    count: breaks[0]?.to ?? 9,
                    price: omr(breaks[0]?.price ?? 0),
                    next: (breaks[0]?.to ?? 9) + 1,
                  })}
                </p>
              </div>
              <Switch
                checked={extrasOnly}
                onChange={setExtrasOnly}
                label={t('newRule.extrasOnly')}
              />
            </div>
          </Step>

          <Step n={4} title={t('newRule.step.when')} flush>
            <div className="grid gap-4 p-5 pt-0 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  {t('newRule.starts')}
                </span>
                <Select
                  quiet
                  ariaLabel={t('newRule.starts')}
                  value={starts}
                  onChange={setStarts}
                  options={[
                    { value: '1 August 2026', label: '1 August 2026' },
                    { value: '1 September 2026', label: '1 September 2026' },
                    { value: '1 October 2026', label: '1 October 2026' },
                  ]}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-text-secondary">
                  {t('newRule.ends')}
                  <span className="font-normal text-text-quaternary">{t('newRule.endsHint')}</span>
                </span>
                <Select
                  quiet
                  ariaLabel={t('newRule.ends')}
                  value={ends}
                  onChange={setEnds}
                  options={[
                    { value: '', label: t('newRule.noEndDate') },
                    { value: '31 December 2026', label: '31 December 2026' },
                  ]}
                />
              </label>
            </div>

            <ul>
              <ToggleRow
                title={t('newRule.stacks')}
                note={t('newRule.stacksNote')}
                checked={stacks}
                onChange={setStacks}
              />
              <ToggleRow
                title={t('newRule.showOnInvoice')}
                note={t('newRule.showOnInvoiceNote')}
                checked={showOnInvoice}
                onChange={setShowOnInvoice}
              />
              <ToggleRow
                title={t('newRule.atTheTill')}
                note={t('newRule.atTheTillNote')}
                checked={atTheTill}
                onChange={setAtTheTill}
              />
            </ul>
          </Step>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[300px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('newRule.tryItOut')}
            </h3>
            <div className="mt-3 overflow-hidden rounded-sm border border-border-subtle">
              <p className="bg-[#151c2d] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                {t('newRule.ifSomeoneBought')}
              </p>
              <div className="bg-white p-3">
                <p className="flex items-center gap-2">
                  <input
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))}
                    onFocus={selectAllOnFocus}
                    inputMode="numeric"
                    aria-label={t('newRule.ifSomeoneBought')}
                    className="h-[38px] w-[64px] rounded-sm border border-border-default bg-white px-2 text-center text-sm font-semibold text-text-primary outline-none focus:border-border-brand"
                  />
                  <span className="text-sm font-medium text-text-tertiary">
                    {t('newRule.packsOf', { name: t('newRule.filtersWord') })}
                  </span>
                </p>

                <dl className="mt-3">
                  <Line label={t('newRule.normally')} value={omr(trial.normally)} />
                  <Line
                    label={t('newRule.withThisRule', { price: omr(trial.chosen.price) })}
                    value={omr(trial.withRule)}
                  />
                  <Line
                    label={t('newRule.theySave')}
                    value={`−${omr(trial.save)} · ${trial.savePercent}%`}
                    tone="good"
                  />
                  <Line label={t('newRule.vat', { rate: VAT_RATE * 100 })} value={omr(trial.vat)} />
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

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('newRule.readyToSwitchOn')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              <Check
                state={named ? 'yes' : 'no'}
                label={
                  named ? t('newRule.check.named', { count: items }) : t('newRule.check.unnamed')
                }
              />
              <Check
                state={inOrder ? 'yes' : 'bad'}
                label={
                  inOrder ? t('newRule.check.breaksInOrder') : t('newRule.check.breaksOverlap')
                }
              />
              <Check
                state={belowCost ? 'bad' : 'yes'}
                label={belowCost ? t('newRule.check.belowCost') : t('newRule.check.aboveCost')}
              />
              <Check
                state="no"
                label={
                  ends === ''
                    ? t('newRule.check.noEndDate')
                    : t('newRule.check.hasEndDate', { date: ends })
                }
              />
            </ul>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('newRule.clashes')}
            </h3>
            <dl className="mt-2">
              {CLASHES.map((clash, index) => (
                <div
                  key={clash.id}
                  className={[
                    'flex items-center justify-between gap-3 py-2.5',
                    index < CLASHES.length - 1 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <dt className="text-sm font-medium text-text-tertiary">{clash.name}</dt>
                  <dd
                    className={[
                      'shrink-0 text-sm font-medium',
                      clash.warn ? 'text-pending-700' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {t(clash.overlapKey, clash.overlapValues)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {t('newRule.footer', {
            breaks: breaks.length,
            items,
            issue: belowCost ? t('newRule.issueBelowCost') : t('newRule.issueNone'),
          })}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to="/catalog/rules"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('newRule.cancel')}
          </Link>
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('newRule.saveWithoutSwitchingOn')}
          </button>
          <button
            type="button"
            disabled={!canGoLive}
            onClick={() => navigate('/catalog/rules')}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {t('newRule.switchItOn')}
          </button>
        </div>
      </div>
    </CatalogShell>
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
}: {
  title: string
  note: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <li className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-[1.3] text-text-primary">{title}</p>
        <p className="mt-1 max-w-[600px] text-xs font-medium leading-[1.5] text-text-quaternary">
          {note}
        </p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
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
