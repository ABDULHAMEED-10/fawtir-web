import { SUBSCRIPTIONS_NOW, OPERATOR, useSubscriptions } from './consoleSubscriptions'
import { useConsoleErp } from './consoleErp'
import { useConsoleOps } from './consoleOps'
import { usePlatformSettings } from './platformSettings'

/**
 * The platform audit log — docs/erp-and-console-plan.md §9: one list of every operator action.
 *
 * Nothing is recorded here twice. The subscriptions ledger, the ERP store, the operations store and
 * the platform settings each keep their own events; this module reads them all, adds the areas
 * that have no store of their own yet (verification decisions, operator changes, plan edits — the
 * integrated screens write to the backend, whose audit will feed this list), and sorts.
 *
 * `actionKey` stays the owning area's key — the page translates with the area's namespace.
 */

export type AuditArea =
  | 'subscriptions'
  | 'erp'
  | 'incidents'
  | 'queue'
  | 'settings'
  | 'verification'
  | 'operators'
  | 'plans'
export const AUDIT_AREAS: AuditArea[] = [
  'subscriptions',
  'erp',
  'incidents',
  'queue',
  'settings',
  'verification',
  'operators',
  'plans',
]

export type AuditEntry = {
  id: string
  at: Date
  by: string
  area: AuditArea
  /** The area's own event key, e.g. `console.subscriptions.event.paymentRecorded`. */
  actionKey: string
  tenantId?: string
  values?: Record<string, string | number>
  /** Where to look, when there is somewhere. */
  to?: string
}

const NOW = SUBSCRIPTIONS_NOW
const DAY = 24 * 60 * 60 * 1000
const at = (daysAgo: number, hour = 10, minute = 0) => {
  const d = new Date(NOW.getTime() - daysAgo * DAY)
  d.setHours(hour, minute, 0, 0)
  return d
}

/** Actions the integrated screens send to the backend — mirrored here until its audit feed exists. */
const SEEDED: AuditEntry[] = [
  {
    id: 'a-1',
    at: at(0, 13, 40),
    by: 'Maryam Al Balushi',
    area: 'verification',
    actionKey: 'console.audit.seeded.verificationApproved',
    tenantId: 'nakhal-honey',
    to: '/console/onboarding',
  },
  {
    id: 'a-2',
    at: at(0, 9, 55),
    by: OPERATOR,
    area: 'verification',
    actionKey: 'console.audit.seeded.verificationReturned',
    tenantId: 'jalan-fish',
    values: { reason: 'CR certificate unreadable' },
    to: '/console/onboarding',
  },
  {
    id: 'a-3',
    at: at(1, 16, 10),
    by: OPERATOR,
    area: 'operators',
    actionKey: 'console.audit.seeded.operatorInvited',
    values: { email: 'salma.alhinai@fawtir.om', role: 'Support' },
    to: '/console/operators',
  },
  {
    id: 'a-4',
    at: at(1, 11, 30),
    by: 'Hamed Al Kindi',
    area: 'plans',
    actionKey: 'console.audit.seeded.planEdited',
    values: { plan: 'Business Plus', field: 'extra branch', value: '8.000' },
    to: '/console/plans',
  },
  {
    id: 'a-5',
    at: at(2, 15, 20),
    by: OPERATOR,
    area: 'operators',
    actionKey: 'console.audit.seeded.operatorRoleChanged',
    values: { name: 'Hamed Al Kindi', role: 'Platform admin' },
    to: '/console/operators',
  },
  {
    id: 'a-6',
    at: at(2, 10, 5),
    by: 'Maryam Al Balushi',
    area: 'verification',
    actionKey: 'console.audit.seeded.verificationApproved',
    tenantId: 'sumail-poultry',
    to: '/console/onboarding',
  },
  {
    id: 'a-7',
    at: at(3, 14, 0),
    by: OPERATOR,
    area: 'settings',
    actionKey: 'console.audit.seeded.settingsSaved',
    values: { section: 'Payments' },
    to: '/console/settings?section=payments',
  },
  {
    id: 'a-8',
    at: at(4, 9, 20),
    by: 'Hamed Al Kindi',
    area: 'verification',
    actionKey: 'console.audit.seeded.verificationRejected',
    tenantId: 'bidbid-cafe',
    values: { reason: 'VATIN belongs to another company' },
    to: '/console/onboarding',
  },
  {
    id: 'a-9',
    at: at(5, 17, 45),
    by: OPERATOR,
    area: 'operators',
    actionKey: 'console.audit.seeded.operatorTwoStepReset',
    values: { name: 'Maryam Al Balushi' },
    to: '/console/operators',
  },
  {
    id: 'a-10',
    at: at(6, 12, 15),
    by: OPERATOR,
    area: 'settings',
    actionKey: 'console.audit.seeded.settingsSaved',
    values: { section: 'Trial and lifecycle' },
    to: '/console/settings?section=lifecycle',
  },
  {
    id: 'a-11',
    at: at(7, 10, 0),
    by: 'Hamed Al Kindi',
    area: 'plans',
    actionKey: 'console.audit.seeded.planPublished',
    values: { plan: 'Starter' },
    to: '/console/plans',
  },
  {
    id: 'a-12',
    at: at(10, 11, 10),
    by: OPERATOR,
    area: 'operators',
    actionKey: 'console.audit.seeded.operatorDeactivated',
    values: { name: 'Yousuf Al Harthi' },
    to: '/console/operators',
  },
  {
    id: 'a-13',
    at: at(13, 9, 0),
    by: 'Maryam Al Balushi',
    area: 'settings',
    actionKey: 'console.audit.seeded.settingsSaved',
    values: { section: 'Notices' },
    to: '/console/settings?section=notices',
  },
]

