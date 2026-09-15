# Local setup: fawtir-web + fawtir-backend

This guide runs the web app on your machine against a local backend. You sign in with a seeded
account and land on an authenticated page. Everything below was run on macOS on 2026-09-15 against
backend `main @ 846ac2e8` (Flyway V184) and web `main @ 532b881`.

```
browser ──► Vite dev server :5173 ──/api proxy──► gateway :8080 ──► core :8081
                                                                     │
                     Docker: Postgres :55432 · Redis :6379 · Kafka :9092 · Mailpit :1025/:8025
```

The app always calls same-origin `/api`. Vite proxies that path to the gateway, so the browser never
makes a cross-origin request, and the session lives in HttpOnly cookies on `localhost`.

---

## 1. Prerequisites

| Tool | Version needed | Tested with | Notes |
|---|---|---|---|
| Node.js | `^20.19` or `>=22.12` (Vite 7 `engines`) | 22.14.0 | |
| npm | 10.x | 10.9.2 | The repo ships `package-lock.json`. Use npm, not pnpm or yarn. |
| JDK | 25 | OpenJDK 25 (SDKMAN) | `sdk install java 25-tem` |
| Maven | 3.9+ | 3.9.16 | |
| Docker Desktop | Compose v2.24+ (for `!override`) | Engine 29.6, Compose 5.2 | Give the VM about 4 GB. |
| git, openssl | any | | |
| GitHub access | both repos | | `fawtir-web` is private under `ABDULHAMEED-10`. Ask him for write access. |

On an 8 GB machine the whole stack fits: Kafka takes about 0.5 GB, the two JVMs are capped at 1.2 GB
and 384 MB below, and Vite is small. Do not run the backend test suite while this stack is up. Both
compete for Docker and memory, and the result is fake test failures.

## 2. Clone both repos side by side

```bash
mkdir -p ~/Documents/FAWTIR/src-code && cd ~/Documents/FAWTIR/src-code
git clone https://github.com/Rixon-agency/fawtir-backend.git
git clone https://github.com/ABDULHAMEED-10/fawtir-web.git
```

The commands below assume these two paths. Adjust them if you cloned elsewhere.

---

## 3. Backend

All commands in this section run from `fawtir-backend/`.

### 3.1 JWT signing keys (once per machine)

They are gitignored and per developer.

```bash
mkdir -p core/src/main/resources/keys
openssl genpkey -algorithm RSA -out core/src/main/resources/keys/fawtir-private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in core/src/main/resources/keys/fawtir-private.pem -pubout -out core/src/main/resources/keys/fawtir-public.pem
```

### 3.2 Backing services

Only four of the compose services are needed: Postgres, Redis, Kafka and Mailpit.

**If something on your machine already listens on 5432** (check with `nc -z 127.0.0.1 5432`), create
this override so Docker's Postgres publishes on 55432 instead. The file is gitignored by the
`docker-compose.*.local.yml` rule.

```bash
cat > docker-compose.frontend-dev.local.yml <<'EOF'
services:
  postgres:
    ports: !override
      - "127.0.0.1:55432:5432"
EOF
```

```bash
docker compose -f docker-compose.yml -f docker-compose.frontend-dev.local.yml up -d postgres redis kafka mailpit
```

If you skipped the override, drop the second `-f`, and use port `5432` everywhere this guide says
`55432`.

### 3.3 A dedicated database, and the runtime role's password

The app gets its own database, `fawtir_web`, so it never shares Flyway history with anything else
in the compose Postgres. Flyway migrates as the superuser `fawtir`. The app itself connects as
`fawtir_app` (no superuser, no BYPASSRLS), the same as production since V125, so row-level security
behaves locally as it does in production.

```bash
docker exec fawtir-postgres createdb -U fawtir fawtir_web
APP_PW=$(openssl rand -hex 24)
docker exec fawtir-postgres psql -U fawtir -d postgres -c "ALTER ROLE fawtir_app LOGIN PASSWORD '$APP_PW'"
echo "$APP_PW"   # goes into SPRING_DATASOURCE_PASSWORD below
```

