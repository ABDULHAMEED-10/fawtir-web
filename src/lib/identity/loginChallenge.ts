import { requestLoginCode, type LoginChallenge } from './login'

/**
 * Held in module memory only, never in storage or router state (which the browser persists with
 * the history entry): for its five minutes the challenge is a credential, and a reload that loses
 * it should restart sign-in rather than resume it from somewhere any script can read.
 */
let held: LoginChallenge | null = null

export function holdLoginChallenge(challenge: LoginChallenge): void {
  held = challenge
}

export function readLoginChallenge(now = Date.now()): LoginChallenge | null {
  if (held && now >= held.expiresAt) held = null
  return held
}

export function dropLoginChallenge(): void {
  held = null
}

const firstCodes = new WeakMap<LoginChallenge, Promise<number>>()

/**
 * The code screen asks for its first code as it opens. Shared per challenge because a second
 * request would replace the code already emailed: StrictMode's double effect in development, or
 * Back then Forward, must not leave the user holding a code that no longer works. Resolves with
 * the time the code was sent. A failure is forgotten so a later visit tries again.
 */
export function requestFirstLoginCode(challenge: LoginChallenge): Promise<number> {
  let pending = firstCodes.get(challenge)
  if (!pending) {
    pending = requestLoginCode(challenge).then(
      () => Date.now(),
      (error: unknown) => {
        firstCodes.delete(challenge)
        throw error
      },
    )
    firstCodes.set(challenge, pending)
  }
  return pending
}