/** Every entry, newest first, from all the stores plus the seeded areas. */
export function useConsoleAudit(): AuditEntry[] {
  const ledger = useSubscriptions()
  const erp = useConsoleErp()
  const ops = useConsoleOps()
  const { settings, saved } = usePlatformSettings()
  void settings

  const subscriptions: AuditEntry[] = ledger.events.map((e) => ({
    id: `s-${e.id}`,
    at: e.at,
    by: e.by,
    area: 'subscriptions',
    actionKey: `console.subscriptions.event.${e.actionKey}`,
    tenantId: e.tenantId,
    values: e.values,
    to: `/console/tenants/${e.tenantId}`,
  }))
  const erpEntries: AuditEntry[] = erp.events.map((e) => ({
    id: `e-${e.id}`,
    at: e.at,
    by: e.by,
    area: 'erp',
    actionKey: `console.erp.event.${e.actionKey}`,
    tenantId: e.tenantId,
    values: e.values,
    to: e.tenantId ? `/console/tenants/${e.tenantId}?tab=erp` : '/console/erp/templates',
  }))
  const opsEntries: AuditEntry[] = ops.events.map((e) => ({
    id: `o-${e.id}`,
    at: e.at,
    by: e.by,
    area:
      e.actionKey.startsWith('incident') || e.actionKey === 'noticePosted' ? 'incidents' : 'queue',
    actionKey: `console.ops.event.${e.actionKey}`,
    tenantId: e.tenantId,
    values: e.values,
    to:
      e.actionKey.startsWith('incident') || e.actionKey === 'noticePosted'
        ? '/console/incidents'
        : '/console/queue',
  }))
  const settingsEntries: AuditEntry[] = (saved ?? []).map((mark, i) => ({
    id: `p-${i}-${mark.section}`,
    at: mark.at,
    by: mark.by,
    area: 'settings',
    actionKey: 'console.audit.seeded.settingsSaved',
    values: { section: mark.section },
    to: `/console/settings?section=${mark.section}`,
  }))

  return [...SEEDED, ...subscriptions, ...erpEntries, ...opsEntries, ...settingsEntries].sort(
    (a, b) => b.at.getTime() - a.at.getTime(),
  )
}
