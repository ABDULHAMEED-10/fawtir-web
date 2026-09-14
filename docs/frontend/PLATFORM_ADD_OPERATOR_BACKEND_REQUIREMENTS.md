# Platform — adding an operator: backend requirements (frontend blocked)

## Decision (product owner, 2026-09-12)

```
PREFERRED_OPERATOR_ONBOARDING  = INVITATION
ADD_PLATFORM_OPERATOR_FRONTEND = BLOCKED   (until the backend work below exists)
DIRECT_PASSWORD_SHARING        = DO NOT IMPLEMENT
```

Until then the console supports **existing operators and their role management only**. See
`PLATFORM_OPERATORS_HANDOFF.md` for the Operators screen at `/console/operators`.

No frontend code was written for this slice. This document is the hand-over to the backend: what is
needed, what exists today, and why the existing paths may not be used.

| | |
|---|---|
| Backend inspected | `D:\fawtir` @ `94cde817`, read only; nothing changed |
| Frontend | `feat/signup-integration` @ `2e99ca0`; no code change for this slice (this document only) |

## Why neither existing path may be used

### Direct creation — `POST /api/v1/users` — rejected

- **Platform roles bypass the dedicated grant path.** The request takes `roleCodes` and assigns them through the generic `UserRoleAssignmentService`. In the platform tenant those codes resolve to the platform roles, including the legacy `PLATFORM_OPERATOR`, which holds `platform.tenants.manage`. None of the dedicated path's safeguards apply:
  - the MFA re-assertion
  - the production-platform-tenant check
  - catalogue-only codes
  - the `PlatformRoleGranted` audit event

  Those are all in `PlatformRoleAssignmentService`. The backend's own Javadoc on that class acknowledges the `admin.users.manage` route.
- **The administrator chooses and must hand over the first password.** Nothing forces a change at first sign-in: `PasswordPolicyService` validates length, character classes, common passwords and the last five passwords, but no "must change" flag exists. That is password sharing, which is ruled out.
- **Without `roleCodes` it cannot work at all.** The default role `VIEWER` does not exist in the platform tenant (code reading, `UserCreationService.DEFAULT_ROLE`), so a platform user can only be created *with* platform roles, and therefore only through the bypass.

### Invitation — `POST /api/v1/users/invitations` + `POST /api/v1/auth/invitations/accept` — the right shape, not yet usable

What already meets the target (`UserInvitationService`, `InvitationAcceptanceService`):

| Target property | Today |
|---|---|
| Invitee sets their own password | ✅ `AcceptInvitationRequest.password`, checked by `PasswordPolicyService` |
| Time-limited | ✅ `fawtir.identity.invitations.ttl`, default `P7D` |
| Single-use | ✅ `markAccepted`; only the token hash is stored; every token problem answers the same `401` |
| Tenant resolved server-side | ✅ from the inviter's session at invite, and from the token (`AccountTokenCodec.tenantId`) at acceptance — never from the request |
| Mailbox proven | ✅ acceptance marks the email verified, because holding the token proves it |
| Audit | ⚠️ `IdentityInvitationIssued` / `IdentityInvitationAccepted` / `…Resent` / `…Revoked` — but not the platform-role grant (see below) |
| Resend / revoke / list | ✅ `POST …/{id}/resend`, `POST …/{id}/revoke`, `GET /users/invitations` |

What blocks it:

1. **The email carries no link.** `OtpEmailRenderer.renderTeamInvitation` sends the raw code ("Use this invitation code to create your account: …") with no address to use it at. It also tells the invitee to "sign in with the tenant code", a customer-tenant notion that does not apply to platform operators.
2. **Roles come from the invitation request and are assigned blindly on acceptance.** `invite` resolves the inviter's `roleCodes` against the tenant's roles, which in the platform tenant are the platform roles. At acceptance they are assigned by the generic `UserRoleAssignmentService.assignRoles`, with `VIEWER` as the default, which the platform tenant lacks. The same bypass as direct creation, one step later.
3. **Nothing is specific to the platform tenant.** The endpoints serve every tenant; nothing checks that the tenant is the *production* platform realm the way `PlatformRoleAssignmentService.requireProductionPlatformTenant` does.
4. **There is no acceptance screen in the frontend.** It cannot be built usefully until (1) defines the link it must serve.

## Required backend work

