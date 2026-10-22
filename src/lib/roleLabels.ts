/**
 * The roles Fawtir itself ships (the server's `DefaultRoleCatalogue`), by code. Each has a
 * translated label under `sessionRoles.<CODE>`, so every screen names a built-in role the same way
 * in English and Arabic whatever the reader may list; a company's own roles keep the name it gave.
 */
export const BUILT_IN_ROLE_CODES = [
  'ADMIN',
  'FINANCE_MANAGER',
  'SALES_MANAGER',
  'ACCOUNTANT',
  'APPROVER',
  'VIEWER',
  'MOBILE_USER',
  'INTEGRATION',
] as const

/** The translation key of a built-in role's label, or null for any other code. */
export function builtInRoleKey(code: string): string | null {
  return (BUILT_IN_ROLE_CODES as readonly string[]).includes(code) ? `sessionRoles.${code}` : null
}

/**
 * A role as the reader sees it: a built-in role by its translated label, a company's own role by
 * the name it was given (a custom role may reuse a built-in code, so `systemRole` decides).
 */
export function roleLabel(
  role: { code: string; name: string; systemRole?: boolean },
  t: (key: string) => string,
): string {
  const key = builtInRoleKey(role.code)
  return key && role.systemRole !== false ? t(key) : role.name
}
