import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RowsView } from '../../../components/ui'
import { RouteStatePill } from '../ErpShell'
import {
  ConfirmModal,
  Mono,
  PrimaryLink,
  SMALL_BUTTON,
  SecondaryLink,
  SectionCard,
  TBODY_ROW,
  THEAD_ROW,
  Td,
  Th,
} from '../overview/idiom'
import { ConnectionShell, MappingStatusPill, useConnection } from './ConnectionShell'
import { Strip } from './detailShared'
import { CERT_ROUTES, routeStates, useErpMapping } from '../../../lib/erpMapping'
import {
  mappingStatusOf,
  templateLabel,
  type Connection,
  type MappingStatus,
  connectorStore,
} from '../../../lib/erpConnector'
import { shortDate } from '../../../lib/settings'
import tickIcon from '../../../assets/settings/check-green.svg'

/**
 * Settings › Integration › Connected systems › connection › Mapping (docs/erp-and-console-plan.md
 * §3, Appendix B "Detail · Mapping").
 *
 * The connection's mapping card — where it came from, how far it is, whether it is certified —
 * and the way into the same wizard §2.2 draws, scoped to this connection. The head office runs the
 * company's own mapping, so its card reads the tenant state and shows the four routes; the other
 * connections carry a template that was applied and perhaps edited, and can be reset to it.
 */
export function ConnectionMappingPage() {
  const connection = useConnection()
  return (
    <ConnectionShell connection={connection}>
      {connection ? <MappingBody connection={connection} /> : null}
    </ConnectionShell>
  )
}

