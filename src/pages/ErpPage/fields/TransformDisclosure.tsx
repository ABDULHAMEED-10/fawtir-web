import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Select } from '../../../components/ui'
import { TRANSFORM_PRESETS } from '../../../lib/erpCatalogue'

/**
 * The row's "Advanced" panel (docs/erp-and-console-plan.md A.2 "Row: advanced"): a preset menu
 * that fills a mono textarea, which the reader may then edit by hand. Whatever is in the box is
 * stored as the entry's transform — plain JSONata on `$src` — so a preset and a hand-written
 * expression are the same thing to the backend.
 */
export function TransformDisclosure({
  value,
  onChange,
  error,
}: {
  value?: string
  /** `undefined` removes the transform altogether. */
  onChange: (next?: string) => void
  error?: string
}) {
  const { t } = useTranslation()
  const textareaId = useId()
  const preset = TRANSFORM_PRESETS.find((p) => p.fragment === (value ?? '').trim())?.id ?? ''

  return (
    <div className="mt-3 grid gap-3 rounded-sm border border-border-subtle bg-surface-background/50 p-4 sm:grid-cols-[minmax(0,240px)_1fr]">
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-text-secondary">
          {t('erp.fields.preset')}
        </span>
        <Select
          compact
          ariaLabel={t('erp.fields.preset')}
          value={preset}
          placeholder={t('erp.fields.choosePreset')}
          onChange={(id) => {
            const chosen = TRANSFORM_PRESETS.find((p) => p.id === id)
            if (chosen) onChange(chosen.fragment)
          }}
          options={TRANSFORM_PRESETS.map((p) => ({
            value: p.id,
            label: t(`erp.preset.${p.id}`),
            hint: p.ruleId,
          }))}
        />
      </label>

      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={textareaId} className="text-xs font-medium text-text-secondary">
            {t('erp.fields.transform')}
          </label>
          {value !== undefined ? (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="text-xs font-semibold text-primary-700 transition-colors hover:text-primary-800"
            >
              {t('erp.fields.clearTransform')}
            </button>
          ) : null}
        </div>
        <textarea
          id={textareaId}
          value={value ?? ''}
          dir="ltr"
          spellCheck={false}
          rows={2}
          placeholder={t('erp.fields.transformPlaceholder')}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          className={[
            'w-full resize-y rounded-sm border bg-white px-3 py-2.5 font-mono text-[13px] leading-[1.5] text-text-primary outline-none transition-colors placeholder:text-text-placeholder',
            error ? 'border-border-danger' : 'border-border-default focus:border-border-brand',
          ].join(' ')}
        />
        {error ? (
          <p className="mt-1 text-xs font-medium text-text-danger">{error}</p>
        ) : (
          <p className="mt-1 text-[10px] font-medium leading-[1.4] text-text-tertiary">
            {t('erp.fields.runsOnSrc')}
          </p>
        )}
      </div>
    </div>
  )
}
