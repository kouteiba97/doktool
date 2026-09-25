# ADR-013 · Verification cases, review and retention (Phase 9)

**Status:** Accepted · 25 September 2026
**Context:** design system section 06, audit §6 and §8, ADR-006, ADR-011

## Decisions

1. **One case per attempt.** A case is `NOT_STARTED` while the person prepares it, then `SUBMITTED` → `IN_REVIEW` → `VERIFIED` or `REJECTED`. « Corriger et renvoyer » starts a new case of the same type, so earlier attempts and their decisions stay as history. A partial unique index allows at most one open case (`NOT_STARTED`, `SUBMITTED`, `IN_REVIEW`, `APPEALED`) per person and type.

2. **Steps and declared details per case type** (section 06):

   | Case | Details | Files |
   |---|---|---|
   | Identity | `documentKind`: national ID, passport, or student card (students only) | `IDENTITY_FRONT` (required), `IDENTITY_BACK` (optional) |
   | Professional status — doctor | Ordre number, specialty | `ORDER_PROOF` (attestation or diploma) |
   | Professional status — resident | Residency year, institution, specialty | `RESIDENCY_ATTESTATION` |
   | Student status | University, academic year 1–7 | `STUDENT_PROOF` (card or certificate) |

   There is one file per step; a new upload replaces the previous file of that step. The OCR pre-fill and legibility checks run on the device, and nothing they read is sent to the server.

3. **Role transition is a status case.** A status case proves a role equal to or above the current one (student → resident → doctor, never downward). Its details are applied to the professional profile only when the case is approved. Until then, the person keeps their current tier. Favorites, activity and preferences are untouched.

4. **The Ordre number is stored in full only in the case's declared details.** Reviewers need the full number to check it with the Ordre. The profile keeps a masked copy (last three characters). The owner sees the masked copy once the case is sent. The full number is erased with the documents.

5. **Review** (`/admin/v1/verification`):
   - `verification.queue.read` reads the queue (oldest first) and the case.
   - `verification.review` is needed to claim, release, approve and reject. Only the reviewer who claimed a case can decide it.
   - Rejection carries a reason code (`ILLEGIBLE`, `DOCUMENT_EXPIRED`, `NAME_MISMATCH`, `WRONG_DOCUMENT`, `INFORMATION_MISMATCH`, `OTHER`) and an optional note, both shown to the person. It also carries the audit reason, which is never shown to them.
   - Approval can set an expiry, for example the end of validity of the document. Without one, the verification does not expire.
   - Every step writes an audit entry.

6. **Appeal:** possible on the latest case once the person has two rejections of that type. It re-opens the same case as `APPEALED` and records the rejecting reviewer. Only an admin holding `verification.appeal.decide`, who is not that reviewer, can claim and decide it.

7. **Restricted viewer:** `POST /admin/v1/verification/documents/:id/view` needs `verification.review` + `verification.documents.view`. It works only for the reviewer currently holding the case. It returns a 60-second signed URL from the private bucket and the watermark text (reviewer name, e-mail, time) that Admin Web overlays. Every view is audited.

8. **Retention** (section 06):
   - On decision, files get `purgeAfter` = decision + 24 months. An hourly job deletes them from storage and then their rows.
   - Declared details are cleared once the files are gone and the retention has passed.
   - The person can erase the files of a decided case at any time.
   - Cases never submitted are deleted with their files after 90 days without activity.

9. **Expiry:** a daily job marks `VERIFIED` cases past `expiresAt` as `EXPIRED`. It sends one reminder at 60 days and one at 14 days before (a threshold already passed at approval is skipped). A new case of the same kind can start from 60 days before expiry. An expired professional status keeps a running subscription until its period end (ADR-010).

10. **Notifications module** (`/v1/me/notifications`): rows carry a `mobile.notifications.*` catalogue key and parameters that are identifiers, codes or numbers, never free text. The app renders them in the person's language. They are kept 180 days.

11. **Reference pickers:** specialties, institutions (by wilaya) and universities are public read endpoints. They are managed from Admin Web with `system.settings.write`, with an audit entry. The repository seeds no values; the operator loads the official lists.
