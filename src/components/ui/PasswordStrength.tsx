import { getPasswordStrength } from '../../lib/passwordStrength'

type PasswordStrengthProps = {
  password: string
}

const activeColors = [
  'bg-neutral-100',
  'bg-danger-700',
  'bg-warning-700',
  'bg-primary-500',
  'bg-success-700',
]

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const score = getPasswordStrength(password)

  return (
    <div className="flex w-full gap-[15px]" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <span
          key={index}
          className={[
            'h-0.5 flex-1 rounded-full transition-colors',
            index < score ? activeColors[score] : 'bg-neutral-100',
          ].join(' ')}
        />
      ))}
    </div>
  )
}
