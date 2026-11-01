import type { PersonGrant } from '../api/settings/branchAccess'
import type { RoleDto } from '../api/settings/people'

/**
 * The discount a person may give at the till: `pos.sell` held under MAX_PERCENT (backend
 * `ManualDiscountCeiling`, refused as DISCOUNT_ABOVE_LIMIT). A person's own grant replaces their
 * role's limit (`PermissionOverride`, RL-2); several roles resolve as the server resolves them:
 * any unlimited grant wins, otherwise the highest ceiling.
 *
 * The server is authoritative and checks every sale; this only shows what is configured and lets
 * an owner set one person's ceiling. A ceiling already stored is sent back as it is unless it is
 * edited, so a save of other permissions never overwrites it.
 */
export const POS_SELL = 'pos.sell'

/** A ceiling in percent, or null for no limit. */
export type SellLimit = number | null

/** What the person's roles set; undefined when the roles were not read or do not grant it. */
export function roleSellLimit(roles: RoleDto[], held: string[]): SellLimit | undefined {
  const grants = roles
    .filter((role) => held.includes(role.code))
    .flatMap((role) => role.permissions ?? [])
    .filter((grant) => grant.code === POS_SELL)
  if (!grants.length) return undefined
  if (grants.some((grant) => grant.qualifier === null)) return null
  const ceilings = grants
    .filter((grant) => grant.qualifier === 'MAX_PERCENT' && grant.value != null)
    .map((grant) => Number(grant.value))
  return ceilings.length ? Math.max(...ceilings) : null
}

/** The person's own ceiling; undefined when they hold no own grant of `pos.sell`. */
export function ownSellLimit(grants: PersonGrant[]): SellLimit | undefined {
  const own = grants.find((grant) => grant.code === POS_SELL)
  if (!own) return undefined
  return own.qualifier === 'MAX_PERCENT' && own.value != null ? Number(own.value) : null
}

/**
 * A typed ceiling: blank is "as their role sets it", otherwise above 0 and at most 100 with at
 * most two decimals (the server's PermissionQualifier bounds; the till's refusal prints two).
 */
export function parseSellLimit(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return 'invalid'
  const value = Number(trimmed)
  return value > 0 && value <= 100 ? value : 'invalid'
}

/**
 * The grants to save with the person's own `pos.sell` ceiling set (`limit` a number) or removed
 * (`limit` null). Removing it keeps a plain grant when the role does not give `pos.sell`, so the
 * person keeps the right itself; when the role does, its own limit applies again.
 */
export function withSellLimit(
  grants: PersonGrant[],
  limit: number | null,
  fromRole: boolean,
): PersonGrant[] {
  const others = grants.filter((grant) => grant.code !== POS_SELL)
  if (limit != null) return [...others, { code: POS_SELL, qualifier: 'MAX_PERCENT', value: limit }]
  return fromRole ? others : [...others, { code: POS_SELL, qualifier: null, value: null }]
}
