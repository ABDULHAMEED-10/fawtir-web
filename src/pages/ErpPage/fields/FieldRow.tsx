import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '../../../components/ui'
import { TRANSFORM_PRESETS, type Requirement, type Target } from '../../../lib/erpCatalogue'
import type { Entry, InvalidMapping, SampleKey } from '../../../lib/erpMapping'
import { SourcePathPicker } from './SourcePathPicker'
import { TransformDisclosure } from './TransformDisclosure'
import { rowId, useTermName } from './model'
import chevronIcon from '../../../assets/create-invoice/chevron.svg'

const REQUIREMENT_TONE: Record<Requirement, string> = {
  MANDATORY: 'bg-primary-50 text-primary-800',
  CONDITIONAL: 'bg-pending-100 text-pending-700',
  OPTIONAL: 'bg-surface-background text-text-tertiary',
}

function RequirementTag({ requirement, muted }: { requirement: Requirement; muted?: boolean }) {
  const { t } = useTranslation()
  return (
    <span
      className={[
        'inline-flex h-[20px] shrink-0 items-center whitespace-nowrap rounded-[3px] px-1.5 text-[10px] font-semibold uppercase tracking-[0.4px]',
        muted ? 'bg-surface-background text-text-quaternary' : REQUIREMENT_TONE[requirement],
      ].join(' ')}
    >
      {t(`erp.requirement.${requirement}`)}
    </span>
  )
}

/** The term id and name every row opens with — the same for mappable and read-only rows. */
function RowTitle({ target, muted }: { target: Target; muted?: boolean }) {
  const termName = useTermName()
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span
        dir="ltr"
        className={[
          'font-mono text-[11px] font-semibold tracking-[0.2px]',
          muted ? 'text-text-quaternary' : 'text-text-tertiary',
        ].join(' ')}
      >
        {target.id}
      </span>
      <span
        className={[
          'text-sm font-semibold leading-[1.3]',
          muted ? 'text-text-tertiary' : 'text-text-primary',
        ].join(' ')}
      >
        {termName(target)}
      </span>
      <RequirementTag requirement={target.requirement} muted={muted} />
    </span>
  )
}

/**
 * A PLATFORM_SUPPLIED or DERIVED term: shown so the reader can see the whole document, greyed
 * because there is nothing for them to do.
 */
export function ReadOnlyRow({ target }: { target: Target }) {
  const { t } = useTranslation()
  return (
    <li
      id={rowId(target.id)}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-surface-background bg-surface-background/40 px-5 py-3"
    >
      <RowTitle target={target} muted />
      <span className="text-xs font-medium text-text-quaternary">
        {t(`erp.origin.${target.origin}`)}
      </span>
    </li>
  )
}

/**
 * One TENANT_MAPPED term (docs/erp-and-console-plan.md §2.2 "Row anatomy"):
 *
 *   [IBT-042]  Seller contact telephone   REQUIRED
 *              helper copy
 *   Source path [ … ▾ ]   Default [ … ]
 *   [Value map (3)]  [Advanced ▸]
 *   inline errors
 */
