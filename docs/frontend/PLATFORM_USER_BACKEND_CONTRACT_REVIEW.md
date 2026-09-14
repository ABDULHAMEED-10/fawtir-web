# Platform users — backend contract review (identity, operators, roles, invitations, MFA, sessions)

## Status and method

| | |
|---|---|
| Review | backend-first, read-only map of users, platform operators, customer users, invitations, creation, lifecycle, email, passwords, MFA, sessions, logout, roles, permissions, locking, audit, impersonation, platform-tenant and PEPPOL_TEST rules |
| Backend | `D:\fawtir`, branch `fix/backfill-plan-legal-hold-permissions`, **HEAD `94cde8173064c782052b371d2982f8dd9c0bfa6c`**. `origin/main` (`5bb00b59`) differs by docs only, so the identity code is identical. 0 tracked changes, 50 untracked files preserved, 0 stashes |
| Follow-up | The latest commits were reviewed, including the permission work on `integration/peppol-certification` (`00fa3550`, `2c0ef76c`, `8234d12d`, `abbcd70c`), plus V178 at `94cde817` — see *Recent commits reviewed* |
| Changes made | **none**. BACKEND_CHANGED = NO · DATABASE_CHANGED = NO · FRONTEND_CHANGED = NO (this document only) |
| Method | four parallel source reviews (auth/MFA/sessions; users/invitations/lifecycle; roles/permissions; platform/impersonation/audit) over every identity-related controller in core and the gateway. The lead reviewer checked every critical and high finding against source. The runtime database was queried **read-only** (roles, permissions, identity policies). Earlier live evidence from the Operators slice is cited where it applies |
| Not done | no destructive or escalating behaviour was exercised live; no TEST or production access; the settings on deployed environments (for example `FAWTIR_IDENTITY_DISTRIBUTED_STATE_ENABLED`) were not checked |

**Controllers covered:**

| Area | Controllers |
|---|---|
| Authentication | `AuthenticationController`, `MfaController`, `LogoutController`, `AccountRecoveryController`, `OAuthController`, `SignupController`, `JwksController` |
| Self-service | `MeController`, `SessionController`, `DeviceController`, `PrivacyRightsController` |
| User administration | `UserController`, `UserInvitationController`, `InvitationAcceptanceController`, `UserSessionAdministrationController`, `AdminSellerDeviceController` |
| Roles and permissions | `UserRolesController`, `RoleController`, `PermissionCatalogueController` |
| Identity policy and metrics | `TenantIdentityPolicyController`, `TenantIdentityMetricsController` |
| Platform operators | `PlatformOperatorRoleController`, `PlatformOperatorEmailController` |
| Support | `ImpersonationController`, `MtlsPrincipalController` |
| Tenant lifecycle | `TenantController` (identity-touching paths), `InitialTenantBootstrapController` |
| API keys | `TenantApiKeyController`, `SellerApiKeyController`, `ApiKeyController` |
| PEPPOL_TEST and certification | `PeppolTestTenantController`, `PeppolTestTenantAdministratorController`, `CertificationFixtureController`, `CertificationSellerAttestationController`, `BusinessDocumentValidationController` |
| Other | `ActivityLogController`, actuator, `dev/SecurityTestController` |
| Background runners | the platform and TEST bootstrap and email-recovery runners |

Classification labels used throughout: SAFE_FOR_FRONTEND, INTERNAL_ONLY, HIGH_RISK, LEGACY,
DUPLICATED, POTENTIALLY_BYPASSING_POLICY.

## Recent commits reviewed (follow-up, 2026-09-12)

The latest commits were reviewed read-only with `git show` / `git diff`, and the local database was queried read-only. Nothing was checked out or changed.

**Where the commits live:**
- `origin/main` (`5bb00b59`) is `94cde817` plus four **docs-only** commits: `2dc631c2`, `1583751f`, `c8221501`, `5bb00b59`.
- The permission work beyond the baseline is on **`integration/peppol-certification` (`abbcd70c`)**, which branches from `94cde817` and is **not yet on `main`**.

| Commit | Branch | What it changes | Identity / permission relevance | Review result |
|---|---|---|---|---|
| `94cde817` fix(identity): backfill plan and legal hold permissions — **V178** | HEAD, main | Seeds `tenant.plan.read`, `tenant.plan.manage` (module TENANT) and `compliance.hold.manage` (INVOICE). Grants them to customer `ADMIN`, and `tenant.plan.read` to `FINANCE_MANAGER`, in `kind='CUSTOMER'` tenants only | **Yes** | ✅ Matches `DefaultPermissionCatalogue` (codes and modules) and `DefaultRoleCatalogue`; never reaches a platform role. **Runtime-verified locally** (Flyway at V178): in all 10 customer tenants ADMIN holds the three codes and FINANCE_MANAGER holds plan-read; no other role holds them. Caveat S25 |
| `00fa3550` fix(peppol): queue business document validation submissions — **V179** (ledger `ACCEPTED_FOR_SEND`) | integration | The BDV service **queues** the supplied envelope for the AS4 retry scheduler instead of transmitting inline; the controller only adds `transportState` to the response | Authorisation **unchanged**: `@RequiresPermission(platform.certification.bdv.execute)`, the TEST-network plus TEST-infrastructure gate, `requireMfaVerified`, tenant from the session | ✅ No identity impact |
| `2c0ef76c` fix(peppol): suppress disregard TDD for validation artifacts | integration | TDD orchestration: validation-artifact provenance port and adapter | none | ✅ No identity impact |
| `8234d12d` feat(identity): grant business document validation permission — **V180** | integration | Adds `platform.certification.bdv.execute` to `PEPPOL_TEST_OPERATOR` in `PlatformRoleCatalogue`. V180 grants it to every **PLATFORM-kind** tenant's `PEPPOL_TEST_OPERATOR` role, and fails the migration if the V134 permission row is missing | **Yes** | ✅ The design is sound: TEST-operator authority only; production roles are not granted; the join on `tenant_type='PLATFORM'` matches the V052 trigger; an explicit existence check. **The endpoint becomes reachable** for the TEST operator. The guard test drops the code from `KNOWN_UNREACHABLE`. The new `BusinessDocumentValidationAuthorizationIntegrationTest` covers MFA ✓ / no MFA 401 / a platform user without the permission 403 / a customer admin 403 / another tenant / unauthenticated, but **not an impersonation token** (see S1). Notes: the grant also lands on the inert `PEPPOL_TEST_OPERATOR` role in the *production* platform tenant (unassignable there per V091, so harmless); caveat S25 |
| `abbcd70c` test(peppol): prove the certification upgrade path from V177 | integration | One test: from TEST's V177 state, one Flyway run applies exactly V178 → V179 → V180, validates, and each effect holds; no customer ADMIN gains `platform.*` | Yes (verifies migrations) | ✅ Good coverage of the composed upgrade; staged-path tests remain separate |
| `5bb00b59`, `c8221501`, `1583751f`, `2dc631c2` | main | Docs and ledger only | none | — |

**Effect on this review:**
- **Business document validation (P6).** On `main`/`94cde817` and on the local stack (database at V178; V179/V180 not applied), `platform.certification.bdv.execute` is held by **no role** and the endpoint always returns 403. On `integration/peppol-certification` it is held by `PEPPOL_TEST_OPERATOR` (TEST realm), so the endpoint is **reachable** there under the TEST gates. The P6 row and the "codes no role holds" list are branch-dependent accordingly.
- **S1 widens once V180 deploys.** Impersonation has no restriction on the target tenant, so a `PLATFORM_SUPPORT` operator in the production realm could impersonate the TEST-authority realm's `PEPPOL_TEST_OPERATOR` (enabled and unlocked). The token would carry `platform.certification.bdv.execute` and `platform.certification.seller.attest` with `mfa_verified=true`, which is enough to queue caller-supplied bytes to the Peppol TEST network under Fawtir's AP certificate. The same already applies today to seller attestation.
- **Guard-test drift (S26).** `EnforcedPermissionIsGrantableGuardTest.KNOWN_UNREACHABLE` still lists `platform.smp.readiness.evaluate` and `platform.smp.ap-profile.manage` as grants that "can never resolve". The local database shows both **present and granted to `PLATFORM_SUPPORT`**. `dispatch.read`, `dispatch.recover` and `smp.participant.reonboard` are confirmed held by no role.

## Executive summary

1. **Authorisation is by permission only.** There are two enforcement mechanisms with different freshness: `@RequiresPermission` reads the cached `PermissionResolver`; `@PreAuthorize` reads JWT claims. Platform operators are ordinary MFA users of a PLATFORM-kind tenant.
2. **MFA is mandatory for everyone and identical for platform, customer and PEPPOL_TEST users.** EMAIL_OTP always satisfies it; TOTP is optional; the backend never tells the client which factor to use. The frontend's email-code login matches policy.
3. **Platform-role assignment is not exclusive to its dedicated, fenced path.** The generic user and role endpoints assign platform roles in the platform tenant without the fences or the platform audit event (S2). Impersonation gives a support operator the target's entire authority, enough to self-escalate (S1). Platform role changes do not reach the permission cache (S3). The last-admin rule is weak (S4).
4. **Adding operators has no clean path.**
   - Direct creation: admin-set permanent password and the generic bypass.
   - Invitations: no link, and roles via the bypass.
   - A role-less platform user: impossible (no VIEWER role).

   Adding operators remains **blocked**; the target is invitation, after the backend fixes.
5. **Safe to integrate now:**
   - the existing operator list and role management (done)
   - password recovery
   - own sessions
   - authenticator enrolment
   - admin session revocation

   **Everything else in operator management needs backend work first.**

## Roles, permissions and assignment

### Role-related endpoints

**Common to every row:**
- **Tenant context** comes from the JWT `tenant_id` claim or the portal cookie session, never from the path, and RLS is set per transaction.
- **CSRF:** a portal-cookie caller needs an allow-listed Origin plus `X-CSRF-Token` on every non-GET (`PortalCsrfFilter.java:39-52`); a bearer caller is exempt.
- **Common errors:** `401 unauthenticated`, `403 insufficient-permission` (both authorisation mechanisms share the slug), and `500 internal-error` for anything unhandled.
- **Idempotency-Key:** only `POST /users` requires one.

