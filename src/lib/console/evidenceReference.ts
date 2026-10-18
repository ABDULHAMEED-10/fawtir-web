/**
 * The client mirror of the backend's `EvidenceReference.requireValid` (backend PR #643, runbook
 * §26.4): the reference an operator cites for a Participant ID decision. The backend states that a
 * change to its grammar is a contract change for this console, so this file follows it rule for
 * rule and in the same order, and is never stricter than it, with one agreed exception: any `@` in
 * a URI's authority is refused as a credential (see `evidenceReferenceError`).
 *
 * Java semantics are reproduced where JavaScript differs: `String.trim()` strips only characters up
 * to U+0020, `Character.isWhitespace` excludes the no-break spaces, and `java.net.URI` has its own
 * per-component character sets. A refusal here is a value the server would refuse as well.
 */

export const EVIDENCE_REFERENCE_MAX_LENGTH = 500
const EVIDENCE_REFERENCE_MIN_LENGTH = 6

export type EvidenceReferenceProblem = 'required' | 'invalid' | 'placeholder' | 'credentials'

/** `EvidenceReference.PLACEHOLDERS`, compared after lower-casing and dropping non-alphanumerics. */
const PLACEHOLDERS: ReadonlySet<string> = new Set([
  '', 'ok', 'okok', 'okay', 'x', 'xx', 'xxx', 'xxxx', 'na', 'none', 'null', 'nil',
  'tbd', 'tbc', 'todo', 'test', 'testing', 'dummy', 'fake', 'placeholder', 'sample',
  'example', 'evidence', 'ref', 'reference', 'see', 'attached', 'done', 'yes', 'no',
  'unknown', 'pending', 'asdf', 'abc', 'abc123', 'foo', 'bar', '123', '1234',
  '12345', '123456',
])

const TICKET = /^([A-Za-z][A-Za-z0-9]{1,19})-([0-9]{1,20})(?:-[A-Za-z0-9]{1,20}){0,4}$/
// Java's `\S` excludes only the six ASCII whitespace characters, all of which the whitespace check
// has already refused, so the NSS is "one or more of anything left".
const URN = /^urn:[a-z0-9][a-z0-9-]{1,31}:.+$/i
const CANONICAL_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const NIL_UUID = /^[0-]+$/
const URI_SCHEMES: ReadonlySet<string> = new Set(['https', 'evidence'])

/** `String.trim()`: only code units up to U+0020, unlike JavaScript's Unicode-aware `trim()`. */
export function javaTrim(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && value.charCodeAt(start) <= 0x20) start++
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end--
  return value.slice(start, end)
}

/** `Character.isISOControl`, as a code-unit test because the lint rule forbids it as a class. */
function isIsoControl(unit: number): boolean {
  return unit <= 0x1f || (unit >= 0x7f && unit <= 0x9f)
}

export function hasIsoControl(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    if (isIsoControl(value.charCodeAt(index))) return true
  }
  return false
}

/**
 * `Character.isWhitespace` for a value already free of control characters: the space separators
 * other than the no-break spaces U+00A0, U+2007 and U+202F, plus the line and paragraph separators.
 */
