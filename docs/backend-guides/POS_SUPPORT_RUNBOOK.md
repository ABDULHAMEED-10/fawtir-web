# POS support runbook (web)

Support steps for states of the till that the web cannot clear by itself. Each entry says what the
cashier sees, why it happens, and what support may do. This file covers the web only; the
server's own procedures are in the backend runbooks.

## 1. Selling stopped: "one number could not be kept" (burnt number)

**What the cashier sees.** "Selling is stopped on this till: one number could not be kept, and
none was printed." and "Checking again or an online sale does not clear this. Ask your manager or
support before selling on this till again." Both offline and online selling are refused on that
till, on that device. Other tills, and the same till on another device, are not affected.

**Why.** An offline sale took the till's next number. The browser then failed to save the sale
and also failed to roll the counter back. No receipt carries that number, but the device's counter
has passed it ("burnt"). Owner decision OQ-W1 says such a number is never reused, released or
silently skipped. The server's audited gap fence for it (DES43) is not built yet. Until it is, the
device keeps a marker so that a reload does not lift the block (D-2 option (b), owner v2 K24).

The marker is one localStorage entry in that browser:
`fawtir.pos.burnt.<tillId>`, value `{"prefix": "<series prefix>", "value": <number>}`.

**There is deliberately no "clear" button in the app.** Clearing must be audited, and that audited
path comes with the server's burn fence (review WB6-2). Until then, only support clears it, by hand,
with the steps below.

**Steps, in this order:**

1. **Flush or export the queue first.** Bring the device online and let the till send its queued
   sales: the queue panel and Today must show nothing waiting. If something cannot go (refused,
   held, too large to send), do not continue until that sale is resolved, or at least exported.
   To export, copy the value of the localStorage entry `fawtir.pos.queue` from the browser's
   developer tools (Application → Local Storage) into the support ticket's secure attachment. It is
   tenant data: never paste it into chat or logs.
2. **Remove only `fawtir.pos.burnt.<tillId>`**, for the till that is stopped, in developer tools
   (Application → Local Storage → the entry → Delete).
   - **Never use "Clear site data", "Clear storage" or the browser's "Clear browsing data".** They
     also delete the queue, which holds sales that are not on the server yet. Those sales would be
     lost, and their printed numbers would become real gaps.
   - Do not remove or edit any other `fawtir.pos.*` entry. In particular, leave the counters
     `fawtir.pos.next.*` alone.
3. **Record the gap.** Before deleting, copy the marker's prefix and value, which together are the
   burnt number. Record it in the support ticket against the company, branch, till and device, with
   the date and time. That number was never printed. With the marker gone, nothing on this device
   stops the server from giving the number out again (a later sale may then carry it). That is the
   "reused" case K24 names, so the record is the only trace until the DES43 fence exists.
4. Reload the till page. Selling should resume. If the screen stops again with the same message,
   storage on that device is failing: do not repeat these steps. Escalate.

## Release notes

- POS (D-2, K24): a till that cannot keep an offline number now stays stopped after a reload,
  instead of selling again. Support clears it by hand per this runbook (entry 1) until the
  server's audited burn fence arrives.