| # | Method, path | Controller → service | Authorisation | MFA | Audit event | Cache / session impact | Notable status codes | Classification |
|---|---|---|---|---|---|---|---|---|
| R1 | POST `/api/v1/roles` | `RoleController:39` → `RoleManagementService.createCustomRole` | `admin.roles.manage` | — | `IdentityRoleCreated` | — | 201; 400 unknown code; 403 platform code; 409 duplicate; concurrent duplicate → 500 | SAFE_FOR_FRONTEND |
| R2 | GET `/api/v1/roles` | `:46` → `listRoles` | `role.list` | — | — | — | 200 | SAFE (in the platform tenant it also lists `PLATFORM_OPERATOR` and `PEPPOL_TEST_OPERATOR`) |
| R3 | GET `/api/v1/roles/matrix` | `:60` → `matrix` | `role.list` | — | — | — | 200 | SAFE (catalogue drift, below) |
| R4 | GET `/api/v1/roles/{id}` | `:66` | `role.read` | — | — | — | 200; 404 | SAFE |
| R5 | PATCH `/api/v1/roles/{id}` | `:72` → `updateRole` (replaces the permission set) | `admin.roles.manage` | — | `IdentityRoleUpdated` | evicts all permission cache entries | 403 system role or platform code; 400; 404 | SAFE |
| R6 | DELETE `/api/v1/roles/{id}` (soft) | `:79` → `deleteRole` | `admin.roles.manage` | — | `IdentityRoleDeleted` | evicts all | 403 system role; 409 while any edge exists (including edges of deactivated users) | SAFE |
| R7 | GET `/api/v1/permissions` | `PermissionCatalogueController:51` | `role.read` | — | — | — | 200 | SAFE (the catalogue, not the database) |
| R8 | GET `/api/v1/users/{userId}/roles` | `UserRolesController:34` → `RoleAssignmentService.listUserRoles` | `admin.roles.manage` | — | — | — | 200; 404 | SAFE |
| R9 | POST `/api/v1/users/{userId}/roles` `{roleIds}` | `UserRolesController:40` → `RoleAssignmentService.assignRoles` → `assignRolesById` | `admin.roles.manage` | **none** | `IdentityRoleAssigned` per new role | evicts the user's cache entry; JWT and sessions untouched | 200; 404 user or role; null id → 500; a TEST-realm role in production fails V091 at commit (UNVERIFIED status) | **HIGH_RISK · POTENTIALLY_BYPASSING_POLICY** |
| R10 | DELETE `/api/v1/users/{userId}/roles` (bulk, JSON body) | `:47` → `revokeRoles` | `admin.roles.manage` | none | `IdentityRoleRevoked` | evicts | as R9 | **HIGH_RISK · POTENTIALLY_BYPASSING_POLICY** (no last-admin fence) |
| R11 | DELETE `/api/v1/users/{userId}/roles/{roleId}` | `:54` → `revokeRole` | `admin.roles.manage` | none | `IdentityRoleRevoked` | evicts | as R9 | **DUPLICATED** (of R10) · HIGH_RISK |
| R12 | POST `/api/v1/platform/operators/{userId}/roles/{roleCode}` | `PlatformOperatorRoleController:67` → `PlatformRoleAssignmentService.grantPlatformRole` | `@PreAuthorize platform.operators.manage` (reads the **JWT claim**) | `requireMfaVerified`: the `mfa_verified` claim; portal sessions always pass | `PlatformRoleGranted`, also on a no-op, with `rolesBefore` | **no eviction event, no session revocation** | 200 (reply defect below); 401 if the MFA claim is missing; 403 self-grant; 404 user not in the platform tenant; **500 unknown or wrong-case code** | SAFE_FOR_FRONTEND (the Operators screen), with caveats |
| R13 | DELETE `/api/v1/platform/operators/{userId}/roles/{roleCode}` | `:77` → `revokePlatformRole` | as R12 | as R12 | `PlatformRoleRevoked`, also on a no-op | as R12 | 200; 403 last `PLATFORM_TENANT_ADMIN`; 401; 500 unknown code | SAFE_FOR_FRONTEND, with caveats; the fence can be bypassed through R10/R11 |
| R14 | GET `/api/v1/me/entitlements` | `MeController:27` → `EntitlementsService` | authenticated | — | — | reads through the cached `PermissionResolver`, not the JWT | 200 | SAFE_FOR_FRONTEND (display only) |

The code-based role assignment inside `POST /users` and invitations (`roleCodes`) is covered under
direct creation and invitations. It uses the same generic adapter and the same bypass.

### Role → permission matrix (source catalogues, confirmed against the local runtime database)

**Platform roles** (`PlatformRoleCatalogue.java:51-132`). `provisionPlatformRoles` creates all three in **every** PLATFORM-kind tenant, both the production and the TEST-authority realm. V091 makes the other realm's roles unassignable.

| Role | Permissions | Local runtime (production platform tenant) |
|---|---|---|
| `PLATFORM_TENANT_ADMIN` | `platform.tenants.manage`, `platform.operators.manage` (V053 backfill too), `admin.users.manage`, `admin.roles.manage`, `role.read`, `role.list` | 6 permissions ✔ |
| `PLATFORM_SUPPORT` | `platform.support`, 14 × `platform.smp.*` (ap-profile.manage, blocker.edit/review/activate, submission.verify, evidence.record, readiness.evaluate, compliance.edit/approve, security.manage, operations.manage/review, legal.record, architecture.record), `platform.selfbilling.counterparty.verify`, `platform.dispatch.recover` | 17 ✔ |
| `PEPPOL_TEST_OPERATOR` | `platform.peppol-test.manage`, `platform.certification.seller.attest` (V140) | 2 ✔ — present in the production realm, but unassignable there (V091) |
| **Legacy `PLATFORM_OPERATOR`** | `platform.tenants.manage` | 1 ✔ — enabled system role; see below |

**The legacy `PLATFORM_OPERATOR` role** is created by application code, not by any migration: `DefaultRoleCatalogue.PLATFORM_ROLES` (`:49-57`) is materialised by `TenantIdentityCatalogueService.catalogueFor(PLATFORM)`.
- It is the default administrative role of a PLATFORM tenant's first user (`DefaultRoleCatalogue:42-47`). Bootstrap then revokes it.
- It is still assignable through the generic paths (R9, `POST /users`, invitations).
- The dedicated path rejects it with a 500 and cannot show or revoke it, because replies filter it out.
- It cannot be edited or deleted, because it is a system role.

**Customer roles** (`DefaultRoleCatalogue.java:59-138`; 7 per customer tenant locally):

| Role | Permissions | Local count |
|---|---|---|
| ADMIN | every catalogue code except `platform.*`: admin.users/roles/settings.manage, role.read/list, tenant.plan.read/manage, compliance.hold.manage, customer.\*, supplier.\*, product.\*, purchase-order.\*, invoice.\*, creditnote.\*, debitnote.\*, selfbilling.\*, reports.read, webhooks.manage, mobile.full, ota.\*, smp.participant.view/manage, smp.reconcile | 49 |
| FINANCE_MANAGER | invoice.submit/read/approve, creditnote.submit, debitnote.submit, selfbilling.submit, reports.read, tenant.plan.read | 8 |
| ACCOUNTANT | invoice.submit/read, creditnote.submit, debitnote.submit, reports.read | 5 |
| VIEWER | invoice.read, reports.read | 2 |
| APPROVER | invoice.read, invoice.approve, reports.read | 3 |
| MOBILE_USER | mobile.full, invoice.read | 2 |
| INTEGRATION | invoice.submit/read, creditnote.submit, debitnote.submit, selfbilling.submit, webhooks.manage | 6 |

**The codes asked about:**

| Code | Held by | Seeded by | Enforced by |
|---|---|---|---|
| `admin.users.manage` | ADMIN, PLATFORM_TENANT_ADMIN | V008 | `@RequiresPermission` ×17 (users, invitations, sessions…) |
| `admin.roles.manage` | ADMIN, PLATFORM_TENANT_ADMIN | runtime catalogue | RoleController, UserRolesController |
| `platform.operators.manage` | PLATFORM_TENANT_ADMIN | V053 | `@PreAuthorize` (JWT) on operator roles/email; `@RequiresPermission` inside `PlatformOperatorEmailService` |
| `platform.tenants.manage` | PLATFORM_TENANT_ADMIN, **legacy PLATFORM_OPERATOR** | V044 | `@PreAuthorize` (JWT) ×8 (tenants, company review, plan catalogue) |
| `platform.support` | PLATFORM_SUPPORT | V008 | impersonation, mTLS principal, SMP services |
| `platform.peppol-test.manage` | PEPPOL_TEST_OPERATOR | runtime catalogue | PEPPOL_TEST tenant service, SMP external test adoption |
| `admin.settings.manage` | ADMIN only (no platform role) | runtime catalogue | 42 places, including API keys and the activity log |
| `tenant.plan.read` / `.manage` | ADMIN (+FINANCE_MANAGER read) | V178 | PlanController |
| `compliance.hold.manage` | ADMIN | V178 | legal-hold endpoints |

**Codes no role holds:**
- `platform.certification.bdv.execute` (V134): its execute path is unreachable **on `main` and locally**. On `integration/peppol-certification`, V180 grants it to `PEPPOL_TEST_OPERATOR` (see *Recent commits reviewed*).
- `dispatch.read` / `dispatch.recover` (V031, deliberately unattached) and `smp.participant.reonboard` (V042): enforced by endpoints, but missing from the catalogue.
- The old V008 codes (user.\*, role.\*, device.\*, apikey.\*, report.\*…): in the database, enforced by nothing.
- `role_templates` is dead code.

### How the platform namespace is enforced

| Layer | What it covers | What it does **not** cover |
|---|---|---|
| `TenantManagedPermissionPolicy` | refuses `platform.*` / `PLATFORM*` codes on custom roles, API-key scopes, OAuth scopes and catalogue provisioning | assigning an **existing** platform role to a user |
| `trg_role_permissions_platform_scope` (V052, V063) | a `platform.*` permission only on roles of a PLATFORM-kind tenant (`role_permissions`) | `user_roles` |
| `trg_peppol_test_role_assignment` (V091, deferred, SECURITY DEFINER) | PEPPOL_TEST_OPERATOR ⇔ the TEST-authority realm (`user_roles`) | production platform roles |
| `PlatformRoleAssignmentService` | MFA claim, production realm, no self-grant, catalogue codes, last-admin fence, audit | anything reached through R9–R11, `POST /users` or invitations |
| RLS on users, roles, role_permissions, user_roles | tenant isolation | `user_roles` checks only the user's tenant; no constraint ties the role's tenant to the user's tenant |

### Role mutation rules

