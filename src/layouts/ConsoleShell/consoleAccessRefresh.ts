import { createContext, useContext } from 'react'

/**
 * Asks the console shell to forget what it knows about the signed-in operator and ask again.
 *
 * For the one screen that can change the operator's own authority: after removing one of their
 * own roles, the cached entitlements would still claim it, and every screen would go on offering
 * what the backend now refuses. The shell re-checks, so the screen re-renders — or says "no
 * access" — from the new answer.
 */
export const ConsoleAccessRefreshContext = createContext<() => void>(() => {})

export function useRefreshConsoleAccess(): () => void {
  return useContext(ConsoleAccessRefreshContext)
}
