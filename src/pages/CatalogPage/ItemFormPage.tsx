import {
  useEffect,
  useId,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useReferenceData } from '../../lib/reference/referenceData'
import {
  CODED_REASON,
  DESIGN_REFERENCE,
  NEEDS_EXEMPTION_REASON,
  omanTaxCategories,
  reasonRequired,
} from '../../lib/invoiceDraft'
import { taxReasonsFor } from '../../lib/codeLists/taxReasons'
import { nameOf } from '../../lib/codeLists/codeList'
import {
  ClassificationField,
  DiscountField,
  selectAllOnFocus,
  unitOptions,
} from '../../components/invoice'
import type { DiscountType } from '../../lib/invoiceMath'
import { CatalogShell, Pill } from './CatalogShell'
import { ItemTabs } from './ItemTabs'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { useBranchName } from '../../components/branch/useBranchName'
import { Input, Modal, Rial, Select, Switch, TableCheckbox, withRial } from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  archiveProduct,
  createProduct,
  getProduct,
  productPath,
  updateProduct,
  type ProductDto,
} from '../../api/catalog/products'
import {
  PRODUCT_VERSION_CONFLICT,
  productFieldsFrom,
  productFormProblems,
  productRefusal,
  productRequestFrom,
} from '../../lib/productForm'
import { GROUPS, omr } from '../../lib/catalog'
import {
  ITEM,
  SIZES,
  ADD_ONS,
  FIRST_UNIT_OF_KIND,
  ITEM_TYPE_OF_KIND,
  TIME_UNITS,
  baseFromShelf,
  shelfPrice,
  sizePrice,
  tillPreview,
  readiness,
  type Size,
  type AddOn,
  type ItemKind,
} from '../../lib/catalogItem'
import type { ItemType } from '../../lib/invoiceDraft'
import handOverIcon from '../../assets/catalog/kind-bag.svg'
import youDoIcon from '../../assets/catalog/kind-service.svg'
import byTimeIcon from '../../assets/catalog/kind-hour.svg'
import severalIcon from '../../assets/catalog/kind-bundle.svg'
import tickIcon from '../../assets/catalog/check-green.svg'
import plusIcon from '../../assets/catalog/plus-muted.svg'
import trashIcon from '../../assets/catalog/trash-danger.svg'
import tickWhiteIcon from '../../assets/catalog/check-white.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const KINDS: { id: ItemKind; icon: string }[] = [
  { id: 'handOver', icon: handOverIcon },
  { id: 'youDo', icon: youDoIcon },
  { id: 'byTime', icon: byTimeIcon },
  { id: 'several', icon: severalIcon },
]

/** A price as the item keeps it: three decimals, `0.000` for nothing. */
const threeDecimals = (raw: string) => {
  const value = Number(raw.replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? value.toFixed(3) : '0.000'
}

/**
 * One item's own screen — new (Figma 135:44866) and existing (135:45974).
 *
 * The same form serves both; only the heading and the tabs differ. The receipt on the right is
 * built from the fields, so a size typed at +0.300 shows up as 1.700 before anything is saved.
 *
 * An item holds what an invoice line needs, so a line filled from it is complete (owner,
 * 21 Oct 2026). Saved on `/v1/products`: goods or service, name, description, code, unit, the
 * price before VAT, the VAT category and rate, and the classification (HS code or service type):
 * `POST` for a new item, `PUT` with the version that was read for an existing one, `DELETE` to
 * archive it. TODO(backend): the rest of the form (Arabic name, group, barcode, the no-VAT reason,
 * discount, till options, sizes, add-ons, branches, stock) has no field on the product yet and is
 * not sent; see docs/backend-guides/INCOME.md, rows P.3 to P.10.
 */
export function ItemFormPage({ mode }: { mode: 'new' | 'edit' }) {
  const { id } = useParams()
  const { t } = useTranslation()
  const canManage = useCanManageProducts()
  if (mode === 'edit') return <ExistingItem id={id ?? ''} />
  if (canManage !== true) {
    return (
      <CatalogShell
        crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { label: t('item.newItem') }]}
        title={t('item.newItem')}
      >
        {canManage === null ? <LoadingNotice /> : <PermissionDeniedNotice />}
      </CatalogShell>
    )
  }
  return <ItemEditor product={null} />
}

