# Platform — Company Verification decisions handoff

## Scope

On the console's company detail page (`/console/onboarding/:companyId`) a reviewer can now:

1. **file evidence**
2. **verify (approve)** the company
3. **reject** the registration

The panel appears only for a registration that is submitted and still `PENDING_VERIFICATION`. It
builds on the read-only slice in `PLATFORM_COMPANY_VERIFICATION_HANDOFF.md`.

Not in scope: plans, operators, tenant settings, tenant list, operations, incidents, audit, SMP,
PEPPOL_TEST, impersonation, deprovisioning.

| | |
|---|---|
| Frontend branch | `feat/signup-integration` (not committed, not pushed) |
| Frontend base / current HEAD | `2e99ca0` (`main`); no commits made |
| Backend | `D:\fawtir` @ `94cde817`, read only; **no backend code or config change** |
| Layout | approved by the product owner (2026-09-12): a "Decision" card and two confirming dialogs, composed of existing parts only |
| Prisma | not used: `PRISMA_APPLICABLE = NO` |

## API contracts (verified in backend source and live)

All three need `platform.tenants.manage` (`@PreAuthorize`). The portal cookie session is
MFA-verified by construction. Every write carries the double-submit `X-CSRF-Token` header, which
`apiRequest` adds.

**`POST /api/v1/platform/companies/{tenantId}/verification-evidence`**
- Multipart, part `file`. Returns `201 {evidenceReference, evidenceSha256, profileRevision, sizeBytes, filename}`.
- The reference and SHA-256 are minted server-side, and the evidence is bound to the current profile revision.
- Allowed only while `PENDING_VERIFICATION` (`409` otherwise).
- Every upload mints a new reference; the attestation names the one it uses.

**`POST /api/v1/tenants/{tenantId}/company-verification/manual-attestation`**
- Body `{expectedRevision, attestationReference ^[A-Za-z0-9._/-]{1,100}$, evidenceReference, evidenceSha256}`.
- Returns `200 {tenantId, verificationStatus, verificationMethod, tenantStatus, decidedAt}`.
- Refusals:
  - `409` when the revision moved, the profile is incomplete, the evidence is missing or has the wrong digest, or the case was already decided
  - `403` when the reviewer submitted the registration (four-eyes) or lacks the permission

**`POST /api/v1/tenants/{tenantId}/company-verification/rejection`**
- Body `{expectedRevision, reason}`, where `reason` ∈ `COMPANY_PROFILE_MISMATCH`, `TAX_IDENTITY_EVIDENCE_MISSING`, `COMMERCIAL_REGISTRATION_EVIDENCE_MISSING`, `REGISTERED_ADDRESS_EVIDENCE_MISSING`, `EVIDENCE_REQUIRES_REVIEW`.
- It reopens the self-service draft and emails the registrant.

**Side effects checked before any local decision:**
- **Approval** activates the tenant, enables the registrant's sign-in and emails them.
- **Approval also publishes `TenantProvisioningCompletedEvent`.** Its SMP auto-onboarding listener
  is gated by `FAWTIR_OMAN_SMP_AUTO_ONBOARDING_ENABLED`, which is unset (`false`) locally, and it
  also needs a verified Participant ID. So no SMP traffic occurs.
- Local mail goes to Mailpit.

## Behaviour

| Piece | Behaviour |
|---|---|
| Visibility | The panel shows only when `submittedAt` is set and the status is `PENDING_VERIFICATION`. It never shows for verified, rejected or unsubmitted registrations |
| Four-eyes | If the signed-in operator (entitlements `userId`) is the registration's `submittedBy`, a note replaces the buttons. UX only; the backend enforces it |
| Evidence | Existing `FileDropzone` (Create Invoice's look). PDF/PNG/JPG up to 10 MB (core's default), checked locally. **1 request per file**; the upload is guarded against double drops. Shows the file name and size, and "Replace evidence" uploads again |
| Stale evidence | Evidence filed against an older revision disables Verify, with an explanation. The panel is re-created per revision, so old evidence never carries over |
| Attestation reference | Existing `Input` (bordered), mirroring the backend pattern; the error appears after blur |
| Verify | Enabled only with evidence and a valid reference. Opens the existing `Modal` with an evidence/reference summary and the consequences. **Confirm sends 1 request** (repeat clicks ignored) |
| Reject | Opens the `Modal` with the existing `Select` of the 5 backend reasons; a reason is required. **Confirm sends 1 request** |
| After a decision | The detail and history are re-read (**2 requests**) and a confirmation is shown. The panel disappears because the status changed |
| `409` | "This registration changed or was already decided. Reload it and look again." The confirm button is disabled and **Reload** re-reads the detail and history |
| `403` | "Fawtir refused this decision. Another reviewer may need to make it, or your account lacks access." |
| `413` | "The file is too large for the server to accept." |
| `401` | Entitlements forgotten; the reviewer goes to Login |
| Network, timeout, `5xx` | The shared localized messages; nothing is retried automatically |

**Request counts:**

| Action | Requests |
|---|---|
| Upload | 1 |
| Verify | 1 write + 2 reads |
| Reject | 1 write + 2 reads |
| Reload after a `409` | 2 reads |
| Opening the page (reads only, unchanged) | detail + history in parallel |
| Polling | none |

## Files changed (this slice)

