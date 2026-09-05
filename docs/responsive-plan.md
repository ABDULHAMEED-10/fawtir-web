# Making Fawtir responsive — plan

**Status:** plan only, nothing implemented yet.
**Scope:** all 119 routes / 144 page files / 45 shared components.
**Hard constraint:** the large-screen design does not change. Not by a pixel.

---

## 1. The rule that comes before everything else

Every technique below is chosen to make "desktop cannot drift" a _mechanical_ guarantee rather than
a promise.

### 1.1 Write downward, never rewrite upward

Tailwind is mobile-first: `p-4` applies at every width, `xl:p-8` applies from 1280px up. The
tempting way to make an app responsive is to demote the current desktop classes into `xl:` variants
and put phone values in the base. **We will not do that.** It rewrites the class list of every
element that matters, and every one of those rewrites is a chance for the desktop to shift.

Instead we add **max-width variants**, which only ever apply _below_ a breakpoint:

```html
<!-- current, untouched: this is what desktop renders -->
<div class="flex items-center gap-6 px-8">

<!-- after: desktop CSS is byte-identical, phone gets an override -->
<div class="flex items-center gap-6 px-8 max-md:flex-col max-md:items-stretch max-md:px-4">
```

`max-md:` compiles to `@media (width < 48rem)`. At 1280px it does not exist. This makes the work
**purely additive** on ~95% of the files, so a desktop regression becomes something you have to go
out of your way to cause.

The exception is the app shell (`AppShell`, `Sidebar`, `Topbar`) — that genuinely needs structural
change, so it gets the strictest gate instead.

### 1.2 A pixel gate, not an eyeball gate

Headless Chrome renders this app **deterministically** — I shot `/invoices` at 1440x900 twice and
got the identical file:

```
492308adbe46162002c2616ea2e1ccd8  det1.png
492308adbe46162002c2616ea2e1ccd8  det2.png
```

So the desktop guarantee can be a checksum, not an opinion:

1. Before any code changes, capture all ~70 representative routes at **1440x900** and store the
   hashes as a baseline.
2. After every phase, re-capture and diff.
3. **A changed hash blocks the phase** until it is either explained (an intentional shell change) or
   reverted.

This is the single most important item in the plan and it is why Phase 0 exists.

---

## 2. What I measured, and how

I drove the built app in an iframe, navigated all 70 static routes through the router, and at each
width measured how far the content overflows its container (`main.scrollWidth - main.clientWidth`)
plus the widest element that does not fit its own parent, ignoring deliberate scrollers.

Everything in Section 3 is that measurement, not an estimate.

---

## 3. Findings

### 3.1 Overflow by width — 70 routes

| Viewport | Routes overflowing | Reading                                       |
| -------- | ------------------ | --------------------------------------------- |
| **1440** | **0 / 70**         | the design's native width, clean               |
| **1280** | 1 / 70             | `/trade-documents/order-forms`, by 20px        |
| **1024** | 1 / 70             | `/expenditure/credit-notes`, by 29px           |
| **768**  | 6 / 70             | worst `/trade-documents/quotations/new`, 227px |
| **390**  | **59 / 70**        | every in-app screen breaks                     |

### 3.2 The split is perfectly clean

At 390px the 11 routes that **do** fit are _exactly_ the 11 pre-login routes — `/`, `/login`,
`/signup`, `/verify-code`, `/about-business`, `/business-type`, `/business-identity`,
`/address-contact`, `/plans`, `/payment`, `/fawtara-status`. Those were built on `AuthLayout`, which
already carries `lg:` breakpoints.

The 59 routes that break are _exactly_ the 59 that render inside `AppShell`.

That is not a coincidence, and it tells us where to start.

### 3.3 The decisive experiment

The sidebar is a hard `w-[248px]`. On a 390px phone it eats 64% of the screen, leaving ~142px of
content. So I re-ran the whole audit with one line injected — `aside { display: none }` — and
changed nothing else:

| Viewport | Overflowing before | Overflowing with sidebar hidden |
| -------- | ------------------ | ------------------------------- |
| 768      | 6 / 70             | **1 / 70**                      |
| 390      | 59 / 70            | **3 / 70**                      |
| 360      | —                  | **7 / 70**                      |

**Hiding one element fixes 56 of the 59 broken screens.** The app is not badly built for small
screens; it is a well-built app wearing a shell that cannot shrink. Card rows already use
`flex-wrap` (560 occurrences) and `min-w-[280px] flex-1` floors, tables are already wrapped in
`overflow-x-auto` (53 of 56 files), and the charts are already fluid.

