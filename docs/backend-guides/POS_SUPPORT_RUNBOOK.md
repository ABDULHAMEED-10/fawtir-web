# POS support runbook (web)

Support steps for states of the till that the web cannot clear by itself. Each entry says what the
cashier sees, why it happens, and what support may and may not do. This file covers the web only;
the server's own procedures are in the backend runbooks.

## 1. Selling stopped: "one number could not be kept" (burnt number)

**Authority.** RELEASE-LIMITATIONS-RC5 §10.1 is the RC5 interim POS runbook. This entry applies its
part 3 to a burnt number and adds nothing that releases one.

**What the cashier sees.** "Selling is stopped on this till: one number could not be kept, and
none was printed." and "Checking again or an online sale does not clear this. This till cannot be
used for now: sell on another till and ask your manager to escalate." Both offline and online
selling are refused on that till, on that device.

**Why.** An offline sale took the till's next number. The browser then failed to save the sale
and also failed to roll the counter back. No receipt carries that number, but the device's counter
has passed it ("burnt"). Owner decision OQ-W1 says such a number is never reused, released or
silently skipped. The server's audited gap fence for it (DES43) is not built yet. Until it is, the
device keeps a marker so that a reload does not lift the block (D-2 option (b), owner v2 K24).

The marker is one localStorage entry in that browser:
`fawtir.pos.burnt.<tillId>`, value `{"prefix": "<series prefix>", "value": <number>}`.

The marker is the till's fail-closed blocker (owner decision on burnt numbers, item 6). It is
**not** a fault to be cleared. While the server has no fence for the burnt number, the server
would hand that number to the next online sale on this till, from any device. A device without the
marker could also print it again, or skip it so that later sales stall.

**There is no RC5 support action that releases a burnt number.** Do not delete, edit or rename
`fawtir.pos.burnt.<tillId>`. Do not use "Clear site data", "Clear storage", "Clear browsing data",
a reinstall or a profile reset. The till resumes only through the server's audited burn fence
(DES43), when it ships. There is deliberately no "clear" button in the app (review WB6-2, W7R-1).

**Steps:**

1. **Stop selling on this till, on every device.** No other device, browser profile or integration
   may sell on this till, online or offline, until the burnt number is resolved by the server's
   audited procedure (§10.1 part 3 step 1). Other tills are not affected.
2. **Sell on another till** (§10.1 part 3 step 2).
3. **Let the already-numbered sales go.** Bring the device online and let its queue send. Sending
   and retrying sales already numbered stays allowed on the blocked till. A refused sale is handled
   under §10.1 parts 1 to 4 (never ask the customer to pay again). A sale held for validation is not
   a §10.1 case: find it on the Held sales screen, record it on the ticket and escalate. If the queue
   cannot be emptied, keep the device whole and export `fawtir.pos.queue` read-only into the
   ticket's secure attachment (§10.1 part 3 steps 3 and 4). It is tenant data: never paste it into
   chat or logs.
4. **Record the burnt number without changing anything.** In developer tools, *read* (do not delete)
   the marker's `prefix` and `value`. Record them on the ticket with company, branch, till, device
   and browser profile, and the date and time, as "burnt: never printed, not filed, blocked on
   device". Record the queue state from step 3.
5. **Notify the branch manager and escalate** under the RC5 till-number-stall release blocker
   (DES43), with the step 4 record (§10.1 part 3 steps 5 and 10).
6. **If the screen reports a storage failure as well,** do not attempt any repair on the device.
   Escalate.

## Release notes

- POS (D-2, K24): a till that cannot keep an offline number stays stopped, also after a reload.
  Sell on another till and escalate. There is no support action that releases it in RC5. The
  server's audited burn fence (DES43) is the fix.