On a brand-new Postgres volume the `fawtir_app` role does not exist until the first migration
creates it. In that case, run core once (§3.5) with `SPRING_DATASOURCE_USERNAME=fawtir` and
`SPRING_DATASOURCE_PASSWORD=fawtir_dev`, then set the password and switch back.

### 3.4 `local-dev.env`

This file holds the environment for core and gateway. It is gitignored by the `*.env` rule. The
generator below writes it with fresh secrets. Run it once and keep the file: re-running it mints new
keys, and PII already encrypted with the old keys becomes unreadable.

```bash
APP_PW=<the value from 3.3>
R=$PWD
cat > local-dev.env <<EOF
SPRING_PROFILES_ACTIVE=dev
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:55432/fawtir_web
SPRING_DATASOURCE_USERNAME=fawtir_app
SPRING_DATASOURCE_PASSWORD=$APP_PW
SPRING_FLYWAY_USERNAME=fawtir
SPRING_FLYWAY_PASSWORD=fawtir_dev

# Shared by core AND gateway: must be byte-identical
FAWTIR_IDENTITY_PORTAL_COOKIE_SIGNING_KEY=$(openssl rand -base64 48 | tr -d '\n')

FAWTIR_IDENTITY_MFA_ENCRYPTION_KEY=$(openssl rand -base64 32)
FAWTIR_IDENTITY_OTP_PEPPER=$(openssl rand -base64 32)
FAWTIR_IDENTITY_JWT_PRIVATE_KEY_LOCATION=file:$R/core/src/main/resources/keys/fawtir-private.pem
FAWTIR_IDENTITY_JWT_PUBLIC_KEY_LOCATION=file:$R/core/src/main/resources/keys/fawtir-public.pem

# Required for login: username -> tenant goes through username_global_lookup
FAWTIR_PII_ENCRYPTION_ENABLED=true
FAWTIR_PII_CURRENT_ENCRYPTION_KEY=$(openssl rand -base64 32)
FAWTIR_PII_CURRENT_LOOKUP_KEY=$(openssl rand -base64 32)
FAWTIR_PII_CURRENT_KEY_VERSION=1

# Email chain: identity -> Kafka -> delivery consumer -> Mailpit
FAWTIR_IDENTITY_NOTIFICATION_KAFKA_ENABLED=true
FAWTIR_IDENTITY_NOTIFICATION_PAYLOAD_ENCRYPTION_KEY=$(openssl rand -base64 32)
FAWTIR_NOTIFICATION_DELIVERY_ENABLED=true
FAWTIR_NOTIFICATION_FROM_ADDRESS=no-reply@fawtir.local

# The browser origin is the Vite dev server
FAWTIR_IDENTITY_PORTAL_ALLOWED_ORIGINS=http://localhost:5173
FAWTIR_GATEWAY_ALLOWED_ORIGINS=http://localhost:5173
FAWTIR_IDENTITY_OPERATOR_INVITATION_ACCEPTANCE_URL=http://localhost:5173/operator-invitation

FAWTIR_IDENTITY_SIGNUP_TERMS_VERSION=local-terms-v1
FAWTIR_IDENTITY_SIGNUP_PRIVACY_VERSION=local-privacy-v1
FAWTIR_IDENTITY_OPENAPI_PUBLIC=true
FAWTIR_GATEWAY_API_DOCS_PUBLIC=true

# Issuing an invoice is refused everywhere unless this is on (REFERENCE_CATALOGUE_NOT_AVAILABLE)
FAWTIR_INVOICE_REFERENCE_CATALOGUE_ENABLED=true

# Seed data: one-shot runners, no-ops once the tenants exist
FAWTIR_BOOTSTRAP_RUNNER_ENABLED=true
FAWTIR_BOOTSTRAP_RUNNER_ADMIN_USERNAME=demo_admin
FAWTIR_BOOTSTRAP_RUNNER_ADMIN_EMAIL=demo.admin@fawtir.test
FAWTIR_BOOTSTRAP_RUNNER_ADMIN_PASSWORD=Local-Demo-Admin-2026
FAWTIR_BOOTSTRAP_RUNNER_ADMIN_FIRST_NAME=Demo
FAWTIR_BOOTSTRAP_RUNNER_ADMIN_LAST_NAME=Admin
FAWTIR_BOOTSTRAP_RUNNER_TIMEZONE=Asia/Muscat
FAWTIR_BOOTSTRAP_RUNNER_LEGAL_NAME="Synthetic Demo Trading LLC"
FAWTIR_BOOTSTRAP_RUNNER_TAX_NUMBER=OM0000000000
FAWTIR_BOOTSTRAP_RUNNER_COMMERCIAL_REGISTRATION_NUMBER=CR-0000000
FAWTIR_BOOTSTRAP_RUNNER_REGISTERED_ADDRESS="1 Synthetic Way, Muscat"
FAWTIR_BOOTSTRAP_PLATFORM_ENABLED=true
FAWTIR_BOOTSTRAP_PLATFORM_LEGAL_NAME="Synthetic Platform LLC"
FAWTIR_BOOTSTRAP_PLATFORM_TAX_NUMBER=OM0000000001
FAWTIR_BOOTSTRAP_PLATFORM_COMMERCIAL_REGISTRATION_NUMBER=CR-0000001
FAWTIR_BOOTSTRAP_PLATFORM_REGISTERED_ADDRESS="2 Synthetic Way, Muscat"
FAWTIR_BOOTSTRAP_PLATFORM_OPERATOR_USERNAME=operator
FAWTIR_BOOTSTRAP_PLATFORM_OPERATOR_EMAIL=operator@fawtir.test
FAWTIR_BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD=Local-Operator-2026
FAWTIR_BOOTSTRAP_PLATFORM_OPERATOR_FIRST_NAME=Local
FAWTIR_BOOTSTRAP_PLATFORM_OPERATOR_LAST_NAME=Operator
EOF
chmod 600 local-dev.env
```

