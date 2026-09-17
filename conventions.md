These rules apply to every app in this repository.

#1 Every state change goes through the shared `mutate()` helper. No route or component writes to the database directly.
#2 `mutate()` checks the actor's permission, applies the change, and writes the audit entry — all in the same transaction.
#3  Every audit entry records: who did it, what action, which record, why, and when.
#4 PII is redacted where the data is fetched, not hidden in the UI.
