# Onboarding: backend guide

**For:** the backend team. **Covers:** sign-up from the plan choice to the account being live:
Choose a plan (`/plans`), How you'll pay (`/payment`), Review (`/signup-review`), and the
"Getting you live" status screen (`/signup-pending`, and `/fawtara-status` after sign-in).
**Last updated:** 8 October 2026.

The integration handoffs for the earlier steps (sign-up, email code, the five onboarding steps,
final submission) are in `docs/frontend/ONBOARDING_INTEGRATION_HANDOFF.md` and
`docs/frontend/FINAL_SUBMISSION_HANDOFF.md`; everything there is still wired and unchanged.

## How to use this guide

- **Rows.** Each row reads: number, what the screen shows, what the backend must add. Row numbers
  are stable ids cited by `// TODO(backend)` comments in the code; they are never renumbered, and
  new rows are appended at the end of their section.
- **Nothing existing was removed.** Every call the onboarding flow made before still runs, in the
  same order, with the same body.

## The flow (owner decision, 8 Oct 2026)

Sign up, About your business, (Business type, Sub-type), Business identity, Address & contact,
**Choose a plan, How you'll pay**, Review, Submit, then the status screen.

- **Nothing is charged before approval.** The trial starts when the Fawtir team approves the
  registration. When it ends, the first bill goes out by the chosen method (Paymob link, bank
  transfer or cash). If the super admin gives a plan no trial, the first bill goes out on approval.
- **Enterprise** ("Talk to our team") skips How you'll pay: it reaches review with the plan marked
  Enterprise, terms agreed on a call. No trial, no bill until the contract.
- **The super admin owns all of it:** plans, prices, trial length and which plans get one, the
  payment methods on offer, bank details and the cash note, all from the console
  (`/v1/platform/plans`, platform settings). Sign-up shows the launch defaults until it can read
  them (row 1.1).

---

## 1. Plan, payment and going live

