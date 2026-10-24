import { useTranslation } from 'react-i18next'
import { Rial } from '../../../components/ui'
import type { SectionProps } from './draft'
import { FieldGrid, GroupLabel, LockedRow, NoteLine, NumberField } from './shared'

const K = 'console.settings.addons.'

export function AddonsSection({ form, set, errors }: SectionProps<'addons'>) {
  const { t } = useTranslation()
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined)
  const extraction = (field: 'documents' | 'overage') => (value: string) =>
    set((current) => ({
      ...current,
      erpExtraction: { ...current.erpExtraction, [field]: value },
    }))
  const rial = <Rial className="text-text-primary" />
  return (
    <>
      {/* Mapping is a plan feature, switched in Plans and rates — never priced here. */}
      <LockedRow
        title={t(`${K}erpMapping`)}
        note={t(`${K}erpMappingNote`)}
        value={t(`${K}erpMappingValue`)}
      />

      <GroupLabel>{t(`${K}extractionGroup`)}</GroupLabel>
      {/* The ERP add-on's price and which plans offer it are set per plan in Plans and rates, against
          the platform API; the copies here never saved (owner, 24 Oct 2026). */}
      <NoteLine>{t(`${K}priceMovedNote`)}</NoteLine>
      <FieldGrid>
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
      </FieldGrid>

      <GroupLabel>{t(`${K}posGroup`)}</GroupLabel>
      <LockedRow title={t(`${K}pos`)} note={t(`${K}posNote`)} value={t(`${K}posValue`)} />
    </>
  )
}
