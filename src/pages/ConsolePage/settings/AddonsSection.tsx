import { useTranslation } from 'react-i18next'
import { Rial } from '../../../components/ui'
import type { Forms, SectionProps } from './draft'
import { FieldGrid, GroupLabel, LockedRow, NumberField, SelectField } from './shared'

const K = 'console.settings.addons.'

export function AddonsSection({ form, set, errors }: SectionProps<'addons'>) {
  const { t } = useTranslation()
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined)
  const extraction = (field: 'monthly' | 'documents' | 'overage') => (value: string) =>
    set((current) => ({
      ...current,
      erpExtraction: { ...current.erpExtraction, [field]: value },
    }))
  const rial = <Rial className="text-text-primary" />

  return (
    <>
      <LockedRow
        title={t(`${K}erpMapping`)}
        note={t(`${K}erpMappingNote`)}
        value={t(`${K}includedEveryPlan`)}
      />

      <GroupLabel>{t(`${K}extractionGroup`)}</GroupLabel>
      <FieldGrid>
        <NumberField
          name="erpExtraction.monthly"
          label={t(`${K}extractionPrice`)}
          hint={t(`${K}extractionPriceHint`)}
          decimal
          leadingIcon={rial}
          value={form.erpExtraction.monthly}
          onChange={extraction('monthly')}
          error={err('erpExtraction.monthly')}
        />
        <NumberField
          name="erpExtraction.documents"
          label={t(`${K}extractionDocuments`)}
          hint={t(`${K}extractionDocumentsHint`)}
          value={form.erpExtraction.documents}
          onChange={extraction('documents')}
          error={err('erpExtraction.documents')}
        />
        <NumberField
          name="erpExtraction.overage"
          label={t(`${K}extractionOverage`)}
          hint={t(`${K}extractionOverageHint`)}
          decimal
          leadingIcon={rial}
          value={form.erpExtraction.overage}
          onChange={extraction('overage')}
          error={err('erpExtraction.overage')}
        />
        <SelectField
          label={t(`${K}includedAt`)}
          hint={t(`${K}includedAtHint`)}
          value={form.erpExtraction.includedAt}
          onChange={(value) =>
            set((current) => ({
              ...current,
              erpExtraction: {
                ...current.erpExtraction,
                includedAt: value as Forms['addons']['erpExtraction']['includedAt'],
              },
            }))
          }
          options={[
            { value: 'enterprise', label: t('plan.planName.enterprise') },
            { value: 'none', label: t(`${K}includedAtNone`) },
          ]}
        />
      </FieldGrid>

      <GroupLabel>{t(`${K}posGroup`)}</GroupLabel>
      <LockedRow title={t(`${K}pos`)} note={t(`${K}posNote`)} value={t(`${K}posValue`)} />
    </>
  )
}
