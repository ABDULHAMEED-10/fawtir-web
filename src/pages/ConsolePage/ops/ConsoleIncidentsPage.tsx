import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice } from '../../../layouts/ConsoleShell/ConsoleNotice'
import {
  ConsoleStatusPill,
  type ConsolePillSize,
  type ConsolePillTone,
} from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import {
  ConsoleBuildingIcon,
  ConsoleIncidentIcon,
  ConsoleTickIcon,
} from '../../../layouts/ConsoleShell/consoleIcons'
import { Input, Modal, Select } from '../../../components/ui'
import { count } from '../../../lib/superAdmin'
import { formatMoment } from '../../../lib/console/format'
import {
  INCIDENT_STATES,
  NOW,
  consoleOpsStore,
  incidentById,
  openIncidents,
  useConsoleOps,
  type Component,
  type Incident,
  type IncidentState,
  type Severity,
} from '../../../lib/consoleOps'
import { QueueKpiCard } from '../subscriptions/QueueKpiCard'
import {
  Field,
  ModalFooter,
  TextArea,
  focusFirstInvalidField,
  type Errors,
} from '../subscriptions/modalFields'
import { CONSOLE_CARD_TITLE, CONSOLE_PAGE, CONSOLE_PRIMARY, CONSOLE_SECONDARY, CONSOLE_TABLE, CONSOLE_TAB_BAR, CONSOLE_TAB_COUNT, CONSOLE_TAB_LINE, CONSOLE_THEAD, ConsoleButton, ConsolePageHeader } from '../../../layouts/ConsoleShell/consoleStyle'
import { consoleTab } from '../../../layouts/ConsoleShell/consoleTones'

/**
 * Platform incidents — docs/erp-and-console-plan.md §9.3. The list of what is (or was) wrong on
 * the platform, and one incident's page: its state, the updates operators posted, and the notice
 * every tenant's bell carries. The same component serves `/console/incidents` and `/:id`.
 */

const SEVERITIES: Severity[] = ['minor', 'major', 'critical']
const COMPONENTS: Component[] = ['ota', 'peppol', 'signing', 'platform', 'connector']

const STATE_TONE: Record<IncidentState, ConsolePillTone> = {
  investigating: 'pending',
  identified: 'pending',
  monitoring: 'neutral',
  resolved: 'success',
}
const SEVERITY_TONE: Record<Severity, ConsolePillTone> = {
  minor: 'neutral',
  major: 'pending',
  critical: 'danger',
}

function IncidentStatePill({ state, size }: { state: IncidentState; size?: ConsolePillSize }) {
  const { t } = useTranslation()
  return (
    <ConsoleStatusPill
      tone={STATE_TONE[state]}
      label={t(`console.incidents.state.${state}`)}
      size={size}
    />
  )
}
function SeverityPill({ severity, size }: { severity: Severity; size?: ConsolePillSize }) {
  const { t } = useTranslation()
  return (
    <ConsoleStatusPill
      tone={SEVERITY_TONE[severity]}
      label={t(`console.incidents.severity.${severity}`)}
      size={size}
    />
  )
}

/** "3 h 6 min" or "40 min" — how long it has run, or ran. */
function useDuration() {
  const { t } = useTranslation()
  return (incident: Incident) => {
    const end = incident.resolvedAt ?? NOW
    const minutes = Math.max(0, Math.round((end.getTime() - incident.startedAt.getTime()) / 60000))
    return minutes < 60
      ? t('console.incidents.duration.minutes', { count: minutes })
      : t('console.incidents.duration.hours', {
          hours: Math.floor(minutes / 60),
          minutes: minutes % 60,
        })
  }
}

/* ------------------------------------------------------------------ list */

const FORM_ID = 'open-incident'
type OpenField = 'title' | 'severity' | 'component' | 'text' | 'affected'
const OPEN_ORDER: OpenField[] = ['title', 'severity', 'component', 'text', 'affected']

function OpenIncidentModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [severity, setSeverity] = useState<Severity | ''>('')
  const [component, setComponent] = useState<Component | ''>('')
  const [text, setText] = useState('')
  const [affected, setAffected] = useState('')
  const [errors, setErrors] = useState<Errors<OpenField>>({})
  const clear = (field: OpenField) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<OpenField> = {}
    if (!title.trim()) next.title = t('validation.required')
    if (!severity) next.severity = t('validation.required')
    if (!component) next.component = t('validation.required')
    if (!text.trim()) next.text = t('validation.required')
    const tenants = affected.trim() === '' ? 0 : Number(affected.replace(/[,\s]/g, ''))
    if (!Number.isInteger(tenants) || tenants < 0)
      next.affected = t('console.incidents.open.error.affected')
    setErrors(next)
    if (Object.values(next).some(Boolean) || !severity || !component) {
      focusFirstInvalidField(event.currentTarget, OPEN_ORDER, next)
      return
    }
    const incident = consoleOpsStore.openIncident({
      title: title.trim(),
      severity,
      component,
      text: text.trim(),
      affectedTenants: tenants,
    })
    onClose()
    navigate(`/console/incidents/${incident.id}`)
  }

  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t('console.incidents.open.title')}
      subtitle={t('console.incidents.open.subtitle')}
      footer={
        <ModalFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitLabel={t('console.incidents.open.submit')}
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div data-field="title">
          <Input
            bordered
            name="title"
            label={t('console.incidents.open.name')}
            requiredMark
            autoComplete="off"
            placeholder={t('console.incidents.open.namePlaceholder')}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              clear('title')
            }}
            error={errors.title}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            name="severity"
            label={t('console.incidents.col.severity')}
            required
            error={errors.severity}
          >
            <Select
              value={severity}
              onChange={(value) => {
                setSeverity(value as Severity)
                clear('severity')
              }}
              placeholder={t('console.incidents.open.pick')}
              options={SEVERITIES.map((id) => ({
                value: id,
                label: t(`console.incidents.severity.${id}`),
              }))}
              ariaLabel={t('console.incidents.col.severity')}
            />
          </Field>
          <Field
            name="component"
            label={t('console.incidents.col.component')}
            required
            error={errors.component}
          >
            <Select
              value={component}
              onChange={(value) => {
                setComponent(value as Component)
                clear('component')
              }}
              placeholder={t('console.incidents.open.pick')}
              options={COMPONENTS.map((id) => ({
                value: id,
                label: t(`console.incidents.component.${id}`),
              }))}
              ariaLabel={t('console.incidents.col.component')}
            />
          </Field>
        </div>
        <TextArea
          name="text"
          label={t('console.incidents.open.firstUpdate')}
          required
          placeholder={t('console.incidents.open.firstUpdatePlaceholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            clear('text')
          }}
          error={errors.text}
        />
        <div data-field="affected" className="md:w-1/2">
          <Input
            bordered
            name="affected"
            label={t('console.incidents.open.affected')}
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={affected}
            onChange={(event) => {
              setAffected(event.target.value)
              clear('affected')
            }}
            error={errors.affected}
            hint={t('console.incidents.open.affectedHint')}
          />
        </div>
      </form>
    </Modal>
  )
}

type ListTab = 'open' | 'resolved'

