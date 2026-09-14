# Final submission (Review & submit, Under review) — frontend integration handoff

## Purpose and scope

Completes self-service signup: after Address & Contact the registrant reviews every answer, submits
the registration for the human verification review, and lands on a waiting screen. Adds two
screens — `/signup-review` and `/signup-pending` — built only from existing components.

Out of scope and untouched: `/plans`, `/payment`, `/fawtara-status` (prototypes; the signup
backend has no plan, payment or Fawtara step, so they are no longer reached from signup), login,
recovery, the reviewer console.

| | |
|---|---|
| Frontend branch | `feat/signup-integration` (not committed, not pushed) |
| Frontend base / current HEAD | `2e99ca0` (`main`) — no commits made |
| Backend | `D:\fawtir` @ `94cde817` — read only, no backend change |
| Prerequisites | `SIGNUP_INTEGRATION_HANDOFF.md`, `ONBOARDING_INTEGRATION_HANDOFF.md` |
| Authorities read | `SelfServiceSignupService.submitFinalOnboarding` / `readSignupStatus` / `toStatus`, `SelfServiceCompanyOnboardingService.submitForReview` / `reopenSubmission` / `readStatus`, `docs/testing/identity/documents/self-service-signup-frontend-guide.md` §10a–c, `docs/identity/audit-events.md` |

## Decisions taken with the product owner (2026-09-12)

1. **Two new screens** (visual blocker approved): `/signup-review` then `/signup-pending`, composed
   of existing components and class patterns only — no new CSS, tokens or components.
2. **Review shows this tab's saved answers with Edit links**; opened without them (typed URL) it
   shows "Saved earlier" per field, from the server's progress only.
3. **No polling**: the waiting screen reads status once, and only when not reached straight from
   submitting. The decision arrives by email.
4. **Plans / Payment / Fawtara Status left untouched and unlinked.**

## Backend contract

`POST /api/v1/auth/signup/final-submission` `{ onboardingToken }` → `204` — received, not
approved. The draft is promoted to the tenant row with `PENDING_VERIFICATION`; `/signup/status`
then reports `UNDER_REVIEW`, later `ACTIVATED` or (transiently) `REJECTED`. A rejection reopens the
draft: `submitted` back to `false`, `stage` back to `READY_FOR_SUBMISSION`.

| Answer | Meaning | Frontend |
|---|---|---|
| `204` | submitted | mark tab submitted, replace history entry, `/signup-pending` "received" |
| `409` + status `UNDER_REVIEW` | already submitted (e.g. the first response was lost) | treated as success → waiting screen (guide §10a) |
| `409` + status earlier stage | a step is missing | go to that step |
| `409` + status `READY_FOR_SUBMISSION` | VATIN/CR reached by another company first (unique only at promotion), or a stale/verified profile | "registered by another business first — edit your business identity and submit again"; stays editable |
| `401` | token invalid or expired | session ended in place; support message, **never** "sign up again" (guide §10c) |
| `429`, network, timeout, 5xx | — | shared localized messages; button re-enabled |

Every refusal is audited server-side as `SignupFinalSubmissionRequested` / `FAILURE`.

## Route graph

```
/address-contact ─Continue─▶ /signup-review ─Submit (1 request)─▶ /signup-pending
        ▲                        │ Edit (3 links, answers carried)
        └────────────────────────┘
After submission every onboarding page and /signup-review redirect to /signup-pending.
```

`allowedRoute` now includes review (reachable only at `READY_FOR_SUBMISSION`) and sends every
submitted stage to the waiting screen. `ROUTE_FOR_STAGE`: `READY_FOR_SUBMISSION → /signup-review`,
`UNDER_REVIEW | ACTIVATED | REJECTED → /signup-pending`.

## Waiting-screen outcomes

