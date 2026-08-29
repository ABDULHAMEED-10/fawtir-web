import { useState } from 'react'

/**
 * Zoom, print and fullscreen for a document preview pane.
 *
 * The credit-note and debit-note detail screens draw their toolbars differently — one is a 62px
 * white bar, the other sits on the card surface — so the behaviour lives here and each screen
 * keeps its own chrome. Before this, neither toolbar's buttons did anything.
 */

/** The steps the zoom buttons walk through, as percentages. */
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200]

export function useDocumentPreview() {
  const [stepIndex, setStepIndex] = useState(ZOOM_STEPS.indexOf(100))
  const [fullscreen, setFullscreen] = useState(false)

  const step = (direction: -1 | 1) =>
    setStepIndex((index) => Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction)))

  return {
    zoom: ZOOM_STEPS[stepIndex],
    zoomIn: () => step(1),
    zoomOut: () => step(-1),
    canZoomIn: stepIndex < ZOOM_STEPS.length - 1,
    canZoomOut: stepIndex > 0,
    fullscreen,
    openFullscreen: () => setFullscreen(true),
    closeFullscreen: () => setFullscreen(false),
    print: () => window.print(),
  }
}
