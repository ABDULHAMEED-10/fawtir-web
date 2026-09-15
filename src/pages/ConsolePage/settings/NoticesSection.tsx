import { useTranslation } from 'react-i18next'
import type { Forms, SectionProps } from './draft'
import { DayListField, FieldGrid, GroupLabel, SelectField, SwitchRow } from './shared'

const K = 'console.settings.notices.'

export function NoticesSection({ form, set, errors }: SectionProps<'notices'>) {
  const { t } = useTranslation()

  return (
    <>
      <FieldGrid>
        <DayListField
          label={t(`${K}thresholds`)}
          hint={t(`${K}thresholdsHint`)}
          values={form.thresholds}
          onChange={(values) => set((current) => ({ ...current, thresholds: values }))}
          format={(value) => t('console.settings.dayList.percent', { value })}
          min={1}
          max={100}
          error={errors.thresholds ? t(errors.thresholds) : undefined}
        />
        <SelectField
          label={t(`${K}recipients`)}
          value={form.recipients}
          onChange={(value) =>
            set((current) => ({ ...current, recipients: value as Forms['notices']['recipients'] }))
          }
          options={[
            { value: 'ownerAndAdmins', label: t(`${K}recipientOption.ownerAndAdmins`) },
            { value: 'ownerOnly', label: t(`${K}recipientOption.ownerOnly`) },
            { value: 'everyone', label: t(`${K}recipientOption.everyone`) },
          ]}
        />
        <SelectField
          label={t(`${K}language`)}
          hint={t(`${K}languageHint`)}
          value={form.language}
          onChange={(value) =>
            set((current) => ({ ...current, language: value as Forms['notices']['language'] }))
          }
          options={[
            { value: 'customer', label: t(`${K}languageOption.customer`) },
            { value: 'en', label: t(`${K}languageOption.en`) },
            { value: 'ar', label: t(`${K}languageOption.ar`) },
          ]}
        />
      </FieldGrid>
      <GroupLabel>{t(`${K}channels`)}</GroupLabel>
      <SwitchRow
        title={t(`${K}channel.email`)}
        note={t(`${K}channel.emailNote`)}
        checked={form.channels.email}
        onChange={(checked) =>
          set((current) => ({ ...current, channels: { ...current.channels, email: checked } }))
        }
      />
      <SwitchRow
        title={t(`${K}channel.inApp`)}
        note={t(`${K}channel.inAppNote`)}
        checked={form.channels.inApp}
        onChange={(checked) =>
          set((current) => ({ ...current, channels: { ...current.channels, inApp: checked } }))
        }
      />
      {errors.channels ? (
        <p
          role="alert"
          className="border-t border-surface-background px-5 py-3 text-xs font-medium text-text-danger"
        >
          {t(errors.channels)}
        </p>
      ) : null}
    </>
  )
}
