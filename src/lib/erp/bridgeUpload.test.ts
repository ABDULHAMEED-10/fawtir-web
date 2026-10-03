import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '../../api'
import { buildBridgeRequest } from '../../api/erp/bridge'
import {
  BRIDGE_MAX_FINDINGS,
  bridgeBodyBytes,
  classifyBridgeFailure,
  isIssueTime,
  readBridgeDocument,
} from './bridgeUpload'

function refusal(status: number, code: string | null, problem: Record<string, unknown> = {}) {
  return new ApiError({ status, problemType: null, code, problem })
}

function issue(
  rule: unknown,
  field: unknown,
  severity = 'ERROR',
  extra: Record<string, unknown> = {},
) {
  return { rule, field_id: field, xpath: '/Invoice[1]', message: 'raw', severity, ...extra }
}

describe('classifyBridgeFailure', () => {
  it('names each refusal by its code, never by its text', () => {
    const cases: [number, string, string][] = [
      [422, 'MAPPING_FAILED', 'mapping'],
      [422, 'SUBMISSION_NOT_SUPPORTED', 'notSupported'],
      [409, 'SOURCE_IDENTITY_CONFLICT', 'identityConflict'],
      [409, 'SOURCE_DOCUMENT_IN_PROGRESS', 'inProgress'],
      [409, 'SOURCE_DOCUMENT_ALREADY_REFUSED', 'alreadyRefused'],
      [409, 'DUPLICATE_INVOICE', 'duplicateInvoice'],
      [409, 'DUPLICATE_IDEMPOTENCY', 'idempotency'],
      [409, 'TENANT_NOT_OPERATIONAL', 'notOperational'],
      [503, 'EMISSION_BLOCKED', 'emissionBlocked'],
    ]
    for (const [status, code, kind] of cases) {
      expect(classifyBridgeFailure(refusal(status, code)).kind, code).toBe(kind)
    }
    expect(classifyBridgeFailure(refusal(413, null)).kind).toBe('tooLarge')
    expect(classifyBridgeFailure(refusal(415, null)).kind).toBe('notJsonBody')
    expect(classifyBridgeFailure(new NetworkError('offline')).kind).toBe('unreachable')
    expect(classifyBridgeFailure(refusal(500, 'INTERNAL_ERROR')).kind).toBe('other')
    expect(classifyBridgeFailure(new Error('boom')).kind).toBe('other')
  })

  it('keeps only the layer, an identifier-shaped rule and a business-term field of each ERROR', () => {
    const result = classifyBridgeFailure(
      refusal(422, 'VALIDATION_FAILED', {
        layer_results: [
          { layer: 1, layer_name: 'L1_XSD', issues: [issue('cvc-datatype-valid.1.2.1', null)] },
          {
            layer: 5,
            layer_name: 'L5_PINT_OM',
            issues: [
              issue('OM-R-001', 'IBT-031'),
              issue("value 'PASSWORD_MARKER' is invalid", 'Seller SECRET_SOURCE_VALUE'),
              issue('OM-W-002', 'IBT-001', 'WARN'),
            ],
          },
          { layer: 9, layer_name: 'L9_UNKNOWN', issues: [issue('X-1', 'BTOM-020')] },
          'not an object',
        ],
      }),
    )
    expect(result).toEqual({
      kind: 'validation',
      findings: [
        { layer: 'L1_XSD', rule: 'cvc-datatype-valid.1.2.1', field: null },
        { layer: 'L5_PINT_OM', rule: 'OM-R-001', field: 'IBT-031' },
        { layer: 'L5_PINT_OM', rule: null, field: null },
        { layer: null, rule: 'X-1', field: 'BTOM-020' },
      ],
      more: 0,
    })
    expect(JSON.stringify(result)).not.toMatch(
      /raw|PASSWORD_MARKER|SECRET_SOURCE_VALUE|Invoice\[1\]/,
    )
  })

  it('shows at most fifty findings and counts the rest', () => {
    const issues = Array.from({ length: 73 }, (_, index) => issue(`R-${index}`, null))
    const result = classifyBridgeFailure(
      refusal(422, 'VALIDATION_FAILED', { layer_results: [{ layer_name: 'L1_XSD', issues }] }),
    )
    expect(result.kind).toBe('validation')
    if (result.kind !== 'validation') return
    expect(result.findings).toHaveLength(BRIDGE_MAX_FINDINGS)
    expect(result.findings[49].rule).toBe('R-49')
    expect(result.more).toBe(23)
  })

  it('treats a validation refusal with no readable report as one with no findings', () => {
    expect(
      classifyBridgeFailure(refusal(422, 'VALIDATION_FAILED', { layer_results: 'nope' })),
    ).toEqual({ kind: 'validation', findings: [], more: 0 })
  })
})

