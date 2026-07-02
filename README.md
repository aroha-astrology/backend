# Aroha Astrology — Backend

HTTP/JSON API for the Aroha Astrology client. Built on Hono + TypeScript, backed by Supabase Postgres, with Firebase Auth (phone OTP) for sign-in.

> **v1 scope is intentionally tiny.** This skeleton supports user onboarding only: exchange a Firebase ID token for an app user, read/update profile, soft-delete account. Kundli generation, horoscopes, payments, and consultations are deferred — but the layout leaves clean seams for them.

---

## TL;DR

```bash
nvm use                            # picks Node 22 (or any >= 20)
npm install
cp .env.example .env               # then fill in DATABASE_URL + Firebase creds
npm run db:migrate                 # apply migrations
npm run dev                        # → http://localhost:3000
open http://localhost:3000/docs    # Swagger UI
```

| URL                     | Purpose                            |
| ----------------------- | ---------------------------------- |
| `GET  /healthz`         | Liveness                           |
| `GET  /readyz`          | Readiness (pings DB)               |
| `GET  /docs`            | Swagger UI                         |
| `GET  /openapi.json`    | OpenAPI 3.0 spec                   |
| `POST /v1/auth/session` | Exchange Firebase token → app user |
| `GET  /v1/me`           | Current user profile               |
| `PATCH /v1/me`          | Update profile                     |
| `DELETE /v1/me`         | Soft-delete account                |

---

## For the frontend team

You don't need to know the backend internals to integrate. Read this section and the OpenAPI spec at `/docs`.

### 1. Authentication

Auth lives entirely in **Firebase Auth (phone OTP)**. The backend never sees the OTP — it only sees the Firebase ID token your client gets after the OTP succeeds.

The flow:

```
┌───────────┐                       ┌──────────────┐                  ┌────────────┐
│  Client   │ ─── phone OTP ──────▶ │ Firebase Auth│                  │  Backend   │
│           │ ◀── ID token ──────── │              │                  │            │
│           │                       └──────────────┘                  │            │
│           │ ──── POST /v1/auth/session  Bearer <ID token> ────────▶ │            │
│           │ ◀──────────── { user, created } ───────────────────────│ verifies   │
└───────────┘                                                          │ via       │
                                                                       │ firebase- │
                                                                       │ admin     │
                                                                       └────────────┘
```

Once you have an ID token, send it on **every** request as:

```
Authorization: Bearer <firebase-id-token>
```

Tokens expire after 1 hour. Refresh client-side using the Firebase SDK (`user.getIdToken(/* forceRefresh */ true)`) — the backend has no refresh endpoint of its own.

### 2. Onboarding sequence

```
1. user opens app for the first time
2. client kicks off Firebase phone OTP flow
3. client gets back a Firebase ID token
4. client calls POST /v1/auth/session
     → 201 { user, created: true }  on first ever sign-in
     → 200 { user, created: false } on every subsequent launch
5. client calls PATCH /v1/me with whatever profile fields the user has filled in
     → 200 with updated user; once *all* profile fields are set,
       `profileCompletedAt` is automatically stamped
```

`POST /v1/auth/session` is **idempotent** — call it on every cold launch. If the user previously deleted their account and signs back in, the row is resurrected automatically.

### 3. Endpoint reference

#### POST `/v1/auth/session`

Verifies the Firebase ID token, creates an app user if needed, returns the user.

Request: no body. Just the `Authorization` header.

Response `201 Created` (new user) or `200 OK` (existing user):

```json
{
  "user": {
    "id": "uuid",
    "firebaseUid": "firebase-uid",
    "phoneE164": "+919999999999",
    "displayName": null,
    "gender": null,
    "dateOfBirth": null,
    "timeOfBirth": null,
    "placeOfBirth": null,
    "profileCompletedAt": null,
    "createdAt": "2026-05-24T17:30:00.000Z",
    "updatedAt": "2026-05-24T17:30:00.000Z"
  },
  "created": true
}
```

#### GET `/v1/me`

Returns the current user's profile.

`401` if the token is missing/invalid or the user has been deleted.

#### PATCH `/v1/me`

Partial update of the user's profile. Any field you omit is left untouched. Unknown fields are rejected with `400`.

Request body (all fields optional):

```json
{
  "displayName": "Alice",
  "gender": "female",
  "dateOfBirth": "1995-04-12",
  "timeOfBirth": "06:30:00",
  "placeOfBirth": {
    "name": "Mumbai, Maharashtra, India",
    "lat": 19.076,
    "lon": 72.8777,
    "tz": "Asia/Kolkata"
  }
}
```