I also rendered four archetype screens at 390px with the sidebar hidden. They are close to usable
as-is: cards stack, KPI tiles go full width, toolbars wrap, the sticky action bar on `/invoices/new`
behaves. The one thing that is clearly broken is the **topbar** — the 346px search box collapses to
a stub showing "Se", and "Create Invoice" wraps onto two lines.

### 3.4 The residual offenders, by name

After the shell is fixed, this is the entire remaining list:

| Route                                | 360px | 390px      | The element                                       |
| ------------------------------------ | ----- | ---------- | ------------------------------------------------- |
| `/catalog/build`                     | 118px | 88px       | toolbar `flex shrink-0 items-center gap-2.5`      |
| `/expenditure/payments`              | 59px  | 29px       | segmented control, `PaymentRunPage.tsx:221`       |
| `/trade-documents/delivery-notes/new`| 40px  | 10px       | option-row button                                 |
| `/catalog/new`                       | 16px  | —          | sticky bottom bar `-mx-4`                         |
| `/stock`                             | 15px  | —          | toolbar cluster                                   |
| `/trade-documents/quotations/new`    | 12px  | —          | field row                                         |
| `/income/debit-notes/new`            | 3px   | —          | `flex shrink-0 flex-wrap gap-8`                   |
| `/expenditure/credit-notes`          | —     | 31px @768  | summary card row                                  |

Seven screens. Half a day of work, not a rewrite.

### 3.5 Inventory — how much of each pattern exists

| Pattern                                 | Count            | Verdict                                                     |
| --------------------------------------- | ---------------- | ----------------------------------------------------------- |
| Tables                                  | 60 in 56 files   | 53 files already wrapped in `overflow-x-auto` — **3 are not** |
| Toolbar clusters `flex shrink-0 … gap-2.5` | 40            | the main phone offender; `shrink-0` blocks wrapping          |
| Sticky bottom action bars               | 11               | already `flex-wrap`; only the `-mx-4` bleed needs care        |
| Fixed side columns on `<aside>`         | 43               | 44 already guarded by `xl:w-[…]` — newer pages did this right |
| Modals                                  | 10               | already `w-full` + `max-w` + `max-h-[90vh]` — essentially done |
| Unprefixed `grid-cols-N`                | 22 (11 are `-2`) | small, mechanical                                            |
| Hard `w-[>=340px]`                      | **8**            | trivially few                                                |
| `min-w-[>=340px]`                       | 57               | almost all table min-widths inside scrollers — intentional    |
| Charts                                  | all              | `viewBox` + `w-full`, already fluid; only tick density        |

### 3.6 Where responsive work already exists

Prefix hits per area — the newest sections were built responsive, the oldest were not:

```
SettingsPage   61      ReportsIncomePage       0
CatalogPage    48      ReportsExpenditurePage  0
ActivityPage   24      ReportsCashFlowPage     0
HomePage       16      ReportsVatPage          0
                       ReportsCompliancePage   0
components/invoice  0  components/debit        0
```

The six Reports screens and the shared `components/invoice` + `components/debit` kits have **zero**
responsive handling and will need the most attention in Phase 4.

---

## 4. Breakpoint contract

No custom breakpoints exist in `tokens.css`, so we use Tailwind v4 defaults. Three bands:

| Band       | Range    | Tailwind handle       | Shell              | Content                                    |
| ---------- | -------- | --------------------- | ------------------ | ------------------------------------------ |
| **Small**  | 360–639  | `max-sm:` (< 640)     | sidebar is a drawer | one column, toolbars wrap, tables scroll   |
| **Medium** | 640–1023 | `max-lg:` (< 1024)    | sidebar is a drawer | two columns where they fit, asides drop    |
| **Large**  | >= 1024  | _(base — untouched)_  | sidebar permanent   | today's design                             |
| **Frozen** | >= 1280  | gated by checksum     | —                  | must be pixel-identical                    |

`body` already carries `min-width: 320px`, but I propose a **support floor of 360px** — that covers
every phone still in real use, and 320px would cost disproportionate effort. Flag if you disagree.

**Why the sidebar switches at 1024 and not 1280:** at 1024 the content column still gets 776px,
which the design handles (only 1 route overflows there today). Switching at 1280 would give tablets
a drawer they do not need. Open to changing this — see Section 8.

---

## 5. The archetypes, and the recipe for each

Nine shapes cover all 119 routes.

### A. The app shell — `AppShell` / `Sidebar` / `Topbar` (3 files, all 108 in-app routes)

