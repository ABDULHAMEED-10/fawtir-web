import { describe, expect, it } from 'vitest'
import { buildChecklists, progressOf, type ChecklistFacts } from './setupChecklist'
import type { ErpConnectionDto, ConnectionHealthDto } from '../../api/erp/connections'
import type { ErpOverviewDto } from '../../api/erp/overview'
import type { DocumentSummaryDto } from '../../api/erp/reporting'

const health = (over: Partial<ConnectionHealthDto> = {}): ConnectionHealthDto =>
  ({
    connectionMode: 'MANAGED_PULL',
    extractionStatus: 'ENABLED',
    extractionReadable: true,
    extractionConfigured: true,
    extractionEnabled: true,
    nextRunAt: null,
    consecutiveFailures: 0,
    backoffUntil: null,
    lastRunId: null,
    lastRunState: null,
    lastRunStartedAt: null,
    lastRunCompletedAt: null,
    lastFailureReason: null,
    lastCompletedRunAt: null,
    lastFailedRunAt: null,
    lastTestedAt: null,
    lastTestOutcome: null,
    ...over,
  }) as ConnectionHealthDto

const connection = (over: Record<string, unknown> = {}): ErpConnectionDto =>
  ({
    id: 'c-1',
    name: 'Odoo',
    connectionMode: 'MANAGED_PULL',
    credentialConfigured: true,
    lastTestOutcome: 'SUCCESS',
    health: health(),
    ...over,
  }) as unknown as ErpConnectionDto

const summary = (received: number, accepted: number, rejected = 0): DocumentSummaryDto =>
  ({ received, accepted, rejected }) as unknown as DocumentSummaryDto

const overview = (over: Partial<ErpOverviewDto> = {}): ErpOverviewDto =>
  ({
    entitled: true,
    mapping: { active_json_profile: true, uncertified_channels: 0 },
    ...over,
  }) as ErpOverviewDto

const facts = (over: Partial<ChecklistFacts> = {}): ChecklistFacts => ({
  overview: overview(),
  connections: [connection()],
  apiKeys: [],
  certified: true,
  summaries: { MANAGED_PULL: summary(1, 1), BRIDGE_UPLOAD: summary(0, 0), API_PUSH: summary(0, 0) },
  ...over,
})

const stateOf = (list: ReturnType<typeof buildChecklists>, channel: string, id: string) =>
  list.find((entry) => entry.channel === channel)!.steps.find((step) => step.id === id)!.state

describe('the setup checklist', () => {
  it('has the three channels, and only managed pull asks for a connection', () => {
    const lists = buildChecklists(facts({ connections: [] }))
    expect(lists.map((list) => list.channel)).toEqual(['MANAGED_PULL', 'BRIDGE_UPLOAD', 'API_PUSH'])
    expect(stateOf(lists, 'MANAGED_PULL', 'connection')).toBe('todo')
    for (const channel of ['BRIDGE_UPLOAD', 'API_PUSH']) {
      const ids = lists.find((list) => list.channel === channel)!.steps.map((step) => step.id)
      expect(ids).not.toContain('connection')
      expect(ids).not.toContain('credentials')
    }
  })

  it('says "not known" rather than guessing when the reader cannot see the data', () => {
    const lists = buildChecklists(
      facts({ connections: null, apiKeys: null, certified: null, summaries: {} }),
    )
    expect(stateOf(lists, 'MANAGED_PULL', 'connection')).toBe('unknown')
    expect(stateOf(lists, 'API_PUSH', 'apiKey')).toBe('unknown')
    expect(stateOf(lists, 'BRIDGE_UPLOAD', 'certification')).toBe('unknown')
    expect(stateOf(lists, 'BRIDGE_UPLOAD', 'upload')).toBe('unknown')
  })

  it('ignores a connection that is not managed pull', () => {
    const lists = buildChecklists(
      facts({
        connections: [
          connection({
            connectionMode: 'API_PUSH',
            health: health({ connectionMode: 'API_PUSH' }),
          }),
        ],
      }),
    )
    expect(stateOf(lists, 'MANAGED_PULL', 'connection')).toBe('todo')
  })

  it('counts only an active or rotating ERP ingestion key', () => {
    const key = (profile: string, status: string) => ({ profile, status }) as never
    expect(
      stateOf(
        buildChecklists(
          facts({ apiKeys: [key('GENERAL', 'ACTIVE'), key('ERP_INGESTION', 'REVOKED')] }),
        ),
        'API_PUSH',
        'apiKey',
      ),
    ).toBe('todo')
    expect(
      stateOf(
        buildChecklists(facts({ apiKeys: [key('ERP_INGESTION', 'ROTATION_GRACE')] })),
        'API_PUSH',
        'apiKey',
      ),
    ).toBe('done')
  })

  it('reads the issue-time pointer from the server status, and not through the platform switch', () => {
    const missing = buildChecklists(
      facts({
        connections: [connection({ health: health({ extractionStatus: 'NOT_CONFIGURED' }) })],
      }),
    )
    expect(stateOf(missing, 'MANAGED_PULL', 'issueTimePointer')).toBe('todo')
    const hidden = buildChecklists(
      facts({
        connections: [connection({ health: health({ extractionStatus: 'GLOBALLY_DISABLED' }) })],
      }),
    )
    expect(stateOf(hidden, 'MANAGED_PULL', 'issueTimePointer')).toBe('unknown')
  })

  it('takes the entitlement from the overview', () => {
    const lists = buildChecklists(facts({ overview: overview({ entitled: false }) }))
    expect(stateOf(lists, 'API_PUSH', 'entitlement')).toBe('todo')
  })

  it('links each channel’s activity filtered by its source kind', () => {
    const lists = buildChecklists(facts())
    const to = (channel: string, id: string) =>
      lists.find((list) => list.channel === channel)!.steps.find((step) => step.id === id)!.to
    expect(to('BRIDGE_UPLOAD', 'activity')).toBe('/settings/erp/documents?channel=BRIDGE_UPLOAD')
    expect(to('API_PUSH', 'monitor')).toBe('/settings/erp/documents?channel=API_PUSH')
  })

  it('counts progress over answered steps only', () => {
    expect(
      progressOf([
        { id: 'a', state: 'done', to: '' },
        { id: 'b', state: 'todo', to: '' },
        { id: 'c', state: 'unknown', to: '' },
        { id: 'd', state: 'info', to: '' },
      ]),
    ).toEqual({ done: 1, total: 2 })
  })
})
