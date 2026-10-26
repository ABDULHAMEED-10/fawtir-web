import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SegmentedControl, Select, type SelectOption } from '../../../components/ui'
import { FieldLabel, TextField } from '../../../components/form'
import { ClassificationField } from '../../../components/invoice/ClassificationField'
import { CONSOLE_SMALL, CONSOLE_SMALL_DANGER } from '../../../layouts/ConsoleShell/consoleStyle'
import type {
  TemplateGroupDto,
  TemplateItemDto,
  TemplateName,
} from '../../../api/catalog/templates'
import {
  EXPORT_ZERO_REASONS,
  TEMPLATE_GOODS_UNITS,
  TEMPLATE_SERVICE_UNITS,
  TEMPLATE_TAX_CATEGORIES,
  formatNames,
  itemAfter,
  nodeAt,
  parseNames,
  type NodeRef,
} from '../../../lib/console/catalogueTemplates'
import { nameOf } from '../../../lib/codeLists/codeList'
import { taxReasonsFor } from '../../../lib/codeLists/taxReasons'

const K = 'console.templateEditor.'

/**
 * The fields of the entry chosen in the tree: a group or a kind has its names; an item has the
 * product fields it will copy into (names, goods or service, unit, VAT category and reason, HS code
 * or service type, barcode) and its sizes, options and add-ons as names. No prices.
 */
export function NodeEditor({
  groups,
  at,
  readOnly,
  onChange,
  onMove,
  onRemove,
  onAddChild,
}: {
  groups: TemplateGroupDto[]
  at: NodeRef
  readOnly: boolean
  onChange: (patch: Partial<TemplateItemDto> & Partial<TemplateName>) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
  onAddChild: () => void
}) {
  const { t } = useTranslation()
  const node = nodeAt(groups, at)
  if (!node) return null
  // A published version is looked at, never changed: every field answers with nothing.
  const change = (patch: Partial<TemplateItemDto> & Partial<TemplateName>) => {
    if (!readOnly) onChange(patch)
  }
  const level = at.i !== undefined ? 'item' : at.k !== undefined ? 'kind' : 'group'
  const siblings =
    level === 'group'
      ? groups.length
      : level === 'kind'
        ? (groups[at.g]?.kinds.length ?? 0)
        : (groups[at.g]?.kinds[at.k as number]?.items.length ?? 0)
  const index = at.i ?? at.k ?? at.g
  const id = `node-${at.g}-${at.k ?? 'x'}-${at.i ?? 'x'}`

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
          {t(`${K}level.${level}`)}
        </h2>
        {readOnly ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={CONSOLE_SMALL}
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              {t(`${K}moveUp`)}
            </button>
            <button
              type="button"
              className={CONSOLE_SMALL}
              disabled={index >= siblings - 1}
              onClick={() => onMove(1)}
            >
              {t(`${K}moveDown`)}
            </button>
            <button type="button" className={CONSOLE_SMALL_DANGER} onClick={onRemove}>
              {t(`${K}remove.${level}`)}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <TextField
          id={`${id}-name`}
          name="name"
          label={t(`${K}field.name`)}
          required
          value={node.name}
          onChange={(name) => change({ name })}
          maxLength={200}
          dir="ltr"
        />
        <TextField
          id={`${id}-name-ar`}
          name="nameAr"
          label={t(`${K}field.nameAr`)}
          value={node.nameAr ?? ''}
          onChange={(nameAr) => change({ nameAr: nameAr || null })}
          maxLength={200}
          dir="rtl"
          hint={t(`${K}field.nameArHint`)}
        />
      </div>

      {level === 'item' ? (
        <ItemFields
          id={id}
          item={node as TemplateItemDto}
          readOnly={readOnly}
          onChange={(patch) => change(itemAfter(node as TemplateItemDto, patch))}
        />
      ) : readOnly ? null : (
        <div>
          <button type="button" className={CONSOLE_SMALL} onClick={onAddChild}>
            {t(level === 'group' ? `${K}addKind` : `${K}addItem`)}
          </button>
        </div>
      )}
      {readOnly ? (
        <p className="text-xs font-medium text-text-quaternary">{t(`${K}readOnlyNote`)}</p>
      ) : null}
    </div>
  )
}

