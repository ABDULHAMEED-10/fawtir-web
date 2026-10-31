import { useEffect, useState } from 'react'

/** The gateway waits 120 seconds for the upload; the bar fills towards that and never quite ends. */
const READ_BUDGET_SECONDS = 120

/**
 * Seconds since `running` turned true, ticking once a second, and 0 while it is false. The
 * upload waits for the document reader, so the person sees time passing instead of a frozen box.
 */
export function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) {
      setSeconds(0)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [running])
  return seconds
}

/** The share of the reading budget used, held below 95% until the answer comes. */
export function readingPercent(seconds: number): number {
  return Math.min(95, Math.round((seconds / READ_BUDGET_SECONDS) * 100))
}
