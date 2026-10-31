import { useState, type InputHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { typedBaisa } from '../../lib/posPayment'

/**
 * A till money field. What is typed stays as typed until the field loses focus, and only then shows
 * in three decimals: writing the figure back on every keystroke moved the caret and turned 1.470
 * into 0.001. `onBaisa` hears each keystroke, with null while the text is empty or not a figure.
 * Text that is not a figure ("4.514.5") stays on leaving, with a line under the field saying so,
 * until the page sets another figure (a quick-cash button) or the person types again.
 */
export function TillMoneyInput({
  baisa,
  onBaisa,
  ...input
}: {
  baisa: number | null
  onBaisa: (baisa: number | null) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onFocus' | 'onBlur'>) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(null)
  /** The page's figure when the field was left holding text that is not a figure. */
  const [leftAt, setLeftAt] = useState<number | null | undefined>(undefined)
  const notAFigure = (text: string) => text.trim() !== '' && typedBaisa(text) === null
  const shown = input.readOnly || (leftAt !== undefined && leftAt !== baisa) ? null : draft
  const wrong = shown !== null && notAFigure(shown)
  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        dir="ltr"
        {...input}
        aria-invalid={wrong || undefined}
        value={shown ?? (baisa === null ? '' : (baisa / 1000).toFixed(3))}
        onFocus={selectAllOnFocus}
        onChange={(event) => {
          setLeftAt(undefined)
          setDraft(event.target.value)
          onBaisa(typedBaisa(event.target.value))
        }}
        onBlur={() => {
          if (shown !== null && notAFigure(shown)) setLeftAt(baisa)
          else setDraft(null)
        }}
      />
      {wrong ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">
          {t('pos.moneyNotAFigure')}
        </p>
      ) : null}
    </>
  )
}
