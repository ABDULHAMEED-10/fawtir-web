import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { RowsView } from '../../../components/ui'
import { connectionsFor, isStale, useConsoleErp } from '../../../lib/consoleErp'
import { count } from '../../../lib/superAdmin'
import {
  AddonActionModals,
  Card,
  ConnectionStatePill,
  ErpAddonCard,
  MappingStatusPill,
  TD,
  TH,
  attentionReason,
  whenLabel,
  type AddonAction,
} from './erpShared'
import {
  CONSOLE_ROWS,
  CONSOLE_TABLE,
  CONSOLE_THEAD,
} from '../../../layouts/ConsoleShell/consoleStyle'

/**
 * The tenant page's ERP tab (docs/erp-and-console-plan.md §9.3): the tenant's add-on and its
 * connections, with the operator's add-on actions. The cross-tenant view is `/console/erp`; every
 * row here links into it.
 */
export function TenantErpTab({ tenantId }: { tenantId: string }) {
  const { t, i18n } = useTranslation()
  const erp = useConsoleErp()
  const [action, setAction] = useState<AddonAction | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const connections = connectionsFor(erp, tenantId)
  const key = (name: string) => `console.erp.tenantTab.${name}`

  return (
    <>
      {done ? (
        <p
          role="status"
          className="rounded-md bg-success-100 px-5 py-4 text-sm font-medium leading-[1.6] text-success-700"
        >
          {done}
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-4 max-lg:grid-cols-1">
        <Card
          title={t(key('connections.title'))}
          padded={false}
          aside={
            <Link
              to="/console/erp"
              className="text-sm font-semibold text-primary-700 hover:text-primary-800"
            >
              {t(key('connections.all'))}
            </Link>
          }
        >
          {connections.length === 0 ? (
            <p className="px-5 py-6 text-sm font-medium leading-[1.6] text-text-tertiary">
              {t(key('connections.empty'))}
            </p>
          ) : (
            <RowsView className={`${CONSOLE_ROWS} max-md:pt-4`}>
              <table className={`${CONSOLE_TABLE} min-w-[720px]`}>
                <thead>
                  <tr className={CONSOLE_THEAD}>
                    <th className={TH}>{t(key('col.connection'))}</th>
                    <th className={TH}>{t(key('col.state'))}</th>
                    <th className={TH}>{t(key('col.mapping'))}</th>
                    <th className={TH}>{t(key('col.lastRun'))}</th>
                    <th className={`${TH} text-end`}>{t(key('col.collected'))}</th>
                    <th className={`${TH} text-end`}>{t(key('col.rejections'))}</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((c) => {
                    const lastRun = c.recentRuns[0]
                    const attention = c.state === 'ERROR' || isStale(c)
                    return (
                      <tr key={c.id} className="border-b border-[#f3f3f3] last:border-b-0">
                        <td className={TD}>
                          <Link
                            to={`/console/erp/connections/${c.id}`}
                            className="block text-sm font-medium text-text-primary transition-colors hover:text-primary-700"
                          >
                            {c.label}
                          </Link>
                          <span className="mt-1 block text-xs font-medium text-text-quaternary">
                            {t(`erp.connector.product.${c.product}`)} {c.erpVersion} ·{' '}
                            {t(`erp.connector.schedule.${c.scheduleMinutes}`)}
                          </span>
                        </td>
                        <td className={TD}>
                          <ConnectionStatePill state={c.state} />
                          {attention ? (
                            <span
                              className={`mt-1.5 block text-xs font-medium ${c.state === 'ERROR' ? 'text-danger-700' : 'text-pending-700'}`}
                            >
                              {attentionReason(t, c)}
                            </span>
                          ) : null}
                        </td>
                        <td className={TD}>
                          <MappingStatusPill status={c.mappingStatus} />
                        </td>
                        <td className={TD}>
                          <span className="block whitespace-nowrap text-sm font-medium text-text-primary">
                            {whenLabel(c.lastRunAt, i18n.language)}
                          </span>
                          {lastRun ? (
                            <span
                              className={`mt-1 block text-xs font-medium ${lastRun.state === 'FAILED' ? 'text-danger-700' : 'text-text-quaternary'}`}
                            >
                              {t(`erp.connector.runState.${lastRun.state}`)}
                            </span>
                          ) : null}
                        </td>
                        <td className={`${TD} text-end text-sm font-semibold text-text-primary`}>
                          {count(c.collectedThisMonth)}
                        </td>
                        <td
                          className={`${TD} text-end text-sm font-semibold ${c.rejections > 0 ? 'text-danger-700' : 'text-text-quaternary'}`}
                        >
                          {c.rejections > 0 ? count(c.rejections) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </RowsView>
          )}
        </Card>

        <ErpAddonCard erp={erp} tenantId={tenantId} onAction={setAction} />
      </div>

      <AddonActionModals
        action={action}
        erp={erp}
        tenantId={tenantId}
        onClose={() => setAction(null)}
        onDone={(message) => {
          setAction(null)
          setDone(message)
        }}
      />
    </>
  )
}