| Guard | Dedicated platform path (R12/R13) | Generic role endpoints (R9–R11) | `POST /users`, invitations |
|---|---|---|---|
| MFA | JWT claim (portal sessions always pass) | none | none |
| Target realm check | production PLATFORM only | none | none |
| No self-grant | yes — but it compares the **JWT subject**, so an impersonation token defeats it (finding S2) | **no** | not applicable (new user) |
| Catalogue codes only | yes (case-sensitive; anything else → 500) | **no**: any enabled role in the tenant, by id | **no**: any role, by code (upper-cased) |
| Caller must hold what they grant | no | **no** | **no** |
| Last-admin fence | PLATFORM_TENANT_ADMIN only; counts holders who are not deleted (**locked or disabled holders still count**) | **none** | — |
| Customer ADMIN last-admin protection | — | **none anywhere** | — |
| Audit | `PlatformRoleGranted` / `Revoked` (also on a no-op) | `IdentityRoleAssigned` / `Revoked` (real changes only) | `IdentityRoleAssigned` + `IdentityUserCreated` / `IdentityInvitation*` |
| Permission cache eviction | **none** | per user | none needed for a new user |

**The grant reply defect, confirmed from source and proven live** (`PlatformRoleAssignmentService.changePlatformRole`):
1. The first `findAssignedRoles` loads the user with its full `userRoles` collection, soft-deleted edges included, into the persistence context.
2. A role never held before is persisted as a new `UserRoleEntity` that sets only the owning side, and the code does not refresh afterwards (the by-id variant does, at `UserRoleAssignmentRepositoryAdapter.java:188-193`).
3. The second read returns the cached, initialised collection, so the reply omits the new role.

Revoke and re-grant mutate an edge instance that is already in the collection, so those replies are correct. The frontend compensates (`rolesAfter`). The unit test mocks the second read, so it never exercises this.

### Drift a frontend could trip over

- `/permissions` and `/roles/matrix` show the **catalogue**, while role writes accept any code present in `identity.permissions`, including old and uncatalogued ones.
- Roles are addressed three ways: generic endpoints take **ids**, creation and invitations take **codes** (upper-cased), and the platform endpoint takes an **exact, case-sensitive code**.
- `VIEWER` is the default role for creation and invitations but **does not exist in the platform tenant** (runtime-confirmed), so an omitted `roleCodes` there returns 404.
- `/me/entitlements` reads the database through the permission cache. `@PreAuthorize` endpoints (`platform.tenants.manage`, `platform.operators.manage`) read **JWT claims**, stale for up to 15 minutes for bearer tokens. The menus and the actual access can therefore disagree.
- A missing MFA claim returns **401** (not 403) on R12, R13 and the operator email endpoint. A client that treats every 401 as "signed out" will sign the operator out.
- **Cache mode depends on deployment.**
  - `fawtir.identity.distributed-state-enabled` defaults to **false**: an in-memory cache with **no TTL**.
  - The `prodlike` profile turns it on: Redis with a 5-minute TTL. That is what the local stack runs (`SPRING_PROFILES_ACTIVE=prodlike`).
  - Other profiles depend on `FAWTIR_IDENTITY_DISTRIBUTED_STATE_ENABLED`. It was not checked on TEST (not touched).

## Authentication, MFA, sessions, logout, CSRF

**The gateway** has no controllers; `core-api-route` (`Path=/api/**`) forwards everything to core. It adds:
- a permit list (`GatewaySecurityConfiguration:142-163`)
- an edge cookie check that verifies the HMAC signature only, not whether the session was revoked
- pre-auth per-IP rate limits: login 20/min, MFA 20, refresh 30, password reset 10, other `/auth/` 40

No core endpoint checks a *role* (`hasRole` is used nowhere); authorisation is by permission only.

### Endpoints

Legend:
- **CSRF:** EX = exempt (in `PortalCsrfFilter.PUBLIC_POSTS`, or a safe method); CK = checked when the `FAWTIR_SESSION` cookie is present.
- **MFA:** every authenticated session passed MFA (`requiresMfa()` always returns `true`); "re-assert" means the service also calls `requireMfaVerified()`.

| # | Method, path | Controller → service | Authorisation | CSRF | Audit event | Session impact | Notable statuses | Classification |
|---|---|---|---|---|---|---|---|---|
| A1 | POST `/auth/login` | `AuthenticationController:37` → `LoginService.login` | public | EX | `LoginFailed` on a wrong password only | none: **always** returns an MFA challenge (JWT, 5 min, IP-bound) | 200; 401 `authentication-failed` (uniform); 429 | SAFE |
| A2 | POST `/auth/mfa/otp/request` `{challengeToken, factor}` | `MfaController:64` → `MfaChallengeService.requestOtp` | public | EX | **none** | none; each call replaces the code | 202; 401 (policy, unsupported factor, no destination, revoked challenge all look the same); 429 | SAFE |
| A3 | POST `/auth/mfa/verify` `{challengeToken, factor, code, device…, portalCookie}` | `MfaController:55` → `MfaVerificationService.completeLogin` | public | EX | `MfaChallengeSucceeded`; failure is a metric only | **creates the session** and refresh family; sets cookies; resets the failed-login counter | 200; 401; 403 (a new mobile device needs EMAIL_OTP); 429 | SAFE · HIGH_RISK |
| A4 | POST `/auth/refresh` (cookie or body) | `AuthenticationController:53` → `RefreshTokenRotationProcessor` | public | checked only when the refresh cookie is present | `RefreshTokenRotated`; `RefreshTokenReplayDetected` | rotates the token; reuse revokes the family and the session | 200; 401; **500 if cookie and body are both sent** | SAFE |
| A5 | POST `/auth/logout` | `LogoutController:20` → `SessionManagementService.logoutCurrent` | authenticated | CK | `SessionRevokedByUser` (no distinct logout event) | revokes the current session and its refresh tokens; clears 3 cookies | 204; 401 (`session-expired` leaves the cookies in place); 400 `ambiguous-credentials`; CSRF 403 → **401** (defect) | SAFE |
| A6 | POST `/auth/forgot-password` `{username}` | `AccountRecoveryController:16` | public | EX | **none** | none | always 202 | SAFE · HIGH_RISK |
| A7 | POST `/auth/reset-password` `{token, newPassword}` | `:22` → `AccountRecoveryService.resetPassword` | public (emailed token only, **no MFA**) | EX | `IdentityPasswordReset` | revokes all sessions and refresh tokens; sends `PASSWORD_CHANGED` | 204; 400 policy; 401 | SAFE · HIGH_RISK |
| A8 | POST `/auth/verify-email`, `/auth/verify-email/resend` | `:28`, `:34` | public | EX | `IdentityEmailVerified`, `EmailVerificationResent` | none | 204/202; 401 | SAFE |
| A9 | POST `/auth/invitations/accept` | `InvitationAcceptanceController:29` | public (token) | **CK** (missing from PUBLIC_POSTS) | `IdentityInvitationAccepted` | **creates no session** | 201; 400; 401; 409 | SAFE (see invitations) |
| A10 | POST `/auth/signup`, `/signup/verify`, `/signup/*` steps | `SignupController` | public | EX for 6 steps; **CK for business-category, business-type, final-submission, status** (inconsistent) | `IdentitySelfServiceSignup…`, `Signup…` | onboarding token only | 201/200/202/204; 401; 429 | SAFE (already integrated) |
| A11 | GET `/auth/jwks`, `/.well-known/jwks.json` | `JwksController` | public (the gateway permits `/auth/jwks` only) | — | — | — | 200 | INTERNAL_ONLY · DUPLICATED |
| A12 | POST `/auth/token`, `/auth/revoke`, `/auth/introspect`; `/auth/clients/**` | `OAuthController` | client secret; `admin.settings.manage` for client admin | EX / CK | `OAuthTokenIssued`, `OAuthTokenRevoked` | OAuth clients only; `/auth/revoke` **cannot revoke a user refresh token** | 200/201/204; 401 | INTERNAL_ONLY · HIGH_RISK (client admin) |
| A13 | GET `/me/entitlements` | `MeController:27` | authenticated | — | — | — | 200 | SAFE_FOR_FRONTEND (integrated) |
| A14 | POST `/me/mfa/totp/enroll` `{password?, currentTotp?, recoveryCode?}` | `MfaController:43` → `MfaEnrollmentService.beginTotpEnrollment` | authenticated; step-up only when *replacing* (5/hour) | CK | `MfaReplacementStepUp` | none | 200; 401; 409 | SAFE · HIGH_RISK |
| A15 | POST `/me/mfa/totp/confirm` `{code, enrollmentChallenge}` | `MfaController:50` | authenticated | CK | `MfaEnrolled` / `MfaReplaced` plus notice | sets MFA; returns **10 backup codes** once | 200; 400; 401 | SAFE |
| A16 | GET `/me/sessions`; DELETE `/me/sessions/{id}`; DELETE `/me/sessions` | `SessionController:29,32,38` | authenticated | EX / CK | `SessionRevokedByUser`, `AllOtherSessionsRevokedByUser` | revokes session(s) and refresh tokens | 200/204; 404 | SAFE |
| A17 | GET/POST/DELETE `/me/devices…` (enrol needs `Idempotency-Key`; transfer challenge) | `DeviceController` → `MobileDeviceService` | authenticated | EX / CK | `DeviceEnrolled`, `DeviceRevoked`, `DeviceTransferChallengeRequested` (written in a read-only transaction — likely lost, UNVERIFIED) | a transfer or revoke revokes that device's sessions | 200/204; 403; 409 | SAFE (mobile) |
| A18 | GET `/me/privacy/export`; POST `/me/privacy/erasure-requests` | `PrivacyRightsController:19,22` | authenticated; no step-up | EX / CK | `PrivacyDataExported`, `PrivacyErasureRequested` | erasure revokes all sessions | 200/202 | SAFE |
| A19 | DELETE `/users/{userId}/mfa` (admin MFA reset) | `MfaController:70` → `resetForUser` | `admin.users.manage`; **no re-assert, no privilege-ordering or self check** | CK | `MfaDisabled {reason: ADMIN_RESET}`; notice `MFA_RESET_BY_ADMIN` | revokes the target's sessions (MFA challenges and pending enrolments stay alive) | 204; 403; 404 | **HIGH_RISK · POTENTIALLY_BYPASSING_POLICY** |
| A20 | GET `/users/{userId}/sessions`; DELETE `/users/{userId}/sessions/{sessionId}` | `UserSessionAdministrationController` | `admin.users.manage` | EX / CK | `SessionRevokedByAdmin` | revokes the session | 200/204; 404 | SAFE |
| A21 | GET/DELETE `/sellers/{userId}/devices[/{deviceId}]` | `AdminSellerDeviceController` | `admin.users.manage` | EX / CK | `DeviceRevokedByAdmin` | revokes device sessions | 200/204 | SAFE (mobile) |
| A22 | GET / PUT `/identity/policy` | `TenantIdentityPolicyController:17,21` | `admin.settings.manage` (no platform role holds it); PUT: **no re-assert** | EX / CK | `TenantIdentityPolicyUpdated` | future logins | 200; 400 | GET SAFE (tenant admin only) · PUT HIGH_RISK |
| A23 | GET `/security-test/*` | `dev/SecurityTestController` | `dev` profile plus a flag only | — | — | — | — | INTERNAL_ONLY · LEGACY |

