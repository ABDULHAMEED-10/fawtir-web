import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Pill } from './CatalogShell'
import { ItemTabs } from './ItemTabs'
import { Input, Select, Switch, TableCheckbox } from '../../components/ui'
import { TAX_CATEGORY_OPTIONS, UNIT_OPTIONS } from '../../lib/catalogues'
import { GROUPS, omr } from '../../lib/catalog'
import {
  ITEM,
  SIZES,
  ADD_ONS,
  shelfPrice,
  sizePrice,
  tillPreview,
  readiness,
  SOLD_90,
  MOST_POPULAR_SIZE,
  YEAR,
  USED_SUMMARY,
  type Size,
  type AddOn,
} from '../../lib/catalogItem'
import handOverIcon from '../../assets/catalog/kind-bag.svg'
import youDoIcon from '../../assets/catalog/kind-service.svg'
import byTimeIcon from '../../assets/catalog/kind-hour.svg'
import severalIcon from '../../assets/catalog/kind-bundle.svg'
import tickIcon from '../../assets/catalog/check-green.svg'
import circleIcon from '../../assets/catalog/minus-amber.svg'
import plusIcon from '../../assets/catalog/plus-muted.svg'
import trashIcon from '../../assets/catalog/trash-danger.svg'
import tickWhiteIcon from '../../assets/catalog/check-white.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const KINDS = [
  { id: 'handOver', icon: handOverIcon },
  { id: 'youDo', icon: youDoIcon },
  { id: 'byTime', icon: byTimeIcon },
  { id: 'several', icon: severalIcon },
]

/**
 * One item's own screen — new (Figma 135:44866) and existing (135:45974).
 *
 * The same form serves both; only the heading and the tabs differ. The receipt on the right is
 * built from the fields, so a size typed at +0.300 shows up as 1.700 before anything is saved.
 */