/**
 * Whether the reader may create, edit and archive products (`product.manage`); null while the
 * snapshot is loading. The page sits above the shell's session, so it reads the snapshot itself.
 */
export function useCanManageProducts(): boolean | null {
  const { entitlements, ready } = useEntitlements()
  if (!ready) return null
  return entitlements !== null && hasPermission(entitlements, 'product.manage')
}

/** `GET /v1/products/{id}` (INCOME.md P.13), then the form on what it answered. */
function ExistingItem({ id }: { id: string }) {
  const { t } = useTranslation()
  const path = productPath(id)
  const read = useApiRead<ProductDto>(path, () => getProduct(id))
  if (read.read.status === 'ready') {
    const product = read.read.data
    return (
      <ItemEditor key={`${product.id}@${product.version}`} product={product} reload={read.retry} />
    )
  }
  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { label: t('itemForm.item') }]}
      title={t('itemForm.item')}
    >
      {read.read.status === 'loading' ? (
        <LoadingNotice />
      ) : (
        <ApiReadFailure error={read.read.error} retry={read.retry} />
      )}
    </CatalogShell>
  )
}

/** The design's kind for a stored goods-or-service flag: services sold by time are "by time". */
const kindFor = (itemType: ItemType, unit: string): ItemKind =>
  itemType === 'goods'
    ? 'handOver'
    : TIME_UNITS.includes(unit) && unit !== 'ZZ'
      ? 'byTime'
      : 'youDo'

type Banner = { tone: 'error' | 'success'; lines: string[]; reload?: boolean }

