import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Select, withRial } from '../../../components/ui'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleSectionFrame } from '../../../layouts/ConsoleShell/ConsoleSectionFrame'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_PAGE,
  CONSOLE_SMALL,
  CONSOLE_TAB_LINE,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { consoleTab } from '../../../layouts/ConsoleShell/consoleTones'
import {
  BILLING_MANAGE_PERMISSION,
  BILLING_READ_PERMISSION,
} from '../../../lib/console/billingPayments'
import {
  REFUND_KINDS,
  loadRefundQueuePage,
  refundQueuePath,
  type RefundKind,
  type RefundQueueItemDto,
  type RefundQueuePageDto,
} from '../../../lib/console/refundCases'
import { hasPermission } from '../../../lib/identity/entitlements'
import { RefundCaseDialogs, RefundCaseItem, type RefundDialog } from '../tenant/CompanyRefundCases'

const K = 'console.refundQueue.'
const KINDS = Object.keys(REFUND_KINDS) as RefundKind[]
const VIEWS = ['OPEN', 'REFUNDED', 'ALL'] as const
type View = (typeof VIEWS)[number]

/**
 * Every company's refund cases in one queue (backend V423): money held for an application closed with
 * a final rejection (RF-2), a period paid ahead that never started (CA-1, CA-9), and the refunds the
 * super admin decides for a company that left Fawtir or cancelled a yearly subscription (LV-6, CA-1).
 * Filtered by kind and by state, oldest first. Each case is acted on as on the company's page.
 */
export function ConsoleRefundCasesPage() {
  return (
    <ConsoleShell requires={BILLING_READ_PERMISSION}>
      <RefundQueue />
    </ConsoleShell>
  )
}

function RefundQueue() {
  const { t } = useTranslation()
  const { entitlements } = useEntitlements()
  const canManage = entitlements !== null && hasPermission(entitlements, BILLING_MANAGE_PERMISSION)
  const [view, setView] = useState<View>('OPEN')
  const [kind, setKind] = useState<RefundKind | null>(null)
  const path = refundQueuePath(kind, view === 'ALL' ? null : view)
  const { read, retry } = useConsoleRead<RefundQueuePageDto>(path)
  const [dialog, setDialog] = useState<{ tenantId: string; open: RefundDialog } | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // Pages after the first, for the filter they were read under.
  const [later, setLater] = useState<{
    path: string
    items: RefundQueueItemDto[]
    next: string | null
  } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const more = later?.path === path ? later : null
  const reload = () => {
    setLater(null)
    setMoreFailed(false)
    retry()
  }
  const cursor = more ? more.next : read.status === 'ready' ? read.data.nextCursor : null
  const loadMore = async () => {
    if (!cursor) return
    setLoadingMore(true)
    setMoreFailed(false)
    try {
      const page = await loadRefundQueuePage(
        refundQueuePath(kind, view === 'ALL' ? null : view, cursor),
      )
      setLater({ path, items: [...(more?.items ?? []), ...page.items], next: page.nextCursor })
    } catch {
      setMoreFailed(true)
    } finally {
      setLoadingMore(false)
    }
  }

  let body: ReactNode
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t(`${K}loading`)} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={reload} />
  } else if (read.data.items.length === 0) {
    body = (
      <p className="rounded-sm bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t(view === 'OPEN' ? `${K}emptyOpen` : `${K}empty`)}
      </p>
    )
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-3">
          {[...read.data.items, ...(more?.items ?? [])].map(({ refundCase, tenantName }) => {
            const tenantId = refundCase.tenantId ?? ''
            return (
              <RefundCaseItem
                key={refundCase.id}
                entry={refundCase}
                canManage={canManage && tenantId !== ''}
                onAction={(open) => {
                  setDone(null)
                  setDialog({ tenantId, open })
                }}
                heading={
                  <Link
                    to={`/console/tenants/${encodeURIComponent(tenantId)}`}
                    className="w-fit text-base font-semibold text-text-primary transition-colors hover:text-primary-700 hover:underline"
                  >
                    {tenantName ?? tenantId}
                  </Link>
                }
              />
            )
          })}
        </ul>
        {cursor ? (
          <div>
            <button
              type="button"
              className={CONSOLE_SMALL}
              disabled={loadingMore}
              onClick={loadMore}
            >
              {t(`${K}loadMore`)}
            </button>
          </div>
        ) : null}
        {moreFailed ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(`${K}moreFailed`)}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleSectionFrame section="billing" tab="refunds" />
      <ConsolePageHeader level="section" title={t(`${K}title`)} subtitle={t(`${K}subtitle`)} />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-sm bg-surface-card px-5">
        <div className="flex flex-wrap gap-x-6">
          {VIEWS.map((value) => {
            const active = value === view
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                className={consoleTab(active)}
                onClick={() => setView(value)}
              >
                {t(`${K}view.${value}`)}
                {active ? <span className={CONSOLE_TAB_LINE} /> : null}
              </button>
            )
          })}
        </div>
        <div className="w-full py-2 sm:w-56">
          <Select
            value={kind ?? 'ALL'}
            ariaLabel={t(`${K}kind.label`)}
            onChange={(value) => setKind(value === 'ALL' ? null : (value as RefundKind))}
            options={[
              { value: 'ALL', label: t(`${K}kind.ALL`) },
              ...KINDS.map((value) => ({ value, label: t(`${K}kind.${value}`) })),
            ]}
          />
        </div>
      </div>
      {done ? (
        <p
          role="status"
          className="rounded-sm bg-success-100 px-4 py-3 text-sm font-medium leading-[1.6] text-success-700"
        >
          {withRial(done)}
        </p>
      ) : null}
      {body}
      {dialog ? (
        <RefundCaseDialogs
          tenantId={dialog.tenantId}
          dialog={dialog.open}
          onClose={() => setDialog(null)}
          onSettled={(message) => {
            setDialog(null)
            setDone(message)
            reload()
          }}
          onRefused={reload}
        />
      ) : null}
    </div>
  )
}