export function ItemFormPage({ mode }: { mode: 'new' | 'edit' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const existing = mode === 'edit'

  const [kind, setKind] = useState('handOver')
  const [name, setName] = useState(existing ? ITEM.name : '')
  const [arabicName, setArabicName] = useState(existing ? ITEM.arabicName : '')
  const [description, setDescription] = useState(ITEM.description)
  const [group, setGroup] = useState('brewedDrinks')
  const [itemKind, setItemKind] = useState('milkCoffee')
  const [code] = useState(ITEM.code)
  const [barcode, setBarcode] = useState(ITEM.barcode)
  const [soldAs, setSoldAs] = useState(ITEM.soldAs)
  const [basePrice, setBasePrice] = useState(String(ITEM.basePrice))
  const [taxCategory, setTaxCategory] = useState(ITEM.taxCategory)
  const [includesVat, setIncludesVat] = useState(ITEM.priceIncludesVat)
  const [staffCanChange, setStaffCanChange] = useState(ITEM.staffCanChangePrice)
  const [keepCount, setKeepCount] = useState(ITEM.keepCountOfThis)
  const [sizes, setSizes] = useState<Size[]>(SIZES)
  const [addOns, setAddOns] = useState<AddOn[]>(ADD_ONS)
  const [saved, setSaved] = useState(false)

  const base = Number(basePrice) || 0
  const shelf = shelfPrice(base)

  const preview = useMemo(
    () => tillPreview(base, sizes[1]?.id ?? sizes[0]?.id ?? 'regular', ['extraShot', 'oatMilk']),
    [base, sizes],
  )

  const checks = readiness({
    name,
    basePrice: base,
    taxCategory,
    group,
    kind: itemKind,
    barcode,
  })

  const groupOptions = GROUPS.map((entry) => ({ value: entry.id, label: entry.name }))
  const kindOptions =
    GROUPS.find((entry) => entry.id === group)?.kinds.map((entry) => ({
      value: entry.id,
      label: entry.name,
    })) ?? []

  const setSize = (index: number, patch: Partial<Size>) =>
    setSizes((list) => list.map((size, i) => (i === index ? { ...size, ...patch } : size)))

  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { label: existing ? ITEM.name : t('item.newItem') },
      ]}
      title={existing ? name || ITEM.name : t('item.newItem')}
      subtitle={t('item.meta', {
        group: GROUPS.find((entry) => entry.id === group)?.name ?? '',
        kind: kindOptions.find((entry) => entry.value === itemKind)?.label ?? '',
        code,
        date: ITEM.addedOn,
      })}
      pills={
        existing ? (
          <>
            <Pill tone="success">{t('item.onSale')}</Pill>
            <Pill tone="brand">
              {t('item.soldTimes', { count: SOLD_90.toLocaleString('en-US') })}
            </Pill>
          </>
        ) : (
          <>
            <Pill tone="neutral">{t('item.notLive')}</Pill>
            <Pill tone="neutral">{t('item.soldNone')}</Pill>
          </>
        )
      }
      actions={
        <>
          <Link
            to="/catalog"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('item.cancel')}
          </Link>
          <button
            type="button"
            onClick={() => setSaved(true)}
            className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {saved ? t('item.saved') : t('item.save')}
          </button>
        </>
      }
      tabs={existing ? <ItemTabs id={id ?? ITEM.id} active="details" /> : undefined}
    >
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* 1 — what kind */}
          <Step n={1} title={t('item.step.kind')}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {KINDS.map((entry) => {
                const picked = entry.id === kind
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setKind(entry.id)}
                    aria-pressed={picked}
                    className={[
                      'flex flex-col rounded-sm border p-4 text-start transition-colors',
                      picked
                        ? 'border-primary-700 bg-primary-25'
                        : 'border-border-subtle bg-white hover:bg-primary-25',
                    ].join(' ')}
                  >
                    <span className="flex size-8 items-center justify-center rounded-md bg-surface-background">
                      <img src={entry.icon} alt="" className="size-4" />
                    </span>
                    <span
                      className={[
                        'mt-2.5 text-sm font-semibold',
                        picked ? 'text-primary-800' : 'text-text-primary',
                      ].join(' ')}
                    >
                      {t(`item.kind.${entry.id}`)}
                    </span>
                    <span className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                      {t(`item.kind.${entry.id}Note`)}
                    </span>
                  </button>
                )
              })}
            </div>
          </Step>

          {/* 2 — the basics */}
          <Step n={2} title={t('item.step.basics')}>
            <div className="grid gap-4">
              <Input
                bordered
                label={t('item.name')}
                requiredMark
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Input
                bordered
                dir="rtl"
                label={t('item.arabicName')}
                value={arabicName}
                onChange={(event) => setArabicName(event.target.value)}
              />
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  {t('item.description')}
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-sm border border-border-default bg-white px-3 py-2.5 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-brand"
                />
              </label>

              <div>
                <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                  {t('item.whereItLives')}
                  <span className="text-danger-700">*</span>
                </span>
                <div className="flex flex-wrap items-end gap-2 rounded-sm bg-primary-25 p-3">
                  <label className="min-w-[160px] flex-1">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                      {t('item.group')}
                    </span>
                    <Select
                      compact
                      ariaLabel={t('item.group')}
                      value={group}
                      onChange={(value) => {
                        setGroup(value)
                        const first = GROUPS.find((entry) => entry.id === value)?.kinds[0]
                        if (first) setItemKind(first.id)
                      }}
                      options={groupOptions}
                    />
                  </label>
                  <img
                    src={chevronIcon}
                    alt=""
                    aria-hidden="true"
                    className="mb-3 size-4 shrink-0 opacity-50 rtl:rotate-180"
                  />
                  <label className="min-w-[160px] flex-1">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                      {t('item.kindLabel')}
                    </span>
                    <Select
                      compact
                      ariaLabel={t('item.kindLabel')}
                      value={itemKind}
                      onChange={setItemKind}
                      options={kindOptions}
                    />
                  </label>
                  <img
                    src={chevronIcon}
                    alt=""
                    aria-hidden="true"
                    className="mb-3 size-4 shrink-0 opacity-50 rtl:rotate-180"
                  />
                  <span className="mb-0 inline-flex h-[42px] min-w-[120px] items-center rounded-sm bg-primary-700 px-3 text-sm font-semibold text-white">
                    {name || t('item.newItem')}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Input bordered label={t('item.itemCode')} value={code} readOnly />
                <Input
                  bordered
                  label={t('item.barcode')}
                  hint={t('item.barcodeHint')}
                  placeholder={t('item.barcodePlaceholder')}
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                />
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                    {t('item.soldAs')}
                    <span className="text-danger-700">*</span>
                  </span>
                  <Select
                    ariaLabel={t('item.soldAs')}
                    value={soldAs}
                    onChange={setSoldAs}
                    options={UNIT_OPTIONS}
                  />
                </label>
              </div>
            </div>
          </Step>

          {/* 3 — price and tax */}
          <Step n={3} title={t('item.step.price')}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                bordered
                label={t('item.basePrice')}
                requiredMark
                hint={t('item.beforeVat')}
                value={basePrice}
                inputMode="decimal"
                onChange={(event) => setBasePrice(event.target.value.replace(/[^\d.]/g, ''))}
                leadingIcon={<span className="text-xs font-medium text-text-quaternary">OMR</span>}
              />
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                  {t('item.taxCategory')}
                  <span className="text-danger-700">*</span>
                </span>
                <Select
                  ariaLabel={t('item.taxCategory')}
                  value={taxCategory}
                  onChange={setTaxCategory}
                  options={TAX_CATEGORY_OPTIONS}
                />
              </label>
              <Input
                bordered
                label={t('item.priceOnTheShelf')}
                hint={t('item.whatCustomerPays')}
                value={omr(shelf)}
                readOnly
                readOnlyAppearance
                leadingIcon={<span className="text-xs font-medium text-text-quaternary">OMR</span>}
              />
            </div>

            <ul className="mt-4">
              <ToggleRow
                title={t('item.priceIncludesVat')}
                note={t('item.priceIncludesVatNote')}
                checked={includesVat}
                onChange={setIncludesVat}
              />
              <ToggleRow
                title={t('item.staffCanChange')}
                note={t('item.staffCanChangeNote')}
                checked={staffCanChange}
                onChange={setStaffCanChange}
                last
              />
            </ul>
          </Step>

          {/* 4 — sizes */}
          <Step n={4} title={t('item.step.sizes')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse">
                <thead>
                  <tr className="bg-[#151c2d] text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                    <th className="h-[38px] px-3 text-start font-semibold">
                      {t('item.sizesCol.size')}
                    </th>
                    <th className="h-[38px] px-3 text-start font-semibold">
                      {t('item.sizesCol.priceChange')}
                    </th>
                    <th className="h-[38px] px-3 text-end font-semibold">
                      {t('item.sizesCol.sellsFor')}
                    </th>
                    <th className="h-[38px] px-3 text-start font-semibold">
                      {t('item.sizesCol.code')}
                    </th>
                    <th className="h-[38px] px-3 text-start font-semibold">
                      {t('item.sizesCol.onSale')}
                    </th>
                    <th className="h-[38px] px-3" />
                  </tr>
                </thead>
                <tbody>
                  {sizes.map((size, index) => (
                    <tr key={size.id} className="border-b border-surface-background last:border-0">
                      <td className="px-3 py-2.5">
                        <input
                          value={size.name}
                          onChange={(event) => setSize(index, { name: event.target.value })}
                          aria-label={t('item.sizesCol.size')}
                          className="h-[42px] w-full rounded-sm border border-border-default bg-white px-3 text-sm font-medium text-text-primary outline-none focus:border-border-brand"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          value={size.delta === 0 ? '—' : `+${size.delta.toFixed(3)}`}
                          onChange={(event) =>
                            setSize(index, {
                              delta: Number(event.target.value.replace(/[^\d.]/g, '')) || 0,
                            })
                          }
                          aria-label={t('item.sizesCol.priceChange')}
                          className="h-[42px] w-full rounded-sm border border-border-default bg-white px-3 text-center text-sm font-medium text-text-primary outline-none focus:border-border-brand"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex h-[42px] items-center justify-end rounded-sm border border-border-default bg-surface-background px-3 text-sm font-semibold text-text-primary tabular-nums">
                          {omr(sizePrice(base, size))}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          value={size.code}
                          onChange={(event) => setSize(index, { code: event.target.value })}
                          aria-label={t('item.sizesCol.code')}
                          className="h-[42px] w-full rounded-sm border border-border-default bg-white px-3 font-mono text-xs text-text-primary outline-none focus:border-border-brand"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <TableCheckbox
                          checked={size.onSale}
                          onChange={() => setSize(index, { onSale: !size.onSale })}
                          ariaLabel={t('item.sizesCol.onSale')}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        <button
                          type="button"
                          onClick={() => setSizes((list) => list.filter((_, i) => i !== index))}
                          aria-label={t('item.removeSize')}
                          className="inline-flex size-8 items-center justify-center rounded-sm transition-colors hover:bg-danger-100"
                        >
                          <img src={trashIcon} alt="" className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() =>
                setSizes((list) => [
                  ...list,
                  {
                    id: `size-${list.length + 1}`,
                    name: '',
                    delta: 0,
                    code: `${code}-${list.length + 1}`,
                    onSale: true,
                  },
                ])
              }
              className="mt-3 inline-flex h-[38px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={plusIcon} alt="" className="size-4" />
              {t('item.addASize')}
            </button>
          </Step>

          {/* 5 — add-ons */}
          <Step n={5} title={t('item.step.addOns')}>
            <div className="flex flex-wrap gap-2.5">
              {addOns.map((addOn) => (
                <span
                  key={addOn.id}
                  className="inline-flex h-[36px] items-center gap-2 rounded-sm border border-primary-100 bg-primary-25 px-3"
                >
                  <span className="text-sm font-medium text-primary-800">{addOn.name}</span>
                  <span className="text-xs font-medium text-text-quaternary tabular-nums">
                    {addOn.delta === 0 ? t('item.free') : `+${addOn.delta.toFixed(3)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAddOns((list) => list.filter((x) => x.id !== addOn.id))}
                    aria-label={t('item.removeAddOn')}
                    className="relative text-text-quaternary transition-colors after:absolute after:-inset-2 after:content-[''] hover:text-danger-700"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() =>
                  setAddOns((list) => [
                    ...list,
                    { id: `addon-${list.length + 1}`, name: '', delta: 0 },
                  ])
                }
                className="inline-flex h-[36px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                <img src={plusIcon} alt="" className="size-4" />
                {t('item.addOne')}
              </button>
            </div>
          </Step>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[300px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('item.atTheTill')}
            </h3>
            <div className="mt-3 overflow-hidden rounded-sm border border-border-subtle">
              <p className="bg-[#151c2d] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                {t('item.howItWillLook')}
              </p>
              <div className="bg-white p-3">
                {preview.lines.map((line, index) => (
                  <p
                    key={line.name}
                    className={[
                      'flex items-baseline justify-between gap-3 py-1 text-xs',
                      index === 0 ? 'font-medium text-text-primary' : 'text-text-tertiary',
                    ].join(' ')}
                  >
                    <span className={index === 0 ? '' : 'ps-3'}>{line.name}</span>
                    <span className="shrink-0 tabular-nums">{omr(line.amount)}</span>
                  </p>
                ))}
                <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-border-subtle pt-2 text-sm font-semibold text-text-primary">
                  <span>{t('item.total')}</span>
                  <span className="tabular-nums">
                    <span className="me-1 text-[10px] font-medium text-text-quaternary">OMR</span>
                    {omr(preview.total)}
                  </span>
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('item.readyToSell')}
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2">
                  <img
                    src={check.done ? tickIcon : circleIcon}
                    alt=""
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span
                    className={[
                      'text-sm font-medium leading-[1.4]',
                      check.done ? 'text-text-secondary' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {t(`item.ready.${check.id}${check.done ? '' : 'Off'}`)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('item.stock')}
            </h3>
            <div className="mt-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">{t('item.keepCount')}</p>
                <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t('item.keepCountNote')}
                </p>
              </div>
              <Switch checked={keepCount} onChange={setKeepCount} label={t('item.keepCount')} />
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('item.whereItsUsed')}
            </h3>
            <dl className="mt-2">
              <Row
                label={t('item.soldIn90')}
                value={existing ? SOLD_90.toLocaleString('en-US') : '0'}
              />
              <Row
                label={t('item.revenue')}
                value={existing ? `OMR ${omr(YEAR.broughtIn)}` : 'OMR 0.000'}
              />
              <Row
                label={t('item.mostPopularSize')}
                value={
                  existing
                    ? `${MOST_POPULAR_SIZE.name} · ${MOST_POPULAR_SIZE.share}%`
                    : t('item.none')
                }
              />
              <Row
                label={t('item.onOpenInvoices')}
                value={existing ? String(USED_SUMMARY.openQuotations) : '0'}
                last
              />
            </dl>
          </section>
        </aside>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {t('item.footer', { sizes: sizes.length, addOns: addOns.length })}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <Link
            to="/catalog"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('item.cancel')}
          </Link>
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('item.saveAndAddAnother')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/catalog')}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={tickWhiteIcon} alt="" className="size-4" />
            {t('item.save')}
          </button>
        </div>
      </div>
    </CatalogShell>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md bg-surface-card">
      <p className="flex items-center gap-2.5 p-5">
        <span className="flex size-6 items-center justify-center rounded-[4px] bg-primary-50 text-[11px] font-semibold text-primary-800">
          {n}
        </span>
        <span className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</span>
      </p>
      <div className="border-t border-surface-background p-5">{children}</div>
    </section>
  )
}

function ToggleRow({
  title,
  note,
  checked,
  onChange,
  last,
}: {
  title: string
  note: string
  checked: boolean
  onChange: (value: boolean) => void
  last?: boolean
}) {
  return (
    <li
      className={[
        'flex items-center justify-between gap-4 py-3.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-[1.3] text-text-primary">{title}</p>
        <p className="mt-1 max-w-[560px] text-xs font-medium leading-[1.5] text-text-quaternary">
          {note}
        </p>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </li>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd className="shrink-0 text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  )
}
