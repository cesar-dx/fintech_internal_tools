# fintech_internal_tools

Internal operations tools: Next.js (App Router) + TypeScript, Prisma and Postgres.
Apps: the KYC review queue at `/kyc` and the refunds dashboard at `/refunds`.

See [conventions.md](./conventions.md) for the rules every app here follows.

## Setup

```bash
npm install
cp .env.example .env   # point DATABASE_URL at a local Postgres
npm run db:migrate     # create the schema
npm run db:seed        # staff across the three roles, plus mock KYC cases and transactions
npm run dev
```

## Layout

| Path | Purpose |
| --- | --- |
| `prisma/schema.prisma` | `User` (ANALYST / REVIEWER / ADMIN) and the append-only `AuditLogEntry` |
| `prisma/seed.ts` | Staff across the three roles, plus mock KYC cases and transactions |
| `src/lib/mutate.ts` | The only supported way to change state |
| `src/lib/permissions.ts` | Action → allowed roles registry; the source of audit action names |
| `src/lib/redact.ts` | PII redaction applied where data is fetched |
| `src/lib/users.ts`, `src/lib/audit.ts` | Read/write layer built on the above |
| `src/lib/kyc.ts` | KYC queue reads and `decideCase()` (approve / reject / escalate) |
| `src/lib/refunds.ts` | Transaction search, `requestRefund()` and `decideRefund()` |
| `src/lib/session.ts` | Acting user, held in a cookie as a stand-in for SSO |
| `src/app/kyc` | Queue list, case detail, decision server actions |
| `src/app/refunds` | Transaction search, transaction detail, approval queue |

## How a state change flows

1. A route or server action calls a function in the data layer (e.g. `changeUserRole`)
   with the actor's id, the action name, the target record and a reason.
2. That function calls `mutate()`, which opens one transaction and, inside it:
   loads the actor, checks the action against the actor's role
   (`ACTION_PERMISSIONS`), runs `apply(tx)` to make the change, and appends the
   audit entry recording who / what / which record / why / when.
3. Anything that throws — unknown or deactivated actor, missing permission,
   missing reason, a failing write — rolls back the whole transaction.

Because the change and its audit entry share a transaction, a record can never
move without evidence, and an audit entry can never describe a change that did
not happen. Permission is checked against the actor row read inside the same
transaction, so a role revoked a moment earlier is honoured.

## KYC review queue

`/kyc` lists cases still awaiting a decision (PENDING or ESCALATED) with the
applicant, submitted date and risk flag; `/kyc/[id]` shows the applicant file,
the decision form and the case's audit trail. Every decision requires a reason.

Roles: analysts view and escalate; reviewers (and admins) approve and reject.
Buttons are filtered by role, and `mutate()` re-checks on the server.

Applicant PII (email, date of birth, national ID, address) is redacted in
`getCase()` for viewers without PII access, so an analyst never receives the
raw values. There is no login yet — the header switches the acting user, which
only selects an actor id; permission still comes from the database row.

## Refunds dashboard

`/refunds` searches transactions by reference, customer name or email, or card
last four; `/refunds/[id]` shows the payment, its refunds and their audit
trail, and the refund form. Every refund needs an amount and a reason.

Refunds of **$500 or less are issued immediately**. Anything above that is
recorded as `PENDING_APPROVAL` and waits in `/refunds/approvals`, where a
reviewer (or admin) approves or rejects it with a reason of their own. The
reviewer must be someone other than the requester, so a large refund always
carries two names. Pending refunds are reserved against the transaction
balance, so overlapping requests cannot exceed the amount paid.

Roles: support analysts search and request refunds; reviewers and admins also
decide the ones over the threshold. Customer emails are redacted in
`searchTransactions()` / `getTransaction()` for viewers without PII access.
The threshold lives in `APPROVAL_THRESHOLD_CENTS` in `src/lib/refunds.ts`.

## Adding a new action

Register it in `ACTION_PERMISSIONS` with the roles allowed to perform it, then
call `mutate()` with that action name. Writes that bypass `mutate()` are a
convention violation.
