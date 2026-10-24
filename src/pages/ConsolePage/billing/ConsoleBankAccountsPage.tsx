import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleSettingsFrame } from '../../../layouts/ConsoleShell/ConsoleSettingsFrame'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill, type ConsolePillTone } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_PAGE,
  CONSOLE_PRIMARY,
  CONSOLE_SMALL,
  CONSOLE_SMALL_DANGER,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { hasPermission, peekEntitlements } from '../../../lib/identity/entitlements'
import { formatInstant } from '../../../lib/format'
import {
  BENEFICIARIES_PATH,
  BILLING_MANAGE_PERMISSION,
  BILLING_READ_PERMISSION,
  confirmBeneficiary,
  proposeBeneficiary,
  retireBeneficiary,
  type BeneficiaryRecordDto,
} from '../../../lib/console/billingPayments'

const TONE: Record<BeneficiaryRecordDto['status'], ConsolePillTone> = {
  PENDING_CONFIRMATION: 'pending',
  ACTIVE: 'success',
  RETIRED: 'neutral',
}

/**
 * The account customers pay Fawtir into (backend V271). Customers see an account only after a
 * second operator confirms it, so the person who typed an IBAN can never make it live alone; the
 * server refuses the same person and checks the Omani IBAN itself.
 */
export function ConsoleBankAccountsPage() {
  return (
    <ConsoleShell requires={BILLING_READ_PERMISSION}>
      <BankAccounts />
    </ConsoleShell>
  )
}

/**
 * The screen's body. `embedded`: one section of Console › Settings › Fawtir company details,
 * under that page's frame, so it draws no frame or page column of its own.
 */
