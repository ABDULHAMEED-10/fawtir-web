import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, OtpInput } from '../../components/ui'

type VerifyCodeViewProps = {
  description: string
  code: string[]
  onCodeChange: (code: string[]) => void
  /** Already translated. */
  error?: string
  /** `m:ss` until Resend becomes available. */
  resendIn: string
  canResend: boolean
  onResend: () => void
  submitting?: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

/** The code screen as the design draws it, shared by the signup and password-reset flows. */
export function VerifyCodeView({
  description,
  code,
  onCodeChange,
  error,
  resendIn,
  canResend,
  onResend,
  submitting = false,
  onSubmit,
}: VerifyCodeViewProps) {
  const { t } = useTranslation()

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-8">
        <div className="space-y-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('verifyCode.title')}
          </h2>
          <p className="text-sm font-medium leading-relaxed text-text-muted">{description}</p>
        </div>

        <div className="flex flex-col gap-2">
          <OtpInput value={code} onChange={onCodeChange} invalid={Boolean(error)} />

          {error ? (
            <p className="text-xs font-medium text-text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 text-xs font-medium">
            <span className="text-text-muted">{t('verifyCode.resendIn', { time: resendIn })}</span>
            <button
              type="button"
              onClick={onResend}
              disabled={!canResend}
              className="font-medium text-primary-700 transition-colors hover:text-primary-800 disabled:cursor-not-allowed disabled:text-text-disabled"
            >
              {t('verifyCode.resend')}
            </button>
          </div>
        </div>
      </div>

      <Button type="submit" fullWidth disabled={submitting} className="gap-1.5">
        {submitting ? t('verifyCode.submitting') : t('verifyCode.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
