import type { ReactNode } from 'react'
import { LockIcon, ShieldIcon } from './posIcons'

/**
 * The small print under a card's main button, set in a grey band across the foot of the card
 * with a divider above it, as the POS frames draw it. A shield for "what happens next", a lock
 * where the action cannot be undone (closing the till).
 */
export function PosFootNote({
  children,
  icon = 'shield',
}: {
  children: ReactNode
  icon?: 'shield' | 'lock'
}) {
  const Icon = icon === 'lock' ? LockIcon : ShieldIcon
  return (
    <div className="flex items-start gap-2 rounded-b-md border-t border-border-subtle bg-surface-tab-bar px-5 py-4 text-xs font-medium leading-[1.5] text-text-quaternary">
      <Icon className="mt-px size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
