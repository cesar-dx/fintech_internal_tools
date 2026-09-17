# fintech_internal_tools

Shared foundation for the internal operations tools: Next.js (App Router) + TypeScript,
Prisma and Postgres. No feature app is mounted yet.

See [conventions.md](./conventions.md) for the rules every app here follows.

## Setup

```bash
npm install
cp .env.example .env   # point DATABASE_URL at a local Postgres
npm run db:migrate     # create the schema
npm run db:seed        # users across the three roles
npm run dev
```

## Layout

| Path | Purpose |
| --- | --- |
| `prisma/schema.prisma` | `User` (ANALYST / REVIEWER / ADMIN) and the append-only `AuditLogEntry` |
| `prisma/seed.ts` | Bootstrap admin plus analysts, reviewers and a second admin |
| `src/lib/mutate.ts` | The only supported way to change state |
| `src/lib/permissions.ts` | Action → allowed roles registry; the source of audit action names |
| `src/lib/redact.ts` | PII redaction applied where data is fetched |
| `src/lib/users.ts`, `src/lib/audit.ts` | Example read/write layer built on the above |

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

## Adding a new action

Register it in `ACTION_PERMISSIONS` with the roles allowed to perform it, then
call `mutate()` with that action name. Writes that bypass `mutate()` are a
convention violation.
