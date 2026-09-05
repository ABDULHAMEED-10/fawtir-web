import { useCallback, useEffect, useState } from 'react'

export type RowsMode = 'cards' | 'table'

const STORE_KEY = 'rowsView'

/**
 * Whether a list is read as cards or as a table.
 *
 * A twelve-column ledger is the right shape on a desk and the wrong one in a hand, so on a phone
 * each row becomes a card by default. Some people would still rather scroll the real table — for
 * following one column down the page it is genuinely better — so the choice is theirs and it is
 * remembered. Above `md` there is no choice to make: the table is the design.
 */
export type RowsView = {
  mode: RowsMode
  setMode: (mode: RowsMode) => void
}

export function useRowsView(): RowsView {
  const [mode, setMode] = useState<RowsMode>('cards')

  // Read the stored preference after mounting rather than during render, so a browser with site
  // data switched off still gets a working list instead of an exception.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY)
      if (saved === 'cards' || saved === 'table') setMode(saved)
    } catch {
      // No stored preference to be had; cards it is.
    }
  }, [])

  const choose = useCallback((next: RowsMode) => {
    setMode(next)
    try {
      localStorage.setItem(STORE_KEY, next)
    } catch {
      // The choice still holds for this visit.
    }
  }, [])

  return { mode, setMode: choose }
}
