import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import type { ErpConnectionDto } from '../../api/erp/connections'
import {
  canTransitionTo,
  erpConnectionAccess,
  erpConnectionControls,
  erpRefusalOf,
  isProbeableCredentialType,
  needsReload,
  testReasonKey,
} from './connectionPolicy'
import type { Entitlements } from '../identity/entitlements'

function who(...permissions: string[]): Entitlements {
  return {
    userId: 'u',
    username: 'u',
    tenantId: 't',
    roles: [],
    permissions,
    scopes: [],
    featureFlags: {},
  }
}

function connection(overrides: Partial<ErpConnectionDto> = {}): ErpConnectionDto {
  return {
    id: 'c-1',
    name: 'Odoo',
    sourceSystem: 'ODOO',
    sourceVersion: null,
    connectionMode: 'MANAGED_PULL',
    transportType: 'REST',
    endpoint: 'https://erp.example.om',
    configuration: '{}',
    state: 'DRAFT',
    credentialConfigured: false,
    credentialType: null,
    credentialHint: null,
    credentialRotatedAt: null,
    lastTestedAt: null,
    lastTestOutcome: null,
    lastTestReasonCode: null,
    version: 0,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  }
}

function refusal(status: number, code: string | null) {
  return new ApiError({ status, problemType: null, code })
}

describe('permissions', () => {
  it('reads the five codes separately, because the backend draws them separately', () => {
    expect(erpConnectionAccess(who('erp.connection.read'))).toEqual({
      read: true,
      manage: false,
      credential: false,
      test: false,
      sample: false,
    })
    expect(erpConnectionAccess(who('erp.connection.manage')).credential).toBe(false)
    expect(erpConnectionAccess(who('erp.connection.manage')).test).toBe(false)
    expect(erpConnectionAccess(who('erp.connection.test')).sample).toBe(false)
    expect(erpConnectionAccess(who('erp.connection.sample'))).toMatchObject({
      test: false,
      sample: true,
    })
  })

  it('fails closed while the snapshot is unknown', () => {
    // Offering controls optimistically means a screen that flickers from enabled to disabled, and
    // a click landing in between gets a 403 for a button we should not have drawn.
    expect(erpConnectionAccess(null)).toEqual({
      read: false,
      manage: false,
      credential: false,
      test: false,
      sample: false,
    })
  })
})

describe('the state machine', () => {
  it('draws only the arrows the backend draws', () => {
    expect(canTransitionTo('DRAFT', 'READY')).toBe(true)
    expect(canTransitionTo('DRAFT', 'ARCHIVED')).toBe(true)
    // Not an arrow: the backend refuses DRAFT -> DISABLED with a 400 the user cannot act on.
    expect(canTransitionTo('DRAFT', 'DISABLED')).toBe(false)
    expect(canTransitionTo('READY', 'DISABLED')).toBe(true)
    expect(canTransitionTo('DISABLED', 'READY')).toBe(true)
    expect(canTransitionTo('READY', 'DRAFT')).toBe(false)
  })

  it('lets nothing out of ARCHIVED', () => {
    for (const to of ['DRAFT', 'READY', 'DISABLED', 'ARCHIVED'] as const) {
      expect(canTransitionTo('ARCHIVED', to)).toBe(false)
    }
  })
})

describe('controls', () => {
  const all = erpConnectionAccess(
    who('erp.connection.read', 'erp.connection.manage', 'erp.credential.replace', 'erp.connection.test'),
  )

  it('needs both the permission and the state', () => {
    const archived = erpConnectionControls(connection({ state: 'ARCHIVED' }), all)
    expect(archived.canEdit).toBe(false)
    expect(archived.canConfigureCredential).toBe(false)
    expect(archived.canArchive).toBe(false)
    expect(archived.canTest).toBe(false)

    const draft = erpConnectionControls(connection(), all)
    expect(draft.canEdit).toBe(true)
    expect(draft.canMarkReady).toBe(true)
    expect(draft.canDisable).toBe(false)
  })

  it('explains why a probe is pointless instead of offering it', () => {
    expect(erpConnectionControls(connection(), all).testBlockedReason).toBe('NO_CREDENTIAL')
    expect(
      erpConnectionControls(
        connection({ credentialConfigured: true, credentialType: 'SSH_PRIVATE_KEY' }),
        all,
      ).testBlockedReason,
    ).toBe('CREDENTIAL_NOT_PROBEABLE')
    expect(
      erpConnectionControls(
        connection({ credentialConfigured: true, credentialType: 'BASIC_AUTH' }),
        all,
      ).canTest,
    ).toBe(true)
  })

  it('does not read a list row as unprobeable just because it carries no credential type', () => {
    // credentialType is null on the LIST surface by design — the server does no metadata query
    // for a list. Treating absence as "not probeable" would put the wrong reason on every row.
    const listRow = connection({ credentialConfigured: true, credentialType: null })
    expect(erpConnectionControls(listRow, all).testBlockedReason).toBeNull()
    expect(erpConnectionControls(listRow, all).canTest).toBe(true)
  })

  it('withholds each control from a user lacking its own code', () => {
    const readerOnly = erpConnectionAccess(who('erp.connection.read'))
    const controls = erpConnectionControls(
      connection({ credentialConfigured: true, credentialType: 'BASIC_AUTH' }),
      readerOnly,
    )
    expect(controls.canEdit).toBe(false)
    expect(controls.canConfigureCredential).toBe(false)
    expect(controls.canTest).toBe(false)
    expect(controls.canMarkReady).toBe(false)
  })
})