Validation rules:

- `displayName`: 1–120 chars.
- `gender`: `"male" | "female" | "other"`.
- `dateOfBirth`: `YYYY-MM-DD`.
- `timeOfBirth`: `HH:mm` or `HH:mm:ss` (24h).
- `placeOfBirth.lat`: -90..90. `lon`: -180..180. `tz`: IANA timezone.

Response `200`: the full updated user. When `displayName`, `gender`, `dateOfBirth`, `timeOfBirth`, and `placeOfBirth` are all set, `profileCompletedAt` is stamped automatically.

#### DELETE `/v1/me`

Soft-deletes the user (sets `deletedAt`). Returns `204` with no body. Subsequent requests with the same token return `401` — but the Firebase user still exists; if they sign back in, `POST /v1/auth/session` resurrects them.

### 4. Error envelope

Every error response uses the same shape:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired ID token",
    "requestId": "08c491d0-99a5-4ed5-a113-e601d8464198",
    "details": {
      /* optional, present on validation errors */
    }
  }
}
```

| HTTP | `error.code`    | When                                                                     |
| ---- | --------------- | ------------------------------------------------------------------------ |
| 400  | `BAD_REQUEST`   | Malformed JSON, unknown field, schema rejection.                         |
| 401  | `UNAUTHORIZED`  | Missing/expired/invalid token, or no app user for this token yet.        |
| 404  | `NOT_FOUND`     | Resource or route not found.                                             |
| 422  | `UNPROCESSABLE` | Validation failed (`details` contains field-level errors).               |
| 500  | `INTERNAL`      | Server bug. Include `requestId` in bug reports — it appears in our logs. |

### 5. CORS

Allowed origins come from the `CORS_ORIGINS` env var on the server. For local dev: `http://localhost:3001` by default. Ask backend to add yours if it differs.

---

## For backend developers

### Stack

| Concern         | Choice                                                  |
| --------------- | ------------------------------------------------------- |
| Language        | TypeScript 5.7 (`strict`, `noUncheckedIndexedAccess`)   |
| Runtime         | Node ≥ 20 (LTS pinned at `22` in `.nvmrc`)              |
| Framework       | Hono + `@hono/zod-openapi` (OpenAPI auto-generated)     |
| Validation      | Zod                                                     |
| DB              | Supabase Postgres (reached via `postgres` driver)       |
| ORM             | Drizzle ORM + `drizzle-kit`                             |
| Auth            | Firebase Admin SDK (verifies ID tokens)                 |
| Storage (later) | Supabase Storage via `@supabase/supabase-js`            |
| Logging         | Pino (pretty in dev, JSON in prod)                      |
| Tests           | Vitest                                                  |
| Lint/format     | ESLint v9 (flat) + Prettier                             |
| Pre-commit      | husky + lint-staged + commitlint (Conventional Commits) |
| Build           | tsup → ESM `dist/`                                      |
| Dev             | `tsx watch`                                             |

### Prerequisites

- Node ≥ 20 (recommended: `nvm use` to get 22).
- A Postgres instance — either Supabase or local. For local dev:
  ```bash
  brew install postgresql@15
  brew services start postgresql@15
  createdb aroha_astrology_dev
  ```
- A Firebase project. Either a real one or, for purely-local boot, a dummy service account file works (see Troubleshooting).

### First-time setup

```bash
nvm use
npm install
cp .env.example .env
# 1. fill in DATABASE_URL
# 2. drop the Firebase service account JSON into ./secrets/ (gitignored) and set
#    FIREBASE_SERVICE_ACCOUNT_PATH to it (or set the three FIREBASE_* vars instead)
npm run db:migrate
npm run dev
```

### Firebase projects

| Env  | Project ID        | Notes                                                          |
| ---- | ----------------- | -------------------------------------------------------------- |
| dev  | `aroha-dev-9c4b0` | Test phone number `+919999900001` → OTP `123456` (no real SMS) |
| prod | `aroha-prod`      | Real SMS only — remove any test numbers before launch          |

Phone sign-in is enabled on both, but the **SMS region policy** must allow
India: Firebase console → Authentication → Settings → SMS region policy →
allow `IN`. This applies even to test phone numbers — with the region blocked,
`accounts:sendVerificationCode` fails with `OPERATION_NOT_ALLOWED`.

