# ADR-005 · No-refund subscription and finance model

**Status:** Accepted · 25 September 2026
**Context:** audit §10, design system section 15, Design Lock L39, L40

## Decision

- Subscriptions are sold to doctors and residents whose professional verification is `VERIFIED`; checkout is closed before that.
- Before paying, the user sees includes, not-included, duration, price, payment method, access level and "non-refundable", and confirms one acknowledgement line.
- Subscription statuses: `PENDING_PAYMENT · ACTIVE · GRACE · EXPIRED · CANCELED`. There is **no** `TRIALING` and **no** `REFUNDED`.
- Transaction statuses: `PENDING · SUCCEEDED · FAILED · CANCELED`. A transaction is immutable after `SUCCEEDED` except fee settlement.
- There is no refund endpoint, status, grant, tab, screen or user path. The only reversal mechanism is a `TransactionAdjustment` (`REVERSAL · CORRECTION`) created by a Super Admin and approved by a different admin; requester ≠ approver is enforced by the API and a database `CHECK`.
- Finance reads Gross revenue → Payment fees → Net revenue; Operating expenses → Net profit is a separate block.
- Renewal is manual in V1.

## Consequences

- Payment-provider disputes are handled outside the product; the adjustment trail keeps the books correct.
- The no-refund terms must be validated by Algerian counsel before launch (audit §16).
