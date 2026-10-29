import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Popover } from '../../components/ui'
import { useEntitlements } from '../../hooks/useEntitlements'
import { LOGIN_ROUTE } from '../../lib/identity/login'
import { signOut } from '../../lib/identity/logout'
import { withReturnPath } from '../../lib/identity/returnTo'
import { startNewSale } from '../../lib/posSale'
import { tillTime } from '../../lib/pos'
import { initialsOf } from '../../lib/posTill'
import type { PosTillDto } from '../../api/pos/pos'
import chevron from '../../assets/dashboard/chevron.svg'

/**
 * Who is on the till (Figma 143:18015, the control beside the tabs).
 *
 * Each cashier signs in with their own login, never a shared picker (LG-1; round 2, answer 11),
 * so this names the signed-in person and the till's shift, and offers Switch user: sign out, and
 * the next cashier signs in and comes back to the till to keep selling (Abdul, 28 Oct 2026). Their
 * first sale opens their shift; another cashier's open shift is handed over uncounted, which the
 * server records.
 */
export function CashierPicker({ till, mine }: { till: PosTillDto; mine: boolean }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { entitlements } = useEntitlements()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'

  const name = (mine ? till.openShift?.cashier.name : null) ?? entitlements?.username ?? ''
  const other = !mine && till.openShift ? till.openShift : null

  const switchUser = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      await signOut()
      startNewSale()
      navigate(withReturnPath(LOGIN_ROUTE, '/pos'), { replace: true })
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('pos.whoIsOnTill')}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-sm border border-border-subtle bg-surface-card ps-2 pe-3 transition-colors hover:border-primary-300"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-800">
          {initialsOf(name)}
        </span>
        <span className="max-w-[160px] truncate text-sm font-semibold text-text-primary">
          {name}
        </span>
        <img
          src={chevron}
          alt=""
          className={[
            'size-4 opacity-60 transition-transform',
            open ? '-rotate-90' : 'rotate-90',
          ].join(' ')}
        />
      </button>

      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={260}>
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <p className="text-sm font-semibold text-text-primary">
            {t('pos.till.name', { name: till.name, code: till.code })}
          </p>
          <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
            {mine && till.openShift
              ? t('pos.till.yourShift', { time: tillTime(till.openShift.openedAt, locale) })
              : other
                ? t('pos.till.othersShift', {
                    who: other.cashier.name ?? '',
                    time: tillTime(other.openedAt, locale),
                  })
                : t('pos.till.noShift')}
          </p>
        </div>
        <div className="border-t border-border-subtle py-1">
          <button
            type="button"
            onClick={switchUser}
            disabled={busy}
            className="flex w-full items-center px-3 py-2.5 text-start text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60"
          >
            {t('pos.till.switchUser')}
          </button>
          {failed ? (
            <p className="px-3 pb-2 text-xs font-medium text-danger-700">
              {t('pos.till.switchFailed')}
            </p>
          ) : null}
        </div>
      </Popover>
    </>
  )
}
