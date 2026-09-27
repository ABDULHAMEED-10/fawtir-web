import { useEffect, useRef, type RefObject } from 'react'

/** True when the visitor asked the system for less motion; every effect here then settles at rest. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Reveals every `[data-reveal]` inside the root once it scrolls into view, by adding `is-in`.
 * One observer for the whole page; an element is revealed once and then left alone, so scrolling
 * back up never replays an entrance.
 */
export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const host = root.current
    if (!host) return
    const targets = Array.from(host.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      targets.forEach((el) => el.classList.add('is-in'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    )
    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [root])
}

/**
 * Writes how far an element has travelled through the viewport into its `--p` custom property:
 * 0 as its top enters from below, 1 as its bottom leaves at the top. Driven by one animation frame
 * per scroll, and by CSS alone after that, so nothing re-renders while the page scrolls.
 */
export function useScrollProgress<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.style.setProperty('--p', '0.5')
      return
    }
    let frame = 0
    const update = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      const span = window.innerHeight + rect.height
      const p = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / span))
      el.style.setProperty('--p', p.toFixed(4))
    }
    const request = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', request)
    return () => {
      window.removeEventListener('scroll', request)
      window.removeEventListener('resize', request)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])
  return ref
}

/** Lets a card's highlight follow the pointer through `--mx` / `--my`, in pixels from its corner. */
export function trackPointer(event: React.PointerEvent<HTMLElement>) {
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${event.clientX - rect.left}px`)
  el.style.setProperty('--my', `${event.clientY - rect.top}px`)
}
