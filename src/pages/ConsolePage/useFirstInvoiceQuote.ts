import { planQuotePath, type PlanQuoteDto } from '../../api/platform/planQuote'
import { useConsoleRead, type ConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import type { SubscriptionPlanId, Term } from '../../lib/consoleSubscriptions'
import { PLAN } from '../../lib/plans'

const CYCLE = { monthly: 'MONTHLY', annual: 'ANNUAL' } as const satisfies Record<Term, string>

export type FirstInvoiceQuote = {
  /** `null` for Enterprise, priced per contract: nothing is asked and the screen shows a dash. */
  read: ConsoleRead<PlanQuoteDto> | null
  retry: () => void
}

/**
 * The first invoice for a plan and term, as the server quotes it (PY-2):
 * `GET /platform/plans/{code}/quote`. The web shows the quote's figures exactly as returned and
 * never works a price out itself, so until the quote answers, or when it fails, there is no
 * figure. A new plan or term is a new path, which reads as loading at once and asks again.
 */
export function useFirstInvoiceQuote(
  plan: SubscriptionPlanId,
  term: Term,
  /** False until the screen shows the figure, so the earlier steps ask nothing. */
  enabled = true,
): FirstInvoiceQuote {
  const path =
    !enabled || plan === 'enterprise' ? null : planQuotePath(PLAN[plan].code, CYCLE[term])
  const { read, retry } = useConsoleRead<PlanQuoteDto>(path)
  return { read: plan === 'enterprise' ? null : read, retry }
}
