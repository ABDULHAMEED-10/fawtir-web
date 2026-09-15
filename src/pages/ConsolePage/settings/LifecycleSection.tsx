import { useTranslation } from 'react-i18next'
import { CATALOGUE } from '../../../lib/plans'
import type { Forms, SectionProps } from './draft'
import { DayListField, FieldGrid, GroupLabel, NumberField, SelectField, SwitchRow } from './shared'

const K = 'console.settings.lifecycle.'

export function LifecycleSection({ form, set, errors }: SectionProps<'lifecycle'>) {
  const { t } = useTranslation()
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined)
  const planOptions = CATALOGUE.map((plan) => ({ value: plan.id, label: t(plan.labelKey) }))
  const number =
    (field: 'trialDays' | 'trialDocuments' | 'graceDays' | 'cancellationNoticeDays') =>
    (value: string) =>
      set((current) => ({ ...current, [field]: value }))
  const flag =
    (field: 'trialAutoConverts' | 'trialNeedsPaymentDetails' | 'autoRenewal' | 'refundMidPeriod') =>
    (checked: boolean) =>
      set((current) => ({ ...current, [field]: checked }))

  return (
    <>
      <GroupLabel>{t(`${K}trialGroup`)}</GroupLabel>
      <FieldGrid>
        <SelectField
          label={t(`${K}defaultPlan`)}
          hint={t(`${K}defaultPlanHint`)}
          value={form.defaultForNewTenant}
          onChange={(value) =>
            set((current) => ({
              ...current,
              defaultForNewTenant: value as Forms['lifecycle']['defaultForNewTenant'],
            }))
          }
          options={[{ value: 'trial', label: t(`${K}theTrial`) }, ...planOptions]}
        />
        <SelectField
          label={t(`${K}trialMirrors`)}
          hint={t(`${K}trialMirrorsHint`)}
          value={form.trialMirrors}
          onChange={(value) =>
            set((current) => ({
              ...current,
              trialMirrors: value as Forms['lifecycle']['trialMirrors'],
            }))
          }
          options={planOptions}
        />
        <NumberField
          name="trialDays"
          label={t(`${K}trialDays`)}
          value={form.trialDays}
          onChange={number('trialDays')}
          error={err('trialDays')}
        />
        <NumberField
          name="trialDocuments"
          label={t(`${K}trialDocuments`)}
          hint={t(`${K}trialDocumentsHint`)}
          value={form.trialDocuments}
          onChange={number('trialDocuments')}
          error={err('trialDocuments')}
        />
      </FieldGrid>
      <SwitchRow
        title={t(`${K}trialAutoConverts`)}
        note={t(`${K}trialAutoConvertsNote`)}
        checked={form.trialAutoConverts}
        onChange={flag('trialAutoConverts')}
      />
      <SwitchRow
        title={t(`${K}trialNeedsPaymentDetails`)}
        note={t(`${K}trialNeedsPaymentDetailsNote`)}
        checked={form.trialNeedsPaymentDetails}
        onChange={flag('trialNeedsPaymentDetails')}
      />

      <GroupLabel>{t(`${K}renewalGroup`)}</GroupLabel>
      <SwitchRow
        title={t(`${K}autoRenewal`)}
        note={t(`${K}autoRenewalNote`)}
        checked={form.autoRenewal}
        onChange={flag('autoRenewal')}
      />
      <FieldGrid>
        <NumberField
          name="graceDays"
          label={t(`${K}graceDays`)}
          hint={t(`${K}graceDaysHint`)}
          value={form.graceDays}
          onChange={number('graceDays')}
          error={err('graceDays')}
        />
        <DayListField
          label={t(`${K}graceNotices`)}
          hint={t(`${K}graceNoticesHint`)}
          values={form.graceNoticeDays}
          onChange={(values) => set((current) => ({ ...current, graceNoticeDays: values }))}
          format={(day) => t('console.settings.dayList.day', { day })}
          error={err('graceNoticeDays')}
        />
        <NumberField
          name="cancellationNoticeDays"
          label={t(`${K}cancellationNotice`)}
          hint={t(`${K}cancellationNoticeHint`)}
          value={form.cancellationNoticeDays}
          onChange={number('cancellationNoticeDays')}
          error={err('cancellationNoticeDays')}
        />
      </FieldGrid>
      <SwitchRow
        title={t(`${K}refund`)}
        note={t(`${K}refundNote`)}
        checked={form.refundMidPeriod}
        onChange={flag('refundMidPeriod')}
      />

      <GroupLabel>{t(`${K}changesGroup`)}</GroupLabel>
      <FieldGrid>
        <SelectField
          label={t(`${K}upgrade`)}
          value={form.upgrade}
          onChange={(value) =>
            set((current) => ({ ...current, upgrade: value as Forms['lifecycle']['upgrade'] }))
          }
          options={[
            { value: 'immediateProRata', label: t(`${K}upgradeOption.immediateProRata`) },
            { value: 'periodEnd', label: t(`${K}upgradeOption.periodEnd`) },
          ]}
        />
        <SelectField
          label={t(`${K}downgrade`)}
          value={form.downgrade}
          onChange={(value) =>
            set((current) => ({ ...current, downgrade: value as Forms['lifecycle']['downgrade'] }))
          }
          options={[
            { value: 'periodEnd', label: t(`${K}downgradeOption.periodEnd`) },
            { value: 'immediate', label: t(`${K}downgradeOption.immediate`) },
          ]}
        />
        <SelectField
          label={t(`${K}whileSuspended`)}
          hint={t(`${K}whileSuspendedHint`)}
          value={form.whileSuspended}
          onChange={(value) =>
            set((current) => ({
              ...current,
              whileSuspended: value as Forms['lifecycle']['whileSuspended'],
            }))
          }
          options={[
            { value: 'readOnly', label: t(`${K}suspendedOption.readOnly`) },
            { value: 'locked', label: t(`${K}suspendedOption.locked`) },
          ]}
        />
      </FieldGrid>
    </>
  )
}
