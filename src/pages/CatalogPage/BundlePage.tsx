import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { CatalogShell, Pill } from './CatalogShell'
import { Input, Select, Switch } from '../../components/ui'
import { GROUPS, omr } from '../../lib/catalog'
import {
  BUNDLES,
  BUNDLE_PRICING,
  BUNDLE_BEHAVIOUR,
  GRINDERS_SOLD_THIS_WAY,
  VAT_RATE,
  partOf,
  partsTotal,
  saving,
  beforeVat,
  vatOn,
  canMake,
  revenueOf,
  discountGivenBy,
  type Part,
} from '../../lib/catalogBundles'
import plusIcon from '../../assets/catalog/plus-muted.svg'
import trashIcon from '../../assets/catalog/trash-danger.svg'
import tickWhiteIcon from '../../assets/catalog/check-white.svg'
import dragIcon from '../../assets/catalog/drag.svg'
import kindProductIcon from '../../assets/catalog/kind-product.svg'
import kindBagIcon from '../../assets/catalog/kind-bag.svg'
import kindGrinderIcon from '../../assets/catalog/kind-grinder.svg'
import kindServiceIcon from '../../assets/catalog/kind-service.svg'

const partIcon = (id: string) => {
  if (id.includes('grinder')) return kindGrinderIcon
  if (id.includes('bag') || id.includes('blend') || id.includes('yirg') || id.includes('sidamo'))
    return kindBagIcon
  if (id.includes('training')) return kindServiceIcon
  return kindProductIcon
}

/**
 * One bundle (Figma 135:48138).
 *
 * The saving and the number that can be made are both consequences of the parts, so changing a
 * quantity moves the invoice preview, the discount and the capacity together.
 */