function IncidentsList() {
  const { t, i18n } = useTranslation()
  const ops = useConsoleOps()
  const duration = useDuration()
  const [tab, setTab] = useState<ListTab>('open')
  const [opening, setOpening] = useState(false)

  const open = openIncidents(ops)
  const resolved = ops.incidents.filter((x) => x.state === 'resolved')
  const resolvedThisMonth = resolved.filter(
    (x) =>
      x.resolvedAt &&
      x.resolvedAt.getMonth() === NOW.getMonth() &&
      x.resolvedAt.getFullYear() === NOW.getFullYear(),
  ).length
  const affected = open.reduce((sum, x) => sum + x.affectedTenants, 0)
  const rows = (tab === 'open' ? open : resolved)
    .slice()
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  const moment = (date: Date) => formatMoment(date.toISOString(), i18n.language)

  return (
    <div className={CONSOLE_PAGE}>
      <ConsolePageHeader
        title={t('console.incidents.title')}
        subtitle={t('console.incidents.subtitle', { count: open.length })}
        actions={
          <>
            <Link to="/console/queue" className={CONSOLE_SECONDARY}>
              {t('console.incidents.queueLink')}
            </Link>
            <button type="button" onClick={() => setOpening(true)} className={CONSOLE_PRIMARY}>
              {t('console.incidents.openButton')}
            </button>
          </>
        }
      />

      <div className="flex flex-wrap gap-4">
        <QueueKpiCard
          icon={<ConsoleIncidentIcon className="size-4 text-danger-700" />}
          title={t('console.incidents.kpi.open')}
          value={String(open.length)}
          note={t('console.incidents.kpi.openNote', {
            count: open.filter((x) => x.severity !== 'minor').length,
          })}
          tone={
            open.some((x) => x.severity === 'critical') ? 'bad' : open.length ? 'watch' : 'calm'
          }
        />
        <QueueKpiCard
          icon={<ConsoleBuildingIcon className="size-4 text-primary-700" />}
          title={t('console.incidents.kpi.affected')}
          value={count(affected)}
          note={t('console.incidents.kpi.affectedNote')}
        />
        <QueueKpiCard
          icon={<ConsoleTickIcon className="size-4 text-success-700" />}
          tone="good"
          title={t('console.incidents.kpi.resolved')}
          value={String(resolvedThisMonth)}
          note={t('console.incidents.kpi.resolvedNote', {
            month: NOW.toLocaleDateString(i18n.language.startsWith('ar') ? 'ar' : 'en-GB', {
              month: 'long',
            }),
          })}
        />
      </div>

      <section className="flex flex-col rounded-sm bg-surface-card">
        <div className={CONSOLE_TAB_BAR}>
          {(['open', 'resolved'] as ListTab[]).map((id) => {
            const active = id === tab
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={active}
                className={consoleTab(active)}
              >
                {t(`console.incidents.tab.${id}`)}
                <span className={CONSOLE_TAB_COUNT}>
                  {id === 'open' ? open.length : resolved.length}
                </span>
                {active ? (
                  <span className={CONSOLE_TAB_LINE} />
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="overflow-x-auto">
          <table className={`${CONSOLE_TABLE} min-w-[1000px]`}>
            <thead>
              <tr className={CONSOLE_THEAD}>
                <th className="px-4 py-3 text-start font-semibold">
                  {t('console.incidents.col.incident')}
                </th>
                <th className="px-2 py-3 text-start font-semibold">
                  {t('console.incidents.col.state')}
                </th>
                <th className="px-2 py-3 text-start font-semibold">
                  {t('console.incidents.col.severity')}
                </th>
                <th className="px-2 py-3 text-start font-semibold">
                  {t('console.incidents.col.component')}
                </th>
                <th className="px-2 py-3 text-start font-semibold">
                  {t('console.incidents.col.started')}
                </th>
                <th className="px-2 py-3 text-start font-semibold">
                  {t('console.incidents.col.duration')}
                </th>
                <th className="whitespace-nowrap px-2 py-3 text-end font-semibold">
                  {t('console.incidents.col.affected')}
                </th>
                <th className="px-2 py-3 text-start font-semibold">
                  {t('console.incidents.col.notice')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((incident) => (
                <tr key={incident.id} className="border-b border-[#f3f3f3] last:border-b-0">
                  <td className="px-4 py-4">
                    <Link to={`/console/incidents/${incident.id}`} className="group block min-w-0">
                      <bdi
                        dir="ltr"
                        className="block font-mono text-xs font-semibold text-text-quaternary !whitespace-nowrap"
                      >
                        {incident.number}
                      </bdi>
                      <span className="mt-1 block text-sm font-medium leading-[1.3] text-text-primary transition-colors group-hover:text-primary-700">
                        {incident.title}
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-4">
                    <IncidentStatePill state={incident.state} />
                  </td>
                  <td className="px-2 py-4">
                    <SeverityPill severity={incident.severity} />
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-text-primary">
                    {t(`console.incidents.component.${incident.component}`)}
                  </td>
                  <td className="px-2 py-4 whitespace-nowrap text-sm font-medium text-text-primary">
                    {moment(incident.startedAt)}
                  </td>
                  <td className="px-2 py-4 whitespace-nowrap text-sm font-medium text-text-primary">
                    {duration(incident)}
                    {incident.state !== 'resolved' ? (
                      <span className="mt-1 block text-xs font-medium text-pending-700">
                        {t('console.incidents.stillOpen')}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-4 text-end text-sm font-medium text-text-primary">
                    {count(incident.affectedTenants)}
                  </td>
                  <td className="px-2 py-4">
                    {incident.notice ? (
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success-700">
                        <ConsoleTickIcon className="size-4" />
                        {t('console.incidents.noticePosted')}
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-text-quaternary">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
              {t(`console.incidents.empty.${tab}`)}
            </p>
          ) : null}
        </div>
      </section>

      {opening ? <OpenIncidentModal onClose={() => setOpening(false)} /> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- detail */

/** investigating → identified → monitoring → resolved, the one it is on lit. */
function StateStepper({ state }: { state: IncidentState }) {
  const { t } = useTranslation()
  const at = INCIDENT_STATES.indexOf(state)
  return (
    <ol className="flex flex-wrap items-center gap-y-3">
      {INCIDENT_STATES.map((step, index) => {
        const done = index < at || state === 'resolved'
        const current = index === at
        return (
          <li key={step} className="flex items-center">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={[
                  'mx-2 h-px w-8 max-md:w-4',
                  index <= at ? 'bg-primary-700' : 'bg-border-default',
                ].join(' ')}
              />
            ) : null}
            <span
              aria-current={current ? 'step' : undefined}
              className={[
                'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold',
                current
                  ? 'border-primary-700 bg-primary-700 text-white'
                  : done
                    ? 'border-success-100 bg-success-100 text-success-700'
                    : 'border-border-subtle bg-white text-text-quaternary',
              ].join(' ')}
            >
              <span
                className={[
                  'flex size-5 items-center justify-center rounded-full text-[11px] font-bold',
                  current
                    ? 'bg-white/20 text-white'
                    : done
                      ? 'bg-success-700 text-white'
                      : 'bg-surface-background text-text-quaternary',
                ].join(' ')}
              >
                {done && !current ? '✓' : index + 1}
              </span>
              {t(`console.incidents.state.${step}`)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function UpdateForm({ incident }: { incident: Incident }) {
  const { t } = useTranslation()
  const resolved = incident.state === 'resolved'
  const [nextState, setNextState] = useState<IncidentState>(
    resolved ? 'investigating' : incident.state,
  )
  const [text, setText] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [posted, setPosted] = useState<string | null>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!text.trim()) {
      setError(t('validation.required'))
      return
    }
    consoleOpsStore.addUpdate(incident.id, nextState, text.trim())
    setText('')
    setPosted(
      t('console.incidents.update.posted', { state: t(`console.incidents.state.${nextState}`) }),
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-sm bg-surface-card p-5">
      <div>
        <h2 className={CONSOLE_CARD_TITLE}>
          {t('console.incidents.update.title')}
        </h2>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {resolved
            ? t('console.incidents.update.resolvedHint')
            : t('console.incidents.update.hint')}
        </p>
      </div>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field name="state" label={t('console.incidents.update.nextState')} required>
          <Select
            value={nextState}
            onChange={(value) => setNextState(value as IncidentState)}
            options={INCIDENT_STATES.map((id) => ({
              value: id,
              label: t(`console.incidents.state.${id}`),
            }))}
            ariaLabel={t('console.incidents.update.nextState')}
          />
        </Field>
        <TextArea
          name="text"
          label={t('console.incidents.update.text')}
          required
          placeholder={t('console.incidents.update.textPlaceholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setError(undefined)
            setPosted(null)
          }}
          error={error}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {posted ? (
            <p role="status" className="text-sm font-medium text-success-700">
              {posted}
            </p>
          ) : (
            <span />
          )}
          <ConsoleButton type="submit" size="md">
            {t('console.incidents.update.submit')}
          </ConsoleButton>
        </div>
      </form>
    </section>
  )
}

function NoticeCard({ incident }: { incident: Incident }) {
  const { t, i18n } = useTranslation()
  const [textEn, setTextEn] = useState('')
  const [textAr, setTextAr] = useState('')
  const [errors, setErrors] = useState<Errors<'en' | 'ar'>>({})

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<'en' | 'ar'> = {}
    if (!textEn.trim()) next.en = t('validation.required')
    if (!textAr.trim()) next.ar = t('validation.required')
    setErrors(next)
    if (next.en || next.ar) {
      focusFirstInvalidField(event.currentTarget, ['en', 'ar'], next)
      return
    }
    consoleOpsStore.postNotice(incident.id, textEn.trim(), textAr.trim())
  }

  return (
    <section className="flex flex-col gap-4 rounded-sm bg-surface-card p-5">
      <div>
        <h2 className={CONSOLE_CARD_TITLE}>
          {t('console.incidents.notice.title')}
        </h2>
        <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
          {t('console.incidents.notice.hint')}
        </p>
      </div>
      {incident.notice ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-sm border border-border-subtle bg-surface-tab-bar px-4 py-3">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-text-quaternary">
              {t('console.incidents.notice.english')}
            </span>
            <p
              dir="ltr"
              className="mt-1 text-start text-sm font-medium leading-[1.5] text-text-secondary"
            >
              {incident.notice.textEn}
            </p>
          </div>
          <div className="rounded-sm border border-border-subtle bg-surface-tab-bar px-4 py-3">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-text-quaternary">
              {t('console.incidents.notice.arabic')}
            </span>
            <p
              dir="rtl"
              className="mt-1 text-start text-sm font-medium leading-[1.5] text-text-secondary"
            >
              {incident.notice.textAr}
            </p>
          </div>
          <p className="text-xs font-medium text-text-quaternary">
            {t('console.incidents.notice.postedBy', {
              when: formatMoment(incident.notice.at.toISOString(), i18n.language),
              by: incident.notice.by,
            })}
          </p>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <TextArea
            name="en"
            dir="ltr"
            label={t('console.incidents.notice.english')}
            required
            placeholder={t('console.incidents.notice.englishPlaceholder')}
            value={textEn}
            onChange={(event) => {
              setTextEn(event.target.value)
              setErrors((c) => (c.en ? { ...c, en: undefined } : c))
            }}
            error={errors.en}
          />
          <TextArea
            name="ar"
            dir="rtl"
            label={t('console.incidents.notice.arabic')}
            required
            placeholder={t('console.incidents.notice.arabicPlaceholder')}
            value={textAr}
            onChange={(event) => {
              setTextAr(event.target.value)
              setErrors((c) => (c.ar ? { ...c, ar: undefined } : c))
            }}
            error={errors.ar}
          />
          <div className="flex justify-end">
            <ConsoleButton type="submit" size="md">
              {t('console.incidents.notice.submit')}
            </ConsoleButton>
          </div>
        </form>
      )}
    </section>
  )
}

function IncidentDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const ops = useConsoleOps()
  const duration = useDuration()
  const incident = incidentById(ops, id)
  const moment = (date: Date) => formatMoment(date.toISOString(), i18n.language)

  if (!incident) {
    return (
      <div className={CONSOLE_PAGE}>
        <ConsoleBreadcrumbs
          items={[{ labelKey: 'console.nav.incidents', to: '/console/incidents' }, { label: id }]}
        />
        <ConsoleNotice
          badge={t('console.incidents.notHere.badge')}
          body={t('console.incidents.notHere.body', { id })}
          action={{ label: t('console.incidents.notHere.back'), to: '/console/incidents' }}
        />
      </div>
    )
  }

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs
        items={[
          { labelKey: 'console.nav.incidents', to: '/console/incidents' },
          { label: incident.number },
        ]}
      />

      {/* The page header every console page has, as on a tenant's page; the facts stay in the card. */}
      <ConsolePageHeader
        title={incident.title}
        below={
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <bdi
              dir="ltr"
              className="whitespace-nowrap font-mono text-sm font-semibold text-text-quaternary"
            >
              {incident.number}
            </bdi>
            <IncidentStatePill state={incident.state} size="header" />
            <SeverityPill severity={incident.severity} size="header" />
            <span className="inline-flex h-[26px] items-center rounded-sm bg-surface-card px-[11px] text-[11.5px] font-semibold uppercase tracking-[0.3px] text-text-muted">
              {t(`console.incidents.component.${incident.component}`)}
            </span>
          </div>
        }
      />

      <section className="flex flex-col gap-4 rounded-sm bg-surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-1 text-sm max-md:grid-cols-1">
            <div>
              <dt className="text-xs font-medium text-text-quaternary">
                {t('console.incidents.col.started')}
              </dt>
              <dd className="mt-0.5 whitespace-nowrap font-semibold text-text-primary">
                {moment(incident.startedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-text-quaternary">
                {t(
                  incident.state === 'resolved'
                    ? 'console.incidents.detail.ran'
                    : 'console.incidents.detail.running',
                )}
              </dt>
              <dd className="mt-0.5 whitespace-nowrap font-semibold text-text-primary">
                {duration(incident)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-text-quaternary">
                {t('console.incidents.col.affected')}
              </dt>
              <dd className="mt-0.5 font-semibold text-text-primary">
                {count(incident.affectedTenants)}
              </dd>
            </div>
          </dl>
        </div>
        <StateStepper state={incident.state} />
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[320px] flex-1 flex-col gap-4 max-md:min-w-0 max-md:basis-full">
          <UpdateForm key={`${incident.id}-${incident.state}`} incident={incident} />

          <section className="flex flex-col rounded-sm bg-surface-card">
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 className={CONSOLE_CARD_TITLE}>
                {t('console.incidents.timeline.title')}
              </h2>
              <p className="mt-1 text-xs font-medium text-text-quaternary">
                {t('console.incidents.timeline.hint', { count: incident.updates.length })}
              </p>
            </div>
            <ol>
              {incident.updates.map((update) => (
                <li
                  key={update.id}
                  className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border-subtle px-5 py-4 last:border-b-0"
                >
                  <div className="w-[150px] shrink-0 max-md:w-full">
                    <span className="block whitespace-nowrap text-sm font-semibold text-text-primary">
                      {moment(update.at)}
                    </span>
                    <span className="mt-1 block text-xs font-medium text-text-quaternary">
                      {update.by}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <IncidentStatePill state={update.state} />
                    <p className="mt-2 text-sm font-medium leading-[1.5] text-text-secondary">
                      {update.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="flex w-full flex-col gap-4 xl:w-[380px] xl:shrink-0">
          <NoticeCard incident={incident} />
        </div>
      </div>
    </div>
  )
}

export function ConsoleIncidentsPage() {
  const { id } = useParams<{ id: string }>()
  return <ConsoleShell>{id ? <IncidentDetail id={id} /> : <IncidentsList />}</ConsoleShell>
}
