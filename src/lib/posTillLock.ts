import { useEffect, useSyncExternalStore } from 'react'

/*
 * One tab per till sells on this device, online and offline (DES43 Q-25 option (iv), FR-2, R-TABS;
 * XT-2, rev 4.7 D.3, owner OA:2673).
 *
 * Two tabs of one till each read the counter and the queue and could print the same number: the
 * counter is reserved before the awaits (R-TABS) and the queue is saved by compare-and-set
 * (POS-MEMQ), but neither stops two tabs numbering at the same moment. Nor does either stop one tab
 * printing k offline while another tab's online sale is being issued k by the server. A tab
 * therefore sells at all, online or offline, only while it holds the till's exclusive Web Lock
 * (`navigator.locks`), which the browser grants to one holder at a time across the tabs and windows
 * of this origin. Inside the holder, posQueue's in-tab section keeps its own online and offline
 * sales from overlapping.
 *
 * What this is not: Web Locks are per browser profile and origin, so this does nothing for a second
 * device, another browser or profile on the same device, or storage that fails (POS-MEMQ). The
 * server's numbering checks (POS_TILL_NUMBER_GAP, POS_TILL_NUMBER_REPEATED) stay the only
 * protection across devices and must never be relaxed on the strength of this lock.
 *
 * Fail closed (OQ-XT2-LOCKSTATES, OA:2771): no `navigator.locks` (an old browser, or a page that is
 * not a secure context), a request that throws or is rejected, a lock taken away after the grant, a
 * lock another tab holds, or an answer that does not come in time, all leave this tab without the
 * lock, and a sale, online or offline, is refused before any request is sent or number taken.
 *
 * The request is always `ifAvailable`, never `steal`: taking the lock from a tab that may be halfway
 * through numbering a sale is exactly the overlap this prevents, so there is no "use this tab"
 * takeover. A tab gets the lock only once the holder has let go of it (closed, moved to another
 * till, signed out), and the holder lets go only after its sales in flight are numbered and saved.
 */
/**
 * `finishing`: this same tab let the lock go (a till screen remounted, a till change and back) while
 * a sale was still being numbered under it, so the browser still holds it for that sale. It is
 * asked for again as soon as that sale ends. Fail closed meanwhile, but not "another tab", which
 * would be untrue (IMPL2-T1).
 */
export type TillLockState = 'pending' | 'held' | 'otherTab' | 'unsupported' | 'released' | 'finishing'

/**
 * How long a sale waits for a lock request to be answered. An `ifAvailable` request is answered at
 * once by a working browser, so this only ends a wait that would otherwise never end; it then
 * counts as not held, and the sale is refused (R47-9).
 */
export const LOCK_WAIT_MS = 5_000

/**
 * Till ids are server UUIDs, unique across tenants, so the till id alone names one till; nothing
 * of the tenant or the person is needed in the name.
 */
const lockName = (tillId: string) => `fawtir.pos.till.${tillId}`

type Holding = {
  state: TillLockState
  /** Mounted till screens that want the lock. */
  refs: number
  /** Taken by an offline sale with no till screen mounted; held until a release. */
  sticky: boolean
  /** Sales between `beginNumbering` and their end: the lock is not let go under them. */
  inFlight: number
  /** The pending request's answer, shared by everyone who asks meanwhile. */
  answer: Promise<TillLockState> | null
  /** Ends the lock callback, which hands the lock back to the browser. */
  letGo: (() => void) | null
  /** Settles once the browser has the lock back from this holding's request. */
  released: Promise<void> | null
}

const holdings = new Map<string, Holding>()
/** Holdings this tab let go of while a sale was in flight: the browser lock is still theirs. */
const draining = new Map<string, Holding>()
const lockListeners = new Set<() => void>()

function setState(holding: Holding, state: TillLockState) {
  if (holding.state === state) return
  holding.state = state
  lockListeners.forEach((listener) => listener())
}

function lockManager(): LockManager | null {
  if (typeof navigator === 'undefined') return null
  const locks = (navigator as { locks?: LockManager }).locks
  return locks && typeof locks.request === 'function' ? locks : null
}

function handBack(holding: Holding) {
  if (holding.inFlight > 0 || !holding.letGo) return
  const letGo = holding.letGo
  holding.letGo = null
  letGo()
}

function request(tillId: string, holding: Holding): Promise<TillLockState> {
  const locks = lockManager()
  if (!locks) {
    setState(holding, 'unsupported')
    return Promise.resolve('unsupported')
  }
  setState(holding, 'pending')
  const answer = new Promise<TillLockState>((settle) => {
    let answered = false
    const answerWith = (state: TillLockState) => {
      setState(holding, state)
      if (!answered) {
        answered = true
        settle(state)
      }
    }
    try {
      holding.released = locks
        .request(lockName(tillId), { mode: 'exclusive', ifAvailable: true }, (lock) => {
          if (!lock) {
            const earlier = draining.get(tillId)
            if (!earlier) {
              answerWith('otherTab')
              return undefined
            }
            answerWith('finishing')
            void earlier.released?.then(() => {
              // Once only, however many asked while finishing: a second request would find the lock
              // taken by the first and wrongly answer "another tab".
              const wanted = holding.refs > 0 || holding.sticky
              const asking = holding.state === 'held' || (holding.answer && holding.state === 'pending')
              if (holdings.get(tillId) === holding && wanted && !asking) void request(tillId, holding)
            })
            return undefined
          }
          // Released while the request was pending (the screen went, a sign-out): handed back at once.
          if (holdings.get(tillId) !== holding || (holding.refs <= 0 && !holding.sticky)) {
            answerWith('released')
            return undefined
          }
          answerWith('held')
          return new Promise<void>((letGo) => {
            holding.letGo = letGo
          })
        })
        .catch(() => {
          // Rejected before a grant (the browser refused it), or the lock was taken from this tab
          // after one (another context stole it): either way exclusivity is no longer known.
          holding.letGo = null
          answerWith(answered ? 'otherTab' : 'unsupported')
        })
        .then(() => undefined)
    } catch {
      answerWith('unsupported')
    }
  })
  holding.answer = answer
  void answer.then(() => {
    if (holding.answer === answer) holding.answer = null
  })
  return answer
}

