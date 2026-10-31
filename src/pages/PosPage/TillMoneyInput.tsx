import { useState, type InputHTMLAttributes } from 'react'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { typedBaisa } from '../../lib/posPayment'

/**
 * A till money field. What is typed stays as typed until the field loses focus, and only then shows
 * in three decimals: writing the figure back on every keystroke moved the caret and turned 1.470
 * into 0.001. `onBaisa` hears each keystroke, with null while the text is empty or not a figure.
 */
export function TillMoneyInput({
  baisa,
  onBaisa,
  ...input
}: {
  baisa: number | null
  onBaisa: (baisa: number | null) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onFocus' | 'onBlur'>) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="text"
      inputMode="decimal"
      dir="ltr"
      {...input}
      value={draft ?? (baisa === null ? '' : (baisa / 1000).toFixed(3))}
      onFocus={selectAllOnFocus}
      onChange={(event) => {
        setDraft(event.target.value)
        onBaisa(typedBaisa(event.target.value))
      }}
      onBlur={() => setDraft(null)}
    />
  )
}
