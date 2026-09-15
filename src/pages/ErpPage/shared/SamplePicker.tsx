import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Select } from '../../../components/ui'
import { shortDate } from '../../../lib/settings'
import type { Sample } from '../../../lib/erpMapping'

/**
 * Which uploaded sample a preview or a certification runs over (docs/erp-and-console-plan.md
 * §2.3, §2.4). The app's own listbox, with the sample's size, date and uploader on the second
 * line so two invoices from the same month can be told apart without opening them.
 */
export function SamplePicker({
  samples,
  value,
  onChange,
  label,
  compact = false,
}: {
  samples: Sample[]
  value: string
  onChange: (id: string) => void
  label?: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const caption = label ?? t('erp.shared.sample')
  const options = samples.map((sample) => ({
    value: sample.id,
    label: sample.label,
    hint: `${t('erp.shared.kb', { size: (sample.byteSize / 1024).toFixed(1) })} · ${shortDate(
      sample.createdAt,
    )} · ${sample.createdBy}`,
  }))

  return (
    <div className="flex w-full flex-col gap-1">
      <span className="text-sm font-medium text-text-primary">{caption}</span>
      <Select
        value={value}
        onChange={onChange}
        options={options}
        placeholder={t('erp.shared.chooseSample')}
        ariaLabel={caption}
        disabled={samples.length === 0}
        compact={compact}
      />
      {samples.length === 0 ? (
        <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
          {t('erp.shared.noSamples')}{' '}
          <Link
            to="/settings/erp-mapping/samples"
            className="font-semibold text-primary-700 hover:text-primary-800"
          >
            {t('erp.shared.uploadSample')}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
