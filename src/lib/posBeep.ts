/**
 * A short error beep for a scan that found nothing, made with Web Audio (no sound file). The till
 * has no sound setting of its own, so `muted` is the caller's to pass when one is added. A browser
 * that blocks audio (no user gesture yet, no Web Audio) leaves it silent; nothing is thrown.
 */

type AudioContextClass = typeof AudioContext

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (context) return context
  const Ctor: AudioContextClass | undefined =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext)
  if (!Ctor) return null
  context = new Ctor()
  return context
}

export function playErrorBeep({ muted = false }: { muted?: boolean } = {}): void {
  if (muted) return
  try {
    const ctx = audio()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'square'
    oscillator.frequency.value = 220
    const start = ctx.currentTime
    // Low and short, with a quick fade so it does not click: about 0.18 s.
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.2)
  } catch {
    // Audio blocked or unavailable: the message on screen is enough.
  }
}
