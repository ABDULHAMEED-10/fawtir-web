import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from '../ui'
import {
  BRANCHES_OVERVIEW_PATH,
  type BranchOverviewDto,
  type BranchOverviewRow,
} from '../../api/settings/branches'
import { useApiRead } from '../../hooks/useApiRead'
import { useSession } from '../../lib/session/session'
import { useTenantPlan } from '../../lib/planAccess'
import { CompanyAvatar } from './CompanyAvatar'
import chevron from '../../assets/dashboard/chevron.svg'

/**
 * The card at the top of the sidebar (Figma 143:18015).
 *
 * One account can trade from several branches, and the till, the catalogue and the reports all
 * follow whichever is chosen. The plan belongs to the account, so it does not change with the
 * branch — which is why it is stated once at the foot of the list rather than on every row.
 *
 * <p>The name and logo are the signed-in company's own (name from `/me/entitlements`, logo from
 * company branding, an initial when there is none). The list below it is `/v1/branches/overview`
 * — a brand-new company with one branch sees only that one row, honestly, rather than a second,
 * fabricated one (browser gate, 27 September 2026: this card previously showed every tenant the
 * same fixed three-row sample, "Al Bahja Coffee").
 */
export function AccountSwitcher() {
  const { t } = useTranslation()
  // The plan is the account's; no subscription backend exists yet to read it from, so this stays
  // the design's placeholder deliberately (owner, 2026-09-27) rather than a real read.
  const planLabel = t('shell.plan.named', { plan: t(`plan.planName.${useTenantPlan()}`) })
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [branch, setBranch] = useState<BranchOverviewRow | null>(null)
  const session = useSession()
  // `tenantName` is null when RLS hides the tenant row; a blank card is worse than a generic
  // label, and a fabricated company name (this card's old fallback) is worse than either.
  const accountName = branch?.name ?? session?.tenantName ?? t('shell.account.unnamed')
  // Loads once the popover is worth opening; failing silently (wrong role, or none yet) shows the
  // signed-in company alone rather than an error on chrome every screen renders.
  const { read } = useApiRead<BranchOverviewDto>(BRANCHES_OVERVIEW_PATH)
  const branches =
    read.status === 'ready' && Array.isArray(read.data.branches) ? read.data.branches : []

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
            <span className="block truncate text-sm font-medium leading-[1.2] text-[#3e443e]">
              {accountName}
            </span>
            <span className="block truncate text-xs font-medium leading-[1.2] text-text-quaternary">
              {planLabel}
            </span>
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
                    if (row.id) setBranch(row)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-primary-25"
                >
                  <CompanyAvatar name={row.name} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">
                      {row.name}
                    </span>
                  </span>
                  {chosen ? <span className="shrink-0 text-primary-700">✓</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="border-t border-border-subtle px-3 py-2.5 text-xs font-medium text-text-quaternary">
          {t('shell.account.planNote', { plan: planLabel })}
        </p>
      </Popover>
    </>
  )
}
