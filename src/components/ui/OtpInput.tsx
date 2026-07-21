import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'

type OtpInputProps = {
  value: string[]
  onChange: (value: string[]) => void
  length?: number
}

export function OtpInput({ value, onChange, length = 6 }: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  const updateAt = (index: number, digit: string) => {
    const next = [...value]
    next[index] = digit
    onChange(next)
  }

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    updateAt(index, digit)
    if (digit && index < length - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    const next = Array.from({ length }, (_, i) => pasted[i] ?? '')
    onChange(next)
    inputsRef.current[Math.min(pasted.length, length - 1)]?.focus()
  }

  return (
    <div className="flex w-full justify-between gap-2" dir="ltr">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={value[index] ?? ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className={[
            'h-[66px] w-[58px] rounded-sm bg-surface-card text-center text-[32px] font-medium text-text-primary outline-none transition-shadow',
            'focus:ring-1 focus:ring-border-brand',
            value[index] ? 'ring-1 ring-border-brand' : 'ring-1 ring-border-subtle',
          ].join(' ')}
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  )
}
