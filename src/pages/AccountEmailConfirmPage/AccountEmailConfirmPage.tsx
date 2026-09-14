import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { BackButton, Button, Input } from '../../components/ui'
import { ChevronRightIcon } from '../../components/ui/icons'
import { confirmOwnEmailChange, describeConfirmFailure, type EmailChangeResult } from '../../lib/identity/accountEmail'
import { focusFirstInvalid } from '../../lib/forms'
import { forgetEntitlements } from '../../lib/identity/entitlements'
import type { FormMessage } from '../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../lib/identity/login'
import { dropLoginChallenge } from '../../lib/identity/loginChallenge'
import { required } from '../../lib/validation'

/** `ConfirmEmailChangeRequest.token`: `@Size(max = 512)`. */
const CODE_MAX = 512

/**
 * Where a Fawtir operator confirms a change of their own sign-in email (`/account/email/confirm`,
 * from the console's user menu), with the code mailed to the new address.
 *
 * Outside the console shell on purpose: the console shows its screens only to someone holding a
 * platform permission, and the operator confirming may hold no role at all. Nothing is read on
 * arrival; a session that has ended is found out when the code is sent, and leads to Sign in.
 */
export function AccountEmailConfirmPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | undefined>()
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<EmailChangeResult | null>(null)
  // One code, one request: a second one would find the change already applied, or the session gone.
  const inFlight = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    const form = event.currentTarget
    const invalid = required(code)
    setCodeError(invalid)
    setFormError(null)
    if (invalid) {
      focusFirstInvalid(form, ['code'], { code: invalid })
      return
    }
    inFlight.current = true
    setSending(true)
    try {
      const result = await confirmOwnEmailChange(code.trim())
      // Every session has just been revoked, this one included: nothing cached for it may be
      // taken as the next sign-in's.
      forgetEntitlements()
      dropLoginChallenge()
      setDone(result)
    } catch (error) {
      const failure = describeConfirmFailure(error)
      if (failure.kind === 'signedOut') {
        forgetEntitlements()
        navigate(LOGIN_ROUTE, { replace: true })
        return
      }
      if (failure.kind === 'code') {
        setCodeError('accountEmail.error.code')
        focusFirstInvalid(form, ['code'], { code: true })
      } else {
        setFormError(failure.message)
      }
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  let content
  if (done) {
    content = (
      <div className="flex w-full max-w-[400px] flex-col gap-6" role="status">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('accountEmail.done.title')}</h2>
          <p className="text-base font-medium leading-[1.4] text-text-quaternary">
            {t('accountEmail.done.body', { email: done.newEmail })}
          </p>
        </div>
        <Link
          to={LOGIN_ROUTE}
          replace
          className="inline-flex h-[50px] w-full items-center justify-center gap-1.5 rounded-sm bg-primary-700 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          {t('accountEmail.done.signIn')}
          <ChevronRightIcon size={18} className="rtl:rotate-180" />
        </Link>
      </div>
    )
  } else {
    content = (
      <form noValidate onSubmit={(event) => void submit(event)} className="flex w-full max-w-[400px] flex-col gap-11">
        <div className="flex flex-col gap-9">
          <div className="flex flex-col gap-3">
            <BackButton to="/console" className="self-start" />
            <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('accountEmail.title')}</h2>
            <p className="text-base font-medium leading-[1.4] text-text-quaternary">{t('accountEmail.description')}</p>
          </div>
          <Input
            label={t('accountEmail.code')}
            requiredMark
            name="code"
            autoComplete="off"
            spellCheck={false}
            maxLength={CODE_MAX}
            value={code}
            onChange={(event) => {
              setCode(event.target.value)
              setCodeError(undefined)
              setFormError(null)
            }}
            hint={t('accountEmail.codeHint')}
            error={codeError ? t(codeError) : undefined}
          />
          {formError ? (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {t(formError.key, formError.values)}
            </p>
          ) : null}
        </div>
        <Button type="submit" fullWidth className="gap-1.5" disabled={sending}>
          {sending ? t('accountEmail.confirming') : t('accountEmail.confirm')}
          <ChevronRightIcon size={18} className="rtl:rotate-180" />
        </Button>
      </form>
    )
  }

  return <AuthLayout>{content}</AuthLayout>
}