function newHolding(): Holding {
  return {
    state: 'pending',
    refs: 0,
    sticky: false,
    inFlight: 0,
    answer: null,
    letGo: null,
    released: null,
  }
}

function letGoOf(tillId: string) {
  const holding = holdings.get(tillId)
  if (!holding) return
  holdings.delete(tillId)
  holding.refs = 0
  holding.sticky = false
  setState(holding, 'released')
  if (holding.inFlight > 0 && holding.letGo) {
    draining.set(tillId, holding)
    void holding.released?.then(() => {
      if (draining.get(tillId) === holding) draining.delete(tillId)
    })
  }
  handBack(holding)
}

/** A till screen wants the lock while it is mounted; the returned function gives up its claim. */
export function acquireTillLock(tillId: string): () => void {
  let holding = holdings.get(tillId)
  if (!holding) {
    holding = newHolding()
    holdings.set(tillId, holding)
  }
  const mine = holding
  mine.refs += 1
  if (mine.state !== 'held' && !mine.answer) void request(tillId, mine)
  let given = false
  return () => {
    if (given) return
    given = true
    mine.refs -= 1
    if (mine.refs <= 0 && holdings.get(tillId) === mine) letGoOf(tillId)
  }
}

/**
 * Whether this tab holds the till's lock, asking for it if it does not. A sale, online or offline,
 * asks before anything is sent or numbered; asking again after another tab let go is how this tab
 * takes over, never by force. An answer that has not come within `LOCK_WAIT_MS` reads `pending`,
 * which is not `held`, so the sale is refused; the request itself is left to settle the state.
 */
export function ensureTillLock(tillId: string): Promise<TillLockState> {
  let holding = holdings.get(tillId)
  if (!holding) {
    holding = newHolding()
    holdings.set(tillId, holding)
  }
  holding.sticky = holding.sticky || holding.refs <= 0
  if (holding.state === 'held') return Promise.resolve('held')
  const answer = holding.answer ?? request(tillId, holding)
  return new Promise((settle) => {
    const timer = setTimeout(() => settle('pending'), LOCK_WAIT_MS)
    void answer.then((state) => {
      clearTimeout(timer)
      settle(state)
    })
  })
}

/** "Check again" on the till screen: asks once more, without taking the lock from anyone. */
export function checkTillLockAgain(tillId: string): Promise<TillLockState> {
  return ensureTillLock(tillId)
}

/**
 * Marks a sale as numbering under the lock, synchronously, right before its number is taken
 * offline or its request is sent online. Null when this tab does not hold the lock now. Until the
 * returned end runs, a release keeps the lock, so a handover can never let another tab number
 * while this sale is still being kept or filed.
 */
export function beginNumbering(tillId: string): (() => void) | null {
  const holding = holdings.get(tillId)
  if (!holding || holding.state !== 'held') return null
  holding.inFlight += 1
  let ended = false
  return () => {
    if (ended) return
    ended = true
    holding.inFlight -= 1
    if (holding.state !== 'held') handBack(holding)
  }
}

export function tillLockState(tillId: string): TillLockState {
  return holdings.get(tillId)?.state ?? 'released'
}

/** Sign-out and page unload: every till lock goes, each once its sales in flight are kept. */
export function releaseTillLocks() {
  for (const tillId of [...holdings.keys()]) letGoOf(tillId)
}

/** For a store that answers from the lock state too (posQueue's selling gate). */
export function subscribeTillLocks(listener: () => void): () => void {
  lockListeners.add(listener)
  return () => {
    lockListeners.delete(listener)
  }
}

/** The till screens hold the lock while mounted on `tillId`, and let it go on a till change. */
export function useTillLock(tillId: string | null): TillLockState {
  useEffect(() => (tillId ? acquireTillLock(tillId) : undefined), [tillId])
  return useSyncExternalStore(subscribeTillLocks, () =>
    tillId ? tillLockState(tillId) : 'released',
  )
}

if (typeof window !== 'undefined') {
  // The browser also releases a closed document's locks; this lets go as the page leaves. A page
  // kept in the back-forward cache keeps its lock, as it keeps its till screen.
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) releaseTillLocks()
  })
}

/** Thrown before any request or number when this tab may not sell on the till. */
export class PosTillLockUnavailable extends Error {
  readonly reason: Exclude<TillLockState, 'held'>

  constructor(reason: Exclude<TillLockState, 'held'>) {
    super(`This tab may not sell on this till (${reason})`)
    this.name = 'PosTillLockUnavailable'
    this.reason = reason
  }
}