| File | Change |
|---|---|
| `src/api/client.ts` | sends a `FormData` body as-is, without a JSON `Content-Type`, so the browser writes the multipart boundary; the CSRF header is unchanged |
| `src/lib/console/companyVerification.ts` | `uploadEvidence`, `attestCompany`, `rejectCompany`; `EvidenceUpload` and `VerificationDecision` types; `REJECTION_REASONS`; evidence limits; `attestationReferenceError`; `describeDecisionFailure` |
| `src/pages/ConsolePage/verification/DecisionPanel.tsx` (new) | the panel and its two dialogs |
| `src/pages/ConsolePage/verification/ReviewCard.tsx` (new) | the detail's card and line, moved out of the page so the panel can reuse them |
| `src/pages/ConsolePage/VerificationCompanyPage.tsx` | shows the panel; re-reads after a decision; shows the confirmation |
| `src/i18n/locales/en.json`, `ar.json` | `console.verification.decision.*` |
| `src/pages/ConsolePage/verificationDecisions.test.tsx` (new), `verification.test.tsx` | tests. One read-only assertion ("no decision controls") became "Verify offered but disabled; opening is reads only", because the behaviour changed by design |

## Security

- **Backend authority.** Every decision is authorised by the backend. The frontend pre-checks —
  permission, four-eyes, revision, reference pattern, file type and size — only save a request that
  would certainly be refused.
- **Server-minted identifiers.** The evidence reference and digest come from the backend; nothing
  is computed client-side, and the decision quotes back `expectedRevision` from the detail.
- **Nothing persisted.** Evidence details, company data and decisions live only in component
  state. Storage holds only `language` (verified); nothing is logged.
- **Confirmed and guarded.** Irreversible actions need an explicit confirmation, and a ref guards
  each against repeated clicks.

## Verification

| Check | Result |
|---|---|
| Tests | **334 passed, 20 files**; new `verificationDecisions.test.tsx` (20) |
| Typecheck | pass |
| Lint | changed files clean; the only error is the known, untouched `src/components/ui/Rial.tsx` |
| Build | pass |

### Real browser, local backend (authorised local mutations)

The local platform operator on `:5174`. The companies acted on are local registrations from the
earlier signup runs, whose registrants all have `@example.test` addresses (verified).

| Scenario | Result |
|---|---|
| Oversize evidence (1.5 MB) | real `413` from the gateway → "too large"; Verify stays disabled |
| Upload | `POST …/verification-evidence 201` as multipart with CSRF; response is exactly `{evidenceReference, evidenceSha256, filename, profileRevision, sizeBytes}` |
| Verify (English, desktop) | dialog shows file and reference; a double click on confirm → **1** `manual-attestation 200` + detail `200` + history `200`; panel gone; pill "Verified". Database: tenant `ACTIVE`, `VERIFIED` by `MANUAL_ATTESTATION`, evidence recorded, registrant sign-in enabled. The approval email arrived in Mailpit |
| Stale second view (the same company, served its pre-decision state) | real `verification-evidence 409` → "changed or already decided — reload" |
| Reject (Arabic, phone, RTL) | confirming without a reason → "Choose a reason", no request; with a reason → **1** `rejection 200` + 2 re-reads; Arabic confirmation, no English, no overflow. Database: `REJECTED`, draft reopened |
| Console errors, unexpected writes, sensitive data in storage | none |
| Signed out afterwards | entitlements `401` |

## Environment finding and backend gaps (not fixed in code)

1. **The local MinIO had no evidence bucket.** `docker-compose.local.yml` configures
   `fawtir-company-verification` and enables evidence storage, but nothing creates the bucket, so
   every upload failed with `500`. With the product owner's approval the bucket was created
   **in the local MinIO only** (`mc mb`); no file was changed. Other environments need it
   provisioned, or core should create it at start-up.
2. **Evidence storage failures answer `500`** (`IllegalStateException`, "store is unavailable").
   The adapter swallows the cause, so the log does not say why. It should answer `503` and log the
   cause.
3. **The edge caps uploads at 1 MiB** (gateway `max-request-bytes`), while core accepts 10 MB of
   evidence. Scanned documents above 1 MiB are refused with `413`. The gateway needs a per-path
   limit for evidence uploads (as it has for invoice submission), or the limit must be documented.
4. **No server-side content-type allow-list** for evidence. The picker restricts to PDF/PNG/JPG,
   but the backend stores whatever is sent.
5. **Four-eyes and missing permission share one `403` type**, and all "case moved" refusals share
   one `409` type. The UI therefore gives one honest message per status; distinct problem types
   would allow precise messages.
6. **Uploaded-but-unused evidence is not listed anywhere.** After a reload the reviewer uploads
   again, which is harmless: each upload is a new reference and only the attested one counts.
7. Previously reported gaps still stand: unsubmitted registrations in the queue; `500`s for
   invalid role, evidence or realm requests; no deprovisioning guard; operators lack
   `admin.settings.manage`; the logout CSRF-audit `401`.

## Local data changed by verification

- One local test company is now **VERIFIED/ACTIVE**, and its registrant can sign in.
- One is **REJECTED**, with its draft reopened.
- One submitted registration is still pending.
- Small test PDF evidence objects are stored in the local MinIO bucket.
- Everything is local only: no TEST, no production, no external traffic.

## Next recommended slice

**Plans and rates** in the console (read-only, then edit). Alternatively, a backend follow-up for
the gaps above (the evidence bucket, the `500`s, and the gateway limit) before evidence uploads are
used on TEST.

## Post-integration checklist

- [ ] Review and commit
- [ ] Provision the evidence bucket in each environment (or have core create it)
- [ ] Backend: evidence store failure → `503` with the cause logged
- [ ] Gateway: a per-path body limit for evidence uploads
- [ ] Backend: a content-type allow-list for evidence; distinct problem types for four-eyes and "case moved"