| # | Requirement | Acceptance criteria (proposed) |
|---|---|---|
| R1 | **The invitation email contains a secure one-time acceptance link** | A link to a configured frontend origin (for example `…/invitations/accept#token=…`) that carries the token in the **fragment**, not the query, so it never reaches server or proxy logs, analytics or the `Referer` header. The link targets only an allow-listed origin. Copy fit for platform operators, with no "tenant code". EN/AR if the operator's language is known |
| R2 | **The operator sets their own password** | Keep acceptance as it is (password under `PasswordPolicyService`); no path where an administrator sets or sees it |
| R3 | **The token is time-limited and single-use** | Keep: hash-only storage, TTL, `markAccepted`, uniform `401`. Accepting, revoking or resending invalidates earlier tokens. Acceptance is rate-limited like the other token endpoints |
| R4 | **The platform tenant is resolved server-side** | A platform-specific invite endpoint (for example `POST /api/v1/platform/operators/invitations`) that takes **no tenant** from the request. It verifies the inviter's tenant is the production platform realm (`tenant_type = PLATFORM`, not the Peppol TEST authority), and acceptance re-checks the tenant the token names |
| R5 | **Roles are not accepted blindly from the invitation or create request** | The platform invite request carries **no role codes** that are assigned on acceptance. At most it carries a *proposed* set, validated against `PlatformRoleCatalogue.PRODUCTION_OPERATOR_ROLES`, and it is never written by the generic assignment service. The generic `POST /users` and `POST /users/invitations` refuse `platform.*`-bearing roles (including `PLATFORM_OPERATOR`) in the platform tenant, closing the existing bypass |
| R6 | **Roles are assigned through the dedicated platform-role authorisation path** | Recommended: acceptance creates the operator with **no platform role**, which needs the platform tenant to allow a role-less, no-authority user instead of defaulting to `VIEWER`. A tenant administrator then grants roles on the Operators screen through `PlatformRoleAssignmentService`, with its MFA re-assertion, realm check, no-self-grant rule, catalogue-only codes and last-admin fence. *Alternative:* acceptance applies proposed roles by calling `PlatformRoleAssignmentService` with the inviter as the acting operator, never the generic service |
| R7 | **An audit event is recorded** | Invitation issued, resent, revoked and accepted, as today. Every role an operator receives appears as `PlatformRoleGranted` with the granting operator as actor. Audit records name ids, never addresses or tokens |
| R8 | **MFA enrollment and requirements follow platform policy** | The new operator is under the platform tenant's MFA policy from the first sign-in: mandatory MFA with no password-only session, and EMAIL_OTP to the verified address or TOTP enrollment as the policy dictates. It is covered by a test that an accepted operator cannot obtain a session without the second factor |

Also needed or recommended for the frontend to integrate cleanly:
- **Distinct problem types for the invite refusals:** already a member, open invitation exists, not the platform realm, rate limited. Today the member and open-invitation cases share `409 resource-conflict` and differ only in English `detail`.
- **The acceptance response** should say what to do next ("sign in"), with no password or token echoed.
- **Contract tests** for R1–R8.
- **The Operators-slice gaps, still open:**
  - the grant reply omits a first-time role
  - one `403` for three causes
  - a non-catalogue code returns `500`
  - deactivation leaves active role rows
  - locked holders count toward the last admin

  Details are in `PLATFORM_OPERATORS_HANDOFF.md`.

## Frontend work once unblocked (for planning; not started)

1. **Console, Operators header:** "Invite an operator" — email only, and proposed roles only if R6's alternative is chosen. A **pending invitations** list with resend and revoke (`GET /users/invitations` or the platform equivalent). One request per action, with double-submit protection and localized errors.
2. **Public acceptance screen** at the R1 link:
   - read the token from the URL fragment, then remove it from the address bar
   - name, username and password, reusing `validation.ts` (`username`, `password`, `confirmPassword`) and the signup `PasswordStrength` meter
   - one submit, then sign in
   - never store the token
3. **Role assignment stays on the existing Roles dialog.** No new role-granting UI.
4. Tests, EN/AR/RTL, browser verification against the local stack with Mailpit, and a handoff — as for every slice.

## Current state (unchanged by this slice)

- `/console/operators`: list the platform team, give or remove `PLATFORM_TENANT_ADMIN` / `PLATFORM_SUPPORT`. Integrated and browser-verified.
- No "Add operator" control exists anywhere in the console, and none will be added before R1–R8.
- `COMMITTED = NO`, `PUSHED = NO`, `BACKEND_CHANGED = NO`, `PRODUCTION_CHANGED = NO`.

## Evidence (backend source, `94cde817`)

- `identity/adapter/in/rest/UserController.java`: `POST /users`, `admin.users.manage`, `Idempotency-Key` required.
- `identity/application/service/UserCreationService.java`: `DEFAULT_ROLE = "VIEWER"`; generic `roleAssignmentService.assignRoles(savedUser, request.roleCodes(), DEFAULT_ROLE)`; email verification plus WELCOME notice.
- `identity/application/service/UserRoleAssignmentService.java` / `UserRoleAssignmentRepositoryAdapter.assignRoles`: resolves any active role of the tenant by code; no platform-role fence.
- `identity/application/service/PlatformRoleAssignmentService.java`: the dedicated path — MFA, realm, no self-grant, catalogue-only, last-admin, `PlatformRoleGranted` audit. Its Javadoc names the `admin.users.manage` route as an accepted accountability gap.
- `identity/adapter/in/rest/UserInvitationController.java`, `identity/application/service/UserInvitationService.java`: invite, list, get, resend, revoke; `resolveRoleCodes` defaulting to `VIEWER`; TTL `P7D`.
- `identity/application/service/InvitationAcceptanceService.java`: tenant from the token, single use, email verified, generic role assignment.
- `notification/application/OtpEmailRenderer.renderTeamInvitation`: code only, no link, "tenant code" copy.
- `identity/application/service/PasswordPolicyService.java`: 12–128 characters, four character classes, common-password list, last five passwords; no forced change.
- Live (Operators slice, local stack): `POST /users` with `roleCodes: [PLATFORM_SUPPORT]` in the platform tenant → `201` with the platform role assigned. This is the bypass in practice.
