/**
 * Whether a typed company name is the company's, compared as the server compares it (handover,
 * `CompanyOwnerService`; disconnection, `FawtirDisconnectionService.requireCompanyName`): NFKC,
 * trimmed, runs of space as one, any case. Blank never matches.
 */
export function sameCompanyName(typed: string, name: string): boolean {
  const normalise = (value: string) =>
    value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
  return normalise(typed) !== '' && normalise(typed) === normalise(name)
}
