import { useTranslation } from 'react-i18next'
import { Input } from '../../../components/ui'
import type { Forms, SectionProps } from './draft'
import { FieldGrid, LockedRow, NumberField, SelectField, SwitchRow } from './shared'

const K = 'console.settings.billing.'

export function BillingSection({ form, set, errors }: SectionProps<'billing'>) {
  const { t } = useTranslation()
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined)

  return (
    <>
      <LockedRow
        title={t(`${K}currency`)}
        note={t(`${K}currencyNote`)}
        value={t(`${K}currencyValue`)}
      />
      <FieldGrid>
        <NumberField
          name="vatRate"
          label={t(`${K}vatRate`)}
          hint={t(`${K}vatRateHint`)}
          decimal
          value={form.vatRate}
          onChange={(value) => set((current) => ({ ...current, vatRate: value }))}
          error={err('vatRate')}
          trailingIcon={<span className="text-sm font-medium">%</span>}
        />
        <NumberField
          name="minimumTermMonths"
          label={t(`${K}minimumTerm`)}
          hint={t(`${K}minimumTermHint`)}
          value={form.minimumTermMonths}
          onChange={(value) => set((current) => ({ ...current, minimumTermMonths: value }))}
          error={err('minimumTermMonths')}
        />
        <SelectField
          label={t(`${K}billingAnchor`)}
          hint={t(`${K}billingAnchorHint`)}
          value={form.billingAnchor}
          onChange={(value) =>
            set((current) => ({
              ...current,
              billingAnchor: value as Forms['billing']['billingAnchor'],
            }))
          }
          options={[
            { value: 'signup', label: t(`${K}anchor.signup`) },
            { value: 'firstOfMonth', label: t(`${K}anchor.firstOfMonth`) },
          ]}
        />
        <Input
          bordered
          name="invoiceSeriesPrefix"
          label={t(`${K}invoiceSeries`)}
          hint={t(`${K}invoiceSeriesHint`, { prefix: form.invoiceSeriesPrefix || 'FWT' })}
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          value={form.invoiceSeriesPrefix}
          onChange={(event) =>
            set((current) => ({ ...current, invoiceSeriesPrefix: event.target.value }))
          }
          error={err('invoiceSeriesPrefix')}
        />
      </FieldGrid>
      <SwitchRow
        title={t(`${K}pricesExclusive`)}
        note={t(`${K}pricesExclusiveNote`)}
        checked={form.pricesShownExclusive}
        onChange={(checked) => set((current) => ({ ...current, pricesShownExclusive: checked }))}
      />
    </>
  )
}
