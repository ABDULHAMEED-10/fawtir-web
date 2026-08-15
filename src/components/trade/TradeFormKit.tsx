import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import calendarIcon from '../../assets/create-invoice/calendar.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import clockIcon from '../../assets/trade-create/clock.svg'
import linesIcon from '../../assets/trade-create/lines.svg'
import plusGlyphIcon from '../../assets/trade-create/plus.svg'
import paperIcon from '../../assets/trade-create/proof-paper.svg'
import rejectedIcon from '../../assets/trade-create/cond-rejected.svg'
import omrIcon from '../../assets/order-forms-v2/omr.svg'

/**
 * Shared shell for the trade-document creation forms (Figma 68:41721 / 42177 / 42691 / 43204).
 *
 * All four use the same numbered-section card, the same 50px field shell and the same sticky
 * footer, so they live here rather than being copied four times.
 */

export function SectionCard({
  step,
  title,
  hint,
  action,
  children,
  className = '',
}: {
  step?: number
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={['rounded-sm bg-surface-card p-4', className].filter(Boolean).join(' ')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {step !== undefined ? (
            <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
              {step}
            </span>
          ) : null}
          <h2 className="text-xl font-medium leading-[1.2] text-[#2c3342]">{title}</h2>
          {hint ? (
            <span className="text-xs font-medium leading-[1.2] text-[#5b606c]">{hint}</span>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-3 h-px w-full bg-border-subtle" />
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function FieldLabel({
  label,
  required,
  hint,
}: {
  label: string
  required?: boolean
  hint?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm font-medium leading-[1.2] text-[#151c2d]">
      <span>{label}</span>
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      {hint ? <span className="text-xs font-medium text-[#5b606c]">{hint}</span> : null}
    </div>
  )
}

/** The 50px field shell used across the app: #fafafa on a #8095d4 border, 4px radius. */
export function Field({
  label,
  required,
  hint,
  value,
  placeholder,
  suffix,
  highlighted,
  tone = 'default',
}: {
  label?: string
  required?: boolean
  hint?: string
  value?: string
  placeholder?: string
  suffix?: 'chevron' | 'calendar' | 'clock' | ReactNode
  highlighted?: boolean
  tone?: 'default' | 'danger'
}) {
  const suffixNode =
    suffix === 'chevron' ? (
      <img src={chevronIcon} alt="" className="size-6 rotate-90" />
    ) : suffix === 'calendar' ? (
      <img src={calendarIcon} alt="" className="size-6" />
    ) : suffix === 'clock' ? (
      <img src={clockIcon} alt="" className="size-6" />
    ) : (
      suffix
    )

  return (
    <div className="flex flex-col gap-1">
      {label ? <FieldLabel label={label} required={required} hint={hint} /> : null}
      <div
        className={[
          'flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border px-4',
          tone === 'danger' ? 'border-[#98140b]' : 'border-primary-300',
          highlighted ? 'bg-primary-25' : 'bg-surface-tab-bar',
        ].join(' ')}
      >
        <span
          className={[
            'min-w-0 flex-1 truncate text-sm font-medium',
            value ? 'text-text-secondary' : 'text-text-placeholder',
          ].join(' ')}
        >
          {value ?? placeholder}
        </span>
        {suffixNode}
      </div>
    </div>
  )
}

/** The glyphs these cards use in Figma, keyed by the name carried in the data. */
const CHOICE_GLYPHS: Record<string, string> = {
  lines: linesIcon,
  plus: plusGlyphIcon,
  paper: paperIcon,
  rejected: rejectedIcon,
}

/** Icon-led choice cards — one delivery / repeating drops / nothing to deliver, etc. */
export function ChoiceCards({
  options,
  value,
  onChange,
}: {
  options: { id: string; titleKey: string; hintKey: string; icon?: string; glyph?: string }[]
  value: string
  onChange: (id: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className={[
              'flex items-center justify-between gap-2 rounded-sm px-4 py-3 text-start transition-colors',
              active
                ? 'border-2 border-[#5671c5] bg-[#eaedf8]'
                : 'border border-[#e8e8ea] bg-white',
            ].join(' ')}
          >
            <span className="flex min-w-0 items-center gap-2">
              {option.icon || option.glyph ? (
                <img
                  src={option.icon ?? CHOICE_GLYPHS[option.glyph as string]}
                  alt=""
                  className="size-6 shrink-0"
                />
              ) : (
                <span
                  className={[
                    'size-4 shrink-0 rounded-full border',
                    active ? 'border-[#2c4eb7]' : 'border-[#a1a4ab]',
                  ].join(' ')}
                />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-base font-medium leading-[1.2] text-[#151c2d]">
                  {t(option.titleKey)}
                </span>
                <span className="mt-1 truncate text-xs font-medium leading-[1.2] text-[#444957]">
                  {t(option.hintKey)}
                </span>
              </span>
            </span>
            {active ? (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#2c4eb7] text-xs text-white">
                ✓
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** Quantity stepper — two 12px chevrons stacked, as in the line tables. */
export function NumberStepper() {
  return (
    <span className="flex flex-col items-center justify-center gap-0.5">
      <img src={chevronIcon} alt="" aria-hidden="true" className="size-3 -rotate-90" />
      <img src={chevronIcon} alt="" aria-hidden="true" className="size-3 rotate-90" />
    </span>
  )
}

export function Amount({
  value,
  size = 'sm',
  className = '',
}: {
  value: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const mark = { xs: 'w-3.5', sm: 'w-4', md: 'w-5', lg: 'w-6' }[size]
  return (
    <span className="inline-flex items-center gap-1">
      <img src={omrIcon} alt="" className={['h-auto shrink-0', mark].join(' ')} />
      <span className={className}>{value}</span>
    </span>
  )
}

/** Sticky action bar; the sidebar is 248px so it starts there. */
export function FormFooter({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-0 end-0 start-0 z-30 border-t border-border-subtle bg-white px-4 py-3 md:start-[248px]">
      <div className="mx-auto flex max-w-[1144px] flex-wrap items-center justify-end gap-3">
        {children}
      </div>
    </div>
  )
}

export function NotesAndAttachments({
  step,
  noteToCustomer,
  internalNote,
  uploadIcon,
}: {
  step: number
  noteToCustomer: string
  internalNote: string
  uploadIcon: string
}) {
  const { t } = useTranslation()

  return (
    <SectionCard step={step} title={t('tradeCreate.notesTitle')}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <FieldLabel
            label={t('tradeCreate.noteToCustomer')}
            hint={t('tradeCreate.noteToCustomerHint')}
          />
          <div className="min-h-[85px] rounded-sm border border-primary-300 bg-surface-tab-bar p-3 text-sm font-medium leading-[1.4] text-text-secondary">
            {noteToCustomer}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel
            label={t('tradeCreate.internalNote')}
            hint={t('tradeCreate.internalNoteHint')}
          />
          <div className="min-h-[85px] rounded-sm border border-primary-300 bg-surface-tab-bar p-3 text-sm font-medium leading-[1.4] text-text-secondary">
            {internalNote}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <FieldLabel label={t('tradeCreate.supportingDocuments')} />
        <div className="mt-2 flex flex-col items-center gap-2 rounded-sm border border-dashed border-[#d0d2d5] bg-[#fafafa] px-4 py-8 text-center">
          <img src={uploadIcon} alt="" className="size-6" />
          <p className="text-base font-medium leading-[1.2] text-[#2c3342]">
            {t('orderDetail.dropFiles')}
          </p>
          <p className="text-sm font-medium leading-[1.2] text-[#737781]">
            {t('orderDetail.dropFilesHint')}
          </p>
        </div>
      </div>
    </SectionCard>
  )
}