**Endpoints that do not exist:**
- self-service password change (`/me/password`)
- `/me` profile read or update
- TOTP disable
- recovery-code regenerate or remaining count
- WebAuthn (a flag exists, no code)
- admin password reset
- revoking a user refresh token without a live access token

### Login and MFA — identical for platform operators, customer users and PEPPOL_TEST authority users

Nothing in login looks at the tenant type. The only tenant gate is `enabled AND identityStatus = READY AND NOT deleted`. The realms differ only later: platform-only operations refuse the TEST realm.

1. **Password** (`LoginService:63-127`).
   - The username maps to its tenant through `username_global_lookup`.
   - Enabled, locked and expired states are checked *before* the hash comparison.
   - Unknown user, non-ready tenant and wrong password all get the same `401 authentication-failed`.
   - A correct password **always** returns `mfaRequired=true` with `mfaChallengeToken` (5-minute JWT, IP-bound), `tokenType`, `issuedAt` and the expiries. All 14 fields are present, null where unused. The non-MFA branch is dead code, so `LoginSucceeded` is never written.
2. **Factor.** MFA is **per tenant, always mandatory**. The allowed factors come from `identity.tenant_identity_policies.allowed_mfa_factors`, default `TOTP, EMAIL_OTP, BACKUP_CODE`, and V026 forces EMAIL_OTP or SMS_OTP to be present. There is **no per-user required factor and no preference**: the client names the factor on every call. Available factors:
   - TOTP: SHA-1, 6 digits, 30-second step, ±1 step
   - EMAIL_OTP: 6 digits, 5 minutes, stored as a peppered HMAC
   - SMS_OTP: behind a flag, off by default
   - BACKUP_CODE: 10 × 16-character codes, created at TOTP confirm
   - WebAuthn: not implemented
3. **Send the code** (A2). **Verify** (A3):
   - The replay guard is spent *before* the code is checked, and the OTP is deleted on the first attempt, so **one wrong code burns the challenge** and the client must restart from the password step.
   - The factor is checked **against the tenant policy only, not the user's enrolled factor**.
4. **The session is issued** at `SessionTokenService.createLoginSession`, reached from A3.

**Cookies** (written only with `portalCookie:true`; bearer tokens are then stripped from the body):

| Cookie | Content | HttpOnly | Secure | SameSite | Path | Max-Age |
|---|---|---|---|---|---|---|
| `FAWTIR_SESSION` | `tenantId.sessionTokenId.HMAC` | yes | yes | Strict | `/` | ≤ 8 h |
| `FAWTIR_REFRESH` | raw refresh token | yes | yes | Strict | `/api/v1/auth` | ≤ 8 h |
| `FAWTIR_CSRF` | 32 random bytes | **no** (double-submit) | yes | Strict | `/` | ≤ 8 h; **not renewed on refresh** |

**Proven:**

| Question | Answer |
|---|---|
| PLATFORM_USER_MFA | **Mandatory**. Any factor in the platform tenant's allowed list. The local runtime row is `mfa_required=t, BACKUP_CODE,EMAIL_OTP,TOTP`. `requireMfaVerified` only checks that the session passed *some* factor |
| CUSTOMER_USER_MFA | **Identical**: mandatory, same default factors (all 10 local customer policies) |
| EMAIL_OTP_ALLOWED_FOR_PLATFORM | **YES** (default and local runtime) |
| TOTP_REQUIRED_FOR_PLATFORM | **NO**. Nothing requires TOTP; even a user with TOTP enrolled may finish with EMAIL_OTP |
| BACKEND_EXPOSES_REQUIRED_FACTOR | **NO**. The MFA-required response has no factor list or hint, and the policy GET needs `admin.settings.manage` |
| Frontend email-code login vs policy | **No conflict** under the default and local policies, including the bootstrap operator (no TOTP, no backup codes). It **breaks** if a tenant's policy drops EMAIL_OTP (an opaque 401 that cannot be told apart). It **silently downgrades** users who enrolled TOTP, which the backend accepts (security finding S5) |

### Sessions, refresh, logout

- **Lifetimes:** access token 15 min; idle 30 min (sliding); hard limit 8 h; MFA challenge and OTP 5 min; impersonation 10 min idle / 15 min hard. **Unlimited concurrent sessions**, and logging in again does not revoke earlier ones.
- **Per-request checks:**
  - A portal cookie session reloads the user and authorities from the database on every request.
  - Bearer `@PreAuthorize(hasAuthority)` uses JWT claims, up to 15 minutes old.
  - `@RequiresPermission` always goes through the cached `PermissionResolver`.
  - Session validity (revoked, idle, hard expiry, user enabled and unlocked) is checked on every request in both modes.
- **Refresh:** rotates the token; reuse revokes the family and the session; the user's state is re-checked.
- **Logout:** revokes the current session and its refresh tokens only, and clears all three cookies after success. Other sessions remain. CSRF is required.

**Effect on active sessions:**

| Event | Effect |
|---|---|
| Role change through R9–R11, or role edit or delete | permission cache evicted; JWT claims lag up to 15 min; sessions not revoked |
| Platform role grant or revoke (R12/R13) | **no eviction**; stale up to 5 min (Redis, prodlike) or until restart (in-memory); sessions not revoked |
| Password reset | all sessions and refresh tokens revoked (MFA challenges and other reset tokens are not) |
| Operator email change | all sessions, refresh tokens and MFA challenges revoked; verification tokens deleted; `email_verified` reset |
| Lock / deactivate | sessions and refresh tokens revoked (devices too on deactivate); the per-request check also refuses |
| Admin MFA reset | sessions revoked |
| Privacy erasure request | sessions revoked; the user can sign in again |

### CSRF — and the known 401 defect (root cause confirmed from source)

**The rule** (`PortalCsrfFilter:42-59`): a non-safe method carrying `FAWTIR_SESSION`, and not in `PUBLIC_POSTS`, needs an allow-listed `Origin` **and** `FAWTIR_CSRF` equal to `X-CSRF-Token` (constant-time compare). Filter order: portal cookie authentication, then CSRF, then bearer.

**Why a CSRF refusal becomes `401 unauthenticated`:**
1. The cookie filter binds the tenant only around session validation, then restores the empty context. The request's tenant context is set later, by `ContextInterceptor`, a Spring MVC interceptor that runs *after* the filters.
2. On rejection, `auditRejection` runs **before** the 403 is written and calls `IdentityAuditService.record` with no try/catch. The transaction manager sets `app.tenant_id=''`.
3. The RLS `WITH CHECK (is_platform_admin() OR tenant_id = current_tenant())` on `identity.security_audit_events` (V009:206-208) rejects the insert, and the exception leaves the filter.
4. The container re-dispatches to `/error`. Core does not permit the ERROR dispatch (`anyRequest().authenticated()`), and `OncePerRequestFilter` skips re-authentication, so the entry point writes **401**.

The `CsrfRejected` audit row is never written. The gateway fixed this same pattern for itself; core did not. The unit test mocks the audit service, so the path has never been exercised.

### Password and MFA lifecycle

- **Password:**
  - No self-service change and no admin reset.
  - Forgot password always answers 202; the reset token lives 30 min, stored as a hash.
  - Reset validates the policy, refuses the current password, writes history, revokes sessions and sends `PASSWORD_CHANGED`.
  - Policy: 12–128 characters, four character classes, no reuse of the last five (history is written on reset only). The common-password list is dead code: every entry is shorter than 12.
  - **No forced change on first sign-in**: `credentialsNonExpired` exists, but `expireCredentials()` is never called.
- **Lockout:** 5 wrong passwords lock the account for 15 minutes. **Wrong MFA codes never count.** An admin lock is permanent until an admin unlocks it. A password reset does not unlock.
- **MFA:**
  - TOTP enrolment: begin (pending secret, 10 min) → confirm, which returns 10 backup codes once. Replacing an existing factor needs a step-up.
  - No TOTP disable, backup-code regenerate or remaining count.
  - Admin reset: A19, with the gaps noted there.

## User administration, invitations, account lifecycle

### Endpoints

**Common to every row:**
- **Tenant** always comes from the session, never from a request field. User lookups add an explicit `tenantId` predicate, so an id from another tenant → 404.
- **API keys** get 401 on any mutation that records an actor.
- **`admin.users.manage`** is held by customer **ADMIN** and by **PLATFORM_TENANT_ADMIN** (not PLATFORM_SUPPORT).

