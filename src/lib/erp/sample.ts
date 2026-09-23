/**
 * Reading a sample payload the tenant supplied, for the source-path picker.
 *
 * Moved here from the design mock so that "no mapping screen depends on `lib/erpMapping.ts` at
 * runtime" is a claim a grep can settle. These are pure functions over a document the reader
 * pasted in this browser — they list what paths a payload contains. They do not transform anything
 * towards the canonical model, which is the engine's job and stays there.
 */

export type SampleKey = {
  path: string
  example: string
  type: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'
}

/** Every path the picker can offer, flattened from a sample; `[]` marks a repeated element. */
export function flattenKeys(payload: unknown, prefix = ''): SampleKey[] {
  if (payload === null || typeof payload !== 'object') return []
  const out: SampleKey[] = []
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (Array.isArray(value)) {
      out.push({ path: `${path}[]`, example: `${value.length} items`, type: 'array' })
      out.push(...flattenKeys(value[0], `${path}[]`))
    } else if (value !== null && typeof value === 'object') {
      out.push(...flattenKeys(value, path))
    } else {
      out.push({
        path,
        example: value === null ? 'null' : String(value),
        type: value === null ? 'null' : (typeof value as SampleKey['type']),
      })
    }
  }
  return out
}

/**
 * A sample held for this visit only.
 *
 * Nothing stores a sample payload — see `SAMPLES` in `UNSUPPORTED_CAPABILITIES`. A sample is still
 * useful for a dry run or a certification run, so the screens keep one in memory and say plainly
 * that it will not survive a reload, rather than offering a Save that silently does nothing.
 */
export type SessionSample = {
  id: string
  label: string
  payload: unknown
  byteSize: number
  addedAt: Date
}

let sequence = 0

export function sessionSample(label: string, payload: unknown): SessionSample {
  sequence += 1
  return {
    id: `session-${sequence}`,
    label,
    payload,
    byteSize: new TextEncoder().encode(JSON.stringify(payload)).length,
    addedAt: new Date(),
  }
}

/**
 * The samples this visit is holding, shared by every mapping screen.
 *
 * Module-level rather than per-screen so a sample added on Samples is the one Preview and Fields
 * offer, which is what a reader expects. In memory only, and deliberately not in `localStorage`:
 * a payload is tenant business data, and persisting it in the browser would store invoice contents
 * somewhere nothing in Fawtir's retention or encryption policy reaches.
 */
let samples: SessionSample[] = []
const listeners = new Set<() => void>()

function publish(next: SessionSample[]) {
  samples = next
  listeners.forEach((listener) => listener())
}

export const sessionSamples = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  snapshot(): SessionSample[] {
    return samples
  },
  add(label: string, payload: unknown): SessionSample {
    const created = sessionSample(label, payload)
    publish([created, ...samples])
    return created
  },
  remove(id: string) {
    publish(samples.filter((sample) => sample.id !== id))
  },
  clear() {
    publish([])
  },
}