describe('readBridgeDocument', () => {
  const file = (text: string, name = 'doc.json') => new File([text], name)

  it('reads a JSON object, and refuses anything else under JSON', async () => {
    expect(await readBridgeDocument(file('{"number":"INV-1"}'), 'JSON')).toEqual({
      ok: true,
      document: { number: 'INV-1' },
    })
    expect(await readBridgeDocument(file('[1,2]'), 'JSON')).toEqual({
      ok: false,
      problem: 'notObject',
    })
    expect(await readBridgeDocument(file('"text"'), 'JSON')).toEqual({
      ok: false,
      problem: 'notObject',
    })
    expect(await readBridgeDocument(file('{nope'), 'JSON')).toEqual({
      ok: false,
      problem: 'notJson',
    })
    expect(await readBridgeDocument(file('  \n'), 'JSON')).toEqual({ ok: false, problem: 'empty' })
  })

  it('keeps XML as the text itself; a leading byte-order mark is not markup', async () => {
    const xml = '<?xml version="1.0"?><Invoice/>'
    // File.text() decodes UTF-8 and drops the mark, so it never reaches the request.
    expect(
      await readBridgeDocument(file(`${String.fromCharCode(0xfeff)}${xml}`, 'doc.xml'), 'XML'),
    ).toEqual({
      ok: true,
      document: xml,
    })
    expect(await readBridgeDocument(file('{"a":1}', 'doc.xml'), 'XML')).toEqual({
      ok: false,
      problem: 'notXml',
    })
  })
})

describe('buildBridgeRequest', () => {
  it('sends only the route fields, with seconds on the time and no empty version', () => {
    const request = buildBridgeRequest({
      format: 'JSON',
      document: { a: 1 },
      issueTime: '09:30',
      transactionType: '1XXXXXXXXXXXXXXXXXXX',
      externalDocumentId: '  SO-1001 ',
      externalVersion: '  ',
    })
    expect(request).toEqual({
      format: 'JSON',
      document: { a: 1 },
      supplement: { issue_time: '09:30:00', transaction_type: '1XXXXXXXXXXXXXXXXXXX' },
      source: { external_document_id: 'SO-1001' },
    })
    expect(
      buildBridgeRequest({
        format: 'XML',
        document: '<Invoice/>',
        issueTime: '09:30',
        transactionType: '1XXXXXXXXXXXXXXXXXXX',
        externalDocumentId: 'SO-1001',
        externalVersion: ' 2 ',
      }).source,
    ).toEqual({ external_document_id: 'SO-1001', external_version: '2' })
  })

  it('measures the body as UTF-8 bytes, which is what the gateway counts', () => {
    const request = buildBridgeRequest({
      format: 'XML',
      document: 'ع'.repeat(10),
      issueTime: '09:30',
      transactionType: '1XXXXXXXXXXXXXXXXXXX',
      externalDocumentId: 'A',
      externalVersion: '',
    })
    expect(bridgeBodyBytes(request)).toBe(new TextEncoder().encode(JSON.stringify(request)).length)
    expect(bridgeBodyBytes(request)).toBeGreaterThan(JSON.stringify(request).length)
  })
})

describe('isIssueTime', () => {
  it('accepts a 24-hour clock time and nothing else', () => {
    expect(isIssueTime('00:00')).toBe(true)
    expect(isIssueTime('23:59')).toBe(true)
    expect(isIssueTime('24:00')).toBe(false)
    expect(isIssueTime('9:30')).toBe(false)
    expect(isIssueTime('')).toBe(false)
  })
})
