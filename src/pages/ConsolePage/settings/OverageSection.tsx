import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SectionProps } from './draft'
import { FieldGrid, NoteLine, NumberField, SwitchRow } from './shared'

const K = 'console.settings.overage.'

export function OverageSection({ form, set, errors }: SectionProps<'overage'>) {
  const { t } = useTranslation()

  return (
    <>
      <SwitchRow
        title={t(`${K}permitted`)}
        note={t(`${K}permittedNote`)}
        checked={form.permitted}
        onChange={(checked) => set((current) => ({ ...current, permitted: checked }))}
      />
      <SwitchRow
        title={t(`${K}enabledByDefault`)}
        note={t(`${K}enabledByDefaultNote`)}
        checked={form.permitted && form.enabledByDefault}
        disabled={!form.permitted}
        onChange={(checked) => set((current) => ({ ...current, enabledByDefault: checked }))}
      />
      <FieldGrid>
        <NumberField
          name="hardCeiling"
          label={t(`${K}hardCeiling`)}
          hint={t(`${K}hardCeilingHint`)}
          value={form.hardCeiling}
          onChange={(value) => set((current) => ({ ...current, hardCeiling: value }))}
          error={errors.hardCeiling ? t(errors.hardCeiling) : undefined}
        />
      </FieldGrid>
      <NoteLine>
        {t(`${K}ratesNote`)}{' '}
        <Link to="/console/plans" className="font-semibold text-primary-700 hover:text-primary-800">
          {t('console.settings.plansLink')}
        </Link>
      </NoteLine>
    </>
  )
}
