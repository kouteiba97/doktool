# ADR-001 · NestJS modular monolith

**Status:** Accepted · 25 September 2026
**Context:** audit §4, §5

## Decision

The backend (`apps/api`) is one NestJS deployable over one PostgreSQL database, split into domain modules with strict boundaries:

`auth` · `admin-auth` · `users` · `verification` · `access` · `billing` · `finance` · `reference-library` · `calculators` · `search` · `activity` · `offline` · `notifications` · `analytics` · `audit` · `demo` · `storage` · `admin`

Rules:

1. **A module is the only writer of its tables** (ownership is listed per model in `apps/api/prisma/schema.prisma`).
2. **Cross-module calls go through the other module's public entry point** (`src/modules/<name>/index.ts`), never into its internal files. ESLint enforces this.
3. The backend is the only component holding database and R2 credentials. Admin Web and Flutter are API-only.
4. The user API lives under `/v1`, the admin API under `/admin/v1`, with separate token issuers (ADR-004, audit Appendix D).

## Why

One team, one database, modest traffic: a monolith with enforced boundaries gives the separation a later split would need without operating several services.

## Consequences

- Module ownership is a code-review and lint concern, not a network boundary.
- Splitting a module out later means moving its tables and replacing its `index.ts` exports with a client — callers do not change.
