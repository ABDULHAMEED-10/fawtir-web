import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Popover } from '../ui'
import { USER_MENU } from '../../lib/shell'
import chevron from '../../assets/dashboard/chevron.svg'

/**
 * The card at the foot of a sidebar — whoever is signed in, and what they can do about it.
 *
 * Shared by both shells: the tenant app signs in a person at a business, the Fawtir console signs
 * in a Super Admin, and the menu is the same shape either way.
 */
export function UserMenu({
  name,
  roleKey,
  avatar,
}: {
  name: string
  roleKey: string
  avatar: string
}) {
  const { t } = useTranslation()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="mt-1 flex w-full items-center justify-between rounded-sm border border-black/[0.06] bg-[#292d32] p-[9px] text-start transition-colors hover:brightness-125"
      >
        <span className="flex min-w-0 items-center gap-[7px]">
          <img src={avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium leading-[1.2] text-white">
              {name}
            </span>
            <span className="block truncate text-xs font-medium leading-[1.2] text-white/70">
              {t(roleKey)}
            </span>
          </span>
        </span>
        <img src={chevron} alt="" className="size-5 rotate-90 brightness-0 invert opacity-80" />
      </button>

      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)}>
        <ul role="menu" className="py-1">
          {USER_MENU.map((entry) => (
            <li key={entry.id} role="none">
              <Link
                to={entry.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t(entry.labelKey)}
              </Link>
            </li>
          ))}
          <li role="none" className="mt-1 border-t border-border-subtle pt-1">
            <Link
              to="/login"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100"
            >
              {t('shell.user.signOut')}
            </Link>
          </li>
        </ul>
      </Popover>
    </>
  )
}
