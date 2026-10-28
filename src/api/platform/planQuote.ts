import { apiRequest } from '../client'
import { withQuery } from '../query'

/** The two billing cycles a plan is sold on. There is no quarterly term. */
export type PlanQuoteBillingCycle = 'MONTHLY' | 'ANNUAL'

/** One line of the quote: the plan for the period, or the ERP add-on for the same months. */
export type PlanQuoteLineDto = {
  kind: 'PLAN' | 'ERP_ADDON'
  description: string
  /** Rial, three decimals, as the server worked it. */
  net: string
}

/**
 * `GET /v1/platform/plans/{code}/quote`: what the first invoice for a plan and cycle comes to,
 * priced by the server from the plan's current price version and the billing VAT setting.
 *
 * Every figure is a string with three decimals and is shown exactly as returned: the web never
 * multiplies, adds VAT or rounds a price itself. `vatRate` is a percent string ("5.00").
 */
export type PlanQuoteDto = {
  planCode: string
  planVersion: number
  billingCycle: PlanQuoteBillingCycle
  currency: string
  months: number
  lines: PlanQuoteLineDto[]
  net: string
  vatRate: string
  vat: string
  total: string
}

/** The path of one quote; `erpAddon` is sent only when the add-on is asked for. */
export function planQuotePath(
  planCode: string,
  billingCycle: PlanQuoteBillingCycle,
  erpAddon = false,
): string {
  return withQuery(`/v1/platform/plans/${encodeURIComponent(planCode)}/quote`, {
    billingCycle,
    erpAddon: erpAddon ? 'true' : undefined,
  })
}

/** `platform.plans.read`. A 400 or 404 is a problem+json with the usual `code`. */
export function getPlanQuote(
  planCode: string,
  billingCycle: PlanQuoteBillingCycle,
  options: { erpAddon?: boolean; signal?: AbortSignal } = {},
): Promise<PlanQuoteDto> {
  return apiRequest<PlanQuoteDto>(planQuotePath(planCode, billingCycle, options.erpAddon), {
    signal: options.signal,
  })
}
