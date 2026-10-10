import type { ErpConnectionDto } from '../../api/erp/connections'
import type { ErpOverviewDto } from '../../api/erp/overview'
import type { DocumentSummaryDto, SourceKind } from '../../api/erp/reporting'
import type { ApiKeySummaryDto } from '../../api/settings/apiKeys'

/**
 * One step's standing, from server facts only. Nothing here is stored: the checklist is worked
 * out afresh from each read, so it can never disagree with the server or survive a change it did
 * not see.
 *
 * - `done` / `todo`: the server's data answers the question.
 * - `unknown`: the reader may not see the data that would answer it, or the server is not
 *   saying (a channel whose status the platform switch hides). Never guessed either way.
 * - `info`: a step the platform keeps no record of (fetching a sample) or one that is a place
 *   to go rather than a state (monitoring). Shown as guidance, never ticked.
 */
export type StepState = 'done' | 'todo' | 'unknown' | 'info'

export type ChecklistStep = {
  id: string
  state: StepState
  /** Where the reader does it. */
  to: string
}

export type ChannelChecklist = { channel: SourceKind; steps: ChecklistStep[] }

/** What the checklist is worked out from. `null` means "not readable by this reader". */
export type ChecklistFacts = {
  overview: ErpOverviewDto | null
  connections: ErpConnectionDto[] | null
  apiKeys: ApiKeySummaryDto[] | null
  /** The invoice route's certification for JSON, as the server answers it. */
  certified: boolean | null
  /** Per channel, the window's document summary. */
  summaries: Partial<Record<SourceKind, DocumentSummaryDto | null>>
}

const when = (fact: boolean | null | undefined): StepState =>
  fact === null || fact === undefined ? 'unknown' : fact ? 'done' : 'todo'

const ACTIVITY = (channel: SourceKind) => `/settings/erp/documents?channel=${channel}`

/**
 * The three ways a document reaches Fawtir, each with its own path. Bridge upload and API push
 * need no ERP connection, so neither checks for one.
 */