export function BundlePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()

  const source = BUNDLES.find((entry) => entry.id === id) ?? BUNDLES[1]
  const [name, setName] = useState(`${source.name} beans, grinder and filters`)
  const [group, setGroup] = useState('equipment')
  const [description, setDescription] = useState('')
  const [parts, setParts] = useState<Part[]>(source.parts)
  const [pricing, setPricing] = useState('onePrice')
  const [price, setPrice] = useState(String(beforeVat(source.price)))
  const [behaviour, setBehaviour] = useState(
    () => new Set(BUNDLE_BEHAVIOUR.filter((row) => row.on).map((row) => row.id)),
  )
  const [saved, setSaved] = useState(false)

  /** Everything below follows from the parts and the one price typed above. */
  const working = useMemo(() => {
    const draft = {
      ...source,
      parts,
      price: Math.round(Number(price) * (1 + VAT_RATE) * 1000) / 1000,
    }
    return {
      draft,
      parts: partsTotal(draft),
      save: saving(draft),
      make: canMake(draft),
      vat: vatOn(draft.price),
      pays: draft.price,
    }
  }, [parts, price, source])

  const setQuantity = (index: number, quantity: number) =>
    setParts((list) =>
      list.map((part, i) => (i === index ? { ...part, quantity: Math.max(1, quantity) } : part)),
    )

  const toggleBehaviour = (key: string) =>
    setBehaviour((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  /** What one sale removes from the shelf, said in plain words. */
  const stockSummary = parts
    .filter((part) => !part.free)
    .map((part) => `${part.quantity} × ${partOf(part.itemId).name.toLowerCase()}`)
    .join(', ')

  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'bundles.title', to: '/catalog/bundles' },
        { label: source.name },
      ]}
      title={source.name}
      subtitle={undefined}
      pills={
        <Pill tone="success">
          {t('bundle.savesTheCustomer', { amount: omr(working.save.amount) })}
        </Pill>
      }
      actions={
        <>
          <Link
            to="/catalog/bundles"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('bundle.cancel')}
          </Link>
          <button
            type="button"
            onClick={() => setSaved(true)}
            className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {saved ? t('bundle.saved') : t('bundle.save')}
          </button>
        </>
      }
    >
      <p className="-mt-2 text-sm font-medium leading-[1.5] text-[#8f8f8f]">
        <Trans
          i18nKey="bundle.subtitle"
          values={{ count: source.sold90, code: source.code }}
          components={{ b: <b className="font-semibold text-text-secondary" /> }}
        />
      </p>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Step n={1} title={t('bundle.step.basics')}>
            <div className="grid gap-4">
              <Input
                bordered
                label={t('bundle.name')}
                requiredMark
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                    {t('bundle.whereItLives')}
                    <span className="text-danger-700">*</span>
                  </span>
                  <Select
                    ariaLabel={t('bundle.whereItLives')}
                    value={group}
                    onChange={setGroup}
                    options={GROUPS.map((entry) => ({
                      value: entry.id,
                      label: `${entry.name} › Bundles`,
                    }))}
                  />
                </label>
                <Input bordered label={t('bundle.itemCode')} value={source.code} readOnly />
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  {t('bundle.description')}
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-sm border border-border-default bg-white px-3 py-2.5 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-brand"
                />
              </label>
            </div>
          </Step>

          <Step n={2} title={t('bundle.step.inside')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse">
                <thead>
                  <tr className="border-b border-surface-background text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                    <th className="h-[36px] px-3 text-start font-semibold">
                      {t('bundle.col.item')}
                    </th>
                    <th className="h-[36px] px-3 text-start font-semibold">
                      {t('bundle.col.howMany')}
                    </th>
                    <th className="h-[36px] px-3 text-end font-semibold">
                      {t('bundle.col.normally')}
                    </th>
                    <th className="h-[36px] px-3 text-end font-semibold">
                      {t('bundle.col.stock')}
                    </th>
                    <th className="h-[36px] px-3" />
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part, index) => {
                    const info = partOf(part.itemId)
                    const scarcest = working.make.limitedBy === info.name
                    return (
                      <tr
                        key={part.itemId}
                        className={[
                          'border-b border-surface-background last:border-0',
                          scarcest ? 'bg-pending-100/40' : '',
                        ].join(' ')}
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-start gap-2.5">
                            <img
                              src={dragIcon}
                              alt=""
                              className="mt-2 size-4 shrink-0 cursor-grab opacity-50"
                            />
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-background">
                              <img src={partIcon(part.itemId)} alt="" className="size-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-text-primary">
                                {info.name}
                              </span>
                              {info.code ? (
                                <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                                  {info.group} › {info.kind} · {info.code}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            value={part.quantity}
                            onChange={(event) =>
                              setQuantity(index, Number(event.target.value.replace(/\D/g, '')) || 1)
                            }
                            aria-label={t('bundle.col.howMany')}
                            className="h-[38px] w-[70px] rounded-sm border border-border-default bg-white px-3 text-center text-sm font-medium text-text-primary outline-none focus:border-border-brand"
                          />
                        </td>
                        <td className="px-3 py-3 text-end">
                          {part.free ? (
                            <>
                              <p className="text-sm font-semibold text-text-primary tabular-nums">
                                OMR 0.000
                              </p>
                              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                                {t('bundle.thrownInFree')}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-text-primary tabular-nums">
                                OMR {omr(info.price * part.quantity)}
                              </p>
                              {part.quantity > 1 ? (
                                <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                                  {t('bundle.each', { amount: omr(info.price) })}
                                </p>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3 text-end">
                          {info.onHand === null || info.onHand === undefined ? (
                            <p className="text-sm font-medium text-text-quaternary">
                              {t('bundle.notStocked')}
                            </p>
                          ) : (
                            <>
                              <p
                                className={[
                                  'text-sm font-semibold tabular-nums',
                                  scarcest ? 'text-pending-700' : 'text-text-primary',
                                ].join(' ')}
                              >
                                {info.onHand}
                              </p>
                              <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                                {scarcest
                                  ? t('bundle.fewestOfTheThree', {
                                      count: parts.filter((p) => partOf(p.itemId).onHand !== null)
                                        .length,
                                    })
                                  : info.unitKey
                                    ? t(info.unitKey)
                                    : ''}
                              </p>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3 text-end">
                          <button
                            type="button"
                            onClick={() => setParts((list) => list.filter((_, i) => i !== index))}
                            aria-label={t('bundle.removePart')}
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
              className="mt-3 inline-flex h-[38px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={plusIcon} alt="" className="size-4" />
              {t('bundle.addSomething')}
            </button>
          </Step>

          <Step n={3} title={t('bundle.step.costs')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {BUNDLE_PRICING.map((entry) => {
                const picked = entry.id === pricing
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setPricing(entry.id)}
                    aria-pressed={picked}
                    className={[
                      'flex items-start gap-3 rounded-sm border p-4 text-start transition-colors',
                      picked
                        ? 'border-primary-700 bg-primary-25'
                        : 'border-border-subtle bg-white hover:bg-primary-25',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2',
                        picked ? 'border-primary-700' : 'border-border-default',
                      ].join(' ')}
                    >
                      {picked ? <span className="size-2 rounded-full bg-primary-700" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={[
                          'block text-sm font-semibold',
                          picked ? 'text-primary-800' : 'text-text-primary',
                        ].join(' ')}
                      >
                        {t(entry.labelKey)}
                      </span>
                      <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-quaternary">
                        {t(entry.noteKey)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-4 max-w-[280px]">
              <Input
                bordered
                label={t('bundle.bundlePrice')}
                requiredMark
                hint={t('bundle.beforeVat')}
                value={price}
                inputMode="decimal"
                onChange={(event) => setPrice(event.target.value.replace(/[^\d.]/g, ''))}
                leadingIcon={<span className="text-xs font-medium text-text-quaternary">OMR</span>}
              />
            </div>

            <dl className="mt-4 overflow-hidden rounded-sm border border-border-subtle">
              <Line label={t('bundle.partsSeparately')} value={`OMR ${omr(working.parts)}`} />
              <Line
                label={t('bundle.whatTheySave')}
                value={`−OMR ${omr(working.save.amount)} · ${working.save.percent}%`}
                tone="good"
              />
              <Line
                label={t('bundle.vat', { rate: VAT_RATE * 100 })}
                value={`OMR ${omr(working.vat)}`}
              />
              <Line label={t('bundle.theyPay')} value={`OMR ${omr(working.pays)}`} strong />
            </dl>
          </Step>

          <Step n={4} title={t('bundle.step.behaves')} flush>
            <ul>
              {BUNDLE_BEHAVIOUR.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                      {t(`bundle.behave.${row.id}`)}
                    </p>
                    <p className="mt-1 max-w-[600px] text-xs font-medium leading-[1.5] text-text-quaternary">
                      {t(`bundle.behave.${row.id}Note`, { summary: stockSummary })}
                    </p>
                  </div>
                  <Switch
                    checked={behaviour.has(row.id)}
                    onChange={() => toggleBehaviour(row.id)}
                    label={t(`bundle.behave.${row.id}`)}
                  />
                </li>
              ))}
            </ul>
          </Step>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[300px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('bundle.onTheInvoice')}
            </h3>
            <div className="mt-3 overflow-hidden rounded-sm border border-border-subtle">
              <p className="bg-[#151c2d] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                {t('bundle.howItWillRead')}
              </p>
              <div className="bg-white p-3">
                <p className="flex items-baseline justify-between gap-3 py-1 text-xs font-semibold text-text-primary">
                  <span>{source.name}</span>
                  <span className="tabular-nums">{omr(beforeVat(working.pays))}</span>
                </p>
                {parts.map((part) => (
                  <p
                    key={part.itemId}
                    className="flex items-baseline justify-between gap-3 py-1 ps-3 text-[11px] text-text-tertiary"
                  >
                    <span>
                      {partOf(part.itemId).name} × {part.quantity}
                    </span>
                    <span className="shrink-0 text-text-quaternary">
                      {part.free ? t('bundle.thrownInFree') : '—'}
                    </span>
                  </p>
                ))}
                <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-border-subtle pt-2 text-[11px] text-text-tertiary">
                  <span>{t('bundle.vat', { rate: VAT_RATE * 100 })}</span>
                  <span className="tabular-nums">{omr(working.vat)}</span>
                </p>
                <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-border-subtle pt-2 text-sm font-semibold text-text-primary">
                  <span>{t('bundle.total')}</span>
                  <span className="tabular-nums">
                    <span className="me-1 text-[10px] font-medium text-text-quaternary">OMR</span>
                    {omr(working.pays)}
                  </span>
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('bundle.howManyYouCanSell')}
            </h3>
            <dl className="mt-2">
              <Row
                label={t('bundle.readyToGo')}
                value={
                  working.make.count === null ? t('bundles.unlimited') : String(working.make.count)
                }
              />
              {working.make.limitedBy ? (
                <Row label={t('bundle.heldBackBy')} value={working.make.limitedBy} tone="pending" />
              ) : null}
              {parts
                .filter((part) => {
                  const info = partOf(part.itemId)
                  return info.onHand !== null && info.name !== working.make.limitedBy
                })
                .map((part) => {
                  const info = partOf(part.itemId)
                  return (
                    <Row
                      key={part.itemId}
                      label={t('bundle.allows', { name: info.shortName })}
                      value={String(Math.floor((info.onHand ?? 0) / part.quantity))}
                    />
                  )
                })}
            </dl>
            {working.make.limitedBy ? (
              <button
                type="button"
                className="mt-3 inline-flex h-[40px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('bundle.orderMore', { name: working.make.limitedBy.toLowerCase() })}
              </button>
            ) : null}
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('bundle.howItsDoing')}
            </h3>
            <dl className="mt-2">
              <Row label={t('bundle.soldIn90')} value={String(source.sold90)} />
              <Row label={t('bundle.revenue')} value={`OMR ${omr(revenueOf(source))}`} />
              <Row
                label={t('bundle.givenAwayInDiscount')}
                value={`OMR ${omr(discountGivenBy(source))}`}
              />
              <Row
                label={t('bundle.soldThisWay', { name: 'Grinders' })}
                value={t('bundle.ofTotal', {
                  count: GRINDERS_SOLD_THIS_WAY.throughBundle,
                  total: GRINDERS_SOLD_THIS_WAY.total,
                })}
                last
              />
            </dl>
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {working.make.count === null
            ? t('bundle.footerUnlimited', { parts: parts.length, price: omr(working.pays) })
            : t('bundle.footer', {
                parts: parts.length,
                price: omr(working.pays),
                canMake: working.make.count,
              })}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to="/catalog/bundles"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('bundle.cancel')}
          </Link>
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('bundle.saveAndSwitchOff')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/catalog/bundles')}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {t('bundle.save')}
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
      <div className={flush ? '' : 'border-t border-surface-background p-5'}>{children}</div>
    </section>
  )
}

function Line({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: 'good'
  strong?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 border-b border-surface-background px-4 py-3 last:border-0',
        tone === 'good' ? 'bg-success-100/50' : '',
        strong ? 'bg-surface-background/60' : '',
      ].join(' ')}
    >
      <dt
        className={[
          'text-sm',
          strong ? 'font-semibold text-text-primary' : 'font-medium text-text-tertiary',
          tone === 'good' ? 'text-[#3d5648]' : '',
        ].join(' ')}
      >
        {label}
      </dt>
      <dd
        className={[
          'shrink-0 tabular-nums',
          strong ? 'text-lg font-semibold text-text-primary' : 'text-sm font-semibold',
          tone === 'good' ? 'text-[#3d5648]' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}

function Row({
  label,
  value,
  tone,
  last,
}: {
  label: string
  value: string
  tone?: 'pending'
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd
        className={[
          'shrink-0 text-sm font-semibold',
          tone === 'pending' ? 'text-pending-700' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  )
}
