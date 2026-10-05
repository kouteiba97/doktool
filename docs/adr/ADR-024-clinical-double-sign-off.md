# ADR-024 · Double sign-off for clinical content

**Status:** Accepted · 5 October 2026 · extends ADR-006 D1, ADR-012 §6 and ADR-019
**Context:** Calculators and pregnancy · lactation profiles are published after one independent review: the reviewer who publishes is never the author nor anyone who edited the draft (four-eyes). The Product Owner asked for a second reviewer as an option. The team starts with two admins (the Super Admin reviews, a second admin authors). A mandatory second reviewer would block every publication until a third person joins, so the rule has to be a setting.

## Decision

1. **A policy per kind of clinical content**, set by the Super Admin (grant `system.settings.write`) in Admin Web › Paramètres › « Relecture clinique ».
   - Table `clinical_review_policies` (module `clinical-review`, the 20th module): `CALCULATOR` and `PREGNANCY_PROFILE`, each `required_sign_offs` 1 or 2 (CHECK).
   - No row means one sign-off: the rule of ADR-006 D1 is unchanged by default.
   - Every change asks for a reason and is audited (`clinical_review.policy.updated`, before/after).
   - Two sign-offs are refused while fewer than two active admins can approve that content (`calculators.review` + `calculators.publish`, or `pregnancy.review`). Otherwise nothing could ever be published.

2. **Two sign-offs, two people, neither the author.** The version stores its first sign-off: `first_sign_off_by_id`, `first_sign_off_at` and `first_sign_off_note`. The second sign-off is the existing review fields, set by the person who publishes.
   - « Approuver » on a version that needs two sign-offs and has none records the first one. The version stays `IN_REVIEW` (`calculator.version.signed_off` or `pregnancy.version.signed_off`).
   - The next approval by a **different** reviewer publishes. The first reviewer may not give the second sign-off (`FORBIDDEN`).
   - Every existing check still applies to both reviewers:
     - never the author;
     - for calculators, never anyone who edited the draft;
     - the tests are re-run on the backend engine.
   - Sending a version back clears the first sign-off (« Renvoyer à l'auteur », « Demander des modifications »). Changed content is signed again from the start.

3. **Which rule applies.**
   - A version records the rule in force when it is submitted (`required_sign_offs`).
   - Raising the policy also applies to versions already in review.
   - Lowering it never relaxes a version already in review: it applies to the next submissions.
   - A version with a first sign-off always needs the second one.

4. **The database is the last line of defence.** CHECK constraints on `calculator_versions` and `substance_profile_versions`:
   - the first sign-off is complete or absent;
   - it is never the author nor the publishing reviewer;
   - a published version (or a retired or superseded one) that required two sign-offs carries the first one.

5. **Admin Web.**
   - The review panels show « Relectures 1 sur 2 » with the first reviewer, date and note.
   - The approve button reads « Approuver (1re relecture) » or « Approuver et publier (2e relecture) ».
   - The first reviewer sees that someone else must approve.
   - The settings tab shows how many people can approve each kind of content.

## Consequences

- With the default policy nothing changes for a two-person team.
- When a third clinician joins, the Super Admin can require two sign-offs without code changes.
- The mobile app and the public API are unchanged: users only ever see published versions.
