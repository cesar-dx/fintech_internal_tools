# Internal tools conventions

## Context

These are internal operations tools for a fintech company. Their users are compliance, risk and support staff. Audit trails are regulatory evidence, not debug logs, and PII access is role-restricted.

## Rules

These rules apply to every app in the fintech_internal_tools repository.

1. Every state change goes through the shared `mutate()` helper. No route or component writes to the database directly.

2. `mutate()` checks the actor's permission, applies the change, and writes the audit entry — all in the same transaction.

3. Every audit entry records: who did it, what action, which record, why, and when.

4. PII is redacted where the data is fetched, not hidden in the UI.
