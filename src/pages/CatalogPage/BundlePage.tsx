import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { CatalogShell, Pill } from './CatalogShell'
import { RialFigure } from './RialFigure'
import {
  Combobox,
  Input,
  Select,
  Switch,
  Rial,
  withRial,
  type SelectOption,
} from '../../components/ui'
import { selectAllOnFocus } from '../../components/invoice'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { omr } from '../../lib/catalog'
import { describeApiFailure } from '../../lib/apiFailure'
import { ApiError } from '../../api/errors'
import type { Page } from '../../api'
import {
  getProduct,
  productSearchPath,
  searchProducts,
  type ProductDto,
} from '../../api/catalog/products'
import {
  BUNDLE_REPORT_PERMISSIONS,
  archiveBundle,
  bundleInvoiceLinesPath,
  bundlePath,
  bundleReportPath,
  createBundle,
  getBundle,
  getBundleInvoiceLines,
  getBundleReport,
  reactivateBundle,
  updateBundle,
  type BundleDto,
  type BundleInvoiceLinesDto,
  type BundleReportDto,
} from '../../api/catalog/bundles'
import { bundleVat, partsValue, round3 } from '../../lib/catalogInsights'
import { useCanManageProducts } from './ItemFormPage'
import { useKindNames } from './itemRecordHooks'
import {
  bundleRequest,
  canMakeOf,
  partFromProduct,
  partIcon,
  partsFromBundle,
  type EditPart,
} from '../../lib/bundleForm'
import plusIcon from '../../assets/catalog/plus-muted.svg'
import trashIcon from '../../assets/catalog/trash-danger.svg'
import tickWhiteIcon from '../../assets/catalog/check-white.svg'
import dragIcon from '../../assets/catalog/drag.svg'

/**
 * One bundle (Figma 135:48138), from `GET /v1/bundles/{id}` and saved with `POST` / `PUT`
 * (the version it read), switched off with `DELETE` and brought back with `/reactivate`. The
 * price is typed before VAT; the saving, VAT and what the customer pays follow the parts. "On the
 * invoice" previews the saved bundle's lines from `/invoice-lines`, which split a bundle whose
 * parts' VAT differs. Dropped from the frame (owner, 28 Oct 2026): "Take a percentage off" and
 * time windows (price rules now) and the "take the parts out of stock" switch (always on).
 */
export function BundlePage() {
  const { id } = useParams()
  const branchRead = useWorkingBranch()
  const branchId = branchRead.branch?.id ?? null
  const waiting = branchRead.read.status === 'loading'
  const path = id ? bundlePath(id, branchId) : null
  const read = useApiRead<BundleDto>(waiting ? null : path, () => getBundle(path!))
  const { t } = useTranslation()

  if (!id) return <BundleEditor bundle={null} branchId={branchId} onSaved={() => {}} />
  if (read.read.status === 'ready') {
    const bundle = read.read.data
    return (
      <BundleEditor
        key={`${bundle.id}@${bundle.version}`}
        bundle={bundle}
        branchId={branchId}
        onSaved={read.retry}
      />
    )
  }
  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'bundles.title', to: '/catalog/bundles' },
      ]}
      title={t('bundles.title')}
    >
      {read.read.status === 'failed' ? (
        <ApiReadFailure error={read.read.error} retry={read.retry} />
      ) : (
        <LoadingNotice />
      )}
    </CatalogShell>
  )
}

