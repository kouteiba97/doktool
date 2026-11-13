# ADR-029 · One account, one device at a time

**Status:** Accepted · 13 November 2026 (Product Owner)

**Context:** An account could be signed in on any number of phones at once (ADR-009: one session per device sign-in, no limit). One paid DokTool Pro account could therefore be shared by a whole ward. The Product Owner decides that one e-mail (or phone number) opens the app on one device, not on several.

## Decision

1. **A sign-in ends the sessions the account had elsewhere.** Opening a session (sign-in, or the confirmation of a sign-up) revokes every other live session of the account in the same transaction, with the reason `SIGNED_IN_ELSEWHERE`. Sign-ins of one account take turns (advisory lock), so several at the same instant leave exactly one session.

2. **The newest sign-in wins; the sign-in is never refused.** Refusing it would lock out a person whose phone is lost, broken or reset until an admin intervened. The person who knows the password always gets in; the other device is signed out.

3. **The other device learns it at its next request, and why.** Sessions are checked on every request (ADR-023), so the old device is refused immediately. The refusal (`SESSION_INVALID`) carries `details.sessionEnd = SIGNED_IN_ELSEWHERE`, on API calls and on the token refresh. The app returns to Welcome and says: the account was opened on another device, an account is used on one device at a time, and if this was not you, sign in and change your password. No other revocation reason is disclosed.

4. **Nothing else changes.** Tokens, rotation, reuse detection and lifetimes are those of ADR-009. Settings › Appareils lists the one live session. A password change still ends any other session, should one exist. Demo sessions are not accounts and are not concerned (one per device already, ADR-010). Admin Web is not concerned.

## Consequences

- Two people sharing one account sign each other out at every use.
- A person with two phones uses one at a time and signs in again when switching.
- **Offline (section 18):** a signed-out device finds out only when it next reaches the server. Until then it keeps showing what it had already downloaded. This is accepted: offline use is a product rule, and the content is not secret from a person who was entitled to it.
- No migration of existing rows: an account with several sessions keeps them until its next sign-in.

## Verification

`auth.e2e.spec.ts` › « keeps an account open on one device… », « keeps one session when the same account signs in several times at once », « does not say why a session ended for any other reason »; `onboarding_test.dart` (vault); `opened_elsewhere_test.dart` (Welcome).
