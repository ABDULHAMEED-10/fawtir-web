import { configure } from '@testing-library/react'

// `findByRole` walks the accessibility tree of the whole screen — the console shell's sidebar
// included — and under the full suite's parallel load that took longer than Testing Library's
// 1 s default, failing a different handful of console tests on each run. The wait still ends as
// soon as the element appears; only a genuinely missing element now takes 5 s to fail.
configure({ asyncUtilTimeout: 5_000 })