export function FieldRow({
  target,
  entry,
  errors,
  keys,
  hasSample,
  onChange,
  onOpenValueMap,
  initialPickerOpen = false,
  flash = false,
  inGroup = false,
}: {
  target: Target
  entry?: Entry
  errors: InvalidMapping[]
  keys: SampleKey[]
  hasSample: boolean
  onChange: (patch: Partial<Entry>) => void
  onOpenValueMap: () => void
  initialPickerOpen?: boolean
  /** Briefly lit after a checklist link scrolled here. */
  flash?: boolean
  /** Inside an "either of" group the row draws no top border. */
  inGroup?: boolean
}) {
  const { t } = useTranslation()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const pathError = errors.find((e) => e.errorCode === 'MALFORMED_SOURCE_PATH')
  const transformError = errors.find((e) => e.errorCode === 'MALFORMED_TRANSFORM')
  const otherErrors = errors.filter(
    (e) => e.errorCode !== 'MALFORMED_SOURCE_PATH' && e.errorCode !== 'MALFORMED_TRANSFORM',
  )
  const showAdvanced = advancedOpen || Boolean(transformError)

  const sourcePath = entry?.sourcePath ?? ''
  const hasValueMap = Boolean(target.codeList || target.lookup)
  const pairCount = Object.keys(entry?.valueMap ?? {}).length
  const preset = TRANSFORM_PRESETS.find((p) => p.fragment === (entry?.transform ?? '').trim())
  const transformLabel =
    entry?.transform === undefined
      ? undefined
      : preset
        ? t(`erp.preset.${preset.id}`)
        : t('erp.fields.customTransform')

  return (
    <li
      id={rowId(target.id)}
      className={[
        'px-5 py-4 transition-shadow',
        inGroup ? '' : 'border-t border-surface-background',
        flash ? 'shadow-[inset_0_0_0_2px_var(--color-primary-300)]' : '',
      ].join(' ')}
    >
      <div className="min-w-0">
        <RowTitle target={target} />
        {target.conditionKey ? (
          <p className="mt-1 text-xs font-medium leading-[1.5] text-pending-700">
            {t(target.conditionKey)}
          </p>
        ) : null}
        {target.helpKey ? (
          <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
            {t(target.helpKey)}
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SourcePathPicker
          id={`${rowId(target.id)}-path`}
          value={sourcePath}
          onChange={(value) => onChange({ sourcePath: value })}
          keys={keys}
          hasSample={hasSample}
          error={pathError ? t(`erp.error.${pathError.errorCode}`, pathError.values) : undefined}
          defaultOpen={initialPickerOpen}
        />
        <Input
          bordered
          id={`${rowId(target.id)}-default`}
          label={t('erp.fields.default')}
          value={entry?.defaultValue ?? ''}
          placeholder={
            sourcePath ? t('erp.fields.defaultFallback') : t('erp.fields.defaultConstant')
          }
          onChange={(event) => onChange({ defaultValue: event.target.value })}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {hasValueMap ? (
          <button
            type="button"
            onClick={onOpenValueMap}
            className={[
              'inline-flex h-[34px] items-center gap-1.5 rounded-sm border px-3 text-xs font-semibold transition-colors',
              pairCount > 0
                ? 'border-border-brand-subtle bg-primary-25 text-primary-800 hover:bg-primary-50'
                : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
            ].join(' ')}
          >
            {pairCount > 0
              ? t('erp.fields.valueMapCount', { count: pairCount })
              : t('erp.fields.valueMap')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={showAdvanced}
          className={[
            'inline-flex h-[34px] items-center gap-1.5 rounded-sm border px-3 text-xs font-semibold transition-colors',
            transformLabel
              ? 'border-border-brand-subtle bg-primary-25 text-primary-800 hover:bg-primary-50'
              : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
          ].join(' ')}
        >
          {transformLabel
            ? t('erp.fields.advancedOn', { preset: transformLabel })
            : t('erp.fields.advanced')}
          <img
            src={chevronIcon}
            alt=""
            aria-hidden="true"
            className={['size-4', showAdvanced ? '-rotate-90' : 'rotate-90'].join(' ')}
          />
        </button>
      </div>

      {showAdvanced ? (
        <TransformDisclosure
          value={entry?.transform}
          onChange={(next) => onChange({ transform: next })}
          error={
            transformError
              ? t(`erp.error.${transformError.errorCode}`, transformError.values)
              : undefined
          }
        />
      ) : null}

      {otherErrors.length > 0 ? (
        <ul className="mt-2.5 flex flex-col gap-1">
          {otherErrors.map((error, index) => (
            <li
              key={`${error.errorCode}-${index}`}
              className="flex items-start gap-2 text-xs font-medium leading-[1.5] text-text-danger"
            >
              <span
                aria-hidden="true"
                className="mt-[7px] size-1.5 shrink-0 rounded-full bg-current"
              />
              {t(`erp.error.${error.errorCode}`, error.values)}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
