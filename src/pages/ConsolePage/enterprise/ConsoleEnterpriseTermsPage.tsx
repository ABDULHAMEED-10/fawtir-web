import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Input, Modal, OmAmount, Rial, Switch } from '../../../components/ui'
import { selectAllOnFocus } from '../../../components/invoice/numericInput'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_PAGE,
  ConsoleButton,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { focusFirstInvalid } from '../../../lib/forms'
import { formatAmount, formatDate, formatInstant } from '../../../lib/format'
import { hasPermission } from '../../../lib/identity/entitlements'
import type { FormMessage } from '../../../lib/identity/errors'
import { FEATURE_GROUPS } from '../../../lib/plans'
import { isCompanyId, REVIEW_PERMISSION } from '../../../lib/console/companyVerification'
import { tenantOverviewPath, type TenantOverview } from '../../../lib/console/tenantOverview'
import { PLANS_READ, PLANS_MANAGE } from '../../../lib/console/companySubscription'
import { lockedFeatures } from '../../../lib/console/planCatalogue'
import {
  BILLING_MANAGE,
  BILLING_READ,
  ENTERPRISE_FIELD_ORDER,
  REASON_MAX,
  annualFromMonthly,
  describeEnterpriseTermsFailure,
  enterpriseFormFrom,
  enterpriseTermsPath,
  isTermsConflict,
  quoteChargesVat,
  quoteEnterpriseTerms,
  saveEnterpriseTerms,
  toEnterpriseRequest,
  validateEnterpriseForm,
  validateReason,
  type BillingCycle,
  type EnterpriseQuoteDto,
  type EnterpriseTermsDto,
  type EnterpriseTermsErrors,
  type EnterpriseTermsField,
  type EnterpriseTermsForm,
} from '../../../lib/console/enterpriseTerms'
import { CountingCard } from '../tenant/CompanySubscriptionCards'
import { FieldGrid, GroupLabel, NoteLine, SelectField, SwitchRow } from '../settings/shared'
import { ENTERPRISE_STATE_TONE } from './enterpriseState'

const K = 'console.enterpriseTerms.'
const P = 'console.plans.field.'

/**
 * One company's negotiated Enterprise terms (Business Rules PL-1, §13; P2-5 §3.9): the state, the
 * terms in force and waiting, the form that sets or renegotiates them, the received-documents
 * override, and every save with who, when and why.
 *
 * Saving first asks the server for a quote of one period on the drafted terms and shows it with
 * the reason; only the confirmation writes. Readers without `platform.billing.manage` see the
 * form read-only. Starting billing is a separate act and is not on this page.
 */
export function ConsoleEnterpriseTermsPage() {
  const { id } = useParams()
  return (
    <ConsoleShell requires={BILLING_READ}>
      {isCompanyId(id) ? <TermsScreen tenantId={id} /> : <NotFound />}
    </ConsoleShell>
  )
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.tenants', to: '/console/tenants' }]} />
      <ConsoleNotice
        body={t('console.tenantDetail.notFound')}
        action={{ to: '/console/tenants', label: t('console.tenantDetail.notFoundBack') }}
      />
    </div>
  )
}