| # | Method, path | Controller → service | Authorisation | MFA | Idempotency | Audit event | Session impact | Notable statuses | Classification |
|---|---|---|---|---|---|---|---|---|---|
| U1 | GET `/users` (paged) | `UserController:37` → `listUsers` | `admin.users.manage` | login | — | — | — | 200 | SAFE_FOR_FRONTEND (integrated). Deleted users hidden; **no lock state** in `RecordUserResponse` |
| U2 | GET `/users/{id}` | `:43` → `getUser` | same | login | — | — | — | 200; 404 | SAFE |
| U3 | POST `/users` `{username, email, password, names, phone, language, timezone, roleCodes}` | `:77` → `UserCreationService.createUser` | same | login; no step-up | **`Idempotency-Key` required** (16–128 `[A-Za-z0-9._:-]`, 24 h, request hash) | `IdentityUserCreated` + `IdentityRoleAssigned` per role | emails `EMAIL_VERIFICATION` (code) and `WELCOME` | 201; 400 (bean, key, policy); 404 unknown role (**default `VIEWER` is missing in the platform tenant**); 409 username (platform-wide), email (in tenant), key conflict; 409 `plan-limit-reached`; 500 (V091 trigger, Kafka) | customer: SAFE · **platform tenant: HIGH_RISK · POTENTIALLY_BYPASSING_POLICY** |
| U4 | PATCH `/users/{id}` `{firstName, lastName, phone, languageCode, timezone}` | `:63` → `updateUser` | same | login | — | `IdentityUserUpdated` | — | 200; 400; 404; phone 31–50 characters probably → 500 (column is 30; UNVERIFIED) | SAFE (the phone is the SMS factor destination: no step-up) |
| U5 | POST `/users/{id}/lock` | `:49` → `lockUser` | same | **none** | natural | **NONE** | revokes all sessions and refresh tokens (not pending MFA challenges) | 204; 404 | **HIGH_RISK** (no guards, no audit) |
| U6 | POST `/users/{id}/unlock` | `:56` → `unlockUser` | same | none | natural | **NONE** | — | 204; 404 | SAFE (audit gap) |
| U7 | DELETE `/users/{id}` (deactivate = soft delete) | `:69` → `deactivateUser` | same | **none** | repeat → 404 | `IdentityUserDeactivated` | revokes sessions, refresh tokens, devices; **role rows left active** | 204; 404 | **HIGH_RISK** (no self or last-admin guard; no undo) |
| U8 | POST `/users/invitations` `{email, roleCodes ≤20}` | `UserInvitationController:50` → `UserInvitationService.invite` | same | login | open invitation unique per email | `IdentityInvitationIssued {roleCodes}` | `TEAM_INVITATION` email (code only) | 201; 404 role (VIEWER default in platform); 409 member or open invitation; 409 plan limit; 500 race | customer: SAFE (but not production-ready) · platform: **POTENTIALLY_BYPASSING_POLICY** |
| U9 | GET `/users/invitations?status&page&size`; GET `/users/invitations/{id}` | `:58`, `:67` | same | — | — | — | — | 200; 404 | SAFE (list has no total) |
| U10 | POST `/users/invitations/{id}/resend` | `:73` → `resend` | same | login | rotates the token | `IdentityInvitationResent` | re-emails | 200; 404; 409 accepted or revoked | SAFE (does not re-check the people ceiling) |
| U11 | POST `/users/invitations/{id}/revoke` | `:79` → `revoke` | same | login | conditional | `IdentityInvitationRevoked` | — | 200; 404; 409 | SAFE |
| U12 | POST `/auth/invitations/accept` `{token, username, password, names…}` (**public**) | `InvitationAcceptanceController:29` → `InvitationAcceptanceService.accept` | token | none at accept | single-use | `IdentityInvitationAccepted` + `IdentityRoleAssigned` | no session issued; WELCOME | 201; 401 (any token problem); 404 role drift (**leaks role codes**); 409; **500** (username taken in another tenant, or not matching V174) | SAFE, with defects |
| U13 | PUT `/platform/operators/{userId}/email` `{expectedCurrentEmail, newEmail, reason}` | `PlatformOperatorEmailController:53` → `PlatformOperatorEmailService` → `…Mutator` | `platform.operators.manage` (claim **and** live) | **re-assert** | `alreadyApplied` | `PlatformOperatorEmailChanged` (no addresses; username + reason) | revokes all sessions, refresh tokens and MFA challenges; deletes verification tokens; `emailVerified=false` | 200; 401 MFA; 403 permission or realm; 404; 409 expected-email mismatch or email taken; 415 | SAFE_FOR_FRONTEND (platform) · HIGH_RISK — see gaps |
| U14 | POST `/tenants` (creates the customer admin) | `TenantController:41` → `TenantProvisioningService` → `createTenantAdministrator` | `platform.tenants.manage` | login | — | `IdentityRoleAssigned` only (**no `IdentityUserCreated`**) | admin password chosen by the operator; **no password policy** (length only) | 201; 400; 409 | INTERNAL_ONLY · HIGH_RISK |
| U15 | POST `/platform/peppol/test-tenants/{id}/first-administrator` | `PeppolTestTenantAdministratorController:53` | `platform.peppol-test.manage` | re-assert | exact-match retry | `PeppolTestTenantAdministratorProvisioned` (username in metadata) | an admin that cannot log in (V091) but **can be impersonated** | 200; 409 | INTERNAL_ONLY |
| U16 | POST `/bootstrap/tenant` | `InitialTenantBootstrapController:38` | `X-Fawtir-Bootstrap-Secret` + `fawtir.bootstrap.enabled` + empty database | — | one-shot | via onboarding | binds `CreateTenantCommand` **including `kind`** | 200; 401; 409; 500 | INTERNAL_ONLY · LEGACY · POTENTIALLY_BYPASSING_POLICY |
| U17 | POST `/tenants/{id}/company-verification/manual-attestation` / `rejection` | `TenantController:55,69` | `platform.tenants.manage` | login | `expectedRevision` | `IdentitySignupAccountActivated` (listener); company history | enables or keeps disabled the signup admin | 200; 403 four-eyes; 409 | integrated (Verification slice) |
| U18 | POST `/tenants/{id}/deprovisioning` | `TenantController:96` → `TenantDeprovisioningService` | `platform.tenants.manage` | none | idempotent close | **none in identity** | tenant disabled; **sessions and refresh tokens keep working (≤ 8 h)**; no kind check | 202; 404; 500 (TEST realm) | **HIGH_RISK** |
| U19 | GET `/identity/metrics` | `TenantIdentityMetricsController:16` | `admin.settings.manage` | — | — | — | — | 200 | SAFE (customers; counts only) |

**Endpoints that do not exist:** reactivate or undelete, username change, customer-user email change, and an authenticated change-password.

### Direct creation (`POST /users`, and `createTenantAdministrator` behind U14–U16)

| Question | Finding |
|---|---|
| Who sets the first password | The **creator**. It is permanent, not temporary (`passwordChangedAt=now`, `credentialsNonExpired=true`). `POST /users` applies `PasswordPolicyService`; `createTenantAdministrator` checks **length only** (its Javadoc claims otherwise) |
| FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN | **NO**. `credentials_non_expired` exists, but `User.expireCredentials()` is never called, and if it were set it would *block* login (a uniform 401), not force a change |
| ADMIN_SEES_OR_SETS_PASSWORD | **YES — sets it** (never echoed back). The creator also picks the unverified email that receives EMAIL_OTP, so **the creator holds both factors** |
| Username | Supplied by the creator and lower-cased. **Unique platform-wide** (`uk_users_username_global_lookup`), so a 409 on create enumerates usernames across tenants |
| Email | Unique **per tenant**; the indexes include soft-deleted rows, so a deactivated user's email is reserved forever |
| Tenant | The session tenant only (no request field) |
| Default role | `VIEWER` when `roleCodes` is empty. **VIEWER does not exist in the platform tenant** (runtime-confirmed) → 404, full rollback |
| PLATFORM_USER_WITH_NO_ROLE_ALLOWED | **NO**. No API produces a role-less user |
| DEFAULT_ROLE_EXISTS_FOR_PLATFORM_TENANT | **NO** |
| Role list in the request | **Accepted, by code.** It checks only that the role exists and is enabled in the tenant. In the production platform tenant, PLATFORM_TENANT_ADMIN, PLATFORM_SUPPORT and the **legacy PLATFORM_OPERATOR** are all assignable; only PEPPOL_TEST_OPERATOR is refused (V091 at commit → 500). **Proven live in the Operators slice:** `POST /users` with `roleCodes:[PLATFORM_SUPPORT]` → 201 with the role |
| GENERIC_USER_CREATE_CAN_ASSIGN_PLATFORM_ROLES | **YES** |
| GENERIC_CREATE_BYPASSES_PLATFORM_ROLE_RULES | **YES**. No realm check (V091 only), no catalogue limit (PLATFORM_OPERATOR allowed), no MFA re-assert (weak, since login is always MFA), no four-eyes |
| GENERIC_CREATE_BYPASSES_PLATFORM_ROLE_AUDIT | **YES**. `IdentityUserCreated` / `IdentityRoleAssigned`, never `PlatformRoleGranted` |
| People ceiling | The platform tenant has no subscription row and falls back to the default plan (`BUSINESS`, which allows extra people), so effectively no ceiling. `createTenantAdministrator` never checks it |
| Emails | `POST /users`: `EMAIL_VERIFICATION` (a code) and `WELCOME`. `createTenantAdministrator`: **none** |

### Invitations

| Question | Finding |
|---|---|
| Creation | U8 (`admin.users.manage`) |
| Token | `fawtir_inv_<tenantUUID>.<base64url(32 random bytes)>` (256 bits). Binds purpose and tenant, not email or invitation id. Only the SHA-256 hash is stored |
| Expiry | `fawtir.identity.invitations.ttl`, default **P7D** |
| Single use | Conditional updates on accept, revoke and replace-token, plus an expiry check. Any token problem → the same 401 |
| Email content | "Use this invitation code to create your account: <raw token>", the expiry, and "sign in with the tenant code X" (**stale**: login takes no tenant code). **No link, and no frontend URL setting exists** |
| Public accept | U12. The invitee chooses username and password (policy applied). The email comes from the invitation and is marked verified. **No V174 pattern and no global username pre-check** (→ 500) |
| Tenant resolution | From the token (server-side) ✔. **Tenant state is not checked**: a closed or disabled tenant still gets the user |
| Role assignment | The inviter's `roleCodes`, re-resolved at acceptance through the **generic** path. In the platform tenant: platform roles with none of the dedicated fences, and no `PlatformRoleGranted` |
| MFA after acceptance | None at accept; first login is password + EMAIL_OTP (mandatory policy). No forced TOTP enrolment |
| Resend | Rotates the hash (the old token dies) and resets the expiry. Does not re-check the people ceiling |
| Revoke | Conditional; repeat → 409 |
| Audit | `IdentityInvitationIssued` / `Resent` / `Revoked` / `Accepted` (no email in metadata). **The invitation email is stored in plaintext** (unlike `identity.users`) |
| Other defects | Invitations survive the inviter being demoted or deactivated. Role drift between invite and accept returns 404 to an unauthenticated caller with the role codes |

| Flag | Answer |
|---|---|
| PLATFORM_OPERATOR_INVITATION_SUPPORTED | **PARTIAL**: works in the production realm only with platform `roleCodes`, and then bypasses the dedicated role policy; no link |
| CUSTOMER_INVITATION_SUPPORTED | **YES** (API complete), not production-ready |
| PUBLIC_ACCEPT_INVITATION_SUPPORTED | **YES** |
| INVITATION_EMAIL_HAS_ACCEPT_LINK | **NO** |
| INVITATION_FLOW_PRODUCTION_READY | **NO** |

### Account state model