export function BankAccounts({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<BeneficiaryRecordDto[]>(BENEFICIARIES_PATH)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // Retiring the live account closes bank transfer for every customer at once, so it asks first.
  const [retiring, setRetiring] = useState<string | null>(null)
  const entitlements = peekEntitlements()
  const canManage = entitlements ? hasPermission(entitlements, BILLING_MANAGE_PERMISSION) : false

  const act = async (work: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setFailure(null)
    try {
      await work()
      retry()
      return true
    } catch (error) {
      setFailure(message(t, error))
      return false
    } finally {
      setBusy(false)
    }
  }

  let body: ReactNode
  if (read.status === 'loading') body = <ConsoleNotice busy body={t('console.bankAccounts.loading')} />
  else if (read.status === 'failed') body = <ConsoleReadFailure error={read.error} retry={retry} />
  else if (read.data.length === 0) {
    body = (
      <p className="rounded-sm bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('console.bankAccounts.empty')}
      </p>
    )
  } else {
    body = (
      <ul className="flex flex-col gap-3">
        {read.data.map((account) => (
          <li key={account.id} className={`${CONSOLE_CARD} flex flex-wrap items-center justify-between gap-3 p-4`}>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-text-primary">
                {account.legalName} · {account.bankName}
              </span>
              <span dir="ltr" className="text-sm font-medium text-text-secondary">
                {account.iban}
                {account.swiftCode ? ` · ${account.swiftCode}` : ''}
              </span>
              <span className="text-xs font-medium text-text-tertiary">
                {account.reason} · {formatInstant(account.createdAt, i18n.language)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ConsoleStatusPill tone={TONE[account.status]} label={t(`console.bankAccounts.status.${account.status}`)} />
              {canManage && account.status === 'PENDING_CONFIRMATION' ? (
                <button
                  type="button"
                  className={CONSOLE_SMALL}
                  disabled={busy}
                  onClick={() => act(() => confirmBeneficiary(account.id, account.version))}
                >
                  {t('console.bankAccounts.confirm')}
                </button>
              ) : null}
              {canManage && account.status !== 'RETIRED' ? (
                <button
                  type="button"
                  className={CONSOLE_SMALL_DANGER}
                  disabled={busy}
                  onClick={() =>
                    account.status === 'ACTIVE'
                      ? setRetiring(account.id)
                      : act(() => retireBeneficiary(account.id, account.version))
                  }
                >
                  {t('console.bankAccounts.retire')}
                </button>
              ) : null}
            </div>
            {retiring === account.id ? (
              <div
                role="alert"
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-sm bg-danger-100 px-4 py-3"
              >
                <p className="text-sm font-medium text-danger-700">
                  {t('console.bankAccounts.retireConfirm')}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={CONSOLE_SMALL}
                    disabled={busy}
                    onClick={() => setRetiring(null)}
                  >
                    {t('console.bankAccounts.keep')}
                  </button>
                  <button
                    type="button"
                    className={CONSOLE_SMALL_DANGER}
                    disabled={busy}
                    onClick={async () => {
                      if (await act(() => retireBeneficiary(account.id, account.version))) {
                        setRetiring(null)
                      }
                    }}
                  >
                    {t('console.bankAccounts.retireNow')}
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className={embedded ? 'flex flex-col gap-5' : CONSOLE_PAGE}>
      {embedded ? null : <ConsoleSettingsFrame tab="company" />}
      <ConsolePageHeader level={embedded ? 'subsection' : 'section'} title={t('console.bankAccounts.title')} subtitle={t('console.bankAccounts.subtitle')} />
      {failure ? (
        <p role="alert" className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700">
          {failure}
        </p>
      ) : null}
      {body}
      {canManage ? (
        <ProposeForm busy={busy} onPropose={(account) => act(() => proposeBeneficiary(account))} />
      ) : null}
    </div>
  )
}

function ProposeForm({
  busy,
  onPropose,
}: {
  busy: boolean
  onPropose: (account: {
    legalName: string
    bankName: string
    iban: string
    swiftCode: string
    reason: string
  }) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [legalName, setLegalName] = useState('')
  const [bankName, setBankName] = useState('')
  const [iban, setIban] = useState('')
  const [swiftCode, setSwiftCode] = useState('')
  const [reason, setReason] = useState('')
  const ready = legalName.trim() && bankName.trim() && iban.trim() && reason.trim()
  return (
    <section aria-labelledby="propose-account" className={`${CONSOLE_CARD} flex flex-col gap-3 p-5`}>
      <h2 id="propose-account" className="text-base font-semibold text-text-primary">
        {t('console.bankAccounts.propose')}
      </h2>
      <p className="text-xs font-medium text-text-tertiary">{t('console.bankAccounts.proposeNote')}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t('billing.bank.holder')} value={legalName} onChange={setLegalName} />
        <Field label={t('billing.bank.bank')} value={bankName} onChange={setBankName} />
        <Field label={t('billing.bank.iban')} value={iban} onChange={setIban} ltr />
        <Field label={t('billing.bank.swift')} value={swiftCode} onChange={setSwiftCode} ltr />
        <Field label={t('console.bankAccounts.reason')} value={reason} onChange={setReason} />
      </div>
      <div>
        <button
          type="button"
          className={CONSOLE_PRIMARY}
          disabled={!ready || busy}
          onClick={async () => {
            // Cleared once the server took it, so a second click cannot propose the same account.
            if (await onPropose({ legalName, bankName, iban, swiftCode, reason })) {
              setLegalName('')
              setBankName('')
              setIban('')
              setSwiftCode('')
              setReason('')
            }
          }}
        >
          {t('console.bankAccounts.submit')}
        </button>
      </div>
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  ltr = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  ltr?: boolean
}) {
  // Tied by id as well as by nesting: the retest found these read as unnamed textboxes (K-UI-b).
  const id = useId()
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
      {label}
      <input
        id={id}
        className="h-10 rounded-sm border border-border-default bg-white px-3"
        dir={ltr ? 'ltr' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function message(t: (key: string) => string, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.problemType === 'payment-approver-not-independent') return t('console.bankAccounts.refusal.sameOperator')
    if (error.problemType === 'payment-version-conflict') return t('console.billing.refusal.payment-version-conflict')
    if (error.status === 400) return t('console.bankAccounts.refusal.invalid')
    // A 403 used to fall through to "That did not go through" (K-UI-a); the other billing console
    // pages name it, and a CSRF refusal is the expired-session case, not a missing permission.
    if (error.problemType === 'production-platform-realm-required')
      return t('console.billing.refusal.production-platform-realm-required')
    if (error.problemType === 'impersonation-not-allowed') return t('console.billing.refusal.impersonation-not-allowed')
    if (error.problemType === 'csrf-rejected') return t('apiErrors.csrf')
    if (error.status === 403) return t('console.billing.refusal.forbidden')
  }
  return t('console.billing.refusal.other')
}
