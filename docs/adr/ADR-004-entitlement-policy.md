# ADR-004 · Centralised entitlement policy

**Status:** Accepted · 25 September 2026
**Context:** audit §7, design system section 27, Design Lock L37, L38

## Decision

- The `access` module is the only place access is decided. It evaluates a **versioned policy configuration** over `accessContext`, `professionalType`, the verification cases and the subscription, and returns an `AccessProfile` (`tier`, `features[]` with `AVAILABLE | LOCKED` + `lockReason` + `unlockPath`, `contentTiers`, `policyVersion`).
- `AccessProfile` is derived, never stored.
- `GET /v1/me/access` returns it; every protected endpoint re-evaluates the same policy server-side.
- Clients render it through one gate (`EntitlementGate` in Flutter). No client code branches on `professionalType`.
- Demo is an **access context** (`DEMO`), never a professional type. Demo tokens have audience `demo` and can reach read endpoints and demo analytics only.
- Locked items are shown with their reason; deferred modules are never shown.

## Consequences

- Changing who can open what is a policy-config change plus its test matrix, not an authorisation code change.
- The V1 policy values are fixed by ADR-006.
