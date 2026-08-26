/**
 * The palette and axis rule the Reports charts share.
 *
 * Kept apart from `charts.tsx` so that file exports only components, which is what fast refresh
 * needs to reload a chart without losing the page around it.
 */

/** The colours the design draws series in. */
export const SERIES = {
  strong: '#2c4eb7',
  soft: '#b9c4e8',
  softer: '#d5dcf1',
  grey: '#d6d8dd',
  green: '#4c6c5a',
  greenSoft: '#cfdcd4',
  brown: '#6d5a39',
  brownSoft: '#d8cdb8',
  rose: '#e7b9b1',
}

/**
 * Rounds an axis maximum up to something that divides cleanly.
 *
 * Figma's own maxima (24,633 · 17,026 · 7,788) are the data's peak plus a fifth, printed
 * unrounded, so the same rule is applied here rather than the numbers being copied.
 */
export function axisMax(values: number[], factor = 1.18) {
  const peak = Math.max(...values, 0)
  return peak === 0 ? 1 : peak * factor
}
