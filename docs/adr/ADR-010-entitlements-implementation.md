# ADR-010 · Entitlements implementation (Phase 4)

**Status:** Accepted · 25 September 2026
**Context:** design system section 27, audit §7, ADR-004, ADR-006

## Decisions

1. **The policy is versioned data.** `apps/api/src/modules/access/access-policy.config.ts` holds every value of section 27 and ADR-006: tier rules per content type, feature states per tier, the student pending window (14 days) and the subscription grace fallback (7 days). A pure evaluator reads it.
   - Changing who opens what means editing that file, bumping `version` and updating the policy matrix test. No authorisation code changes.
   - The version is returned in every `AccessProfile`.

2. **Content rules per content type replace `contentTiers`.** ADR-006 gives students calculators but not reference documents (except demo samples), which one tier list cannot express. The profile therefore carries:

   | Tier | Calculators | Reference documents |
   |---|---|---|
   | DEMO | demo samples | demo samples |
   | STUDENT | `accessTier = STUDENT` | demo samples (D2) |
   | PROFESSIONAL_UNPAID | demo samples | demo samples |
   | PROFESSIONAL | all | all |
   | RESTRICTED | none | none |

   Lists, search results and viewers return each item with a server-computed `access` decision (`AVAILABLE` or `LOCKED` + reason + unlock path). Clients never recompute it.

3. **States the section does not name:**
   - A real account that has not yet chosen « Qui êtes-vous ? » is `RESTRICTED`, with lock reason `VERIFICATION_REQUIRED` and unlock path `onboarding.role`.
   - A suspended account is `RESTRICTED` with the added lock reason `ACCOUNT_SUSPENDED` (section 27: "or suspension notice").
   - `RESTRICTED` favorites and history are available `readOnly`.
   - Identity verification `REJECTED` restricts every type.
   - For students, NOT_STARTED, EXPIRED or an elapsed pending window mean `RESTRICTED` · `VERIFICATION_REQUIRED`.
   - `IN_REVIEW` and `APPEALED` count as submitted.

4. **Live subscription** means one of:
   - `ACTIVE` or `CANCELED` before `currentPeriodEnd`;
   - `GRACE` before `graceEndsAt`;
   - `ACTIVE` less than 7 days after `currentPeriodEnd` (grace fallback, in case the billing job has not run yet).

   `PROFESSIONAL` also needs professional verification `VERIFIED`, or `EXPIRED` while the subscription is live (section 27 edge rule).

5. **Demo tokens:**
   - `POST /v1/demo/sessions { demoContext, deviceId }` returns a 1-hour access token (audience `doktool-demo`) and a renewal token (256-bit, stored hashed on the session).
   - `POST /v1/demo/sessions/token` renews the access token with the renewal token from the same device.
   - A demo session has no time limit (ADR-006 Q5) and ends only when an admin ends it.
   - One device keeps one active demo session: asking again rotates its renewal token and switches the context.
   - Demo tokens are accepted only by routes guarded for viewers (read endpoints and, later, demo analytics). `UserAuthGuard` refuses them.

6. **Enforcement:**
   - `GET /v1/me/access` answers for both user and demo tokens.
   - `@RequireFeature(key)` guards server routes by evaluating the same policy on every request.
   - Content modules call `AccessService.decideItem()`, exported from `modules/access/index.ts`.