**User flags:**
- `enabled`
- `accountNonLocked` (+ `lockedAt`, `lockExpiresAt`)
- `accountNonExpired` and `credentialsNonExpired` (never set false by any code)
- `deleted` (+ `deletedAt`, `deletedBy`)
- `emailVerified`, `phoneVerified`, `mfaEnabled`
- `failedLoginAttempts`

There is **no "pending" or "invited" user state**: an invitation is a separate row until acceptance, and "pending" is a signup admin with `enabled=false`.

| State | Login | Existing sessions | Roles grantable / revocable | In `GET /users` | Counts as "last admin" | Audit |
|---|---|---|---|---|---|---|
| `enabled=false` (signup pending) | refused (uniform 401) | refused per request, not revoked | yes | shown, `enabled=false` | **yes** | — |
| Admin lock (permanent) | refused | revoked at lock | yes | shown **as enabled — no lock indicator** | **yes** | **none** |
| Automatic lock (5 bad passwords, 15 min) | refused until expiry | **refused until the next login attempt clears it** | yes | shown as enabled | yes | log only |
| `deleted` (deactivated) | refused | sessions, refresh tokens, devices revoked | **every API → 404** (rows stay active) | hidden | no | `IdentityUserDeactivated` |
| `emailVerified=false` | **no effect** | — | — | shown | — | — (EMAIL_OTP still sent to the unverified address) |

**Tenant gate at login:** `enabled && identityStatus=READY && !deleted` only.
- A `POST /tenants` tenant is `enabled=true` while PENDING, so its admin can sign in before verification.
- Signup tenants start disabled.
- **Closing or disabling a tenant does not end its sessions**: session validation and refresh ignore tenant state.

**Known findings, re-checked from source:**
1. Deactivated users keep active role rows — **confirmed**.
2. The role API then refuses them with 404 — **confirmed** (also proven live), so the rows cannot be cleaned through any API.
3. Locked or disabled (not deleted) admins count toward the last-admin fence — **confirmed**.

There is no reactivation endpoint.

### Email change (platform operators — U13)

**What it does:**
- permission checked twice; MFA re-asserted; production-realm fence
- `expectedCurrentEmail` compared under a row lock
- new address unique within the realm, deleted users included
- a reason is required
- idempotent (`alreadyApplied`: no second revocation, no audit)
- revokes the target's sessions, refresh tokens and MFA challenges; deletes verification tokens; sets `emailVerified=false`
- audit `PlatformOperatorEmailChanged` without addresses
- login identity is unaffected (login is by username)

**Gaps:**
- **no notice to the old address**
- **no verification email to the new address** — `emailVerificationRequired` is advisory, because `emailVerified` gates nothing
- the new, unverified address becomes the EMAIL_OTP destination at once
- the target need not hold an operator role

There is no customer-user email change and no username change.

### Lock, unlock, deactivate

- **Tenant scoping** holds.
- **Missing guards:**
  - no self-lock or self-delete guard
  - **no last-admin guard** (customer ADMIN or PLATFORM_TENANT_ADMIN)
  - no MFA step-up
  - lock and unlock are **not audited**
- **Session effects:** lock revokes sessions; deactivate revokes sessions and devices. None of the three revokes pending MFA challenges, open invitations the user sent, or API keys.
- **Losing the last admin:** a customer tenant has no API route to re-provision one. The platform realm's bootstrap refuses to run again, so recovery needs SQL.

## Platform tenant, impersonation, support, API keys

### Endpoints (not covered above)

