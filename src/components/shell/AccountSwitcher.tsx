import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from '../ui'
import {
  BRANCHES_OVERVIEW_PATH,
  branchDisplayName,
  type BranchOverviewDto,
  type BranchOverviewRow,
} from '../../api/settings/branches'
import { useApiRead } from '../../hooks/useApiRead'
import { REQUIRE_SESSION, mayRequest, useSession } from '../../lib/session/session'
import { PLAN_OVERVIEW_PATH, loadPlanOverview, type PlanOverviewDto } from '../../api/settings/plan'
import { CompanyAvatar } from './CompanyAvatar'
import { chooseWorkingBranch, useWorkingBranchId } from '../../lib/workingBranch'
import chevron from '../../assets/dashboard/chevron.svg'

/**
 * The card at the top of the sidebar (Figma 143:18015).
 *
 * One account can trade from several branches, and the till, the catalogue and the reports all
 * follow whichever is chosen. The choice is the platform's one branch toggle
 * (`src/lib/workingBranch.ts`): Catalogue, Stock and POS have no picker of their own (owner,
 * 21 Oct 2026). TODO(backend): products, stock and tills are not per branch yet, so those screens
 * show the same rows whichever branch is chosen (docs/backend-guides/INCOME.md, P.9 to P.11). The plan belongs to the account, so it does not change with the
 * branch — which is why it is stated once at the foot of the list rather than on every row.
 *
 * <p>The name and logo are the signed-in company's own (name from `/me/entitlements`, logo from
 * company branding, an initial when there is none). The list below it is `/v1/branches/overview`
 * — a brand-new company with one branch sees only that one row, honestly, rather than a second,
 * fabricated one (browser gate, 27 September 2026: this card previously showed every tenant the
 * same fixed three-row sample, "Al Bahja Coffee").
 */
export function AccountSwitcher() {
  const { t, i18n } = useTranslation()
  // GET /v1/settings/plan now exists, so the card names the tenant's real plan. It used to state
  // "Business plan" for every tenant; without an answer (loading, no tenant.plan.read, a failure)
  // it names no plan rather than a placeholder one.
  // Both reads are asked only of a reader the server admits (`tenant.plan.read`, `branch.manage`):
  // every screen draws this card, so a reader without them answered 403 on every page (B-14).
  const session = useSession()
  const planRead = useApiRead<PlanOverviewDto>(
    mayRequest(session, 'tenant.plan.read') ? PLAN_OVERVIEW_PATH : null,
    loadPlanOverview,
  ).read
  // Chrome every screen draws: an answer without a plan name names nothing, never crashes the shell.
  const planName = planRead.status === 'ready' ? planRead.data?.plan?.name : undefined
  const planLabel = planName ? t('shell.plan.named', { plan: planName }) : null
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const chosenId = useWorkingBranchId()
  // Loads once the popover is worth opening; failing silently (wrong role, or none yet) shows the
  // signed-in company alone rather than an error on chrome every screen renders.
  const { read } = useApiRead<BranchOverviewDto>(
    mayRequest(session, 'branch.manage') ? BRANCHES_OVERVIEW_PATH : null,
  )
  const branches =
    read.status === 'ready' && Array.isArray(read.data.branches) ? read.data.branches : []
  // Only a branch someone chose names the card; until then it names the company, as before.
  const branch = chosenId ? (branches.find((row) => row.id === chosenId) ?? null) : null
  // `tenantName` is null when RLS hides the tenant row; a blank card is worse than a generic
  // label, and a fabricated company name (this card's old fallback) is worse than either. Before
  // the session has answered there is no company to name yet, and "Your company" would read as
  // an answer, so the card says it is loading instead.
  const accountName =
    (branch ? branchDisplayName(branch, i18n.language) : null) ??
    (session
      ? (session.tenantName ?? t('shell.account.unnamed'))
      : t(REQUIRE_SESSION ? 'shell.account.loading' : 'shell.account.unnamed'))

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-sm border border-black/[0.06] bg-surface-tab-bar p-[9px] text-start transition-colors hover:border-primary-300"
      >
        <span className="flex min-w-0 items-center gap-[7px]">
          <CompanyAvatar name={accountName} size={31} />
          <span className="min-w-0">
            {/* dir=auto: a Latin company name in the Arabic layout is cut at its own end, not its start. */}
            <span dir="auto" className="block truncate text-sm font-medium leading-[1.2] text-[#3e443e] rtl:text-right">
              {accountName}
            </span>
            {planLabel ? (
              <span className="block truncate text-xs font-medium leading-[1.2] text-text-quaternary">
                {planLabel}
              </span>
            ) : null}
          </span>
        </span>
        <img src={chevron} alt="" className="size-5 rotate-90 opacity-70" />
      </button>

      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)}>
        <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
          {t('shell.account.branches')}
        </p>
        <ul role="listbox" className="pb-1">
          {(branches.length > 0
            ? branches
            : [{ id: '', code: '', name: accountName } as BranchOverviewRow]
          ).map((row) => {
            const chosen = row.id === branch?.id
            return (
              <li key={row.id || 'current'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={chosen}
                  onClick={() => {
                    if (row.id) chooseWorkingBranch(row.id)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-primary-25"
                >
                  <CompanyAvatar name={row.name} size={28} />
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-sm font-medium text-text-primary rtl:text-right">
                      {row.id ? branchDisplayName(row, i18n.language) : row.name}
                    </span>
                  </span>
                  {chosen ? <span className="shrink-0 text-primary-700">✓</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
        {planLabel ? (
          <p className="border-t border-border-subtle px-3 py-2.5 text-xs font-medium text-text-quaternary">
            {t('shell.account.planNote', { plan: planLabel })}
          </p>
        ) : null}
      </Popover>
    </>
  )
}