Why each group of variables is there:

| Variables | Why |
|---|---|
| `SPRING_PROFILES_ACTIVE=dev` | The default profile is `prod`, which fails closed on missing secrets. `dev` supplies local mail settings and waives STARTTLS for Mailpit. |
| `SPRING_DATASOURCE_*` / `SPRING_FLYWAY_*` | The runtime connects as `fawtir_app`, and migrations run as `fawtir`. |
| `FAWTIR_IDENTITY_PORTAL_COOKIE_SIGNING_KEY` | Core signs `FAWTIR_SESSION` with this key and the gateway verifies it with the same key. If the two differ, you sign in and then get 401 on every page. |
| `FAWTIR_IDENTITY_MFA_ENCRYPTION_KEY`, `…_OTP_PEPPER` | Core refuses to boot without them. |
| `FAWTIR_IDENTITY_JWT_*_KEY_LOCATION` | `core/pom.xml` excludes `keys/` from `target/classes`, so the `classpath:` default is never found. |
| `FAWTIR_PII_*` | Login finds the tenant from the username through `username_global_lookup`, which is only written while PII protection is on. With it off, **every login returns 401**. Under `dev` nothing warns you, because the startup guard skips that profile. |
| `…NOTIFICATION_KAFKA_ENABLED`, `…PAYLOAD_ENCRYPTION_KEY`, `FAWTIR_NOTIFICATION_DELIVERY_*` | Sign-in always asks for an email code. Without this chain no code is ever sent. Turning delivery on also turns on the invoice and expenditure reminder sweeps, which need an SMTP sender and **fail at boot without one**. Mailpit is that sender. |
| `…ALLOWED_ORIGINS` | Both the gateway (CORS) and core (portal CSRF origin check) must allow `http://localhost:5173`, or state-changing calls get 403. |
| `…SIGNUP_*_VERSION` | `POST /auth/signup` answers 500 without them. |
| `FAWTIR_BOOTSTRAP_*` | Seed one customer tenant (DEMO) and the platform tenant with one operator. See §5. |

### 3.5 Run core and gateway

Use two terminals, both in `fawtir-backend/`:

```bash
set -a; source ./local-dev.env; set +a
mvn -pl core spring-boot:run -Dspring-boot.run.jvmArguments="-Xmx1200m"
```