const JAVA_WHITESPACE = /[ \u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/

/** `String.isBlank` for a value whose ends `javaTrim` has already stripped. */
const JAVA_BLANK = /^[ \u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+$/

/** `Character.isSpaceChar`: every space, line or paragraph separator, no-break spaces included. */
const JAVA_SPACE_CHAR = /[ \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/

function isPlaceholder(value: string): boolean {
  return PLACEHOLDERS.has(value.toLowerCase().replace(/[^a-z0-9]/g, ''))
}

// java.net.URI's character classes (RFC 2396 plus its RFC 2732 brackets in `reserved`).
const UNRESERVED = "A-Za-z0-9\\-_.!~*'()"
const PATH_CHARS = new RegExp(`^[${UNRESERVED}:@&=+$,;/]$`)
const URIC_CHARS = new RegExp(`^[${UNRESERVED};/?:@&=+$,\\[\\]]$`)
const AUTHORITY_CHARS = new RegExp(`^[${UNRESERVED};:&=+$,@\\[\\]]$`)
const REGISTRY_CHARS = new RegExp(`^[${UNRESERVED}$,;:@&=+]$`)
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/
const HEX_PAIR = /^[0-9A-Fa-f]{2}$/

/**
 * `URI.scan` with `L_ESCAPED` in the mask: a `%` must start a hex pair (otherwise the whole URI is
 * malformed), and a code unit above U+0080 that is neither a space nor a control character is an
 * "other" character, allowed wherever an escape is. Returns false on any character `allowed`
 * rejects.
 */
function componentIsLegal(component: string, allowed: RegExp): boolean {
  for (let index = 0; index < component.length; index++) {
    const char = component[index]
    if (allowed.test(char)) continue
    if (char === '%') {
      if (!HEX_PAIR.test(component.slice(index + 1, index + 3))) return false
      index += 2
      continue
    }
    const unit = char.charCodeAt(0)
    if (unit > 0x80 && !JAVA_SPACE_CHAR.test(char) && !isIsoControl(unit)) continue
    return false
  }
  return true
}

/** `URI.scanIPv4Address`: four dot-separated digit runs, each at most 255; leading zeros allowed. */
function isIpv4(host: string): boolean {
  const octets = /^([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(host)
  return octets !== null && octets.slice(1).every((octet) => Number(octet) <= 255)
}
const HOST_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/

/** `URI.parseHostname`: alphanumeric labels with inner hyphens; a dotted name's last label opens with a letter. */
function isHostname(host: string): boolean {
  const labels = (host.endsWith('.') ? host.slice(0, -1) : host).split('.')
  if (!labels.every((label) => HOST_LABEL.test(label))) return false
  return labels.length === 1 || /^[A-Za-z]/.test(labels[labels.length - 1])
}

/**
 * The host of a server-based authority as `URI.parseServer` would find it, or null when Java falls
 * back to a registry-based authority (which has no host). Only called without an `@`, so there is no
 * user information to step over. An IPv6 literal is checked only for its brackets and alphabet: the
 * server decides the rest, so a malformed literal is let through rather than refused here.
 */
function serverHost(authority: string): string | null {
  let host = authority
  let port = ''
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']')
    if (close < 0 || !/^\[[0-9A-Fa-f:.]+(?:%[^\]]+)?\]$/.test(authority.slice(0, close + 1))) return null
    host = authority.slice(0, close + 1)
    const rest = authority.slice(close + 1)
    if (rest !== '' && !rest.startsWith(':')) return null
    port = rest.slice(1)
  } else {
    const colon = authority.indexOf(':')
    if (colon >= 0) {
      host = authority.slice(0, colon)
      port = authority.slice(colon + 1)
    }
    if (!isIpv4(host) && !isHostname(host)) return null
  }
  if (port !== '' && (!/^[0-9]+$/.test(port) || Number(port) > 2147483647)) return null
  return host
}

type ParsedUri = { scheme: string; authority: string | null; path: string; query: string | null }

/**
 * `new URI(value)` for a value that contains `://`, reduced to what the rules below read. Null when
 * Java would throw `URISyntaxException`. A URI that is not hierarchical with an authority is still
 * returned when it parses, with `authority` null, so the caller refuses it for the same reason the
 * server does.
 */
function parseUri(value: string): ParsedUri | null {
  // The scheme ends at the first ':' that comes before any '/', '?' or '#'.
  const delimiter = value.search(/[:/?#]/)
  if (delimiter <= 0 || value[delimiter] !== ':') return null
  const scheme = value.slice(0, delimiter)
  if (!SCHEME.test(scheme)) return null
  let rest = value.slice(delimiter + 1)

  const hash = rest.indexOf('#')
  if (hash >= 0) {
    if (!componentIsLegal(rest.slice(hash + 1), URIC_CHARS)) return null
    rest = rest.slice(0, hash)
  }
  if (!rest.startsWith('/')) {
    // Opaque: legal or not, it has no authority, and the scheme rules refuse it either way.
    return componentIsLegal(rest, URIC_CHARS) && rest !== '' ? { scheme, authority: null, path: '', query: null } : null
  }

  let authority: string | null = null
  if (rest.startsWith('//')) {
    const end = rest.slice(2).search(/[/?#]/)
    const raw = end < 0 ? rest.slice(2) : rest.slice(2, 2 + end)
    rest = end < 0 ? '' : rest.slice(2 + end)
    if (raw === '' && rest === '') return null
    if (raw !== '') {
      // With an IPv6 literal Java takes '%' as a zone-id separator, not as the start of an escape.
      const checked = raw.includes(']') ? raw.replace(/%/g, '') : raw
      if (!componentIsLegal(checked, AUTHORITY_CHARS)) return null
      // Brackets are not registry characters, so an authority with them must parse as a server.
      if (!componentIsLegal(raw, REGISTRY_CHARS) && !raw.includes('@') && serverHost(raw) === null) {
        return null
      }
      authority = raw
    }
  }

  const question = rest.indexOf('?')
  const path = question < 0 ? rest : rest.slice(0, question)
  const query = question < 0 ? null : rest.slice(question + 1)
  if (!componentIsLegal(path, PATH_CHARS)) return null
  if (query !== null && !componentIsLegal(query, URIC_CHARS)) return null
  return { scheme, authority, path, query }
}

/**
 * The URI branch of `requireValid`: a followable https:// or evidence:// link to a record.
 *
 * The one deliberate difference from the server: any `@` in the authority is refused as a
 * credential. Java reports user information only when the authority parses as server-based, so
 * `evidence://user@ho_st/x` would pass there; a credential-shaped string has no business in an
 * audit ledger that every export echoes, so the console refuses it anyway (agreed in PR #241).
 */
function uriProblem(value: string): EvidenceReferenceProblem | null {
  const uri = parseUri(value)
  if (uri === null) return 'invalid'
  if (uri.authority !== null && uri.authority.includes('@')) return 'credentials'
  const scheme = uri.scheme.toLowerCase()
  if (!URI_SCHEMES.has(scheme) || uri.authority === null) return 'invalid'
  if (scheme === 'https' && serverHost(uri.authority) === null) return 'invalid'
  // A bare host names a system, not the record in it.
  if (uri.path.length <= 1 && (uri.query === null || uri.query === '')) return 'invalid'
  if (uri.path.length > 1 && isPlaceholder(uri.path)) return 'placeholder'
  return null
}

/**
 * `EvidenceReference.requireValid`, step for step, applied to `javaTrim(value)` because that is
 * what `verificationRequestBody` sends: the server checks the value it receives.
 */
export function evidenceReferenceError(value: string): EvidenceReferenceProblem | null {
  const sent = javaTrim(value)
  if (sent === '' || JAVA_BLANK.test(sent)) return 'required'
  if (hasIsoControl(sent)) return 'invalid'
  if (sent.length > EVIDENCE_REFERENCE_MAX_LENGTH) return 'invalid'
  if (isPlaceholder(sent)) return 'placeholder'
  if (sent.length < EVIDENCE_REFERENCE_MIN_LENGTH || JAVA_WHITESPACE.test(sent)) return 'invalid'
  if (sent.includes('://')) return uriProblem(sent)
  if (URN.test(sent)) {
    return isPlaceholder(sent.slice(sent.indexOf(':', 4) + 1)) ? 'placeholder' : null
  }
  const ticket = TICKET.exec(sent)
  if (ticket) {
    return isPlaceholder(ticket[1]) || /^0+$/.test(ticket[2]) ? 'placeholder' : null
  }
  if (CANONICAL_UUID.test(sent)) return NIL_UUID.test(sent) ? 'placeholder' : null
  return 'invalid'
}