function BundleEditor({
  bundle,
  branchId,
  onSaved,
}: {
  bundle: BundleDto | null
  branchId: string | null
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const canManage = useCanManageProducts() === true
  const { entitlements } = useEntitlements()
  const canReport =
    entitlements !== null &&
    BUNDLE_REPORT_PERMISSIONS.some((code) => hasPermission(entitlements, code))
  const { groups } = useKindNames()

  const [name, setName] = useState(bundle?.name ?? '')
  const [code, setCode] = useState(bundle?.code ?? '')
  const [kindId, setKindId] = useState(bundle?.kindId ?? '')
  const [description, setDescription] = useState(bundle?.description ?? '')
  const [parts, setParts] = useState<EditPart[]>(() => (bundle ? partsFromBundle(bundle) : []))
  const [price, setPrice] = useState((bundle?.basePrice ?? 0).toFixed(3))
  const [showParts, setShowParts] = useState(bundle?.showParts ?? true)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const archived = bundle !== null && !bundle.active
  const editable = canManage && !archived
  const touch = () => setDirty(true)

  const linesPath = bundle ? bundleInvoiceLinesPath(bundle.id, { branchId, quantity: 1 }) : null
  const lines = useApiRead<BundleInvoiceLinesDto>(linesPath, () =>
    getBundleInvoiceLines(linesPath!),
  )
  const reportPath = bundleReportPath({ branchId })
  const report = useApiRead<BundleReportDto>(bundle && canReport ? reportPath : null, () =>
    getBundleReport(reportPath),
  )
  const reportRow =
    report.read.status === 'ready'
      ? (report.read.data.bundles.find((row) => row.bundleId === bundle?.id) ?? null)
      : null

  /** Everything below follows from the parts and the one price typed above. */
  const working = useMemo(() => {
    const before = round3(Number(price) || 0)
    const value = partsValue(parts)
    const amount = round3(value - before)
    const { vat, rate } = bundleVat(before, parts)
    const unavailable = !dirty && (bundle?.availability?.unavailableBecause.length ?? 0) > 0
    const make = unavailable
      ? { count: 0, limitedBy: bundle?.availability?.limitedByName ?? null }
      : canMakeOf(parts)
    return {
      before,
      parts: value,
      save: { amount, percent: value > 0 ? Math.round((amount / value) * 1000) / 10 : 0 },
      vat,
      rate,
      pays: round3(before + vat),
      make,
    }
  }, [parts, price, dirty, bundle])

  const setPart = (key: string, change: Partial<EditPart>) => {
    touch()
    setParts((list) => list.map((part) => (part.key === key ? { ...part, ...change } : part)))
  }

  const kindOptions: SelectOption[] = groups.flatMap((group) =>
    group.kinds.map((kind) => ({
      value: kind.id,
      label: `${i18n.language.startsWith('ar') && group.nameAr ? group.nameAr : group.name} › ${
        i18n.language.startsWith('ar') && kind.nameAr ? kind.nameAr : kind.name
      }`,
    })),
  )

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.code) {
      const key = `bundle.refusal.${error.code}`
      if (i18n.exists(key)) {
        setProblem(t(key))
        return
      }
    }
    const message = describeApiFailure(error)
    setProblem(t(message.key, message.values))
  }

  const valid = name.trim() !== '' && code.trim() !== '' && parts.length >= 2 && parts.length <= 50

  /** Saves the bundle; `switchOff` archives it straight after (Save & switch off for now). */
  const save = async (switchOff = false) => {
    if (!editable || busy) return
    if (!valid) {
      setProblem(t('bundle.needsMore'))
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const body = bundleRequest({
        code,
        name,
        description,
        kindId,
        price,
        showParts,
        parts,
        base: bundle,
      })
      let saved = bundle
        ? await updateBundle(bundle.id, bundle.version, body)
        : await createBundle(body)
      if (switchOff) saved = await archiveBundle(saved.id, saved.version)
      if (!bundle || switchOff) navigate(`/catalog/bundles/${encodeURIComponent(saved.id)}`)
      onSaved()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const bringBack = async () => {
    if (!bundle || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await reactivateBundle(bundle.id, bundle.version)
      onSaved()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  const title = bundle?.name ?? t('bundles.newBundle')
  const savedLines = lines.read.status === 'ready' ? lines.read.data : null
  const linesVat = savedLines
    ? round3(
        savedLines.lines.reduce(
          (sum, line) =>
            sum + (line.quantity * line.unitPrice * (line.taxCategory?.rate ?? 0)) / 100,
          0,
        ),
      )
    : null
  const linesNet = savedLines
    ? round3(savedLines.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0))
    : null
  const counted = parts.filter((part) => part.counted && part.onHand !== null)

  return (
    <CatalogShell
      crumbs={[
        { labelKey: 'catalog.title', to: '/catalog' },
        { labelKey: 'bundles.title', to: '/catalog/bundles' },
        { label: title },
      ]}
      title={title}
      subtitle={undefined}
      pills={
        <>
          {archived ? <Pill tone="neutral">{t('bundles.tab.switchedOff')}</Pill> : null}
          <Pill tone="success">
            <Trans
              i18nKey="bundle.savesTheCustomer"
              values={{ amount: omr(Math.max(0, working.save.amount)) }}
              components={{ amount: <RialFigure /> }}
            />
          </Pill>
        </>
      }
      actions={
        <>
          <Link
            to="/catalog/bundles"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('bundle.cancel')}
          </Link>
          {archived && canManage ? (
            <button
              type="button"
              onClick={() => void bringBack()}
              disabled={busy}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              {t('bundles.bringItBack')}
            </button>
          ) : editable ? (
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              {bundle && !dirty ? t('bundle.saved') : t('bundle.save')}
            </button>
          ) : null}
        </>
      }
    >
      <p className="-mt-2 text-sm font-medium leading-[1.5] text-[#8f8f8f]">
        {bundle && reportRow ? (
          <Trans
            i18nKey="bundle.subtitle"
            values={{ count: reportRow.unitsSold.toLocaleString('en-US'), code: bundle.code }}
            components={{ b: <b className="font-semibold text-text-secondary" /> }}
          />
        ) : (
          t('bundle.subtitleNew')
        )}
      </p>

      {problem ? (
        <p
          role="alert"
          className="rounded-md bg-danger-100 px-5 py-3 text-sm font-medium text-danger-700"
        >
          {problem}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Step n={1} title={t('bundle.step.basics')}>
            <div className="grid gap-4">
              <Input
                bordered
                label={t('bundle.name')}
                requiredMark
                value={name}
                readOnly={!editable}
                onChange={(event) => {
                  touch()
                  setName(event.target.value)
                }}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-text-secondary">
                    {t('bundle.whereItLives')}
                  </span>
                  <Select
                    quiet
                    ariaLabel={t('bundle.whereItLives')}
                    value={kindId}
                    disabled={!editable}
                    placeholder={t('item.kindChoose')}
                    onChange={(value) => {
                      touch()
                      setKindId(value)
                    }}
                    options={kindOptions}
                  />
                </label>
                <Input
                  bordered
                  label={t('bundle.itemCode')}
                  requiredMark={!bundle}
                  value={code}
                  dir="ltr"
                  readOnly={Boolean(bundle) || !editable}
                  onChange={(event) => {
                    touch()
                    setCode(event.target.value)
                  }}
                />
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                  {t('bundle.description')}
                </span>
                <textarea
                  value={description}
                  readOnly={!editable}
                  onChange={(event) => {
                    touch()
                    setDescription(event.target.value)
                  }}
                  rows={3}
                  className="w-full resize-none rounded-sm border border-border-default bg-white px-3 py-2.5 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-brand"
                />
              </label>
            </div>
          </Step>

          <Step n={2} title={t('bundle.step.inside')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
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
                  {parts.map((part) => {
                    const scarcest = working.make.limitedBy === part.name && part.counted
                    /** Each part is its own bordered card, drawn on the cells of a separated row. */
                    const cell = [
                      'border-y px-3 py-3 first:rounded-s-md first:border-s last:rounded-e-md last:border-e',
                      scarcest
                        ? 'border-pending-500/40 bg-pending-100/40'
                        : 'border-border-subtle bg-white',
                    ].join(' ')
                    return (
                      <tr key={part.key}>
                        <td className={cell}>
                          <div className="flex items-center gap-2.5">
                            <img
                              src={dragIcon}
                              alt=""
                              className="size-4 shrink-0 cursor-grab opacity-50"
                            />
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-50">
                              <img src={partIcon(part.goodsOrService)} alt="" className="size-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-text-primary">
                                <bdi>{part.name}</bdi>
                              </span>
                              <span
                                className="mt-0.5 block text-xs font-medium text-text-quaternary"
                                dir="ltr"
                              >
                                {part.code}
                              </span>
                              {part.variants && editable ? (
                                <span className="mt-1.5 block w-[200px]">
                                  <Select
                                    small
                                    ariaLabel={t('bundle.sizeOf', { name: part.name })}
                                    value={part.variantId ?? ''}
                                    onChange={(value) => {
                                      const variant = part.variants?.find(
                                        (entry) => entry.id === value,
                                      )
                                      if (variant) {
                                        setPart(part.key, {
                                          variantId: variant.id,
                                          code: variant.code,
                                          name: variant.name,
                                          unitPrice: variant.price,
                                        })
                                      }
                                    }}
                                    options={part.variants.map((variant) => ({
                                      value: variant.id,
                                      label: variant.name,
                                    }))}
                                  />
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td className={cell}>
                          <input
                            value={part.quantity}
                            onFocus={selectAllOnFocus}
                            inputMode="numeric"
                            readOnly={!editable}
                            onChange={(event) =>
                              setPart(part.key, {
                                quantity: Math.max(
                                  1,
                                  Number(event.target.value.replace(/\D/g, '')) || 1,
                                ),
                              })
                            }
                            aria-label={t('bundle.col.howMany')}
                            className="h-[40px] w-[84px] rounded-sm border border-border-subtle bg-surface-background px-3 text-center text-sm font-medium text-text-primary outline-none focus:border-border-brand focus:bg-white"
                          />
                        </td>
                        <td className={`${cell} text-end`}>
                          <p className="text-sm font-semibold text-text-primary tabular-nums">
                            <Rial /> {part.free ? '0.000' : omr(part.unitPrice * part.quantity)}
                          </p>
                          {part.free ? (
                            <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                              {t('bundle.thrownInFree')}
                            </p>
                          ) : part.quantity > 1 ? (
                            <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                              {t('bundle.each', { amount: omr(part.unitPrice) })}
                            </p>
                          ) : null}
                          {editable ? (
                            <label className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
                              <input
                                type="checkbox"
                                checked={part.free}
                                onChange={(event) =>
                                  setPart(part.key, { free: event.target.checked })
                                }
                                className="size-3.5 accent-primary-700"
                              />
                              {t('bundle.thrownInFree')}
                            </label>
                          ) : null}
                        </td>
                        <td className={`${cell} text-end`}>
                          {part.counted === null ? (
                            <p className="text-sm font-medium text-text-quaternary">-</p>
                          ) : !part.counted || part.onHand === null ? (
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
                                {part.onHand.toLocaleString('en-US')}
                              </p>
                              {scarcest && counted.length > 1 ? (
                                <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                                  {t('bundle.fewestOfTheThree', { count: counted.length })}
                                </p>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className={`${cell} text-end`}>
                          {editable ? (
                            <button
                              type="button"
                              onClick={() => {
                                touch()
                                setParts((list) => list.filter((entry) => entry.key !== part.key))
                              }}
                              aria-label={t('bundle.removePart')}
                              className="inline-flex size-8 items-center justify-center rounded-sm transition-colors hover:bg-danger-100"
                            >
                              <img src={trashIcon} alt="" className="size-4" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {editable ? (
              <AddPart
                branchId={branchId}
                taken={parts}
                onPick={(part) => {
                  touch()
                  setParts((list) => [...list, part])
                }}
                onRefused={(message) => setProblem(message)}
              />
            ) : null}
          </Step>

          <Step n={3} title={t('bundle.step.costs')}>
            {/* One price for the lot is the only way: "Take a percentage off" belongs with the
                price rules now (owner, 28 Oct 2026). */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-sm border border-primary-700 bg-primary-25 p-4 text-start">
                <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-primary-700">
                  <span className="size-2 rounded-full bg-primary-700" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-primary-800">
                    {t('bundle.onePrice')}
                  </span>
                  <span className="mt-1 block text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('bundle.onePriceNote')}
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-4 max-w-[280px]">
              <Input
                bordered
                label={t('bundle.bundlePrice')}
                requiredMark
                labelNote={t('bundle.beforeVat')}
                value={price}
                inputMode="decimal"
                dir="ltr"
                readOnly={!editable}
                style={{ textAlign: 'right' }}
                onFocus={selectAllOnFocus}
                onChange={(event) => {
                  touch()
                  setPrice(event.target.value.replace(/[^\d.]/g, ''))
                }}
                onBlur={() => setPrice((Number(price) || 0).toFixed(3))}
                leadingIcon={
                  <span className="text-sm font-medium text-text-primary">
                    <Rial />
                  </span>
                }
              />
            </div>

            <dl className="mt-4 overflow-hidden rounded-sm border border-border-subtle">
              <Line
                label={t('bundle.partsSeparately')}
                value={<RialFigure>{omr(working.parts)}</RialFigure>}
              />
              <Line
                label={t('bundle.whatTheySave')}
                value={
                  <>
                    <RialFigure prefix={working.save.amount < 0 ? '+' : '−'}>
                      {omr(Math.abs(working.save.amount))}
                    </RialFigure>
                    {` · ${working.save.percent}%`}
                  </>
                }
                tone="good"
              />
              <Line
                label={
                  working.rate === null
                    ? t('bundle.vatMixed')
                    : t('bundle.vat', { rate: working.rate })
                }
                value={<RialFigure>{omr(working.vat)}</RialFigure>}
              />
              <Line
                label={t('bundle.theyPay')}
                value={<RialFigure>{omr(working.pays)}</RialFigure>}
                strong
              />
            </dl>
          </Step>

          <Step n={4} title={t('bundle.step.behaves')} flush>
            <ul>
              <li className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                    {t('bundle.behave.showParts')}
                  </p>
                  <p className="mt-1 max-w-[600px] text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('bundle.behave.showPartsNote')}
                  </p>
                </div>
                <Switch
                  checked={showParts}
                  disabled={!editable}
                  onChange={(next) => {
                    touch()
                    setShowParts(next)
                  }}
                  label={t('bundle.behave.showParts')}
                />
              </li>
              {/* TODO(backend): INCOME.md BU.4. Swapping a part at the till is not built, so
                  the switch is drawn off and cannot be turned on. */}
              <li className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                    {t('bundle.behave.staffCanSwap')}
                  </p>
                  <p className="mt-1 max-w-[600px] text-xs font-medium leading-[1.5] text-text-quaternary">
                    {t('bundle.behave.staffCanSwapNotYet')}
                  </p>
                </div>
                <Switch
                  checked={false}
                  disabled
                  onChange={() => {}}
                  label={t('bundle.behave.staffCanSwap')}
                />
              </li>
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
                {savedLines ? (
                  <>
                    {savedLines.lines.map((line, index) => (
                      <p
                        key={`${line.productId}-${line.variantId}-${index}`}
                        className="flex items-baseline justify-between gap-3 py-1 text-xs font-semibold text-text-primary"
                      >
                        <span className="min-w-0">
                          <bdi>{line.description}</bdi>
                          {line.quantity !== 1 ? ` × ${line.quantity}` : ''}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {omr(line.quantity * line.unitPrice)}
                        </span>
                      </p>
                    ))}
                    {!savedLines.split && bundle?.showParts
                      ? bundle.parts.map((part) => (
                          <p
                            key={`${part.position}-${part.productId}`}
                            className="flex items-baseline justify-between gap-3 py-1 ps-3 text-[11px] text-text-tertiary"
                          >
                            <span>
                              <bdi>{part.name}</bdi> × {part.quantity}
                            </span>
                            <span className="shrink-0 text-text-quaternary">
                              {part.free ? t('bundle.thrownInFree') : '-'}
                            </span>
                          </p>
                        ))
                      : null}
                    {savedLines.split ? (
                      <p className="mt-1 text-[11px] font-medium leading-[1.4] text-text-quaternary">
                        {t(
                          `bundle.splitBecause.${savedLines.splitBecause ?? 'VAT_TREATMENTS_DIFFER'}`,
                        )}
                      </p>
                    ) : null}
                    <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-border-subtle pt-2 text-[11px] text-text-tertiary">
                      <span>{t('bundle.vatMixed')}</span>
                      <span className="tabular-nums">{omr(linesVat ?? 0)}</span>
                    </p>
                    <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-border-subtle pt-2 text-sm font-semibold text-text-primary">
                      <span>{t('bundle.total')}</span>
                      <span className="tabular-nums">
                        <span className="me-1">
                          <Rial />
                        </span>
                        {omr(round3((linesNet ?? 0) + (linesVat ?? 0)))}
                      </span>
                    </p>
                    {dirty ? (
                      <p className="mt-2 text-[11px] font-medium text-pending-700">
                        {t('bundle.asSaved')}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="flex items-baseline justify-between gap-3 py-1 text-xs font-semibold text-text-primary">
                      <span>{name || t('bundles.newBundle')}</span>
                      <span className="tabular-nums">{omr(working.before)}</span>
                    </p>
                    {parts.map((part) => (
                      <p
                        key={part.key}
                        className="flex items-baseline justify-between gap-3 py-1 ps-3 text-[11px] text-text-tertiary"
                      >
                        <span>
                          <bdi>{part.name}</bdi> × {part.quantity}
                        </span>
                        <span className="shrink-0 text-text-quaternary">
                          {part.free ? t('bundle.thrownInFree') : '-'}
                        </span>
                      </p>
                    ))}
                    <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-border-subtle pt-2 text-[11px] text-text-tertiary">
                      <span>
                        {working.rate === null
                          ? t('bundle.vatMixed')
                          : t('bundle.vat', { rate: working.rate })}
                      </span>
                      <span className="tabular-nums">{omr(working.vat)}</span>
                    </p>
                    <p className="mt-1 flex items-baseline justify-between gap-3 border-t border-border-subtle pt-2 text-sm font-semibold text-text-primary">
                      <span>{t('bundle.total')}</span>
                      <span className="tabular-nums">
                        <span className="me-1">
                          <Rial />
                        </span>
                        {omr(working.pays)}
                      </span>
                    </p>
                  </>
                )}
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
              {counted
                .filter((part) => part.name !== working.make.limitedBy)
                .map((part) => (
                  <Row
                    key={part.key}
                    label={t('bundle.allows', { name: part.name })}
                    value={String(Math.floor((part.onHand ?? 0) / part.quantity))}
                  />
                ))}
            </dl>
            {working.make.limitedBy ? (
              <button
                type="button"
                title={t('bundle.orderMore', { name: working.make.limitedBy.toLowerCase() })}
                className="mt-3 inline-flex h-[40px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                <span className="truncate">
                  {t('bundle.orderMore', { name: working.make.limitedBy.toLowerCase() })}
                </span>
              </button>
            ) : null}
          </section>

          {bundle ? (
            <section className="rounded-md bg-surface-card p-5">
              <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('bundle.howItsDoing')}
              </h3>
              <dl className="mt-2">
                <Row
                  label={t('bundle.soldIn90')}
                  value={
                    reportRow ? reportRow.unitsSold.toLocaleString('en-US') : canReport ? '0' : '-'
                  }
                />
                <Row
                  label={t('bundle.revenue')}
                  value={reportRow ? <RialFigure>{omr(reportRow.revenue)}</RialFigure> : '-'}
                />
                <Row
                  label={t('bundle.givenAwayInDiscount')}
                  value={
                    reportRow ? (
                      <RialFigure>{omr(Math.max(0, reportRow.discountGiven))}</RialFigure>
                    ) : (
                      '-'
                    )
                  }
                />
                {/* TODO(backend): INCOME.md BU.5. How many of a part were sold through the
                    bundle, against all its sales, is not given. */}
                <Row
                  label={t('bundle.soldThisWay', { name: bundle.parts[0]?.name ?? '' })}
                  value="-"
                  last
                />
              </dl>
            </section>
          ) : null}
        </aside>
      </div>

      {editable ? (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
          <p className="text-sm font-medium text-text-tertiary">
            <Trans
              i18nKey={working.make.count === null ? 'bundle.footerUnlimited' : 'bundle.footer'}
              values={{
                parts: parts.length,
                price: omr(working.before),
                canMake: working.make.count ?? 0,
              }}
              components={{ amount: <RialFigure /> }}
            />
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
              onClick={() => void save(true)}
              disabled={busy}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60"
            >
              {t('bundle.saveAndSwitchOff')}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              <img src={tickWhiteIcon} alt="" className="size-4" />
              {t('bundle.save')}
            </button>
          </div>
        </div>
      ) : null}
    </CatalogShell>
  )
}

/**
 * "Add something to the bundle": the catalogue searched on the server in the working branch, as
 * the invoice item picker searches it. A bundle cannot hold another bundle
 * (`BUNDLE_PART_IS_BUNDLE`); a product sold by size or option is read once to offer its sizes.
 */
function AddPart({
  branchId,
  taken,
  onPick,
  onRefused,
}: {
  branchId: string | null
  taken: readonly EditPart[]
  onPick: (part: EditPart) => void
  onRefused: (message: string) => void
}) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  useEffect(() => {
    if (typed === null) return
    const timer = window.setTimeout(() => setQuery(typed), typed === '' ? 0 : 250)
    return () => window.clearTimeout(timer)
  }, [typed])
  const path = query === null ? null : productSearchPath(query, undefined, 0, branchId)
  const found = useApiRead<Page<ProductDto>>(path, () => searchProducts(path!))
  const products = (found.read.status === 'ready' ? found.read.data.items : []).filter(
    (product) => product.itemKind !== 'BUNDLE',
  )
  const options: SelectOption[] = products.map((product) => ({
    value: product.id,
    label: product.name,
    hint: product.code,
  }))

  const pick = async (id: string) => {
    const product = products.find((entry) => entry.id === id)
    if (!product) return
    try {
      // The list leaves sizes out, so the one product is read for them.
      const full = await getProduct(product.id)
      const part = partFromProduct({ ...full, effectivePrice: product.effectivePrice })
      if (!part.variants && taken.some((entry) => entry.productId === product.id)) {
        onRefused(t('bundle.refusal.BUNDLE_PART_DUPLICATE'))
        return
      }
      onPick(part)
    } catch (error) {
      const message = describeApiFailure(error)
      onRefused(t(message.key, message.values))
    }
  }

  return (
    <div className="mt-3 w-fit max-w-full">
      <Combobox
        value=""
        onChange={(id) => void pick(id)}
        options={options}
        onSearch={setTyped}
        searchPlaceholder={t('productPicker.search')}
        ariaLabel={t('bundle.addSomething')}
        emptyText={
          found.read.status === 'loading' || query === null
            ? t('productPicker.searching')
            : t('productPicker.none')
        }
        renderTrigger={() => (
          <span className="inline-flex h-[38px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25">
            <img src={plusIcon} alt="" className="size-4" />
            {t('bundle.addSomething')}
          </span>
        )}
      />
    </div>
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

function Line({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: React.ReactNode
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
        {withRial(value)}
      </dd>
    </div>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: React.ReactNode
  tone?: 'pending'
  /** Kept for the callers; the side cards no longer draw row dividers. */
  last?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 whitespace-nowrap text-sm font-medium text-text-tertiary">{label}</dt>
      <dd
        className={[
          'min-w-0 text-end text-sm font-semibold',
          tone === 'pending' ? 'text-pending-700' : 'text-text-primary',
        ].join(' ')}
      >
        {withRial(value)}
      </dd>
    </div>
  )
}