```bash
set -a; source ./local-dev.env; set +a; unset SPRING_PROFILES_ACTIVE
mvn -pl gateway-service spring-boot:run -Dspring-boot.run.jvmArguments="-Xmx384m"
```

The gateway has no `dev` profile, and its default profile is the right one locally.

**After the first successful boot, set `FAWTIR_BOOTSTRAP_RUNNER_ENABLED=false` and
`FAWTIR_BOOTSTRAP_PLATFORM_ENABLED=false`.** The customer runner is supposed to skip when its tenant
exists. On this stack it did not: the second boot died with `admin-username is already taken
platform-wide`. (Seen 2026-09-15, runtime connecting as `fawtir_app`. The cause was not
investigated.)

The first core boot applies every migration (about 3 s) and logs two lines that show the seed
accounts were created:

```
Initial tenant bootstrap completed: tenantId=…, administratorUserId=…, identityStatus=READY
[platform-bootstrap] PLATFORM tenant provisioned: tenantId=…, operatorUserId=…, roles=[PLATFORM_TENANT_ADMIN, PLATFORM_SUPPORT]
```

Check that both are up:

```bash
curl -s localhost:8081/actuator/health
```

```bash
curl -s localhost:8080/actuator/health
```

API docs: <http://localhost:8080/docs/swagger-ui/index.html>. The spec is
`core/src/main/resources/static/docs/openapi.yaml`.

---

## 4. Front end

Run these from `fawtir-web/`:

```bash
npm ci
```

```bash
cat > .env.local <<'EOF'
FAWTIR_API_ORIGIN=http://localhost:8080
EOF
```

```bash
npm run dev -- --port 5173 --strictPort
```

Open <http://localhost:5173/login>.

**Front-end environment variables.** The front end has three.

| Variable | Read by | Default | Meaning |
|---|---|---|---|
| `FAWTIR_API_ORIGIN` | `vite.config.ts` (dev and preview server only, never bundled) | `http://localhost:8080` | Where the dev server proxies `/api`. |
| `VITE_REQUIRE_SESSION` | `src/lib/session/session.ts` (bundled) | on in `npm run dev`, off in `npm run build` | `true` makes the app send anyone without a session to sign in; `false` shows the screens without one (the Vercel prototype cannot reach the API yet). |
| `VITE_API_BASE_URL` | `src/api/client.ts` (bundled) | `/api` | Prefix for every API call. **Leave it unset.** Setting it to an absolute URL makes the browser call that host cross-origin, which works only if that host's gateway and core both allow-list your origin. |

Port 5173 matters: it is the origin the backend allow-lists above. If you change it, change both
`*_ALLOWED_ORIGINS` values and the invitation URL to match.

---

## 5. Sign in

| Account | Username | Password | Lands on | Email for the code |
|---|---|---|---|---|
| Customer admin (tenant DEMO, role ADMIN) | `demo_admin` | `Local-Demo-Admin-2026` | `/dashboard` | `demo.admin@fawtir.test` |
| Platform operator | `operator` | `Local-Operator-2026` | `/console` | `operator@fawtir.test` |
| Customer read-only (tenant DEMO, role VIEWER): for "no access" checks | `demo_viewer` | `Local-Demo-Viewer-2026` | `/dashboard` | `demo.viewer@fawtir.test` |

These passwords are synthetic and local only. Never use them anywhere else.

`demo_viewer` is not created by the bootstrap. Create it once with `POST /api/v1/users` as
`demo_admin` (it needs an `Idempotency-Key` header), using `"roleCodes": ["VIEWER"]`.

### Seed data for the screens

```bash
node tools/local-seed/seed-suppliers.mjs
```

The script signs in as `demo_admin`, reading the code from Mailpit. Through the public API it adds
14 suppliers with bills, a hold, approvals and payments, so every state on the Suppliers list
appears. It only runs against localhost. Re-running it adds only the suppliers that are missing.

```bash
node tools/local-seed/seed-customers.mjs
```

