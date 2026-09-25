# Architecture Decision Records

One file per decision, numbered, never rewritten after acceptance — a changed decision gets a new ADR that supersedes the old one.

| ADR | Title | Status |
|---|---|---|
| [001](ADR-001-modular-monolith.md) | NestJS modular monolith | Accepted |
| [002](ADR-002-r2-storage-service.md) | Cloudflare R2 behind `StorageService` | Accepted |
| [003](ADR-003-calculator-definitions-dual-engine.md) | Declarative calculator definitions, dual deterministic engine | Accepted |
| [004](ADR-004-entitlement-policy.md) | Centralised entitlement policy (`AccessProfile`) | Accepted |
| [005](ADR-005-no-refund-finance.md) | No-refund subscription and finance model | Accepted |
| [006](ADR-006-product-owner-decisions.md) | Product Owner answers to audit §17 (Q1–Q8) | Accepted |
| [007](ADR-007-jobs-pg-boss.md) | Background jobs on pg-boss (no Redis in V1) | Accepted |
| [008](ADR-008-repository-toolchain.md) | Repository toolchain | Accepted |
| [009](ADR-009-authentication.md) | Authentication (users and admins) | Accepted |
| [010](ADR-010-entitlements-implementation.md) | Entitlements implementation | Accepted |
| [011](ADR-011-storage-implementation.md) | Storage implementation (R2 + local driver) | Accepted |

Source of the architecture: [`docs/ARCHITECTURE-AUDIT.md`](../ARCHITECTURE-AUDIT.md). Where an ADR and the design system disagree, the ADR wins; where ADR-006 and the audit disagree, ADR-006 wins.