function MappingBody({ connection: c }: { connection: Connection }) {
  const { t } = useTranslation()
  const mapping = useErpMapping()
  const status = mappingStatusOf(c, mapping)
  const tenant = Boolean(c.mapping.usesTenantMapping)
  const [resetting, setResetting] = useState(false)
  const [reset, setReset] = useState(false)
  const template = c.mapping.template

  const query = tenant ? '' : `?connection=${c.id}`
  const wizardTo = `/settings/erp-mapping/fields${query}`
  const certifyTo = `/settings/erp-mapping/certification${query}`

  const provenance = () => {
    if (tenant) return t('erp.connector.mappingTab.provenance.tenant')
    if (!template) return t('erp.connector.mappingTab.provenance.none')
    if (reset || !c.mapping.lastEditedAt)
      return t('erp.connector.mappingTab.provenance.unedited', {
        template: templateLabel(template),
        date: shortDate(reset ? new Date() : template.appliedAt),
      })
    return t('erp.connector.mappingTab.provenance.edited', {
      template: templateLabel(template),
      date: shortDate(c.mapping.lastEditedAt),
    })
  }

  return (
    <>
      {reset ? <Strip tone="success">{t('erp.connector.mappingTab.reset.done')}</Strip> : null}

      <SectionCard
        title={t('erp.connector.mappingTab.title')}
        note={provenance()}
        actions={
          <>
            <MappingStatusPill status={reset ? 'READY' : status} />
            {!tenant && template ? (
              <button
                type="button"
                onClick={() => setResetting(true)}
                disabled={reset || c.mapping.origin === 'TEMPLATE'}
                className={SMALL_BUTTON}
              >
                {t('erp.connector.mappingTab.reset.button')}
              </button>
            ) : null}
          </>
        }
      >
        {/* Three figures across the top of the card */}
        <dl className="grid border-t border-surface-background sm:grid-cols-3">
          <Figure
            label={t('erp.connector.mappingTab.figure.fields')}
            value={String(reset && template ? template.entryCount : c.mapping.entryCount)}
            note={
              tenant
                ? t('erp.connector.mappingTab.figure.fieldsTenant')
                : template
                  ? t('erp.connector.mappingTab.figure.fieldsTemplate', {
                      count: template.entryCount,
                    })
                  : t('erp.connector.mappingTab.figure.fieldsByHand')
            }
          />
          <Figure
            label={t('erp.connector.mappingTab.figure.certified')}
            value={t('erp.connector.mappingTab.figure.ofRoutes', {
              count: tenant
                ? CERT_ROUTES.filter((r) => routeStates(mapping)[r].state === 'CERTIFIED').length
                : reset
                  ? 0
                  : c.mapping.certifiedRoutes,
              total: CERT_ROUTES.length,
            })}
            note={t('erp.connector.mappingTab.figure.certifiedNote')}
          />
          <Figure
            label={t('erp.connector.mappingTab.figure.template')}
            value={template ? templateLabel(template) : '—'}
            note={
              template
                ? t('erp.connector.mappingTab.figure.templateNote', {
                    date: shortDate(template.publishedOn),
                    count: template.entryCount,
                  })
                : t('erp.connector.mappingTab.figure.templateNone')
            }
            last
          />
        </dl>

        {/* What to do next */}
        <div className="border-t border-surface-background p-5">
          <p className="max-w-[720px] text-sm font-medium leading-[1.6] text-text-tertiary">
            {tenant
              ? t('erp.connector.mappingTab.tenant.body')
              : t(`erp.connector.mappingTab.readiness.${readinessKey(reset ? 'READY' : status)}`, {
                  count: c.mapping.entryCount,
                  date: c.mapping.lastEditedAt ? shortDate(c.mapping.lastEditedAt) : '',
                })}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PrimaryLink to={wizardTo}>{t('erp.connector.mappingTab.openWizard')}</PrimaryLink>
            <SecondaryLink to={certifyTo}>{t('erp.connector.mappingTab.certify')}</SecondaryLink>
          </div>
        </div>
      </SectionCard>

      {tenant ? <TenantRoutes /> : null}

      {c.discovery ? (
        <SectionCard
          title={t('erp.connector.mappingTab.discovery.title')}
          note={t('erp.connector.mappingTab.discovery.note', {
            date: shortDate(c.discovery.at),
            count: c.discovery.samples,
          })}
        >
          <ul className="flex flex-wrap gap-2 border-t border-surface-background p-5">
            {c.discovery.fields.map((field) => (
              <li
                key={field}
                className="inline-flex h-[26px] items-center rounded-[3px] bg-surface-background px-2"
              >
                <Mono className="text-text-secondary">{field}</Mono>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {template ? (
        <ConfirmModal
          open={resetting}
          danger
          title={t('erp.connector.mappingTab.reset.title')}
          body={t('erp.connector.mappingTab.reset.body', {
            template: templateLabel(template),
            count: template.entryCount,
          })}
          confirmLabel={t('erp.connector.mappingTab.reset.confirm')}
          onClose={() => setResetting(false)}
          onConfirm={() => {
            connectorStore.resetToTemplate(c.id)
            setReset(true)
            setResetting(false)
          }}
        />
      ) : null}
    </>
  )
}

const readinessKey = (status: MappingStatus) => {
  switch (status) {
    case 'DRAFT':
      return 'draft'
    case 'READY':
      return 'ready'
    case 'CERTIFIED':
      return 'certified'
    case 'STALE':
      return 'stale'
    default:
      return 'unmapped'
  }
}

function Figure({
  label,
  value,
  note,
  last = false,
}: {
  label: string
  value: string
  note: string
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex flex-col gap-1 border-b border-surface-background px-5 py-4 sm:border-b-0',
        last ? '' : 'sm:border-e',
      ].join(' ')}
    >
      <dt className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
        {label}
      </dt>
      <dd className="text-xl font-semibold leading-[1.2] text-text-primary tabular-nums">
        {value}
      </dd>
      <dd className="text-xs font-medium leading-[1.4] text-text-quaternary">{note}</dd>
    </div>
  )
}

/** The head office's four routes, read from the company's mapping state. */
function TenantRoutes() {
  const { t } = useTranslation()
  const mapping = useErpMapping()
  const routes = routeStates(mapping)
  return (
    <SectionCard
      title={t('erp.connector.mappingTab.tenant.routesTitle')}
      note={t('erp.connector.mappingTab.tenant.routesNote')}
    >
      <RowsView>
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('erp.connector.mappingTab.tenant.col.route')}</Th>
              <Th>{t('erp.connector.mappingTab.tenant.col.state')}</Th>
              <Th align="end">{t('erp.connector.mappingTab.tenant.col.last')}</Th>
            </tr>
          </thead>
          <tbody>
            {CERT_ROUTES.map((route) => {
              const { state, last, pass } = routes[route]
              const at = state === 'CERTIFIED' && pass ? pass.at : last?.at
              return (
                <tr key={route} className={TBODY_ROW}>
                  <Td first>
                    <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                      {state === 'CERTIFIED' ? (
                        <img src={tickIcon} alt="" className="size-4 shrink-0" />
                      ) : null}
                      {t(`erp.certRoute.${route}`)}
                    </span>
                  </Td>
                  <Td>
                    <RouteStatePill state={state} />
                  </Td>
                  <Td align="end" className="text-sm font-medium text-text-tertiary">
                    {at ? shortDate(at) : t('erp.connector.mappingTab.tenant.notTried')}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </RowsView>
    </SectionCard>
  )
}
