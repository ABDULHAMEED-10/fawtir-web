import { useTranslation } from 'react-i18next'
import { Rial, Select } from '../../../components/ui'
import { ANY_PLAN_IDS, type ExtractionAvailability } from '../../../lib/plans'
import type { SectionProps } from './draft'
import { FieldGrid, GroupLabel, LockedRow, NoteLine, NumberField } from './shared'

const K = 'console.settings.addons.'
const AVAILABILITY: ExtractionAvailability[] = ['notOffered', 'priced', 'included']

export function AddonsSection({ form, set, errors }: SectionProps<'addons'>) {
  const { t } = useTranslation()
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined)
  const extraction = (field: 'monthly' | 'documents' | 'overage') => (value: string) =>
    set((current) => ({
      ...current,
      erpExtraction: { ...current.erpExtraction, [field]: value },
    }))
  const availability = (plan: (typeof ANY_PLAN_IDS)[number]) => (value: string) =>
    set((current) => ({
      ...current,
      erpExtraction: {
        ...current.erpExtraction,
        availability: {
          ...current.erpExtraction.availability,
          [plan]: value as ExtractionAvailability,
        },
      },
    }))
  const rial = <Rial className="text-text-primary" />
  const availabilityOptions = AVAILABILITY.map((value) => ({
    value,
    label: t(`plan.extraction.${value}`),
  }))

  return (
    <>
      {/* Mapping is a plan feature, switched in Plans and rates — never priced here. */}
      <LockedRow
        title={t(`${K}erpMapping`)}
        note={t(`${K}erpMappingNote`)}
        value={t(`${K}erpMappingValue`)}
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
      </FieldGrid>

      {/* One row per plan: may the plan buy the add-on, get it free, or not see it at all. */}
      <GroupLabel>{t(`${K}availabilityGroup`)}</GroupLabel>
      <div className="flex flex-col">
        {ANY_PLAN_IDS.map((plan) => {
          const label = t(`plan.planName.${plan}`)
          return (
            <div
              key={plan}
              className="flex items-center justify-between gap-4 border-t border-surface-background px-5 py-3 max-md:flex-col max-md:items-stretch"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-[1.3] text-text-primary">{label}</p>
                <p className="mt-0.5 max-w-[480px] text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t(`plan.audience.${plan}`)}
                </p>
              </div>
              <div className="w-[220px] shrink-0 max-md:w-full">
                <Select
                  compact
                  ariaLabel={t(`${K}availabilityLabel`, { plan: label })}
                  value={form.erpExtraction.availability[plan]}
                  onChange={availability(plan)}
                  options={availabilityOptions}
                />
              </div>
            </div>
          )
        })}
      </div>
      <NoteLine>{t(`${K}availabilityNote`)}</NoteLine>

      <GroupLabel>{t(`${K}posGroup`)}</GroupLabel>
      <LockedRow title={t(`${K}pos`)} note={t(`${K}posNote`)} value={t(`${K}posValue`)} />
    </>
  )
}
