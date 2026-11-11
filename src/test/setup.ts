import { beforeEach } from 'vitest'
import { configure } from '@testing-library/react'
import { resetCompanyContact } from '../lib/companyContact'
import { releaseTillLocks } from '../lib/posTillLock'
import { fakeLocks, installLocks } from './fakeLocks'

// Fawtir's contact details are read once per page load (`lib/companyContact.ts`). A test is a page
// load of its own: without this the first test in a file answers every later one from its stubs.
beforeEach(() => resetCompanyContact())

// POS-TABLOCK: a till numbers offline sales only while it holds the till's Web Lock, and jsdom has
// no `navigator.locks`. Each test is a fresh browser: a new lock manager, and no lock this module
// instance still thinks it holds from the test before.
beforeEach(() => {
  releaseTillLocks()
  if (typeof window !== 'undefined') installLocks(fakeLocks())
})

// `findByRole` walks the accessibility tree of the whole screen — the console shell's sidebar
// included — and under the full suite's parallel load that took longer than Testing Library's
// 1 s default, failing a different handful of console tests on each run. The wait still ends as
// soon as the element appears; only a genuinely missing element now takes 5 s to fail.
configure({ asyncUtilTimeout: 5_000 })

// jsdom implements no media queries, and `useCompact` — which every chart uses to pick a
// breakpoint — calls `window.matchMedia` without a guard for its absence. Unstubbed, rendering
// any chart throws inside the component and the test reads as "element not found" rather than as
// the TypeError it is. Reports the widest layout, which is what a chart assumes by default.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom implements no layout, so it has nothing to scroll and leaves
// `Element.prototype.scrollIntoView` entirely undefined rather than a no-op. A component that
// calls it unguarded when an error banner needs carrying into view (CreateInvoicePage's F1 fix)
// throws "is not a function" from inside a passive effect, and the failure is reported against
// an unrelated assertion elsewhere in the same test run rather than the effect that threw.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}