Service account keys live in `./secrets/` (gitignored) — never commit them;
rotate immediately if one leaks. Keep the **prod** key out of local checkouts
entirely; only deployment infrastructure needs it.

To call protected endpoints without a client app, mint a real ID token against
the dev project (`scripts/dev-token.ts` refuses to run against non-dev
projects):

```bash
# full phone-OTP flow (test number, no SMS sent):
npm run -s dev:token -- --phone +919999900001 --code 123456

# or any uid via the Admin SDK custom-token flow:
TOKEN=$(npm run -s dev:token -- --uid local-dev-1)
curl -X POST http://localhost:3000/v1/auth/session -H "Authorization: Bearer $TOKEN"
```

### Daily workflow

| Command               | What it does                                      |
| --------------------- | ------------------------------------------------- |
| `npm run dev`         | tsx watch on `src/index.ts` (auto-reload on save) |
| `npm run typecheck`   | `tsc --noEmit`                                    |
| `npm run lint`        | ESLint over everything                            |
| `npm run lint:fix`    | ESLint with `--fix`                               |
| `npm run format`      | Prettier write                                    |
| `npm test`            | Vitest (run mode)                                 |
| `npm run test:watch`  | Vitest watch mode                                 |
| `npm run build`       | tsup → `dist/`                                    |
| `npm start`           | `node dist/index.js` (prod-style boot)            |
| `npm run db:generate` | Generate a migration from schema diffs            |
| `npm run db:migrate`  | Apply pending migrations                          |
| `npm run db:push`     | Push schema directly (dev-only, skips migrations) |
| `npm run dev:token`   | Mint a Firebase ID token for local API testing    |
| `npm run db:studio`   | Open drizzle-studio (web UI for the DB)           |

Pre-commit hooks (via husky) auto-run ESLint + Prettier on staged files.

### Project layout

```
src/
├── index.ts                  # server bootstrap (binds port, traps signals)
├── app.ts                    # Hono app, route mounting, OpenAPI doc, Swagger UI
├── config/
│   ├── env.ts                # Zod-validated process.env (throws on boot if invalid)
│   ├── firebase.ts           # firebase-admin singleton
│   ├── supabase.ts           # supabase-js service-role client (lazy)
│   └── db.ts                 # postgres + drizzle client
├── middleware/
│   ├── auth.ts               # requireFirebaseToken + requireUser
│   ├── error.ts              # central JSON error mapper + 404 handler
│   ├── logger.ts             # pino request logger (sets requestId)
│   └── cors.ts               # CORS, origins from env
├── modules/
│   ├── health/               # /healthz, /readyz
│   ├── auth/                 # /v1/auth/session
│   └── users/                # /v1/me
│       ├── *.routes.ts       # OpenAPI route definitions + handlers
│       ├── *.service.ts      # business logic
│       ├── *.repo.ts         # Drizzle queries
│       └── *.schemas.ts      # Zod schemas (request/response DTOs)
├── db/
│   ├── schema.ts             # Drizzle table definitions
│   └── migrations/           # generated SQL — never edit by hand
├── lib/
│   ├── errors.ts             # AppError class + factories
│   └── logger.ts             # pino instance
└── types/
    └── hono.d.ts             # ContextVariableMap augmentation
scripts/
└── dev-token.ts              # mint Firebase ID tokens for local API testing
test/
├── setup.ts                  # env vars for tests
├── helpers/mocks.ts          # data factories
├── auth.spec.ts
├── health.spec.ts
└── users.spec.ts
```

### Conventions

- **One module per feature.** A "module" is a folder under `src/modules/` containing `*.routes.ts`, `*.service.ts`, `*.repo.ts`, `*.schemas.ts`. Routes call services, services call repos, repos talk to Drizzle. Don't skip layers.
- **Zod schemas live in the module that owns them.** Re-export to other modules if needed; don't reach into another module's repo.
- **Errors:** throw `AppError` (via the `Errors.*` factories in `src/lib/errors.ts`). The central error middleware maps them to JSON. Don't `c.json({ error: ... }, 4xx)` by hand.
- **No `any`.** If you reach for it, ask why. `unknown` + a narrowing branch is almost always better.
- **No comments restating WHAT the code does.** Comment WHY when the why isn't obvious.
- **Imports use `.js` suffix** for relative paths — required by Node's ESM resolver. The TypeScript compiler doesn't care; Node does at runtime.

### Adding a new endpoint