| # | Method, path | Controller → service | Authorisation | MFA | Audit event | Effect | Classification |
|---|---|---|---|---|---|---|---|
| P1 | POST `/support/impersonations` `{tenantId, userId, supportTicket, reason}` | `ImpersonationController:23` → `ImpersonationService.start` | `platform.support` (live) | `requireMfaVerified` (claim only) | `ImpersonationRequested` (actor tenant), `ImpersonationStarted` (target tenant) | a 15-minute session and JWT **for any user in any tenant** (target must be enabled and unlocked), carrying **the target's roles and permissions and `mfa_verified=true`**; no refresh; no stop endpoint (end with `POST /auth/logout` using the impersonation token); no end event | **HIGH_RISK · POTENTIALLY_BYPASSING_POLICY** |
| P2 | POST / DELETE `/support/mtls-principals[/{id}]` | `MtlsPrincipalController` → `MtlsPrincipalService` | `platform.support` | **none** | `MtlsPrincipalRegistered` / `Disabled` (actor tenant only) | cross-tenant machine principal (`ota.*` only); certificate chain not validated in this code | INTERNAL_ONLY · HIGH_RISK |
| P3 | GET / POST / DELETE `/tenants/{tenantId}/apikeys[/{keyId}]` (+ `/sellers/{id}/apikeys`, `/apikeys` + rotate) | `TenantApiKeyController`, `SellerApiKeyController`, `ApiKeyController` → `ApiKeyService` | `admin.settings.manage` (path tenant must equal the caller's) | none | `ApiKeyCreated` (**scopes not recorded**), `ApiKeyRevoked`, `ApiKeyRotationStarted` | long-lived credential; **scopes not capped by the minter's permissions** (only `platform.*` is refused); optional expiry | SAFE (tenant admin) · HIGH_RISK under impersonation · DUPLICATED |
| P4 | POST `/platform/peppol/test-tenants`, `…/certification-fixture/*` | `PeppolTestTenantController`, `CertificationFixtureController` | `platform.peppol-test.manage` | re-assert | `PeppolTestTenantCreated`, `CertificationInvoiceIssued` | TEST realm only | INTERNAL_ONLY |
| P5 | POST `/platform/certification/seller-attestation` | `CertificationSellerAttestationController` | `platform.certification.seller.attest` | **none** | **none** (log only) | TEST tenants (V139 trigger) | INTERNAL_ONLY |
| P6 | POST `/platform/certification/business-document-validation` | `BusinessDocumentValidationController` | `platform.certification.bdv.execute`: **no role on `main`/locally**; `PEPPOL_TEST_OPERATOR` on `integration/peppol-certification` (V180) | re-assert | ledger | `main`: always 403 (fail-closed). Integration line: queues the supplied envelope for the AS4 retry scheduler (V179), TEST gates only | INTERNAL_ONLY |
| P7 | GET `/settings/activity-log` | `ActivityLogController` | `admin.settings.manage` | — | — | the caller's own tenant only | SAFE (customers); **no platform role can read it** |
| P8 | GET `/actuator/metrics`, `/actuator/prometheus` | Spring actuator | any authenticated principal (API keys included) | — | — | platform-wide identity counters | INTERNAL_ONLY (should be restricted) |

### Platform tenant and PEPPOL_TEST rules

- **Identification.**
  - The platform tenant is `tenant_type = PLATFORM` (`kind` mirrors it; `ck_tenants_kind_matches_type`).
  - The TEST authority realm is `purpose = PEPPOL_TEST_AUTHORITY`; the production realm is any other purpose. At most one platform tenant per purpose.
- **`PlatformOperatorBootstrapRunner`**
  - Only when `fawtir.bootstrap.platform.enabled=true`.
  - One-shot and fail-closed on the required `fawtir.bootstrap.platform.*` keys: legal name, tax and CR numbers, address, operator username, email, password.
  - Creates the PLATFORM tenant, the catalogue and the mandatory MFA policy. The first user gets the legacy PLATFORM_OPERATOR role; `grantOperatorRoles` then assigns PLATFORM_TENANT_ADMIN + PLATFORM_SUPPORT and revokes the rest.
  - These bootstrap grants are **not audited**.
- **Platform operators across tenants.** They act across tenants only through server-side platform or tenant context:
  - tenant create, verify and deprovision
  - impersonation
  - mTLS principals
  - PEPPOL_TEST fixtures and attestations
  - dispatch recovery
  - SMP administration

  Their ordinary API calls are RLS-scoped to the platform tenant. They cannot read customer audit logs, and no platform role can read the platform's own trail either.
- **Login.** Platform users sign in through the ordinary `/auth/login` with no realm-specific rule. Invoice submission is refused for platform-typed tenants.
- **PEPPOL_TEST.**
  - V091 constraints and triggers:
    - PEPPOL_TEST tenants stay CUSTOMER, PENDING or CLOSED, disabled, identity PENDING
    - the authority realm is PLATFORM
    - `PEPPOL_TEST_OPERATOR` ⇔ the authority realm
  - **No one can log in to a PEPPOL_TEST tenant** (the login gate), but **impersonation and session validation ignore tenant state**, so its admin can be impersonated.
  - Only the bootstrapped PEPPOL_TEST_OPERATOR logs in to the authority realm.

### Impersonation — lifecycle and risk

**Lifecycle:**
1. `POST /support/impersonations`
2. MFA claim check, then `ImpersonationRequested`
3. Load the target in the target tenant (enabled and unlocked only)
4. Create a `UserSession` (device type `IMPERSONATION`, 10 min idle / 15 min hard)
5. JWT with the target's claims plus `impersonation=true`, `impersonator_id`
6. `ImpersonationStarted`

It ends only by expiry or logout. There is no end event.

**Guards that exist:**
- `platform.support`
- the MFA claim (not fresh)
- nested impersonation is blocked
- identity audit rewrites the actor to the impersonator

**Missing guards:**
- target tenant type or status
- operators as targets
- self-targeting
- read-only mode
- fresh MFA step-up
- customer notification
- rate-limit group

**Effective authority** is the **target's**: all their `admin.*` and `platform.*` permissions.

- **Escalation (proven from source, not live):** a PLATFORM_SUPPORT operator impersonates a PLATFORM_TENANT_ADMIN. The platform grant's no-self-grant check compares against `requireUserId()`, which is now the impersonated admin. The support operator can therefore be granted PLATFORM_TENANT_ADMIN, move operator emails, mint API keys or users, or break company-verification four-eyes.
- **Misattribution:** outside identity audit, actions are recorded against the impersonated user (for example company history `decided_by`).

**Risk: CRITICAL.**

## Audit coverage

Every event goes through `IdentityAuditService.record` → `security_audit_events`: IP and user agent encrypted, metadata plaintext JSON. The only reader is P7, own tenant only.

| Action | Event | Status |
|---|---|---|
| Create user (`POST /users`) | `IdentityUserCreated` | ✔ |
| Create tenant admin (`POST /tenants`, PEPPOL_TEST first admin, bootstrap) | `IdentityRoleAssigned` only | **MISSING `IdentityUserCreated`** |
| Invite: issue / resend / revoke / accept | `IdentityInvitation*` | ✔ |
| Grant or revoke a role — generic | `IdentityRoleAssigned` / `Revoked` | ✔ (but not the platform event on the platform tenant) |
| Grant or revoke a platform role — dedicated | `PlatformRoleGranted` / `Revoked` (also on no-ops) | ✔ |
| Platform role grants at bootstrap | — | **MISSING** |
| Change email (operator) | `PlatformOperatorEmailChanged` | ✔ (username + reason in metadata) |
| Change password (self) | — | no endpoint |
| Password reset | `IdentityPasswordReset` | ✔ (**the request itself MISSING**) |
| Admin MFA reset | `MfaDisabled {ADMIN_RESET}` | ✔ (generic name) |
| MFA enrol / replace | `MfaEnrolled` / `MfaReplaced` / `MfaReplacementStepUp` | ✔ |
| Lock / unlock (admin) | — | **MISSING** |
| Automatic lockout | log only | **MISSING** |
| Deactivate | `IdentityUserDeactivated` | ✔ |
| Reactivate | — | no endpoint |
| Impersonation start / end | `ImpersonationRequested`, `ImpersonationStarted` / — | start ✔ · **end MISSING** |
| Login success | `MfaChallengeSucceeded` (`LoginSucceeded` is dead code) | ✔ |
| Login failure | `LoginFailed` for a wrong password only | **MISSING** for locked, disabled, unknown user, non-ready tenant and **all MFA failures** |
| OTP sent | — | **MISSING** |
| Logout | `SessionRevokedByUser` | ✔ (no distinct event) |
| CSRF rejection | `CsrfRejected` | **never persisted** (RLS defect) |
| Tenant create / verify / deprovision | — (company history for verification) | **MISSING** in identity audit |
| API keys | `ApiKeyCreated` / `Revoked` / `RotationStarted` | ✔ (**scopes not recorded**) |
| Seller attestation | log only | **MISSING** |

## Platform operator lifecycle — is there a clean supported path today?

| Step | Path today | Clean? |
|---|---|---|
| Create operator | only `POST /users` or an invitation with **platform `roleCodes`** (the generic bypass); the first operator comes from the bootstrap runner | **NO** |
| Assign first role | at creation, by the generic path (a role-less platform user is impossible) | **NO** |
| Change / remove roles | dedicated R12/R13 (integrated on `/console/operators`) — but R9–R11 can do the same with no fences | **PARTIAL** |
| Change email | U13 | **PARTIAL** (no old-address notice, no new-address verification) |
| Set / reset password | self only: forgot → emailed token → reset. No admin reset, no self change | **PARTIAL** |
| MFA enrolment | self: `/me/mfa/totp/enroll` + `confirm` (optional; EMAIL_OTP needs none) | ✔ (self) |
| Login → MFA challenge → session | identical to customers (A1–A3) | ✔ |
| Logout | A5 | ✔ |
| Lock / unlock | generic U5/U6 — no last-admin guard, no audit, lock state not visible | **NO** |
| Deactivate / reactivate | U7 — no last-admin guard, roles left active / reactivation **not supported** | **NO** |
| Delete | soft delete only (U7) | — |

**Proven:**

| Flag | Answer |
|---|---|
| CAN_CREATE_PLATFORM_OPERATOR | **YES** — only through the generic path with platform role codes |
| CAN_CREATE_WITHOUT_ROLE | **NO** |
| CAN_CREATE_WITH_PLATFORM_ROLES | **YES** |
| SHOULD_CREATE_WITH_PLATFORM_ROLES | **NO** |
| ROLE_ASSIGNMENT_USES_DEDICATED_POLICY | **NO** — the dedicated policy exists but is not the only path |
| GENERIC_USER_CREATE_CAN_ASSIGN_PLATFORM_ROLES | **YES** |
| GENERIC_CREATE_BYPASSES_PLATFORM_ROLE_RULES | **YES** |
| GENERIC_CREATE_BYPASSES_PLATFORM_ROLE_AUDIT | **YES** |

## Security findings (consolidated, deduplicated)

**Verification column:**
- **SRC** — confirmed in source by the review and re-checked by the lead reviewer
- **SRC\*** — confirmed in source by the review only
- **LIVE** — also proven against the local stack

Nothing destructive or escalating was exercised live.

| ID | Severity | Finding | Evidence (main) | Verified |
|---|---|---|---|---|
| S1 | **CRITICAL** | **Impersonation is unrestricted and carries the target's full authority.** A `platform.support` holder can target any user in any tenant (the PLATFORM realm, the TEST realm, PEPPOL_TEST and closed tenants included). The token carries the target's `admin.*` and `platform.*` permissions and `mfa_verified=true`. That defeats the no-self-grant rule (a support operator can be granted PLATFORM_TENANT_ADMIN) and company-verification four-eyes, and allows moving operator emails or minting API keys, users and invitations that outlive the session. Outside identity audit, actions are attributed to the impersonated user. **Once V180 deploys** (integration line), impersonating the TEST realm's `PEPPOL_TEST_OPERATOR` also gives business-document validation, which queues caller-supplied bytes to the Peppol TEST network under Fawtir's AP certificate (seller attestation is already exposed the same way). The new BDV authorisation test does not cover impersonation tokens | `ImpersonationService:43-58`; `JwtTokenServiceImpl:134-149`; `RequiresPermissionAspect:51-91` (blocks only re-impersonation); `PlatformRoleAssignmentService:309-317` | SRC |
| S2 | **HIGH** | **The generic identity paths hand out platform roles in the production platform tenant** — `POST /users` `roleCodes`, invitations, `/users/{id}/roles` — bypassing MFA, the realm check, catalogue-only codes, no-self-grant, the last-admin fence and `PlatformRoleGranted`. PLATFORM_TENANT_ADMIN can give **itself** PLATFORM_SUPPORT (and so impersonation). The legacy **PLATFORM_OPERATOR** (`platform.tenants.manage`) is assignable, and the platform API cannot show or revoke it | `RoleAssignmentService:60-143` (no platform check); `UserRoleAssignmentRepositoryAdapter:34-56,159-196`; `UserCreationService:69-70`; `UserInvitationService:178-194` | SRC · LIVE (`POST /users` with PLATFORM_SUPPORT → 201) |
| S3 | **HIGH** | **Platform role grants and revokes never evict the permission cache or revoke sessions.** In-memory cache (the default): **no TTL**, so stale until restart. Redis (`prodlike`, local): 5 min. `@PreAuthorize` JWT claims: up to 15 min for bearer tokens. A revoked support operator keeps `platform.support`, impersonation included | `PlatformRoleAssignmentService:328-341`; `PermissionCacheConfiguration:49-79`; `application.yml:689,748` | SRC |
| S4 | **HIGH** | **Last-admin protection is weak or absent.** No fence on generic revoke, lock or deactivate; the platform fence counts locked or disabled holders; **customer ADMIN has no last-admin protection anywhere**. Recovery then needs SQL (the bootstrap refuses to run again; customers have no re-provision route) | `UserAdministrationService:47-124`; `UserRoleAssignmentRepositoryAdapter:296-315` | SRC |
| S5 | **HIGH** | **Mailbox access is enough to take over any account, including platform operators.** EMAIL_OTP is always allowed; the factor is checked against the tenant policy, not the user's enrolled factor; password reset needs only the emailed token. Enrolling TOTP does not close the EMAIL_OTP path | `MfaVerificationService:143,174-180`; `AccountRecoveryService:98-136` | SRC\* |
| S6 | MEDIUM | **Admin MFA reset** (`DELETE /users/{id}/mfa`): no re-assert, no privilege-ordering or self check; challenges and pending enrolments survive. Any `admin.users.manage` holder in the platform tenant can reset a platform admin's MFA | `MfaEnrollmentService:234-252` | SRC\* |
| S7 | MEDIUM | **No lockout and no audit for wrong MFA codes.** Unlimited single guesses, one per password login, limited only by per-IP rate limits | `AuthenticationEventListener:17-28`; `MfaVerificationService:195-196` | SRC\* |
| S8 | MEDIUM | **Core never reads the gateway's `X-Fawtir-Client-Ip`** (the gateway strips `X-Forwarded-For`), so core's per-IP rate limits, MFA IP binding and audit IP likely all key on the gateway's address | `GatewaySignatureFilter:53`; `ClientRequestContextResolver:26-41`; `git grep` shows no core reader | SRC (runtime UNVERIFIED) |
| S9 | MEDIUM | **A CSRF refusal becomes 401, and the audit row is lost** (the audit insert fails RLS outside tenant context; the ERROR dispatch is unauthenticated) | `PortalCsrfFilter:60-75`; V009:206-208; `SecurityConfiguration:147` | SRC · observed in the Logout slice |
| S10 | MEDIUM | **Deprovisioning or disabling a tenant leaves its sessions and refresh chains alive (≤ 8 h).** No kind check, so it can close the PLATFORM tenant. Invitation acceptance ignores tenant state | `TenantDeprovisioningService` (no session code); `AccessSessionValidationService:68-95` | SRC |
| S11 | MEDIUM | **Audit gaps:** lock/unlock, automatic lockout, MFA failures, OTP sent, reset requested, tenant create/verify/deprovision, tenant-admin creation, bootstrap grants, seller attestation, impersonation end, API-key scopes; CSRF rejections never persisted | audit table above | SRC\* |
| S12 | MEDIUM | **Admin-set passwords are permanent**, and the creator also picks the unverified OTP email, so the creator holds both factors. `createTenantAdministrator` skips the password policy | `UserCreationService:53-78`; `UserAdministrationService:143-196` | SRC\* |
| S13 | MEDIUM | **Operator email change:** no old-address notice and no new-address verification; the unverified address becomes the OTP destination at once; the target need not hold an operator role | `PlatformOperatorEmailMutator:88-113` | SRC\* |
| S14 | MEDIUM | **API-key scopes are not capped by the minter's permissions** (`admin.*` allowed; expiry optional) | `ApiKeyService:39-44` | SRC\* |
| S15 | MEDIUM | **Impersonation tokens can use the target's self-service credential endpoints** (first TOTP enrolment, devices, erasure) | `MfaEnrollmentService:105-107` | SRC\* |
| S16 | MEDIUM | **Username enumeration across tenants** through a 409 on create. **Five bad logins kill a victim's live sessions** until their next login attempt | `UserCreationService:95-98`; `LoginAttemptService:45-82` | SRC\* |
| S17 | MEDIUM | **The platform tenant accepts custom roles with tenant-operational permissions** | `RoleManagementService:249-266` | SRC\* |
| S18 | LOW | **Grant reply omits a first-time role** (compensated in the frontend) | section above | SRC · LIVE |
| S19 | LOW | **500 for caller mistakes:** unknown or wrong-case platform role code, wrong realm, acceptance username collision or pattern, refresh cookie + body, null role id | various | SRC · LIVE (non-catalogue code → 500) |
| S20 | LOW | **The bootstrap HTTP endpoint binds `kind`** and could create the PLATFORM realm (gated by the secret and an empty database) | `InitialTenantBootstrapController:41`; `CreateTenantCommand:31-37` | SRC |
| S21 | LOW | **Invitation hygiene:** email plaintext at rest; stale tenant-code copy; role drift leaks role codes to an unauthenticated caller; invitations outlive the inviter | `V167:37`; `OtpEmailRenderer:55-70` | SRC\* |
| S22 | LOW | **Deactivation leaves role rows**; no undelete; username and email reserved forever | `UserAdministrationService:104-124` | SRC · LIVE |
| S23 | LOW | **Other low items:** actuator metrics readable by any authenticated principal; mTLS registration without MFA; seller attestation without MFA or audit; privacy erasure requests never processed; timing-based username enumeration; `LoginResponse.toString` prints the challenge token; recovery-code step-up not normalised; inconsistent CSRF exemption list (invitations/accept, 4 signup steps) | see sections | SRC\* |
| S25 | LOW | **The permission backfills cannot revive a soft-deleted grant.** V178 and V180 insert `role_permissions` with `ON CONFLICT DO NOTHING` on the (role, permission) key. A pre-existing soft-deleted edge (`deleted=true`) is left deleted, so the grant silently does not take effect on that role while the migration reports success. Likewise, V178's permission insert conflicts on `code`, and its grant then joins `NOT permission.deleted`, so a soft-deleted permission row would make the grant a silent no-op. No such rows exist locally; unlikely in practice | V178 grant `ON CONFLICT DO NOTHING`; V180 idem | SRC (branch `integration/peppol-certification` for V180) |
| S26 | INFO | **Guard-test drift.** `EnforcedPermissionIsGrantableGuardTest.KNOWN_UNREACHABLE` says `platform.smp.readiness.evaluate` and `platform.smp.ap-profile.manage` "can never resolve", but the local runtime shows both seeded and granted to `PLATFORM_SUPPORT`. The allow-list is stale, or its static analysis (the `MANAGE_PERMISSION` constant ambiguity) is wrong; either way the test hides a real gap check | guard test lines 58-74; local database query | SRC · LIVE (read-only) |
| S24 | INFO | **Stale or wrong comments:** `CertificationFixtureUseCase:30-31`, `CreateTenantCommand:31-37`, `PlatformRoleAssignmentService:51-53,97-103`, `ProvisionPeppolTestTenantAdministratorUseCase:32-36`, and the "MFA re-assertion" wording (it is a claim check, not a fresh MFA) | — | SRC\* |

## Backend blockers (before any further platform user-management UI)

1. **S1 — fence impersonation.**
   - Refuse platform-typed, TEST and PEPPOL_TEST targets, and non-ACTIVE tenants.
   - Strip `admin.*` and `platform.*` and credential-minting authority from the impersonation token.
   - Refuse role, email, API-key, OAuth and MFA changes under the `impersonation` claim.
   - Require a fresh step-up and add an end event.
   - **Deployment ordering:** `integration/peppol-certification` (V179/V180) makes BDV reachable for `PEPPOL_TEST_OPERATOR`. Either fence impersonation of TEST-realm operators first, or explicitly accept that a `PLATFORM_SUPPORT` operator can reach BDV and seller attestation through impersonation. Add an impersonation-token case to `BusinessDocumentValidationAuthorizationIntegrationTest` either way.
2. **S2 — one platform-role path.** Refuse platform-catalogue codes and `PLATFORM_OPERATOR` on the generic paths in PLATFORM-kind tenants (and consider a `user_roles` trigger). Retire the legacy PLATFORM_OPERATOR role.
3. **S3 — make platform role changes take effect.** Publish role events (or evict) from `PlatformRoleAssignmentService`, revoke the target's sessions, give the in-memory cache a TTL, and move `platform.*` checks to live `@RequiresPermission`.
4. **S4 — a correct last-admin rule.** Count only enabled, unlocked holders, and apply the fence to generic revoke, lock and deactivate, for both platform and customer ADMIN.
5. **Operator onboarding (invitation):** R1–R8 in `PLATFORM_ADD_OPERATOR_BACKEND_REQUIREMENTS.md` — link email, role-less platform user, roles only through the dedicated path.
6. **S13 — email-change notices:** tell the old address; verify the new one before it becomes an OTP destination.
7. **Lock state in `RecordUserResponse`; lock/unlock audit (S11); deactivation cleans up role rows; decide on reactivation.**
8. **S6 — admin MFA reset** needs a re-assert and privilege ordering.
9. **S9 — CSRF audit fix** (write the 403 first; audit inside the tenant context).
10. **Distinct problem types** where the UI must explain a refusal: self-grant vs last-admin vs permission; member vs open invitation.

## Frontend capability classification

| Capability | Classification | Notes |
|---|---|---|
| Platform Operators list | **READY_TO_INTEGRATE** — done (`/console/operators`) | `GET /users`; lock state not shown (not in the response) |
| Grant / revoke platform roles | **READY_TO_INTEGRATE** — done; **BACKEND_FIX_REQUIRED** for its guarantees to hold (S2, S3, S4) | The dedicated path is correct. After a change, access can lag up to 5 min (prodlike) or until restart (in-memory) |
| Add operator | **SECURITY_BLOCKED / BLOCKED_ON_BACKEND** | Only the generic bypass exists (S2); no role-less user; no invitation link (R1–R8) |
| Change operator email | **BACKEND_FIX_REQUIRED** | The endpoint is well fenced, but moves the OTP factor with no old-address notice and no new-address verification (S13), and is reachable under impersonation (S1) |
| Lock / unlock | **BACKEND_FIX_REQUIRED** | No lock state in the list, no audit, no last-admin guard |
| Deactivate | **BACKEND_FIX_REQUIRED** | No last-admin guard; role rows left active; irreversible |
| Reactivate | **NOT_SUPPORTED** | no endpoint |
| Password — self-service change | **NOT_SUPPORTED** | no endpoint |
| Password — forgot / reset (recovery) | **READY_TO_INTEGRATE** | Public, emailed token; revokes sessions. The known S5 caveat applies to the backend design, not the UI |
| Password — admin reset | **NOT_SUPPORTED** | — |
| MFA — self TOTP enrolment and backup codes | **READY_TO_INTEGRATE** | `/me/mfa/totp/enroll` → `confirm`. Login would need a factor choice (TOTP / backup code / email), because the backend does not expose the required factor. Enrolment does not remove the EMAIL_OTP path (S5) |
| MFA — admin reset | **SECURITY_BLOCKED** (S6) | — |
| MFA — disable, regenerate backup codes | **NOT_SUPPORTED** | — |
| Sessions — own (list, revoke one, revoke others) | **READY_TO_INTEGRATE** | `/me/sessions` |
| Sessions — admin view and revoke a user's sessions | **READY_TO_INTEGRATE** | `/users/{id}/sessions` (`admin.users.manage`) |
| Invitation (operators and customer team) | **BLOCKED_ON_BACKEND** | No link; operator invitations bypass the role policy (S2); several defects (S21) |
| Impersonation (support console) | **SECURITY_BLOCKED** (S1) | Must not be exposed before the fence exists |
| Platform audit log | **NOT_SUPPORTED** | No platform role can read any audit trail |
| Tenant identity policy (customer admins) | GET **READY_READ_ONLY** · PUT **BACKEND_FIX_REQUIRED** (no re-assert; can strand users) | Outside the platform console |

## "Add operator" — decision

**RECOMMENDED_ADD_OPERATOR_FLOW = NOT_SAFE_YET → target INVITATION** (as already decided by the product owner).

- **DIRECT_CREATION — rejected.**
  - The admin sets a permanent password and the unverified OTP email, so the creator holds both factors (S12).
  - There is no forced change.
  - The only way to create a platform user is with platform roles through the generic bypass (S2).
- **CREATE_THEN_GRANT_ROLE — not possible today.**
  - A role-less platform user cannot be created (no VIEWER in the platform tenant).
  - The "create" step already assigns a platform role through the bypass.
  - It would become the *second half* of the invitation design (R6) once a role-less user exists.
- **INVITATION — the right shape, not ready.**
  - The invitee owns the password, the token is single-use and time-limited, the tenant is resolved server-side, and holding the token proves the mailbox.
  - It needs a link email, platform-specific realm checks, and roles only through the dedicated path (R1–R8).
  - S1–S3 must be fixed first, or any onboarding flow inherits an escalation path.

## Recommended integration order

**Frontend work that is safe now** (each is its own authorised slice):
1. **Recovery** — forgot password → emailed token → reset, including the post-reset "all sessions ended" state.
2. **My security: sessions** — list own sessions, revoke one, revoke all others.
3. **My security: authenticator app** — TOTP enrolment with one-time backup codes, plus a factor choice at the sign-in code step (email code / authenticator / backup code).
4. **Operator session administration** — view and revoke a platform user's sessions from `/console/operators` (`/users/{id}/sessions`).

**Only after backend fixes:**
- S1–S4 first, then **invitation onboarding** (R1–R8), **email change** (S13), **lock/unlock and deactivate** (lock state, audit, last-admin), and admin MFA reset (S6).
- Impersonation UI last, after S1.

## Impact on screens already integrated

- **Login** (email code): matches policy.
  - It must restart at the password step after one wrong code (the challenge burns).
  - It cannot adapt if a tenant ever drops EMAIL_OTP.
  - Recommend adding a factor choice when TOTP enrolment ships.
- **Logout:** correct. The CSRF 401 defect (S9) can still show a false "signed out" on a CSRF failure.
- **Operators** (`/console/operators`):
  - Uses only the dedicated path.
  - Compensates for the reply defect (S18).
  - A granted operator may not gain access for up to 5 minutes (prodlike) or until restart (in-memory cache), and a revoked one may keep it (S3). Worth a note in the confirmation copy once the backend behaviour is decided.
- **Verification decisions** (`platform.tenants.manage`, `@PreAuthorize`, JWT-based): portal cookie sessions reload authorities per request, so they are unaffected by the 15-minute bearer staleness.