| Outcome | When | Shows | Requests |
|---|---|---|---|
| received | reached from submit, or this tab submitted, or status `UNDER_REVIEW` / `REJECTED` | badge "Under review", "We've received your registration… decision by email" | 0 (1 if opened without router state and without the local flag) |
| approved | status `ACTIVATED` or `loginEnabled` | badge "Approved", Sign in button → `/login` | 1 |
| ended | no live token (never had one, expired, or refused) | "Your signup session has ended… decision by email… contact Fawtir support" | 0 (1 if the token was refused on the status read) |
| redirect | status says not submitted (never, or reopened by a rejection) | → the stage's page, usually review | 1 |

## State

| What | Where |
|---|---|
| `submitted` flag | `sessionStorage` beside the token (non-secret) — closes the pages for this tab after submitting |
| ended session | an expired token is kept, expired, instead of deleted, so the tab can tell "registration exists, session over" from "never signed up" (`hasEndedOnboardingSession`); a `401` now expires the token in place (`endOnboardingSession`) rather than removing it |
| address & contact answers | router state from Address & Contact to Review only (Review exists to show them); the waiting screen receives `{ submitted: true }` and nothing else |

## Files changed (this slice)

| File | Change |
|---|---|
| `src/pages/SignupReviewPage/*` (new) | review screen: three read-only sections with Edit links, invoice-preview hero, Submit |
| `src/pages/SignupPendingPage/*` (new) | waiting screen with the three outcomes |
| `src/App.tsx`, `src/pages/index.ts` | two routes |
| `src/lib/identity/onboarding.ts` | `submitForReview`, `REVIEW_ROUTE`, `PENDING_ROUTE`, `ROUTE_FOR_STAGE` export, `isSubmittedStage`, `allowedRoute` for review/submitted |
| `src/lib/identity/onboardingSession.ts` | `submitted` flag, `markOnboardingSubmitted`, `hasEndedOnboardingSession`, `endOnboardingSession` (replaces clearing) |
| `src/components/auth/OnboardingGate.tsx` | submitted → waiting screen; ended → waiting screen (not signup); 401 ends in place |
| `src/hooks/useOnboardingStep.ts` | 401 ends the session; a `409` that reads back as submitted marks the tab submitted |
| `src/lib/onboarding.ts` | `address` in router state; shared label-key maps (size, invoicing, category) |
| `src/pages/AddressContactPage/AddressContactForm.tsx` | restores its values from state (Edit from review); continues to review |
| `src/pages/AboutBusinessPage/AboutBusinessForm.tsx`, `BusinessTypePage/BusinessTypeForm.tsx`, `BusinessIdentityPage/BusinessIdentityForm.tsx` | use the shared label maps (no rendered change — verified) |
| `src/i18n/locales/en.json`, `ar.json` | `signupReview.*`, `signupPending.*`; `onboarding.sessionExpired` reworded — the old "Sign up again" contradicted guide §10c |
| `src/pages/finalSubmission.test.tsx` (new), `src/lib/identity/onboardingSession.test.ts`, `src/lib/identity/onboarding.test.ts`, `src/pages/onboarding.test.tsx` | tests |

## Security and privacy

- The token travels only in request bodies; nothing about the submission is put in a URL.
- The waiting screen shows nothing identifying and receives no answers.
- The contact's phone and email reach the review screen (router state, this tab) and nowhere else.
- Submit is guarded against double click, repeated Enter and overlap; a lost response is resolved
  by reading status, never by resubmitting.
- The approval outcome is only a pointer to `/login`; nothing in the browser can activate anything.

## Verification

| Check | Result |
|---|---|
| Tests (`npm test`) | **196 passed, 12 files** — new `finalSubmission.test.tsx` (18), plus updated `onboardingSession.test.ts` (6), `onboarding.test.ts` (17), `onboarding.test.tsx` (49) |
| Typecheck | pass |
| Lint | changed files clean; 1 pre-existing error in untouched `src/components/ui/Rial.tsx` |
| Build | pass |

### Real browser, local backend

Headless Chromium through the `:5174` dev proxy to the local gateway; mail in Mailpit; three fresh
`@example.test` accounts; results read back from `tenant.tenants` / `company_onboarding_drafts`.