This one adds 28 customers through the API, more than one page, with every Peppol state. Issuing
real invoices belongs to the invoice slices, so what they owe is written straight into the local
database through `docker exec fawtir-postgres psql`: bare ISSUED invoice and payment rows, numbered
`SEED-INV-…`, that carry only what the receivable figures read. They have no lines, signature or QR,
and nothing sends them. The same script marks the Peppol customers' capability as verified, because
Discovery owns that field. Re-running it skips what is already there.

1. Go to `/login` and enter the username and password. There is **no tenant code**. The backend
   works out the tenant from the username and ignores a `tenantCode` if a client sends one
   (`RecordLoginRequest`).
2. The app moves to `/login/mfa` and asks the backend to email a 6-digit code.
3. Open Mailpit at <http://localhost:8025>. The message "Your Fawtir verification code" arrives
   within about 2 s.
4. Enter the code. The server sets the `FAWTIR_SESSION`, refresh and `FAWTIR_CSRF` cookies, and the
   app loads `/v1/me/entitlements` and then the landing page.

Each new code request replaces the previous code. The app enforces a 60 s resend delay. The access
token lasts 15 minutes and refreshes silently through the cookie. The refresh session lasts 8 hours.

Scripted check of the same chain, no browser (run in `fawtir-web/` or anywhere):

```bash
B=http://localhost:5173/api; O='Origin: http://localhost:5173'; J=/tmp/fawtir.jar
TOK=$(curl -s -c $J -X POST $B/v1/auth/login -H "$O" -H 'Content-Type: application/json' \
  -d '{"username":"demo_admin","password":"Local-Demo-Admin-2026","portalCookie":true}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["mfaChallengeToken"])')
curl -s -X POST $B/v1/auth/mfa/otp/request -H "$O" -H 'Content-Type: application/json' \
  -d "{\"challengeToken\":\"$TOK\",\"factor\":\"EMAIL_OTP\"}"; sleep 3
ID=$(curl -s localhost:8025/api/v1/messages | python3 -c 'import sys,json;print(json.load(sys.stdin)["messages"][0]["ID"])')
CODE=$(curl -s localhost:8025/api/v1/message/$ID | python3 -c 'import sys,json,re;print(re.search(r"\b\d{6}\b",json.load(sys.stdin)["Text"]).group())')
curl -s -c $J -b $J -X POST $B/v1/auth/mfa/verify -H "$O" -H 'Content-Type: application/json' \
  -d "{\"challengeToken\":\"$TOK\",\"factor\":\"EMAIL_OTP\",\"code\":\"$CODE\",\"portalCookie\":true}" >/dev/null
curl -s -b $J $B/v1/me/entitlements | head -c 300; echo
```

---

## 6. Switching between the local and the production API

**Local, the default:** `FAWTIR_API_ORIGIN=http://localhost:8080` in `.env.local`.

**Production (`https://api.fawtir.om`): this does not work yet, and the reason is on the server
side.** Checked on 2026-09-15:

- Production's CORS and portal-origin allow-list holds exactly one origin, `https://fawtir.om`. A
  preflight from `https://www.fawtir.om` or `http://localhost:5173` gets `403`.
- Because the dev proxy keeps the browser's `Origin: http://localhost:5173`, a proxied login,
  code request or any other state-changing call is refused with 403. Simple `GET`s pass through,
  and an unauthenticated one gets `401`.

To use production data from a local front end, one of two things has to change:

1. **The dev proxy presents an allowed origin.** In `vite.config.ts`, add
   `headers: { origin: env.FAWTIR_API_PROXY_ORIGIN }` to the proxy entry when that variable is set,
   then run with:

   ```
   FAWTIR_API_ORIGIN=https://api.fawtir.om
   FAWTIR_API_PROXY_ORIGIN=https://fawtir.om
   ```

   The session cookies are host-only, `Secure` and `SameSite=Strict`. Chrome accepts `Secure`
   cookies on `http://localhost`, so the session sticks to `localhost:5173`. **This change is not
   in the repo yet** and waits on a decision (see the Step 0 report).
2. **Production allow-lists `http://localhost:5173`.** This is a production configuration change.
   It is out of scope for integration work, and exposing production to developer origins is a
   security decision in its own right.