| # | The screen shows | Ask |
|---|---|---|
| 1.1 | `/plans` and `/payment` draw prices, limits, the trial length, which plans have a trial, the payment methods, bank details and the payment link's life from the launch catalogue in the code. | A public, unauthenticated read of what the super admin published, for example `GET /v1/public/plans` (plans with prices, limits, features, `trialDays` or null) and the sign-up payment settings (enabled methods, bank account name, bank, IBAN, reference format, link expiry days, cash note). The onboarding token may be required instead if it must not be public. |
| 1.2 | Choosing a plan carries `plan` and `billing` in the browser only. | `POST /v1/auth/signup/plan {onboardingToken, planCode, billingCycle}` with `planCode` one of the published codes (sign-up uses `starter`, `premium` for Business, `businessPlus`, `enterprise`) and `billingCycle` `MONTHLY` or `ANNUAL`. Allowed while the draft is open; saving it again replaces it. |
| 1.3 | How you'll pay carries the method (`cardLink`, `bankTransfer`, `cash`), for a card where the link goes (`email` or `whatsapp`), and the ERP extraction add-on, in the browser only. | `POST /v1/auth/signup/payment-preference {onboardingToken, method, linkChannel?, erpExtractionAddon}`. Not called for Enterprise; refuse it when the saved plan is Enterprise. |
| 1.4 | Review refuses to submit without a plan, and without a method for every plan but Enterprise, but only from what this tab carried. A review opened from a fresh tab cannot show the choices. | `submitForReview` refuses a draft without a saved plan, or without a payment preference unless the plan is Enterprise (a problem type the screen can name). `POST /v1/auth/signup/status` returns the saved `plan`, `billingCycle`, `paymentMethod`, `linkChannel` and `erpExtractionAddon`. |
| 1.5 | The status screen says the trial starts on approval and the first bill follows. | On approval: start the trial for the saved plan, or, with no trial, create the first bill at once. When the trial ends, create the first bill and send it by the saved method: a Paymob link by email or WhatsApp, or the invoice with bank details, or a cash invoice. Never charge before approval. |
| 1.6 | (Console) The registration review in the super admin console. | Show the chosen plan, billing cycle, payment method, link channel and add-on on the registration a reviewer approves, so they know what will be billed. |
| 1.7 | The status screen's steps: Registration sent, Fawtir review (under review / approved), Authorise Fawtir on the Fawtara Portal (awaiting OTA approval), Connected. The Fawtara step is assumed, and sign-in always goes to the dashboard. | A Fawtara authorisation status, for example `fawtaraStatus: NOT_REQUESTED \| PENDING \| CONNECTED \| REJECTED`, on `POST /v1/auth/signup/status` and on a signed-in read (for example `/v1/me/entitlements` or `/v1/company-profile`). Sign-in will then open `/fawtara-status` until it reads `CONNECTED`, and the dashboard after. |
| 1.8 | The status screen names the inbox it will write to only in the tab that signed up; elsewhere it says "the address you registered with". | The account email on `POST /v1/auth/signup/status`, and on the signed-in read of row 1.7. |
| 1.9 | (Refines 1.7, owner 8 Oct 2026.) The steps now follow the OTA's "Service Provider and Taxpayer Association Management User Manual": Registration sent; Fawtir review; Send Fawtir a connection request on the Fawtara Portal (with how-to); Fawtir accepts your request; Fawtir registers you on the Oman SMP (within 3 business days of acceptance, manual §7.5.1); Connected. A declined or expired request is shown on the acceptance step and the portal steps are offered again. Nothing is approved by the OTA at this stage. | Report the portal connection as one status with these values: `NOT_REQUESTED` (no request from the taxpayer yet), `REQUESTED` (pending on Fawtir's Manage Taxpayers), `ACCEPTED` (SMP registration still to do), `REGISTERED` (participant added on the Oman SMP; connected), `REJECTED` (with the reason code chosen when declining), `EXPIRED`, `WITHDRAWN`, plus `effectiveDate` when the taxpayer set one and `acceptedAt` so the screen can show the 3-business-day deadline. Same reads as 1.7. |
| 1.10 | (Console, no screen yet.) Fawtir's own side of the connection. | A console queue of portal connection requests with the taxpayer's Fawtir account matched by VATIN or CR, Accept and Reject (reason) actions or at least their recorded outcome, the 3-business-day SMP deadline after acceptance with a warning before it lapses, and the SMP add call (`PUT` participant on the Oman SMP, `docs: Oman SMP API Specification`) with its Approve or Reject result. A taxpayer leaving Fawtir for another provider must be removed from the SMP within 1 day (manual §3.8.1). |
| 1.11 | (Owner, 9 Oct 2026; asked of the backend lead.) A newly approved company may have no branch, so the invoice branch picker is empty until someone adds one in Settings › Branches; the first branch added there becomes head office. | On approval, create the company's head office branch from the sign-up details (legal name, address, city, governorate, postal code, phone), flagged head office, so every company can invoice from day one on web and mobile. `GET /v1/branches` then always returns at least that branch. |
| 1.12 | (Owner, 11 Oct 2026.) The card option opens Paymob checkout for a bill the server priced in three-decimal OMR. | Paymob Oman sandbox only: send `amount_cents` = bill total in OMR x a configurable multiplier, `100` in sandbox (OMR 35.12 -> 3512, OMR 80.00 -> 8000). This is an unverified assumption about Paymob's OMR representation; document it beside the setting. Keep every Fawtir amount at three decimals. |
| 1.13 | The checkout shows the refusal when the server will not open one. | Refuse to start a Paymob checkout when the total has a nonzero third decimal (for example 35.125); never round or truncate. Answer with a problem type the screen can name, for example `PAYMOB_AMOUNT_NOT_REPRESENTABLE`, carrying the OMR total. |
| 1.14 | A card payment reads "Payment pending" until the server says it is paid; the web never decides it. | Before settling a sandbox payment, read Paymob's transaction inquiry and compare the charged amount, currency and order reference with the bill (amount / multiplier = bill total, exactly). If they do not reconcile, leave the payment pending and record why; never mark it paid from the redirect or the callback alone. |
| 1.15 | Card is offered only where Paymob applies. | Use Paymob only for a new subscription, a plan upgrade and paying an expired subscription; every other bill keeps the existing billing and settlement logic. Keep production Paymob payments switched off until Paymob confirms the OMR amount representation; expose that on/off state on the payment settings read so the web can hide the card option where it is off. |
| 1.16 | (Owner, 11 Oct 2026.) Console › Plans takes subscription and add-on prices. | Accept subscription and add-on prices only in multiples of 0.200 OMR, so the 5% VAT total keeps a zero third decimal (35.000 -> 36.750); refuse any other price on save with a problem type the console can name. Existing plans priced otherwise must be corrected before card payment is switched on for them. |
| 1.17 | An upgrade or a mid-period add-on shows the amount due now. | Work pro-rata at full precision, then round down to the nearest 0.010 OMR (12.347 -> 12.340) before billing, so the customer is never overcharged and the bill, the invoice and Paymob carry the same amount. Bank transfer and cash bills keep the existing three-decimal logic. |