1. Create a Zod schema for the request/response in `*.schemas.ts`.
2. Add a `createRoute({...})` definition to `*.routes.ts` — this is where OpenAPI gets its metadata.
3. Implement the handler with `router.openapi(route, async (c) => { ... })`.
4. Put business logic in `*.service.ts`, data access in `*.repo.ts`.
5. Mount the router in `src/app.ts` if it's a new module.
6. Add a test in `test/`.
7. Run `npm run lint && npm run typecheck && npm test`.

The OpenAPI spec at `/openapi.json` (and the Swagger UI at `/docs`) update automatically.

### Database & migrations

Schema is the source of truth: `src/db/schema.ts`. Workflow:

```bash
# edit src/db/schema.ts ...
npm run db:generate            # writes a new SQL file under src/db/migrations/
# review the generated SQL — fix it by hand if drizzle-kit guessed wrong ...
npm run db:migrate             # applies to the database in DATABASE_URL
```

**Never edit migration files that have already been applied to a shared environment.** Make a new migration instead.

For pure-local iteration, `npm run db:push` skips migrations and pushes the schema directly — fine for dev, never for staging/prod.

### Testing

- All tests are in `test/`. Use `*.spec.ts`.
- Tests mock the Firebase Admin SDK, `src/config/db.js`, and the users repo, so you don't need credentials or a live DB to run them.
- For database-touching integration tests later, point `DATABASE_URL` at a disposable Postgres and reset state in `beforeEach`.

### Deployment (EC2)

The Mumbai staging box runs the app under **pm2** (cluster mode) on `:3000`,
currently reachable directly at `http://13.232.179.137:3000` (`/docs` for
Swagger). nginx/TLS termination is not set up yet.

Deploy from your working tree:

```bash
npm run deploy        # = bash scripts/deploy.sh
```

`scripts/deploy.sh` rsyncs the tree to `ec2-user@13.232.179.137:/home/ec2-user/aroha-backend`
(never shipping `.env`, `secrets/`, `node_modules`, `dist`, or `.git`), then on the box:
builds, runs `npm run db:migrate` **only when `src/db/migrations/` changed**, reloads
pm2 (`aroha-api`), and verifies `/healthz` + `/readyz`. Override `AROHA_PEM`, `AROHA_HOST`,
`AROHA_REMOTE_DIR`, `AROHA_APP`, `AROHA_PORT` via the environment if your setup differs.

#### Staging database (EC2-local Postgres)

Staging uses a **PostgreSQL instance on the EC2 box itself** (data dir
`/var/lib/pgsql/data`), not a managed/Supabase DB. `pg_hba.conf` requires a
password over TCP (`host 127.0.0.1/32 scram-sha-256`), so the connection string
connects as `…@localhost:5432` with a password.

- **Role:** `atulgoel` (LOGIN, password-authenticated).
- **Database:** `aroha_astrology_dev`, owned by `atulgoel` — which also owns the
  `public` schema so migrations can create types/tables on PG15+.
- **Credential:** lives **only** in the server's `~/aroha-backend/.env` as
  `DATABASE_URL=postgres://atulgoel:<password>@localhost:5432/aroha_astrology_dev`
  (never committed). Read it on the box with `grep DATABASE_URL ~/aroha-backend/.env`.

Reprovision from scratch (run on the box; needs `sudo -u postgres`):

```bash
PW="$(openssl rand -hex 24)"                                   # strong random password
sudo -u postgres psql -c "CREATE ROLE atulgoel LOGIN PASSWORD '$PW';"
sudo -u postgres psql -c "CREATE DATABASE aroha_astrology_dev OWNER atulgoel;"
sudo -u postgres psql -d aroha_astrology_dev \
  -c "ALTER SCHEMA public OWNER TO atulgoel; GRANT ALL ON SCHEMA public TO atulgoel;"
# write DATABASE_URL (with $PW) into ~/aroha-backend/.env — back up the old one first — then:
cd ~/aroha-backend && npm run db:migrate
```

Rotate the password with `ALTER ROLE atulgoel PASSWORD '<new>';`, update `DATABASE_URL`
in the server `.env`, then `pm2 restart aroha-api`.

#### Daily horoscope CRON (server state — not in the repo)

Personalized horoscopes are generated for every active user once a day by the OS
crontab hitting an internal, secret-protected endpoint (an in-process scheduler
would fire once per pm2 worker). Two pieces of server state, set once:

