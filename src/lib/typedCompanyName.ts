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

/**
 * Whether a typed name is any of the company's names (the server accepts the English legal name,
 * the trading name and the Arabic legal name alike). Blank or absent names are skipped; with no
 * name to compare at all, any text that is not blank is taken and the server decides.
 */
export function typedOneOfCompanyNames(
  typed: string,
  names: readonly (string | null | undefined)[],
): boolean {
  const known = names.filter((name): name is string => Boolean(name?.trim()))
  if (known.length === 0) return typed.trim() !== ''
  return known.some((name) => sameCompanyName(typed, name))
}
