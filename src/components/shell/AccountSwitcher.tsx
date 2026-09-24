import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from '../ui'
import { ACCOUNTS, type Branch } from '../../lib/shell'
import { useSession } from '../../lib/session/session'
import { useTenantPlan } from '../../lib/planAccess'
import bahjaLogo from '../../assets/dashboard/bahja-logo.svg'
import chevron from '../../assets/dashboard/chevron.svg'

/**
 * The card at the top of the sidebar (Figma 143:18015).
 *
 * One account can trade from several branches, and the till, the catalogue and the reports all
 * follow whichever is chosen. The plan belongs to the account, so it does not change with the
 * branch — which is why it is stated once at the foot of the list rather than on every row.
 *
 * <p>The name on the card is the signed-in workspace's, from {@code /me/entitlements}. The branch
 * list below it is still design-time data, so picking one changes this label and nothing else.
 */
export function AccountSwitcher() {
  const { t } = useTranslation()
  // The plan is the account's, read from the plan store so a switched plan shows here too.
  const planLabel = t('shell.plan.named', { plan: t(`plan.planName.${useTenantPlan()}`) })
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  // Null until a branch is picked, so the card opens on the signed-in workspace rather than on
  // a fixture. Before the name was served by /me/entitlements this read ACCOUNTS[0], which
  // showed every tenant the same company (browser gate, 24 September 2026).
  const [branch, setBranch] = useState<Branch | null>(null)
  const session = useSession()
  const accountName = branch?.name ?? session?.tenantName ?? ACCOUNTS[0].name

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
          <img src={bahjaLogo} alt="" className="size-[31px] shrink-0 rounded-full object-cover" />
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
          {ACCOUNTS.map((account) => {
            const chosen = account.id === branch?.id
            return (
              <li key={account.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={chosen}
                  onClick={() => {
                    setBranch(account)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-primary-25"
                >
                  <img
                    src={bahjaLogo}
                    alt=""
                    className="size-7 shrink-0 rounded-full object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">
                      {account.name}
                    </span>
                    <span className="block truncate text-xs font-medium text-text-quaternary">
                      {account.town}
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
