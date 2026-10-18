import { describe, expect, it } from 'vitest'
import { evidenceReferenceError, javaTrim } from './evidenceReference'

// The first three tables are the backend's own EvidenceReferenceTest cases (backend PR #643,
// fix/participant-ownership-followups 716f937a0), so a drift between the two grammars fails here.
describe('evidenceReferenceError, parity with EvidenceReferenceTest', () => {
  it.each([
    'evidence://tickets/SUP-1200',
    'EVIDENCE://safe/claim',
    'https://jira.fawtir.om/browse/SUP-1200',
    'https://drive.example.com/file?id=4711',
    'urn:fawtir:evidence:pki:2026-08-04',
    'urn:fawtir:test:evidence:fawtara:001',
    'SUP-1200',
    'ops-42',
    'OTA-2026-0042',
    'INC-20261018-A1',
    '3f2b8c1e-5d4a-4b7e-9c2d-1a6f8e0b7c55',
    '  SUP-1200  ',
  ])('accepts %j', (value) => {
    expect(evidenceReferenceError(value)).toBeNull()
  })

  // The backend accepts either "placeholder" or "invalid" for these; each is pinned to the one its
  // rule order produces, so a reordering is noticed too.
  it.each([
    ['OKOK', 'placeholder'],
    ['ok', 'placeholder'],
    ['x', 'placeholder'],
    ['n/a', 'placeholder'],
    ['N.A.', 'placeholder'],
    ['tbd', 'placeholder'],
    ['TBD', 'placeholder'],
    ['none', 'placeholder'],
    ['null', 'placeholder'],
    ['todo', 'placeholder'],
    ['test', 'placeholder'],
    ['-', 'placeholder'],
    ['...', 'placeholder'],
    ['evidence', 'placeholder'],
    ['see attached', 'invalid'],
    ['TBD-1234', 'placeholder'],
    ['test-1', 'placeholder'],
    ['NA-0001', 'placeholder'],
    ['SUP-0000', 'placeholder'],
    ['00000000-0000-0000-0000-000000000000', 'placeholder'],
    ['https://jira.fawtir.om/tbd', 'placeholder'],
    ['evidence://tickets/n-a', 'placeholder'],
    ['urn:fawtir:tbd', 'placeholder'],
  ])('refuses the placeholder %j as %s', (value, problem) => {
    expect(evidenceReferenceError(value)).toBe(problem)
  })

  it.each([
    'OKOK1',
    'abc12',
    'SUP1200',
    '1234567',
    'SUP 1200',
    'SUP-',
    '-1200',
    'S-1200',
    'http://jira.fawtir.om/browse/SUP-1200',
    'ftp://files.fawtir.om/evidence.pdf',
    'file:///etc/passwd',
    'https://jira.fawtir.om',
    'https://jira.fawtir.om/',
    'https://jira.fawtir.om/?',
    'evidence://safe',
    'evidence:///tickets/SUP-1200',
    'javascript://x/alert(1)',
    'http://[::invalid',
    'mailto:ops@fawtir.om',
    '3f2b8c1e5d4a4b7e9c2d1a6f8e0b7c55',
  ])('refuses %j as outside the grammar', (value) => {
    expect(evidenceReferenceError(value)).toBe('invalid')
  })

  it('requires a value', () => {
    expect(evidenceReferenceError('')).toBe('required')
    expect(evidenceReferenceError(' \t ')).toBe('required')
  })

  it('names credentials as the reason whatever the scheme', () => {
    expect(evidenceReferenceError('https://user:pw@jira.fawtir.om/SUP-1')).toBe('credentials')
    expect(evidenceReferenceError('ftp://user@files.fawtir.om/a.pdf')).toBe('credentials')
  })

  it('refuses control characters and overlong values', () => {
    expect(evidenceReferenceError('SUP-1200\nInjected: header')).toBe('invalid')
    expect(evidenceReferenceError(`https://jira.fawtir.om/${'a'.repeat(500)}`)).toBe('invalid')
  })
})

describe('evidenceReferenceError, Java semantics the console must not tighten', () => {
  it.each([
    // An authority Java parses as registry-based has no host: fine for evidence://, not https://.
    ['evidence://ticket_system/SUP-1200', null],
    ['https://ticket_system/SUP-1200', 'invalid'],
    // URI.scanIPv4Address takes leading zeros; a port is allowed, empty or not.
    ['https://010.0.0.1/evidence/1', null],
    ['https://jira.fawtir.om:8443/browse/SUP-1', null],
    ['https://jira.fawtir.om:/browse/SUP-1', null],
    // A dotted host's last label must open with a letter; a single numeric label is a hostname.
    ['https://host.123/x/y', 'invalid'],
    ['https://intranet/x/y', null],
    // Escapes must be hex pairs; non-ASCII letters are "other" characters, allowed in a path.
    ['https://jira.fawtir.om/a%2Fb', null],
    ['https://jira.fawtir.om/a%zz', 'invalid'],
    ['https://docs.fawtir.om/مستند-1', null],
    // Brackets are legal in a query but not in a path.
    ['https://jira.fawtir.om/search?ids=[1]', null],
    ['https://jira.fawtir.om/[1]', 'invalid'],
    // A fragment is allowed and does not count as a path.
    ['https://jira.fawtir.om/browse/SUP-1#comment-2', null],
    ['https://jira.fawtir.om/#frag', 'invalid'],
    // String.trim() keeps an em space, which Character.isWhitespace then refuses; the no-break
    // space it leaves out of whitespace is still refused by java.net.URI.
    ['SUP-1200\u2003', 'invalid'],
    ['SUP\u20031200', 'invalid'],
    ['https://jira.fawtir.om/a\u00a0b', 'invalid'],
    // A URN's NSS is any non-ASCII-whitespace run, the no-break space included.
    ['urn:isbn:978\u00a00', null],
    // A value with no ASCII letter or digit strips to the empty placeholder.
    ['\u00a0\u00a0', 'placeholder'],
    // Blank by Character.isWhitespace is required, not a placeholder.
    ['\u2003\u2003', 'required'],
    // Case-insensitive schemes and URN prefix.
    ['HTTPS://jira.fawtir.om/browse/SUP-1', null],
    ['URN:FAWTIR:ticket-1', null],
    // nid is 2-32 characters.
    ['urn:f:ticket-1', 'invalid'],
  ])('reads %j as %s', (value, problem) => {
    expect(evidenceReferenceError(value)).toBe(problem)
  })

  it('refuses any @ in a URI authority, the one agreed tightening', () => {
    // java.net.URI reports no user info for a registry-based authority, so the server would take
    // this; the console refuses a credential-shaped string regardless.
    expect(evidenceReferenceError('evidence://user@ticket_system/SUP-1200')).toBe('credentials')
  })

  it('trims only what String.trim() trims', () => {
    expect(javaTrim('\t SUP-1200 \n')).toBe('SUP-1200')
    expect(javaTrim('\u00a0SUP-1200')).toBe('\u00a0SUP-1200')
  })
})