function ItemEditor({
  product: loaded,
  reload,
}: {
  product: ProductDto | null
  reload?: () => void
}) {
  const { t, i18n } = useTranslation()
  const reference = useReferenceData()
  const navigate = useNavigate()
  const canManage = useCanManageProducts() === true
  const [product, setProduct] = useState<ProductDto | null>(loaded)
  const existing = product !== null
  const id = product?.id
  const archived = product !== null && !product.active
  // An archived product cannot be changed (PRODUCT_ARCHIVED); without product.manage nothing can.
  const readOnly = !canManage || archived

  // Oman's four categories from the platform's list, the design's until it answers (as the invoice).
  const categories = omanTaxCategories(
    reference?.taxCategories?.length ? reference.taxCategories : DESIGN_REFERENCE.taxCategories,
  )
  const stored = loaded ? productFieldsFrom(categories, loaded) : null

  const [kind, setKind] = useState<ItemKind>(
    stored ? kindFor(stored.itemType, stored.unit) : 'handOver',
  )
  const [name, setName] = useState(stored?.name ?? '')
  const [arabicName, setArabicName] = useState('')
  const [description, setDescription] = useState(stored?.description ?? ITEM.description)
  const [group, setGroup] = useState('brewedDrinks')
  const [itemKind, setItemKind] = useState('milkCoffee')
  const [code, setCode] = useState(stored?.code ?? '')
  const [barcode, setBarcode] = useState(ITEM.barcode)
  const [soldAs, setSoldAs] = useState(stored?.unit ?? ITEM.soldAs)
  const [hsCode, setHsCode] = useState(stored?.hsCode ?? ITEM.hsCode)
  const [serviceType, setServiceType] = useState(stored?.serviceType ?? ITEM.serviceType)
  // What was typed: the price before VAT, or with VAT in it while "Price includes VAT" is on.
  const [priceText, setPriceText] = useState(
    stored
      ? stored.basePrice
      : (ITEM.priceIncludesVat ? shelfPrice(ITEM.basePrice) : ITEM.basePrice).toFixed(3),
  )
  const [taxCategory, setTaxCategory] = useState(stored?.taxCode || ITEM.taxCategory)
  const [reasonCode, setReasonCode] = useState(ITEM.exemptionReasonCode)
  const [reasonText, setReasonText] = useState(ITEM.exemptionReason)
  const [discountType, setDiscountType] = useState<DiscountType>(ITEM.discountType)
  const [discountValue, setDiscountValue] = useState(ITEM.discountValue)
  const [includesVat, setIncludesVat] = useState(ITEM.priceIncludesVat)
  const [staffCanChange, setStaffCanChange] = useState(ITEM.staffCanChangePrice)
  const [keepCount, setKeepCount] = useState(ITEM.keepCountOfThis)
  const [sizes, setSizes] = useState<Size[]>(SIZES)
  const [addOns, setAddOns] = useState<AddOn[]>(ADD_ONS)
  // Branches (owner, 21 Oct 2026; Business Rules BA-3): one company product, sold in every branch
  // or only in chosen ones, with an optional price per branch. Its VAT and HS code never differ
  // by branch. TODO(backend): the product does not carry branch settings yet (INCOME.md P.9).
  const branchRead = useWorkingBranch()
  const { label: branchLabel } = useBranchName()
  const [allBranches, setAllBranches] = useState(true)
  const [soldIn, setSoldIn] = useState<Record<string, boolean>>({})
  const [branchPrices, setBranchPrices] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  // Reference data may answer after the product: the tax option is then found by category and rate.
  useEffect(() => {
    if (!loaded || !reference?.taxCategories?.length) return
    const option = productFieldsFrom(categories, loaded).taxCode
    if (option) setTaxCategory((current) => (current === option ? current : option))
    // Only when the platform's list arrives; a category picked since is not overwritten after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference?.taxCategories?.length, loaded])

  const itemType = ITEM_TYPE_OF_KIND[kind]
  const tax = categories.find((row) => row.code === taxCategory) ?? categories[0] ?? null
  const category = tax?.en16931Category ?? 'S'
  const rate = Number(tax?.rate ?? 0) / 100
  const typed = Number(priceText) || 0
  const base = includesVat ? baseFromShelf(typed, rate) : typed
  const shelf = includesVat ? typed : shelfPrice(base, rate)
  const discountAmount =
    discountType === 'PERCENTAGE'
      ? Math.round(base * (Number(discountValue) || 0) * 10) / 1000
      : Number(discountValue) || 0

  const preview = useMemo(
    () =>
      tillPreview(base, sizes[1]?.id ?? sizes[0]?.id ?? 'regular', ['extraShot', 'oatMilk'], rate),
    [base, sizes, rate],
  )

  const classification = itemType === 'goods' ? hsCode : serviceType
  const checks = readiness({
    name,
    basePrice: base,
    taxCategory,
    group,
    kind: itemKind,
    barcode,
    reasonGiven:
      !reasonRequired(category) ||
      (CODED_REASON.has(category) ? reasonCode !== '' : reasonText.trim() !== ''),
    classified: classification !== '',
  })

  const units = unitOptions(itemType, t, soldAs, reference).filter(
    (option) => kind !== 'byTime' || TIME_UNITS.includes(option.value) || option.value === soldAs,
  )
  /** The unit and classification follow the kind, as they follow the invoice's toggle. */
  const pickKind = (next: ItemKind) => {
    setKind(next)
    const allowed = unitOptions(ITEM_TYPE_OF_KIND[next], t, undefined, reference)
      .map((option) => option.value)
      .filter((code) => next !== 'byTime' || TIME_UNITS.includes(code))
    if (!allowed.includes(soldAs)) setSoldAs(FIRST_UNIT_OF_KIND[next])
  }
  /** A new category's reason belongs to the old one, so it is cleared (as on the invoice line). */
  const pickTaxCategory = (code: string) => {
    if (code === taxCategory) return
    const next = categories.find((row) => row.code === code)
    const nextRate = Number(next?.rate ?? 0) / 100
    // With VAT included, the shelf price stays what was typed and the base moves.
    if (!includesVat) setPriceText(base.toFixed(3))
    else setPriceText(shelfPrice(baseFromShelf(typed, rate), nextRate).toFixed(3))
    setTaxCategory(code)
    setReasonCode('')
    setReasonText('')
  }
  /** Flipping "Price includes VAT" keeps the price and converts what is typed. */
  const pickIncludesVat = (next: boolean) => {
    if (next === includesVat) return
    setPriceText((next ? shelf : base).toFixed(3))
    setIncludesVat(next)
  }
  const reasons = taxReasonsFor(category) ?? []

  /** The fields the product record holds, as the form has them now. */
  const fields = () => ({
    itemType,
    name,
    description,
    code,
    unit: soldAs,
    basePrice: base.toFixed(3),
    taxCode: tax?.code ?? '',
    hsCode,
    serviceType,
    isicCode: stored?.isicCode ?? null,
  })

  const refused = (error: unknown) => {
    const refusal = productRefusal(error)
    if (refusal) {
      setBanner({
        tone: 'error',
        lines: [t(refusal.key)],
        reload: refusal.code === PRODUCT_VERSION_CONFLICT && Boolean(reload),
      })
      return
    }
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setBanner({
      tone: 'error',
      lines: [
        message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
      ],
    })
  }

  /** `POST` a new item, `PUT` an existing one with the version that was read. */
  const save = async (another: boolean) => {
    if (readOnly || saving) return
    setBanner(null)
    const current = fields()
    const problems = productFormProblems(current)
    if (problems.length > 0) {
      setBanner({ tone: 'error', lines: problems.map((problem) => t(problem.key)) })
      return
    }
    setSaving(true)
    try {
      const body = productRequestFrom(categories, current)
      const result = product
        ? await updateProduct(product.id, product.version, body)
        : await createProduct(body)
      if (another) {
        navigate('/catalog/new', { replace: true })
        setName('')
        setCode('')
        setBanner({ tone: 'success', lines: [t('itemForm.savedNamed', { name: result.name })] })
      } else if (!product) {
        navigate(`/catalog/${encodeURIComponent(result.id)}`, { replace: true })
      } else {
        setProduct(result)
        setSaved(true)
      }
    } catch (error) {
      refused(error)
    } finally {
      setSaving(false)
    }
  }

  /** `DELETE` archives; issued invoices keep naming the product. */
  const archive = async () => {
    if (!product) return
    setConfirmArchive(false)
    setBanner(null)
    try {
      setProduct(await archiveProduct(product.id, product.version))
      setBanner({ tone: 'success', lines: [t('itemForm.offSaleDone')] })
    } catch (error) {
      refused(error)
    }
  }

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
        { label: product ? product.name : t('item.newItem') },
      ]}
      title={product ? name || product.name : t('item.newItem')}
      // The product records no date it was added, so the subtitle names none.
      subtitle={t('item.metaNoDate', {
        group: GROUPS.find((entry) => entry.id === group)?.name ?? '',
        kind: kindOptions.find((entry) => entry.value === itemKind)?.label ?? '',
        code,
      })}
      pills={
        archived ? (
          <Pill tone="neutral">{t('itemForm.offSale')}</Pill>
        ) : existing ? (
          // TODO(backend): the product carries no sales figures, so the sold-times pill is not drawn.
          <Pill tone="success">{t('item.onSale')}</Pill>
        ) : (
          <>
            <Chip>{t('item.notLive')}</Chip>
            <Chip>{t('item.soldNone')}</Chip>
          </>
        )
      }
      actions={
        <>
          {existing && !archived && canManage ? (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100"
            >
              {t('catalog.rowMenu.switchOff')}
            </button>
          ) : null}
          <Link
            to="/catalog"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {readOnly ? t('common.back') : t('item.cancel')}
          </Link>
          {readOnly ? null : (
            <button
              type="button"
              onClick={() => void save(false)}
              disabled={saving}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              {saving ? t('common.saving') : saved ? t('item.saved') : t('item.save')}
            </button>
          )}
        </>
      }
      tabs={existing ? <ItemTabs id={id ?? ITEM.id} active="details" /> : undefined}
    >
      {banner ? (
        <div
          role={banner.tone === 'error' ? 'alert' : 'status'}
          className={[
            'flex flex-wrap items-center justify-between gap-3 rounded-md px-5 py-3 text-sm font-medium',
            banner.tone === 'error'
              ? 'bg-danger-100 text-danger-700'
              : 'bg-success-100 text-[#3d5648]',
          ].join(' ')}
        >
          <ul>
            {banner.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {banner.reload && reload ? (
            <button
              type="button"
              onClick={reload}
              className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary"
            >
              {t('itemForm.reload')}
            </button>
          ) : null}
        </div>
      ) : null}
      {archived ? (
        <p className="rounded-md bg-surface-card px-5 py-3 text-sm font-medium text-text-tertiary">
          {t('itemForm.archivedNote')}
        </p>
      ) : null}
      {/* Read-only for an archived product and for a reader without product.manage. */}
      <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
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
                      onClick={() => pickKind(entry.id)}
                      aria-pressed={picked}
                      className={[
                        'flex min-w-0 flex-col rounded-sm border p-3.5 text-start transition-colors',
                        picked
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:bg-primary-25',
                      ].join(' ')}
                    >
                      <span className="flex size-8 items-center justify-center rounded-md bg-surface-background">
                        <img src={entry.icon} alt="" className="size-4" />
                      </span>
                      {/* One line each, as the frame draws the cards; the full words stay in the
                        tooltip and the accessible name. */}
                      <span
                        title={t(`item.kind.${entry.id}`)}
                        className={[
                          'mt-2.5 w-full truncate text-[13px] font-medium leading-[1.3]',
                          picked ? 'text-primary-800' : 'text-text-primary',
                        ].join(' ')}
                      >
                        {t(`item.kind.${entry.id}`)}
                      </span>
                      <span
                        title={t(`item.kind.${entry.id}Note`)}
                        className="mt-1 w-full truncate text-[11px] font-medium leading-[1.4] text-text-quaternary"
                      >
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
                <Field
                  filled
                  label={t('item.name')}
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <Field
                  filled
                  dir="rtl"
                  label={t('item.arabicName')}
                  value={arabicName}
                  onChange={(event) => setArabicName(event.target.value)}
                />
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-text-primary">
                    {t('item.description')}
                  </span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-sm border border-transparent bg-surface-background px-4 py-3 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-brand"
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
                        quiet
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
                        quiet
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
                  <Input
                    bordered
                    label={t('item.itemCode')}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    dir="ltr"
                  />
                  <Input
                    bordered
                    label={t('item.barcode')}
                    labelNote={t('item.barcodeHint')}
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
                      quiet
                      ariaLabel={t('item.soldAs')}
                      value={soldAs}
                      onChange={setSoldAs}
                      options={units}
                    />
                  </label>
                </div>

                {/* PINT-OM classification: the HS code of goods (IBR-079-OM) or the
                  CL-12-OM service type of a service (IBR-155-OM); 12 digits on CL-08-OM-HS
                  (IBR-080-OM). Stored on every item; the
                  invoice prints it for business and government buyers only. */}
                <div className="block">
                  <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                    {t(
                      itemType === 'goods' ? 'classification.hsCode' : 'classification.serviceType',
                    )}
                    <span className="text-danger-700">*</span>
                  </span>
                  <ClassificationField
                    kind={itemType}
                    value={classification}
                    onChange={itemType === 'goods' ? setHsCode : setServiceType}
                    ariaLabel={t(
                      itemType === 'goods' ? 'classification.hsCode' : 'classification.serviceType',
                    )}
                  />
                  <p className="mt-1.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                    {t('item.classificationHint')}
                  </p>
                </div>
              </div>
            </Step>

            {/* 3 — price and tax */}
            <Step n={3} title={t('item.step.price')}>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label={t('item.basePrice')}
                  required={!includesVat}
                  note={t('item.beforeVat')}
                  value={includesVat ? omr(base) : priceText}
                  readOnly={includesVat}
                  inputMode="decimal"
                  style={{ textAlign: 'end' }}
                  onFocus={selectAllOnFocus}
                  onChange={(event) => setPriceText(event.target.value.replace(/[^\d.]/g, ''))}
                  onBlur={() => setPriceText((text) => threeDecimals(text))}
                  leading={
                    <span className="text-sm font-medium text-text-primary">
                      <Rial />
                    </span>
                  }
                />
                {/* TODO(backend): zero-rated goods are recognised by HS code. The backend matches the
                  item's 12-digit HS code against Oman's zero-rated lists (807 grocery items, MD
                  65/2021; 677 medicines and medical equipment; 62 veterinary medicines and
                  equipment), then sets category Z with its VATZR-OM reason code. The user can
                  still change it; this picker only shows the suggestion. */}
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                    {t('item.taxCategory')}
                    <span className="text-danger-700">*</span>
                  </span>
                  <Select
                    quiet
                    ariaLabel={t('item.taxCategory')}
                    value={tax?.code ?? taxCategory}
                    onChange={pickTaxCategory}
                    options={categories.map((row) => ({
                      value: row.code,
                      label: t(`createInvoice.taxCategories.${row.code}`, {
                        defaultValue: row.code,
                      }),
                      hint: `EN 16931 · ${row.en16931Category}`,
                    }))}
                  />
                </label>
                <Field
                  label={t('item.priceOnTheShelf')}
                  required={includesVat}
                  note={t('item.whatCustomerPays')}
                  value={includesVat ? priceText : omr(shelf)}
                  readOnly={!includesVat}
                  inputMode="decimal"
                  style={{ textAlign: 'end' }}
                  onFocus={selectAllOnFocus}
                  onChange={(event) => setPriceText(event.target.value.replace(/[^\d.]/g, ''))}
                  onBlur={() => setPriceText((text) => threeDecimals(text))}
                  leading={
                    <span className="text-sm font-medium text-text-primary">
                      <Rial />
                    </span>
                  }
                />
              </div>

              {/* The reason a zero-rated or exempt item carries no VAT (IBT-121): a VATZR-OM code
                for Z, a VATEX-OM code for E (CL-05-OM, CL-10-OM), written text for O. */}
              {CODED_REASON.has(category) || NEEDS_EXEMPTION_REASON.has(category) ? (
                <div className="mt-5">
                  {CODED_REASON.has(category) ? (
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                        {t('invoiceDraft.exemptionReason')}
                        <span className="text-danger-700">*</span>
                      </span>
                      <Select
                        quiet
                        value={reasonCode}
                        onChange={setReasonCode}
                        options={reasons.map((reason) => ({
                          value: reason.code,
                          label: nameOf(reason, i18n.language),
                          hint: reason.code,
                        }))}
                        placeholder={t('invoiceDraft.exemptionReasonChoose')}
                        ariaLabel={t('invoiceDraft.exemptionReason')}
                      />
                    </label>
                  ) : (
                    <Field
                      label={t('invoiceDraft.exemptionReason')}
                      required={reasonRequired(category)}
                      value={reasonText}
                      maxLength={500}
                      placeholder={t('invoiceDraft.exemptionReasonType')}
                      onChange={(event) => setReasonText(event.target.value)}
                    />
                  )}
                </div>
              ) : null}

              {/* The catalogue discount: the invoice line picked from this item starts with it. */}
              <div className="mt-5 max-w-[320px]">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  {t('item.discount')}
                </span>
                <DiscountField
                  type={discountType}
                  value={discountValue}
                  onTypeChange={setDiscountType}
                  onValueChange={(next) => setDiscountValue(next.replace(/[^\d.]/g, ''))}
                  resolved={BigInt(Math.round(discountAmount * 1000))}
                />
                <p className="mt-1.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                  {t('item.discountHint')}
                </p>
              </div>

              <ul className="mt-4">
                <ToggleRow
                  title={t('item.priceIncludesVat')}
                  note={t('item.priceIncludesVatNote')}
                  checked={includesVat}
                  onChange={pickIncludesVat}
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
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="bg-[#151c2d] text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                      <th className="h-[38px] min-w-[150px] px-3 text-start font-semibold">
                        {t('item.sizesCol.size')}
                      </th>
                      <th className="h-[38px] px-3 text-start font-semibold">
                        {t('item.sizesCol.priceChange')}
                      </th>
                      <th className="h-[38px] w-[110px] whitespace-nowrap px-3 text-end font-semibold">
                        {t('item.sizesCol.sellsFor')}
                      </th>
                      <th className="h-[38px] px-3 text-start font-semibold">
                        {t('item.sizesCol.code')}
                      </th>
                      <th className="h-[38px] whitespace-nowrap px-3 text-start font-semibold">
                        {t('item.sizesCol.onSale')}
                      </th>
                      <th className="h-[38px] px-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {sizes.map((size, index) => (
                      <tr
                        key={size.id}
                        className="border-b border-surface-background last:border-0"
                      >
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
                            value={size.delta === 0 ? '0.000' : `+${size.delta.toFixed(3)}`}
                            onFocus={selectAllOnFocus}
                            inputMode="decimal"
                            dir="ltr"
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
                          <span className="flex h-[42px] items-center justify-end rounded-sm border border-border-default bg-white px-3 text-sm font-normal text-text-primary tabular-nums">
                            {omr(sizePrice(base, size, rate))}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            value={size.code}
                            onChange={(event) => setSize(index, { code: event.target.value })}
                            aria-label={t('item.sizesCol.code')}
                            dir="ltr"
                            className="h-[42px] w-full rounded-sm border border-border-default bg-white px-3 text-sm font-normal text-text-primary outline-none focus:border-border-brand"
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

              <div className="mt-3 flex flex-wrap gap-2.5">
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
                  className="inline-flex h-[38px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                >
                  <img src={plusIcon} alt="" className="size-4" />
                  {t('item.addASize')}
                </button>
                <Link
                  to={`/catalog/${id ?? ITEM.id}/options`}
                  className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-25"
                >
                  {t('itemOptions.openLink')}
                </Link>
              </div>
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

            {/* 6 — branches */}
            <Step n={6} title={t('item.step.branches')}>
              <div
                role="radiogroup"
                aria-label={t('item.step.branches')}
                className="grid gap-3 sm:grid-cols-2"
              >
                {[true, false].map((everywhere) => {
                  const picked = allBranches === everywhere
                  return (
                    <button
                      key={String(everywhere)}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      onClick={() => setAllBranches(everywhere)}
                      className={[
                        'flex flex-col rounded-sm border p-4 text-start transition-colors',
                        picked
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:bg-primary-25',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'text-sm font-semibold',
                          picked ? 'text-primary-800' : 'text-text-primary',
                        ].join(' ')}
                      >
                        {t(everywhere ? 'item.branches.all' : 'item.branches.chosen')}
                      </span>
                      <span className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                        {t(everywhere ? 'item.branches.allNote' : 'item.branches.chosenNote')}
                      </span>
                    </button>
                  )
                })}
              </div>

              {branchRead.read.status === 'loading' ? (
                <p className="mt-4 text-sm font-medium text-text-quaternary">
                  {t('appAccess.loading')}
                </p>
              ) : branchRead.branches.length === 0 ? (
                <p className="mt-4 text-sm font-medium text-text-quaternary">
                  {t(
                    branchRead.read.status === 'failed'
                      ? 'invoiceDraft.branchesFailed'
                      : 'workingBranch.none',
                  )}
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2.5">
                  {branchRead.branches.map((branch) => {
                    const on = allBranches || soldIn[branch.id] === true
                    return (
                      <li
                        key={branch.id}
                        className="flex flex-wrap items-center gap-3 rounded-sm border border-border-subtle px-3 py-2.5"
                      >
                        {allBranches ? null : (
                          <TableCheckbox
                            checked={on}
                            onChange={() =>
                              setSoldIn((current) => ({ ...current, [branch.id]: !on }))
                            }
                            ariaLabel={t('item.branches.soldHere', { branch: branchLabel(branch) })}
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <bdi className="block truncate text-sm font-semibold text-text-primary">
                            {branchLabel(branch)}
                          </bdi>
                          <span className="text-xs font-medium text-text-quaternary">
                            {on ? t('item.branches.sold') : t('item.branches.notSold')}
                          </span>
                        </span>
                        <label className="flex h-[42px] w-[160px] items-center gap-2 rounded-sm border border-border-default bg-white px-3 focus-within:border-border-brand">
                          <span className="text-sm font-medium text-text-primary">
                            <Rial />
                          </span>
                          <input
                            value={branchPrices[branch.id] ?? ''}
                            disabled={!on}
                            placeholder={base.toFixed(3)}
                            inputMode="decimal"
                            onFocus={selectAllOnFocus}
                            onChange={(event) =>
                              setBranchPrices((current) => ({
                                ...current,
                                [branch.id]: event.target.value.replace(/[^\d.]/g, ''),
                              }))
                            }
                            onBlur={() =>
                              setBranchPrices((current) => {
                                const typed = current[branch.id] ?? ''
                                return {
                                  ...current,
                                  [branch.id]: Number(typed) > 0 ? Number(typed).toFixed(3) : '',
                                }
                              })
                            }
                            aria-label={t('item.branches.priceHere', { branch: branchLabel(branch) })}
                            className="w-full min-w-0 bg-transparent text-end text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder disabled:text-text-quaternary"
                            dir="ltr"
                          />
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className="mt-3 text-xs font-medium leading-[1.5] text-text-quaternary">
                {t('item.branches.note')}
              </p>
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
                      <span className="me-1">
                        <Rial />
                      </span>
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
                    {check.done ? (
                      <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                    ) : (
                      // Still to do: an empty circle, as the frame draws it.
                      <span
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 rounded-full border-[1.5px] border-text-quaternary"
                      />
                    )}
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
                <Row label={t('item.soldIn90')} value={'0'} />
                <Row label={t('item.revenue')} value={'OMR 0.000'} />
                <Row label={t('item.mostPopularSize')} value={t('item.none')} />
                <Row label={t('item.onOpenInvoices')} value={'0'} last />
              </dl>
            </section>
          </aside>
        </div>
      </fieldset>

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
          {readOnly ? null : (
            <>
              <button
                type="button"
                onClick={() => void save(true)}
                disabled={saving}
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60"
              >
                {t('item.saveAndAddAnother')}
              </button>
              <button
                type="button"
                onClick={() => void save(false)}
                disabled={saving}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
              >
                <img src={tickWhiteIcon} alt="" className="size-4" />
                {saving ? t('common.saving') : t('item.save')}
              </button>
            </>
          )}
        </div>
      </div>

      <Modal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={t('itemForm.offSaleTitle')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmArchive(false)}
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void archive()}
              className="inline-flex h-11 items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white"
            >
              {t('catalog.rowMenu.switchOff')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('itemForm.offSaleBody', { name: product?.name ?? '' })}
        </p>
      </Modal>
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
      <dd className="shrink-0 text-sm font-semibold text-text-primary">{withRial(value)}</dd>
    </div>
  )
}

/** A grey state chip for an item not yet saved ("Not live", "Sold 0 times"), as the New Item frame draws it. */
function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-border-subtle px-3 text-xs font-medium text-text-tertiary">
      <span className="size-1.5 rounded-full bg-[#a8abb2]" />
      {children}
    </span>
  )
}

/**
 * A labelled text field drawn here rather than with the shared `Input`: its required mark is red
 * as on every other label of this form, its note ("before VAT") sits beside the label as the
 * frame draws it, and `filled` gives the grey box of the frame's Name and Arabic name.
 */
function Field({
  label,
  required,
  note,
  filled,
  leading,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  required?: boolean
  note?: string
  filled?: boolean
  leading?: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex w-full flex-col gap-1">
      <label
        htmlFor={id}
        className="flex min-w-0 items-baseline gap-0.5 whitespace-nowrap text-sm font-medium text-text-primary"
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger-700">
            *
          </span>
        ) : null}
        {note ? (
          <span className="ms-1.5 min-w-0 truncate text-xs font-normal text-text-quaternary">
            {note}
          </span>
        ) : null}
      </label>
      <div
        className={[
          'flex h-[50px] items-center gap-2 rounded-sm border px-4 transition-colors focus-within:border-border-brand',
          filled ? 'border-transparent bg-surface-background' : 'border-border-default bg-white',
        ].join(' ')}
      >
        {leading ? <span className="inline-flex shrink-0">{leading}</span> : null}
        <input
          id={id}
          aria-required={required || undefined}
          className="h-full w-full min-w-0 border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          {...props}
        />
      </div>
    </div>
  )
}