describe('refusals', () => {
  it('names each ERP code, because each calls for a different action', () => {
    expect(erpRefusalOf(refusal(409, 'CONNECTION_VERSION_CONFLICT'))).toBe('VERSION_CONFLICT')
    expect(erpRefusalOf(refusal(409, 'CONNECTION_NAME_DUPLICATE'))).toBe('NAME_DUPLICATE')
    expect(erpRefusalOf(refusal(400, 'CONNECTION_NOT_READY_COMPLETE'))).toBe('NOT_READY_COMPLETE')
    // Its own code, so the message can name the address instead of the transport settings.
    expect(erpRefusalOf(refusal(400, 'CONNECTION_ENDPOINT_INVALID'))).toBe('ENDPOINT_INVALID')
    expect(erpRefusalOf(refusal(400, 'CONNECTION_CONFIGURATION_INVALID'))).toBe('CONFIGURATION_INVALID')
    expect(erpRefusalOf(refusal(503, 'CREDENTIAL_ENCRYPTION_UNAVAILABLE'))).toBe(
      'CREDENTIAL_ENCRYPTION_UNAVAILABLE',
    )
  })

  it('treats a bare 409 as a concurrency problem', () => {
    // The only three conflicts this module raises are version, name and transition, so reload is
    // the right advice rather than a generic failure.
    expect(erpRefusalOf(refusal(409, null))).toBe('VERSION_CONFLICT')
  })

  it('offers a reload only where the screen is genuinely out of date', () => {
    expect(needsReload(refusal(409, 'CONNECTION_VERSION_CONFLICT'))).toBe(true)
    expect(needsReload(refusal(400, 'CONNECTION_TRANSITION_INVALID'))).toBe(true)
    // Reloading does not help a duplicate name, and telling someone to is wrong advice.
    expect(needsReload(refusal(409, 'CONNECTION_NAME_DUPLICATE'))).toBe(false)
    expect(needsReload(refusal(400, 'CONNECTION_VALUE_INVALID'))).toBe(false)
  })

  it('leaves anything it does not recognise to the shared handler', () => {
    expect(erpRefusalOf(refusal(403, null))).toBeNull()
    expect(erpRefusalOf(refusal(500, null))).toBeNull()
    expect(erpRefusalOf(new Error('offline'))).toBeNull()
  })
})

describe('test reasons', () => {
  it('maps each known code to its own key', () => {
    expect(testReasonKey('TLS_FAILURE')).toBe('erp.connections.test.reason.TLS_FAILURE')
    expect(testReasonKey('SUCCESS')).toBe('erp.connections.test.reason.SUCCESS')
  })

  it('falls back for a code added after this build, and for none at all', () => {
    // last_test_reason_code carries no CHECK constraint, so a later release can add one without a
    // migration. An exhaustive switch would render blank for the new one.
    expect(testReasonKey('SOMETHING_NEW')).toBe('erp.connections.test.reason.unknown')
    expect(testReasonKey(null)).toBe('erp.connections.test.reason.unknown')
  })
})

describe('probeable credential types', () => {
  it('is exactly the two the backend can exercise', () => {
    expect(isProbeableCredentialType('BASIC_AUTH')).toBe(true)
    expect(isProbeableCredentialType('API_TOKEN')).toBe(true)
    // The server answers INVALID_CONFIGURATION rather than sending these as bearer tokens.
    expect(isProbeableCredentialType('OAUTH2_CLIENT_CREDENTIALS')).toBe(false)
    expect(isProbeableCredentialType('SSH_PRIVATE_KEY')).toBe(false)
  })
})