1. **`CRON_SECRET`** in `~/aroha-backend/.env` — the shared secret for
   `POST /internal/cron/daily-horoscopes` (the endpoint fails closed if unset).
   `echo "CRON_SECRET=$(openssl rand -hex 24)" >> ~/aroha-backend/.env` then
   `pm2 restart aroha-api`.
2. **crontab** at 00:01 IST (the box is UTC → 18:31 UTC):
   ```cron
   31 18 * * * /home/ec2-user/aroha-backend/scripts/cron-daily-horoscopes.sh >> /home/ec2-user/cron-horoscopes.log 2>&1
   ```
   The script (`scripts/cron-daily-horoscopes.sh`, version-controlled) reads
   `CRON_SECRET` from `.env` and calls the endpoint on localhost. Manual run /
   backfill: `scripts/cron-daily-horoscopes.sh` (optional JSON body
   `{"forDate":"YYYY-MM-DD","force":true}`). The LLM is currently a stub
   returning a fixed value; the NVIDIA NIM call is wired in `src/lib/llm/horoscope.ts`.

---

## Environment variables

All env vars are validated at boot by `src/config/env.ts`. The server refuses to start if anything mandatory is missing or malformed.

| Name                            | Required | Notes                                                                  |
| ------------------------------- | -------- | ---------------------------------------------------------------------- |
| `NODE_ENV`                      | no       | `development` \| `test` \| `production`. Defaults to `development`.    |
| `PORT`                          | no       | Defaults to `3000`.                                                    |
| `LOG_LEVEL`                     | no       | `silent\|fatal\|error\|warn\|info\|debug\|trace`. Defaults to `info`.  |
| `CORS_ORIGINS`                  | no       | Comma-separated list. Empty = allow everything (use only in dev).      |
| `DATABASE_URL`                  | **yes**  | Postgres connection string. Use Supabase pooled URL in prod.           |
| `SUPABASE_URL`                  | no       | Required only when Storage features are turned on.                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | no       | Required only when Storage features are turned on.                     |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | yes\*    | Path to the service account JSON (keep it in `./secrets/`).            |
| `FIREBASE_PROJECT_ID`           | yes\*    | Alternative to the path. From Firebase service account JSON.           |
| `FIREBASE_CLIENT_EMAIL`         | yes\*    | Alternative to the path. From Firebase service account JSON.           |
| `FIREBASE_PRIVATE_KEY`          | yes\*    | PEM. Use `\n` for newlines, or wrap a real multi-line value in quotes. |
| `FIREBASE_WEB_API_KEY`          | no       | Only for `scripts/dev-token.ts`. Not secret (ships in clients).        |

\* Provide either `FIREBASE_SERVICE_ACCOUNT_PATH` **or** all three of project id / client email / private key.

---

## Troubleshooting

**`Invalid environment configuration` on boot.** Read the error — it lists exactly which var failed and why. `.env.example` shows the right shape.

**`Failed to parse private key` / `Failed to parse service account json file`.** Note that `FIREBASE_SERVICE_ACCOUNT_PATH` takes precedence: if it is set, the three `FIREBASE_*` vars are ignored, so point it at a valid service account JSON (the path resolves from the working directory — run from `backend/`). If using the three-var route instead, leave `FIREBASE_SERVICE_ACCOUNT_PATH` unset, set **all three** vars, and make sure `FIREBASE_PRIVATE_KEY` is a real PEM-formatted RSA key. For purely-local boot with no Firebase project, generate a throwaway key and wrap it in a dummy service account file:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /tmp/local.pem
python3 -c "import json; print(json.dumps({'type':'service_account','project_id':'local-dev','client_email':'local-dev@local-dev.iam.gserviceaccount.com','private_key':open('/tmp/local.pem').read()}))" > secrets/local-dev.json
# then set FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/local-dev.json
```

This makes the server boot. Actual token verification still requires a real Firebase project.

**`/readyz` returns 503 with `db: fail`.** Postgres is unreachable. Check `DATABASE_URL`, network, and that the server you're pointing at is running.

**`PATCH /v1/me` returns 400 with no useful body.** Look at `error.details` — it's a Zod flat error tree. The most common cause is sending an unknown field; the request body uses `.strict()`.

**Tests fail with `Cannot read properties of undefined (reading 'parsers')`.** You're mocking `postgres` directly instead of `src/config/db.js`. Mock `db.js` — Drizzle's `postgres-js` driver is not pluggable enough to stub at the `postgres` layer.

---

## License

Proprietary — internal use only.
