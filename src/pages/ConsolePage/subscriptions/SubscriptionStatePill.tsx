import { useTranslation } from 'react-i18next'
import {
  ConsoleStatusPill,
  type ConsolePillTone,
} from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import type {
  InvoiceStatus,
  LinkStatus,
  SubscriptionState,
} from '../../../lib/consoleSubscriptions'

/** One tone per state, so a queue row and the tenant's page never disagree about what a colour means. */
export const STATE_TONE: Record<SubscriptionState, ConsolePillTone> = {
  trial: 'neutral',
  awaitingPayment: 'pending',
  active: 'success',
  grace: 'danger',
  suspended: 'danger',
  cancelled: 'neutral',
}

export const INVOICE_TONE: Record<InvoiceStatus, ConsolePillTone> = {
  unpaid: 'pending',
  paid: 'success',
  overdue: 'danger',
  waived: 'neutral',
}

export const LINK_TONE: Record<LinkStatus, ConsolePillTone> = {
  unpaid: 'pending',
  paid: 'success',
  expired: 'neutral',
}

export function SubscriptionStatePill({ state }: { state: SubscriptionState }) {
  const { t } = useTranslation()
  return (
    <ConsoleStatusPill tone={STATE_TONE[state]} label={t(`console.subscriptions.state.${state}`)} />
  )
}

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  const { t } = useTranslation()
  return (
    <ConsoleStatusPill
      tone={INVOICE_TONE[status]}
      label={t(`console.subscriptions.invoiceStatus.${status}`)}
    />
  )
}

export function LinkStatusPill({ status }: { status: LinkStatus }) {
  const { t } = useTranslation()
  return (
    <ConsoleStatusPill
      tone={LINK_TONE[status]}
      label={t(`console.subscriptions.linkStatus.${status}`)}
    />
  )
}
