/**
 * "Save as a draft" on Settings › Add a branch (E39, owner 23 Oct 2026: keep the button and make it
 * save).
 *
 * The draft is the unfinished form, kept in this browser for this company and this person, and put
 * back when Add a branch is opened again. It is deliberately not a branch on the server: a branch
 * the server holds is counted toward the plan's branches (Business Rules BR-1, BR-3), and the rules
 * have no branch that is held but not counted. Nothing is sent, created or charged until "Add the
 * branch". Adding the branch forgets the draft.
 *
 * Storage can be missing (a private window, blocked site data); the draft then lasts no longer than
 * the page, and the form still works.
 */
export type BranchDraft = {
  name: string
  arabicName: string
  street: string
  town: string
  postalCode: string
  governorate: string
  phone: string
  numbering: 'own' | 'shared'
  prefix: string
  behaviour: string[]
}

const PREFIX = 'fawtir.branchDraft'

/** One draft per company and person, so a shared browser never offers someone else's. */
export function branchDraftKey(
  tenantId: string | null | undefined,
  userId: string | null | undefined,
) {
  return `${PREFIX}.${tenantId ?? '-'}.${userId ?? '-'}`
}

/** Nothing typed: the switches alone are not a draft worth keeping. */
export function isEmptyBranchDraft(draft: BranchDraft): boolean {
  return [
    draft.name,
    draft.arabicName,
    draft.street,
    draft.town,
    draft.postalCode,
    draft.governorate,
    draft.phone,
    draft.prefix,
  ].every((value) => !value.trim())
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

export function readBranchDraft(key: string): BranchDraft | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const stored = JSON.parse(raw) as Record<string, unknown>
    const draft: BranchDraft = {
      name: text(stored.name),
      arabicName: text(stored.arabicName),
      street: text(stored.street),
      town: text(stored.town),
      postalCode: text(stored.postalCode),
      governorate: text(stored.governorate),
      phone: text(stored.phone),
      numbering: stored.numbering === 'shared' ? 'shared' : 'own',
      prefix: text(stored.prefix).toUpperCase().slice(0, 4),
      behaviour: Array.isArray(stored.behaviour)
        ? stored.behaviour.filter((id): id is string => typeof id === 'string')
        : [],
    }
    return isEmptyBranchDraft(draft) ? null : draft
  } catch {
    return null
  }
}

/** Saves the draft; an empty one removes whatever was kept. */
export function saveBranchDraft(key: string, draft: BranchDraft): void {
  if (isEmptyBranchDraft(draft)) {
    forgetBranchDraft(key)
    return
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Storage blocked: nothing to keep it in.
  }
}

export function forgetBranchDraft(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing stored.
  }
}