function ItemFields({
  id,
  item,
  readOnly,
  onChange,
}: {
  id: string
  item: TemplateItemDto
  readOnly: boolean
  onChange: (patch: Partial<TemplateItemDto>) => void
}) {
  const { t, i18n } = useTranslation()
  const goods = item.classification.goodsOrService === 'G'
  const units: readonly string[] = goods ? TEMPLATE_GOODS_UNITS : TEMPLATE_SERVICE_UNITS
  const unitOptions: SelectOption[] = units.map((code) => ({
    value: code,
    label: t(`createInvoice.units.${code}`, { defaultValue: code }),
  }))
  const categoryOptions: SelectOption[] = TEMPLATE_TAX_CATEGORIES.map((code) => ({
    value: code,
    label: t(`${K}vat.${code}`),
  }))
  const reasons = (taxReasonsFor(item.defaultTaxCategory) ?? []).filter(
    (reason) => !EXPORT_ZERO_REASONS.has(reason.code),
  )
  const reasonOptions: SelectOption[] = reasons.map((reason) => ({
    value: reason.code,
    label: nameOf(reason, i18n.language),
    hint: reason.code,
  }))
  const variants = item.variants ?? { sizes: [], options: [] }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <FieldLabel label={t(`${K}field.goodsOrService`)} />
          <SegmentedControl
            ariaLabel={t(`${K}field.goodsOrService`)}
            value={item.classification.goodsOrService}
            onChange={(value) =>
              onChange({ classification: { ...item.classification, goodsOrService: value } })
            }
            options={[
              { value: 'G', label: t(`${K}goods`) },
              { value: 'S', label: t(`${K}service`) },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel label={t(`${K}field.unit`)} />
          <Select
            value={item.defaultUnitCode}
            onChange={(defaultUnitCode) => onChange({ defaultUnitCode })}
            options={unitOptions}
            ariaLabel={t(`${K}field.unit`)}
            disabled={readOnly}
          />
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel label={t(`${K}field.vatCategory`)} />
          <Select
            value={item.defaultTaxCategory}
            onChange={(defaultTaxCategory) =>
              onChange({ defaultTaxCategory, defaultTaxReasonCode: null })
            }
            options={categoryOptions}
            ariaLabel={t(`${K}field.vatCategory`)}
            disabled={readOnly}
          />
        </div>
        {reasonOptions.length > 0 ? (
          <div className="flex flex-col gap-1">
            <FieldLabel label={t(`${K}field.vatReason`)} required />
            <Select
              value={item.defaultTaxReasonCode ?? ''}
              onChange={(defaultTaxReasonCode) => onChange({ defaultTaxReasonCode })}
              options={reasonOptions}
              placeholder={t(`${K}field.vatReasonPlaceholder`)}
              ariaLabel={t(`${K}field.vatReason`)}
              disabled={readOnly}
            />
          </div>
        ) : null}
        {item.defaultTaxCategory !== 'S' ? (
          <TextField
            id={`${id}-reason-text`}
            name="defaultTaxReasonText"
            label={t(`${K}field.vatReasonText`)}
            value={item.defaultTaxReasonText ?? ''}
            onChange={(text) => onChange({ defaultTaxReasonText: text || null })}
            maxLength={200}
          />
        ) : null}
        <div className="flex flex-col gap-1">
          <FieldLabel label={t(goods ? `${K}field.hsCode` : `${K}field.serviceType`)} required />
          <ClassificationField
            kind={goods ? 'goods' : 'service'}
            value={(goods ? item.classification.hsCode : item.classification.serviceTypeCode) ?? ''}
            onChange={(code) =>
              onChange({
                classification: goods
                  ? { ...item.classification, hsCode: code }
                  : { ...item.classification, serviceTypeCode: code },
              })
            }
            disabled={readOnly}
            ariaLabel={t(goods ? `${K}field.hsCode` : `${K}field.serviceType`)}
          />
        </div>
        <TextField
          id={`${id}-barcode`}
          name="barcode"
          label={t(`${K}field.barcode`)}
          value={item.barcode ?? ''}
          onChange={(barcode) => onChange({ barcode: barcode.trim() || null })}
          maxLength={50}
          dir="ltr"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <NamesField
          id={`${id}-sizes`}
          label={t(`${K}field.sizes`)}
          names={variants.sizes}
          readOnly={readOnly}
          onChange={(sizes) => onChange({ variants: { ...variants, sizes } })}
        />
        <NamesField
          id={`${id}-options`}
          label={t(`${K}field.options`)}
          names={variants.options}
          readOnly={readOnly}
          onChange={(options) => onChange({ variants: { ...variants, options } })}
        />
        <NamesField
          id={`${id}-add-ons`}
          label={t(`${K}field.addOns`)}
          names={item.addOns}
          readOnly={readOnly}
          onChange={(addOns) => onChange({ addOns })}
        />
      </div>
    </div>
  )
}

/**
 * Sizes, options or add-ons typed as one line, as the spreadsheet carries them; read into names
 * when the field is left.
 */
function NamesField({
  id,
  label,
  names,
  readOnly,
  onChange,
}: {
  id: string
  label: string
  names: TemplateName[]
  readOnly: boolean
  onChange: (names: TemplateName[]) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(formatNames(names))
  return (
    <div
      onBlur={() => {
        if (!readOnly && text !== formatNames(names)) onChange(parseNames(text))
      }}
    >
      <TextField
        id={id}
        name={id}
        label={label}
        value={text}
        onChange={readOnly ? () => undefined : setText}
        hint={t(`${K}field.namesHint`)}
        dir="ltr"
      />
    </div>
  )
}
