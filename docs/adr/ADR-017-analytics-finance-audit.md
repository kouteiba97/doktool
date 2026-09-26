# ADR-017 · Analytics, finance and audit (Phase 17)

**Status:** Accepted · 26 September 2026
**Context:** design system sections 03, 07, 15, 16; ADR-005 (no refunds); Lock L40, L42

## Analytics

1. **The server makes the envelope.** The app sends only `{type, occurredAt, entityId?, properties}` in batches of at most 100 events, plus `platform`, `appVersion` and `dataVersion`. `POST /v1/analytics/events` accepts user and demo tokens. The API adds the rest from its own facts:
   - `subjectHash` — HMAC-SHA-256 keyed by `ANALYTICS_SUBJECT_SECRET` over the user id or the demo session id;
   - access context and entitlement tier;
   - professional type, specialty code and wilaya.

   Names, contact data and ids never enter `analytics_events`.

2. **No free text, by construction.** Each client event type has a strict schema of counts, codes and flags (audit Appendix B):
   - unknown keys are rejected, so `query` or input values cannot slip in;
   - demo-only events are refused from accounts;
   - events older than 30 days (the offline buffer) or dated in the future are dropped.

   Rejected events are counted by reason in the response and never retried.

3. **Server events through the jobs queue.** Billing publishes `SUBSCRIPTION_STARTED` / `SUBSCRIPTION_RENEWED` at settlement on the `analytics.server-event` queue; the analytics module consumes it.
   - Billing cannot call analytics directly, because analytics → access → billing would be a cycle.
   - The queue's contract (name and payload) lives in `infrastructure/jobs/analytics-job.ts`.

4. **Aggregates only, suppressed.** The admin dashboards are Usage, Bibliothèque, Calculateurs, Utilisateurs, Abonnements and Démo (`analytics.read`).
   - Every count behind fewer than 10 distinct subjects is `null` and shown as « < 10 ».
   - Demo events appear only in the Démo funnel.
   - The onboarding funnel counts people from the users and verification modules, not events.
   - There is no per-person timeline.

## Finance

5. **Ledger order (L40).**
   - Gross revenue = succeeded payments of the period + approved exceptional adjustments.
   - Payment fees: the actual fee once settled, otherwise an estimate.
   - Net revenue = gross − fees.
   - A separate Rentabilité block: net revenue − operating expenses = net profit.

   Every figure comes with the previous equal period. Series are bucketed by day (≤ 45 days), ISO week (≤ 6 months) or month; the current bucket is flagged partial.

6. **Fees.**
   - `payment_fee_rates` holds a rate in basis points plus a fixed part per provider (CIB, Edahabia). The operator sets them from the SATIM contract.
   - A payment without a settled fee shows its estimate as « estimé ».
   - A provider without a rate is reported as missing, never guessed.
   - Fee settlement (`finance.expenses.write`) writes the actual fee of listed `DT-…` transactions. It goes through billing, which owns the table; the database lets a final transaction change nothing else.

7. **Operating expenses** (`operating_expenses`) have a category, label, amount and date.
   - A mistaken entry is voided once, with a reason; a trigger allows no other change.
   - Voided entries leave the totals.

8. **Exceptional adjustments** (ADR-005) sit in the transaction drawer.
   - Only `transactions.adjustment.request` (the Super Admin preset) may request one, and it counts only once another admin with `transactions.adjustment.approve` approves it. The database also enforces approver ≠ requester.
   - A reversal is negative and may not exceed what is left of the payment.
   - There is no refund status, endpoint or grant.

9. **Reports** are CSV files with `;` separators and a UTF-8 BOM (spreadsheets in French locales). The first lines are the metric definitions, in FR or EN from `server.finance.*`. Each export is audited.
   - The reports are: revenue by plan and month, subscriptions (started, renewed, ended), and provider fees (settled vs estimated).
   - PDF export is not part of V1.

## Admin read models, audit, permissions

10. The `admin` module (it owns no table) composes, through the owning modules' services:
    - « Vue d'ensemble » — each block only for the grants that cover it;
    - « Utilisateurs »:
      - drawer tabs: profile, the derived AccessProfile with its inputs, subscriptions, activity **counts**, history;
      - actions: suspend / reinstate (`users.suspend`) and sign-out-everywhere (`users.write`, new revocation reason `ADMIN_REVOKED`);
    - « Journal d'audit » (`audit.read`) — filters and a CSV export (`audit.export`, at most 10 000 rows), the export itself audited.
11. « Permissions » (`system.roles.write`) lives in admin-auth, owner of the admin tables:
    - create an admin from a preset, with a one-time password shown once;
    - replace another admin's permanent grants, under the separation of duties of section 03;
    - time-limited `verification.documents.view` (2 h by default, 8 h at most);
    - suspend / reinstate an admin, and reset their TOTP.

    Nobody edits their own access.
12. `users.last_seen_at` is also refreshed on token refresh, at most hourly, for « Dernière activité ».

## Not built in V1

- Transitions étudiant → résident → médecin: no history of profile changes exists.
- Sending a free-text notification to a user: notifications are catalogue keys only.
- Report PDFs.