| Scenario | Result |
|---|---|
| Review render (A, en 1440) | 0 requests; all 16 answers shown read-only (size, invoicing, category, trade, legal name, CR, VATIN, accent, address, blank postal code as "—", city, localized governorate, contact, role, `+968…` phone, email); hero draws the company |
| Edit round trip | Edit → identity restored → changed name → Continue → address restored (city, email, governorate) → Continue → review field and hero show the new name; 2 requests (`business-identity 204`, `address-contact 204`) |
| Submit, double guarded (A) | double click + Enter while the request was held → **one** `final-submission 204`; button disabled with "Submitting…"; → `/signup-pending` "We've received your registration"; DB `PENDING_VERIFICATION`, draft submitted; tab flag set |
| Pages closed after submit | browser Back, and typed `/business-identity`, `/signup-review`, `/about-business` → `/signup-pending`, **0 requests**; reload → same, 0 requests |
| One-time status read | with the local flag cleared → exactly one `status 200` → "received"; no further requests (no polling) |
| New tab | "Your signup session has ended" (no token in that tab), not signup |
| Promotion-time conflict (B, ar 390, same VATIN as A, submitted after A) | `final-submission 409` + `status 200` → Arabic "registered by another business first…", stays on review, no English; Edit → new VATIN → `business-identity 204`, `address-contact 204`, `final-submission 204` → DB `PENDING_VERIFICATION` |
| Existing screens after the label-map refactor (en 1440 vs `main`) | About, Business Type, Business Identity: 0 class differences, identical node counts |
| Layout | review heading clipped 0 px at 1440 and 390 (after fix, see below); no horizontal overflow at 390 |
| Console / page errors | none |

A first run exhausted the 30/min per-IP onboarding bucket (two full flows in one minute) and got
`final-submission 429`; the UI showed the rate-limit message and stayed usable. The run was repeated
with the window respected; that is the run recorded above.

### Layout defect found and handled

The shared `AuthLayout` centres its content inside a scroll container, and a centred child taller
than that container starts above the scroll origin — its top cannot be scrolled to. Measured:

| Screen | 1440 px | 390 px |
|---|---|---|
| Review (new), before fix | 103 px of heading cut off | 493 px (heading + first section) |
| Review (new), after `my-auto` on its own root | 0 | 0 |
| Address & Contact (`main`, unchanged) | 0 | 105 px |
| Business Identity (`main`, unchanged) | 0 | 54 px |

- **VISUAL_BLOCKER**: on phones the existing Address & Contact and Business Identity headings are
  unreachable (pre-existing on `main`).
- **WHY_CHANGE_IS_REQUIRED**: the page title and part of the first fields cannot be scrolled into
  view on common phones.
- **MINIMAL_CHANGE**: give `AuthLayout`'s content a safe centring (`my-auto` on a wrapper, or
  `items-start` plus `my-auto` on the child). Not applied — it changes the layout of every auth
  screen and needs design approval. The new Review screen carries the fix on its own root.

## Known limitations

1. **The backend accepts edits to a submitted draft.** None of the five step endpoints checks
   `submitted_at`, so a direct API caller can change the draft while it is under review (the
   promoted tenant row is unaffected until a resubmission). The frontend closes the pages after
   submission; the guide says the pages are closed — worth enforcing server-side.
2. **The outcome is rarely visible here.** The two-hour token usually expires before review ends;
   the email is the channel. "Approved" appears only if the registrant returns while the token
   lives.
3. **Resubmission after rejection needs a live token**; with an expired one the registrant gets the
   support message (backend `FRONTEND_CONTRACT_GAP`).
4. **Review shows this tab's copy, not a read-back** — there is no endpoint that returns the draft.
5. **`AuthLayout` clips tall screens on phones** — pre-existing; see the visual blocker above.
6. Pre-existing items from earlier slices still stand (OTP overflow at 390 px, vitest upgrade
   blocked, Participant ID authority).

## Next recommended task

Login (username + password → session) — the next thing an approved registrant does.

## Post-integration checklist

- [ ] Review and commit
- [ ] Backend: refuse step edits once `submitted_at` is set
- [ ] Decide whether Plans / Payment / Fawtara Status stay in the product flow, and where
- [ ] Integrate Login
