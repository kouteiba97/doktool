# ADR-018 · Account deletion (Phase 18)

**Status:** Accepted · 1 October 2026
**Context:** design system section 08 (Settings « delete account », with confirmation); ADR-005 (no refunds, ledger kept); ADR-009 (sessions); ADR-013 (verification retention); App Store guideline 5.1.1(v) and Google Play's account-deletion policy

## Decision

1. **In the app, confirmed with the password.** Settings › Compte › « Supprimer mon compte » opens a screen that says what is erased, what is kept and that a current subscription ends without refund, then asks for the password. `POST /v1/me/deletion {password}` (user token only; a demo has no account). A wrong password is a form error (`VALIDATION_FAILED` on `password`), not a 401, so the session is untouched; at most 5 attempts per hour per account.

2. **Each owning module erases its own data** (ADR-001), orchestrated by `auth` — the module that re-authenticates and owns sessions, and that no module it calls depends on:

   | Module | What happens |
   |---|---|
   | billing | ACTIVE / GRACE / CANCELED subscriptions become EXPIRED now — no refund. Transactions are kept (accounting). |
   | verification | Every document is deleted from the private bucket now. Cases not yet decided are deleted; decided cases keep only the decision (who, when, outcome) with their declared details cleared. |
   | activity | Favorites and research history are deleted. |
   | notifications | Deleted. |
   | auth | Pending OTP codes deleted; every session revoked (`ACCOUNT_DELETED`) last. |
   | users | Professional profile and preferences deleted; the profile photo object deleted; the row becomes a **tombstone**. |

   Every step can run again, so a failure part-way is completed by asking again; sessions are revoked only after the erasure.

3. **Tombstone, not hard delete.** Transactions, subscriptions and verification decisions reference the user (`ON DELETE RESTRICT`) and must be kept, so the row stays with `status = DELETED`, no e-mail, phone, names, bio, photo or password. A database constraint (`users_deleted_erased_chk`) guarantees a DELETED row holds none of them; the identifiers are free for a new account. Admin Web shows « Compte supprimé » where the ledger names the person; the users list never shows tombstones.

4. **Pseudonymous analytics stay.** `analytics_events` never held names, contact data or ids (ADR-017); their subject hash cannot be linked back once the account is erased.

5. **The device forgets too.** After the API confirms, the app deletes everything the account left locally — cached account, remembered identifier, recent searches, queued history and analytics, last calculator inputs — keeping only appearance and language, and signs out (the offline store is purged on sign-out).

6. **Audit.** `user.account_deleted` is recorded with the person as actor, the client IP, and how many subscriptions ended and documents were deleted.

## Consequences

- Access tokens are stateless (ADR-009): one issued before the deletion stays valid for at most its remaining 15 minutes, as after a suspension; every read of access (`/v1/me/access`) already refuses a DELETED account.
- A checkout still waiting for the payment provider is left to the payment flow; the payment integration being reworked must refuse to activate a subscription for a DELETED account.