Either way, a local front end on production data means real tenants and real submissions. Use a
test tenant.

Separately: the live `https://www.fawtir.om` bundle also calls same-origin `/api`, and
`vercel.json` rewrites every path, `/api` included, to `index.html`. The live site's API calls
therefore get HTML, not the API. Fixing that needs a Vercel `/api` rewrite to `api.fawtir.om` and
`https://www.fawtir.om` on the production allow-lists (`https://fawtir.om` 308-redirects to `www`).

---

## 7. Everyday commands

| Task | Command |
|---|---|
| Stop the JVMs | Ctrl-C in each terminal |
| Stop the containers but keep their data | `docker compose -f docker-compose.yml -f docker-compose.frontend-dev.local.yml stop postgres redis kafka mailpit` |
| Reset the local database to empty | Stop core, run `docker exec fawtir-postgres dropdb -U fawtir fawtir_web && docker exec fawtir-postgres createdb -U fawtir fawtir_web`, then start core. It re-migrates and re-seeds. |
| Clear Mailpit | `curl -X DELETE localhost:8025/api/v1/messages` |
| Browse the database | `docker exec -it fawtir-postgres psql -U fawtir -d fawtir_web` |
| Front-end unit tests | `npm test` |
| Front-end type check and build | `npm run build` |

**Never run `docker compose down -v`.** `docker-compose.yml` pins the project name `fawtir-dev`, so
every checkout and worktree on the machine shares the same volumes, and `-v` deletes all of them.

---

## 8. What broke during setup, and the fixes

| Symptom | Cause | Fix |
|---|---|---|
| `Bind for 127.0.0.1:5432 failed`, or core connects to the wrong Postgres | A host PostgreSQL (here EDB PostgreSQL 18 in `/Library/PostgreSQL`) already owns 5432 | The `docker-compose.frontend-dev.local.yml` override on 55432 (§3.2) |
| Core dies at boot: `Key resource does not exist: class path resource [keys/fawtir-public.pem]` | `core/pom.xml` excludes `keys/` from `target/classes`, so the README's "loaded via classpath" is wrong under `spring-boot:run` | `FAWTIR_IDENTITY_JWT_*_KEY_LOCATION=file:…` (§3.4) |
| Every login returns 401 with the right password | PII protection is off, so `username_global_lookup` is null. Nothing warns under `dev`. | The `FAWTIR_PII_*` block. On a database that already has users, also run once with `FAWTIR_PII_BACKFILL_ENABLED=true`. |
| `source local-dev.env` errors with `command not found: Synthetic` | Unquoted values with spaces | Quote them, as the generator does |
| Sign-in succeeds, then everything returns 401 | Core and gateway have different cookie keys | Start both from the same `local-dev.env` |
| 403 on login or any POST from the browser | `http://localhost:5173` is missing from one of the two allow-lists | Set both `FAWTIR_*_ALLOWED_ORIGINS` |
| The code screen shows but no email arrives | Kafka is down, or the delivery flag or payload key is missing | Check `docker ps` shows `fawtir-kafka` as healthy, then check the three notification variables |
| Core fails at boot when reminders are enabled | The reminder sweeps need an SMTP sender | Keep `FAWTIR_NOTIFICATION_DELIVERY_ENABLED=true` with Mailpit up. Setting it to false also stops the login codes. |
| Bootstrap refuses to start: username "already taken platform-wide" | Either the name exists in another tenant, or this is a second boot with the runner still on (see §3.5) | Turn the runners off after the first boot, or choose a different username |
| Issuing an invoice answers 503 `REFERENCE_CATALOGUE_NOT_AVAILABLE` | The reference-catalogue flag is off, which is the default everywhere | `FAWTIR_INVOICE_REFERENCE_CATALOGUE_ENABLED=true` |
| An app page redirects straight to `/login` | The app now requires a session in development (`VITE_REQUIRE_SESSION`, unset = on in dev, off in production builds) | Sign in; or set `VITE_REQUIRE_SESSION=false` in `.env.local` to look at the mock screens |
