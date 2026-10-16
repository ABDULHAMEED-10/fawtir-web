import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  Input,
  LockIcon,
  PasswordStrength,
  UserIcon,
} from '../../components/ui'
import { focusFirstInvalid } from '../../lib/forms'
import type { FormMessage } from '../../lib/identity/errors'
import { LOGIN_ROUTE } from '../../lib/identity/login'
import {
  acceptOperatorInvitation,
  describeAcceptFailure,
  type AcceptField,
} from '../../lib/identity/operatorInvitation'
import {
  confirmPassword as validateConfirm,
  isClean,
  password as validatePassword,
  username as validateUsername,
  type FieldError,
} from '../../lib/validation'

type Field = AcceptField | 'confirmPassword'
const FIELD_ORDER: readonly Field[] = ['username', 'firstName', 'lastName', 'password', 'confirmPassword']

// `AcceptInvitationRequest` bounds each name at 100.
const NAME_MAX_LENGTH = 100

function optionalName(value: string): FieldError {
  return value.trim().length > NAME_MAX_LENGTH ? 'operatorInvitation.error.nameTooLong' : undefined
}

/**
 * Which invitation the form serves. Both accept through the same endpoint with the same fields;
 * only the wording around the form differs (an operator joins the console with no role, a company
 * user joins their company with the role the administrator chose).
 */
export type InvitationCopy = 'operatorInvitation' | 'companyInvitation'

/**
 * The invitee's side of an operator or company invitation: they choose a username and their own
 * password.
 *
 * The username follows the backend's V174 rule here, because acceptance itself does not check
 * the pattern yet and a name the database refuses would come back as a server fault. When the
 * link turns out to be spent, the form gives way to a message: nothing typed could fix it.
 */
export function OperatorInvitationForm({
  token,
  onLinkSpent,
  copy = 'operatorInvitation',
}: {
  token: string
  onLinkSpent: () => void
  copy?: InvitationCopy
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState({ username: '', firstName: '', lastName: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  // The token is single-use: a second submit while the first runs could only fail, and would
  // replace a real answer with "link already used".
  const inFlight = useRef(false)

  const set = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
    setFormError(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    const form = event.currentTarget
    const next: Partial<Record<Field, FieldError>> = {
      username: validateUsername(values.username),
      firstName: optionalName(values.firstName),
      lastName: optionalName(values.lastName),
      password: validatePassword(values.password),
      confirmPassword: validateConfirm(values.confirmPassword, values.password),
    }
    setErrors(next)
    setFormError(null)
    if (!isClean(next)) {
      focusFirstInvalid(form, FIELD_ORDER, next)
      return
    }
    inFlight.current = true
    setSubmitting(true)
    try {
      await acceptOperatorInvitation({
        token,
        username: values.username.trim(),
        password: values.password,
        firstName: values.firstName.trim() || undefined,
        lastName: values.lastName.trim() || undefined,
      })
      setDone(true)
    } catch (error) {
      const failure = describeAcceptFailure(error)
      if (failure.kind === 'link') {
        onLinkSpent()
        return
      }
      setErrors(failure.fieldErrors)
      setFormError(failure.formError)
      focusFirstInvalid<Field>(form, FIELD_ORDER, failure.fieldErrors)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex w-full max-w-[400px] flex-col gap-6" role="status">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t(`${copy}.done.title`)}</h2>
          <p className="text-base font-medium leading-[1.4] text-text-quaternary">{t(`${copy}.done.body`)}</p>
        </div>
        <Link
          to={LOGIN_ROUTE}
          className="inline-flex h-[50px] w-full items-center justify-center gap-1.5 rounded-sm bg-primary-700 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          {t('operatorInvitation.done.signIn')}
          <ChevronRightIcon size={18} className="rtl:rotate-180" />
        </Link>
      </div>
    )
  }

  const passwordToggle = (shown: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex text-text-quaternary hover:text-text-secondary"
      aria-label={shown ? t('login.hidePassword') : t('login.showPassword')}
    >
      {shown ? <EyeIcon /> : <EyeOffIcon />}
    </button>
  )

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t(`${copy}.title`)}</h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">{t(`${copy}.description`)}</p>
        </div>

        <div className="flex flex-col gap-6">
          <Input
            label={t('login.usernameLabel')}
            requiredMark
            name="username"
            autoComplete="username"
            spellCheck={false}
            placeholder={t('signup.usernamePlaceholder')}
            value={values.username}
            onChange={(event) => set('username', event.target.value)}
            error={errors.username ? t(errors.username) : undefined}
            leadingIcon={<UserIcon />}
          />
          <Input
            label={t('operatorInvitation.firstName')}
            name="firstName"
            autoComplete="given-name"
            value={values.firstName}
            onChange={(event) => set('firstName', event.target.value)}
            error={errors.firstName ? t(errors.firstName) : undefined}
          />
          <Input
            label={t('operatorInvitation.lastName')}
            name="lastName"
            autoComplete="family-name"
            value={values.lastName}
            onChange={(event) => set('lastName', event.target.value)}
            error={errors.lastName ? t(errors.lastName) : undefined}
          />
          <div className="flex flex-col gap-2.5">
            <Input
              label={t('newPassword.passwordLabel')}
              requiredMark
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={t('newPassword.passwordPlaceholder')}
              value={values.password}
              onChange={(event) => set('password', event.target.value)}
              error={errors.password ? t(errors.password) : undefined}
              leadingIcon={<LockIcon />}
              trailingIcon={passwordToggle(showPassword, () => setShowPassword((v) => !v))}
            />
            <PasswordStrength password={values.password} />
          </div>
          <Input
            label={t('newPassword.confirmPasswordLabel')}
            requiredMark
            name="confirmPassword"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={t('newPassword.confirmPasswordPlaceholder')}
            value={values.confirmPassword}
            onChange={(event) => set('confirmPassword', event.target.value)}
            error={errors.confirmPassword ? t(errors.confirmPassword) : undefined}
            leadingIcon={<LockIcon />}
            trailingIcon={passwordToggle(showConfirm, () => setShowConfirm((v) => !v))}
          />
        </div>

        {formError ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(formError.key, formError.values)}
          </p>
        ) : null}
      </div>

      <Button type="submit" fullWidth className="gap-1.5" disabled={submitting}>
        {submitting ? t('operatorInvitation.submitting') : t('operatorInvitation.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
