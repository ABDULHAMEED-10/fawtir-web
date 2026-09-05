import { useEffect, useState } from 'react'

/** Below `md` — the width at which a phone stops being able to hold two of anything. */
const COMPACT = '(max-width: 47.999rem)'

/**
 * Whether the screen is phone-sized.
 *
 * Almost everything responsive in this app is expressed in `max-md:` classes and needs no
 * JavaScript at all. This is for the handful of places where CSS cannot reach — chiefly the
 * charts, which are drawn into a fixed SVG coordinate system, so their axis labels shrink with
 * the picture instead of staying readable.
 */
export function useCompact() {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT).matches,
  )

  useEffect(() => {
    const query = window.matchMedia(COMPACT)
    const sync = () => setCompact(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return compact
}