export function buildChecklists(facts: ChecklistFacts): ChannelChecklist[] {
  const pulls =
    facts.connections === null
      ? null
      : facts.connections.filter((connection) => connection.connectionMode === 'MANAGED_PULL')
  const anyPull = (test: (connection: ErpConnectionDto) => boolean) =>
    pulls === null ? null : pulls.some(test)
  const mapping = facts.overview === null ? null : facts.overview.mapping.active_json_profile
  const summary = (channel: SourceKind) => facts.summaries[channel] ?? null
  const received = (channel: SourceKind) => {
    const s = summary(channel)
    return s === null ? null : s.received > 0
  }
  const accepted = (channel: SourceKind) => {
    const s = summary(channel)
    return s === null ? null : s.accepted > 0
  }

  // The issue-time pointer has no flag of its own on the list; the server's status answers it.
  // NOT_CONFIGURED on a configured channel means the pointer is missing; GLOBALLY_DISABLED comes
  // first in the server's precedence and hides the answer, so it is unknown rather than guessed.
  const issueTime = (() => {
    if (pulls === null) return null
    const configured = pulls.filter((connection) => connection.health?.extractionConfigured)
    if (configured.length === 0) return false
    if (configured.some((c) => c.health?.extractionStatus === 'GLOBALLY_DISABLED')) {
      return configured.some(
        (c) =>
          c.health?.extractionStatus !== 'GLOBALLY_DISABLED' &&
          c.health?.extractionStatus !== 'NOT_CONFIGURED',
      )
        ? true
        : null
    }
    return configured.some((c) => c.health?.extractionStatus !== 'NOT_CONFIGURED')
  })()

  const managedPull: ChecklistStep[] = [
    { id: 'connection', state: when(anyPull(() => true)), to: '/settings/erp/connections' },
    {
      id: 'credentials',
      state: when(anyPull((c) => c.credentialConfigured)),
      to: '/settings/erp/connections',
    },
    {
      id: 'test',
      state: when(anyPull((c) => c.lastTestOutcome === 'SUCCESS')),
      to: '/settings/erp/connections',
    },
    { id: 'sample', state: 'info', to: '/settings/erp/connections' },
    {
      id: 'extraction',
      state: when(anyPull((c) => c.health?.extractionConfigured === true)),
      to: '/settings/erp/connections',
    },
    {
      id: 'documentIdPointer',
      state: when(anyPull((c) => c.health?.extractionConfigured === true)),
      to: '/settings/erp/connections',
    },
    { id: 'issueTimePointer', state: when(issueTime), to: '/settings/erp/connections' },
    { id: 'mapping', state: when(mapping), to: '/settings/erp-mapping' },
    {
      id: 'certification',
      state: when(facts.certified),
      to: '/settings/erp-mapping/certification',
    },
    {
      id: 'enable',
      state: when(anyPull((c) => c.health?.extractionEnabled === true)),
      to: '/settings/erp/connections',
    },
    { id: 'firstAccepted', state: when(accepted('MANAGED_PULL')), to: ACTIVITY('MANAGED_PULL') },
    { id: 'monitor', state: 'info', to: ACTIVITY('MANAGED_PULL') },
  ]

  const bridge: ChecklistStep[] = [
    { id: 'mapping', state: when(mapping), to: '/settings/erp-mapping' },
    {
      id: 'certification',
      state: when(facts.certified),
      to: '/settings/erp-mapping/certification',
    },
    { id: 'upload', state: when(received('BRIDGE_UPLOAD')), to: '/settings/erp/bridge' },
    {
      id: 'verify',
      state: when(
        summary('BRIDGE_UPLOAD') === null
          ? null
          : summary('BRIDGE_UPLOAD')!.accepted + summary('BRIDGE_UPLOAD')!.rejected > 0,
      ),
      to: ACTIVITY('BRIDGE_UPLOAD'),
    },
    { id: 'activity', state: 'info', to: ACTIVITY('BRIDGE_UPLOAD') },
    { id: 'monitor', state: 'info', to: ACTIVITY('BRIDGE_UPLOAD') },
  ]

  const usableKey =
    facts.apiKeys === null
      ? null
      : facts.apiKeys.some(
          (key) =>
            key.profile === 'ERP_INGESTION' &&
            (key.status === 'ACTIVE' || key.status === 'ROTATION_GRACE'),
        )
  const apiPush: ChecklistStep[] = [
    {
      id: 'entitlement',
      state: when(facts.overview === null ? null : facts.overview.entitled),
      to: '/settings/erp',
    },
    { id: 'apiKey', state: when(usableKey), to: '/settings/erp/api-push' },
    { id: 'mapping', state: when(mapping), to: '/settings/erp-mapping' },
    {
      id: 'certification',
      state: when(facts.certified),
      to: '/settings/erp-mapping/certification',
    },
    { id: 'instructions', state: 'info', to: '/settings/erp/api-push' },
    { id: 'testPush', state: when(received('API_PUSH')), to: ACTIVITY('API_PUSH') },
    { id: 'verify', state: when(accepted('API_PUSH')), to: ACTIVITY('API_PUSH') },
    { id: 'monitor', state: 'info', to: ACTIVITY('API_PUSH') },
    { id: 'rotate', state: 'info', to: '/settings/erp/api-push' },
  ]

  return [
    { channel: 'MANAGED_PULL', steps: managedPull },
    { channel: 'BRIDGE_UPLOAD', steps: bridge },
    { channel: 'API_PUSH', steps: apiPush },
  ]
}

/** Steps with a state the server answered, and how many of them are done. */
export function progressOf(steps: readonly ChecklistStep[]): { done: number; total: number } {
  const counted = steps.filter((step) => step.state === 'done' || step.state === 'todo')
  return { done: counted.filter((step) => step.state === 'done').length, total: counted.length }
}