function TermsScreen({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const { entitlements } = useEntitlements()
  const may = (permission: string) =>
    entitlements !== null && hasPermission(entitlements, permission)
  // The company's name for the breadcrumb, when the reader may see its overview.
  const overview = useConsoleRead<TenantOverview>(
    may(REVIEW_PERMISSION) ? tenantOverviewPath(tenantId) : null,
  ).read
  const { read, retry } = useConsoleRead<EnterpriseTermsDto>(enterpriseTermsPath(tenantId))
  const [saved, setSaved] = useState<EnterpriseTermsDto | null>(null)
  const [done, setDone] = useState(false)

  const companyName =
    overview.status === 'ready' ? overview.data.identity.tenantName : t(`${K}company`)
  const crumbs = [
    { labelKey: 'console.nav.tenants', to: '/console/tenants' },
    { label: companyName, to: `/console/tenants/${encodeURIComponent(tenantId)}` },
    { labelKey: `${K}title` },
  ]

  if (read.status === 'loading') {
    return (
      <div className={CONSOLE_PAGE}>
        <ConsoleBreadcrumbs items={crumbs} />
        <ConsoleNotice busy body={t(`${K}loading`)} />
      </div>
    )
  }
  if (read.status === 'failed') {
    return (
      <div className={CONSOLE_PAGE}>
        <ConsoleBreadcrumbs items={crumbs} />
        <ConsoleReadFailure error={read.error} retry={retry} />
      </div>
    )
  }

  const terms = saved ?? read.data
  const canManage = may(BILLING_MANAGE)

  return (
    <div className={CONSOLE_PAGE}>
      <div className="min-w-0 [&_nav>span:last-child]:min-w-0 [&_nav>span]:min-w-0">
        <ConsoleBreadcrumbs items={crumbs} />
      </div>
      <ConsolePageHeader
        title={t(`${K}title`)}
        aside={
          <ConsoleStatusPill
            tone={ENTERPRISE_STATE_TONE[terms.state]}
            label={t(`${K}state.${terms.state}`)}
            size="header"
          />
        }
        subtitle={t(`${K}subtitle.${terms.state}`)}
      />
      {done ? (
        <p
          role="status"
          className="rounded-md bg-success-100 px-5 py-4 text-sm font-medium leading-[1.6] text-success-700"
        >
          {t(`${K}saved`)}
        </p>
      ) : null}

      {terms.plan ? <TermsSummary terms={terms} /> : null}

      <TermsForm
        // A new version read starts a fresh form, so nothing typed against the old one lingers.
        key={terms.version}
        tenantId={tenantId}
        terms={terms}
        canManage={canManage}
        onSaved={(answer) => {
          setSaved(answer)
          setDone(true)
        }}
        onStale={() => {
          setSaved(null)
          setDone(false)
          retry()
        }}
      />

      {may(PLANS_READ) ? <CountingCard tenantId={tenantId} canManage={may(PLANS_MANAGE)} /> : null}

      <TermsHistory terms={terms} />
    </div>
  )
}

function Card({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-sm bg-surface-card p-5">
      <div>
        <h2 id={id} className="text-[17px] font-semibold text-text-primary">
          {title}
        </h2>
        {note ? (
          <p className="mt-1 max-w-[640px] text-xs font-medium leading-[1.5] text-text-quaternary">
            {note}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function Facts({ rows }: { rows: Array<[string, ReactNode] | null> }) {
  const shown = rows.filter((row): row is [string, ReactNode] => row !== null)
  return (
    <dl className="grid gap-x-5 gap-y-4 md:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">
            {label}
          </dt>
          <dd className="text-sm font-medium leading-[1.6] text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The terms the company is held to now, any waiting for the renewal, and the next bill. */
function TermsSummary({ terms }: { terms: EnterpriseTermsDto }) {
  const { t, i18n } = useTranslation()
  const cycle = (value: BillingCycle | null | undefined) =>
    value ? t(`console.companySubscription.cycle.${value}`) : null
  const version = (number: number | null | undefined) =>
    number ? t(`${K}versionNumber`, { version: number }) : t(`${K}versionUnknown`)
  return (
    <Card id="enterprise-summary" title={t(`${K}summary.title`)}>
      <Facts
        rows={[
          terms.inForce
            ? [
                t(`${K}summary.inForce`),
                [version(terms.inForce.planVersionNumber), cycle(terms.inForce.billingCycle)]
                  .filter(Boolean)
                  .join(', '),
              ]
            : null,
          terms.pending
            ? [
                t(`${K}summary.pending`),
                t(`${K}summary.pendingValue`, {
                  version: version(terms.pending.planVersionNumber),
                  cycle: cycle(terms.pending.billingCycle),
                  date: formatDate(terms.pending.effectiveOn, i18n.language),
                }),
              ]
            : null,
          terms.nextBill
            ? [t(`${K}summary.nextBill`), <QuoteAmount key="bill" quote={terms.nextBill} />]
            : null,
        ]}
      />
    </Card>
  )
}

/** One period's total with VAT, and the VAT apart only when there is some. */
function QuoteAmount({ quote }: { quote: EnterpriseQuoteDto }) {
  const { t, i18n } = useTranslation()
  const amount = (value: string) => formatAmount(value, 'OMR', i18n.language)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <OmAmount amount={amount(quote.amountInclVat)} amountClassName="text-sm font-semibold" />
      <span className="text-xs font-medium text-text-tertiary">
        {t(`console.companySubscription.cycle.${quote.billingCycle}`)}
        {quoteChargesVat(quote) ? ` · ${t(`${K}quote.includesVat`)}` : ''}
      </span>
    </span>
  )
}

type Confirm = { quote: EnterpriseQuoteDto; form: EnterpriseTermsForm }

function TermsForm({
  tenantId,
  terms,
  canManage,
  onSaved,
  onStale,
}: {
  tenantId: string
  terms: EnterpriseTermsDto
  canManage: boolean
  onSaved: (terms: EnterpriseTermsDto) => void
  onStale: () => void
}) {
  const { t, i18n } = useTranslation()
  const stored = enterpriseFormFrom(terms)
  const [form, setForm] = useState<EnterpriseTermsForm>(stored)
  const [errors, setErrors] = useState<EnterpriseTermsErrors>({})
  const [failure, setFailure] = useState<FormMessage | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const inFlight = useRef(false)
  const locked = lockedFeatures(terms.plan)
  const frozen = !canManage || quoting
  const dirty = terms.plan === null || JSON.stringify(form) !== JSON.stringify(stored)

  const set = <F extends keyof EnterpriseTermsForm>(field: F, value: EnterpriseTermsForm[F]) => {
    setForm((current) => {
      const next = { ...current, [field]: value }
      // PL-4: the annual price follows monthly x 10 until the operator types one of their own.
      if (field === 'monthlyPrice' && !current.annualTouched) {
        next.annualPrice = annualFromMonthly(String(value))
      }
      if (field === 'annualPrice') next.annualTouched = true
      return next
    })
    setErrors((current) => (field in current ? { ...current, [field]: undefined } : current))
    setFailure(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canManage || inFlight.current) return
    const element = event.currentTarget
    const found = validateEnterpriseForm(form)
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length > 0) {
      focusFirstInvalid(element, ENTERPRISE_FIELD_ORDER, found)
      return
    }
    inFlight.current = true
    setQuoting(true)
    try {
      const quote = await quoteEnterpriseTerms(tenantId, toEnterpriseRequest(form, terms.plan))
      setConfirm({ quote, form })
    } catch (error) {
      setFailure(describeEnterpriseTermsFailure(error))
    } finally {
      inFlight.current = false
      setQuoting(false)
    }
  }

  const money = (name: EnterpriseTermsField, label: string, hint?: string, required = false) => (
    <Input
      bordered
      name={name}
      label={label}
      requiredMark={required && canManage}
      hint={hint}
      inputMode="decimal"
      onFocus={selectAllOnFocus}
      autoComplete="off"
      spellCheck={false}
      dir="ltr"
      leadingIcon={<Rial className="text-text-secondary" />}
      value={form[name]}
      onChange={(event) => set(name, event.target.value)}
      error={errors[name] ? t(errors[name]) : undefined}
    />
  )
  const count = (name: EnterpriseTermsField, label: string, hint?: string, required = false) => (
    <Input
      bordered
      name={name}
      label={label}
      requiredMark={required && canManage}
      hint={hint}
      inputMode="numeric"
      onFocus={selectAllOnFocus}
      autoComplete="off"
      spellCheck={false}
      dir="ltr"
      value={form[name]}
      onChange={(event) => set(name, event.target.value)}
      error={errors[name] ? t(errors[name]) : undefined}
    />
  )
  const words = (
    name: EnterpriseTermsField,
    label: string,
    hint: string | undefined,
    dir: 'ltr' | 'rtl',
  ) => (
    <Input
      bordered
      name={name}
      label={label}
      hint={hint}
      autoComplete="off"
      dir={dir}
      value={form[name]}
      onChange={(event) => set(name, event.target.value)}
      error={errors[name] ? t(errors[name]) : undefined}
    />
  )

  const last = terms.history[0]

  return (
    <>
      <section
        aria-labelledby="enterprise-terms-form"
        className="overflow-hidden rounded-sm bg-surface-card"
      >
        <form noValidate onSubmit={(event) => void submit(event)}>
          <div className="p-5">
            <h2 id="enterprise-terms-form" className="text-[17px] font-semibold text-text-primary">
              {t(`${K}form.title`)}
            </h2>
            <p className="mt-1 max-w-[640px] text-xs font-medium leading-[1.5] text-text-quaternary">
              {canManage ? t(`${K}form.note`) : t(`${K}form.readOnly`)}
            </p>
          </div>
          <fieldset disabled={frozen} className="min-w-0">
            <FieldGrid>
              {words('nameEn', t(`${P}nameEn`), t(`${K}form.nameEnHint`), 'ltr')}
              {words('nameAr', t(`${P}nameAr`), t(`${K}form.nameArHint`), 'rtl')}
            </FieldGrid>

            <GroupLabel>{t(`${K}form.price`)}</GroupLabel>
            <FieldGrid>
              {money('monthlyPrice', t(`${P}monthlyPrice`), undefined, true)}
              {money(
                'annualPrice',
                t(`${K}form.annualPrice`),
                t(`${K}form.annualPriceHint`, { months: 10 }),
              )}
              <SelectField
                label={t(`${K}form.billingCycle`)}
                hint={t(`${K}form.billingCycleHint`)}
                value={form.billingCycle}
                onChange={(value) => set('billingCycle', value as BillingCycle)}
                options={(['MONTHLY', 'ANNUAL'] as const).map((value) => ({
                  value,
                  label: t(`${K}form.cycle.${value}`),
                }))}
              />
            </FieldGrid>

            <GroupLabel>{t(`${K}form.limits`)}</GroupLabel>
            <FieldGrid>
              {count('invoicesPerMonth', t(`${P}invoicesPerMonth`), undefined, true)}
              {money('overagePricePerInvoice', t(`${P}overagePrice`), t(`${K}form.overageHint`))}
              {count('peopleIncluded', t(`${P}peopleIncluded`), undefined, true)}
              {money('extraPersonPrice', t(`${P}extraPersonPrice`), t(`${P}extraPersonHint`))}
              {count('branchesIncluded', t(`${P}branchesIncluded`), t(`${P}branchesHint`))}
              {money('extraBranchPrice', t(`${P}extraBranchPrice`), t(`${P}extraBranchHint`))}
            </FieldGrid>
            <SwitchRow
              title={t(`${P}apiAccess`)}
              checked={form.apiAccess}
              disabled={frozen}
              onChange={(checked) => set('apiAccess', checked)}
            />
            <SwitchRow
              title={t(`${P}prioritySupport`)}
              checked={form.prioritySupport}
              disabled={frozen}
              onChange={(checked) => set('prioritySupport', checked)}
            />
            {/*
              TODO(backend): CONSOLE.md 3.1. The ERP add-on price a month (P2-1) is not in the terms
              request yet; ERP included in the contract is the ERP access card on the company page.
            */}
            <NoteLine>{t(`${K}form.erpNote`)}</NoteLine>

            <GroupLabel>{t(`${K}form.features`)}</GroupLabel>
            <div className="flex flex-col gap-4 px-5 pb-5">
              {FEATURE_GROUPS.map((group) => (
                <div key={group.id} className="flex flex-col">
                  <p className="pb-1 text-sm font-semibold text-text-secondary">
                    {t(`plan.featureGroup.${group.id}`)}
                  </p>
                  {group.features.map((feature) => {
                    const compliance = locked.has(feature)
                    const label = t(`plan.featureName.${feature}`)
                    return (
                      <div
                        key={feature}
                        className="flex items-center justify-between gap-4 border-b border-border-subtle py-2 last:border-b-0"
                      >
                        <span className="text-sm font-medium text-text-tertiary">
                          {label}
                          {compliance ? (
                            <span className="ms-2 text-xs text-text-quaternary">
                              {t('console.plans.alwaysOn')}
                            </span>
                          ) : null}
                        </span>
                        <Switch
                          size="sm"
                          checked={compliance || Boolean(form.features[feature])}
                          onChange={(on) => set('features', { ...form.features, [feature]: on })}
                          label={label}
                          disabled={frozen || compliance}
                        />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            <GroupLabel>{t(`${K}form.contract`)}</GroupLabel>
            <FieldGrid>
              {words(
                'contractReference',
                t(`${K}form.contractReference`),
                t(`${K}form.contractHint`),
                'ltr',
              )}
            </FieldGrid>
            <NoteLine>{t(`${K}form.applyNote`)}</NoteLine>
          </fieldset>

          {failure ? (
            <p
              role="alert"
              className="mx-5 mb-4 rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
            >
              {t(failure.key, failure.values)}
            </p>
          ) : null}

          {canManage ? (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-subtle px-5 py-4">
              {last ? (
                <p className="me-auto text-xs font-medium text-text-quaternary">
                  {t(`${K}form.lastChange`, {
                    reason: last.reason,
                    when: formatInstant(last.createdAt, i18n.language),
                  })}
                </p>
              ) : null}
              <ConsoleButton type="submit" size="md" disabled={!dirty || quoting}>
                {quoting ? t(`${K}form.quoting`) : t(`${K}form.save`)}
              </ConsoleButton>
            </div>
          ) : null}
        </form>
      </section>

      {confirm ? (
        <ConfirmDialog
          tenantId={tenantId}
          terms={terms}
          confirm={confirm}
          onClose={() => setConfirm(null)}
          onSaved={(answer) => {
            setConfirm(null)
            onSaved(answer)
          }}
          onStale={() => {
            setConfirm(null)
            onStale()
          }}
        />
      ) : null}
    </>
  )
}

/**
 * The server's quote of one period on the drafted terms, then the reason. One confirmation sends
 * one save; a version conflict offers a reload instead of a retry over the other operator's change.
 */
function ConfirmDialog({
  tenantId,
  terms,
  confirm,
  onClose,
  onSaved,
  onStale,
}: {
  tenantId: string
  terms: EnterpriseTermsDto
  confirm: Confirm
  onClose: () => void
  onSaved: (terms: EnterpriseTermsDto) => void
  onStale: () => void
}) {
  const { t, i18n } = useTranslation()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [failure, setFailure] = useState<FormMessage | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const { quote } = confirm
  const amount = (value: string) => formatAmount(value, 'OMR', i18n.language)
  const formId = 'enterprise-terms-confirm'

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current || conflict) return
    const invalid = validateReason(reason)
    setReasonError(invalid ? t(invalid) : undefined)
    setFailure(null)
    if (invalid) {
      focusFirstInvalid(event.currentTarget, ['reason'], { reason: invalid })
      return
    }
    inFlight.current = true
    setSaving(true)
    try {
      onSaved(
        await saveEnterpriseTerms(
          tenantId,
          terms.version,
          toEnterpriseRequest(confirm.form, terms.plan, reason),
        ),
      )
    } catch (error) {
      setFailure(describeEnterpriseTermsFailure(error))
      setConflict(isTermsConflict(error))
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-2.5 last:border-b-0">
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd>
        <OmAmount
          amount={amount(value)}
          amountClassName={
            strong ? 'text-sm font-semibold text-text-primary' : 'text-sm font-medium'
          }
        />
      </dd>
    </div>
  )

  return (
    <Modal
      open
      width={560}
      onClose={() => {
        if (!saving) onClose()
      }}
      title={t(terms.plan ? `${K}confirm.titleChange` : `${K}confirm.titleSet`)}
      subtitle={t(`${K}confirm.subtitle`, {
        cycle: t(`console.companySubscription.cycle.${quote.billingCycle}`),
      })}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <ConsoleButton
            type="button"
            size="md"
            variant="secondary"
            disabled={saving}
            onClick={onClose}
          >
            {t('common.cancel')}
          </ConsoleButton>
          {conflict ? (
            <ConsoleButton type="button" size="md" onClick={onStale}>
              {t(`${K}reload`)}
            </ConsoleButton>
          ) : (
            <ConsoleButton type="submit" form={formId} size="md" disabled={saving}>
              {saving ? t(`${K}confirm.saving`) : t(`${K}confirm.confirm`)}
            </ConsoleButton>
          )}
        </div>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-5"
      >
        <dl className={`${CONSOLE_CARD} border border-border-subtle px-4`}>
          {row(t(`${K}quote.subtotal`), quote.amountExclVat)}
          {quoteChargesVat(quote) ? row(t(`${K}quote.vat`), quote.vatAmount) : null}
          {row(t(`${K}quote.total`), quote.amountInclVat, true)}
        </dl>
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {t(`${K}form.applyNote`)}
        </p>
        <Input
          bordered
          name="reason"
          label={t(`${K}confirm.reason`)}
          requiredMark
          autoComplete="off"
          maxLength={REASON_MAX}
          hint={t(`${K}confirm.reasonHint`)}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setReasonError(undefined)
          }}
          error={reasonError}
        />
        {failure ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(failure.key, failure.values)}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}

/** Every save, newest first: what changed and from when, why, by whom and when. */
function TermsHistory({ terms }: { terms: EnterpriseTermsDto }) {
  const { t, i18n } = useTranslation()
  const { entitlements } = useEntitlements()
  const me = entitlements?.userId ?? null
  return (
    <Card id="enterprise-history" title={t(`${K}history.title`)}>
      {terms.history.length === 0 ? (
        <p className="text-sm leading-[1.6] text-text-secondary">{t(`${K}history.empty`)}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {terms.history.map((change) => (
            <li
              key={change.id}
              className={`${CONSOLE_CARD} flex flex-col gap-1 border border-border-subtle p-4`}
            >
              <span className="text-sm font-semibold text-text-primary">
                {t(
                  `${K}history.kind.${change.kind === 'SET' || change.kind === 'CHANGED' ? change.kind : 'OTHER'}`,
                )}
              </span>
              <span className="text-xs font-medium text-text-secondary">
                {[
                  t(
                    change.applyFrom === 'NEXT_RENEWAL'
                      ? `${K}history.fromRenewal`
                      : `${K}history.fromAtOnce`,
                    { date: formatDate(change.effectiveOn, i18n.language) },
                  ),
                  t(`console.companySubscription.cycle.${change.billingCycle}`),
                  change.contractReference
                    ? t(`${K}history.contract`, { reference: change.contractReference })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="text-xs font-medium text-text-tertiary">
                {[change.reason, formatInstant(change.createdAt, i18n.language)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="text-xs font-medium text-text-quaternary">
                {t('console.plans.history.by')}{' '}
                {change.createdBy === null ? (
                  t('console.plans.history.system')
                ) : change.createdBy === me ? (
                  t('console.plans.history.you')
                ) : (
                  // TODO(backend): CONSOLE.md 3.2, the operator's name; only the id is recorded.
                  <bdi dir="ltr" className="font-mono text-[11px]">
                    {change.createdBy}
                  </bdi>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
