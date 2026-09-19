# Project Context

This project is a proof of concept testing whether a shared security and audit layer holds across many apps and many engineers. It's a Next.js app on Postgres with two internal tools: a KYC review queue and a refunds dashboard. Both are built on one shared foundation. The idea I wanted to demonstrate is that every change to data goes through a single function that checks permission, applies the change and writes the audit entry in one transaction. Everything here was built with Devin in five sessions, most of them starting cold with no memory of the previous work, to see whether the conventions hold when a different engineer starts from nothing.


# fintech_internal_tools

Internal operations tools for compliance, risk and support staff. One Next.js
(App Router) + TypeScript application backed by Prisma and Postgres, currently
hosting two apps:

| App | Route | What it does |
| --- | --- | --- |
| KYC review queue | `/kyc` | Analysts triage and escalate identity-verification cases; reviewers approve or reject them. |
| Refunds dashboard | `/refunds` | Support staff search transactions and issue refunds; refunds over $500 wait for a second person in `/refunds/approvals`. |

Every state change goes through one `mutate()` helper that checks the actor's
permission, applies the change and writes the audit entry in a single
transaction, and PII is redacted where it is fetched. Those rules are written
down in [conventions.md](./conventions.md) and explained under
[How a state change flows](#how-a-state-change-flows).

The refunds dashboard talks to **Stripe in test mode** when a key is
configured and falls back to seeded, local-only transactions when it is not
(see [Stripe integration](#stripe-integration)).

## Running locally

### Prerequisites

- Node.js 24 (CI uses 24; anything with `process.loadEnvFile`, i.e. >= 20.12, works)
- Postgres 14+ running locally (CI uses 16)
- git

### 1. Clone and install

```bash
git clone https://github.com/cesar-dx/fintech_internal_tools.git
cd fintech_internal_tools
npm install          # postinstall runs `prisma generate`
```

### 2. Postgres

The default `.env.example` expects a Postgres server on `localhost:5432` with
a `postgres` superuser whose password is `postgres`, and a database called
`ops_tools_dev`. Pick whichever matches your machine:

**Docker (no local Postgres):**

```bash
docker run -d --name ops-tools-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ops_tools_dev postgres:16
```

**Existing local Postgres (Homebrew, apt, Postgres.app):**

```bash
# Give the postgres role the password the template expects (skip if already set)
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"   # Linux
# psql -U postgres -c "ALTER USER postgres PASSWORD 'postgres';"      # macOS / Postgres.app

PGPASSWORD=postgres createdb -h localhost -U postgres ops_tools_dev
```

If you would rather use a different role or database, that is fine: edit
`DATABASE_URL` in `.env` in the next step. The only constraint is that the
database name must end in `_dev` (or in none of `_dev`, `_staging`, `_prod`)
while `APP_ENV=development`; see [Environment configuration](#environment-configuration).

### 3. Configure

```bash
cp .env.example .env
```

`.env` is gitignored. Out of the box it sets `APP_ENV=development` and
`DATABASE_URL` pointing at the database above. Leave `STRIPE_SECRET_KEY`
commented out for now; the app runs fully without it.

### 4. Create the schema and seed data

```bash
npm run db:migrate   # prisma migrate dev: applies prisma/migrations/ to ops_tools_dev
npm run db:seed      # staff in all three roles, KYC cases and six transactions
```

The seed creates six staff users (analysts, reviewers and admins, all
`@example.com`), five KYC cases (`KYC-1041`…) and six settled transactions
(`TXN-2041`…), each with a matching audit entry.

### 5. Run

```bash
npm run dev          # http://localhost:3000
```

Open <http://localhost:3000>. There is no login yet: the header has an
"acting as" switcher that picks one of the seeded users, and every permission
check is still made against that user's database row on the server. Try
`/refunds`, search for `nadia`, and issue a refund; then switch to a reviewer
and look at `/refunds/approvals`. A blue **development** banner confirms which
tier you are on.

### Checks

```bash
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # node:test via tsx, runs against DATABASE_URL
npm run build        # next build
```

`npm test` needs the database from step 2 (it exercises `mutate()` and the
refund balance locking against real Postgres). CI runs the same five commands
against a fresh Postgres 16 container; see `.github/workflows/ci.yml`.

### Other scripts

| Script | Purpose |
| --- | --- |
| `npm run db:studio` | Prisma Studio for browsing the local database |
| `npm run db:status` | Show pending migrations |
| `npm run db:deploy` | Apply committed migrations without generating new ones (what staging/production/CI use) |
| `npm run db:migrate -- --name <change>` | Generate a new migration after editing `prisma/schema.prisma` |
| `npm run stripe:seed` | Create a few succeeded test-mode payments in Stripe (needs `STRIPE_SECRET_KEY`) |

## Environment configuration

All configuration is read from the process environment. Locally that means
`.env` (Next.js, Prisma and the npm scripts all load it); on a host it means
real environment variables or GitHub Environment secrets. `.env*` is gitignored
except for the three `*.example` templates.

| Variable | Required | Meaning |
| --- | --- | --- |
| `APP_ENV` | no, defaults to `development` | Deployment tier: `development`, `staging` or `production`. Independent of `NODE_ENV`, which Next.js sets to `production` for every optimised build, staging included. |
| `DATABASE_URL` | yes | Postgres connection string. The database name must end in `_dev`, `_staging` or `_prod` to match `APP_ENV`, or in none of those (a scratch database). |
| `STRIPE_SECRET_KEY` | no | Stripe **test-mode** secret key (`sk_test_…` or restricted `rk_test_…`). Enables the Stripe integration below. Live keys are rejected in every tier. |

`src/lib/env.ts` enforces the guard rails and `scripts/assert-env.ts` runs
them before the risky npm scripts:

- An `APP_ENV` outside the three values fails at startup.
- A `DATABASE_URL` that names another tier's database (for example
  `APP_ENV=staging` pointing at `ops_tools_prod`) fails when the Prisma client
  is created, so a mis-pasted secret cannot write staging test data into
  production.
- `npm run db:seed` and `npm run stripe:seed` refuse to run with
  `APP_ENV=production`.
- `npm run db:migrate` (`prisma migrate dev`, which can generate migrations
  and reset a database) only runs in development. Staging and production
  apply committed migrations with `npm run db:deploy`.

### Tiers

| | development | staging | production |
| --- | --- | --- | --- |
| Purpose | local work, tests, CI | pre-release verification on prod-like infra | staff-facing |
| `APP_ENV` | `development` | `staging` | `production` |
| Database | `ops_tools_dev` on localhost | `ops_tools_staging`, managed Postgres | `ops_tools_prod`, managed Postgres |
| Config source | `.env` copied from `.env.example` | `staging` GitHub Environment / host secrets | `production` GitHub Environment / host secrets |
| Stripe | optional test key | test key, separate account | test key, separate account |
| Schema changes | `npm run db:migrate` | `npm run db:deploy` (CI) | `npm run db:deploy` (CI) |
| Seeding | `npm run db:seed` | allowed, use sparingly | refused |
| UI | blue banner | amber banner | no banner |

`.env.staging.example` and `.env.production.example` list what each hosted
tier needs; they are documentation, never copied to a real file.

### Provisioning staging and production

1. Create a Postgres database and a dedicated role per tier
   (`ops_tools_staging`, `ops_tools_prod`), ideally on separate instances.
   Grant the role ownership of its database only.
2. In the GitHub repository, create Environments named `staging` and
   `production`. On `production`, add required reviewers and restrict
   deployments to tags matching `v*`.
3. In each Environment set the secrets `DATABASE_URL` and `STRIPE_SECRET_KEY`
   (a test key from a Stripe account dedicated to that tier) and optionally the
   variable `DEPLOY_COMMAND` with whatever hands the built app to your host
   (`npx vercel deploy --prebuilt --prod`, `fly deploy`, an SSH command…).
   Without it the workflow still applies migrations and builds.
4. Set `APP_ENV`, `DATABASE_URL` and `STRIPE_SECRET_KEY` on the host that runs
   `npm start` for that tier.

### Promoting a change

Changes move development -> staging -> production. Code and schema travel
together because migrations are committed files applied by the same workflow
that builds the app.

1. **Develop.** Branch from `main`. If the schema changes, run
   `npm run db:migrate -- --name <change>` and commit the generated migration.
   Migrations must be additive or backwards compatible: the previous build
   keeps running while they are applied, and `prisma migrate deploy` never
   rolls back.
2. **Pull request.** `.github/workflows/ci.yml` runs lint, typecheck,
   `db:deploy` against a fresh Postgres, the tests and the build.
3. **Staging (automatic).** Every push to `main` runs
   `.github/workflows/deploy.yml` against the `staging` Environment: prints
   pending migrations, applies them, builds, and runs `DEPLOY_COMMAND` if set.
4. **Production (tagged, approved).** Tag the verified `main` commit
   (`git tag v1.4.0 <sha> && git push origin v1.4.0`). The same workflow runs
   against `production` and pauses for the required reviewer before touching
   the database.
5. **Hotfix or re-run.** *Actions -> Deploy -> Run workflow* deploys any ref to
   a chosen environment, still subject to that environment's approval rules.

To roll back application code, redeploy the previous tag. Schema migrations
are not reverted automatically; write a new forward migration.

## Stripe integration

Stripe is the processor feed for the refunds dashboard. The local
`Transaction` and `Refund` tables remain the system of record for approvals
and the audit trail, so the conventions are unchanged whether or not Stripe is
configured. Only **test mode** is supported: `getStripe()` in
`src/lib/stripe.ts` refuses any key that is not `sk_test_…` / `rk_test_…`.

### Without a key (default)

If `STRIPE_SECRET_KEY` is unset or empty, `/refunds` shows the message
"Stripe is not configured: showing seeded transactions and recording refunds
locally." Searches run against the seeded `TXN-…` transactions, refunds are
written to the local `Refund` table with the usual permission check and audit
entry, and no network calls are made. This is the mode used by the tests and
by CI, and it is all you need to work on anything other than the Stripe
client itself.

### With a key

1. In a Stripe account switched to test mode, copy the secret key from
   <https://dashboard.stripe.com/test/apikeys>.
2. Add it to `.env`:
   ```bash
   STRIPE_SECRET_KEY="sk_test_..."
   ```
3. Give the account some payments to refund. Either create them in the Stripe
   dashboard with the test card `4242 4242 4242 4242`, or run
   `npm run stripe:seed`, which creates five succeeded test payments for the
   same customers as the seeded KYC cases and prints their PaymentIntent ids.
4. `npm run dev` and search on `/refunds`. The banner now reads "Transactions
   are fetched from Stripe (test mode) and refunds are issued through Stripe."

How it works:

- **Fetching.** Each search first calls `syncStripeCharges()`, which lists the
  100 most recent succeeded charges and upserts them into `Transaction` keyed
  by `stripeChargeId` (reference = PaymentIntent id; amount, `amount_refunded`
  and status mirrored from Stripe). Like the seed this is an inbound feed, not
  an operator action, so it is written directly; the search then runs against
  the local table and applies the normal PII redaction. Rows with a
  `stripeChargeId` are shown when Stripe is configured; seeded rows (no charge
  id) are shown when it is not, so the two data sets never mix in the UI.
- **Refunding.** Inside the `mutate()` transaction, once a refund has passed
  the balance and permission checks and is actually being issued (immediately
  for amounts of $500 or less, on reviewer approval above that),
  `createStripeRefund()` calls `refunds.create` on the charge. The Stripe
  refund id is stored on the `Refund` row and shown on the transaction page.
  The local refund id is the Stripe idempotency key, so a retry after a
  transient failure cannot refund a customer twice. If Stripe rejects the
  refund the whole transaction rolls back and the error is shown to the
  operator.

Because the key is read from the process environment, a key exported in your
shell (for example by a secrets manager) also enables the integration even
when `.env` has it commented out. Unset it (`env -u STRIPE_SECRET_KEY npm run
dev`) to exercise the fallback.

## How a state change flows

1. A route or server action calls a function in the data layer (e.g.
   `decideCase`, `requestRefund`) with the actor's id, the action name, the
   target record and a reason.
2. That function calls `mutate()`, which opens one transaction and, inside it:
   loads the actor, checks the action against the actor's role
   (`ACTION_PERMISSIONS` in `src/lib/permissions.ts`), runs `apply(tx)` to
   make the change, and appends the audit entry recording who / what / which
   record / why / when.
3. Anything that throws (unknown or deactivated actor, missing permission,
   missing reason, a failing write, a Stripe rejection) rolls back the whole
   transaction.

Because the change and its audit entry share a transaction, a record can never
move without evidence and an audit entry can never describe a change that did
not happen. Permission is checked against the actor row read inside the same
transaction, so a role revoked a moment earlier is honoured.

To add a new action, register it in `ACTION_PERMISSIONS` with the roles
allowed to perform it, then call `mutate()` with that action name. Writes that
bypass `mutate()` are a convention violation.

## The apps

### KYC review queue

`/kyc` lists cases awaiting a decision (PENDING or ESCALATED) with applicant,
submitted date and risk flag; `/kyc/[id]` shows the applicant file, the
decision form and the case's audit trail. Every decision requires a reason.

Analysts view and escalate; reviewers and admins approve and reject. Buttons
are filtered by role in the UI and `mutate()` re-checks on the server.
Applicant PII (email, date of birth, national ID, address) is redacted in
`getCase()` for viewers without PII access, so an analyst never receives the
raw values.

### Refunds dashboard

`/refunds` searches transactions by reference, customer name or email, or card
last four; `/refunds/[id]` shows the payment, its refunds and their audit
trail, and the refund form. Every refund needs an amount and a reason.

Refunds of **$500 or less are issued immediately**. Anything above that is
recorded as `PENDING_APPROVAL` and waits in `/refunds/approvals`, where a
reviewer or admin approves or rejects it with a reason of their own. The
reviewer must be someone other than the requester. Pending refunds are
reserved against the transaction balance, so overlapping requests cannot
exceed the amount paid. The threshold is `APPROVAL_THRESHOLD_CENTS` in
`src/lib/refunds.ts`. Customer emails are redacted in `searchTransactions()`
/ `getTransaction()` for viewers without PII access.

## Layout

| Path | Purpose |
| --- | --- |
| `prisma/schema.prisma` | `User` (ANALYST / REVIEWER / ADMIN), `KycCase`, `Transaction`, `Refund` and the append-only `AuditLogEntry` |
| `prisma/migrations/` | Committed migrations applied by `db:migrate` / `db:deploy` |
| `prisma/seed.ts` | Staff across the three roles, plus mock KYC cases and transactions |
| `scripts/seed-stripe.ts` | Creates succeeded test payments in Stripe (`npm run stripe:seed`) |
| `scripts/assert-env.ts` | Pre-flight for npm scripts that must not run against the wrong tier |
| `src/lib/env.ts` | `APP_ENV` and the database / seeding guard rails |
| `src/lib/db.ts` | Prisma client, created after the env checks pass |
| `src/lib/mutate.ts` | The only supported way to change state |
| `src/lib/permissions.ts` | Action -> allowed roles registry; the source of audit action names |
| `src/lib/redact.ts` | PII redaction applied where data is fetched |
| `src/lib/users.ts`, `src/lib/audit.ts` | Read/write layer built on the above |
| `src/lib/kyc.ts` | KYC queue reads and `decideCase()` |
| `src/lib/refunds.ts` | Transaction search, `requestRefund()` and `decideRefund()` |
| `src/lib/stripe.ts` | Stripe test-mode client, `syncStripeCharges()` and `createStripeRefund()` |
| `src/lib/session.ts` | Acting user, held in a cookie as a stand-in for SSO |
| `src/app/kyc`, `src/app/refunds` | Pages and server actions for the two apps |
| `.github/workflows/ci.yml`, `deploy.yml` | Checks on every PR; `main` -> staging, `v*` tag -> production |
