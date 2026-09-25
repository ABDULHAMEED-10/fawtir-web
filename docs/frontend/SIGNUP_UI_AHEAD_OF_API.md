# Sign-up: what the screens ask that the API does not take yet

**Date:** 26 September 2026. Both items are UI only today. Sign-up works end to end without any
backend change; these rows say what to add so the answers are kept.

| # | Screen and what it asks | Today | What the backend should add |
|---|---|---|---|
| S.1 | **Tell us about your business** (`/about-business`): third question "Will you use Fawtir POS?", one tick card, unticked by default | Held in the page state only. Ticked: the flow is unchanged (Business type, then Sub business type). Unticked: the page saves the profile, then silently posts `business-category = FOOD_AND_BEVERAGE` and `business-type = RESTAURANT` so the step guard and `submitForReview` accept the registration, and goes straight to Business identity. The placeholder is never shown to the user | A `usesPos` boolean on `POST /v1/auth/signup/business-profile`, and category and type made optional when it is false (both in the step order and in `submitForReview`). Until then, a non-POS tenant's stored category and type are placeholders, not facts: do not use them for reporting or defaults. The front end drops `recordNoPosDefaults` in `src/lib/identity/onboarding.ts` once this lands |
| S.2 | **Your business identity** (`/business-identity`): "Business activity (ISIC)", required, searchable, pre-filled from the specialty for POS users, empty for the others | Kept in the page state and shown on the review page; not sent | `industrialClassification` (6-digit ISIC Rev. 4 code) on `POST /v1/auth/signup/business-identity`, stored on the tenant's company settings at approval; the full list behind `GET /v1/code-lists/isic?q=`. See `PINT_OM_LINE_CLASSIFICATION.md` §7 and §8 |
