/**
 * The shape every PINT-OM code list entry shares (HS codes, CL-12-OM service types, ISIC
 * activities): a code and a name in both languages. The lists themselves are placeholder subsets
 * until the backend serves the full ones through `GET /v1/code-lists/*?q=`.
 */
export type CodeListEntry = { code: string; en: string; ar: string }

/** The entry's name in the interface language. */
export function nameOf(entry: CodeListEntry, language: string): string {
  return language.startsWith('ar') ? entry.ar : entry.en
}

/** The entry with this code, if the list carries it. */
export function findCode<T extends CodeListEntry>(list: readonly T[], code: string | undefined) {
  return code ? list.find((entry) => entry.code === code) : undefined
}
