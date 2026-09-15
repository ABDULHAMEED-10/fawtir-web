import { useTranslation } from 'react-i18next'
import { Input, SegmentedControl } from '../../../components/ui'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import type { SectionProps } from './draft'
import {
  DayListField,
  FieldGrid,
  GroupLabel,
  NumberField,
  PlaceholderChips,
  SwitchRow,
  TextareaField,
} from './shared'

const K = 'console.settings.payments.'

/** What a WhatsApp template may carry; the backend fills them when the message is sent. */
const TEMPLATE_TOKENS = ['contact', 'plan', 'period', 'amount', 'link', 'days'] as const

const METHODS = ['cardLink', 'bankTransfer', 'cash', 'cheque'] as const
const BANK_FIELDS = ['accountName', 'bank', 'iban', 'referenceFormat'] as const

export function PaymentsSection({ form, set, errors }: SectionProps<'payments'>) {
  const { t } = useTranslation()
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined)
  const template = (lang: 'en' | 'ar') => (value: string) =>
    set((current) => ({
      ...current,
      whatsappTemplate: { ...current.whatsappTemplate, [lang]: value },
    }))
  const insert = (lang: 'en' | 'ar') => (token: string) =>
    set((current) => {
      const text = current.whatsappTemplate[lang]
      const joined = text === '' || /\s$/.test(text) ? `${text}${token}` : `${text} ${token}`
      return { ...current, whatsappTemplate: { ...current.whatsappTemplate, [lang]: joined } }
    })

  return (
    <>
      <div className="border-t border-surface-background p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-border-subtle p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <p className="text-base font-semibold leading-[1.2] text-text-primary">
                {t(`${K}provider.thawani`)}
              </p>
              <ConsoleStatusPill
                tone={form.mode === 'live' ? 'success' : 'pending'}
                label={t(`${K}mode.${form.mode}`)}
              />
            </div>
            <p className="mt-2 text-xs font-medium text-text-quaternary">
              {t(`${K}provider.publishableKey`)}{' '}
              <code dir="ltr" className="font-mono text-xs font-semibold text-text-secondary">
                {form.publishableKeyTail}
              </code>
            </p>
            <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t(`${K}provider.keysNote`)}
            </p>
          </div>
          <SegmentedControl
            ariaLabel={t(`${K}provider.modeLabel`)}
            value={form.mode}
            onChange={(mode) => set((current) => ({ ...current, mode }))}
            options={[
              { value: 'test', label: t(`${K}mode.test`) },
              { value: 'live', label: t(`${K}mode.live`) },
            ]}
          />
        </div>
      </div>

      <GroupLabel>{t(`${K}methodsGroup`)}</GroupLabel>
      {METHODS.map((method) => (
        <SwitchRow
          key={method}
          title={t(`${K}method.${method}`)}
          note={t(`${K}methodNote.${method}`)}
          checked={form.methods[method]}
          onChange={(checked) =>
            set((current) => ({ ...current, methods: { ...current.methods, [method]: checked } }))
          }
        />
      ))}

      <GroupLabel>{t(`${K}bankGroup`)}</GroupLabel>
      <FieldGrid>
        {BANK_FIELDS.map((field) => (
          <Input
            key={field}
            bordered
            name={`bank.${field}`}
            label={t(`${K}bank.${field}`)}
            hint={field === 'referenceFormat' ? t(`${K}bank.referenceFormatHint`) : undefined}
            dir={field === 'iban' || field === 'referenceFormat' ? 'ltr' : undefined}
            autoComplete="off"
            spellCheck={false}
            value={form.bank[field]}
            onChange={(event) =>
              set((current) => ({
                ...current,
                bank: { ...current.bank, [field]: event.target.value },
              }))
            }
            error={err(`bank.${field}`)}
          />
        ))}
      </FieldGrid>

      <GroupLabel>{t(`${K}activationGroup`)}</GroupLabel>
      <FieldGrid>
        <NumberField
          name="linkExpiryDays"
          label={t(`${K}linkExpiry`)}
          hint={t(`${K}linkExpiryHint`)}
          value={form.linkExpiryDays}
          onChange={(value) => set((current) => ({ ...current, linkExpiryDays: value }))}
          error={err('linkExpiryDays')}
        />
        <DayListField
          label={t(`${K}reminderDays`)}
          hint={t(`${K}reminderDaysHint`)}
          values={form.reminderDays}
          onChange={(values) => set((current) => ({ ...current, reminderDays: values }))}
          format={(day) => t('console.settings.dayList.day', { day })}
        />
      </FieldGrid>
      <SwitchRow
        title={t(`${K}autoActivate`)}
        note={t(`${K}autoActivateNote`)}
        checked={form.autoActivateOnlinePayment}
        onChange={(checked) =>
          set((current) => ({ ...current, autoActivateOnlinePayment: checked }))
        }
      />
      <SwitchRow
        title={t(`${K}proofRequired`)}
        note={t(`${K}proofRequiredNote`)}
        checked={form.proofRequiredForCash}
        onChange={(checked) => set((current) => ({ ...current, proofRequiredForCash: checked }))}
      />

      <GroupLabel>{t(`${K}templatesGroup`)}</GroupLabel>
      <div className="grid gap-5 border-t border-surface-background p-5">
        <p className="-mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
          {t(`${K}templatesNote`)}
        </p>
        <TextareaField
          name="whatsappTemplate.en"
          label={t(`${K}template.en`)}
          value={form.whatsappTemplate.en}
          onChange={template('en')}
          dir="ltr"
          error={err('whatsappTemplate.en')}
        >
          <PlaceholderChips tokens={TEMPLATE_TOKENS} onInsert={insert('en')} />
        </TextareaField>
        <TextareaField
          name="whatsappTemplate.ar"
          label={t(`${K}template.ar`)}
          value={form.whatsappTemplate.ar}
          onChange={template('ar')}
          dir="rtl"
          error={err('whatsappTemplate.ar')}
        >
          <PlaceholderChips tokens={TEMPLATE_TOKENS} onInsert={insert('ar')} />
        </TextareaField>
      </div>
    </>
  )
}
