# ADR-007 · Background jobs on pg-boss (no Redis in V1)

**Status:** Accepted · 25 September 2026
**Context:** audit §4 ("Redis — justified uses only … the choice is recorded once in the repo's ADR log")

## Decision

- Background jobs (payment webhook processing and reconciliation, PDF post-processing, verification-document retention purge, notification fan-out, analytics roll-ups) run on **pg-boss** over the existing PostgreSQL database.
- V1 runs **no Redis**.
- Rate limiting (auth, OTP, search, signed-URL issuance) is layered:
  - Cloudflare rules at the edge;
  - an in-app limiter in the API whose counters live in PostgreSQL, so limits hold across API instances.
- Short-lived OTP and session-revocation state lives in PostgreSQL tables owned by `auth` / `admin-auth`, with expiry columns and a purge job.

## Why

It is one fewer service to host, secure and back up. Job volume in V1 is small, and pg-boss gives transactional enqueueing: a job is created in the same transaction as the row that caused it.

## Consequences

- If job throughput or rate-limit write volume later outgrows PostgreSQL, a new ADR can introduce Redis/BullMQ behind the same job interfaces.