_Breaks:_ `w-[248px]` sidebar unshrinkable; topbar's 346px search + "Create Invoice" + bell +
language switcher cannot coexist under ~700px.

_Recipe:_

- Sidebar becomes, below `lg`, a fixed-position drawer with a scrim, closed by default, opening from
  the inline-start edge so RTL flips for free (`start-0`, already the codebase's idiom).
- Trap focus while open, close on Escape, close on route change, lock body scroll — the `Modal`
  component already does all four and the logic can be lifted.
- Topbar gains a hamburger below `lg`. Search collapses to an icon that expands into a full-width
  overlay row. "Create Invoice" keeps its label at `lg`, becomes icon-only below `md`.
- The scroll-position keeper just added to `Sidebar` must keep working through the drawer.

_Acceptance:_ 1440 hashes unchanged for all 70 routes; overflow at 390 drops from 59 to <= 3.

### B. List screens + toolbar + table (~40 routes)

Invoices, Bills, Suppliers, Customers, Quotations, Order forms, Delivery notes, Credit/Debit notes,
Catalog, Stock, Activity, Documents.

_Breaks:_ the 40 `flex shrink-0 … gap-2.5` toolbar clusters — `shrink-0` forbids wrapping.

_Recipe:_ below `md`, drop `shrink-0`, add `flex-wrap`, and let filter/sort/export collapse into a
single "Filters" trigger that opens the existing `FilterMenu`/`SortMenu` in a sheet. Search input
goes full width above the buttons.

_Acceptance:_ no overflow at 360; every control reachable without horizontal scrolling.

### C. Data tables (60 tables)

_Recipe:_ the established pattern — `overflow-x-auto` wrapper + `min-w-[Npx]` on the table — is
kept, and the 3 unwrapped tables are brought into it: `components/invoice/DocumentPreview.tsx`,
`pages/CatalogPage/ChangePricesModal.tsx`, `pages/PaymentRunInvoicesPage/PaymentRunInvoicesPage.tsx`.

Horizontal scroll on a phone is honest for a 12-column ledger but poor for a list you skim. See the
decision in Section 8 about card-stacking the six highest-traffic lists.

### D. Form screens with a sticky action bar (~25 routes)

_Breaks:_ the `-mx-4` bleed assumes the desktop gutter; field rows sit in fixed two-ups.

_Recipe:_ below `md`, single-column field rows; action bar stays sticky, buttons go full width and
stack, `-mx-4` matched to the phone gutter.

### E. Detail screens: main + fixed aside (43 asides)

_Recipe:_ copy what `ActivityEventPage` already does — `w-full xl:w-[340px] xl:shrink-0`, aside falls
below the main column. 44 are already written this way; the rest get the same treatment.

### F. KPI / summary card rows (182 grid rows)

Mostly fine already via `flex-wrap` + `min-w-[280px] flex-1`. The 11 unprefixed `grid-cols-2` get a
`max-md:grid-cols-1`.

### G. Modals (10)

Already `w-full max-w-[N] max-h-[90vh] p-4`. Below `sm` they become bottom sheets — full width,
pinned to the bottom, square top corners. Low effort, big perceived-quality win.

### H. Reports and charts (6 routes, 0 responsive prefixes today)

Charts are already fluid (`viewBox` + `w-full`), so nothing overflows, but a 500-unit chart squashed
to 360px renders unreadable axis labels. _Recipe:_ below `md`, drop from 5 gridlines to 3, shorten
tick labels via the existing `formatTick`, and let the legend wrap. `ReportShell`'s `max-w-[760px]`
intro column and the export/period toolbar need small-screen handling.

### I. Pre-login and onboarding (11 routes)

**Already responsive** — no work, regression-check only.

---

## 6. The phased plan

Ordered by measured leverage. Each phase ends green before the next starts.

### Phase 0 — Harness and baseline _(no UI change)_

1. Move the audit rig out of `dist/` scratch into `tools/responsive/` and commit it: the route
   sweep, the 1440 hash baseline, and a one-command runner.
2. Capture and commit the 1440x900 hash baseline for all 70 routes.
3. Add the 49 param routes (`/invoices/:id` and friends) to the sweep with fixed sample ids, so
   coverage goes from 70 to 119.

_Exit:_ one command prints a clean desktop diff and the current overflow table.

### Phase 1 — The shell _(archetype A)_

The sidebar drawer and the mobile topbar. **This is the phase that matters** — measurement says it
takes 59 broken routes down to 3.

_Exit:_ 70/70 desktop hashes unchanged; <= 3 routes overflow at 390; drawer works in both LTR and
RTL; keyboard and Escape work.

### Phase 2 — The seven named offenders _(Section 3.4)_

Small, surgical, each one already located to a file and line.

_Exit:_ **0 routes overflow at 360px.** From here on the app never bleeds horizontally.

### Phase 3 — Tables and the three unwrapped ones _(archetype C)_

Execute whichever table strategy you pick in Section 8.

### Phase 4 — Density pass, section by section _(archetypes B, D, E, F, H)_

This is the bulk of the work, and where "no overflow" becomes "actually pleasant". One section per
sitting, each shipped and checked independently:

| #   | Section                                                              | Routes | Notes                                             |
| --- | -------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| 4.1 | **Reports**                                                          | 6      | zero responsive prefixes today; charts + shell     |
| 4.2 | **Income** (invoices, credit/debit notes, self-billing, periodic)     | ~26    | biggest group; `components/invoice` kit has zero   |
| 4.3 | **Expenditure** (bills, payments, recurring, notes, reminders)        | ~16    |                                                   |
| 4.4 | **Trade documents** (quotations, order forms, delivery notes)         | ~12    | holds 2 of the 7 offenders                        |
| 4.5 | **Catalog + Stock**                                                  | ~15    | already 48 prefix hits — lighter                  |
| 4.6 | **Settings**                                                         | ~16    | already 61 prefix hits — lightest                 |
| 4.7 | **Activity / Compliance**                                            | ~9     | already 24 hits                                   |
| 4.8 | **Contacts, POS, Dashboard**                                         | ~10    | POS needs its own look at the 3-pane layout       |

_Exit per section:_ every route legible and operable at 360, 390, 768; desktop hashes unchanged.

### Phase 5 — Arabic and RTL at small sizes

The drawer edge, the sticky bars, the `-mx-4` bleeds and the wrapped toolbars all need checking with
`dir="rtl"`. The codebase already uses logical properties (`ps-`/`pe-`/`start-`/`end-`) throughout,
so this should be verification rather than repair — but it is the step most likely to surface
surprises, so it gets its own pass rather than being folded into Phase 4.

### Phase 6 — Final sweep and sign-off

All 119 routes x {360, 390, 768, 1024, 1280, 1440}, plus a real-device pass on a phone and a tablet
(the emulator will not catch momentum scrolling, the iOS viewport-height trap, or tap-target feel).

---

## 7. Rough effort

| Phase                  | Size                                        |
| ---------------------- | ------------------------------------------- |
| 0 — harness            | half a session                              |
| 1 — shell              | 1–2 sessions                                |
| 2 — 7 offenders        | half a session                              |
| 3 — tables             | half to 2 sessions, depending on the decision |
| 4 — density, 8 sections| 3–5 sessions                                |
| 5 — RTL                | half a session                              |
| 6 — sweep              | half a session                              |

Call it **6–10 working sessions**. Phases 1 and 2 alone — under two sessions — take the app from
"broken on every phone screen" to "nothing overflows anywhere", which is most of the visible win.

---

## 8. Decisions I need from you

I have a recommendation for each; say the word and I will take the recommendation and start.

1. **Sidebar switch point — 1024 or 1280?**
   _Recommend 1024._ Tablets get the real sidebar and 776px of content, which the design handles.

2. **Tables on a phone — scroll or stack?**
   Option A: keep horizontal scroll everywhere (cheap, faithful, already built).
   Option B: card-stack the six highest-traffic lists (Invoices, Bills, Customers, Suppliers,
   Catalog, Stock) and scroll the rest — nicer, but it is new UI with no Figma behind it.
   _Recommend A for v1_, then B for those six as a follow-up once you have seen A on a device.

3. **"Create Invoice" in the phone topbar.**
   _Recommend_ icon-only below `md`, since every list screen already has its own create button.

4. **Support floor: 360px or 320px?** _Recommend 360._

5. **New small-screen UI has no Figma behind it** — the drawer, the bottom-sheet modals, the
   collapsed filter sheet. I will build them in the existing design language and flag each one for
   your review. Tell me if you would rather have designs first.

---

## 9. What this plan deliberately does not do

- It does not touch the desktop design. Every phase is gated on that.
- It does not restructure `AppShell` into a router layout route. Each of the 68 page files renders
  its own `<AppShell>`; hoisting it would be a 68-file refactor with no responsive payoff, and the
  scroll-keeping fix already handles the one symptom that caused.
- It does not add a CSS framework, a table library, or a charting library.
