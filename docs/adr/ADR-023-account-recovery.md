# ADR-023 · Contacts, security notices and account recovery (Phase 21c)

**Status:** Accepted · 5 October 2026 · completes ADR-009
**Context:** The Product Owner asked that getting an account back after losing access be easy, without weakening privacy or security. Until now an account had one contact (e-mail or phone) and a password. Losing the contact meant losing the account. Access tokens stayed valid up to 15 minutes after a sign-out.

## Decision

1. **Two contacts, either one is enough** (Settings › « Coordonnées et sécurité »).
   - An account can hold an e-mail **and** a phone. It signs in, resets its password and receives notices with either one.
   - Adding or replacing a contact needs the current password, then a code sent **to the new contact** (`CONTACT_CHANGE`).
   - Removing a contact needs the password, and the other contact must be confirmed.
   - A never-confirmed sign-up holding the same contact is dropped; a confirmed one is never taken over (`ACCOUNT_EXISTS`).
   - The screen says whether the account is « récupérable » (both contacts confirmed) and suggests adding the missing one.

2. **Password change while signed in.** It needs the current password. This device stays signed in, every other device is signed out (`PASSWORD_CHANGED`), and the new password cannot be the e-mail or phone.

3. **Security notices.** Every change to how the account is reached is announced:
   - **Events:** password changed or reset; contact added, replaced or removed; recovery requested, approved or applied.
   - **Where:** to the account's e-mail (SMS only when the phone is the only contact, since texts cost money), to the contact just replaced or removed, and in the app.
   - **Content:** no codes, no data beyond the first name. A notice that fails is logged and never blocks the change.

4. **« Accès perdu ? »** on the sign-in screen sends each situation to the shortest way back:
   - forgot the password → the existing reset;
   - changed e-mail or number but knows the password → sign in with the old contact and update it in Settings;
   - lost everything → assisted recovery.

5. **Assisted recovery** (`AccountRecoveryService`, table `account_recovery_requests`, owned by auth):
   1. **The request.** The person gives:
      - the lost contact;
      - their first and last name;
      - a **new** contact, proven first by a code (`ACCOUNT_RECOVERY`, always sent).

      The proof returns a recovery token (256-bit, stored hashed, kept in app memory only, valid 1 hour). It allows two photo uploads to the private bucket (`RECOVERY_DOCUMENT`, JPEG/PNG, 10 MB, signature-checked, requester `RECOVERY_REQUEST`): an identity document and a selfie holding it. Then « Envoyer ».
   2. **Same answer for everyone.** The request is accepted the same way whether or not the lost contact has an account, so no enumeration. The request is matched to the live account whose **confirmed** contact it is.
   3. **The owner is warned.** On submission the account's current contacts are told. Signing in with the password, or « Ce n’est pas moi » in Settings, **cancels** any open request.
   4. **Review.** Admin Web › « Récupérations de compte »:
      - the queue needs `verification.queue.read`;
      - viewing the photos needs the time-limited `verification.documents.view`, as a 60-second signed URL with watermark, and every view is audited;
      - deciding needs `verification.review`, with a written note.

      The reviewer compares the name given, the account's name, its identity-verification status and the photos.
   5. **24-hour hold.** An approval applies **24 hours later**, and the owner is told the date. Then:
      - the new contact becomes the **only** contact;
      - the password becomes unusable;
      - every device is signed out (`ACCOUNT_RECOVERED`).

      The person sets a password with « Mot de passe oublié » on the new contact, and the old contacts are told. Rejections give a reason (photos unreadable, identity or selfie mismatch, no account, other) on the new contact.
   6. **Retention.** Photos are deleted 30 days after the decision or cancellation, and at once on account deletion. Unfinished requests expire after 1 hour, and their rows are deleted after 7 days.
   7. **Rate limits:**
      - 5 requests per IP per hour;
      - 3 per lost contact per day;
      - 3 per new contact per day;
      - 10 uploads per request.

      The SMS guards of ADR-022 apply on top.

6. **Immediate session end.** An access token is accepted only while its session is live: a read-only primary-key lookup of `user_sessions` on each authenticated request (the one ADR-001 exception). Signing a device out, changing the password, a recovery, a suspension or a deletion now take effect on the next request, not after up to 15 minutes. The cost is one indexed read per request.

## Consequences

- An account with both contacts can always be recovered without anyone's help. The assisted path is for the rest and takes at most 72 hours plus 24.
- A wrong approval is limited by the warning to the current contacts, the owner's cancellation by signing in, and the 24-hour hold. It is visible in the audit log.
- Suspended people are signed out immediately; the app shows the suspension message at the next sign-in.
